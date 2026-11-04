'use client';

import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/card';
import { Input } from '@/components/ui/form';
import { IconCheck, IconChevronDown, IconSpeech, IconStar } from '@/components/ui/icons';
import {
  SPEAK_BETTER_LEVELS,
  SPEAK_BETTER_LEVEL_LABELS,
  type SpeakBetterLevel,
  type SpeakBetterLesson,
  type SpeakBetterProgressEntry,
  type SpeakBetterTrackingState,
  type SpeakBetterWord,
} from '@/lib/curiosity/types';
import {
  filterLessons,
  levelOf,
  levelCounts,
  resolvedWords,
  wordProgressId,
} from '@/lib/curiosity/speak-better';
import {
  markSeen,
  progressSummary,
  publishSpeakBetterProgress,
  speakBetterProgressIsPersistent,
  speakBetterProgressSnapshot,
  speakBetterServerSnapshot,
  subscribeSpeakBetterProgress,
  toggleWordState,
  type SpeakBetterProgressDocument,
} from '@/lib/curiosity/speak-better-store';

type StateFilter = 'all' | SpeakBetterTrackingState;

const STATE_LABELS: Record<SpeakBetterTrackingState, string> = {
  seen: 'Seen',
  known: 'Known',
  saved: 'Saved',
  review: 'Review later',
};

/**
 * Speak Better — the practice library.
 *
 * The daily card on the Curiosity page still publishes one lesson a day from the
 * original A2–B1 corpus. This screen is the other half: every lesson, every
 * level, searchable, with four ways to track each word. It is a client
 * component over static typed content — nothing is fetched, and a visit costs no
 * network request.
 */
export function SpeakBetterLibrary() {
  const [level, setLevel] = useState<SpeakBetterLevel | 'all'>('all');
  const [query, setQuery] = useState('');
  const [stateFilter, setStateFilter] = useState<StateFilter>('all');

  /**
   * Progress is read through `useSyncExternalStore`, so the server render and the
   * hydrating client both start from an empty ledger and the stored one arrives
   * in the same commit — no hydration mismatch, no flash of untracked chips.
   */
  const document = useSyncExternalStore(
    subscribeSpeakBetterProgress,
    speakBetterProgressSnapshot,
    speakBetterServerSnapshot,
  );
  const summary = useMemo(() => progressSummary(document), [document]);

  const lessons = useMemo(
    () =>
      filterLessons({
        level,
        query,
        ...(stateFilter === 'all'
          ? {}
          : { onlyWordState: { state: stateFilter, progress: Object.values(document.words) } }),
      }),
    [level, query, stateFilter, document],
  );

  const counts = useMemo(() => levelCounts(), []);

  // True only when the browser refused to store the ledger (private mode,
  // quota). The screen says so instead of implying a save that did not happen.
  const [storageRefused, setStorageRefused] = useState(false);

  const commit = useCallback((next: SpeakBetterProgressDocument) => {
    publishSpeakBetterProgress(next);
    setStorageRefused(!speakBetterProgressIsPersistent());
  }, []);

  const toggle = useCallback(
    (lesson: SpeakBetterLesson, word: SpeakBetterWord & { id: string }, state: SpeakBetterTrackingState) => {
      const current = speakBetterProgressSnapshot();
      const next = toggleWordState(current, {
        id: word.id,
        lessonId: lesson.id,
        word: word.word,
        level: levelOf(lesson),
        state,
      });
      if (next !== current) commit(next);
    },
    [commit],
  );

  return (
    <div className="space-y-6">
      <section
        aria-label="Speak Better controls"
        className="space-y-3 rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5"
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setLevel('all')}
            aria-pressed={level === 'all'}
            className={`rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 ${
              level === 'all' ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line text-ink-2 hover:border-line-strong'
            }`}
          >
            All levels
          </button>
          {SPEAK_BETTER_LEVELS.map((band) => (
            <button
              key={band}
              type="button"
              onClick={() => setLevel(band)}
              aria-pressed={level === band}
              title={SPEAK_BETTER_LEVEL_LABELS[band]}
              className={`rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 ${
                level === band ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line text-ink-2 hover:border-line-strong'
              }`}
            >
              {band}
              <span className="ml-1.5 tabular-nums text-ink-3">{counts[band]}</span>
            </button>
          ))}
        </div>
        {level !== 'all' ? (
          <p className="text-[12px] text-ink-3">{SPEAK_BETTER_LEVEL_LABELS[level]}</p>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <label htmlFor="speak-better-search" className="sr-only">
              Search lessons and words
            </label>
            <Input
              id="speak-better-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search a word, a Hindi meaning, a mistake…"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setStateFilter('all')}
              aria-pressed={stateFilter === 'all'}
              className={`rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                stateFilter === 'all' ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line text-ink-2 hover:border-line-strong'
              }`}
            >
              Everything
            </button>
            {(Object.keys(STATE_LABELS) as SpeakBetterTrackingState[]).map((state) => (
              <button
                key={state}
                type="button"
                onClick={() => setStateFilter(state)}
                aria-pressed={stateFilter === state}
                className={`rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                  stateFilter === state ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line text-ink-2 hover:border-line-strong'
                }`}
              >
                {STATE_LABELS[state]}
                <span className="ml-1.5 tabular-nums text-ink-3">{summary[state]}</span>
              </button>
            ))}
          </div>
        </div>

        <p className="text-[12px] text-ink-3" aria-live="polite">
          {lessons.length === 0
            ? 'No lessons match.'
            : `${lessons.length} ${lessons.length === 1 ? 'lesson' : 'lessons'}${level === 'all' ? '' : ` at ${level}`}${
                query.trim() ? ` matching “${query.trim()}”` : ''
              }`}
          {stateFilter !== 'all' ? `, showing ${STATE_LABELS[stateFilter].toLowerCase()} words` : ''}.
        </p>
        {storageRefused ? (
          <p role="status" className="text-[12px] text-warning">
            Your browser is not saving this progress — it will be lost when you close the tab.
          </p>
        ) : null}
      </section>

      {lessons.length === 0 ? (
        <EmptyState
          icon={<IconSpeech width={24} height={24} />}
          title="Nothing to practise here yet"
          hint="Try another level, clear the search, or switch the word filter back to Everything."
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setQuery('');
                setLevel('all');
                setStateFilter('all');
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <ul className="space-y-4">
          {lessons.map((lesson) => (
            <li key={lesson.id}>
              <LessonCard lesson={lesson} progress={document} onToggle={toggle} onOpen={commit} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LessonCard({
  lesson,
  progress,
  onToggle,
  onOpen,
}: {
  lesson: SpeakBetterLesson;
  progress: SpeakBetterProgressDocument;
  onToggle: (
    lesson: SpeakBetterLesson,
    word: SpeakBetterWord & { id: string },
    state: SpeakBetterTrackingState,
  ) => void;
  /** Receives the ledger after this lesson's words are marked seen. */
  onOpen: (next: SpeakBetterProgressDocument) => void;
}) {
  // Collapsed by default: the library is for finding a lesson, and the daily card
  // is for reading one. Opening a lesson is one tap and remembered per session.
  const [open, setOpen] = useState(false);
  const band = levelOf(lesson);
  const words = resolvedWords(lesson);

  return (
    <article className="rounded-2xl border border-line bg-surface shadow-card" data-speak-better-lesson={lesson.id}>
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="accent">{band}</Badge>
          <h2 className="text-[15px] font-semibold text-ink">
            {words.map((word) => word.word).join(' · ')}
          </h2>
        </div>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{lesson.focus}</p>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-3">{lesson.situation}</p>

        <button
          type="button"
          onClick={() => {
            const nextOpen = !open;
            setOpen(nextOpen);
            // Opening a lesson is the moment the reader has met its words, so
            // that is when they are recorded as seen — not on page load, which
            // would claim thirty-two lessons were read before anything was.
            if (nextOpen) onOpen(markLessonSeen(lesson, speakBetterProgressSnapshot()));
          }}
          aria-expanded={open}
          aria-controls={`lesson-body-${lesson.id}`}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-[12.5px] font-medium text-accent transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
        >
          {open ? 'Hide the lesson' : 'Open the lesson'}
          <IconChevronDown width={13} height={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {open ? (
        <div id={`lesson-body-${lesson.id}`} className="space-y-4 border-t border-line px-4 py-4 sm:px-5">
          <ul className="grid gap-x-8 gap-y-5 lg:grid-cols-2">
            {words.map((word) => (
              <li key={word.id} className="min-w-0">
                <WordPanel
                  lesson={lesson}
                  word={word}
                  state={progress.words[word.id]?.state ?? null}
                  onToggle={(state) => onToggle(lesson, word, state)}
                />
              </li>
            ))}
          </ul>

          <div className="rounded-xl border border-line bg-surface-2/40 p-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">A short conversation</p>
            <div className="mt-2 space-y-1.5">
              {lesson.dialogue.map((line) => (
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
            <p className="mt-1 text-[13px] leading-relaxed text-ink">{lesson.challenge}</p>
            <p className="mt-1.5 text-[11.5px] text-ink-3">Say it out loud — the spoken half is the half that transfers.</p>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">
      <span className="font-medium text-ink-3">{label}: </span>
      {children}
    </p>
  );
}

function WordPanel({
  lesson,
  word,
  state,
  onToggle,
}: {
  lesson: SpeakBetterLesson;
  word: SpeakBetterWord & { id: string };
  state: SpeakBetterTrackingState | null;
  onToggle: (state: SpeakBetterTrackingState) => void;
}) {
  const band = levelOf(lesson);
  return (
    <div className="border-t border-line pt-3" data-speak-better-word={word.id}>
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <h3 className="text-[15px] font-medium text-ink">{word.word}</h3>
        {/* `lang="hi"` so the Devanagari is rendered and pronounced by the right font and voice. */}
        <p lang="hi" className="break-words text-[13px] text-ink-2">
          {word.hindiMeaning}
        </p>
      </div>
      {word.pronunciation ? (
        <p className="mt-1 break-words font-mono text-[11.5px] leading-relaxed text-ink-3">{word.pronunciation}</p>
      ) : null}

      <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">{word.englishMeaning}</p>
      <Line label="Nuance">{word.nuance}</Line>
      {word.differsFrom ? <Line label="Not the same as">{word.differsFrom}</Line> : null}
      {word.collocations && word.collocations.length > 0 ? (
        <Line label="Said with">
          <span className="italic">{word.collocations.join(' · ')}</span>
        </Line>
      ) : null}

      <ul className="mt-1.5 space-y-1">
        {word.examples.map((example) => (
          <li key={example} className="break-words font-serif text-[12.5px] italic leading-relaxed text-ink-3">
            “{example}”
          </li>
        ))}
      </ul>

      {word.commonMistake ? (
        <p className="mt-2 rounded-lg border border-warning/30 bg-warning-soft/30 px-2.5 py-2 text-[12px] leading-relaxed text-ink-2">
          <span className="font-medium text-ink">Watch out: </span>
          {word.commonMistake}
        </p>
      ) : null}
      {word.register ? <Line label="Where it fits">{word.register}</Line> : null}

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5" role="group" aria-label={`Track “${word.word}”`}>
        <TrackButton
          active={state === 'known'}
          onClick={() => onToggle('known')}
          label={`Mark “${word.word}” as known`}
          activeLabel={`“${word.word}” is marked known`}
        >
          <IconCheck width={12} height={12} /> Known
        </TrackButton>
        <TrackButton
          active={state === 'saved'}
          onClick={() => onToggle('saved')}
          label={`Save “${word.word}” for later`}
          activeLabel={`“${word.word}” is saved`}
        >
          <IconStar width={12} height={12} /> Save
        </TrackButton>
        <TrackButton
          active={state === 'review'}
          onClick={() => onToggle('review')}
          label={`Add “${word.word}” to review later`}
          activeLabel={`“${word.word}” is in review later`}
        >
          Review later
        </TrackButton>
        {state ? (
          <span className="text-[11px] text-ink-3" aria-live="polite">
            {state === 'review' ? 'In review later' : STATE_LABELS[state]}
            <span className="text-ink-3"> · {band}</span>
          </span>
        ) : (
          <span className="text-[11px] text-ink-3">Not tracked yet</span>
        )}
      </div>
    </div>
  );
}

function TrackButton({
  active,
  onClick,
  label,
  activeLabel,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  activeLabel: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={active ? activeLabel : label}
      className={`inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[11.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 ${
        active ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line text-ink-3 hover:border-line-strong hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Marking a lesson's words as seen happens when a lesson is opened, not when the
 * page loads: a library visit should not claim the reader has met thirty-two
 * lessons. Exported so the lesson card can call it, and so a test can drive it.
 */
export function markLessonSeen(
  lesson: SpeakBetterLesson,
  document: SpeakBetterProgressDocument,
): SpeakBetterProgressDocument {
  let next = document;
  for (const word of resolvedWords(lesson)) {
    next = markSeen(next, { id: word.id, lessonId: lesson.id, word: word.word, level: levelOf(lesson) });
  }
  return next === document ? document : next;
}

export { wordProgressId };
export type { SpeakBetterProgressEntry };
