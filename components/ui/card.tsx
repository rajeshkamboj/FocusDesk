import type { ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-line bg-surface shadow-card ${className}`}>{children}</div>
  );
}

export function ProgressBar({ done, total, className = '' }: { done: number; total: number; className?: string }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-surface-3 ${className}`}>
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    /*
     * Natural content height, deliberately not a centred hero.
     *
     * `justify-center` is gone: with no height to distribute it did nothing
     * here, but it invited exactly the fix this card must not have — stretching
     * the empty state down the viewport. The card ends where its content ends
     * and the page simply stays short.
     *
     * The mobile padding is `py-8` rather than `py-12` so the block of empty
     * space under it (page padding + the shell's bottom-nav clearance) reads
     * as breathing room instead of a gap. `sm:` restores the original
     * desktop proportions.
     */
    <div className="animate-rise-in flex flex-col items-center rounded-2xl border border-dashed border-line px-5 py-8 text-center sm:px-6 sm:py-12">
      {icon ? <div className="mb-3 text-ink-3">{icon}</div> : null}
      <p className="text-[15px] font-medium text-ink">{title}</p>
      {hint ? <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-ink-3">{hint}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
