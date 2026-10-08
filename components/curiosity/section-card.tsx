import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { SectionTitle } from '@/components/layout/page-header';

/**
 * The card chrome every Curiosity section shares: a rounded surface, a small
 * uppercase label, and a body that fills a grid row so paired cards match
 * heights.
 *
 * This started life inside `curiosity-screen.tsx`. It lives here now so the
 * section components can use exactly the same shell instead of re-declaring it
 * — the rendered classes are unchanged, which is the point: adding sections
 * must not restyle the cards that already exist.
 */
export function SectionCard({
  label,
  className = '',
  children,
}: {
  label: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card className={`relative isolate flex h-full min-w-0 flex-col overflow-hidden p-4 sm:p-6 ${className}`}>
      <div className="relative"><SectionTitle>{label}</SectionTitle></div>
      <div className="relative mt-3.5">{children}</div>
    </Card>
  );
}

/** The small tinted square that anchors a section's heading row. */
export function VisualMark({
  children,
  tone = 'bg-accent-soft text-accent',
}: {
  children: ReactNode;
  tone?: string;
}) {
  return (
    <div
      aria-hidden
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone}`}
    >
      {children}
    </div>
  );
}
