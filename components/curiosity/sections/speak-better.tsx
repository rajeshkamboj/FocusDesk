'use client';

import dynamic from 'next/dynamic';
import { useEffect, useId, useState, useSyncExternalStore } from 'react';
import { SectionCard, VisualMark } from '../section-card';
import { IconSpeech } from '@/components/ui/icons';
import type { SpeakBetterLesson, SpeakBetterWord } from '@/lib/curiosity/types';
import { bandOf, levelLabel, refineForReader } from '@/lib/curiosity/speak-better-daily';
import { primaryWord, toCurrentLesson } from '@/lib/curiosity/speak-better';
import {
  markSeen,
  publishSpeakBetterProgress,
  speakBetterProgressSnapshot,
  speakBetterServerSnapshot,
  subscribeSpeakBetterProgress,
} from '@/lib/curiosity/speak-better-store';

/**
 * The practice library, loaded only when a reader asks for it.
 *
 * It used to be a section of its own with a sidebar entry (`/speak-better`). That
 * page is retired: the library is part of this card now, behind a disclosure, so
 * there is one place for Speak Better rather than two doors to the same room.
 *
 * The split matters for cost as well as for navigation. The library is 32 lessons
 * with every word rendered, so it is fetched on first open and never as part of
 * the daily page. `ssr: false` keeps it off the server render: the expanded state
 * is a client choice, and the progress ledger's `useSyncExternalStore` already
 * makes the first client paint match the server.
 */
const SpeakBetterLibrary = dynamic(
  () => import('../speak-better-library').then((module) => module.SpeakBetterLibrary),
  {
    ssr: false,
    loading: () => (
      <p className="text-[12.5px] text-ink-3" role="status">
        Loading the practice library…
      </p>
    ),
  },
);

/**
 * Speak Better — one lesson a day, built around one word.
 *
 * Each lesson teaches exactly one primary word in depth. The layout is a single
 * column, read top to bottom: the word itself, its meaning in English and Hindi,
 * how it is used, the mistake to avoid, and then one short task. Related words
 * appear only as one-line clarifications, underneath, so the eye stays on the word.
 *
 * Two behaviours live in this card:
 *
 *  - **Per-reader refinement.** The published lesson is replaced only when its word
 *    is already marked known on this device, and only with one of the alternatives
 *    the publisher supplied. The card says when that happened.
 *  - **Dictionary detail.** A word may carry a Wiktionary sense and the words it
 *    travels with from Datamuse. It is shown in a separate, attributed block under
 *    the authored teaching content, never in place of it.
 */
function WordTeaching({ word }: { word: SpeakBetterWord }) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="font-serif text-[26px] leading-tight text-ink sm:text-[30px]">{word.word}</h3>
        {word.partOfSpeech ? (
          <span className="text-[11px] font-medium uppercase tracking-wider text-accent-ink">{word.partOfSpeech}</span>
        ) : null}
        <span className="rounded-full border border-line px-2 py-0.5 text-[10.5px] uppercase tracking-wide text-ink-3">
          {word.tone}
        </span>
      </div>
      {word.pronunciation ? (
        <p className="mt-1 text-[12px] text-ink-3">
          <span className="font-medium">Say it: </span>
          {word.pronunciation}
        </p>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-xl border border-line bg-surface-2/40 p-3.5">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-3">Meaning</p>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink">{word.englishMeaning}</p>
        </div>
        <div className="rounded-xl border border-line bg-surface-2/40 p-3.5">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-3">हिंदी</p>
          <p lang="hi" className="mt-1.5 text-[13.5px] leading-relaxed text-ink">{word.hindiMeaning}</p>
        </div>
      </div>

      <p className="mt-4 text-[13px] leading-relaxed text-ink-2">
        <span className="font-medium text-ink">Nuance. </span>
        {word.nuance}
      </p>

      <div className="mt-4">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-3">Examples</p>
        <ul className="mt-2 space-y-2">
          {word.examples.map((example) => (
            <li key={example} className="break-words border-l-2 border-accent/40 pl-3 font-serif text-[14px] italic leading-relaxed text-ink-2">
              {example}
            </li>
          ))}
        </ul>
      </div>

      {word.collocations.length > 0 || word.idioms?.length ? (
        <div className="mt-4">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-3">Use it with</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {[...word.collocations, ...(word.idioms ?? []).map((idiom) => `idiom: ${idiom}`)].map((phrase) => (
              <li key={phrase} className="rounded-full bg-surface-2 px-2.5 py-1 text-[12px] text-ink-2">
                {phrase}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 space-y-2.5 text-[12.5px] leading-relaxed text-ink-2">
        {word.commonMistake ? (
          <p>
            <span className="font-medium text-ink">Common mistake. </span>
            {word.commonMistake}
          </p>
        ) : null}
        {word.differsFrom ? (
          <p>
            <span className="font-medium text-ink">Don’t confuse it with. </span>
            {word.differsFrom}
          </p>
        ) : null}
        {word.register ? (
          <p>
            <span className="font-medium text-ink">Register. </span>
            {word.register}
          </p>
        ) : null}
      </div>

      {word.dictionary ? (
        <div className="mt-4 rounded-lg border border-line/70 bg-surface-2/40 px-3 py-2.5 text-[11.5px] leading-relaxed text-ink-2">
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
    </div>
  );
}

export function SpeakBetterSection({
  lesson: publishedLesson,
  alternatives: publishedAlternatives = [],
}: {
  lesson: SpeakBetterLesson;
  alternatives?: SpeakBetterLesson[];
}) {
  const progress = useSyncExternalStore(
    subscribeSpeakBetterProgress,
    speakBetterProgressSnapshot,
    speakBetterServerSnapshot,
  );

  /*
    The library starts closed. It is a deliberate second step — the daily card is
    what a reader gets, and the shelf of every lesson is what they open when today's
    lesson is not the one they need.
  */
  const [libraryOpen, setLibraryOpen] = useState(false);
  const libraryPanelId = useId();

  /**
   * Snapshots written before the one-word schema are read as a single primary word
   * here, so an old published card still renders. Current lessons pass through.
   */
  const lesson = toCurrentLesson(publishedLesson);
  const alternatives = publishedAlternatives.map(toCurrentLesson);

  /**
   * Refinement is computed here rather than published: only the browser knows which
   * words this reader has marked known. `refineForReader` returns the published
   * lesson unchanged unless its word is already known.
   */
  const refined = refineForReader(lesson, [lesson, ...alternatives], Object.values(progress.words), '');
  const shown = refined.lesson;
  const target = primaryWord(shown);
  const band = bandOf(shown);

  /**
   * Opening the card is the point at which the reader has "met" this word, so it is
   * recorded as seen — the same ledger the library uses, which is what lets the
   * refinement above work tomorrow.
   */
  // Keyed on stable identifiers, not the lesson object: a legacy lesson is
  // re-normalised on each render and must not re-publish progress in a loop.
  useEffect(() => {
    const document = markSeen(speakBetterProgressSnapshot(), {
      id: target.id,
      lessonId: shown.id,
      word: target.word,
      level: band,
    });
    publishSpeakBetterProgress(document);
  }, [shown.id, target.id, target.word, band]);

  return (
    <SectionCard label="Speak Better">
      <div id="speak-better" className="space-y-5">
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

        {refined.replaced ? (
          <p className="rounded-lg border border-line bg-surface-2/50 px-3 py-2 text-[11.5px] leading-relaxed text-ink-3">
            {refined.reason ?? 'A lesson with a new word is shown because today’s published word was already known.'}
          </p>
        ) : null}


        <WordTeaching word={target} />

        {shown.relatedWords?.length ? (
          <div className="rounded-xl border border-line bg-surface-2/30 p-3.5">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-3">
              Related words, briefly
            </p>
            <ul className="mt-2 space-y-1.5">
              {shown.relatedWords.map((related) => (
                <li key={related.word} className="text-[12.5px] leading-relaxed text-ink-2">
                  <span className="font-medium text-ink">{related.word}</span>
                  <span className="text-ink-3"> — {related.note}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="rounded-xl border border-line bg-surface-2/40 p-3.5 sm:p-4">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-3">In a short conversation</p>
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
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-accent-ink">Speaking challenge</p>
          <p className="mt-1 text-[13px] leading-relaxed text-ink">{shown.challenge}</p>
          <p className="mt-1.5 text-[11.5px] text-ink-3">Say it out loud — the spoken half is the half that transfers.</p>
        </div>

        <p className="rounded-xl border border-accent/30 bg-accent-soft/25 px-3.5 py-3 text-[13px] leading-relaxed text-ink">
          <span className="font-medium text-accent-ink">Today’s focus: </span>
          {shown.focus}
        </p>

        <div className="rounded-xl border border-line bg-surface-2/30 p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <p className="text-[12.5px] leading-relaxed text-ink-2">
              Practising at another level? The library holds every lesson — search a word or a Hindi meaning, mark
              words known, and save them for later. Progress stays on this device.
            </p>
            <button
              type="button"
              onClick={() => setLibraryOpen((open) => !open)}
              aria-expanded={libraryOpen}
              aria-controls={libraryPanelId}
              className="shrink-0 rounded-full border border-accent/40 bg-accent-soft px-3 py-1.5 text-[12px] font-medium text-accent-ink transition-colors hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
            >
              {libraryOpen ? 'Hide the practice library' : 'Open the practice library'}
            </button>
          </div>
          {libraryOpen ? (
            <div id={libraryPanelId} className="mt-4 border-t border-line pt-4">
              <SpeakBetterLibrary />
            </div>
          ) : null}
        </div>
      </div>
    </SectionCard>
  );
}
