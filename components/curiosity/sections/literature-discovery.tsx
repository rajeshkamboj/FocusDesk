'use client';

import { IconBook, IconLink } from '@/components/ui/icons';
import { SectionCard } from '../section-card';
import type { CollectionShelf, CollectionShelfEntry } from '@/lib/discovery/server';

/**
 * Literature to read next — discovered public-domain books and texts.
 *
 * The card is a *catalogue* record, and it keeps the two claims separate the same
 * way the existing One Book card does:
 *
 *   - the title, author, language, publication detail, source and licence come
 *     from the source and are labelled with it;
 *   - nothing else is asserted. There is no rating, no page count, no availability
 *     claim, because none of that was verified.
 *
 * Three rules the markup enforces, all of which the licensing review depends on:
 *
 *  1. **No text is reproduced.** The description is the source's own short summary;
 *     the reader is always given a link to read the work where it lives.
 *  2. **Rights travel with the record.** Every entry prints the attribution
 *     sentence for its rights status, including the "check your own country"
 *     caveat for public-domain claims that were asserted rather than verified.
 *  3. **Absence is silent.** With no discovered books the component renders
 *     nothing at all — the existing authored Literature card above it is untouched,
 *     so a reader never sees an empty shelf where content used to be.
 */

const RIGHTS_LABEL: Record<string, string> = {
  'public-domain-verified': 'Public domain',
  'public-domain-asserted': 'Public domain (verify your country)',
  'permitted-reuse': 'Openly licensed',
  'abstract-only': 'Abstract only',
  unknown: 'Rights unverified',
};

function PublicationLine({ entry }: { entry: CollectionShelfEntry }) {
  const parts = [
    entry.author && entry.author !== 'Unknown author' ? entry.author : null,
    entry.publicationDetails ?? null,
    entry.language && entry.language !== 'en' ? `Language: ${entry.language}` : null,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return <p className="mt-1 text-[11.5px] leading-relaxed text-ink-3">{parts.join(' · ')}</p>;
}

function LiteratureEntry({ entry }: { entry: CollectionShelfEntry }) {
  const rights = RIGHTS_LABEL[entry.rights] ?? RIGHTS_LABEL.unknown;
  const caveat = entry.rights === 'public-domain-asserted'
    ? 'Public-domain status differs by country — check yours before republishing.'
    : null;
  return (
    <li className="border-t border-line/60 pt-3 first:border-0 first:pt-0">
      <div className="flex items-start gap-2.5">
        <span aria-hidden className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <IconBook width={15} height={15} />
        </span>
        <div className="min-w-0">
          <p className="text-[13.5px] font-medium leading-snug text-ink">{entry.title}</p>
          <PublicationLine entry={entry} />
          <p className="mt-1.5 line-clamp-3 text-[12px] leading-relaxed text-ink-2">{entry.description}</p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-ink-3">
            <span className="font-medium text-ink-2">{entry.sourceName}</span>
            {' · '}
            {rights}
            {entry.license ? ` · ${entry.license}` : ''}
          </p>
          {caveat ? <p className="mt-1 text-[11px] leading-relaxed text-ink-3">{caveat}</p> : null}
          <p className="mt-1.5 text-[12px]">
            <a
              href={entry.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex items-center gap-1 font-medium text-accent hover:underline"
            >
              Read it at {entry.sourceName}
              <IconLink width={12} height={12} />
            </a>
          </p>
          <p className="sr-only">{entry.attribution}</p>
        </div>
      </div>
    </li>
  );
}

export function LiteratureDiscoveryCard({ shelf, fallback }: { shelf: CollectionShelf | null; fallback?: React.ReactNode }) {
  // No discovered books: render nothing, so the page is exactly what it was before
  // this feature existed. `fallback` is only for a *read failure*, where telling the
  // reader is better than silence.
  if (!shelf || shelf.entries.length === 0) {
    return fallback ? <SectionCard label="More to read">{fallback}</SectionCard> : null;
  }
  return (
    <SectionCard label="More to read">
      <p className="mb-3 text-[11.5px] leading-relaxed text-ink-3">
        Discovered from public-domain catalogues, verified for reuse and refreshed by a scheduled job
        — not fetched while you read.
      </p>
      <ul className="space-y-3">
        {shelf.entries.map((entry) => (
          <LiteratureEntry key={entry.id} entry={entry} />
        ))}
      </ul>
      <p className="mt-3 border-t border-line/60 pt-2.5 text-[11px] leading-relaxed text-ink-3">
        Sources are linked, never mirrored. Public-domain status is decided by the source and can
        differ from the rules where you live.
      </p>
    </SectionCard>
  );
}

export { RIGHTS_LABEL };
