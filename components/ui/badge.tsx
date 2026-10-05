import type { ReactNode } from 'react';

export function Badge({
  children,
  tone = 'neutral',
  className = '',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'warning' | 'danger' | 'muted';
  className?: string;
}) {
  const tones = {
    neutral: 'bg-surface-2 text-ink-2 border-line',
    accent: 'bg-accent-soft text-accent-ink border-transparent',
    warning: 'bg-warning-soft text-warning border-transparent',
    danger: 'bg-danger-soft text-danger border-transparent',
    muted: 'bg-transparent text-ink-3 border-line',
  };
  return (
    /*
     * `whitespace-nowrap` is gone, `max-w-full` is in.
     *
     * A badge is a short chip, so in practice it never wraps — it fits on one
     * line because it is small. But several of them carry user content of
     * unbounded length ("Project · {name}", "Goal · {name}") and one carries a
     * whole sentence ("This browser does not support notifications", which is
     * what iOS Safari outside an installed PWA actually sees). With nowrap,
     * those pushed the card — and the document — past the width of a phone.
     * Wrapping a too-long chip is contained; bursting the page is not.
     */
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
