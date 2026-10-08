/**
 * Phase 7 Lite verification suite: Edit Historical Task Completion Date.
 * Run with: npx tsx scripts/verify-phase7-completion-date.tsx
 *
 * Verifies:
 * 1. Normal checkbox completion still records current timestamp.
 * 2. Normal checkbox still requires no additional UI interaction (no dialog, no confirmation).
 * 3. Completed task edit shows completion timestamp ("Completed on").
 * 4. User can change completion timestamp to an earlier date/time.
 * 5. Saved task contains the new timestamp.
 * 6. Future completion timestamps are rejected.
 * 7. Other important task fields remain unchanged.
 * 8. Timer/focused-time data remains unchanged.
 * 9. Reopen behavior remains unchanged.
 * 10. Non-completed task edit does NOT expose the completion date field.
 */

import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' });
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
g.localStorage = dom.window.localStorage;
g.IS_REACT_ACT_ENVIRONMENT = true;

async function main() {
  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { act } = React;
  const { AuthProvider } = await import('../components/auth/auth-provider');
  const { DataProvider, useData } = await import('../components/data/data-provider');
  const { TaskRow } = await import('../components/tasks/task-row');
  const { TaskFormModal } = await import('../components/tasks/task-form-modal');
  const type_Task = await import('../lib/types');
  type Task = import('../lib/types').Task;

  let ctx: ReturnType<typeof useData> | null = null;
  const Probe = () => {
    ctx = useData();
    return null;
  };

  const ok = (cond: boolean, msg: string) => {
    if (!cond) {
      console.error('FAIL:', msg);
      process.exit(1);
    }
    console.log('✓', msg);
  };

  const wait = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

  const mountModal = async (props: {
    open: boolean;
    onClose: () => void;
    task?: Task;
  }) => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    await act(async () => {
      root.render(
        React.createElement(
          AuthProvider,
          null,
          React.createElement(
            DataProvider,
            null,
            React.createElement(React.Fragment, null,
              React.createElement(Probe),
              React.createElement(TaskFormModal, props),
            ),
          ),
        ),
      );
    });
    await wait(20);
    return { root, el };
  };

  const mountRow = async (task: Task) => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    await act(async () => {
      root.render(
        React.createElement(
          AuthProvider,
          null,
          React.createElement(
            DataProvider,
            null,
            React.createElement(React.Fragment, null,
              React.createElement(Probe),
              React.createElement(TaskRow, { task }),
            ),
          ),
        ),
      );
    });
    await wait(20);
    return { root, el };
  };

  console.log('\n— 1 & 2. Normal checkbox completion —');
  // First test: DataProvider completeTask behavior & TaskRow checkbox click
  let initialRoot = await mountModal({ open: false, onClose: () => {} });
  const actions = ctx!.actions;

  // Create a new task
  await act(async () => {
    await actions.addTask({
      title: 'Task for normal completion',
      priority: 'high',
      estimatedDuration: 30,
    });
  });
  await wait(20);

  const task1 = ctx!.data.tasks.find((t) => t.title === 'Task for normal completion')!;
  ok(Boolean(task1), 'Task created');
  ok(task1.status === 'created', 'Task starts with status created');
  ok(task1.completedAt === undefined, 'Task initially has no completedAt');

  const beforeComplete = Date.now();
  await act(async () => {
    await actions.completeTask(task1.id);
  });
  await wait(20);
  const afterComplete = Date.now();

  const completedTask1 = ctx!.data.tasks.find((t) => t.id === task1.id)!;
  ok(completedTask1.status === 'completed', 'Status transitioned to completed');
  ok(Boolean(completedTask1.completedAt), 'completedAt was set');
  const timestampMs = new Date(completedTask1.completedAt!).getTime();
  ok(timestampMs >= beforeComplete - 50 && timestampMs <= afterComplete + 50, '1. Normal completion records current timestamp immediately');

  // Mount TaskRow and click checkbox
  await act(async () => {
    await actions.addTask({
      title: 'Checkbox click task',
    });
  });
  await wait(20);
  const taskToClick = ctx!.data.tasks.find((t) => t.title === 'Checkbox click task')!;

  const { root: rowRoot, el: rowEl } = await mountRow(taskToClick);
  const checkbox = rowEl.querySelector('button[aria-label="Complete task"]') as HTMLButtonElement | null;
  ok(Boolean(checkbox), 'Checkbox is present in TaskRow');
  ok(rowEl.querySelectorAll('[role="dialog"]').length === 0, 'No dialog initially present');

  await act(async () => {
    checkbox!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  await wait(30);

  ok(rowEl.querySelectorAll('[role="dialog"]').length === 0, '2. Normal checkbox completion requires no dialog / no extra UI interaction');
  const clickedTask = ctx!.data.tasks.find((t) => t.id === taskToClick.id)!;
  ok(clickedTask.status === 'completed', 'Checkbox directly completed the task');
  ok(Boolean(clickedTask.completedAt), 'Checkbox set completedAt directly');

  await act(async () => { rowRoot.unmount(); });

  console.log('\n— 3. Completed task edit shows completion timestamp field —');
  // Edit an open task: should NOT show "Completed on"
  const { root: openModalRoot, el: openModalEl } = await mountModal({
    open: true,
    onClose: () => {},
    task: taskToClick && { ...taskToClick, status: 'created', completedAt: undefined },
  });
  const openLabels = Array.from(openModalEl.querySelectorAll('span')).map((s) => s.textContent);
  ok(!openLabels.includes('Completed on'), '10. Non-completed task does NOT show "Completed on" field');
  await act(async () => { openModalRoot.unmount(); });

  // Edit a completed task: SHOULD show "Completed on"
  const pastCompletionISO = new Date(Date.now() - 3600 * 1000 * 24).toISOString();
  await act(async () => {
    await actions.updateTask(completedTask1.id, {
      completedAt: pastCompletionISO,
      description: 'Original description',
      scheduledDate: '2026-10-05',
      dueDate: '2026-10-09',
      priority: 'high',
      actualDurationSeconds: 120,
    });
  });
  await wait(20);

  const completedTaskReady = ctx!.data.tasks.find((t) => t.id === completedTask1.id)!;

  let modalClosed = false;
  const { root: completedModalRoot, el: completedModalEl } = await mountModal({
    open: true,
    onClose: () => { modalClosed = true; },
    task: completedTaskReady,
  });

  const completedLabels = Array.from(completedModalEl.querySelectorAll('span')).map((s) => s.textContent);
  ok(completedLabels.includes('Completed on'), '3. Completed task edit shows completion timestamp ("Completed on")');

  const datetimeInputs = Array.from(completedModalEl.querySelectorAll('input[type="datetime-local"]')) as HTMLInputElement[];
  const completedInput = datetimeInputs[datetimeInputs.length - 1];
  ok(Boolean(completedInput), 'datetime-local input rendered for Completed on');

  console.log('\n— 4, 5, 7, 8. Edit completion timestamp to earlier date/time & field preservation —');
  // Set to 3 days ago: 2026-10-03T16:30
  const earlierDateValue = '2026-10-03T16:30';
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')?.set;
    if (setter) setter.call(completedInput, earlierDateValue);
    else completedInput!.value = earlierDateValue;
    completedInput!.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    completedInput!.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  });
  await wait(20);

  ok(completedInput!.value === earlierDateValue, '4. User can change completion timestamp to an earlier date/time');

  // Submit the form
  const saveBtn = Array.from(completedModalEl.querySelectorAll('button')).find((b) => b.textContent?.includes('Save changes'));
  ok(Boolean(saveBtn), 'Save changes button found');

  await act(async () => {
    saveBtn!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  await wait(50);

  const updatedTask = ctx!.data.tasks.find((t) => t.id === completedTask1.id)!;
  const expectedISO = new Date(earlierDateValue).toISOString();
  ok(updatedTask.completedAt === expectedISO, '5. Saved task contains the new historical timestamp');
  ok(updatedTask.title === 'Task for normal completion', '7. Title remains unchanged');
  ok(updatedTask.description === 'Original description', '7. Description remains unchanged');
  ok(updatedTask.scheduledDate === '2026-10-05', '7. Scheduled date remains unchanged');
  ok(updatedTask.dueDate === '2026-10-09', '7. Due date remains unchanged');
  ok(updatedTask.priority === 'high', '7. Priority remains unchanged');
  ok(updatedTask.actualDurationSeconds === 120, '8. Timer/focused-time data remains unchanged');

  await act(async () => { completedModalRoot.unmount(); });

  console.log('\n— 6. Future completion timestamps are rejected —');
  const futureDateValue = '2099-12-31T23:59';
  let errorNotified: string | null = null;
  // Monkey patch notify or check that task is NOT updated
  const originalCompletedAt = updatedTask.completedAt;

  const { root: futureModalRoot, el: futureModalEl } = await mountModal({
    open: true,
    onClose: () => {},
    task: updatedTask,
  });

  const futureDatetimeInputs = Array.from(futureModalEl.querySelectorAll('input[type="datetime-local"]')) as HTMLInputElement[];
  const futureInput = futureDatetimeInputs[futureDatetimeInputs.length - 1];
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')?.set;
    if (setter) setter.call(futureInput, futureDateValue);
    else futureInput!.value = futureDateValue;
    futureInput!.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    futureInput!.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  });
  await wait(20);

  const futureSaveBtn = Array.from(futureModalEl.querySelectorAll('button')).find((b) => b.textContent?.includes('Save changes'));
  await act(async () => {
    futureSaveBtn!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  await wait(50);

  const taskAfterFutureAttempt = ctx!.data.tasks.find((t) => t.id === completedTask1.id)!;
  ok(taskAfterFutureAttempt.completedAt === originalCompletedAt, '6. Future completion timestamp is rejected and task is not updated');

  await act(async () => { futureModalRoot.unmount(); });

  console.log('\n— 9. Reopening behavior remains unchanged —');
  // Reopen the completed task
  await act(async () => {
    await actions.reopenTask(taskAfterFutureAttempt.id);
  });
  await wait(20);

  const reopenedTask = ctx!.data.tasks.find((t) => t.id === completedTask1.id)!;
  ok(reopenedTask.status !== 'completed', '9. Reopen behavior transitions task out of completed');
  ok(reopenedTask.actualDurationSeconds === 120, '9. Reopened task preserves actualDurationSeconds');

  console.log('\nAll Phase 7 verification checks passed successfully!');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
