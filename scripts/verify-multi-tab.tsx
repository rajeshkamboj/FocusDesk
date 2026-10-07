/**
 * Headless check of multi-tab state coherence.
 *
 * Two FocusDesk tabs are two repository instances over one shared
 * localStorage. Each holds its own in-memory copy, so a write has to merge
 * into the newest stored state rather than replay the copy that tab loaded
 * with — otherwise whichever tab writes last silently erases the other's work,
 * the entire database at a time.
 *
 * This script drives that directly and deterministically (no wall-clock
 * timing): every checkpoint is computed at an explicit instant, and the final
 * state is always re-read through a third, freshly constructed repository —
 * the actual persisted truth, not either tab's opinion of it.
 *
 * It also covers the cross-tab half of the timer rule: opening a second tab
 * must not pause the timers running in the first, while a tab that really did
 * close must still have its sessions recovered.
 * Run: npx tsx scripts/verify-multi-tab.tsx  (requires jsdom)
 */
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' });
const g = globalThis as Record<string, unknown>;
g.window = dom.window; g.document = dom.window.document; g.localStorage = dom.window.localStorage;
g.IS_REACT_ACT_ENVIRONMENT = true;

async function main() {
  const { LocalRepository, STORAGE_KEY } = await import('../lib/store/local-repository');
  const { checkpointTimingPatch, isTimerPaused, isTimerRunning, runningTimerTasks } = await import('../lib/timer');
  const presence = await import('../lib/store/tab-presence');
  type Task = import('../lib/types').Task;
  type StorageLike = import('../lib/store/local-repository').StorageLike;

  const ok = (cond: boolean, msg: string) => { if (!cond) { console.error('FAIL:', msg); process.exit(1); } console.log('✓', msg); };

  /** One localStorage shared by every "tab", exactly like a real origin. */
  const sharedStorage = (): StorageLike => {
    const map = new Map<string, string>();
    return {
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => { map.set(k, v); },
      removeItem: (k) => { map.delete(k); },
    };
  };

  const t0 = Date.UTC(2026, 0, 1, 10, 0, 0);
  const at = (seconds: number) => new Date(t0 + seconds * 1000).toISOString();
  const ms = (seconds: number) => t0 + seconds * 1000;

  const taskById = async (repo: InstanceType<typeof LocalRepository>, id: string): Promise<Task> =>
    (await repo.tasks.list()).find((t) => t.id === id)!;

  /** Start a timer the way DataProvider does: status + a fresh startedAt. */
  const startTimer = (repo: InstanceType<typeof LocalRepository>, id: string, seconds: number) =>
    repo.tasks.update(id, { status: 'in_progress', startedAt: at(seconds), pausedAt: undefined });

  /** One checkpoint of one task, computed from its currently persisted state. */
  const checkpoint = async (repo: InstanceType<typeof LocalRepository>, id: string, seconds: number) => {
    const task = await taskById(repo, id);
    const patch = checkpointTimingPatch(task, ms(seconds));
    if (Object.keys(patch).length === 0) return task;
    return repo.tasks.update(id, patch);
  };

  /* ================================================================== */
  /* 1. The race: two tabs start and checkpoint two different tasks      */
  /* ================================================================== */
  {
    const store = sharedStorage();
    const tabA = new LocalRepository(store);
    const tabB = new LocalRepository(store);

    const a = await tabA.tasks.create({ title: 'Task A' });
    const b = await tabA.tasks.create({ title: 'Task B' });
    ok((await tabB.tasks.list()).length === 2, '1: a tab created later in the session sees both tasks');

    await startTimer(tabA, a.id, 0);
    await startTimer(tabB, b.id, 1);
    await checkpoint(tabA, a.id, 60);
    await checkpoint(tabB, b.id, 61);

    // The truth on disk, read by a third repository that shares nothing.
    const fresh = new LocalRepository(store);
    const persisted = await fresh.tasks.list();
    const pa = persisted.find((t) => t.id === a.id)!;
    const pb = persisted.find((t) => t.id === b.id)!;

    ok(persisted.length === 2, '1: both tasks survive — neither tab erased the other');
    ok(isTimerRunning(pa) && isTimerRunning(pb), '1: A = running and B = running in the persisted state');
    ok(pa.actualDurationSeconds === 60, `1: A kept its checkpointed duration (${pa.actualDurationSeconds}s)`);
    ok(pb.actualDurationSeconds === 60, `1: B kept its checkpointed duration (${pb.actualDurationSeconds}s)`);
    ok(runningTimerTasks(persisted).length === 2, '1: two concurrent timers persist across two tabs');
  }

  /* ================================================================== */
  /* 2. A stale tab must not revert the other tab's newer writes         */
  /* ================================================================== */
  {
    const store = sharedStorage();
    const tabA = new LocalRepository(store);
    const tabB = new LocalRepository(store);

    const a = await tabA.tasks.create({ title: 'Task A' });
    const b = await tabA.tasks.create({ title: 'Task B' });
    await startTimer(tabA, a.id, 0);
    await startTimer(tabA, b.id, 0);

    // Tab A takes a snapshot and then goes quiet for a while.
    const staleView = await tabA.tasks.list();
    const staleA = staleView.find((t) => t.id === a.id)!;

    // Meanwhile Tab B does a lot: renames B, checkpoints it, adds a task.
    await tabB.tasks.update(b.id, { title: 'Task B renamed in the other tab' });
    await checkpoint(tabB, b.id, 120);
    const c = await tabB.tasks.create({ title: 'Task C created in the other tab' });

    // Now Tab A writes a checkpoint derived from its OLD snapshot.
    await tabA.tasks.update(a.id, checkpointTimingPatch(staleA, ms(90)));

    const persisted = await new LocalRepository(store).tasks.list();
    ok(persisted.length === 3, '2: the stale tab\u2019s write did not delete the task the other tab created');
    ok(persisted.find((t) => t.id === c.id)?.title === 'Task C created in the other tab',
       '2: the newly created task survives a stale tab\u2019s write');
    ok(persisted.find((t) => t.id === b.id)?.title === 'Task B renamed in the other tab',
       '2: the rename survives — the stale tab overwrote only the record it patched');
    ok(persisted.find((t) => t.id === b.id)?.actualDurationSeconds === 120,
       '2: the other tab\u2019s checkpointed duration is not reverted');
    ok(persisted.find((t) => t.id === a.id)?.actualDurationSeconds === 90,
       '2: the stale tab\u2019s own checkpoint still lands');
  }

  /* ================================================================== */
  /* 3. Pause in one tab, keep running in the other                      */
  /* ================================================================== */
  {
    const store = sharedStorage();
    const tabA = new LocalRepository(store);
    const tabB = new LocalRepository(store);

    const a = await tabA.tasks.create({ title: 'Task A' });
    const b = await tabA.tasks.create({ title: 'Task B' });
    await startTimer(tabA, a.id, 0);
    await startTimer(tabB, b.id, 0);

    // Tab A pauses A (the same patch pauseTask writes).
    await tabA.tasks.update(a.id, { startedAt: undefined, pausedAt: at(30), actualDurationSeconds: 30 });
    // Tab B continues B and checkpoints it.
    await checkpoint(tabB, b.id, 45);
    // Tab A checkpoints afterwards: nothing of its own is running any more.
    for (const task of runningTimerTasks(await tabA.tasks.list())) {
      if (task.id === a.id) await checkpoint(tabA, a.id, 50);
    }

    const persisted = await new LocalRepository(store).tasks.list();
    const pa = persisted.find((t) => t.id === a.id)!;
    const pb = persisted.find((t) => t.id === b.id)!;

    ok(isTimerPaused(pa), '3: A remains paused');
    ok(pa.actualDurationSeconds === 30, '3: A\u2019s pause survives with its frozen duration (30s)');
    ok(isTimerRunning(pb), '3: B remains running');
    ok(pb.actualDurationSeconds === 45, `3: B\u2019s latest timer state survives (${pb.actualDurationSeconds}s)`);
  }

  /* ================================================================== */
  /* 4. Four timers, two tabs, many checkpoint rounds                    */
  /* ================================================================== */
  {
    const store = sharedStorage();
    const tabA = new LocalRepository(store);
    const tabB = new LocalRepository(store);

    const t1 = await tabA.tasks.create({ title: 'Timer 1' });
    const t2 = await tabA.tasks.create({ title: 'Timer 2' });
    const t3 = await tabA.tasks.create({ title: 'Timer 3' });
    const t4 = await tabA.tasks.create({ title: 'Timer 4' });

    await startTimer(tabA, t1.id, 0);
    await startTimer(tabA, t2.id, 0);
    await startTimer(tabB, t3.id, 0);
    await startTimer(tabB, t4.id, 0);

    // Ten interleaved checkpoint rounds, each tab minding its own two timers.
    for (let round = 1; round <= 10; round += 1) {
      const second = round * 10;
      await checkpoint(tabA, t1.id, second);
      await checkpoint(tabB, t3.id, second);
      await checkpoint(tabA, t2.id, second);
      await checkpoint(tabB, t4.id, second);
    }

    const persisted = await new LocalRepository(store).tasks.list();
    const all = [t1, t2, t3, t4].map((t) => persisted.find((p) => p.id === t.id));

    ok(all.every((t) => t !== undefined), '4: all four timers are still represented — none disappeared');
    ok(all.every((t) => isTimerRunning(t!)), '4: all four timers are still running — none silently reverted');
    ok(all.every((t) => t!.actualDurationSeconds === 100),
       `4: every duration advanced to its latest checkpoint (${all.map((t) => t!.actualDurationSeconds).join(', ')}s)`);
    ok(runningTimerTasks(persisted).length === 4, '4: four concurrent timers across two tabs');

    // One more round after a long gap: durations advance, never reset.
    await checkpoint(tabA, t1.id, 200);
    await checkpoint(tabB, t3.id, 200);
    const later = await new LocalRepository(store).tasks.list();
    ok(later.find((t) => t.id === t1.id)!.actualDurationSeconds === 200
       && later.find((t) => t.id === t3.id)!.actualDurationSeconds === 200,
       '4: later checkpoints advance their own timers');
    ok(later.find((t) => t.id === t2.id)!.actualDurationSeconds === 100
       && later.find((t) => t.id === t4.id)!.actualDurationSeconds === 100,
       '4: the untouched timers keep their durations — no reset, no rollback');
  }

  /* ================================================================== */
  /* 5. Deletes, history and settings are also merged, not replayed      */
  /* ================================================================== */
  {
    const store = sharedStorage();
    const tabA = new LocalRepository(store);
    const tabB = new LocalRepository(store);

    const keep = await tabA.tasks.create({ title: 'Keep' });
    const drop = await tabA.tasks.create({ title: 'Drop' });
    await tabA.taskHistory.add({ taskId: keep.id, type: 'created' });
    await tabB.taskHistory.add({ taskId: drop.id, type: 'created' });
    ok((await new LocalRepository(store).taskHistory.list()).length === 2,
       '5: history entries written by two tabs both persist');

    await tabB.tasks.delete(drop.id);
    await tabA.tasks.update(keep.id, { notes: 'edited in the first tab' });
    const persisted = await new LocalRepository(store).tasks.list();
    ok(persisted.length === 1 && persisted[0].id === keep.id,
       '5: a delete in one tab is not undone by a later write from the other');
    ok(persisted[0].notes === 'edited in the first tab', '5: the other tab\u2019s edit still lands');

    await tabA.settings.save({ general: { displayName: 'A', startOnToday: true, confirmTaskDeletion: true, automaticCarryForward: true, defaultTaskDuration: 30 } });
    await tabB.settings.save({ appearance: { theme: 'dark' } });
    const settings = await new LocalRepository(store).settings.get();
    ok(settings.general.displayName === 'A' && settings.appearance.theme === 'dark',
       '5: settings saved from different tabs merge instead of overwriting each other');
  }

  /* ================================================================== */
  /* 6. Revision check: an untouched tab does not re-parse needlessly    */
  /* ================================================================== */
  {
    const store = sharedStorage();
    let reads = 0;
    const counted: StorageLike = {
      getItem: (k) => { if (k === STORAGE_KEY) reads += 1; return store.getItem(k); },
      setItem: (k, v) => store.setItem(k, v),
      removeItem: (k) => store.removeItem(k),
    };
    const solo = new LocalRepository(counted);
    const task = await solo.tasks.create({ title: 'Solo' });
    const before = reads;
    for (let i = 0; i < 5; i += 1) await solo.tasks.update(task.id, { notes: `n${i}` });
    ok(reads > before, '6: every mutation checks storage for another tab\u2019s writes');
    ok((await solo.tasks.list())[0].notes === 'n4', '6: a tab working alone still reads its own latest write');
  }

  /* ================================================================== */
  /* 7. Tab presence: telling a live tab from an app that died           */
  /* ================================================================== */
  {
    dom.window.localStorage.clear();
    const now = Date.UTC(2026, 0, 2, 9, 0, 0);
    const tab1 = 'tab-one';
    const tab2 = 'tab-two';

    ok(!presence.otherTabAlive(tab2, now), '7: with nothing announced, no other tab is alive');
    presence.announceTab(tab1, now);
    ok(presence.otherTabAlive(tab2, now), '7: an announced tab is visible to another tab');
    ok(!presence.otherTabAlive(tab1, now), '7: a tab never sees itself as "another tab"');

    ok(presence.otherTabAlive(tab2, now + presence.PRESENCE_TTL_MS - 1),
       '7: the announcement stays valid for its whole TTL');
    ok(!presence.otherTabAlive(tab2, now + presence.PRESENCE_TTL_MS),
       '7: a tab that stopped announcing (crashed) expires');

    presence.announceTab(tab1, now);
    presence.releaseTab(tab1, now);
    ok(!presence.otherTabAlive(tab2, now), '7: a tab that closed cleanly is gone immediately');
    dom.window.localStorage.clear();
  }

  /* ================================================================== */
  /* 8. End to end: a second tab must not pause the first tab's timers   */
  /* ================================================================== */
  {
    dom.window.localStorage.clear();
    const React = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { act } = React;
    const { AuthProvider } = await import('../components/auth/auth-provider');
    const { DataProvider, useData } = await import('../components/data/data-provider');
    const { UIProvider } = await import('../components/ui/ui-provider');

    type Ctx = ReturnType<typeof useData>;
    /** Mount one independent DataProvider — one browser tab. */
    const openTab = async () => {
      let ctx: Ctx | null = null;
      const Probe = () => { ctx = useData(); return null; };
      const el = document.createElement('div');
      document.body.appendChild(el);
      const root = createRoot(el);
      await act(async () => {
        root.render(
          React.createElement(AuthProvider, null,
            React.createElement(UIProvider, null,
              React.createElement(DataProvider, null, React.createElement(Probe)))),
        );
      });
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
      return {
        get: () => ctx!,
        close: async () => {
          await act(async () => { dom.window.dispatchEvent(new dom.window.Event('pagehide')); });
          await act(async () => { root.unmount(); });
        },
        unmountOnly: async () => { await act(async () => { root.unmount(); }); },
      };
    };
    const persistedTasks = (): Task[] => {
      const raw = dom.window.localStorage.getItem('pace.db.v1');
      return raw ? ((JSON.parse(raw) as { tasks?: Task[] }).tasks ?? []) : [];
    };

    // Tab 1 opens and starts a timer.
    const tab1 = await openTab();
    let idA = '';
    await act(async () => { idA = (await tab1.get().actions.addTask({ title: 'Task A' })).id; });
    await act(async () => { await tab1.get().actions.startTask(idA); });
    ok(isTimerRunning(tab1.get().data.tasks.find((t) => t.id === idA)!), '8: tab 1 has Task A running');

    // Tab 2 opens while tab 1 is still alive.
    const tab2 = await openTab();
    ok(isTimerRunning(persistedTasks().find((t) => t.id === idA)!),
       '8: opening a second tab does NOT pause the first tab\u2019s running timer');
    ok(isTimerRunning(tab2.get().data.tasks.find((t) => t.id === idA)!),
       '8: the second tab sees Task A as running, not as a leftover to recover');
    ok(isTimerRunning(tab1.get().data.tasks.find((t) => t.id === idA)!),
       '8: tab 1 is unaffected and still shows Task A running');

    // Tab 2 starts its own timer: both tabs now time different tasks.
    let idB = '';
    await act(async () => { idB = (await tab2.get().actions.addTask({ title: 'Task B' })).id; });
    await act(async () => { await tab2.get().actions.startTask(idB); });
    const bothRunning = runningTimerTasks(persistedTasks());
    ok(bothRunning.length === 2, '8: Task A (tab 1) and Task B (tab 2) are both running in the persisted state');

    // Tab 2 pauses its own task; tab 1's keeps running.
    await act(async () => { await tab2.get().actions.pauseTask(idB); });
    ok(isTimerRunning(persistedTasks().find((t) => t.id === idA)!)
       && isTimerPaused(persistedTasks().find((t) => t.id === idB)!),
       '8: pausing in tab 2 leaves tab 1\u2019s timer running');

    // Tab 1 creates a task; tab 2 must not erase it on its next write.
    let idC = '';
    await act(async () => { idC = (await tab1.get().actions.addTask({ title: 'Task C' })).id; });
    await act(async () => { await tab2.get().actions.updateTask(idB, { notes: 'from tab 2' }); });
    ok(persistedTasks().some((t) => t.id === idC), '8: a task created in tab 1 survives tab 2\u2019s next write');
    ok(persistedTasks().find((t) => t.id === idB)?.notes === 'from tab 2', '8: tab 2\u2019s own edit still lands');

    // Both tabs close: the normal pagehide pause applies, recovery unchanged.
    await tab2.close();
    await tab1.close();
    ok(runningTimerTasks(persistedTasks()).length === 0, '8: closing every tab pauses the running timers as before');

    // With no tab alive, a fresh tab still performs interrupted-session recovery.
    dom.window.localStorage.clear();
    const solo = await openTab();
    let idD = '';
    await act(async () => { idD = (await solo.get().actions.addTask({ title: 'Task D' })).id; });
    await act(async () => { await solo.get().actions.startTask(idD); });
    // Simulate a crash: the page disappears without a pagehide write.
    await solo.unmountOnly();
    ok(isTimerRunning(persistedTasks().find((t) => t.id === idD)!), '8: the crashed tab left Task D marked running');
    const reopened = await openTab();
    ok(isTimerPaused(reopened.get().data.tasks.find((t) => t.id === idD)!),
       '8: with no live tab, a crashed session is still recovered as paused (recovery unchanged)');
    await reopened.close();
  }

  console.log('\nMulti-tab state coherence verified.');
  process.exit(0);
}
main();
