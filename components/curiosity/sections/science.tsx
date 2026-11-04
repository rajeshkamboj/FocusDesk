import type { ReactNode } from 'react';
import { SectionCard, VisualMark } from '../section-card';
import type { ScienceConcept } from '@/lib/curiosity/types';

/**
 * The Chemistry, Physics and Biology cards.
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
 *
 * A research record adds a provenance block above the explanation: what kind of
 * record it is, when it was published, where, and why it was selected. The label is
 * not decoration — a preprint must be visibly a preprint, and the card never prints
 * a stronger claim than the record supports.
 */
function Line({ label, text }: { label: string; text: string }) {
  return (
    <p className="text-[12.5px] leading-relaxed text-ink-2">
      <span className="font-medium text-ink-3">{label}: </span>
      {text}
    </p>
  );
}

function formatDay(value: string): string {
  const parsed = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/**
 * The two-word label a reader needs before they read a claim.
 *
 * The colours are deliberately not identical: a preprint is amber, a reviewed
 * article is the card's normal accent. Colour is never the only signal — the text
 * says which it is.
 */
function ProvenanceBadge({ concept }: { concept: ScienceConcept }) {
  if (!concept.provenance || concept.origin !== 'research') return null;
  const preprint = concept.provenance === 'preprint';
  const tone = preprint
    ? 'border-warning/40 bg-warning-soft text-warning'
    : 'border-accent/30 bg-accent-soft text-accent-ink';
  return (
    <span className={`inline-block rounded-md border px-2 py-0.5 text-[10.5px] font-medium ${tone}`}>
      {concept.provenanceLabel ?? (preprint ? 'Preprint — not yet peer-reviewed' : 'Peer-reviewed research')}
    </span>
  );
}

function ResearchMeta({ concept }: { concept: ScienceConcept }) {
  if (concept.origin !== 'research') return null;
  const details = [
    concept.venue ? concept.venue : null,
    concept.publishedOn ? formatDay(concept.publishedOn) : null,
    concept.authors && concept.authors.length > 0 ? concept.authors.slice(0, 3).join(', ') : null,
  ].filter(Boolean);
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <ProvenanceBadge concept={concept} />
        {concept.research?.rights === 'metadata-only' ? (
          <span className="text-[10.5px] text-ink-3">metadata only — read the paper at the source</span>
        ) : null}
      </div>
      {details.length ? (
        <p className="text-[11.5px] leading-relaxed text-ink-3">{details.join(' · ')}</p>
      ) : null}
      {concept.doi ? (
        <p className="break-all text-[11px] text-ink-3">
          DOI{' '}
          <a
            href={`https://doi.org/${concept.doi}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline"
          >
            {concept.doi}
          </a>
        </p>
      ) : null}
    </div>
  );
}

function SelectionBasis({ concept }: { concept: ScienceConcept }) {
  if (concept.origin !== 'research' || !concept.research?.significanceBasis?.length) return null;
  return (
    <div className="rounded-xl border border-line bg-surface-2/40 px-3.5 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">
        Why this was selected
      </p>
      <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-[11.5px] leading-relaxed text-ink-2">
        {concept.research.significanceBasis.slice(0, 4).map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
      <p className="mt-1.5 text-[11px] text-ink-3">
        Selected by a stated scoring heuristic (score {concept.research.significanceScore}/100), not a claim about scientific importance.
      </p>
    </div>
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

        <ResearchMeta concept={concept} />

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

        <SelectionBasis concept={concept} />

        {/* Citation, shown only when the card was assembled from a source. */}
        {concept.source?.url ? (
          <p className="text-[11px] leading-relaxed text-ink-3">
            Source:{' '}
            <a href={concept.source.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
              {concept.source.name ?? 'the source article'}
            </a>
            {concept.source.attribution ? <span className="mt-0.5 block">{concept.source.attribution}</span> : null}
          </p>
        ) : null}
      </div>
    </SectionCard>
  );
}
