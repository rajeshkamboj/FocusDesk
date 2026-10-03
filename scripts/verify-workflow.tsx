/**
 * Headless end-to-end check of the core workflow (spec §33), exercising the
 * real DataProvider + LocalRepository. Run: npx tsx scripts/verify-workflow.tsx
 * (requires jsdom installed).
 */
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' });
const g = globalThis as Record<string, unknown>;
g.window = dom.window; g.document = dom.window.document; g.localStorage = dom.window.localStorage;
g.IS_REACT_ACT_ENVIRONMENT = true;

async function main() {
  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { act } = React;
  const { AuthProvider } = await import('../components/auth/auth-provider');
  const { DataProvider, useData } = await import('../components/data/data-provider');
  const { TaskRow } = await import('../components/tasks/task-row');
  const { WellbeingReview } = await import('../components/review/wellbeing-review');
  const { CalendarScreen } = await import('../components/calendar/calendar-screen');
  const { todayISO, addDays, addMonths, calendarGridStart, startOfWeek, endOfWeek, isoWeekKey, monthKey, monthName, formatFocusedTime } = await import('../lib/dates');
  const { weeklyReviewStats, monthlyReviewStats, dailyReviewStats, focusedSeconds, projectFocusedSeconds, projectProgress, tasksOnDate, subtasksForTask, uncompletedTasksFirst, monthlyWellbeingTotals } = await import('../lib/selectors');
  const { blockingTimerTask, checkpointTimingPatch, elapsedActiveSeconds, interruptedTimerPatch, isTimerPaused, isTimerRunning } = await import('../lib/timer');

  let ctx: ReturnType<typeof useData> | null = null;
  const Probe = () => { ctx = useData(); return null; };
  const TaskRowProbe = ({ taskId }: { taskId: string }) => {
    const { data } = useData();
    const task = data.tasks.find((item) => item.id === taskId);
    return task ? React.createElement('div', { id: 'subtask-test-row' }, React.createElement(TaskRow, { task, showDate: false })) : null;
  };
  const mount = async (taskId?: string, wellbeingReviewDate?: string, showCalendar = false) => {
    const el = document.createElement('div'); document.body.appendChild(el);
    const root = createRoot(el);
    await act(async () => {
      root.render(React.createElement(
        AuthProvider,
        null,
        React.createElement(DataProvider, null, React.createElement(React.Fragment, null,
          React.createElement(Probe),
          taskId ? React.createElement(TaskRowProbe, { taskId }) : null,
          wellbeingReviewDate ? React.createElement(WellbeingReview, { date: wellbeingReviewDate }) : null,
          showCalendar ? React.createElement(CalendarScreen) : null,
        )),
      ));
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    return root;
  };
  const c = () => ctx!;
  const ok = (cond: boolean, msg: string) => { if (!cond) { console.error('FAIL:', msg); process.exit(1); } console.log('✓', msg); };
  const run = (fn: () => Promise<unknown>) => act(async () => { await fn(); });
  const wait = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
  const click = async (element: Element | null, description: string) => {
    if (!element) throw new Error(`Missing UI control: ${description}`);
    await act(async () => {
      element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 15));
    });
  };
  const setInputValue = async (input: HTMLInputElement, value: string) => {
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')?.set;
      if (setter) setter.call(input, value);
      else input.value = value;
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });
  };
  const submitForm = async (form: HTMLFormElement) => {
    await act(async () => {
      form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 15));
    });
  };

  const today = todayISO(), tomorrow = addDays(today, 1);
  let root = await mount();
  ok(c().ready && c().data.tasks.length === 0 && c().data.subtasks.length === 0 && c().data.projects.length === 0, 'App starts empty — nothing hard-coded');

  await run(() => c().actions.setDailyPriority('Ship the release'));
  ok(c().data.dailyPriorities.find((p) => p.date === today)?.title === 'Ship the release', 'Daily priority set');

  const proj = await (async () => { let p; await run(async () => { p = await c().actions.addProject({ name: 'My project' }); }); return p!; })() as { id: string };
  const ids: string[] = [];
  for (const [title, projectId] of [['A', proj.id], ['B', undefined], ['C', undefined]] as const) {
    await run(async () => { const t = await c().actions.addTask({ title, projectId, scheduledDate: today, status: 'today' }); ids.push(t.id); });
  }
  ok(c().data.tasks.filter((t) => t.scheduledDate === today).length === 3, 'Three tasks for today (one with project, two without)');

  await run(() => c().actions.completeTask(ids[0]));
  await run(() => c().actions.completeTask(ids[1]));
  await run(() => c().actions.toggleDailyPriority(c().data.dailyPriorities[0].id));
  ok(c().data.tasks.filter((t) => t.status === 'completed').length === 2, 'Two tasks completed, one remains');

  await run(() => c().actions.postponeTask(ids[2], 'tomorrow'));
  const moved = c().data.tasks.find((t) => t.id === ids[2])!;
  ok(moved.scheduledDate === tomorrow && c().data.tasks.length === 3, 'Unfinished task moved to tomorrow (not duplicated)');
  ok(moved.postponementCount === 1, 'Postponement count increased to 1');

  await run(() => c().actions.setTaskDeadline(ids[2], addDays(today, 5)));
  ok(c().data.tasks.find((t) => t.id === ids[2])!.dueDate === addDays(today, 5), 'Deadline set, separate from scheduled date');

  const w = weeklyReviewStats(c().data, startOfWeek(today), endOfWeek(today));
  ok(w.completed.length === 2 && w.postponedCount >= 1 && w.completedDailyPriorities === 1, 'Weekly review shows completed/postponed/priority stats');

  const nextWeek = isoWeekKey(addDays(today, 7));
  await run(() => c().actions.addWeeklyPriority({ week: nextWeek, title: 'Next week focus', primary: true }));
  ok(c().data.taskHistory.some((h) => h.type === 'postponed'), 'Task history recorded');

  await act(async () => root.unmount());
  ctx = null;
  root = await mount();
  const d = c().data;
  ok(d.tasks.length === 3 && d.projects.length === 1 && d.weeklyPriorities.some((p) => p.week === nextWeek && p.primary)
     && d.tasks.find((t) => t.id === ids[2])!.postponementCount === 1, 'Everything persisted across reload');

  /* ------------------------------------------------------------------ */
  /* Task timer — estimated vs actual time                               */
  /* ------------------------------------------------------------------ */

  const makeTask = async (title: string, estimatedDuration?: number, projectId?: string) => {
    let created!: { id: string };
    await run(async () => {
      created = (await c().actions.addTask({ title, scheduledDate: today, status: 'today', estimatedDuration, projectId })) as { id: string };
    });
    return c().data.tasks.find((t) => t.id === created.id)!;
  };
  const get = (id: string) => c().data.tasks.find((t) => t.id === id)!;

  /* ------------------------------------------------------------------ */
  /* Mixed project task lists keep active work above completed work      */
  /* ------------------------------------------------------------------ */

  const addProjectTask = async (title: string, scheduledDate?: string) => {
    let created!: import('../lib/types').Task;
    await run(async () => {
      created = await c().actions.addTask({
        title,
        projectId: proj.id,
        scheduledDate,
        status: scheduledDate ? (scheduledDate === today ? 'today' : 'planned') : 'created',
      });
    });
    return get(created.id);
  };
  const existingScheduled = await addProjectTask('Existing scheduled project task', tomorrow);
  const existingUnscheduled = await addProjectTask('Existing unscheduled project task');
  const newScheduled = await addProjectTask('New scheduled project task', addDays(today, 3));
  const newUnscheduled = await addProjectTask('New unscheduled project task');
  const projectTaskItems = () => c().data.tasks.filter((t) => t.projectId === proj.id && t.status !== 'cancelled');
  const beforeCompletion = uncompletedTasksFirst(projectTaskItems());
  const expectedActiveOrder = [existingScheduled.id, existingUnscheduled.id, newScheduled.id, newUnscheduled.id];
  const activeBeforeCompletion = beforeCompletion.filter((t) => t.status !== 'completed').map((t) => t.id);
  const completedBeforeCompletion = beforeCompletion.filter((t) => t.status === 'completed').map((t) => t.id);
  ok(activeBeforeCompletion.join(',') === expectedActiveOrder.join(','),
     'Project ordering: scheduled and unscheduled new tasks stay active, preserving the existing active order');
  ok(completedBeforeCompletion.join(',') === ids[0]
     && beforeCompletion.findIndex((t) => t.id === newScheduled.id) < beforeCompletion.findIndex((t) => t.status === 'completed')
     && beforeCompletion.findIndex((t) => t.id === newUnscheduled.id) < beforeCompletion.findIndex((t) => t.status === 'completed'),
     'Project ordering: both newly created tasks appear above the completed section');

  await run(() => c().actions.completeTask(newUnscheduled.id));
  const afterCompletion = uncompletedTasksFirst(projectTaskItems());
  const activeAfterCompletion = afterCompletion.filter((t) => t.status !== 'completed').map((t) => t.id);
  const completedAfterCompletion = afterCompletion.filter((t) => t.status === 'completed').map((t) => t.id);
  ok(get(newUnscheduled.id).status === 'completed'
     && activeAfterCompletion.join(',') === [existingScheduled.id, existingUnscheduled.id, newScheduled.id].join(',')
     && completedAfterCompletion.join(',') === [ids[0], newUnscheduled.id].join(','),
     'Project ordering: completing a new task moves it below all active tasks');

  /* ------------------------------------------------------------------ */
  /* Subtasks — checklist, persistence, and parent timer ownership       */
  /* ------------------------------------------------------------------ */

  const checklistParent = await makeTask('Checklist parent', undefined, proj.id);
  const taskCountWithParent = c().data.tasks.length;
  const projectCountWithParent = projectProgress(c().data.tasks, proj.id).total;
  ok(c().data.subtasks.filter((subtask) => subtask.parentTaskId === checklistParent.id).length === 0
     && c().data.tasks.some((task) => task.id === checklistParent.id),
     'Subtasks A: an ordinary task with no checklist remains a normal task');

  await act(async () => root.unmount());
  ctx = null;
  root = await mount(checklistParent.id);
  ok(document.querySelector('[data-subtask-panel]') === null
     && document.querySelector('#subtask-test-row button[aria-label="Add subtask"]') !== null,
     'Subtasks UI: checklist is collapsed by default with a compact add control');
  await click(document.querySelector('#subtask-test-row button[aria-label="Add subtask"]'), 'Add subtask control');
  const newSubtaskInput = document.querySelector('#subtask-test-row input[aria-label="New subtask"]') as HTMLInputElement | null;
  if (!newSubtaskInput) throw new Error('Missing inline new-subtask input');
  await setInputValue(newSubtaskInput, 'Find the latest event information');
  const addSubtaskForm = newSubtaskInput.closest('form');
  if (!addSubtaskForm) throw new Error('Missing inline add-subtask form');
  await submitForm(addSubtaskForm);
  const firstSubtask = c().data.subtasks.find((subtask) => subtask.parentTaskId === checklistParent.id);
  if (!firstSubtask) throw new Error('Inline subtask was not persisted');
  ok(firstSubtask.title === 'Find the latest event information'
     && !firstSubtask.completed && firstSubtask.position === 0,
     'Subtasks B: the inline form adds and persists one incomplete item in the parent checklist');

  let secondSubtask!: import('../lib/types').Subtask | null;
  let thirdSubtask!: import('../lib/types').Subtask | null;
  await run(async () => { secondSubtask = await c().actions.addSubtask(checklistParent.id, 'Update the article content'); });
  await run(async () => { thirdSubtask = await c().actions.addSubtask(checklistParent.id, 'Create or update the featured image'); });
  if (!secondSubtask || !thirdSubtask) throw new Error('Could not add checklist test subtasks');
  ok(subtasksForTask(c().data.subtasks, checklistParent.id).map((subtask) => subtask.title).join('|')
     === 'Find the latest event information|Update the article content|Create or update the featured image'
     && subtasksForTask(c().data.subtasks, checklistParent.id).map((subtask) => subtask.position).join(',') === '0,1,2',
     'Subtasks C: multiple items keep their creation order');
  ok(c().data.tasks.length === taskCountWithParent
     && projectProgress(c().data.tasks, proj.id).total === projectCountWithParent
     && !c().data.tasks.some((task) => [firstSubtask.title, secondSubtask!.title, thirdSubtask!.title].includes(task.title)),
     'Subtasks K: checklist items do not appear as separate Tasks or Project tasks');

  await run(() => c().actions.startTask(checklistParent.id));
  ok(isTimerRunning(get(checklistParent.id))
     && blockingTimerTask(c().data.tasks, 'another-task')?.id === checklistParent.id
     && !('startedAt' in firstSubtask),
     'Subtasks L: the parent remains the only timer-bearing task');
  await click(document.querySelector(`#subtask-test-row button[aria-label="Complete subtask: ${firstSubtask.title}"]`), 'Complete first subtask');
  ok(c().data.subtasks.find((subtask) => subtask.id === firstSubtask.id)?.completed === true
     && c().data.subtasks.find((subtask) => subtask.id === secondSubtask!.id)?.completed === false
     && get(checklistParent.id).status === 'in_progress' && isTimerRunning(get(checklistParent.id)),
     'Subtasks D: checking one item affects only that item, not the parent or its timer');
  await click(document.querySelector(`#subtask-test-row button[aria-label="Uncheck subtask: ${firstSubtask.title}"]`), 'Uncheck first subtask');
  ok(c().data.subtasks.find((subtask) => subtask.id === firstSubtask.id)?.completed === false,
     'Subtasks E: unchecking returns the item to incomplete');
  await click(document.querySelector('#subtask-test-row button[aria-label="Edit subtask: Update the article content"]'), 'Edit second subtask');
  const editSubtaskInput = document.querySelector('#subtask-test-row input[aria-label="Edit subtask: Update the article content"]') as HTMLInputElement | null;
  if (!editSubtaskInput) throw new Error('Missing inline edit-subtask input');
  await setInputValue(editSubtaskInput, 'Update the article content and SEO');
  const editSubtaskForm = editSubtaskInput.closest('form');
  if (!editSubtaskForm) throw new Error('Missing inline edit-subtask form');
  await submitForm(editSubtaskForm);
  ok(c().data.subtasks.find((subtask) => subtask.id === secondSubtask!.id)?.title === 'Update the article content and SEO',
     'Subtasks G: editing a checklist item persists the new text');
  await click(document.querySelector(`#subtask-test-row button[aria-label="Delete subtask: ${thirdSubtask.title}"]`), 'Delete third subtask');
  ok(!c().data.subtasks.some((subtask) => subtask.id === thirdSubtask!.id),
     'Subtasks F: deleting a checklist item removes it');
  await click(document.querySelector('#subtask-test-row button[aria-label="Complete subtask: Update the article content and SEO"]'), 'Complete edited subtask');

  const completedReviewCountBeforeParent = dailyReviewStats(c().data, today).completed.length;
  const parentWasInTodayTasks = tasksOnDate(c().data.tasks, today).some((task) => task.id === checklistParent.id);
  await run(() => c().actions.finishTask(checklistParent.id));
  const checklistAfterParentCompletion = subtasksForTask(c().data.subtasks, checklistParent.id);
  ok(get(checklistParent.id).status === 'completed'
     && checklistAfterParentCompletion.length === 2
     && checklistAfterParentCompletion[0].completed === false
     && checklistAfterParentCompletion[1].completed === true,
     'Subtasks I-J: completing the parent leaves incomplete subtasks attached and does not reset checked items');
  ok(dailyReviewStats(c().data, today).completed.length === completedReviewCountBeforeParent + 1
     && parentWasInTodayTasks
     && !c().data.tasks.some((task) => [firstSubtask.title, 'Update the article content and SEO'].includes(task.title)),
     'Subtasks K: Today/Review still count only the parent task');
  ok(blockingTimerTask(c().data.tasks, 'another-task') === undefined
     && get(checklistParent.id).status === 'completed'
     && get(checklistParent.id).startedAt === undefined
     && typeof get(checklistParent.id).actualDurationSeconds === 'number',
     'Subtasks L: the parent timer completes through the existing timer path');

  const exportWithSubtasks = await c().actions.exportData();
  ok(exportWithSubtasks.subtasks.some((subtask) => subtask.id === firstSubtask.id),
     'Subtasks: JSON backup/export includes checklist items');
  await run(() => c().actions.importData(exportWithSubtasks));
  ok(c().data.subtasks.some((subtask) => subtask.id === firstSubtask.id),
     'Subtasks: importing a JSON backup restores checklist items');
  await act(async () => root.unmount());
  ctx = null;
  root = await mount(checklistParent.id);
  const reloadedChecklist = subtasksForTask(c().data.subtasks, checklistParent.id);
  ok(reloadedChecklist.map((subtask) => subtask.title).join('|') === 'Find the latest event information|Update the article content and SEO'
     && reloadedChecklist[0].completed === false && reloadedChecklist[1].completed === true
     && get(checklistParent.id).status === 'completed',
     'Subtasks H: reload preserves checklist order, text, completion, and the completed parent');
  ok(document.querySelector('[data-subtask-panel]') === null
     && document.querySelector('#subtask-test-row button[aria-label="Expand subtasks: 1/2 complete"]') !== null,
     'Subtasks UI: reloaded checklist stays collapsed and shows compact progress');
  await click(document.querySelector('#subtask-test-row button[aria-label="Expand subtasks: 1/2 complete"]'), 'Expand subtasks control');
  const expandedSubtasks = document.querySelector('[data-subtask-panel]');
  ok(Boolean(expandedSubtasks)
     && expandedSubtasks!.textContent?.includes('Find the latest event information')
     && expandedSubtasks!.textContent?.includes('Update the article content and SEO')
     && expandedSubtasks!.textContent?.includes('Parent completed · 1/2 subtasks completed'),
     'Subtasks UI: expand reveals the checklist and the subtle incomplete-parent indication');
  await click(document.querySelector('#subtask-test-row button[aria-label="Collapse subtasks: 1/2 complete"]'), 'Collapse subtasks control');
  ok(document.querySelector('[data-subtask-panel]') === null, 'Subtasks UI: checklist can be collapsed again');

  const closeAndReopen = async () => {
    await act(async () => {
      window.dispatchEvent(new dom.window.Event('pagehide'));
      root.unmount();
    });
    ctx = null;
    root = await mount();
  };

  const timed = await makeTask('Timed work', 30);
  ok(timed.estimatedDuration === 30, 'Timer 1: task created with a 30-minute estimate');

  await run(() => c().actions.startTask(timed.id));
  ok(isTimerRunning(get(timed.id)) && get(timed.id).startedAt !== undefined, 'Timer 2-3: Start → in progress with startedAt, timer running');

  await wait(1100);
  ok(elapsedActiveSeconds(get(timed.id)) >= 1, 'Timer: elapsed grows from timestamps (not a counter)');

  await wait(1100);
  await run(() => c().actions.pauseTask(timed.id));
  const afterPause = get(timed.id);
  ok(isTimerPaused(afterPause) && (afterPause.actualDurationSeconds ?? 0) >= 2, 'Timer 6: Pause preserves accumulated time');
  const frozen = afterPause.actualDurationSeconds ?? 0;

  // A paused session remains paused with exactly the same duration after reload.
  await act(async () => root.unmount());
  ctx = null;
  root = await mount();
  ok(isTimerPaused(get(timed.id)) && get(timed.id).actualDurationSeconds === frozen,
     'Timer A: reload keeps a normal task paused with its accumulated duration');
  await wait(1100);
  ok(Math.floor(elapsedActiveSeconds(get(timed.id))) === frozen, 'Timer 7: paused time does not accumulate after reload');

  await run(() => c().actions.resumeTask(timed.id));
  ok(isTimerRunning(get(timed.id)) && Math.floor(elapsedActiveSeconds(get(timed.id))) >= frozen, 'Timer 8-9: Resume continues from the previous elapsed time');

  await wait(1100);
  await run(() => c().actions.finishTask(timed.id));
  const finished = get(timed.id);
  ok(finished.status === 'completed' && finished.completedAt !== undefined, 'Timer 10+12: Finish → completed with completedAt stored');
  ok(finished.startedAt === undefined && finished.pausedAt === undefined, 'Timer: Finish stops the timer');
  ok((finished.actualDurationSeconds ?? 0) >= frozen + 1, `Timer 10: actual_duration_seconds stored (${finished.actualDurationSeconds}s)`);
  ok(finished.estimatedDuration === 30, 'Timer 11: estimate remains 30 minutes (never overwritten)');

  const checkpointBase = {
    ...get(timed.id),
    status: 'in_progress' as const,
    actualDurationSeconds: 4,
    startedAt: new Date(1_000).toISOString(),
  };
  const checkpoint = checkpointTimingPatch(checkpointBase, 3_750);
  const checkpointed = { ...checkpointBase, ...checkpoint };
  ok(checkpoint.actualDurationSeconds === 6 && checkpoint.startedAt === new Date(3_000).toISOString()
      && Math.abs(elapsedActiveSeconds(checkpointed, 3_750) - 6.75) < 0.001,
     'Timer checkpoint: whole seconds persist without losing the fractional remainder');
  const recoveredCheckpoint = { ...checkpointed, ...interruptedTimerPatch(checkpointed) };
  ok(isTimerPaused(recoveredCheckpoint) && recoveredCheckpoint.actualDurationSeconds === 6
      && recoveredCheckpoint.pausedAt === checkpoint.startedAt,
     'Timer checkpoint: interrupted sessions pause at the last durable timestamp');

  // Manual completion without the timer: works, and records no actual duration.
  const manual = await makeTask('Manually completed');
  await run(() => c().actions.completeTask(manual.id));
  const manualDone = get(manual.id);
  ok(manualDone.status === 'completed' && manualDone.completedAt !== undefined, 'Timer 15: manual completion still works (completedAt set)');
  ok(manualDone.actualDurationSeconds === undefined, 'Timer: manual completion leaves actual duration empty');

  // Manual completion of a RUNNING task preserves whatever time is available.
  const interrupted = await makeTask('Interrupted', 15);
  await run(() => c().actions.startTask(interrupted.id));
  await wait(1100);
  await run(() => c().actions.completeTask(interrupted.id));
  const interruptedDone = get(interrupted.id);
  ok(interruptedDone.status === 'completed' && (interruptedDone.actualDurationSeconds ?? 0) >= 1
     && interruptedDone.estimatedDuration === 15, 'Timer 14: completing an in-progress task keeps its timing info and estimate');

  // Reopening a completed task clears the timer fields but keeps the record.
  await run(() => c().actions.reopenTask(timed.id));
  const reopened = get(timed.id);
  ok(reopened.status !== 'completed' && reopened.startedAt === undefined && reopened.pausedAt === undefined
     && (reopened.actualDurationSeconds ?? 0) === (finished.actualDurationSeconds ?? 0), 'Timer 14: reopened task is safe (timer cleared, record kept)');

  // Everything (including timing data) survives another full reload.
  await act(async () => root.unmount());
  ctx = null;
  root = await mount();
  const persistedTimed = get(timed.id);
  ok(persistedTimed.actualDurationSeconds === finished.actualDurationSeconds && persistedTimed.estimatedDuration === 30
     && get(manual.id).actualDurationSeconds === undefined, 'Timer 19: timing data persists across reload/logout');

  /* ------------------------------------------------------------------ */
  /* Daily well-being — four check-ins, fresh every day                  */
  /* ------------------------------------------------------------------ */

  const wellbeingToday = () => c().data.wellbeingDays.filter((w) => w.date === today);
  const wellbeingDay = () => wellbeingToday()[0];
  const flagsOf = (w?: { jogging: boolean; nitnemMorning: boolean; nitnemEvening: boolean; nitnemNight: boolean }) =>
    [w?.jogging, w?.nitnemMorning, w?.nitnemEvening, w?.nitnemNight];

  ok(c().data.wellbeingDays.length === 0, 'Well-being: a fresh day starts with no record at all');

  await run(() => c().actions.toggleWellbeing('jogging'));
  await run(() => c().actions.toggleWellbeing('nitnemEvening'));
  ok(flagsOf(wellbeingDay()).join() === 'true,false,true,false' && wellbeingToday().length === 1,
     'Well-being: check-ins land on one record for the day');

  await run(() => c().actions.toggleWellbeing('nitnemEvening'));
  ok(wellbeingDay()!.nitnemEvening === false, 'Well-being: a check-in can be unchecked again');

  // Three concurrent taps (the app queues them per day).
  await run(async () => {
    await Promise.all([
      c().actions.toggleWellbeing('nitnemMorning'),
      c().actions.toggleWellbeing('nitnemMorning'),
      c().actions.toggleWellbeing('nitnemMorning'),
    ]);
  });
  ok(wellbeingToday().length === 1 && wellbeingDay()!.nitnemMorning === true,
     'Well-being: rapid taps cannot create duplicate records for one day');

  await run(() => c().actions.toggleWellbeing('nitnemMorning'));
  await act(async () => root.unmount());
  ctx = null;
  root = await mount();
  ok(flagsOf(wellbeingDay()).join() === 'true,false,false,false',
     'Well-being: today’s check-ins persist across reload');

  // Age the record by one day: history kept, today fresh again.
  const raw = JSON.parse(String(dom.window.localStorage.getItem('pace.db.v1'))) as {
    wellbeingDays: { date: string }[];
  };
  raw.wellbeingDays = raw.wellbeingDays.map((w) => ({ ...w, date: addDays(today, -1) }));
  dom.window.localStorage.setItem('pace.db.v1', JSON.stringify(raw));
  await act(async () => root.unmount());
  ctx = null;
  root = await mount();
  ok(c().data.wellbeingDays.length === 1 && c().data.wellbeingDays[0].date === addDays(today, -1),
     'Well-being: yesterday stays as history');
  ok(flagsOf(wellbeingDay()).every((f) => f === undefined) && c().data.tasks.length > 0,
     'Well-being: a new day starts fresh without touching anything else');

  /* ------------------------------------------------------------------ */
  /* Daily well-being — history: open, correct and backfill past days    */
  /* ------------------------------------------------------------------ */

  const yesterday = addDays(today, -1);
  const dayBeforeYesterday = addDays(today, -2);
  const wellbeingOn = (date: string) => c().data.wellbeingDays.filter((w) => w.date === date);
  const yesterdayRecordId = wellbeingOn(yesterday)[0].id;

  // Backfill a day that has no record at all ("I did Nitnem Morning two days
  // ago but forgot to tick it") — a new record is created for that date.
  await run(() => c().actions.toggleWellbeing('nitnemMorning', dayBeforeYesterday));
  ok(wellbeingOn(dayBeforeYesterday).length === 1
     && flagsOf(wellbeingOn(dayBeforeYesterday)[0]).join() === 'false,true,false,false',
     'Well-being history: a forgotten day can be recorded retrospectively');
  ok(wellbeingOn(yesterday).length === 1
     && wellbeingOn(yesterday)[0].id === yesterdayRecordId
     && flagsOf(wellbeingOn(yesterday)[0]).join() === 'true,false,false,false',
     'Well-being history: backfilling never overwrites an existing record');

  // Correcting the same past day again updates that one record — same id, no
  // duplicate rows, then unchecked again it stays off.
  const backfilledId = wellbeingOn(dayBeforeYesterday)[0].id;
  await run(() => c().actions.toggleWellbeing('nitnemNight', dayBeforeYesterday));
  ok(wellbeingOn(dayBeforeYesterday).length === 1
     && wellbeingOn(dayBeforeYesterday)[0].id === backfilledId
     && flagsOf(wellbeingOn(dayBeforeYesterday)[0]).join() === 'false,true,false,true',
     'Well-being history: more check-ins on a past day update its single record');
  await run(() => c().actions.toggleWellbeing('nitnemNight', dayBeforeYesterday));
  ok(wellbeingOn(dayBeforeYesterday)[0].nitnemNight === false
     && c().data.wellbeingDays.length === 2,
     'Well-being history: a past check-in can be unchecked again');

  // Today keeps behaving exactly as before while past records exist.
  await run(() => c().actions.toggleWellbeing('jogging'));
  ok(wellbeingToday().length === 1 && wellbeingDay()!.jogging === true
     && c().data.wellbeingDays.length === 3,
     'Well-being: today still writes only to today’s own record');
  ok(flagsOf(wellbeingOn(yesterday)[0]).join() === 'true,false,false,false'
     && flagsOf(wellbeingOn(dayBeforeYesterday)[0]).join() === 'false,true,false,false',
     'Well-being history: today’s check-in leaves every past day untouched');

  // Today and all past records persist across a reload.
  await act(async () => root.unmount());
  ctx = null;
  root = await mount();
  ok(c().data.wellbeingDays.length === 3
     && wellbeingOn(yesterday)[0]?.jogging === true
     && wellbeingOn(dayBeforeYesterday)[0]?.nitnemMorning === true
     && wellbeingToday()[0]?.jogging === true,
     'Well-being history: today and past records survive a reload');

  // The Review section: an untouched day (no record anywhere) still opens as a
  // real day — all four check-ins off, "0 of 4 completed" — and can be ticked.
  const untouchedDay = addDays(today, -3);
  await act(async () => root.unmount());
  ctx = null;
  root = await mount(undefined, untouchedDay);
  const historySection = document.querySelector('section[aria-labelledby="wellbeing-review-heading"]');
  if (!historySection) throw new Error('Missing Review well-being section');
  const historyBoxes = () => Array.from(historySection.querySelectorAll('[role="checkbox"]'));
  const historyStates = () => historyBoxes().map((box) => box.getAttribute('aria-checked')).join();
  ok(historyBoxes().length === 4 && historyStates() === 'false,false,false,false'
     && historySection.textContent?.includes('0 of 4 completed') === true,
     'Well-being history UI: a day with no record still opens as a real 0 of 4 day');
  await click(historyBoxes()[0], 'Jogging check-in on an untouched past day');
  ok(historyStates() === 'true,false,false,false'
     && wellbeingOn(untouchedDay).length === 1 && wellbeingOn(untouchedDay)[0].jogging === true
     && historySection.textContent?.includes('1 of 4 completed') === true,
     'Well-being history UI: ticking a forgotten day records it on that day');
  await click(historyBoxes()[0], 'Untick Jogging on the same past day');
  ok(historyStates() === 'false,false,false,false'
     && historySection.textContent?.includes('0 of 4 completed') === true,
     'Well-being history UI: an unchecked-again day still shows as a real 0 of 4 day');
  ok(wellbeingToday()[0].jogging === true && wellbeingOn(yesterday)[0].jogging === true,
     'Well-being history UI: editing in Review never touches today or other days');

  // A previous day with an existing record opens with its own check-ins, not
  // today's: jogging on, the rest off, "1 of 4 completed".
  await act(async () => root.unmount());
  ctx = null;
  root = await mount(undefined, yesterday);
  const yesterdaySection = document.querySelector('section[aria-labelledby="wellbeing-review-heading"]');
  if (!yesterdaySection) throw new Error('Missing Review well-being section for yesterday');
  const yesterdayStates = Array.from(yesterdaySection.querySelectorAll('[role="checkbox"]'))
    .map((box) => box.getAttribute('aria-checked'))
    .join();
  ok(yesterdayStates === 'true,false,false,false'
     && yesterdaySection.textContent?.includes('1 of 4 completed') === true,
     'Well-being history UI: a previous day opens with its own check-ins');

  /* ------------------------------------------------------------------ */
  /* Calendar — day dots, day detail and the monthly well-being summary  */
  /* ------------------------------------------------------------------ */

  // Prepare a precise 3-of-4 record (jogging + Nitnem Morning + Nitnem Night)
  // on a day that is guaranteed to be visible in the current month grid:
  // yesterday, unless the grid happens to start only today.
  const preparedDayDate = yesterday >= calendarGridStart(today) ? yesterday : today;
  await run(() => c().actions.toggleWellbeing('nitnemMorning', preparedDayDate));
  await run(() => c().actions.toggleWellbeing('nitnemNight', preparedDayDate));
  ok(flagsOf(wellbeingOn(preparedDayDate)[0]).join() === 'true,true,false,true',
     'Calendar: an existing record grows in place into a 3-of-4 day (no overwrite)');

  // The monthly summary selector: distinct days per check-in, scoped to one
  // month, and a repeated row for one date can never double-count the day.
  const probeMonth = monthKey(today);
  const makeDay = (id: string, date: string, jogging = false, nitnemMorning = false, nitnemEvening = false, nitnemNight = false) =>
    ({ id, date, jogging, nitnemMorning, nitnemEvening, nitnemNight });
  const probeDays = [
    makeDay('a', `${probeMonth}-01`, true),
    makeDay('b', `${probeMonth}-01`, true, true, true, true), // duplicate date — ignored entirely
    makeDay('c', `${probeMonth}-15`, true, true, true, true),
    makeDay('d', '2020-01-10', true, true, true, true),       // another month entirely
    makeDay('e', `${probeMonth}-20`),                          // a real 0-of-4 day — counts nothing
  ];
  const probeTotals = monthlyWellbeingTotals(probeDays, probeMonth);
  ok(probeTotals.jogging === 2 && probeTotals.nitnemMorning === 1 && probeTotals.nitnemEvening === 1 && probeTotals.nitnemNight === 1,
     'Calendar summary: distinct days per check-in; the same day is never counted twice');
  const probeOther = monthlyWellbeingTotals(probeDays, '2020-01');
  ok(probeOther.jogging === 1 && probeOther.nitnemMorning === 1 && probeOther.nitnemEvening === 1 && probeOther.nitnemNight === 1,
     'Calendar summary: only days inside the displayed month are counted');

  // Expected totals for any month, derived straight from the current data —
  // exactly what the UI must display beneath the calendar.
  const expectedMonthTotals = (mk: string) => {
    const seen = new Set<string>();
    let jogging = 0, morning = 0, evening = 0, night = 0;
    for (const w of c().data.wellbeingDays) {
      if (monthKey(w.date) !== mk || seen.has(w.date)) continue;
      seen.add(w.date);
      if (w.jogging) jogging += 1;
      if (w.nitnemMorning) morning += 1;
      if (w.nitnemEvening) evening += 1;
      if (w.nitnemNight) night += 1;
    }
    return [jogging, morning, evening, night];
  };
  const checkSummaryFor = (anchorDate: string, label: string) => {
    const section = document.querySelector('section[aria-labelledby="calendar-wellbeing-summary-heading"]');
    if (!section) throw new Error('Missing monthly well-being summary below the calendar');
    const expected = expectedMonthTotals(monthKey(anchorDate));
    const heading = section.querySelector('h2')?.textContent ?? '';
    const rows = Array.from(section.querySelector('[data-wellbeing-summary]')?.children ?? []).map((row) => row.textContent ?? '');
    ok(heading === `Well-being — ${monthName(anchorDate)} ${anchorDate.slice(0, 4)}`
       && rows.length === 4
       && rows[0].includes('Jogging') && rows[1].includes('Nitnem Morning')
       && rows[2].includes('Nitnem Evening') && rows[3].includes('Nitnem Night')
       && rows.every((row, i) => row.includes(`${expected[i]} ${expected[i] === 1 ? 'day' : 'days'}`)),
       `Calendar summary: ${label} shows exactly the four monthly totals (${expected.join('/')})`);
  };

  await act(async () => root.unmount());
  ctx = null;
  root = await mount(undefined, undefined, true);
  checkSummaryFor(today, 'the current month');

  // The summary always corresponds to the displayed month, never a fixed one.
  await click(document.querySelector('button[aria-label="Previous month"]'), 'Previous month');
  checkSummaryFor(addMonths(today, -1), 'after navigating a month back');
  await click(document.querySelector('button[aria-label="Next month"]'), 'Next month (back)');
  checkSummaryFor(today, 'back on the current month');

  // Tiny day dots: exactly one dot per completed check-in on every visible
  // grid day (including adjacent-month days shown at the grid's edges).
  const gridStart = calendarGridStart(today);
  const gridEnd = addDays(gridStart, 41);
  const expectedDotCounts: number[] = [];
  {
    const seen = new Set<string>();
    for (const w of c().data.wellbeingDays) {
      if (seen.has(w.date) || w.date < gridStart || w.date > gridEnd) continue;
      seen.add(w.date);
      const n = [w.jogging, w.nitnemMorning, w.nitnemEvening, w.nitnemNight].filter(Boolean).length;
      if (n > 0) expectedDotCounts.push(n);
    }
  }
  const dotContainers = Array.from(document.querySelectorAll('[data-wellbeing-count]'));
  const shownDotCounts = dotContainers.map((el) => Number(el.getAttribute('data-wellbeing-count')));
  ok(shownDotCounts.length === expectedDotCounts.length
     && [...shownDotCounts].sort().join() === [...expectedDotCounts].sort().join()
     && dotContainers.every((el) => el.children.length === Number(el.getAttribute('data-wellbeing-count'))),
     'Calendar: each day with check-ins shows exactly its tiny dots — no more, no less');

  // Clicking the prepared day in the grid shows its exact check-ins in the
  // day detail: three checked (jogging, morning, night), "3 of 4 completed".
  const preparedCell = dotContainers.find((el) => el.getAttribute('data-wellbeing-count') === '3')?.closest('button');
  if (!preparedCell) throw new Error('Missing day cell for the prepared 3-of-4 record');
  await click(preparedCell, 'day cell with three completed check-ins');
  const dayStrip = document.querySelector('[data-wellbeing-day]');
  if (!dayStrip) throw new Error('Missing day-detail well-being strip');
  ok(dayStrip.textContent?.includes('3 of 4 completed') === true
     && dayStrip.querySelectorAll('svg').length === 3
     && dayStrip.textContent?.includes('Jogging') === true
     && dayStrip.textContent?.includes('Nitnem Morning') === true
     && dayStrip.textContent?.includes('Nitnem Night') === true,
     'Calendar: clicking a day shows its exact Jogging/Nitnem details');

  /* ------------------------------------------------------------------ */
  /* Timer lifecycle — unload pause and last-checkpoint recovery         */
  /* ------------------------------------------------------------------ */

  // Closing the page dispatches pagehide (not visibilitychange): persist the
  // current segment and reopen paused without carrying time across the gap.
  let overnight!: { id: string };
  await run(async () => {
    overnight = (await c().actions.addTask({ title: 'Left running overnight', scheduledDate: addDays(today, -1), status: 'today' })) as { id: string };
  });
  await run(() => c().actions.startTask(overnight.id));
  await wait(1100);
  await closeAndReopen();
  const afterReopen = get(overnight.id);
  const closedDuration = afterReopen.actualDurationSeconds ?? 0;
  ok(isTimerPaused(afterReopen) && closedDuration >= 1 && afterReopen.scheduledDate === addDays(today, -1),
     'Lifecycle B: closing/reopening pauses a normal task, saves elapsed time, and does not carry it forward');
  await wait(1100);
  ok((get(overnight.id).actualDurationSeconds ?? 0) === closedDuration,
     'Lifecycle B: time while FocusDesk is closed is not counted');
  await run(() => c().actions.finishTask(overnight.id));

  // If unload persistence is skipped (for example, abrupt process termination),
  // reopening reconciles a still-running row at its last persisted checkpoint.
  const recovered = await makeTask('Recover last timer checkpoint');
  await run(() => c().actions.startTask(recovered.id));
  const reliableAt = new Date(Date.now() - 20_000).toISOString();
  await run(() => c().actions.updateTask(recovered.id, { startedAt: reliableAt, actualDurationSeconds: 17 }));
  await act(async () => root.unmount());
  ctx = null;
  root = await mount();
  ok(isTimerPaused(get(recovered.id)) && get(recovered.id).actualDurationSeconds === 17
      && get(recovered.id).pausedAt === reliableAt,
     'Lifecycle: missed unload writes recover paused at the last reliable timestamp');
  await wait(1100);
  ok(get(recovered.id).actualDurationSeconds === 17, 'Lifecycle: recovery never accumulates time after its checkpoint');
  await run(() => c().actions.finishTask(recovered.id));

  // A normal pause persists immediately and remains frozen across a reload.
  const pausedOvernight = await makeTask('Paused overnight');
  await run(() => c().actions.startTask(pausedOvernight.id));
  await wait(1100);
  await run(() => c().actions.pauseTask(pausedOvernight.id));
  const frozenOvernight = get(pausedOvernight.id).actualDurationSeconds ?? 0;
  await act(async () => root.unmount());
  ctx = null;
  root = await mount();
  ok(isTimerPaused(get(pausedOvernight.id)) && get(pausedOvernight.id).actualDurationSeconds === frozenOvernight,
     'Lifecycle A: a paused session survives reload with the same duration');
  await wait(1100);
  ok(Math.floor(elapsedActiveSeconds(get(pausedOvernight.id))) === frozenOvernight,
     'Lifecycle A: paused time does not accumulate after reload');
  await run(() => c().actions.resumeTask(pausedOvernight.id));
  await wait(1100);
  await run(() => c().actions.finishTask(pausedOvernight.id));
  ok(get(pausedOvernight.id).status === 'completed' && (get(pausedOvernight.id).actualDurationSeconds ?? 0) >= frozenOvernight,
     'Lifecycle: Pause → Resume → Finish counts only running time');

  /* ------------------------------------------------------------------ */
  /* Daily priority timer uses the shared Task timer/session             */
  /* ------------------------------------------------------------------ */

  const makePriority = async (title: string, date: string) => {
    let created!: { id: string };
    await run(async () => { created = await c().actions.setDailyPriority(title, date); });
    return c().data.dailyPriorities.find((p) => p.id === created.id)!;
  };
  const priorityPaused = await makePriority('Priority pause and reload', addDays(today, 1));
  let priorityTask!: import('../lib/types').Task | null;
  let startedAgain!: import('../lib/types').Task | null;
  await run(async () => {
    [priorityTask, startedAgain] = await Promise.all([
      c().actions.startDailyPriorityTimer(priorityPaused.id),
      c().actions.startDailyPriorityTimer(priorityPaused.id),
    ]);
  });
  ok(Boolean(priorityTask) && isTimerRunning(get(priorityTask.id)), 'Priority: Start creates and runs a normal persisted Task timer');
  ok(startedAgain?.id === priorityTask.id
      && c().data.tasks.filter((t) => t.id === priorityTask.id).length === 1,
     'Priority G: concurrent/repeated Start reuses one Task/session instead of creating duplicates');
  await wait(1100);
  await run(() => c().actions.pauseTask(priorityTask.id));
  const priorityFrozen = get(priorityTask.id).actualDurationSeconds ?? 0;
  await act(async () => root.unmount());
  ctx = null;
  root = await mount();
  ok(isTimerPaused(get(priorityTask.id)) && get(priorityTask.id).actualDurationSeconds === priorityFrozen && priorityFrozen >= 1,
     'Priority C: pause and reload preserve the accumulated Task timer duration');
  await run(() => c().actions.toggleDailyPriority(priorityPaused.id));

  const priorityClosed = await makePriority('Priority close and reopen', addDays(today, 2));
  let closingPriorityTask!: import('../lib/types').Task | null;
  await run(async () => { closingPriorityTask = await c().actions.startDailyPriorityTimer(priorityClosed.id); });
  await wait(1100);
  await closeAndReopen();
  const closedPriority = get(closingPriorityTask!.id);
  const closedPrioritySeconds = closedPriority.actualDurationSeconds ?? 0;
  ok(isTimerPaused(closedPriority) && closedPrioritySeconds >= 1,
     'Priority D: closing/reopening leaves the priority timer paused with consumed time');
  await wait(1100);
  ok(get(closingPriorityTask!.id).actualDurationSeconds === closedPrioritySeconds,
     'Priority D: closed time is excluded from the priority duration');
  await run(() => c().actions.toggleDailyPriority(priorityClosed.id));

  const priorityFinish = await makePriority('Priority resume and finish', addDays(today, 3));
  let finishingPriorityTask!: import('../lib/types').Task | null;
  await run(async () => { finishingPriorityTask = await c().actions.startDailyPriorityTimer(priorityFinish.id); });
  await wait(1100);
  await run(() => c().actions.pauseTask(finishingPriorityTask!.id));
  const beforePriorityResume = get(finishingPriorityTask!.id).actualDurationSeconds ?? 0;
  await wait(1100);
  await run(() => c().actions.resumeTask(finishingPriorityTask!.id));
  await wait(1100);
  await run(() => c().actions.toggleDailyPriority(priorityFinish.id));
  const finishedPriorityTask = get(finishingPriorityTask!.id);
  ok(finishedPriorityTask.status === 'completed' && finishedPriorityTask.completedAt !== undefined
      && (finishedPriorityTask.actualDurationSeconds ?? 0) >= beforePriorityResume + 1,
     'Priority E: Pause → Resume → Finish persists the final actual focused duration');
  ok(c().data.dailyPriorities.find((p) => p.id === priorityFinish.id)?.completed
      && finishedPriorityTask.estimatedDuration === undefined
      && formatFocusedTime(finishedPriorityTask.actualDurationSeconds) === '< 1 min',
     'Priority E: completion displays actual focused time without overwriting an estimate');

  // A hidden tab is not a page exit. Visibility changes never auto-pause.
  const hiddenTabTask = await makeTask('Continue behind another tab');
  await run(() => c().actions.startTask(hiddenTabTask.id));
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
  await act(async () => { document.dispatchEvent(new dom.window.Event('visibilitychange')); });
  ok(isTimerRunning(get(hiddenTabTask.id)), 'Timer F: visibilitychange to hidden does not pause a running task');
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  await run(() => c().actions.pauseTask(hiddenTabTask.id));
  await run(() => c().actions.finishTask(hiddenTabTask.id));

  /* ------------------------------------------------------------------ */
  /* Focused time on completed tasks — one source of truth               */
  /* ------------------------------------------------------------------ */

  // A multi-session task: Start → Pause → Resume → Finish. The recorded
  // value must be the SUM of the running segments, and everything that shows
  // "focused time" must read exactly that value.
  const multi = await makeTask('Two sessions of work', 45);
  await run(() => c().actions.startTask(multi.id));
  await wait(1100);
  await run(() => c().actions.pauseTask(multi.id));
  await wait(1100); // paused time must not count
  await run(() => c().actions.resumeTask(multi.id));
  await wait(1100);
  await run(() => c().actions.finishTask(multi.id));
  const multiDone = get(multi.id);
  ok((multiDone.actualDurationSeconds ?? 0) >= 2 && (multiDone.actualDurationSeconds ?? 0) <= 4,
     `Focused time: two segments are summed, paused time excluded (${multiDone.actualDurationSeconds}s)`);
  ok(formatFocusedTime(multiDone.actualDurationSeconds) === '< 1 min',
     'Focused time: a sub-minute session reads "< 1 min", never a fake duration');

  // A longer session, driven through the real timer path: backdate startedAt,
  // then Finish — exactly what a user's session would have persisted.
  const runSession = async (title: string, minutes: number, projectId?: string) => {
    const t = await makeTask(title, undefined, projectId);
    await run(() => c().actions.startTask(t.id));
    await run(() => c().actions.updateTask(t.id, { startedAt: new Date(Date.now() - minutes * 60_000).toISOString() }));
    await run(() => c().actions.finishTask(t.id));
    return get(t.id);
  };

  const single = await runSession('One longer session', 47);
  ok(formatFocusedTime(single.actualDurationSeconds) === '47 min', 'Focused time formats as "47 min"');
  ok(formatFocusedTime(72 * 60) === '1h 12m', 'Focused time formats as "1h 12m"');
  ok(formatFocusedTime(undefined) === '' && formatFocusedTime(0) === '< 1 min',
     'Focused time: no record → nothing to show; a zero-second session → "< 1 min"');

  const project = await (async () => {
    let p;
    await run(async () => {
      p = await c().actions.addProject({ name: 'Timed project' });
    });
    return p! as { id: string };
  })();
  const projectA = await runSession('Project task A', 30, project.id);
  const projectB = await runSession('Project task B', 48, project.id);
  ok(projectA.actualDurationSeconds === 30 * 60 && projectB.actualDurationSeconds === 48 * 60,
     'Project sessions record their consumed time through the timer');
  const projectTotal = projectFocusedSeconds(c().data.tasks, project.id);
  ok(projectTotal === (30 + 48) * 60, `Project summary sums only its completed sessions (${formatFocusedTime(projectTotal)})`);
  const notYetFinished = await makeTask('Running but not finished');
  await run(() => c().actions.startTask(notYetFinished.id));
  ok(focusedSeconds([get(notYetFinished.id)]) === 0,
     'Focused time: a session still running contributes nothing until it is finished');
  await run(() => c().actions.pauseTask(notYetFinished.id));
  await run(() => c().actions.finishTask(notYetFinished.id));

  // A task completed without the timer must never show an invented duration.
  const beforeUntimed = dailyReviewStats(c().data, today).focusedSeconds;
  const untimed = await makeTask('Completed without the timer');
  await run(() => c().actions.completeTask(untimed.id));
  ok(get(untimed.id).actualDurationSeconds === undefined, 'A task completed without the timer records no duration');
  ok(dailyReviewStats(c().data, today).focusedSeconds === beforeUntimed,
     'Focused time: an untimed completion adds nothing and changes no total');

  const dayStats = dailyReviewStats(c().data, today);
  ok(dayStats.focusedSeconds === focusedSeconds(dayStats.completed),
     'Daily review total equals the sum of its completed tasks (same value, same field)');
  const weekStats = weeklyReviewStats(c().data, startOfWeek(today), endOfWeek(today));
  ok(weekStats.focusedSeconds === focusedSeconds(weekStats.completed) && weekStats.projectsWorkedOn.some((p) => p.project.id === project.id && p.focusedSeconds >= 78 * 60 - 1),
     'Weekly review total and per-project focused time come from the same tasks');
  const monthStats = monthlyReviewStats(c().data, today.slice(0, 7));
  ok(monthStats.focusedSeconds === focusedSeconds(monthStats.completed),
     'Monthly review total equals the sum of its completed tasks');

  /* ------------------------------------------------------------------ */
  /* Daily review — completed work is dated by completedAt               */
  /* ------------------------------------------------------------------ */

  // The real write path stamps completedAt with the clock; the review has to
  // read that instant, not the day the task happened to be planned for.
  let carried!: { id: string };
  await run(async () => {
    carried = (await c().actions.addTask({
      title: 'Planned yesterday, finished today',
      scheduledDate: addDays(today, -1),
      status: 'planned',
    })) as { id: string };
  });
  await run(() => c().actions.completeTask(carried.id));
  ok(get(carried.id).completedAt !== undefined
     && dailyReviewStats(c().data, today).completed.some((t) => t.id === carried.id),
     'Daily review counts a task planned yesterday but finished today');
  ok(!dailyReviewStats(c().data, addDays(today, -1)).completed.some((t) => t.id === carried.id),
     'Daily review does not count that task on the day it was merely planned');

  let unscheduled!: { id: string };
  await run(async () => {
    unscheduled = (await c().actions.addTask({ title: 'Never scheduled, finished today' })) as { id: string };
  });
  await run(() => c().actions.completeTask(unscheduled.id));
  ok(dailyReviewStats(c().data, today).completed.some((t) => t.id === unscheduled.id),
     'Daily review counts an unscheduled task on the day it was actually finished');

  await act(async () => root.unmount());
  ctx = null;
  root = await mount();
  ok(focusedSeconds([get(single.id)]) === single.actualDurationSeconds && focusedSeconds([get(multi.id)]) === (multiDone.actualDurationSeconds ?? 0),
     'Focused time survives a reload unchanged (no recomputation)');

  await act(async () => root.unmount());
  console.log('\nWorkflow verified.');
  process.exit(0);
}
main();
