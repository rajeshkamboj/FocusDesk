'use client';

import { useState } from 'react';
import { useData } from '@/components/data/data-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm';
import { DateModal } from '@/components/ui/date-modal';
import { Field, Textarea } from '@/components/ui/form';
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '@/components/ui/menu';
import { Modal } from '@/components/ui/modal';
import {
  IconArchive,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconClock,
  IconFlag,
  IconMore,
  IconPause,
  IconPencil,
  IconPlay,
  IconPlus,
  IconTrash,
} from '@/components/ui/icons';
import { addDays, formatCompletionTimestamp, formatDuration, formatFocusedTime, formatStopwatch, relativeDay, todayISO } from '@/lib/dates';
import { elapsedActiveSeconds, isTimerPaused, isTimerRunning } from '@/lib/timer';
import { subtasksForTask } from '@/lib/selectors';
import type { Task } from '@/lib/types';
import { TaskFormModal } from './task-form-modal';
import { TaskSubtasks } from './task-subtasks';
import { useNow } from './use-now';

function TaskCheckbox({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      onClick={onChange}
      aria-label={label}
      className={`mt-0.5 flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full border transition-all duration-150 ${
        checked
          ? 'border-accent bg-accent text-white'
          : 'border-line-strong bg-surface hover:border-accent hover:bg-accent-soft'
      }`}
    >
      {checked ? (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m5 12 5 5L20 7" />
        </svg>
      ) : null}
    </button>
  );
}

export function TaskRow({ task, showDate = true }: { task: Task; showDate?: boolean }) {
  const { data, actions } = useData();
  const [editOpen, setEditOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [deadlineOpen, setDeadlineOpen] = useState(false);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [timerBusy, setTimerBusy] = useState(false);
  // UI-only expansion state for task details and the separately collapsible checklist.
  const [expanded, setExpanded] = useState(false);
  const [subtasksOpen, setSubtasksOpen] = useState(false);
  const hasDescription = Boolean(task.description?.trim());

  const project = task.projectId ? data.projects.find((p) => p.id === task.projectId) : undefined;
  const done = task.status === 'completed';
  const cancelled = task.status === 'cancelled';
  const overdue = task.dueDate !== undefined && task.dueDate < todayISO() && !done && !cancelled;
  const completionLabel = formatCompletionTimestamp(task.completedAt);

  // Timer state — derived from persisted timestamps, never from a counter.
  const running = !done && !cancelled && isTimerRunning(task);
  const paused = !done && !cancelled && isTimerPaused(task);
  const now = useNow(running);
  const elapsedSeconds = elapsedActiveSeconds(task, now);
  const workingLabel = running
    ? `Working ${formatStopwatch(elapsedSeconds)}`
    : paused
      ? `Paused ${formatStopwatch(task.actualDurationSeconds ?? 0)}`
      : null;
  // Focused time — the timer's own value (the sum of every Start/Pause/Resume
  // segment), shown only when a session was actually recorded. Never invented.
  const focusedLabel = done ? formatFocusedTime(task.actualDurationSeconds) : '';
  const hasDetails = hasDescription || focusedLabel !== '';
  const subtasks = subtasksForTask(data.subtasks, task.id);
  const completedSubtasks = subtasks.filter((subtask) => subtask.completed).length;
  const subtasksToggleLabel = subtasksOpen
    ? subtasks.length > 0 ? `Collapse subtasks: ${completedSubtasks}/${subtasks.length} complete` : 'Collapse subtasks'
    : subtasks.length > 0 ? `Expand subtasks: ${completedSubtasks}/${subtasks.length} complete` : 'Add subtask';

  /**
   * Timers are independent: starting this one never stops, pauses or replaces
   * a timer running on any other task. Whatever else is running keeps running.
   */
  const startTimer = () => {
    void runTimerAction(() => actions.startTask(task.id));
  };

  /** Serialize timer actions so rapid clicks can't interleave. */
  const runTimerAction = (fn: () => Promise<void>) => {
    if (timerBusy) return;
    setTimerBusy(true);
    void fn().finally(() => setTimerBusy(false));
  };

  const dueLabel = (() => {
    if (!task.dueDate || cancelled) return null;
    if (done) return null; // completed-with-past-deadline reads as completed, not overdue
    const rel = relativeDay(task.dueDate);
    if (task.dueDate < todayISO()) return 'Overdue';
    if (task.dueDate === todayISO()) return 'Due today';
    if (rel === 'Tomorrow') return 'Due tomorrow';
    return `Due ${rel}`;
  })();

  const rowBg = done
    ? 'border-accent-soft/70 bg-accent-soft/40'
    : overdue
      ? 'border-danger-soft bg-danger-soft/30'
      : 'border-transparent hover:border-line hover:bg-surface';
  const titleColor = done ? 'text-ink-2' : cancelled ? 'text-ink-3 line-through' : 'text-ink';
  const titleWeight = done ? 'font-normal' : 'font-medium';

  /** Title, badges and meta line — the summary of the row, and the click target that toggles the description. */
  const taskSummary = (
    <>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={`text-[14px] leading-snug ${titleColor} ${titleWeight}`}>
          {task.title}
        </span>
        {hasDetails ? (
          <IconChevronRight
            width={12}
            height={12}
            aria-hidden="true"
            className={`shrink-0 text-ink-3 transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
          />
        ) : null}
        {task.status === 'in_progress' && !done && !paused ? <Badge tone="accent">In progress</Badge> : null}
        {paused ? <Badge tone="muted">Paused</Badge> : null}
        {task.status === 'someday' ? <Badge tone="muted">Someday</Badge> : null}
        {task.postponementCount >= 3 && !done && !cancelled ? (
          <Badge tone="warning">Postponed {task.postponementCount}×</Badge>
        ) : null}
      </div>

      {(showDate ||
        project ||
        task.estimatedDuration ||
        dueLabel ||
        completionLabel ||
        workingLabel !== null ||
        focusedLabel !== '' ||
        task.tags.length > 0) && (
        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] text-ink-3">
          {project ? <span className="font-medium text-ink-2">{project.name}</span> : null}
          {showDate && task.scheduledDate && !done ? <span>{relativeDay(task.scheduledDate)}</span> : null}
          {showDate && !task.scheduledDate && task.status !== 'someday' && !done ? <span>Unscheduled</span> : null}
          {workingLabel !== null ? (
            <span className={`font-medium tabular-nums ${running ? 'text-ink-2' : ''}`}>{workingLabel}</span>
          ) : null}
          {task.estimatedDuration && !done && !running && !paused ? (
            <span className="inline-flex items-center gap-1">
              <IconClock width={12} height={12} />
              {formatDuration(task.estimatedDuration)}
            </span>
          ) : null}
          {dueLabel ? (
            <span
              className={`inline-flex items-center gap-1 ${
                overdue ? 'font-medium text-danger' : dueLabel.includes('today') || dueLabel.includes('tomorrow') ? 'font-medium text-warning' : ''
              }`}
            >
              <IconFlag width={12} height={12} />
              {dueLabel}
            </span>
          ) : null}
          {done && completionLabel ? <span className="text-ink-3">{completionLabel}</span> : null}
          {focusedLabel ? (
            <span className="inline-flex items-center gap-1 tabular-nums" title="Focused time">
              <IconClock width={12} height={12} />
              {focusedLabel}
            </span>
          ) : null}
          {task.tags.map((t) => (
            <span key={t} className="rounded bg-surface-2 px-1.5 py-px">
              {t}
            </span>
          ))}
        </div>
      )}
    </>
  );

  return (
    <>
      <div className={`group flex items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors duration-150 ${rowBg}`}>
        <TaskCheckbox
          checked={done}
          label={done ? 'Reopen task' : 'Complete task'}
          onChange={() => void (done ? actions.reopenTask(task.id) : actions.completeTask(task.id))}
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-1.5">
            <div className="min-w-0 flex-1">
              {hasDetails ? (
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  aria-expanded={expanded}
                  className="w-full text-left"
                >
                  {taskSummary}
                </button>
              ) : (
                taskSummary
              )}

              {hasDetails && expanded ? (
                <div className="mt-1.5 space-y-1">
                  {hasDescription ? (
                    <p className="whitespace-pre-line break-words text-[12.5px] leading-relaxed text-ink-2">{task.description}</p>
                  ) : null}
                  {done ? (
                    <div className="space-y-0.5 text-[11.5px] text-ink-3">
                      {completionLabel ? <p>{completionLabel}</p> : null}
                      {focusedLabel ? (
                        <p className="tabular-nums">
                          Focused time: <span className="font-medium text-ink-2">{focusedLabel}</span>
                        </p>
                      ) : null}
                      {task.estimatedDuration ? <p className="tabular-nums">Estimated: {formatDuration(task.estimatedDuration)}</p> : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <button
              type="button"
              aria-label={subtasksToggleLabel}
              aria-expanded={subtasksOpen}
              title={subtasks.length > 0 ? `${completedSubtasks} of ${subtasks.length} subtasks completed` : 'Add subtask'}
              onClick={() => setSubtasksOpen((isOpen) => !isOpen)}
              className="mt-[-2px] inline-flex h-7 shrink-0 items-center gap-1 rounded-lg px-1.5 text-[11.5px] font-medium tabular-nums text-ink-3 transition-colors hover:bg-surface-2 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
            >
              {subtasks.length > 0 ? <span>{completedSubtasks}/{subtasks.length}</span> : null}
              {subtasks.length === 0 && !subtasksOpen ? <IconPlus width={15} height={15} /> : (
                <IconChevronDown width={13} height={13} className={`transition-transform ${subtasksOpen ? 'rotate-180' : ''}`} />
              )}
            </button>
          </div>

          {subtasksOpen ? (
            <TaskSubtasks
              parentTaskId={task.id}
              parentCompleted={done}
              subtasks={subtasks}
              autoFocusInput={subtasks.length === 0}
            />
          ) : null}
        </div>

        {!done && !cancelled ? (
          <div className="flex shrink-0 items-center gap-1.5">
            {running ? (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={timerBusy}
                  aria-label="Pause timer"
                  onClick={() => void runTimerAction(() => actions.pauseTask(task.id))}
                >
                  <IconPause width={13} height={13} />
                  <span className="hidden sm:inline">Pause</span>
                </Button>
                <Button
                  size="sm"
                  variant="soft"
                  disabled={timerBusy}
                  aria-label="Finish task"
                  onClick={() => void runTimerAction(() => actions.finishTask(task.id))}
                >
                  <IconCheck width={13} height={13} />
                  <span className="hidden sm:inline">Finish</span>
                </Button>
              </>
            ) : paused ? (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={timerBusy}
                  aria-label="Resume timer"
                  onClick={() => void runTimerAction(() => actions.resumeTask(task.id))}
                >
                  <IconPlay width={13} height={13} />
                  <span className="hidden sm:inline">Resume</span>
                </Button>
                <Button
                  size="sm"
                  variant="soft"
                  disabled={timerBusy}
                  aria-label="Finish task"
                  onClick={() => void runTimerAction(() => actions.finishTask(task.id))}
                >
                  <IconCheck width={13} height={13} />
                  <span className="hidden sm:inline">Finish</span>
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                disabled={timerBusy}
                aria-label="Start task"
                onClick={startTimer}
              >
                <IconPlay width={13} height={13} />
                <span className="hidden sm:inline">Start</span>
              </Button>
            )}
          </div>
        ) : null}

        <Menu
          trigger={({ toggle }) => (
            <button
              onClick={toggle}
              aria-label="Task actions"
              className="rounded-lg p-1.5 text-ink-3 opacity-0 transition-all hover:bg-surface-2 hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
            >
              <IconMore width={17} height={17} />
            </button>
          )}
        >
          {(close) => (
            <>
              {task.postponementCount >= 3 && !done && !cancelled ? (
                <div className="px-3.5 pb-2 pt-1.5 text-[11.5px] leading-relaxed text-ink-3">
                  This task has been postponed several times. What would you like to do?
                </div>
              ) : null}

              {!done && !cancelled ? (
                <>
                  {task.status !== 'in_progress' ? (
                    <MenuItem
                      onClick={() => {
                        void actions.startTask(task.id);
                        close();
                      }}
                    >
                      <IconPlay width={14} height={14} /> Start (in progress)
                    </MenuItem>
                  ) : null}
                  <MenuItem
                    onClick={() => {
                      void actions.completeTask(task.id);
                      close();
                    }}
                  >
                    Mark complete
                  </MenuItem>
                </>
              ) : (
                <MenuItem
                  onClick={() => {
                    void actions.reopenTask(task.id);
                    close();
                  }}
                >
                  Reopen
                </MenuItem>
              )}

              {!done && !cancelled ? (
                <>
                  <MenuSeparator />
                  <MenuLabel>Not now</MenuLabel>
                  <MenuItem
                    onClick={() => {
                      void actions.postponeTask(task.id, 'tomorrow');
                      close();
                    }}
                  >
                    Do tomorrow
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      setRescheduleOpen(true);
                      close();
                    }}
                  >
                    Reschedule…
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      void actions.postponeTask(task.id, 'someday');
                      close();
                    }}
                  >
                    Move to Someday
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      setDeadlineOpen(true);
                      close();
                    }}
                  >
                    {task.dueDate ? 'Change deadline…' : 'Set deadline…'}
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      setBreakdownOpen(true);
                      close();
                    }}
                  >
                    Break down…
                  </MenuItem>
                </>
              ) : null}

              <MenuSeparator />
              <MenuItem
                onClick={() => {
                  setEditOpen(true);
                  close();
                }}
              >
                <IconPencil width={14} height={14} /> Edit…
              </MenuItem>
              {!cancelled && !done ? (
                <MenuItem
                  onClick={() => {
                    void actions.cancelTask(task.id);
                    close();
                  }}
                >
                  <IconArchive width={14} height={14} /> Cancel task
                </MenuItem>
              ) : null}
              <MenuItem
                danger
                onClick={() => {
                  close();
                  if (data.settings.general.confirmTaskDeletion) setDeleteOpen(true);
                  else void actions.deleteTask(task.id);
                }}
              >
                <IconTrash width={14} height={14} /> Delete
              </MenuItem>
            </>
          )}
        </Menu>
      </div>

      <TaskFormModal open={editOpen} onClose={() => setEditOpen(false)} task={task} />

      <DateModal
        open={rescheduleOpen}
        title="Reschedule task"
        label="Work on it on"
        confirmLabel="Move task"
        clearable
        initialDate={task.scheduledDate}
        onClose={() => setRescheduleOpen(false)}
        onSubmit={(date) => {
          setRescheduleOpen(false);
          if (date) void actions.postponeTask(task.id, date);
          else void actions.moveTaskToDate(task.id, undefined);
        }}
      />

      <DateModal
        open={deadlineOpen}
        title="Set deadline"
        label="Must be completed by"
        confirmLabel="Save deadline"
        clearable={Boolean(task.dueDate)}
        initialDate={task.dueDate}
        onClose={() => setDeadlineOpen(false)}
        onSubmit={(date) => {
          setDeadlineOpen(false);
          void actions.setTaskDeadline(task.id, date);
        }}
      />

      <BreakDownModal open={breakdownOpen} onClose={() => setBreakdownOpen(false)} task={task} />

      <ConfirmDialog
        open={deleteOpen}
        title="Delete task?"
        message={`“${task.title}” will be permanently removed.`}
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => {
          setDeleteOpen(false);
          void actions.deleteTask(task.id);
        }}
      />
    </>
  );
}

/** Break a task into smaller tasks without losing the original. */
function BreakDownModal({ open, onClose, task }: { open: boolean; onClose: () => void; task: Task }) {
  const { actions } = useData();
  const [titles, setTitles] = useState('');
  const [date, setDate] = useState<'original' | 'today' | 'tomorrow' | 'none'>('original');

  const parts = titles
    .split('\n')
    .map((t) => t.trim())
    .filter(Boolean);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Break down task"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={parts.length === 0}
            onClick={() => {
              const target =
                date === 'today'
                  ? todayISO()
                  : date === 'tomorrow'
                    ? addDays(todayISO(), 1)
                    : date === 'none'
                      ? undefined
                      : task.scheduledDate;
              void actions.breakDownTask(task.id, parts, target).then(() => {
                setTitles('');
                onClose();
              });
            }}
          >
            Create {parts.length > 0 ? parts.length : ''} smaller task{parts.length === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-ink-2">
          Split <span className="font-medium text-ink">“{task.title}”</span> into smaller, concrete steps. The original
          task is kept — you stay in control.
        </p>
        <Field label="One smaller task per line">
          <Textarea
            value={titles}
            onChange={(e) => setTitles(e.target.value)}
            placeholder={'Gather requirements\nWrite the first draft'}
            className="min-h-28"
            autoFocus
          />
        </Field>
        <Field label="Schedule the smaller tasks for">
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['original', task.scheduledDate ? `Same as original (${relativeDay(task.scheduledDate)})` : 'Same as original'],
                ['today', 'Today'],
                ['tomorrow', 'Tomorrow'],
                ['none', 'Unscheduled'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setDate(value)}
                className={`rounded-xl border px-3 py-2 text-left text-[13px] transition-colors ${
                  date === value ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line text-ink-2 hover:border-line-strong'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </Field>
      </div>
    </Modal>
  );
}
