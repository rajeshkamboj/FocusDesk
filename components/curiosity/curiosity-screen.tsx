'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { IconChevronDown, IconLink } from '@/components/ui/icons';
import { formatLongDate } from '@/lib/dates';
import type { CuriousBriefing } from '@/lib/curiosity/types';

/* ------------------------------------------------------------------ */
/* Subtle Calm Illustrations                                          */
/* ------------------------------------------------------------------ */

function HistoryIllustration() {
  return (
    <div aria-hidden className="flex h-20 w-full items-center justify-center rounded-xl bg-accent-soft/40 text-accent sm:h-24">
      <svg width="140" height="54" viewBox="0 0 140 54" fill="none" xmlns="http://www.w3.org/2000/svg" className="opacity-90">
        {/* Ancient column & globe / timeline motif */}
        <circle cx="70" cy="27" r="16" className="stroke-accent/50 fill-surface" strokeWidth="1.5" />
        <ellipse cx="70" cy="27" rx="16" ry="6" className="stroke-accent/40" strokeWidth="1" strokeDasharray="2 2" />
        <line x1="70" y1="11" x2="70" y2="43" className="stroke-accent/40" strokeWidth="1" />
        {/* Column left */}
        <rect x="22" y="18" width="12" height="24" rx="1" className="stroke-accent fill-surface" strokeWidth="1.2" />
        <line x1="18" y1="18" x2="38" y2="18" className="stroke-accent" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="18" y1="42" x2="38" y2="42" className="stroke-accent" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="26" y1="21" x2="26" y2="39" className="stroke-accent/40" strokeWidth="1" />
        <line x1="30" y1="21" x2="30" y2="39" className="stroke-accent/40" strokeWidth="1" />
        {/* Scroll right */}
        <path d="M104 18 C 100 18, 98 22, 102 26 L 118 26 C 122 26, 122 32, 118 32 L 102 32 C 98 32, 98 38, 102 38 L 122 38" className="stroke-accent" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        {/* Horizon */}
        <line x1="6" y1="47" x2="134" y2="47" className="stroke-line-strong/60" strokeWidth="1" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function ReadingIllustration() {
  return (
    <div aria-hidden className="flex h-20 w-full items-center justify-center rounded-xl bg-accent-soft/40 text-accent sm:h-24">
      <svg width="140" height="54" viewBox="0 0 140 54" fill="none" xmlns="http://www.w3.org/2000/svg" className="opacity-90">
        {/* Open book & quill */}
        <path d="M70 38 C 58 32, 40 32, 28 35 L 28 17 C 40 14, 58 14, 70 20 C 82 14, 100 14, 112 17 L 112 35 C 100 32, 82 32, 70 38 Z" className="stroke-accent fill-surface" strokeWidth="1.4" strokeLinejoin="round" />
        <line x1="70" y1="20" x2="70" y2="38" className="stroke-accent" strokeWidth="1.2" />
        {/* Subtle page lines */}
        <line x1="36" y1="22" x2="62" y2="24" className="stroke-accent/30" strokeWidth="1" />
        <line x1="36" y1="26" x2="62" y2="28" className="stroke-accent/30" strokeWidth="1" />
        <line x1="78" y1="24" x2="104" y2="22" className="stroke-accent/30" strokeWidth="1" />
        <line x1="78" y1="28" x2="104" y2="26" className="stroke-accent/30" strokeWidth="1" />
        {/* Quill */}
        <path d="M116 10 C 114 16, 110 24, 104 30 L 102 34 L 106 32 C 110 26, 118 18, 122 8 Z" className="stroke-accent/70 fill-accent-soft/60" strokeWidth="1" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function BrainIllustration({ subject }: { subject: 'mathematics' | 'physics' }) {
  return (
    <div aria-hidden className="flex h-20 w-full items-center justify-center rounded-xl bg-accent-soft/40 text-accent sm:h-24">
      <svg width="140" height="54" viewBox="0 0 140 54" fill="none" xmlns="http://www.w3.org/2000/svg" className="opacity-90">
        {subject === 'mathematics' ? (
          <>
            {/* Geometric compass & right triangle */}
            <path d="M25 40 L 55 40 L 25 18 Z" className="stroke-accent fill-surface" strokeWidth="1.2" strokeLinejoin="round" />
            <path d="M25 36 L 29 36 L 29 40" className="stroke-accent/60" strokeWidth="1" />
            {/* Compass */}
            <circle cx="95" cy="14" r="3" className="stroke-accent fill-surface" strokeWidth="1.2" />
            <line x1="94" y1="17" x2="80" y2="40" className="stroke-accent" strokeWidth="1.4" strokeLinecap="round" />
            <line x1="96" y1="17" x2="110" y2="40" className="stroke-accent" strokeWidth="1.4" strokeLinecap="round" />
            <path d="M84 32 C 92 35, 98 35, 106 32" className="stroke-accent/40" strokeWidth="1" />
            {/* Mathematical symbols */}
            <text x="64" y="28" className="fill-accent text-[12px] font-serif italic">Σ</text>
            <text x="63" y="42" className="fill-accent/70 text-[11px] font-serif italic">∫</text>
          </>
        ) : (
          <>
            {/* Pendulum / optics & waves */}
            <line x1="20" y1="12" x2="60" y2="12" className="stroke-line-strong" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="40" y1="12" x2="52" y2="34" className="stroke-accent" strokeWidth="1.2" />
            <circle cx="54" cy="38" r="5" className="stroke-accent fill-accent-soft" strokeWidth="1.2" />
            <path d="M30 42 C 40 45, 54 45, 62 42" className="stroke-accent/30" strokeWidth="1" strokeDasharray="2 2" />
            {/* Prism / Waves right */}
            <path d="M85 38 C 92 28, 98 48, 105 38 C 112 28, 118 48, 125 38" className="stroke-accent" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            <text x="96" y="22" className="fill-accent text-[11px] font-sans font-medium">λ</text>
            <text x="75" y="24" className="fill-accent/70 text-[11px] font-sans font-medium">ΔE</text>
          </>
        )}
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Curious Screen Component                                           */
/* ------------------------------------------------------------------ */

export function CuriosityScreen({ briefing }: { briefing: CuriousBriefing }) {
  const [hintOpen, setHintOpen] = useState(false);
  const [solutionOpen, setSolutionOpen] = useState(false);
  const { history, reading, exercise } = briefing;

  const displayDate = briefing.date ? formatLongDate(briefing.date) : 'Today';

  return (
    <div className="mx-auto w-full max-w-3xl px-5 pb-16 pt-8 sm:px-8 sm:pb-24 sm:pt-10">
      {/* Header */}
      <header className="mb-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
          Daily Learning Briefing
        </p>
        <h1 className="mt-1.5 text-[26px] font-semibold tracking-tight text-ink sm:text-[28px]">
          Curious
        </h1>
        <p className="mt-1 text-sm text-ink-2">
          A daily dose of learning, ideas and inspiration.
        </p>
        <p className="mt-1 text-[11.5px] text-ink-3">{displayDate}</p>
      </header>

      <div className="space-y-8">
        {/* ------------------------------------------------------------ */}
        {/* A. TODAY IN HISTORY                                          */}
        {/* ------------------------------------------------------------ */}
        <section>
          <Card className="p-6 sm:p-8">
            <HistoryIllustration />

            <div className="mt-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
                  Today in History
                </span>
                <span className="rounded-md border border-line bg-surface-2 px-2 py-0.5 text-[11.5px] font-medium text-ink-2">
                  {history.year}
                </span>
              </div>

              <h2 className="mt-2 text-[19px] font-semibold leading-snug tracking-tight text-ink sm:text-[21px]">
                {history.title}
              </h2>

              <p className="mt-3 text-[14px] leading-relaxed text-ink-2 sm:text-[14.5px]">
                {history.explanation}
              </p>

              <div className="mt-4 rounded-xl border border-line/80 bg-surface-2/60 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">
                  Why It Matters
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
                  {history.significance}
                </p>
              </div>

              {history.url ? (
                <div className="mt-4 pt-2">
                  <a
                    href={history.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent transition-colors hover:text-accent-hover hover:underline"
                  >
                    Read more about this milestone <IconLink width={13} height={13} />
                  </a>
                </div>
              ) : null}
            </div>
          </Card>
        </section>

        {/* ------------------------------------------------------------ */}
        {/* B. TODAY'S READING                                           */}
        {/* ------------------------------------------------------------ */}
        <section>
          <Card className="p-6 sm:p-8">
            <ReadingIllustration />

            <div className="mt-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
                  Today&apos;s Reading
                </span>
                {reading.eraOrCountry ? (
                  <span className="text-[11.5px] text-ink-3">
                    {reading.eraOrCountry}
                  </span>
                ) : null}
              </div>

              <h2 className="mt-2 text-[19px] font-semibold leading-snug tracking-tight text-ink sm:text-[21px]">
                {reading.title}
              </h2>
              <p className="mt-0.5 text-[13.5px] text-ink-3 font-medium">
                by {reading.author}
              </p>

              {/* Passage / excerpt */}
              <div className="mt-4 rounded-xl border border-line bg-surface-2/40 p-4 sm:p-5">
                <p className="whitespace-pre-line text-[14px] leading-relaxed text-ink italic font-serif">
                  {reading.passage}
                </p>
              </div>

              <div className="mt-4">
                <p className="text-[13px] leading-relaxed text-ink-2">
                  <strong className="font-medium text-ink">Why read it:</strong> {reading.whyItMatters}
                </p>
              </div>

              {reading.url ? (
                <div className="mt-4 pt-2">
                  <a
                    href={reading.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent transition-colors hover:text-accent-hover hover:underline"
                  >
                    Read the work <IconLink width={13} height={13} />
                  </a>
                </div>
              ) : null}
            </div>
          </Card>
        </section>

        {/* ------------------------------------------------------------ */}
        {/* C. BRAIN EXERCISE                                            */}
        {/* ------------------------------------------------------------ */}
        <section>
          <Card className="p-6 sm:p-8">
            <BrainIllustration subject={exercise.subject} />

            <div className="mt-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
                    Brain Exercise
                  </span>
                  <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-wider text-accent-ink">
                    {exercise.subject}
                  </span>
                </div>
                <span className="text-[11.5px] text-ink-3">
                  {exercise.topic}
                </span>
              </div>

              <h2 className="mt-2 text-[19px] font-semibold leading-snug tracking-tight text-ink sm:text-[21px]">
                {exercise.title}
              </h2>

              <p className="mt-3 text-[14px] leading-relaxed text-ink sm:text-[14.5px]">
                {exercise.problem}
              </p>

              {exercise.givenInfo && exercise.givenInfo.length > 0 ? (
                <div className="mt-3.5 space-y-1 rounded-xl border border-line/70 bg-surface-2/40 px-3.5 py-2.5 text-[12px] text-ink-2">
                  <p className="font-medium text-ink-3">Given information & formulas:</p>
                  <ul className="list-inside list-disc space-y-0.5 font-mono text-[11.5px]">
                    {exercise.givenInfo.map((info, i) => (
                      <li key={i}>{info}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {/* Action buttons: Hint and Solution */}
              <div className="mt-5 flex flex-wrap items-center gap-2.5">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setHintOpen((v) => !v)}
                  className="gap-1.5"
                >
                  <IconChevronDown
                    width={14}
                    height={14}
                    className={`transition-transform duration-150 ${hintOpen ? 'rotate-180' : ''}`}
                  />
                  {hintOpen ? 'Hide Hint' : 'Show Hint'}
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setSolutionOpen((v) => !v)}
                  className="gap-1.5"
                >
                  <IconChevronDown
                    width={14}
                    height={14}
                    className={`transition-transform duration-150 ${solutionOpen ? 'rotate-180' : ''}`}
                  />
                  {solutionOpen ? 'Hide Solution' : 'Reveal Solution'}
                </Button>
              </div>

              {/* Hint Box */}
              {hintOpen ? (
                <div className="mt-3.5 rounded-xl border border-line bg-surface-2/70 p-4 animate-fade-in">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">
                    Hint
                  </p>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
                    {exercise.hint}
                  </p>
                </div>
              ) : null}

              {/* Solution Box */}
              {solutionOpen ? (
                <div className="mt-3.5 space-y-3 rounded-xl border border-accent/30 bg-accent-soft/30 p-4 animate-fade-in">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent-ink">
                      Step-by-Step Derivation
                    </p>
                    <p className="mt-1.5 whitespace-pre-line text-[13px] leading-relaxed text-ink font-mono">
                      {exercise.solution}
                    </p>
                  </div>
                  <div className="border-t border-accent/20 pt-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent-ink">
                      Final Answer
                    </p>
                    <p className="mt-0.5 text-[14px] font-semibold text-ink">
                      {exercise.answer}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          </Card>
        </section>
      </div>

      {/* Finite briefing footer */}
      <footer className="mt-12 border-t border-line pt-6 text-center text-xs text-ink-3">
        That&apos;s today&apos;s briefing. Come back tomorrow for a new set.
      </footer>
    </div>
  );
}
