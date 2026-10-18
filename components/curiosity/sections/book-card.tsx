'use client';

import { useState } from 'react';
import { SectionCard } from '../section-card';
import { IconBook, IconLink } from '@/components/ui/icons';
import { BOOK_CADENCE_LABEL, BOOK_COVER_PLACEHOLDER, BOOK_COVER_PLACEHOLDER_ALT, OPEN_LIBRARY_ATTRIBUTION } from '@/lib/curiosity/constants';
import { formatPublicationDate } from '@/lib/curiosity/schedule';
import type { BookRecommendation } from '@/lib/curiosity/types';

/**
 * One Book — the recommendation card.
 *
 * The card is a catalogue record with an opinion attached, and the two are kept
 * visibly separate: the cover, the first publication year, the edition count and
 * the read/borrow link all come from Open Library and say so; the synopsis and
 * “why it may help” are ours.
 *
 * Three rules the layout enforces:
 *
 *  1. **Nothing that was not returned.** Publication information is rendered if
 *     `firstPublishYear`, `publisher` or `editionCount` exist and omitted if they
 *     do not, so a missing catalogue field is a shorter card and never a guess.
 *  2. **A cover is never assumed.** The Open Library cover is hot-linked from
 *     their host and swapped for the local placeholder if it fails to load, so
 *     the card never shows a broken image and never re-hosts someone else’s art.
 *  3. **No invented reading access.** The “read or preview” link appears only
 *     when the catalogue lists a scan, and its wording defers availability to the
 *     holding library. Ratings and reviews are absent because we do not fetch
 *     them, not because they are zero.
 */

function PublicationLine({ book }: { book: BookRecommendation }) {
  const parts = [
    book.firstPublishYear ? `First published ${book.firstPublishYear}` : null,
    book.editionCount ? `${book.editionCount} ${book.editionCount === 1 ? 'edition' : 'editions'} listed` : null,
    book.publisher,
  ].filter(Boolean);
  if (!parts.length) return null;
  return (
    <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-3">{parts.join(' · ')}</p>
  );
}

function Cover({ book }: { book: BookRecommendation }) {
  const [failed, setFailed] = useState(false);
  const src = book.coverUrl && !failed ? book.coverUrl : BOOK_COVER_PLACEHOLDER;
  return (
    <div className="relative w-[76px] shrink-0 overflow-hidden rounded-lg border border-line bg-surface-2 sm:w-[86px]" aria-hidden={!book.coverUrl}>
      {/* 2:3 is the aspect ratio Open Library covers share; reserving it means the
          image arriving later cannot shove the card's text down. */}
      <div className="aspect-[2/3]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={book.coverUrl && !failed ? `Cover of ${book.title}` : BOOK_COVER_PLACEHOLDER_ALT}
          width={86}
          height={129}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      </div>
    </div>
  );
}

export function BookCard({ book, nextChangeOn }: { book: BookRecommendation; nextChangeOn?: string | null }) {
  return (
    <SectionCard label="One Book">
      <div className="space-y-3.5">
        <div className="flex gap-3.5">
          <Cover book={book} />
          <div className="min-w-0">
            <h3 className="text-[17px] font-medium leading-snug text-ink">{book.title}</h3>
            <p className="mt-1 text-[13px] leading-snug text-ink-2">
              by <span className="font-medium text-ink">{book.author}</span>
            </p>
            <PublicationLine book={book} />
            <p className="mt-2 text-[11px] leading-relaxed text-ink-3">
              {book.sourceName === 'Open Library' ? OPEN_LIBRARY_ATTRIBUTION : 'From the FocusDesk editorial pool'}
            </p>
          </div>
        </div>

        <p className="text-[13px] leading-relaxed text-ink-2">{book.synopsis}</p>

        <p className="text-[13px] leading-relaxed text-ink-2">
          <strong className="font-medium text-ink">Why it may help: </strong>
          {book.why}
        </p>

        {book.publishersNote ? (
          <p className="text-[11.5px] leading-relaxed text-ink-3">{book.publishersNote}</p>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px]">
          <a
            href={book.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-accent transition-colors hover:text-accent-hover hover:underline"
          >
            <IconLink width={13} height={13} />
            {book.openLibraryKey ? 'Open Library record' : 'Search Open Library'}
          </a>
          {book.previewUrl ? (
            <a
              href={book.previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-accent transition-colors hover:text-accent-hover hover:underline"
            >
              <IconBook width={13} height={13} />
              Read or borrow
            </a>
          ) : null}
        </div>
        {book.previewUrl && book.previewNote ? (
          <p className="text-[11px] leading-relaxed text-ink-3">{book.previewNote}</p>
        ) : null}

        <p className="border-t border-line pt-2.5 text-[11px] leading-relaxed text-ink-3">
          {BOOK_CADENCE_LABEL}
          {nextChangeOn ? ` · next change ${formatPublicationDate(nextChangeOn)}` : ''}
          {book.fetchedAt ? ` · looked up ${new Date(book.fetchedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}` : ''}
        </p>
      </div>
    </SectionCard>
  );
}
