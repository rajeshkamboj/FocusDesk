import type { ReactNode } from 'react';
import { SectionCard, VisualMark } from '../section-card';
import type { ScienceConcept } from '@/lib/curiosity/types';

/**
 * The Chemistry and Physics cards.
 *
 * Both subjects render through this one card so the pair looks like a pair:
 * same layers, same order, and the same height in a two-column row. What
 * changes between them is the label and the wording of the real-life
 * connection — the connection is named for the subject rather than forced into
 * one shared phrase.
 *
 * `deeper` and `equation` are optional because not every concept needs them,
 * and padding a card with a formula it does not need is exactly the habit this
 * page is meant to avoid.
 */
function Line({ label, text }: { label: string; text: string }) {
  return (
    <p className="text-[12.5px] leading-relaxed text-ink-2">
      <span className="font-medium text-ink-3">{label}: </span>
      {text}
    </p>
  );
}

export function ScienceCard({
  label,
  connectionLabel,
  icon,
  concept,
}: {
  label: string;
  connectionLabel: string;
  icon: ReactNode;
  concept: ScienceConcept;
}) {
  return (
    <SectionCard label={label}>
      <div className="space-y-3.5">
        <div className="flex gap-3">
          <VisualMark tone="bg-accent-soft text-accent">{icon}</VisualMark>
          <h3 className="pt-1 text-[16px] font-medium leading-snug text-ink">{concept.topic}</h3>
        </div>

        <p className="text-[13px] leading-relaxed text-ink-2">{concept.simple}</p>

        {concept.deeper ? <Line label="Deeper" text={concept.deeper} /> : null}

        {concept.equation ? (
          <p className="break-words rounded-lg border border-line bg-surface-2/50 px-3 py-2 font-mono text-[12px] leading-relaxed text-ink-2">
            {concept.equation}
          </p>
        ) : null}

        <div className="space-y-2">
          <Line label={connectionLabel} text={concept.connection} />
          <Line label="Surprising" text={concept.surprising} />
        </div>

        <div className="rounded-xl border border-accent/30 bg-accent-soft/25 px-3.5 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent-ink">Think about this</p>
          <p className="mt-1 text-[13px] leading-relaxed text-ink">{concept.question}</p>
        </div>
      </div>
    </SectionCard>
  );
}
