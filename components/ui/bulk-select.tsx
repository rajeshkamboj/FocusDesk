'use client';

import { useCallback, useState, type ReactNode } from 'react';
import { Button } from './button';
import { Modal } from './modal';

/* ------------------------------------------------------------------ */
/* Bulk select & safe bulk delete (Phase 6).                            */
/*                                                                    */
/* Selection is deliberately view state, not application data: a Set  */
/* of record ids held in the screen that owns the list. It is never   */
/* persisted, so a reload — or navigating away — starts from nothing, */
/* and a selection can never leak between screens.                    */
/* ------------------------------------------------------------------ */

export interface BulkSelection {
  /** Selected record ids. Deliberately independent of any active filter. */
  readonly ids: ReadonlySet<string>;
  readonly count: number;
  has(id: string): boolean;
  toggle(id: string): void;
  /** Add (`selected`) or remove (`false`) a whole visible set — select-all. */
  setAll(ids: string[], selected: boolean): void;
  clear(): void;
}

/**
 * Row-level selection props, passed by a screen only while its select mode is
 * on. Rows stay dumb: they render the checkbox and report clicks — the Set of
 * ids, the delete, and every consequence of both belong to the screen and the
 * provider.
 */
export interface RowSelection {
  selected: boolean;
  onToggle: () => void;
}

export function useBulkSelection(): BulkSelection {
  const [ids, setIds] = useState<Set<string>>(() => new Set());

  const toggle = useCallback((id: string) => {
    setIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const setAll = useCallback((list: string[], selected: boolean) => {
    setIds((prev) => {
      const next = new Set(prev);
      for (const id of list) {
        if (selected) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setIds((prev) => (prev.size === 0 ? prev : new Set<string>()));
  }, []);

  return { ids, count: ids.size, has: (id) => ids.has(id), toggle, setAll, clear };
}

/**
 * The selection checkbox. Same 18px square as the form Checkbox, but a
 * standalone button (not a row-wide label) so it never hijacks the row's
 * own click, edit menu or timer controls — and it supports the `mixed`
 * state a "select all" box needs when only part of the list is selected.
 */
export function SelectionCheckbox({
  checked,
  indeterminate = false,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  /** Full accessible name, e.g. `Select "Write chapter 2" for bulk actions`. */
  label: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={label}
      onClick={onChange}
      className={`flex h-[18px] w-[18px] shrink-0 cursor-pointer items-center justify-center rounded-md border transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 print:hidden ${
        checked
          ? 'border-accent bg-accent text-white'
          : indeterminate
            ? 'border-accent bg-accent-soft text-accent'
            : 'border-line-strong bg-surface hover:border-accent'
      }`}
    >
      {checked ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="m5 12 5 5L20 7" />
        </svg>
      ) : indeterminate ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
          <path d="M6 12h12" />
        </svg>
      ) : null}
    </button>
  );
}

/**
 * The bulk action bar. Rendered by the screen as a strip right under its
 * filter row — not a floating overlay: no screen has pagination, so the
 * list stays short enough to scan with the bar in flow, and nothing ever
 * hides a row (or the mobile nav) behind a fixed panel.
 */
export function BulkActionBar({ children }: { children: ReactNode }) {
  return (
    <div
      role="toolbar"
      aria-label="Bulk actions"
      className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-line bg-surface px-4 py-2.5 shadow-card print:hidden"
    >
      {children}
    </div>
  );
}

/**
 * The confirmation dialog every bulk delete must pass through — even when
 * the user turned the single-task delete confirmation off. A bulk delete is
 * the one operation where "wait, what exactly did I pick?" deserves its own
 * step, so this dialog is not a setting, it is the mechanism. The `lines`
 * spell out what IS and what is NOT being deleted, built by the screen from
 * live counts; nothing here is vague.
 */
export function BulkDeleteDialog({
  open,
  title,
  lines,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  /** Bullet lines: deletion scope first, then what survives untouched. */
  lines: string[];
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={busy}>
            {busy ? 'Deleting…' : confirmLabel}
          </Button>
        </>
      }
    >
      <ul className="space-y-2 text-sm leading-relaxed text-ink-2">
        {lines.map((line, index) => (
          <li key={index} className={index === 0 ? 'font-medium text-ink' : undefined}>
            {line}
          </li>
        ))}
      </ul>
    </Modal>
  );
}

/** Pluralise "N things deleted" the way every bulk toast does. */
export function pluralCount(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}
