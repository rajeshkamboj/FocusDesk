'use client';

import { IconAtom, IconBook, IconLink, IconReview } from '@/components/ui/icons';
import { SectionCard } from '../section-card';
import type { CollectionShelf } from '@/lib/discovery/server';

/**
 * Science, beyond the three daily concept cards.
 *
 * The five existing Science cards (chemistry, physics, biology, one-thing,
 * learn-something) are untouched. This section adds *discovered* material below
 * them, and the whole design is about one risk: a reader mistaking a single study
 * for a settled fact.
 *
 * What the card does about that:
 *
 *  1. **Every record is labelled by kind** — explainer, textbook, mission media,
 *     research abstract — so "a study found" is never presented in the same voice
 *     as "a textbook explains".
 *  2. **Research carries its caveat inline**, not in a footnote: a preprint says it
 *     has not been peer-reviewed, a single study says it is preliminary until
 *     replicated, a review says it is a summary rather than a conclusion.
 *  3. **No abstract is summarised into a finding.** The abstract text comes from the
 *     source, the card says so, and the reader is sent to the record.
 *
 * With nothing discovered, the component renders nothing and the existing Science
 * cards stand alone, exactly as they did before.
 */

type KindMeta = { label: string; icon: (props: { width?: number; height?: number }) => React.ReactElement; tone: string };

const KIND_META: Record<string, KindMeta> = {
  explainer: { label: 'Explainer', icon: IconBook, tone: 'bg-accent-soft text-accent' },
  entity: { label: 'Reference entry', icon: IconBook, tone: 'bg-surface-2 text-ink-2' },
  textbook: { label: 'Open textbook', icon: IconBook, tone: 'bg-accent-soft text-accent' },
  'mission-media': { label: 'Mission image', icon: IconAtom, tone: 'bg-surface-2 text-ink-2' },
  'research-abstract': { label: 'Research abstract', icon: IconReview, tone: 'bg-surface-2 text-ink-2' },
};

export function ScienceDiscoveryCard({ shelf }: { shelf: CollectionShelf | null }) {
  if (!shelf || shelf.entries.length === 0) return null;
  return (
    <SectionCard label="Science, discovered">
      <p className="mb-3 text-[11.5px] leading-relaxed text-ink-3">
        From Wikipedia, Wikidata, NASA, OpenStax and Europe PMC — validated, attributed and stored
        ahead of time by a scheduled job.
      </p>
      <ul className="space-y-3">
        {shelf.entries.map((entry) => {
          const meta = KIND_META[entry.kind] ?? { label: 'Reference', icon: IconBook, tone: 'bg-surface-2 text-ink-2' };
          const Icon = meta.icon;
          const isResearch = entry.kind === 'research-abstract';
          return (
            <li key={entry.id} className="border-t border-line/60 pt-3 first:border-0 first:pt-0">
              <div className="flex items-start gap-2.5">
                <span aria-hidden className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${meta.tone}`}>
                  <Icon width={15} height={15} />
                </span>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3">
                    {meta.label}
                    <span className="text-ink-3/70">· {entry.sourceName}</span>
                  </p>
                  <p className="mt-0.5 text-[13.5px] font-medium leading-snug text-ink">{entry.title}</p>
                  <p className={`mt-1.5 ${isResearch ? 'line-clamp-4' : 'line-clamp-3'} text-[12px] leading-relaxed text-ink-2`}>
                    {entry.description}
                  </p>
                  {entry.caveat ? (
                    <p className="mt-1.5 rounded-md border border-line/70 bg-surface-2/50 px-2 py-1 text-[11px] leading-relaxed text-ink-2">
                      {entry.caveat}
                    </p>
                  ) : null}
                  <p className="mt-1.5 text-[11px] leading-relaxed text-ink-3">
                    {entry.rights === 'abstract-only'
                      ? 'Metadata and abstract only — no full text stored.'
                      : entry.license ?? entry.attribution}
                  </p>
                  <p className="mt-1.5 text-[12px]">
                    <a
                      href={entry.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="inline-flex items-center gap-1 font-medium text-accent hover:underline"
                    >
                      {isResearch ? 'Read the record' : `Open at ${entry.sourceName}`}
                      <IconLink width={12} height={12} />
                    </a>
                  </p>
                  <p className="sr-only">{entry.attribution}</p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 border-t border-line/60 pt-2.5 text-[11px] leading-relaxed text-ink-3">
        Research records are single studies or summaries, not established facts. Attribution and
        licence stay with each record.
      </p>
    </SectionCard>
  );
}

export { KIND_META };
