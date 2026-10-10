'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useData } from '@/components/data/data-provider';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/form';
import { IconPlus, IconTasks } from '@/components/ui/icons';
import { Tabs } from '@/components/ui/tabs';
import { PageHeader } from '@/components/layout/page-header';
import { BulkActionBar, BulkDeleteDialog, SelectionCheckbox, pluralCount, useBulkSelection } from '@/components/ui/bulk-select';
import { isTimerRunning } from '@/lib/timer';
import { TaskRow } from './task-row';
import { TaskFormModal } from './task-form-modal';
import { useLocalDate } from '@/lib/use-local-date';
import { todayISO, addDays, isoWeekKey } from '@/lib/dates';
import { compareTasks, dailyPriorityTimerTaskId } from '@/lib/selectors';
import type { TaskSort } from '@/lib/selectors';
import {
  CLEARED_TASK_FILTERS,
  TASK_FILTERS,
  conflictingTaskFilters,
  filterTasks,
  isListableTask,
  type TaskFilterContext,
  type TaskFilterId,
  type TaskFilterState,
} from '@/lib/task-filters';
import { TASK_FLASH_MS, TASK_FOCUS_PARAM, clearedFiltersMessage, findTaskRowElement } from '@/lib/task-focus';

type FilterId = TaskFilterId;

const FILTERS = TASK_FILTERS;

/**
 * A pending "show this task" request from `/tasks?focus=<id>` (see
 * lib/task-focus). `seq` makes every request distinct, so clicking the same
 * timer twice scrolls and flashes twice.
 */
interface FocusRequest {
  seq: number;
  /** The task to scroll to; null when the target could not be shown. */
  taskId: string | null;
  /** Toast for the user (filters cleared / task unavailable), if any. */
  message: string | null;
  /** Polite screen-reader announcement of the outcome. */
  announcement: string;
}

/** How many animation frames to wait for a target row before giving up. */
const MAX_LOCATE_FRAMES = 30;

/** Remove the one-shot focus parameter without a navigation or a reload. */
function stripFocusParam() {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(TASK_FOCUS_PARAM)) return;
    url.searchParams.delete(TASK_FOCUS_PARAM);
    // Next's router observes replaceState and syncs useSearchParams; this is
    // the documented way to edit the URL in place (no navigation, no unload).
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  } catch {
    /* URL unavailable — the request is still handled, only the URL keeps the param */
  }
}

export function TasksScreen() {
  const { ready, data, actions, notify } = useData();
  const [filter, setFilter] = useState<FilterId>('all');
  const [projectFilter, setProjectFilter] = useState('');
  const [goalFilter, setGoalFilter] = useState('');
  const [query, setQuery] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [sort, setSort] = useState<TaskSort>('deadline-asc');
  // Bulk select & delete (Phase 6). Selection is this screen's view state —
  // never persisted, cleared when the delete succeeds, kept when it fails so
  // the user can retry exactly what they had picked.
  const [selectMode, setSelectMode] = useState(false);
  const selection = useBulkSelection();
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const today = useLocalDate(todayISO());
  const tomorrow = addDays(today, 1);

  // Today's priority already has its own card. Older priority timer Tasks are
  // left visible here so an unfinished session can still be resumed later.
  const filterContext = useMemo<TaskFilterContext>(
    () => ({
      today,
      projects: data.projects,
      hiddenTaskIds: new Set(
        data.dailyPriorities.filter((p) => p.date === today).map((p) => dailyPriorityTimerTaskId(p.id)),
      ),
    }),
    [data.dailyPriorities, data.projects, today],
  );

  const filtered = useMemo(
    () => filterTasks(data.tasks, { filter, projectFilter, goalFilter, query }, filterContext),
    [data.tasks, filter, projectFilter, goalFilter, query, filterContext],
  );

  /* ---- Navigation to one task: /tasks?focus=<id> (Active Timer Dock) ---- */

  // Pure view navigation: nothing below reads or writes a timer field. The
  // request is consumed while rendering (React's "adjust state when an input
  // changes" pattern), so the cleared filters and the request land in the very
  // same commit — the target row is in the DOM when the effect below runs.
  const searchParams = useSearchParams();
  const focusParam = searchParams?.get(TASK_FOCUS_PARAM) ?? null;
  const [seenFocusParam, setSeenFocusParam] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const [flash, setFlash] = useState<{ taskId: string; seq: number } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const handledSeqRef = useRef(0);

  // Wait for data before resolving, so a slow load never reads as "not found".
  if (ready && focusParam !== seenFocusParam) {
    setSeenFocusParam(focusParam);
    if (focusParam !== null) {
      const seq = (focusRequest?.seq ?? 0) + 1;
      const target = data.tasks.find((t) => t.id === focusParam);
      if (!target || !isListableTask(target, filterContext)) {
        const unavailable = 'That task is no longer in your task list';
        setFocusRequest({ seq, taskId: null, message: unavailable, announcement: `${unavailable}.` });
      } else {
        const current: TaskFilterState = { filter, projectFilter, goalFilter, query };
        // Clear only what hides the target; sort, selection, select mode and
        // every non-conflicting filter are left exactly as they were.
        const conflicts = conflictingTaskFilters(target, current, filterContext);
        if (conflicts.includes('filter')) setFilter(CLEARED_TASK_FILTERS.filter);
        if (conflicts.includes('projectFilter')) setProjectFilter(CLEARED_TASK_FILTERS.projectFilter);
        if (conflicts.includes('goalFilter')) setGoalFilter(CLEARED_TASK_FILTERS.goalFilter);
        if (conflicts.includes('query')) setQuery(CLEARED_TASK_FILTERS.query);
        const message = clearedFiltersMessage(conflicts, current);
        setFocusRequest({
          seq,
          taskId: target.id,
          message,
          announcement: `Showing task “${target.title}”.${message ? ` ${message}.` : ''}`,
        });
      }
    }
  }

  useEffect(() => {
    if (!focusRequest) return;
    // One-shot side effects, guarded so a StrictMode effect replay can't
    // toast twice. Stripping the param makes a reload/Back not replay the
    // flash, and lets the same timer be clicked again.
    if (handledSeqRef.current !== focusRequest.seq) {
      handledSeqRef.current = focusRequest.seq;
      stripFocusParam();
      if (focusRequest.message) notify(focusRequest.message);
    }
    const taskId = focusRequest.taskId;
    if (!taskId) return;

    // The row is normally already in the DOM (same commit as the request).
    // If rendering is delayed, keep looking once per frame, for a bounded
    // number of frames — no fixed sleeps.
    let frame = 0;
    let attempts = 0;
    const locate = () => {
      const row = findTaskRowElement(listRef.current ?? document, taskId);
      if (row) {
        const reduceMotion =
          typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        row.scrollIntoView({ block: 'center', inline: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
        // Move focus for keyboard and screen-reader users without a second jump.
        row.focus({ preventScroll: true });
        setFlash({ taskId, seq: focusRequest.seq });
        return;
      }
      attempts += 1;
      if (attempts >= MAX_LOCATE_FRAMES) {
        notify('Could not find that task in the list');
        return;
      }
      frame = window.requestAnimationFrame(locate);
    };
    frame = window.requestAnimationFrame(locate);
    return () => window.cancelAnimationFrame(frame);
  }, [focusRequest, notify]);

  // The red flash removes itself after its animation.
  useEffect(() => {
    if (!flash) return;
    const id = window.setTimeout(() => setFlash(null), TASK_FLASH_MS);
    return () => window.clearTimeout(id);
  }, [flash]);

  const groups = useMemo(() => {
    const active = filtered.filter((task) => task.status !== 'completed').sort((a, b) => compareTasks(a, b, sort));
    const completed = filtered
      .filter((task) => task.status === 'completed')
      .sort((a, b) => {
        const completion = (b.completedAt ?? '').localeCompare(a.completedAt ?? '');
        return completion || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);
      });
    return [
      ...(active.length ? [{ key: 'active', label: 'Tasks', tasks: active }] : []),
      ...(completed.length ? [{ key: 'completed', label: 'Completed', tasks: completed }] : []),
    ];
  }, [filtered, sort]);

  const activeProjects = data.projects.filter((p) => p.status !== 'archived');
  const activeGoals = data.goals.filter((g) => g.status !== 'archived');

  /* ---- Bulk selection (Phase 6) ---- */

  // This screen has no pagination: everything matching the filters is on the
  // page, so "visible" is "matching" — select-all means exactly what the user
  // can see under the current filters, and never reaches past them.
  const visibleIds = useMemo(() => filtered.map((t) => t.id), [filtered]);
  const filtersActive = filter !== 'all' || projectFilter !== '' || goalFilter !== '' || query.trim() !== '';
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selection.has(id));
  const someVisibleSelected = visibleIds.some((id) => selection.has(id));
  const selectAllLabel = `${allVisibleSelected ? 'Deselect' : 'Select'} all ${pluralCount(visibleIds.length, 'task')}${
    filtersActive ? ' matching the current filters' : ' in view'
  }`;

  const selectedTasks = data.tasks.filter((t) => selection.has(t.id));
  const doomedSelected = new Set(selectedTasks.map((t) => t.id));
  const selectedSubtaskCount = data.subtasks.filter((s) => doomedSelected.has(s.parentTaskId)).length;
  const selectedSessionCount = data.timerSessions.filter((s) => s.taskId && doomedSelected.has(s.taskId)).length;
  const selectedRunningCount = selectedTasks.filter(isTimerRunning).length;

  // Escape leaves select mode (but never interrupts an open confirm dialog —
  // the modal owns Escape while it is up).
  useEffect(() => {
    if (!selectMode || bulkOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exitSelectMode();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectMode, bulkOpen]);

  function exitSelectMode() {
    setSelectMode(false);
    selection.clear();
  }

  const confirmBulkDelete = async () => {
    setBulkBusy(true);
    try {
      await actions.deleteTasks([...selection.ids]);
      selection.clear();
      setBulkOpen(false);
    } catch {
      // The provider re-read the lists and told the user what failed. The
      // selection and the dialog stay open: what survived is now visible and
      // retrying only ever touches what is genuinely still there.
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkDialogLines = [
    'This will permanently delete:',
    `• ${pluralCount(selectedTasks.length, 'task')}`,
    ...(selectedSubtaskCount > 0
      ? [`  – and ${pluralCount(selectedSubtaskCount, 'subtask')} that ${selectedSubtaskCount === 1 ? 'hangs' : 'hang'} off them`]
      : []),
    ...(selectedSessionCount > 0
      ? [`  – and ${pluralCount(selectedSessionCount, 'recorded focus session', 'recorded focus sessions')} on them`]
      : []),
    ...(selectedRunningCount > 0
      ? [`${selectedRunningCount} of the selected tasks ${selectedRunningCount === 1 ? 'has' : 'have'} a running timer — that timer stops and its unrecorded time is discarded.`]
      : []),
    'The tasks’ projects, project milestones and goals will NOT be deleted.',
    'This action cannot be undone.',
  ];

  return (
    <div className="mx-auto w-full max-w-4xl px-5 pb-10 pt-8 sm:px-8 sm:pb-16 sm:pt-10">
      <PageHeader
        title="Tasks"
        subtitle="Everything you have committed to — planned, in progress, waiting or done."
        actions={
          <>
            <Button
              variant={selectMode ? 'soft' : 'secondary'}
              aria-pressed={selectMode}
              onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
            >
              {selectMode ? 'Done' : 'Select'}
            </Button>
            <Button variant="primary" onClick={() => setAddOpen(true)}>
              <IconPlus width={16} height={16} />
              Add Task
            </Button>
          </>
        }
      />

      {/*
        Filters, in two stacked bands rather than one wrapping flex row.

        The old row put the seven-item segmented control and the three
        search/scope controls in the same `flex flex-wrap`. On a desktop the
        two groups always wrapped onto separate lines anyway, so the layout
        below looks the same there — but on a phone the row was the single
        worst source of horizontal page scroll: the segmented control is
        ~630px of min-content that a flex item will not shrink past, and the
        `w-44`/`w-40` controls were desktop widths with no mobile fallback.

        Now the segmented control scrolls inside itself (see Tabs), and the
        three controls go fluid: full-width search, then the two scope
        selects side by side, so a 320px screen still shows them on two tidy
        lines instead of three right-aligned stubs.
      */}
      <div className="mb-5 space-y-2.5">
        <Tabs items={FILTERS} active={filter} onChange={(id) => setFilter(id as FilterId)} />

        <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          {/* Width lives on the wrapper, never on the control: the control
              itself stays `w-full` so it simply fills whatever box it is
              given — fluid below `sm`, the original fixed width above it. */}
          <div className="min-w-0 sm:w-52">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tasks…"
              className="h-10"
            />
          </div>
          <div className="min-w-0 sm:w-56">
            <Select value={sort} onChange={(e) => setSort(e.target.value as TaskSort)} className="h-10" aria-label="Sort tasks">
              <option value="deadline-asc">Sort by · Deadline — Soonest first</option>
              <option value="deadline-desc">Sort by · Deadline — Latest first</option>
              <option value="scheduled-asc">Sort by · Scheduled Date — Earliest first</option>
              <option value="scheduled-desc">Sort by · Scheduled Date — Latest first</option>
              <option value="priority-asc">Sort by · Priority — High to Low</option>
              <option value="priority-desc">Sort by · Priority — Low to High</option>
              <option value="created-desc">Sort by · Created — Newest first</option>
              <option value="created-asc">Sort by · Created — Oldest first</option>
            </Select>
          </div>
          <div className="grid min-w-0 grid-cols-2 gap-2.5 sm:flex sm:items-center">
            <div className="min-w-0 sm:w-40">
              <Select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className="h-10">
                <option value="">All projects</option>
                {activeProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="min-w-0 sm:w-40">
              <Select value={goalFilter} onChange={(e) => setGoalFilter(e.target.value)} className="h-10">
                <option value="">All goals</option>
                {activeGoals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </div>
      </div>

      {filter === 'overdue' ? (
        <p className="mb-3 text-xs text-ink-3">Open tasks scheduled before today — independent of their deadlines. Someday tasks are excluded.</p>
      ) : filter === 'postponed' ? (
        <p className="mb-3 text-xs text-ink-3">Open tasks postponed at least three times. Someday tasks are excluded.</p>
      ) : null}

      {selectMode ? (
        <BulkActionBar>
          <SelectionCheckbox
            checked={allVisibleSelected}
            indeterminate={someVisibleSelected && !allVisibleSelected}
            onChange={() => selection.setAll(visibleIds, !allVisibleSelected)}
            label={selectAllLabel}
          />
          <span className="text-[13px] text-ink-2" aria-live="polite">
            {filtersActive ? `${pluralCount(visibleIds.length, 'task')} match the current filters · ` : `${pluralCount(visibleIds.length, 'task')} in view · `}
            {selection.count > 0 ? `${pluralCount(selection.count, 'task')} selected` : 'Nothing selected'}
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => selection.clear()} disabled={selection.count === 0}>
              Clear
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => setBulkOpen(true)}
              disabled={selection.count === 0}
              aria-label={`Delete ${pluralCount(selection.count, 'selected task')}`}
            >
              Delete selected{selection.count > 0 ? ` (${selection.count})` : ''}
            </Button>
          </span>
        </BulkActionBar>
      ) : null}

      {groups.length === 0 ? (
        <EmptyState
          icon={<IconTasks width={24} height={24} />}
          title="No tasks here"
          hint="Tasks you create will show up in this list. A title is all you need — dates, projects and deadlines are optional."
          action={
            <Button variant="primary" size="sm" onClick={() => setAddOpen(true)}>
              <IconPlus width={15} height={15} />
              Add Task
            </Button>
          }
        />
      ) : (
        <div ref={listRef} className="space-y-7">
          {groups.map((group) => (
            <section key={group.key}>
              <div className="mb-1 flex items-baseline justify-between px-1">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3">{group.label}</h2>
                <span className="text-[11px] tabular-nums text-ink-3">{group.tasks.length}</span>
              </div>
              <div className="space-y-0.5">
                {group.tasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    flashKey={flash?.taskId === task.id ? flash.seq : undefined}
                    selection={
                      selectMode
                        ? { selected: selection.has(task.id), onToggle: () => selection.toggle(task.id) }
                        : undefined
                    }
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <p className="mt-8 text-center text-[11px] text-ink-3 sm:mt-10">
        Week {isoWeekKey(today).split('-W')[1]} · {filtered.length} task{filtered.length === 1 ? '' : 's'} in view ·{' '}
        {data.tasks.filter((t) => t.scheduledDate === tomorrow && t.status !== 'completed').length} planned for tomorrow
      </p>

      <p className="sr-only" role="status" aria-live="polite">
        {focusRequest?.announcement ?? ''}
      </p>

      <TaskFormModal open={addOpen} onClose={() => setAddOpen(false)} />

      <BulkDeleteDialog
        open={bulkOpen}
        title={`Delete ${pluralCount(selectedTasks.length, 'task')}?`}
        lines={bulkDialogLines}
        confirmLabel={`Delete ${pluralCount(selectedTasks.length, 'task')}`}
        busy={bulkBusy}
        onConfirm={() => void confirmBulkDelete()}
        onCancel={() => setBulkOpen(false)}
      />
    </div>
  );
}
