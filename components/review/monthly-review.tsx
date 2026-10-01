'use client';

import { useMemo, useState } from 'react';
import { useData } from '@/components/data/data-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm';
import { ProgressBar } from '@/components/ui/card';
import { Select } from '@/components/ui/form';
import { IconChevronLeft, IconChevronRight, IconPlus, IconTrash } from '@/components/ui/icons';
import { TaskRow } from '@/components/tasks/task-row';
import { formatFocusedTime, monthKey, monthName, todayISO } from '@/lib/dates';
import { monthlyPriorityProgress, monthlyReviewStats } from '@/lib/selectors';
import type { MonthlyPriority } from '@/lib/types';

/**
 * Monthly planning: priorities you choose, optionally linked to a goal or
 * project, with progress grounded in real completed work.
 */
export function MonthlyReview() {
  const { data, actions } = useData();
  const [anchor, setAnchor] = useState(todayISO());
  const [titleDraft, setTitleDraft] = useState('');
  const [linkKind, setLinkKind] = useState('');
  const [linkId, setLinkId] = useState('');
  const [deleting, setDeleting] = useState<MonthlyPriority | undefined>(undefined);

  const month = monthKey(anchor);
  const isCurrentMonth = month === monthKey(todayISO());
  const priorities = data.monthlyPriorities.filter((p) => p.month === month);
  const stats = useMemo(() => monthlyReviewStats(data, month), [data, month]);

  const shiftMonth = (delta: number) => {
    const d = new Date();
    const [y, m] = month.split('-').map(Number);
    d.setFullYear(y, m - 1 + delta, 1);
    setAnchor(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`);
  };

  return (
    <div className="space-y-6">
      {/* Month navigation */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => shiftMonth(-1)}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-line text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
          aria-label="Previous month"
        >
          <IconChevronLeft width={17} height={17} />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="text-[15px] font-semibold text-ink">
            {monthName(anchor)} {anchor.slice(0, 4)}
          </p>
          <p className="text-[12px] text-ink-3">{isCurrentMonth ? 'This month' : month}</p>
        </div>
        <button
          onClick={() => shiftMonth(1)}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-line text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
          aria-label="Next month"
        >
          <IconChevronRight width={17} height={17} />
        </button>
        {!isCurrentMonth ? (
          <Button variant="ghost" size="sm" onClick={() => setAnchor(todayISO())}>
            Today
          </Button>
        ) : null}
      </div>

      {/* Monthly priorities */}
      <section>
        <h2 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3">Monthly priorities</h2>

        {priorities.length > 0 ? (
          <div className="space-y-2">
            {priorities.map((priority) => {
              const prog = monthlyPriorityProgress(data, priority);
              const goal = priority.goalId ? data.goals.find((g) => g.id === priority.goalId) : undefined;
              const project = priority.projectId ? data.projects.find((p) => p.id === priority.projectId) : undefined;
              return (
                <div key={priority.id} className="group flex items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3">
                  <button
                    onClick={() => void actions.toggleMonthlyPriority(priority.id)}
                    aria-label={priority.completed ? 'Reopen priority' : 'Complete priority'}
                    className={`mt-0.5 flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full border transition-all duration-150 ${
                      priority.completed ? 'border-accent bg-accent text-white' : 'border-line-strong hover:border-accent hover:bg-accent-soft'
                    }`}
                  >
                    {priority.completed ? (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m5 12 5 5L20 7" />
                      </svg>
                    ) : null}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className={`text-[14px] leading-snug ${priority.completed ? 'text-ink-3 line-through' : 'text-ink'}`}>
                      {priority.title}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      {goal ? <Badge tone="muted">Goal · {goal.name}</Badge> : null}
                      {project ? <Badge tone="neutral">Project · {project.name}</Badge> : null}
                      {prog ? (
                        <div className="flex min-w-36 flex-1 items-center gap-2">
                          <ProgressBar done={prog.done} total={prog.total} className="max-w-32" />
                          <span className="text-[11px] tabular-nums text-ink-3">
                            {prog.done}/{prog.total}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <button
                    onClick={() => setDeleting(priority)}
                    aria-label="Remove priority"
                    className="rounded-lg p-1.5 text-ink-3 opacity-0 transition-all hover:bg-danger-soft hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <IconTrash width={15} height={15} />
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="px-1 text-[13px] text-ink-3">
            No priorities set for this month. Add what matters — priorities are yours to decide.
          </p>
        )}

        <form
          className="mt-3 space-y-2.5 rounded-2xl border border-line bg-surface p-4 shadow-card"
          onSubmit={(e) => {
            e.preventDefault();
            const title = titleDraft.trim();
            if (!title) return;
            void actions
              .addMonthlyPriority({
                month,
                title,
                goalId: linkKind === 'goal' && linkId ? linkId : undefined,
                projectId: linkKind === 'project' && linkId ? linkId : undefined,
              })
              .then(() => {
                setTitleDraft('');
                setLinkKind('');
                setLinkId('');
              });
          }}
        >
          <div className="flex gap-2">
            <input
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              placeholder="A priority for this month…"
              className="h-10 flex-1 rounded-xl border border-line bg-surface px-3.5 text-sm text-ink placeholder:text-ink-3 transition-colors hover:border-line-strong focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
            <Button type="submit" variant="primary" disabled={!titleDraft.trim()}>
              <IconPlus width={15} height={15} />
              Add
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11.5px] text-ink-3">Optionally connect to</span>
            <Select
              value={linkKind}
              onChange={(e) => {
                setLinkKind(e.target.value);
                setLinkId('');
              }}
              className="h-8 w-28 rounded-lg text-[12.5px]"
            >
              <option value="">Nothing</option>
              <option value="goal">A goal</option>
              <option value="project">A project</option>
            </Select>
            {linkKind ? (
              <Select value={linkId} onChange={(e) => setLinkId(e.target.value)} className="h-8 w-44 rounded-lg text-[12.5px]">
                <option value="">Choose…</option>
                {(linkKind === 'goal' ? data.goals : data.projects).map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </Select>
            ) : null}
          </div>
        </form>
      </section>

      {/* Month in review */}
      <section className="rounded-2xl border border-line bg-surface p-6 shadow-card">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-3">Month in review</h2>

        <div className={`mt-4 grid grid-cols-2 gap-3 ${stats.focusedSeconds > 0 ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
          <Stat label="Tasks completed" value={stats.completed.length} />
          <Stat label="Monthly priorities" value={`${stats.monthlyPriorities.filter((p) => p.priority.completed).length}/${stats.monthlyPriorities.length}`} />
          <Stat label="Projects moved" value={stats.projectProgress.length} />
          {stats.focusedSeconds > 0 ? <Stat label="Focused time" value={formatFocusedTime(stats.focusedSeconds)} /> : null}
        </div>

        {stats.projectProgress.length > 0 ? (
          <div className="mt-5">
            <p className="text-[13px] font-medium text-ink">Project progress</p>
            <div className="mt-2 space-y-2">
              {stats.projectProgress.map(({ project, progress }) => (
                <div key={project.id} className="flex items-center gap-3">
                  <span className="w-40 truncate text-[13px] text-ink-2">{project.name}</span>
                  <ProgressBar done={progress.done} total={progress.total} className="max-w-44" />
                  <span className="text-[11px] tabular-nums text-ink-3">
                    {progress.done}/{progress.total}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {stats.repeatedlyPostponed.length > 0 ? (
          <div className="mt-6">
            <p className="text-[13px] font-medium text-ink">Kept slipping</p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-ink-3">
              These tasks have been postponed several times. No judgment — would it help to reschedule, break them down,
              or let them go?
            </p>
            <div className="mt-2 space-y-0.5">
              {stats.repeatedlyPostponed.slice(0, 5).map((t) => (
                <TaskRow key={t.id} task={t} />
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <ConfirmDialog
        open={deleting !== undefined}
        title="Remove monthly priority?"
        message={`“${deleting?.title ?? ''}” will be removed from this month.`}
        confirmLabel="Remove"
        danger
        onCancel={() => setDeleting(undefined)}
        onConfirm={() => {
          if (deleting) void actions.deleteMonthlyPriority(deleting.id);
          setDeleting(undefined);
        }}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2/50 px-3.5 py-3">
      <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-ink-3">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-ink">{value}</p>
    </div>
  );
}
