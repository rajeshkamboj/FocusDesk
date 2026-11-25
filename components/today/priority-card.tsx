'use client';

import { useMemo, useState } from 'react';
import { useData } from '@/components/data/data-provider';
import { useUI } from '@/components/ui/ui-provider';
import { Button } from '@/components/ui/button';
import { IconCheck, IconFlame, IconPencil, IconPlay } from '@/components/ui/icons';
import { formatFocusedTime, formatStopwatch, todayISO } from '@/lib/dates';
import { dailyPriorityTimerTaskId } from '@/lib/selectors';
import { elapsedActiveSeconds, isTimerPaused, isTimerRunning } from '@/lib/timer';
import { useNow } from '@/components/tasks/use-now';

const PRIORITY_INPUT_CLASS =
  'box-border h-12 w-full min-w-0 rounded-xl border border-line bg-surface px-4 leading-normal text-ink ' +
  'placeholder:text-ink-3 transition-colors hover:border-line-strong focus:border-accent focus:outline-none';

type TaskFilter = 'overdue' | 'today' | 'upcoming' | 'all';

export function PriorityCard() {
  const { data, actions, notify } = useData();
  const { startFocus } = useUI();
  const today = todayISO();
  const priorities = data.dailyPriorities.filter((p) => p.date === today);
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [filter, setFilter] = useState<TaskFilter>('overdue');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const linkedToday = new Set(priorities.map((p) => p.taskId).filter(Boolean));
  const availableTasks = data.tasks.filter((task) =>
    !task.archived && task.status !== 'completed' && task.status !== 'cancelled' && !linkedToday.has(task.id)
  );
  const visibleTasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return availableTasks.filter((task) => {
      const date = task.dueDate || task.scheduledDate;
      const overdue = Boolean(task.dueDate && task.dueDate < today);
      const dueToday = date === today;
      const upcoming = Boolean(date && date > today);
      const matchesFilter = filter === 'all' || (filter === 'overdue' ? overdue : filter === 'today' ? dueToday : upcoming);
      return matchesFilter && (!q || task.title.toLowerCase().includes(q));
    }).sort((a, b) => {
      const ad = a.dueDate || a.scheduledDate || '9999-12-31';
      const bd = b.dueDate || b.scheduledDate || '9999-12-31';
      return ad.localeCompare(bd) || a.title.localeCompare(b.title);
    });
  }, [availableTasks, filter, search, today]);
  const timerTasks = priorities.map((p) => data.tasks.find((t) => t.id === (p.taskId ?? dailyPriorityTimerTaskId(p.id)))).filter(Boolean);
  const anyRunning = timerTasks.some((t) => t && isTimerRunning(t));
  const now = useNow(anyRunning);

  const addManualPriority = (event: React.FormEvent) => {
    event.preventDefault();
    const title = draft.trim();
    if (!title) return;
    void actions.setDailyPriority(title).then(() => setDraft(''));
  };

  const addSelectedTasks = async () => {
    if (!selectedIds.length) return;
    try {
      await actions.addDailyPriorityTasks(selectedIds);
      setSelectedIds([]);
      setPickerOpen(false);
      setSearch('');
    } catch {
      notify('Could not add the selected tasks to Today’s Priority');
    }
  };

  const openPriorityFocus = async (priorityId: string, title: string) => {
    try {
      const task = await actions.startDailyPriorityTimer(priorityId);
      if (task) startFocus({ type: 'daily-priority', id: priorityId, timerTaskId: task.id, title: task.title || title });
    } catch (error) {
      console.error('Could not start the priority timer', error);
      notify('Could not start the priority timer — please try again');
    }
  };

  const filterButtons: { id: TaskFilter; label: string }[] = [
    { id: 'overdue', label: 'Overdue' },
    { id: 'today', label: 'Due Today' },
    { id: 'upcoming', label: 'Upcoming' },
    { id: 'all', label: 'All Tasks' },
  ];

  return (
    <div className="animate-rise-in h-full rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-8">
      <div className="flex items-center gap-2 text-accent">
        <IconFlame width={18} height={18} />
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em]">Today&apos;s priority</span>
        {priorities.length > 0 ? (
          <span className="ml-auto rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-semibold text-accent-ink">{priorities.filter((p) => p.taskId ? data.tasks.find((t) => t.id === p.taskId)?.status === 'completed' : p.completed).length}/{priorities.length} done</span>
        ) : null}
      </div>

      <h2 className="mt-3 text-balance text-xl font-semibold leading-snug tracking-tight text-ink sm:mt-4 sm:text-2xl">
        What matters most today?
      </h2>

      <form className="mt-4 flex flex-col gap-2 sm:mt-5 sm:flex-row sm:gap-2.5" onSubmit={addManualPriority}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Enter today's priority" className={`${PRIORITY_INPUT_CLASS} text-base sm:flex-1 sm:text-[15px]`} />
        <div className="flex shrink-0 items-stretch gap-0">
          <div className="relative">
            <Button type="button" variant="secondary" size="lg" onClick={() => setPickerOpen((v) => !v)} aria-label="Choose existing tasks" aria-expanded={pickerOpen}>
              <span className="text-base leading-none">⌄</span>
            </Button>
            {pickerOpen ? (
              <div className="absolute left-0 top-full z-50 mt-2 w-[min(88vw,390px)] rounded-xl border border-line bg-surface p-3 shadow-xl sm:left-auto sm:right-0">
                <div className="text-sm font-semibold text-ink">Add tasks to Today&apos;s Priority</div>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tasks…" className="mt-3 h-10 w-full rounded-lg border border-line bg-canvas px-3 text-sm text-ink outline-none focus:border-accent" />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {filterButtons.map((item) => (
                    <button key={item.id} type="button" onClick={() => setFilter(item.id)} className={`rounded-full px-2.5 py-1.5 text-[11px] font-medium ${filter === item.id ? 'bg-accent text-white' : 'bg-canvas text-ink-2 hover:bg-surface-hover'}`}>{item.label}</button>
                  ))}
                </div>
                <div className="mt-3 max-h-64 overflow-y-auto">
                  {visibleTasks.length ? visibleTasks.map((task) => (
                    <label key={task.id} className="flex cursor-pointer items-start gap-2.5 border-b border-line py-2.5 last:border-0">
                      <input type="checkbox" checked={selectedIds.includes(task.id)} onChange={(e) => setSelectedIds((ids) => e.target.checked ? [...ids, task.id] : ids.filter((id) => id !== task.id))} className="mt-0.5 accent-[var(--accent)]" />
                      <span className="min-w-0 flex-1 text-sm text-ink">{task.title}<span className="mt-0.5 block text-[11px] text-ink-3">{task.dueDate ? `Due ${task.dueDate}` : task.scheduledDate ? `Scheduled ${task.scheduledDate}` : 'No date'}</span></span>
                    </label>
                  )) : <p className="py-6 text-center text-xs text-ink-3">No matching tasks</p>}
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="text-xs text-ink-3">{selectedIds.length} selected</span>
                  <div className="flex gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={() => { setPickerOpen(false); setSelectedIds([]); }}>Cancel</Button>
                    <Button type="button" variant="primary" size="sm" disabled={!selectedIds.length} onClick={() => void addSelectedTasks()}>Add selected</Button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
          <Button type="submit" variant="primary" size="lg" disabled={!draft.trim()}>Set Priority</Button>
        </div>
      </form>

      {priorities.length > 0 ? (
        <div className="mt-5 space-y-3">
          {priorities.map((priority) => {
            const sourceTask = priority.taskId ? data.tasks.find((t) => t.id === priority.taskId) : undefined;
            const timerTask = sourceTask ?? data.tasks.find((t) => t.id === dailyPriorityTimerTaskId(priority.id));
            const completed = sourceTask ? sourceTask.status === 'completed' : priority.completed;
            const running = timerTask ? isTimerRunning(timerTask) : false;
            const paused = timerTask ? isTimerPaused(timerTask) : false;
            const elapsed = timerTask ? elapsedActiveSeconds(timerTask, now) : 0;
            const timerLabel = running ? `Working ${formatStopwatch(elapsed)}` : paused ? `Paused ${formatStopwatch(timerTask?.actualDurationSeconds ?? 0)}` : timerTask?.actualDurationSeconds !== undefined ? `Focused time: ${formatFocusedTime(timerTask.actualDurationSeconds)}` : null;
            const title = sourceTask?.title ?? priority.title;
            const editing = editingId === priority.id;
            return (
              <div key={priority.id} className="rounded-xl border border-line bg-canvas/40 p-3 sm:p-4">
                {editing ? (
                  <form onSubmit={(e) => { e.preventDefault(); const value = editDraft.trim(); if (!value) return; void actions.updateDailyPriority(priority.id, { title: value }).then(() => setEditingId(null)); }}>
                    <input value={editDraft} onChange={(e) => setEditDraft(e.target.value)} className={PRIORITY_INPUT_CLASS} autoFocus />
                    <div className="mt-2 flex gap-2"><Button type="submit" size="sm" variant="primary" disabled={!editDraft.trim()}>Save</Button><Button type="button" size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button></div>
                  </form>
                ) : (
                  <>
                    <div className="flex items-start gap-2">
                      <p className={`min-w-0 flex-1 text-base font-semibold leading-snug ${completed ? 'text-ink-2 line-through' : 'text-ink'}`}>{title}</p>
                      {completed ? <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-soft px-2 py-1 text-[10px] font-semibold text-accent-ink"><IconCheck width={11} height={11} /> Done</span> : null}
                    </div>
                    {priority.taskId ? <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-ink-3">Linked task</p> : null}
                    {timerLabel ? <p className="mt-1 text-[11px] font-medium tabular-nums text-ink-3">{timerLabel}</p> : null}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {!completed ? <>
                        <Button variant="primary" size="sm" onClick={() => void actions.toggleDailyPriority(priority.id)}><IconCheck width={14} height={14} /> Mark Complete</Button>
                        <Button variant="secondary" size="sm" onClick={() => void openPriorityFocus(priority.id, title)}><IconPlay width={14} height={14} />{running ? 'Open Focus Mode' : paused ? 'Resume' : 'Start'}</Button>
                      </> : <Button variant="secondary" size="sm" onClick={() => void actions.toggleDailyPriority(priority.id)}>Reopen</Button>}
                      {!priority.taskId ? <Button variant="ghost" size="sm" onClick={() => { setEditDraft(priority.title); setEditingId(priority.id); }}><IconPencil width={13} height={13} /> Edit</Button> : null}
                      <Button variant="ghost" size="sm" onClick={() => void actions.deleteDailyPriority(priority.id)}>Remove</Button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
