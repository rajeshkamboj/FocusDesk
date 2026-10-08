import type { ReactNode } from 'react';

/**
 * A quiet section divider for the Curiosity page.
 *
 * The page is one column of cards, and the new categories need to read as
 * groups without every group becoming a heavy container. So this is a label
 * and a hairline — nothing that can be mistaken for a card, and nothing that
 * competes with the card titles inside it.
 *
 * It is a paragraph, not a heading, on purpose: the page already has an `h1`
 * and every card carries an `h2`, and inserting another heading level here
 * would renumber the document outline without adding anything a screen reader
 * user needs.
 *
 * `flush` drops the hairline for the first group on the page, where the
 * preceding panel already draws its own border.
 */
export function SectionGroup({ label, hint, flush = false }: { label: string; hint?: ReactNode; flush?: boolean }) {
  return (
    <div className={flush ? 'flex items-baseline gap-3' : '-mt-1 flex items-baseline gap-3 border-t border-line pt-4'}>
      <p className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-3">{label}</p>
      {hint ? <p className="min-w-0 truncate text-[11px] text-ink-3">{hint}</p> : null}
    </div>
  );
}
