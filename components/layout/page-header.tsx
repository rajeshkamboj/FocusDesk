import type { ReactNode } from 'react';

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm leading-relaxed text-ink-2">{subtitle}</p> : null}
      </div>
      {actions ? (
        <div className="flex items-center gap-2 print:hidden">{actions}</div>
      ) : null}
    </div>
  );
}

export function SectionTitle({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <h2 className={`text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3 ${className}`}>{children}</h2>
  );
}
