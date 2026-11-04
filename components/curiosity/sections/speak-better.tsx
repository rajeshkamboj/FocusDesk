'use client';

import Link from 'next/link';
import { useEffect, useSyncExternalStore } from 'react';
import { SectionCard, VisualMark } from '../section-card';
import { IconSpeech } from '@/components/ui/icons';
import type { SpeakBetterLesson, SpeakBetterWord } from '@/lib/curiosity/types';
import {
  bandOf,
  knownWordsByLesson,
  levelLabel,
  newWordCount,
  refineForReader,
} from '@/lib/curiosity/speak-better-daily';
import {
  markSeen,
  publishSpeakBetterProgress,
  speakBetterProgressSnapshot,
  speakBetterServerSnapshot,
  subscribeSpeakBetterProgress,
} from '@/lib/curiosity/speak-better-store';

/**
 * Speak Better — one lesson a day, laid out as a comparison.
 *
 * The lesson is full width on purpose: three to five words have to sit side by
 * side with an English meaning, a Hindi meaning, a line of nuance and example
 * sentences each, and none of that survives being squeezed into a half column.
 * From `lg` the word blocks form two comparison columns, with a hairline above
 * every block so the grid reads like a table without becoming one.
 *
 * Two additions, both inside the existing card:
 *
 *  - **Per-reader refinement.** The published lesson is replaced *only* when every
 *    one of its words is already marked known on this device, and only with one of
 *    the two alternatives the publisher supplied. The card says when that happened.
 *  - **Dictionary detail.** A word may carry a Wiktionary sense and the words it
 *    travels with from Datamuse. It is shown in a separate, attributed line under
 *    the authored meanings — never in place of them.
 */
function WordBlock({ word }: { word: SpeakBetterWord }) {
  return (
    <div className="border-t border-line pt-3">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <h3 className="text-[15px] font-medium text-ink">{word.word}</h3>
        <p lang="hi" className="break-words text-[13px] text-ink-2">{word.hindiMeaning}</p>
        {word.dictionary?.partOfSpeech ? (
          <span className="text-[10.5px] uppercase tracking-wide text-ink-3">{word.dictionary.partOfSpeech}</span>
        ) : null}
      </div>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">{word.englishMeaning}</p>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">
        <span className="font-medium text-ink-3">Nuance: </span>
        {word.nuance}
      </p>
      <ul className="mt-1.5 space-y-1">
        {word.examples.map((example) => (
          <li key={example} className="break-words font-serif text-[12.5px] italic leading-relaxed text-ink-3">
            “{example}”
          </li>
        ))}
      </ul>

      {word.dictionary ? (
        <div className="mt-2 rounded-lg border border-line/70 bg-surface-2/40 px-2.5 py-2 text-[11.5px] leading-relaxed text-ink-2">
          {word.dictionary.definition ? (
            <p>
              <span className="font-medium text-ink-3">Dictionary: </span>
              {word.dictionary.definition}
            </p>
          ) : null}
          {word.dictionary.collocations?.length ? (
            <p className="mt-1">
              <span className="font-medium text-ink-3">Often appears with: </span>
              {word.dictionary.collocations.join(', ')}
            </p>
          ) : null}
          <p className="mt-1 text-[10.5px] text-ink-3">
            <a
              href={word.dictionary.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              {word.dictionary.sourceName}
            </a>
            {' · '}
            {word.dictionary.license}
            {' · dictionary text, not an editorial gloss'}
          </p>
        </div>
      ) : null}

      {word.collocations?.length ? (
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-3">
          <span className="font-medium">Collocations: </span>
          {word.collocations.join(' · ')}
        </p>
      ) : null}
      {word.commonMistake ? (
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-3">
          <span className="font-medium">Common mistake: </span>
          {word.commonMistake}
        </p>
      ) : null}
      {word.differsFrom ? (
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-3">
          <span className="font-medium">Don’t confuse it with: </span>
          {word.differsFrom}
        </p>
      ) : null}
      {word.register ? (
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-3">
          <span className="font-medium">Register: </span>
          {word.register}
        </p>
      ) : null}
    </div>
  );
}

export function SpeakBetterSection({
  lesson,
  alternatives = [],
}: {
  lesson: SpeakBetterLesson;
  alternatives?: SpeakBetterLesson[];
}) {
  const progress = useSyncExternalStore(
    subscribeSpeakBetterProgress,
    speakBetterProgressSnapshot,
    speakBetterServerSnapshot,
  );

  /**
   * Refinement is computed here rather than published: only the browser knows which
   * words this reader has marked known. `refineForReader` returns the published
   * lesson unchanged unless every word on it is already known.
   */
  const candidates = [lesson, ...alternatives];
  const known = knownWordsByLesson(Object.values(progress.words));
  const refined = newWordCount(lesson, known) > 0
    ? { lesson, replaced: false as const, reason: undefined }
    : (() => {
        for (const candidate of alternatives) {
          if (newWordCount(candidate, known) > 0) {
            return {
              lesson: candidate,
              replaced: true as const,
              reason: 'Today’s published lesson was already known, so a lesson with new words is shown instead.',
            };
          }
        }
        return refineForReader(lesson, candidates, Object.values(progress.words), '');
      })();

  const shown = refined.lesson;

  /**
   * Opening the card is the point at which the reader has "met" these words, so they
   * are recorded as seen — the same ledger the library uses, which is what lets the
   * refinement above work tomorrow.
   */
  useEffect(() => {
    let document = speakBetterProgressSnapshot();
    for (const word of shown.words) {
      document = markSeen(document, {
        id: word.id ?? `${shown.id}:${word.word}`,
        lessonId: shown.id,
        word: word.word,
        level: bandOf(shown),
      });
    }
    publishSpeakBetterProgress(document);
  }, [shown]);

  return (
    <SectionCard label="Speak Better">
      <div className="space-y-4">
        <div className="flex gap-3.5">
          <VisualMark>
            <IconSpeech width={18} height={18} />
          </VisualMark>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-wider text-accent-ink">
                {levelLabel(shown)}
              </span>
              {shown.enrichment?.status === 'enriched' ? (
                <span className="text-[10.5px] text-ink-3">dictionary detail added</span>
              ) : null}
              {shown.enrichment?.status === 'unavailable' ? (
                <span className="text-[10.5px] text-ink-3">authored lesson · dictionary unavailable</span>
              ) : null}
            </div>
            <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">Situation</p>
            <p className="mt-1 text-[13.5px] leading-relaxed text-ink-2">{shown.situation}</p>
          </div>
        </div>

        <p className="rounded-xl border border-accent/30 bg-accent-soft/25 px-3.5 py-3 text-[13px] leading-relaxed text-ink">
          <span className="font-medium text-accent-ink">Today’s distinction: </span>
          {shown.focus}
        </p>

        {refined.replaced ? (
          <p className="rounded-lg border border-line bg-surface-2/50 px-3 py-2 text-[11.5px] leading-relaxed text-ink-3">
            {refined.reason ?? 'A lesson with new words is shown because today’s published lesson was already known.'}
          </p>
        ) : null}

        <ul className="grid gap-x-8 gap-y-4 lg:grid-cols-2">
          {shown.words.map((word) => (
            <li key={word.word} className="min-w-0">
              <WordBlock word={word} />
            </li>
          ))}
        </ul>

        <div className="rounded-xl border border-line bg-surface-2/40 p-3.5 sm:p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">A short conversation</p>
          <div className="mt-2 space-y-1.5">
            {shown.dialogue.map((line) => (
              <p key={`${line.speaker}-${line.line}`} className="text-[13px] leading-relaxed text-ink-2">
                <span className="font-medium text-ink">{line.speaker}</span>
                <span className="text-ink-3"> · </span>
                <span className="font-serif italic">“{line.line}”</span>
              </p>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-accent/30 bg-accent-soft/25 px-3.5 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent-ink">Speaking challenge</p>
          <p className="mt-1 text-[13px] leading-relaxed text-ink">{shown.challenge}</p>
          <p className="mt-1.5 text-[11.5px] text-ink-3">Say it out loud — the spoken half is the half that transfers.</p>
        </div>

        <p className="text-[12px] leading-relaxed text-ink-3">
          Practising at another level?{' '}
          <Link href="/speak-better" className="font-medium text-accent hover:underline">
            Open the Speak Better library
          </Link>{' '}
          to mark words known, save them for later and search every lesson.
        </p>
      </div>
    </SectionCard>
  );
}
