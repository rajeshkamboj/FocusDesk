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
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
