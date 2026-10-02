'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useData } from '@/components/data/data-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/form';
import { IconPencil, IconTrash } from '@/components/ui/icons';
import type { Subtask } from '@/lib/types';

export function TaskSubtasks({
  parentTaskId,
  parentCompleted,
  subtasks,
  autoFocusInput,
}: {
  parentTaskId: string;
  parentCompleted: boolean;
  subtasks: Subtask[];
  autoFocusInput: boolean;
}) {
  const { actions } = useData();
  const [title, setTitle] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [busyIds, setBusyIds] = useState<Set<string>>(() => new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const completedCount = subtasks.filter((subtask) => subtask.completed).length;

  const setBusy = (id: string, busy: boolean) => {
    setBusyIds((current) => {
      const next = new Set(current);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const addSubtask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const clean = title.trim();
    if (!clean || adding) return;
    setAdding(true);
    const created = await actions.addSubtask(parentTaskId, clean);
    if (created) {
      setTitle('');
      inputRef.current?.focus();
    }
    setAdding(false);
  };

  const toggleSubtask = async (subtask: Subtask) => {
    if (busyIds.has(subtask.id)) return;
    setBusy(subtask.id, true);
    await actions.updateSubtask(subtask.id, { title: subtask.title, completed: !subtask.completed });
    setBusy(subtask.id, false);
  };

  const saveEdit = async (event: FormEvent<HTMLFormElement>, subtask: Subtask) => {
    event.preventDefault();
    const clean = editTitle.trim();
    if (!clean || busyIds.has(subtask.id)) return;
    setBusy(subtask.id, true);
    const saved = await actions.updateSubtask(subtask.id, { title: clean, completed: subtask.completed });
    if (saved) setEditingId(null);
    setBusy(subtask.id, false);
  };

  const deleteSubtask = async (id: string) => {
    if (busyIds.has(id)) return;
    setBusy(id, true);
    await actions.deleteSubtask(id);
    setBusy(id, false);
  };

  return (
    <section
      data-subtask-panel
      aria-label="Subtasks"
      className="mt-2 rounded-lg border border-line bg-surface-2/50 px-3 py-2.5"
    >
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">
          Subtasks
          {subtasks.length > 0 ? (
            <span className="ml-1.5 font-medium normal-case tracking-normal tabular-nums text-ink-2">
              {completedCount}/{subtasks.length}
            </span>
          ) : null}
        </h4>
        {parentCompleted && completedCount < subtasks.length ? (
          <p className="text-[11px] text-ink-3">
            Parent completed · {completedCount}/{subtasks.length} subtasks completed
          </p>
        ) : null}
      </div>

      <form onSubmit={(event) => void addSubtask(event)} className="flex items-center gap-2">
        <Input
          ref={inputRef}
          aria-label="New subtask"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="What needs to be done?"
          autoFocus={autoFocusInput}
          className="h-8 min-w-0 flex-1 rounded-lg px-2.5 text-[12.5px]"
        />
        <Button type="submit" size="sm" variant="soft" disabled={!title.trim() || adding}>
          Add
        </Button>
      </form>

      {subtasks.length > 0 ? (
        <ul className="mt-2 space-y-0.5">
          {subtasks.map((subtask) => (
            <li key={subtask.id} className="flex min-w-0 items-start gap-2 rounded-md px-1 py-1">
              <button
                type="button"
                role="checkbox"
                aria-checked={subtask.completed}
                aria-label={`${subtask.completed ? 'Uncheck' : 'Complete'} subtask: ${subtask.title}`}
                disabled={busyIds.has(subtask.id)}
                onClick={() => void toggleSubtask(subtask)}
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                  subtask.completed
                    ? 'border-accent bg-accent text-white'
                    : 'border-line-strong bg-surface hover:border-accent'
                }`}
              >
                {subtask.completed ? (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m5 12 5 5L20 7" />
                  </svg>
                ) : null}
              </button>

              {editingId === subtask.id ? (
                <form onSubmit={(event) => void saveEdit(event, subtask)} className="flex min-w-0 flex-1 items-center gap-1.5">
                  <Input
                    aria-label={`Edit subtask: ${subtask.title}`}
                    value={editTitle}
                    onChange={(event) => setEditTitle(event.target.value)}
                    autoFocus
                    className="h-7 min-w-0 flex-1 rounded-md px-2 text-[12px]"
                  />
                  <Button type="submit" size="sm" variant="soft" disabled={!editTitle.trim() || busyIds.has(subtask.id)} className="h-7 px-2 text-[11px]">
                    Save
                  </Button>
                  <button
                    type="button"
                    aria-label="Cancel subtask edit"
                    onClick={() => setEditingId(null)}
                    className="rounded px-1.5 py-1 text-[11px] text-ink-3 hover:bg-surface hover:text-ink"
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <>
                  <span className={`min-w-0 flex-1 break-words text-[12.5px] leading-snug ${subtask.completed ? 'text-ink-3 line-through' : 'text-ink-2'}`}>
                    {subtask.title}
                  </span>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      aria-label={`Edit subtask: ${subtask.title}`}
                      disabled={busyIds.has(subtask.id)}
                      onClick={() => {
                        setEditingId(subtask.id);
                        setEditTitle(subtask.title);
                      }}
                      className="rounded p-1 text-ink-3 hover:bg-surface hover:text-ink disabled:opacity-40"
                    >
                      <IconPencil width={13} height={13} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete subtask: ${subtask.title}`}
                      disabled={busyIds.has(subtask.id)}
                      onClick={() => void deleteSubtask(subtask.id)}
                      className="rounded p-1 text-ink-3 hover:bg-danger-soft hover:text-danger disabled:opacity-40"
                    >
                      <IconTrash width={13} height={13} />
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
