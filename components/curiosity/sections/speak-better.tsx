import { SectionCard, VisualMark } from '../section-card';
import { IconSpeech } from '@/components/ui/icons';
import type { SpeakBetterLesson, SpeakBetterWord } from '@/lib/curiosity/types';

/**
 * Speak Better — one lesson a day, laid out as a comparison.
 *
 * The lesson is full width on purpose: three to five words have to sit side by
 * side with an English meaning, a Hindi meaning, a line of nuance and example
 * sentences each, and none of that survives being squeezed into a half column.
 * From `lg` the word blocks form two comparison columns, with a hairline above
 * every block so the grid reads like a table without becoming one.
 */
function WordBlock({ word }: { word: SpeakBetterWord }) {
  return (
    <div className="border-t border-line pt-3">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <h3 className="text-[15px] font-medium text-ink">{word.word}</h3>
        <p lang="hi" className="break-words text-[13px] text-ink-2">{word.hindiMeaning}</p>
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
    </div>
  );
}

export function SpeakBetterSection({ lesson }: { lesson: SpeakBetterLesson }) {
  return (
    <SectionCard label="Speak Better">
      <div className="space-y-4">
        <div className="flex gap-3.5">
          <VisualMark>
            <IconSpeech width={18} height={18} />
          </VisualMark>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">Situation</p>
            <p className="mt-1 text-[13.5px] leading-relaxed text-ink-2">{lesson.situation}</p>
          </div>
        </div>

        <p className="rounded-xl border border-accent/30 bg-accent-soft/25 px-3.5 py-3 text-[13px] leading-relaxed text-ink">
          <span className="font-medium text-accent-ink">Today’s distinction: </span>
          {lesson.focus}
        </p>

        <ul className="grid gap-x-8 gap-y-4 lg:grid-cols-2">
          {lesson.words.map((word) => (
            <li key={word.word} className="min-w-0">
              <WordBlock word={word} />
            </li>
          ))}
        </ul>

        <div className="rounded-xl border border-line bg-surface-2/40 p-3.5 sm:p-4">
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
    </SectionCard>
  );
}
