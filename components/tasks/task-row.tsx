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
  IconClock,
  IconFlag,
  IconMore,
  IconPencil,
  IconPlay,
  IconTrash,
} from '@/components/ui/icons';
import { addDays, formatDuration, relativeDay, todayISO } from '@/lib/dates';
import type { Task } from '@/lib/types';
import { TaskFormModal } from './task-form-modal';

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

  const project = task.projectId ? data.projects.find((p) => p.id === task.projectId) : undefined;
  const done = task.status === 'completed';
  const cancelled = task.status === 'cancelled';
  const overdue = task.dueDate !== undefined && task.dueDate < todayISO() && !done && !cancelled;

  const dueLabel = (() => {
    if (!task.dueDate || done || cancelled) return null;
    const rel = relativeDay(task.dueDate);
    if (task.dueDate < todayISO()) return 'Overdue';
    if (task.dueDate === todayISO()) return 'Due today';
    if (rel === 'Tomorrow') return 'Due tomorrow';
    return `Due ${rel}`;
  })();

  return (
    <>
      <div className="group flex items-start gap-3 rounded-xl border border-transparent px-3 py-2.5 transition-colors duration-150 hover:border-line hover:bg-surface">
        <TaskCheckbox
          checked={done}
          label={done ? 'Reopen task' : 'Complete task'}
          onChange={() => void (done ? actions.reopenTask(task.id) : actions.completeTask(task.id))}
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span
              className={`text-[14px] leading-snug ${
                done || cancelled ? 'text-ink-3 line-through' : 'text-ink'
              }`}
            >
              {task.title}
            </span>
            {task.status === 'in_progress' ? <Badge tone="accent">In progress</Badge> : null}
            {task.status === 'someday' ? <Badge tone="muted">Someday</Badge> : null}
            {task.postponementCount >= 3 && !done && !cancelled ? (
              <Badge tone="warning">Postponed {task.postponementCount}×</Badge>
            ) : null}
          </div>

          {(showDate || project || task.estimatedDuration || dueLabel || task.tags.length > 0) && (
            <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] text-ink-3">
              {project ? <span className="font-medium text-ink-2">{project.name}</span> : null}
              {showDate && task.scheduledDate ? <span>{relativeDay(task.scheduledDate)}</span> : null}
              {showDate && !task.scheduledDate && task.status !== 'someday' ? <span>Unscheduled</span> : null}
              {task.estimatedDuration ? (
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
              {task.tags.map((t) => (
                <span key={t} className="rounded bg-surface-2 px-1.5 py-px">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>

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
