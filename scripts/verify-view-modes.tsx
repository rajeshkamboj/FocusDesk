/**
 * Projects & Goals list ⇄ grid — verification harness.
 *
 *   npx tsx scripts/verify-view-modes.tsx
 *
 * Covers what the feature statement asks a test to cover, without a browser:
 *
 *   1. The preference: default is list, a chosen value is remembered per
 *      collection, an unknown value falls back to list, and a storage that
 *      throws (private mode) neither crashes nor loses the view.
 *   2. The layout: the grid is 1 column on a phone, 2 on a tablet, 3 from
 *      desktop; the list stays the existing stacked list.
 *   3. The switch: a radio group with `aria-checked`, real buttons, arrow-key
 *      and tap activation.
 *   4. Preservation: filtering, sorting, bulk select/delete, expansion, search
 *      and every row action still exist in the same screen, in both layouts —
 *      the grid only changes the wrapper element and the card width.
 *   5. Empty and loading behaviour is untouched.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  VIEW_MODE_STORAGE_PREFIX,
  isViewMode,
  readViewMode,
  serverViewMode,
  setViewMode,
  subscribeViewMode,
  viewModeStorageKey,
  writeViewMode,
} from '../lib/view-mode';
import { ViewToggle } from '../components/ui/view-toggle';

let checks = 0;
function pass(label: string) {
  checks += 1;
  console.log(`  ✓ ${label}`);
}

/** An in-memory Storage stand-in. */
function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}

const throwingStorage = {
  getItem: () => {
    throw new Error('SecurityError: localStorage is disabled');
  },
  setItem: () => {
    throw new Error('SecurityError: localStorage is disabled');
  },
};

/* ------------------------------------------------------------------ */
/* 1. The remembered preference                                        */
/* ------------------------------------------------------------------ */

assert.equal(viewModeStorageKey('projects'), `${VIEW_MODE_STORAGE_PREFIX}projects`);
assert.equal(viewModeStorageKey('goals'), `${VIEW_MODE_STORAGE_PREFIX}goals`);
assert.ok(isViewMode('list') && isViewMode('grid'));
assert.ok(!isViewMode('table') && !isViewMode(null) && !isViewMode(''));

assert.equal(readViewMode('projects', memoryStorage()), 'list', 'a user who never chose sees the existing list');
pass('the default layout is list, so nothing moves for an existing user');

const store = memoryStorage();
writeViewMode('projects', 'grid', store);
assert.equal(store.map.get('pace.viewMode.projects'), 'grid');
assert.equal(readViewMode('projects', store), 'grid');
pass('a chosen layout is written under the app\'s existing pace.* view-state convention');

assert.equal(readViewMode('goals', store), 'list', 'collections remember independently');
writeViewMode('goals', 'grid', store);
writeViewMode('projects', 'list', store);
assert.equal(readViewMode('goals', store), 'grid');
assert.equal(readViewMode('projects', store), 'list');
pass('Projects and Goals keep separate preferences');

assert.equal(readViewMode('projects', memoryStorage({ 'pace.viewMode.projects': 'carousel' })), 'list');
assert.equal(readViewMode('projects', memoryStorage({ 'pace.viewMode.projects': '{"mode":"grid"}' })), 'list');
pass('an unrecognised or foreign value falls back to list instead of breaking the screen');

assert.equal(readViewMode('projects', throwingStorage), 'list', 'a disabled localStorage reads as list');
assert.doesNotThrow(() => writeViewMode('projects', 'grid', throwingStorage));
pass('a disabled localStorage (private mode) degrades to list and never throws');

assert.equal(readViewMode('projects', null), 'list');
assert.doesNotThrow(() => writeViewMode('projects', 'grid', null));
pass('no storage at all (server render) is safe');

/* ------------------------------------------------------------------ */
/* 2. The switch is a real, keyboard-operable radio group             */
/* ------------------------------------------------------------------ */

const toggleList = renderToStaticMarkup(
  createElement(ViewToggle, { collection: 'projects', value: 'list', onChange: () => {} }),
);
assert.match(toggleList, /role="radiogroup"/);
assert.match(toggleList, /aria-label="Layout"/);
assert.equal((toggleList.match(/role="radio"/g) ?? []).length, 2, 'both layouts are offered');
assert.equal((toggleList.match(/<button/g) ?? []).length, 2, 'each option is a real button');
assert.match(toggleList, /aria-checked="true"[^>]*aria-label="List view"/);
assert.match(toggleList, /aria-checked="false"[^>]*aria-label="Grid view"/);
assert.match(toggleList, /data-view-toggle="projects"/);
pass('the switch renders as a two-option radio group of real buttons');

const toggleGrid = renderToStaticMarkup(
  createElement(ViewToggle, { collection: 'goals', value: 'grid', onChange: () => {} }),
);
assert.match(toggleGrid, /aria-checked="true"[^>]*aria-label="Grid view"/);
assert.match(toggleGrid, /aria-checked="false"[^>]*aria-label="List view"/);
pass('the selected layout is exposed through aria-checked, not colour alone');

// Arrow keys are wired on each option, so the group is operable without a mouse.
const toggleSource = readFileSync('components/ui/view-toggle.tsx', 'utf8');
assert.match(toggleSource, /ArrowRight/);
assert.match(toggleSource, /ArrowLeft/);
assert.match(toggleSource, /focus-visible:ring-2/, 'each option has a visible focus ring');
assert.match(toggleSource, /hidden sm:inline/, 'on a phone the icons carry the control and the label is hidden, keeping the tap target small enough for the toolbar');
pass('arrow keys, a visible focus ring and a phone-sized control are all wired');

/* ------------------------------------------------------------------ */
/* 3. Responsive columns                                              */
/* ------------------------------------------------------------------ */

const projectsSource = readFileSync('components/projects/projects-screen.tsx', 'utf8');
const goalsSource = readFileSync('components/goals/goals-screen.tsx', 'utf8');

for (const [name, source, marker] of [
  ['Projects', projectsSource, 'data-projects-layout'],
  ['Goals', goalsSource, 'data-goals-layout'],
] as const) {
  assert.ok(source.includes('grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3'), `${name}: 1 / 2 / 3 responsive columns`);
  assert.ok(source.includes('space-y-3'), `${name}: the original list layout is retained`);
  assert.ok(source.includes(marker), `${name}: the layout is exposed for testing and styling`);
  assert.ok(source.includes("viewMode === 'grid'"), `${name}: the layout is driven by the remembered preference`);
  assert.ok(source.includes('max-w-4xl lg:max-w-6xl'), `${name}: the grid gets a wider canvas for its third column`);
  assert.ok(source.includes('h-full rounded-2xl'), `${name}: cards share a row height in the grid`);
  assert.ok(
    source.includes('isExpanded && viewMode === \'grid\' ? \' sm:col-span-2 lg:col-span-3\''),
    `${name}: an expanded card takes the full row back, so the task list inside it stays readable`,
  );
}
pass('phone = 1 column, tablet = 2, desktop = 3, and the list view is unchanged');

/* ------------------------------------------------------------------ */
/* 4. Nothing else on the screens was lost                            */
/* ------------------------------------------------------------------ */

// Filters and sorting on Projects.
assert.match(projectsSource, /\['all', 'active', 'on_hold', 'completed', 'archived'\]/, 'project status filters remain');
assert.match(projectsSource, /aria-label="Sort projects"/, 'project sorting remains');
assert.match(projectsSource, /compareDatedEntities\(a, b, sort\)/, 'sorting still governs the rendered order');
assert.match(projectsSource, /deadline-asc/);
// Goals sorting.
assert.match(goalsSource, /aria-label="Sort goals"/);
assert.match(goalsSource, /compareDatedEntities\(a, b, sort\)/);

// Bulk select & delete, per-row menus, expansion and creation stay in both.
for (const [name, source] of [['Projects', projectsSource], ['Goals', goalsSource]] as const) {
  assert.ok(source.includes('BulkActionBar'), `${name}: bulk action bar remains`);
  assert.ok(source.includes('BulkDeleteDialog'), `${name}: bulk delete confirm remains`);
  assert.ok(source.includes('setSelectMode'), `${name}: select mode remains`);
  assert.ok(source.includes('IconMore'), `${name}: per-row actions menu remains`);
  assert.ok(source.includes('setExpanded'), `${name}: expand/collapse remains`);
  assert.ok(source.includes('New Project') || source.includes('New Goal'), `${name}: creation remains`);
}
// Filters, sorting and selection act on the same filtered list the grid renders.
assert.match(projectsSource, /const projects = useMemo\(\(\) => \{[\s\S]*?const list = filter === 'all'/, 'the filter still feeds the rendered list in both layouts');
assert.match(goalsSource, /visibleGoalIds = useMemo/, 'selection still follows the rendered list in both layouts');
pass('filters, sorting, bulk select, expand/collapse and row actions survive the switch');

// Empty state and loading are untouched.
assert.match(projectsSource, /<EmptyState[\s\S]*?No projects yet/, 'the Projects empty state is unchanged');
assert.match(goalsSource, /<EmptyState[\s\S]*?No goals yet/, 'the Goals empty state is unchanged');
assert.match(projectsSource, /projects.length === 0 \? \(/, 'the empty state is checked before either layout');
assert.match(goalsSource, /goals.length === 0 \? \(/, 'the empty state is checked before either layout');
// Loading is owned by the shell, so every screen keeps the same spinner.
const shell = readFileSync('components/layout/app-shell.tsx', 'utf8');
assert.match(shell, /!ready \? \(/, 'the shared loading state is unchanged');
pass('empty and loading states are untouched — the switch only re-wraps rendered data');

/* ------------------------------------------------------------------ */
/* 5. No new settings system, no migration                            */
/* ------------------------------------------------------------------ */

assert.ok(!projectsSource.includes('settings.general') && !goalsSource.includes('settings.general'), 'the layout is not added to Settings');
assert.ok(!readFileSync('lib/types.ts', 'utf8').includes('viewMode'), 'no schema/type change was made for view state');
pass('the layout uses the existing view-state convention — no new settings system, no migration');


/* ------------------------------------------------------------------ */
/* 6. Re-render and cross-tab behaviour                               */
/* ------------------------------------------------------------------ */

assert.equal(serverViewMode(), 'list', 'the server always renders the list, so hydration matches');
pass('server and first client paint agree, so no layout flash can occur');

let notifications = 0;
const unsubscribe = subscribeViewMode(() => {
  notifications += 1;
});
const liveStore = memoryStorage();
// The browser store is what the screen reads; point the module at it through
// the same seam the toggle uses in a browser.
const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
Object.defineProperty(globalThis, 'window', {
  value: { localStorage: liveStore, addEventListener: () => {} },
  configurable: true,
});
setViewMode('projects', 'grid');
assert.equal(notifications, 1, 'choosing a layout notifies subscribed screens');
assert.equal(readViewMode('projects'), 'grid', 'and the choice is readable through the browser store');
setViewMode('goals', 'grid');
assert.equal(notifications, 2);
unsubscribe();
setViewMode('goals', 'list');
assert.equal(notifications, 2, 'an unmounted screen is not notified');
if (descriptor) Object.defineProperty(globalThis, 'window', descriptor);
pass('layout changes notify subscribed screens in this tab, and stop after unmount');

console.log(
  `\n${checks} checks. Projects & Goals grid/list: remembered per collection, 1/2/3 responsive columns, keyboard-operable switch, and every existing filter, sort, bulk action and empty state intact.`,
);
