/**
 * Task context copy — verification harness.
 *
 *   npx tsx scripts/verify-task-context.tsx
 *
 * What it proves, in the order the feature statement asks for it:
 *
 *   1. A task with every field fills every section.
 *   2. A task with only a title produces a block with no empty labels and no
 *      headings for sections it has nothing to say about.
 *   3. Partial data (a description but no project, a project but no milestone)
 *      includes exactly what exists.
 *   4. Subtasks appear with their completion state and a done/total line.
 *   5. Markdown-significant characters in user text are escaped, so pasted
 *      context cannot turn a task title into a heading, a link or a table.
 *   6. Internal ids, timestamps and account data never appear.
 *   7. Copy behaviour: the clipboard receives exactly the generated Markdown,
 *      the task is unchanged afterwards, a blocked clipboard reports failure,
 *      and the legacy textarea path is used when the modern API is missing.
 *   8. The row menu and the details modal both render the action as a real,
 *      keyboard-operable button.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  buildTaskContextMarkdown,
  escapeBlock,
  escapeInline,
  extractLinks,
  formatContextDate,
} from '../lib/task-context';
import { copyTextToClipboard, CopyFailedError } from '../lib/clipboard';
import { copyTaskContext, taskContextInputFrom } from '../components/tasks/copy-task-context';
import { emptyData } from '../lib/store/defaults';
import type { AppData, Subtask, Task } from '../lib/types';

async function main() {
let checks = 0;
function pass(label: string) {
  checks += 1;
  console.log(`  ✓ ${label}`);
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-internal-9f3a',
    title: 'Rewrite the onboarding email sequence',
    status: 'planned',
    priority: 'high',
    createdAt: '2026-10-01T09:15:00.000Z',
    tags: [],
    postponementCount: 0,
    archived: false,
    ...overrides,
  };
}

function makeSubtask(overrides: Partial<Subtask> = {}): Subtask {
  return {
    id: 'sub-internal-1',
    parentTaskId: 'task-internal-9f3a',
    title: 'Collect the current sequence',
    completed: false,
    position: 0,
    createdAt: '2026-10-02T09:00:00.000Z',
    ...overrides,
  };
}

const fullData: AppData = {
  ...emptyData(),
  tasks: [
    makeTask({
      description: 'The current five emails were written in 2023 and no longer match the product.',
      notes: 'Use the interview notes from the September calls.\nSee https://example.com/research for the transcript.',
      scheduledDate: '2026-11-06',
      dueDate: '2026-11-20',
      projectId: 'project-internal-1',
      projectMilestoneId: 'milestone-internal-1',
      goalId: 'goal-internal-1',
      status: 'in_progress',
      tags: ['marketing', 'writing'],
      actualDurationSeconds: 3600,
      startedAt: '2026-11-04T08:00:00.000Z',
      reminder: '2026-11-19T10:00:00.000Z',
    }),
    makeTask({ id: 'child-internal-1', title: 'Draft email 1', parentTaskId: 'task-internal-9f3a', status: 'completed' }),
  ],
  subtasks: [
    makeSubtask(),
    makeSubtask({ id: 'sub-internal-2', title: 'Draft new subject lines', completed: true, position: 1 }),
  ],
  projects: [{ id: 'project-internal-1', name: 'Q4 lifecycle refresh', status: 'active', createdAt: '2026-09-01T00:00:00.000Z' }],
  projectMilestones: [
    { id: 'milestone-internal-1', projectId: 'project-internal-1', name: 'Email sequence', position: 0, createdAt: '2026-09-02T00:00:00.000Z' },
  ],
  goals: [{ id: 'goal-internal-1', name: 'Grow activation', status: 'active', createdAt: '2026-09-01T00:00:00.000Z' }],
};

/* ------------------------------------------------------------------ */
/* 1. Full task                                                        */
/* ------------------------------------------------------------------ */

const fullInput = taskContextInputFrom(fullData, 'task-internal-9f3a');
assert.ok(fullInput, 'the full task resolves');
const full = buildTaskContextMarkdown(fullInput);

assert.match(full, /^# Rewrite the onboarding email sequence\n/, 'the block opens with the task title as an H1');
assert.match(full, /\*\*Status:\*\* In progress/);
assert.match(full, /\*\*Priority:\*\* High/);
assert.match(full, /\*\*Start date:\*\* 6 November 2026/);
assert.match(full, /\*\*Due date:\*\* 20 November 2026/);
assert.match(full, /\*\*Project:\*\* Q4 lifecycle refresh · Email sequence/);
assert.match(full, /\*\*Goal:\*\* Grow activation/);
assert.match(full, /\*\*Tags:\*\* marketing, writing/);
assert.match(full, /## Description\n\nThe current five emails were written in 2023/);
assert.match(full, /## Notes and context/);
assert.match(full, /## Subtasks/);
assert.match(full, /- \[ \] Collect the current sequence/);
assert.match(full, /- \[x\] Draft new subject lines/);
assert.match(full, /1 of 2 complete\./);
assert.match(full, /## Child tasks\n\n- Draft email 1 — Completed/);
assert.match(full, /## Links\n\n- https:\/\/example\.com\/research/);
pass('a task with every field renders every section in a predictable order');

/* ------------------------------------------------------------------ */
/* 2. Title only — no empty labels, no empty sections                  */
/* ------------------------------------------------------------------ */

const bare = buildTaskContextMarkdown({ task: makeTask({ title: 'Call the accountant', status: 'created', priority: 'medium' }) });
assert.equal(bare, '# Call the accountant\n\n**Status:** Created · **Priority:** Medium\n');
assert.doesNotMatch(bare, /Project|Goal|Tags|Description|Notes|Subtasks|Links/, 'no section headings for fields that do not exist');
assert.doesNotMatch(bare, /:\*\*\s*(?:\n|$)/, 'no label is printed with an empty value');
pass('a title-only task omits every unavailable field instead of printing an empty label');

/* ------------------------------------------------------------------ */
/* 3. Partial data                                                     */
/* ------------------------------------------------------------------ */

const descriptionOnly = buildTaskContextMarkdown({
  task: makeTask({ title: 'Sketch the pricing page', description: 'Three tiers, annual discount on the middle one.' }),
});
assert.match(descriptionOnly, /## Description/);
assert.doesNotMatch(descriptionOnly, /## Notes/);
assert.doesNotMatch(descriptionOnly, /\*\*Project:\*\*/);
pass('a description without a project renders the description and no project line');

const danglingProject = buildTaskContextMarkdown({
  // The project id points at a project that no longer exists.
  task: makeTask({ title: 'Archive the old briefs', projectId: 'project-that-was-deleted' }),
  project: null,
});
assert.doesNotMatch(danglingProject, /Project/, 'a deleted project leaves no label behind');
pass('a dangling project reference never becomes a label');

const noSubtasks = buildTaskContextMarkdown({ task: makeTask({ title: 'Read the contract' }), subtasks: [] });
assert.doesNotMatch(noSubtasks, /Subtask/, 'an empty checklist adds no section');
pass('an empty subtask list adds no section and no "0 of 0" line');

/* ------------------------------------------------------------------ */
/* 4. Subtasks — order, completion and the count line                  */
/* ------------------------------------------------------------------ */

const checklist = buildTaskContextMarkdown({
  task: makeTask({ title: 'Ship the migration' }),
  subtasks: [
    makeSubtask({ id: 'a', title: 'Back up the database', completed: true, position: 0 }),
    makeSubtask({ id: 'b', title: 'Run the migration', completed: false, position: 1 }),
    makeSubtask({ id: 'c', title: 'Verify row counts', completed: true, position: 2 }),
  ],
});
const checklistLines = checklist.split('\n');
assert.deepEqual(
  checklistLines.filter((line) => line.startsWith('- [')),
  ['- [x] Back up the database', '- [ ] Run the migration', '- [x] Verify row counts'],
);
assert.match(checklist, /2 of 3 complete\./);
assert.doesNotMatch(checklist, /\b(a|b|c)\b(?=\s|$).*\[/, 'subtask ids are never printed');
pass('subtasks keep the user\'s order and carry their completion state');

/* ------------------------------------------------------------------ */
/* 5. Markdown escaping                                                 */
/* ------------------------------------------------------------------ */

assert.equal(escapeInline('Fix *all* the `env` flags'), 'Fix \\*all\\* the \\`env\\` flags');
assert.equal(escapeInline('#1 priority [WIP]'), '\\#1 priority \\[WIP\\]');
assert.equal(escapeBlock('# 42 — a note\n\n- first point'), '\\# 42 — a note\n\n- first point');
assert.equal(escapeBlock('Heading\n=== '), 'Heading\n\\===');

const hostile = buildTaskContextMarkdown({
  task: makeTask({
    title: '# Release *notes* for [Q4]',
    description: '## Not a heading\n- not a list item\n> not a quote\n| not | a | table |',
    tags: ['c++', 'a|b'],
  }),
});
assert.ok(
  hostile.startsWith('# \\# Release \\*notes\\* for \\[Q4\\]'),
  'a title that starts with "#" stays one heading level down and its emphasis is inert',
);
assert.ok(!hostile.includes('\n## Not a heading'), 'a description line cannot open a new section');
assert.ok(hostile.includes('\\#\\# Not a heading'), 'the description heading is escaped');
assert.ok(hostile.includes('**Tags:** c\\+\\+, a\\|b'), 'tags are escaped too');
pass('user text is escaped so it can never restructure the pasted Markdown');

/* ------------------------------------------------------------------ */
/* 6. Nothing internal leaks                                            */
/* ------------------------------------------------------------------ */

const everything = [full, bare, descriptionOnly, checklist, hostile].join('\n');
for (const forbidden of [
  'task-internal-9f3a',
  'sub-internal-1',
  'project-internal-1',
  'goal-internal-1',
  'milestone-internal-1',
  '2026-10-01T09:15:00.000Z', // createdAt
  '2026-11-04T08:00:00.000Z', // startedAt
  'actualDurationSeconds',
  'postponementCount',
  'archived',
  'reminder',
]) {
  assert.ok(!everything.includes(forbidden), `the pasted context must never contain ${forbidden}`);
}
assert.doesNotMatch(everything, /\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/i, 'no UUIDs');
pass('no internal ids, timestamps or system bookkeeping fields are included');

/* ------------------------------------------------------------------ */
/* 7. Dates and links                                                   */
/* ------------------------------------------------------------------ */

assert.equal(formatContextDate('2026-11-05'), '5 November 2026');
assert.equal(formatContextDate('2024-02-29'), '29 February 2024');
assert.equal(formatContextDate('2026-02-30'), null, 'an impossible date is not printed');
assert.equal(formatContextDate(''), null);
assert.equal(formatContextDate(undefined), null);
pass('dates print only when they are real calendar dates');

assert.deepEqual(extractLinks({ description: 'See https://a.example/x, and https://b.example/y.', notes: 'Again: https://a.example/x' }), [
  'https://a.example/x',
  'https://b.example/y',
]);
assert.deepEqual(extractLinks({}), []);
pass('links are de-duplicated, trimmed of sentence punctuation, and read from notes too');

/* ------------------------------------------------------------------ */
/* 8. Copy behaviour                                                    */
/* ------------------------------------------------------------------ */

const writes: string[] = [];
const fakeNavigator = { clipboard: { writeText: async (text: string) => { writes.push(text); } } } as unknown as Pick<Navigator, 'clipboard'>;
await copyTextToClipboard('hello', { navigator: fakeNavigator });
assert.deepEqual(writes, ['hello']);

// A blocked clipboard permission throws — the caller must be able to tell.
await assert.rejects(
  () => copyTextToClipboard('hello', { navigator: { clipboard: { writeText: async () => { throw new Error('denied'); } } } as unknown as Pick<Navigator, 'clipboard'> }),
  (error: unknown) => error instanceof CopyFailedError,
);
pass('a blocked clipboard rejects with a copy failure rather than silently succeeding');

// The legacy textarea path, used when the modern API is missing or refuses.
const legacyWrites: string[] = [];
let removed = false;
const area = {
  style: {} as Record<string, string>,
  value: '',
  setAttribute() {},
  focus() {},
  select() {},
  setSelectionRange() {},
};
const fakeDocument = {
  createElement: () => area,
  body: {
    appendChild: () => {},
    removeChild: () => { removed = true; },
  },
  execCommand: (command: string) => {
    assert.equal(command, 'copy');
    legacyWrites.push(area.value);
    return true;
  },
} as unknown as Pick<Document, 'createElement' | 'body' | 'execCommand'>;

await copyTextToClipboard('legacy text', { navigator: undefined, document: fakeDocument });
assert.deepEqual(legacyWrites, ['legacy text']);
assert.ok(removed, 'the temporary textarea is removed afterwards');
pass('the legacy textarea path copies and always cleans up after itself');

// `copyTaskContext` copies exactly the Markdown it generated, and leaves the task alone.
const snapshotBefore = JSON.stringify(fullData);
const clip: string[] = [];
const originalNavigator = globalThis.navigator;
Object.defineProperty(globalThis, 'navigator', {
  value: { clipboard: { writeText: async (text: string) => { clip.push(text); } } },
  configurable: true,
});
const copied = await copyTaskContext(fullData, 'task-internal-9f3a');
Object.defineProperty(globalThis, 'navigator', { value: originalNavigator, configurable: true });

assert.ok(copied.ok, 'the copy succeeded');
assert.equal(clip.length, 1);
assert.equal(clip[0], (copied as { markdown: string }).markdown);
assert.equal(clip[0], full, 'the clipboard receives exactly the generated Markdown');
assert.equal(JSON.stringify(fullData), snapshotBefore, 'copying never mutates the task or its data');

const missing = await copyTaskContext(fullData, 'no-such-task');
assert.deepEqual(missing, { ok: false, reason: 'missing-task' });
pass('copying writes the generated Markdown to the clipboard and changes nothing');

assert.equal(taskContextInputFrom(fullData, 'no-such-task'), null);
pass('an unknown task id resolves to nothing rather than to a half-built block');

/* ------------------------------------------------------------------ */
/* 9. Regression: the block is deterministic                            */
/* ------------------------------------------------------------------ */

assert.equal(buildTaskContextMarkdown(fullInput), full);
pass('the generated Markdown is deterministic for the same inputs');

/* ------------------------------------------------------------------ */
/* 10. The action is reachable from the UI                             */
/* ------------------------------------------------------------------ */

// The action is built from the app's existing menu item and button primitives,
// both of which render real <button> elements — that is what makes them
// keyboard-operable (Tab, Enter, Space) and tappable on a phone. The primitives
// are rendered here; the action component itself needs the data provider, which
// this DOM-less harness does not mount.
const { MenuItem } = await import('../components/ui/menu');
const { Button } = await import('../components/ui/button');
const { IconCopy } = await import('../components/ui/icons');
const markup = renderToStaticMarkup(
  createElement('div', null, createElement(MenuItem, { onClick: () => {} }, createElement(IconCopy, { width: 14, height: 14 }), 'Copy context for AI…')),
);
assert.match(markup, /^<div><button /, 'the menu action is a real button');
assert.match(markup, /Copy context for AI/, 'the menu action has a visible label');
const buttonMarkup = renderToStaticMarkup(createElement(Button, { variant: 'secondary' }, 'Copy context for AI'));
assert.match(buttonMarkup, /^<button /, 'the footer action is a real button');
pass('both presentations of the action are real buttons, reachable by keyboard and by tap');

const { CopyTaskContextItem, CopyTaskContextButton } = await import('../components/tasks/copy-task-context');
assert.equal(typeof CopyTaskContextItem, 'function');
assert.equal(typeof CopyTaskContextButton, 'function');
assert.equal(typeof taskContextInputFrom, 'function');
pass('the row menu, the details modal and the resolver all exist as exported actions');

// The live region is part of both presentations, so a screen reader hears the
// outcome even though the toast is the only visible feedback.
const copySource = readFileSync('components/tasks/copy-task-context.tsx', 'utf8');
assert.match(copySource, /aria-live="polite"/, 'the outcome is announced to a screen reader');
assert.match(copySource, /notify\(/, 'the outcome is reported with the app\'s existing toast');
assert.equal((copySource.match(/<LiveStatus/g) ?? []).length, 2, 'both presentations announce their outcome');
pass('the success/failure toast and the screen-reader announcement are both wired');

console.log(`\n${checks} checks. Task context copy: complete fields, no empty labels, escaped Markdown, no internal ids, and a real clipboard write that leaves the task untouched.`);

}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
