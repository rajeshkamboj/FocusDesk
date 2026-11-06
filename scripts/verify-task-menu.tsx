/**
 * Task-menu accessibility regression harness.
 *
 *   npx tsx scripts/verify-task-menu.tsx
 *
 * Exercises the real TaskRow/Menu/DataProvider with pointer events, checks
 * action parity and delete safeguards, and exhaustively checks viewport math.
 * Browser layout, touch targets and hover media queries are covered by the
 * Playwright checklist in docs/task-menu-accessibility.md.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { positionMenu } from '../lib/menu-position';

const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/tasks' });
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
g.localStorage = dom.window.localStorage;
g.IS_REACT_ACT_ENVIRONMENT = true;

let checks = 0;
function ok(condition: unknown, message: string) {
  assert.ok(condition, message);
  checks++;
  console.log(`✓ ${message}`);
}

async function main() {
  const React = await import('react');
  const { act } = React;
  const { createRoot } = await import('react-dom/client');
  const { PathnameContext } = await import('next/dist/shared/lib/hooks-client-context.shared-runtime');
  const { AuthProvider } = await import('../components/auth/auth-provider');
  const { DataProvider, useData } = await import('../components/data/data-provider');
  const { TaskRow } = await import('../components/tasks/task-row');
  const { emptyData } = await import('../lib/store/defaults');
  type Data = ReturnType<typeof useData>;
  let data: Data | null = null;
  let pathname = '/tasks';
  let selections = 0;
  const Probe = () => { data = useData(); return null; };
  const Row = () => {
    const { data: app } = useData();
    const task = app.tasks.find(t => t.id === 'task-1');
    return task ? React.createElement(TaskRow, {
      task,
      selection: { selected: false, onToggle: () => { selections++; } },
    }) : null;
  };
  const App = () => React.createElement(PathnameContext.Provider, { value: pathname },
    React.createElement(AuthProvider, null,
      React.createElement(DataProvider, null,
        React.createElement(Probe), React.createElement(Row))));

  const seeded = emptyData();
  seeded.tasks = [{ id: 'task-1', title: 'Accessible task', description: 'Task details', status: 'planned', priority: 'medium', createdAt: '2026-01-01T00:00:00Z', tags: [], postponementCount: 0, archived: false }];
  localStorage.setItem('pace.db.v1', JSON.stringify(seeded));
  const root = createRoot(document.getElementById('root')!);
  const render = async () => { await act(async () => { root.render(React.createElement(App)); }); };
  await render();
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  const row = () => document.querySelector('[data-task-id="task-1"]')!;
  const trigger = () => row().querySelector<HTMLButtonElement>('[aria-label="Task actions"]')!;
  const panel = () => document.querySelector<HTMLElement>('[data-menu-portal]');
  const item = (label: string) => Array.from(panel()?.querySelectorAll('button') ?? []).find(button => button.textContent?.trim() === label);
  const tap = async (element: Element) => {
    await act(async () => {
      element.dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true }));
      element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    });
  };
  const open = async () => {
    await act(async () => { trigger().dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })); });
    assert.ok(panel(), 'menu opens');
  };
  const choose = async (label: string) => {
    await open();
    const action = item(label);
    assert.ok(action, `existing action remains available: ${label}`);
    await tap(action);
    assert.equal(panel(), null, `${label} dismisses the menu`);
  };

  ok(trigger().type === 'button' && trigger().getAttribute('aria-haspopup') === 'menu', 'the visible affordance is a real menu button');
  ok(trigger().className.includes('size-11') && trigger().className.includes('touch-manipulation'), 'touch sizing is 44px and manipulation does not add double-tap zoom');
  await open();
  ok(panel()?.parentElement === document.body, 'the existing menu is portaled out of row/card clipping containers');
  ok(trigger().getAttribute('aria-expanded') === 'true' && trigger().getAttribute('aria-controls') === panel()?.id, 'expanded state and menu ownership are exposed to assistive technology');
  ok(panel()?.getAttribute('role') === 'menu' && item('Edit…')?.getAttribute('role') === 'menuitem', 'the portal and its actions have menu semantics');
  assert.deepEqual(Array.from(panel()!.querySelectorAll('[role="menuitem"]')).map(el => el.textContent?.trim()), [
    'Start (in progress)', 'Mark complete', 'Do tomorrow', 'Reschedule…', 'Move to Someday', 'Set deadline…', 'Break down…', 'Edit…', 'Copy context for AI…', 'Cancel task', 'Delete',
  ]);
  ok(true, 'touch uses the complete desktop action set, including Edit and Copy context for AI');
  ok(selections === 0 && !row().textContent?.includes('Task details'), 'opening actions neither selects nor expands the task');
  await act(async () => { document.body.dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true })); });
  ok(panel() === null, 'a touch-compatible outside pointerdown dismisses the menu without a synthetic mousedown');

  await open();
  await act(async () => { document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
  ok(panel() === null && document.activeElement === trigger(), 'Escape dismisses and restores trigger focus');
  await choose('Edit…');
  ok(document.querySelector('[role="dialog"][aria-label="Edit task"]'), 'Edit opens the existing task editor');
  await tap(Array.from(document.querySelectorAll('button')).find(el => el.textContent === 'Cancel')!);
  await choose('Start (in progress)');
  ok(data!.data.tasks[0].status === 'in_progress', 'Start calls the existing timer action');
  await choose('Mark complete');
  ok(data!.data.tasks[0].status === 'completed', 'Mark complete uses the existing completion action');
  await choose('Reopen');
  ok(data!.data.tasks[0].status !== 'completed', 'completed tasks retain Reopen');
  await choose('Do tomorrow');
  ok(data!.data.tasks[0].postponementCount === 1, 'Do tomorrow uses the existing postponement action');
  await choose('Move to Someday');
  ok(data!.data.tasks[0].status === 'someday', 'Move to Someday uses the existing action');
  await choose('Cancel task');
  ok(data!.data.tasks[0].status === 'cancelled', 'Cancel uses the existing action');

  await choose('Delete');
  ok(document.querySelector('[role="dialog"][aria-label="Delete task?"]') && data!.data.tasks.length === 1, 'destructive action still requires confirmation before deleting');
  await tap(Array.from(document.querySelectorAll('button')).find(el => el.textContent === 'Keep')!);
  ok(data!.data.tasks.length === 1, 'Keep preserves the task');
  await choose('Delete');
  await tap(Array.from(document.querySelectorAll('button')).find(el => el.textContent === 'Delete')!);
  ok(data!.data.tasks.length === 0, 'confirmed Delete uses the existing delete action');
  // Re-seed a row, then prove route dismissal without a provider reload.
  localStorage.setItem('pace.db.v1', JSON.stringify(seeded));
  await act(async () => { root.unmount(); });
  const fresh = createRoot(document.getElementById('root')!);
  await act(async () => { fresh.render(React.createElement(App)); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  await open();
  pathname = '/projects';
  await act(async () => { fresh.render(React.createElement(App)); });
  ok(panel() === null, 'a route change removes the portal even when a row component is reused');
  await act(async () => { fresh.unmount(); });
  ok(panel() === null, 'unmount leaves no orphan portal');

  // Every presentation consumes the same row; none needs a reduced mobile menu.
  const list = readFileSync('components/tasks/task-list.tsx', 'utf8');
  assert.ok(list.includes('<TaskRow'));
  for (const file of ['tasks/tasks-screen.tsx', 'today/today-screen.tsx', 'projects/projects-screen.tsx', 'projects/project-milestones.tsx', 'goals/goals-screen.tsx', 'calendar/calendar-screen.tsx', 'review/daily-review.tsx', 'review/monthly-review.tsx']) {
    const source = readFileSync(`components/${file}`, 'utf8');
    assert.ok(/TaskRow|TaskList|TaskSection|ProjectMilestoneSections/.test(source), file);
  }
  ok(true, 'Tasks, Today, Projects/milestones, Goals, Calendar and Review all reuse the covered row');
  const css = readFileSync('app/globals.css', 'utf8');
  assert.ok(css.includes('@media (hover: hover) and (pointer: fine) and (min-width: 640px)'));
  assert.ok(css.includes('.group:hover .task-actions-trigger'));
  assert.ok(css.includes('.menu-touch .menu-item'));
  ok(true, 'desktop retains hover reveal; small/touch screens get visible triggers and 44px items');

  // Geometry is deterministic and independent of jsdom's missing layout engine.
  const viewport = { left: 0, top: 0, width: 320, height: 568 };
  const size = { width: 224, height: 540 };
  for (const top of [0, 8, 80, 250, 500, 540]) {
    for (const left of [0, 8, 100, 280]) {
      const anchor = { left, right: left + 29, top, bottom: top + 29 };
      const p = positionMenu(anchor, size, viewport);
      assert.ok(p.left >= 8 && p.left + size.width <= 312);
      assert.ok(p.top >= 8 && p.top + p.maxHeight <= 560);
      assert.ok(p.maxHeight > 0 && p.maxHeight <= 552);
    }
  }
  ok(true, '24 edge placements stay inside a 320px viewport with a scrollable height cap');
  assert.equal(positionMenu({ left: 80, right: 109, top: 40, bottom: 69 }, { width: 208, height: 200 }, viewport).placement, 'below');
  assert.equal(positionMenu({ left: 80, right: 109, top: 450, bottom: 479 }, { width: 208, height: 200 }, viewport).placement, 'above');
  const zoomed = positionMenu({ left: 140, right: 169, top: 180, bottom: 209 }, size, { left: 30, top: 50, width: 320, height: 400 });
  assert.ok(zoomed.left >= 38 && zoomed.left + size.width <= 342 && zoomed.top >= 58 && zoomed.top + zoomed.maxHeight <= 442);
  ok(true, 'flips above near the bottom and honors visual-viewport offsets after zoom/keyboard resizing');

  console.log(`\n${checks} task-menu regression checks passed.`);
}

main().catch(error => { console.error(error); dom.window.close(); process.exit(1); });
