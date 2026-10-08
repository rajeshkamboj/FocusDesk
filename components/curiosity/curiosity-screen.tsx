'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { useLocalDate } from '@/lib/use-local-date';
import { EmptyState } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DailyQuote } from './daily-quote';
import { SectionCard, VisualMark } from './section-card';
import { SectionGroup } from './sections/section-group';
import { SpeakBetterSection } from './sections/speak-better';
import { MythologySection } from './sections/mythology';
import { ScienceCard } from './sections/science';
import { getDailyQuote } from '@/lib/quotes';
import {
  IconBiology,
  IconBook,
  IconCalendar,
  IconChemistry,
  IconChevronDown,
  IconIdeas,
  IconPhysics,
  IconProjects,
  IconReview,
} from '@/components/ui/icons';
import type {
  BrainSharpener,
  CuriosityBriefing,
  CuriosityNewsItem,
  DeveloperDiscovery,
  HistoryEvent,
  LiteratureItem,
} from '@/lib/curiosity/types';

function LinkOut({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-accent transition-colors hover:text-accent-hover hover:underline"
    >
      {children}
    </a>
  );
}

function NewsItem({ item }: { item: CuriosityNewsItem }) {
  return (
    <article className="border-b border-line py-4 first:pt-0 last:border-0 last:pb-0">
      <div className="flex gap-3">
        <VisualMark>
          <span className="text-xs font-semibold">AI</span>
        </VisualMark>
        <div className="min-w-0">
          <LinkOut href={item.url}>
            <h3 className="text-[15px] font-medium leading-snug text-ink">
              {item.title}
            </h3>
          </LinkOut>
          <p className="mt-1 text-[12px] text-ink-3">
            {item.source}
            {item.publishedAt
              ? ` · ${new Date(item.publishedAt).toLocaleDateString('en', {
                  month: 'short',
                  day: 'numeric',
                })}`
              : ''}
          </p>
        </div>
      </div>
      {item.summary ? (
        <p className="mt-2 pl-12 text-[13px] leading-relaxed text-ink-2">
          {item.summary}
        </p>
      ) : null}
    </article>
  );
}

function RadarItem({ item }: { item: DeveloperDiscovery }) {
  return (
    <article className="border-b border-line py-4 first:pt-0 last:border-0 last:pb-0">
      <div className="flex gap-3">
        <VisualMark tone="bg-surface-2 text-ink-2">
          <IconProjects width={17} height={17} />
        </VisualMark>
        <div className="min-w-0">
          <LinkOut href={item.url}>
            <h3 className="text-[15px] font-medium text-ink">{item.name}</h3>
          </LinkOut>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
            {item.description}
          </p>
        </div>
      </div>
      <p className="mt-2 pl-12 text-[12px] leading-relaxed text-ink-3">
        <strong className="font-medium text-ink-2">Why it may help:</strong>{' '}
        {item.why} {item.pricing}
      </p>
    </article>
  );
}

function HistorySection({ event }: { event: HistoryEvent }) {
  return (
    <div className="space-y-3">
      <div className="flex gap-3.5">
        <VisualMark tone="bg-accent-soft text-accent">
          <IconCalendar width={18} height={18} />
        </VisualMark>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[17px] font-medium leading-snug text-ink">
              {event.title}
            </h3>
            <span className="rounded-md border border-line bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-2">
              {event.date} · {event.year}
            </span>
          </div>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">
            {event.explanation}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-line bg-surface-2/50 p-3.5 sm:ml-12 sm:p-4">
        <p className="text-[12.5px] leading-relaxed text-ink-2">
          <strong className="font-medium text-ink">Why it matters:</strong>{' '}
          {event.significance}
        </p>
        {event.url ? (
          <p className="mt-2 text-[12.5px]">
            <LinkOut href={event.url}>Read more about this milestone →</LinkOut>
            {event.url.startsWith('https://en.wikipedia.org/') ? (
              <span className="mt-1 block text-[11px] text-ink-2">Source: Wikipedia contributors · <LinkOut href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</LinkOut></span>
            ) : null}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function LiteratureSection({ item }: { item: LiteratureItem }) {
  return (
    <div className="space-y-3">
      <div className="flex gap-3.5">
        <VisualMark tone="bg-warning-soft text-warning">
          <IconBook width={18} height={18} />
        </VisualMark>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-medium leading-snug text-ink">
            {item.title}
          </h3>
          <p className="mt-0.5 text-[13px] text-ink-3">
            by <span className="font-medium text-ink-2">{item.author}</span>
            {item.eraOrCountry ? ` · ${item.eraOrCountry}` : ''}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-line bg-surface-2/40 p-4">
        <p className="whitespace-pre-line font-serif text-[13.5px] italic leading-relaxed text-ink">
          {item.passage}
        </p>
        {item.attribution ? <p className="mt-2 text-[11px] leading-relaxed text-ink-2">{item.attribution}</p> : null}
      </div>

      <p className="text-[13px] leading-relaxed text-ink-2">
        <strong className="font-medium text-ink">Why read it:</strong>{' '}
        {item.whyItMatters}
      </p>

      {item.url ? (
        <p className="text-sm">
          <LinkOut href={item.url}>Explore the work →</LinkOut>
        </p>
      ) : null}
    </div>
  );
}

function BrainSharpenerSection({ sharpener }: { sharpener: BrainSharpener }) {
  const [showSolution, setShowSolution] = useState(false);
  const solutionId = useId();

  return (
    <div className="space-y-3.5">
      <div className="flex gap-3.5">
        <VisualMark tone="bg-surface-2 text-ink-2">
          <IconReview width={18} height={18} />
        </VisualMark>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[17px] font-medium leading-snug text-ink">
              {sharpener.title}
            </h3>
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-wider text-accent-ink">
              {sharpener.subject}
            </span>
          </div>
          <p className="text-[12px] text-ink-3">{sharpener.topic}</p>
        </div>
      </div>

      <p className="text-[13.5px] leading-relaxed text-ink">
        {sharpener.problem}
      </p>

      {sharpener.givenInfo && sharpener.givenInfo.length > 0 ? (
        <div className="space-y-1 rounded-xl border border-line/70 bg-surface-2/40 px-3.5 py-2.5 text-[11.5px] text-ink-2">
          <p className="font-medium text-ink-3">Given information:</p>
          <ul className="list-inside list-disc space-y-0.5 font-mono text-[11px]">
            {sharpener.givenInfo.map((info, idx) => (
              <li key={idx}>{info}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          aria-expanded={showSolution}
          aria-controls={solutionId}
          onClick={() => setShowSolution((v) => !v)}
          className="gap-1.5"
        >
          <IconChevronDown
            width={14}
            height={14}
            className={`transition-transform duration-150 ${showSolution ? 'rotate-180' : ''}`}
          />
          {showSolution ? 'Hide solution' : 'Show solution'}
        </Button>
      </div>

      {showSolution ? (
        <div id={solutionId} className="space-y-2.5 rounded-xl border border-accent/30 bg-accent-soft/25 p-3.5 animate-fade-in sm:p-4">
          {sharpener.hint ? (
            <div className="border-b border-accent/20 pb-2 text-[12px] text-ink-2">
              <strong className="font-medium text-accent-ink">Hint:</strong>{' '}
              {sharpener.hint}
            </div>
          ) : null}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent-ink">
              Step-by-Step Solution
            </p>
            <p className="mt-1 whitespace-pre-line font-mono text-[12.5px] leading-relaxed text-ink">
              {sharpener.solution}
            </p>
          </div>
          <div className="border-t border-accent/20 pt-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent-ink">
              Final Answer
            </p>
            <p className="mt-0.5 text-[13.5px] font-semibold text-ink">
              {sharpener.answer}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function CuriosityScreen({ briefing: initialBriefing }: { briefing: CuriosityBriefing }) {
  const date = useLocalDate(initialBriefing.date);
  const [briefing, setBriefing] = useState(initialBriefing);
  const dailyQuote = useMemo(() => getDailyQuote(date), [date]);
  useEffect(() => {
    if (date === briefing.date) return;
    const controller = new AbortController();
    void fetch(`/api/curiosity?date=${date}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Briefing unavailable');
        return response.json() as Promise<CuriosityBriefing>;
      })
      .then(setBriefing)
      .catch(() => { /* Keep the explicitly dated previous briefing while offline. */ });
    return () => controller.abort();
  }, [date, briefing.date]);
  return (
    <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8 lg:px-10 lg:py-12">
      <header className="mb-8 max-w-2xl">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
          Optional learning break
        </p>
        <h1 className="text-[26px] font-semibold tracking-tight text-ink">
          Today&apos;s Curiosity
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">
          A few things worth knowing today. This is a finite briefing, not a feed.
        </p>
        <p className="mt-2 text-xs text-ink-3">{briefing.date}</p>
      </header>

      <div className="space-y-7">
        {/* A Thought for Today */}
        <section>
          <DailyQuote quote={dailyQuote} />
        </section>

        {/* ---- Group: the existing daily highlights ------------------- */}
        <SectionGroup flush label="Daily highlights" hint="history, AI world and today’s picks" />

        {/* 1. Today in History */}
        {briefing.history ? (
          <section>
            <SectionCard label="Today in History">
              <HistorySection event={briefing.history} />
            </SectionCard>
          </section>
        ) : (<SectionCard label="Today in History"><p className="text-sm text-ink-2">Today’s historical source is temporarily unavailable. Please check back later.</p></SectionCard>)}

        {/* 2. AI World (Existing) */}
        <section>
          <SectionCard
            label={
              <>
                AI World{' '}
                <span className="ml-2 font-normal tracking-normal text-ink-3">
                  up to 10
                </span>
              </>
            }
          >
            {briefing.aiWorld && briefing.aiWorld.length ? (
              briefing.aiWorld.map((item) => (
                <NewsItem key={`${item.source}-${item.url}`} item={item} />
              ))
            ) : (
              <EmptyState
                title="No AI updates available right now"
                hint="Authoritative AI sources could not be reached. Please check back later."
              />
            )}
          </SectionCard>
        </section>

        {/* 3. Developer Radar & One Thing Worth Knowing (Existing) */}
        <div className="grid gap-7 lg:grid-cols-2">
          <section className="h-full">
            <SectionCard
              label={
                <>
                  Developer Radar{' '}
                  <span className="ml-2 font-normal tracking-normal text-ink-3">
                    up to 3
                  </span>
                </>
              }
            >
              {briefing.developerRadar && briefing.developerRadar.length ? (
                briefing.developerRadar.map((item) => (
                  <RadarItem key={item.url} item={item} />
                ))
              ) : (
                <EmptyState
                  title="Developer Radar is unavailable"
                  hint="The source could not be reached. No unverified recommendations are shown."
                />
              )}
            </SectionCard>
          </section>

          <section className="h-full">
            <SectionCard label="One Thing Worth Knowing">
              <div className="flex gap-3">
                <VisualMark>
                  <IconIdeas width={18} height={18} />
                </VisualMark>
                <h3 className="pt-1 text-[17px] font-medium leading-snug text-ink">
                  {briefing.oneThing.title}
                </h3>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-ink-2">
                {briefing.oneThing.explanation}
              </p>
              {briefing.oneThing.url ? (
                <p className="mt-4 text-sm">
                  <LinkOut href={briefing.oneThing.url}>
                    Explore further →
                  </LinkOut>
                </p>
              ) : null}
            </SectionCard>
          </section>
        </div>

        {/* ---- Group: Speak Better ------------------------------------ */}
        <SectionGroup label="Speak better" hint="practical spoken English, one situation a day" />

        <section>
          <SpeakBetterSection lesson={briefing.speakBetter} />
        </section>

        {/* ---- Group: Mythology --------------------------------------- */}
        <SectionGroup label="Mythology" hint="character of the day, with its evidence labelled" />

        <section>
          <MythologySection character={briefing.mythology} />
        </section>

        {/* ---- Group: Science ----------------------------------------- */}
        <SectionGroup label="Science" hint="chemistry, physics and biology, one card each" />

        <div className="grid gap-7 lg:grid-cols-3">
          <section className="h-full">
            <ScienceCard
              label="Chemistry of the Day"
              connectionLabel="Everyday connection"
              icon={<IconChemistry width={18} height={18} />}
              concept={briefing.chemistry}
            />
          </section>
          <section className="h-full">
            <ScienceCard
              label="Physics of the Day"
              connectionLabel="Real-world connection"
              icon={<IconPhysics width={18} height={18} />}
              concept={briefing.physics}
            />
          </section>
          <section className="h-full">
            <ScienceCard
              label="Biology of the Day"
              connectionLabel="Everyday connection"
              icon={<IconBiology width={18} height={18} />}
              concept={briefing.biology}
            />
          </section>
        </div>

        {/* ---- Group: Reading & practice ------------------------------ */}
        <SectionGroup label="Reading & practice" hint="reading, developer tools and brain sharpeners" />

        {/* 4. A Few Minutes of Literature & One Book */}
        <div className="grid gap-7 lg:grid-cols-2">
          {briefing.literature ? (
            <section className="h-full">
              <SectionCard label="A Few Minutes of Literature">
                <LiteratureSection item={briefing.literature} />
              </SectionCard>
            </section>
          ) : null}

          <section className="h-full">
            <SectionCard label="One Book">
              <div className="flex gap-4">
                <VisualMark tone="bg-warning-soft text-warning">
                  <IconBook width={18} height={18} />
                </VisualMark>
                <div>
                  <LinkOut href={briefing.book.url}>
                    <h3 className="text-lg font-medium text-ink">
                      {briefing.book.title}
                    </h3>
                  </LinkOut>
                  <p className="mt-1 text-sm text-ink-2">
                    by {briefing.book.author}
                  </p>
                </div>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-ink-2">
                {briefing.book.description}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-ink-2">
                <strong className="font-medium text-ink">
                  Why it may help:
                </strong>{' '}
                {briefing.book.why}
              </p>
            </SectionCard>
          </section>
        </div>

        {/* 5. Brain Sharpener & Learn Something */}
        <div className="grid gap-7 lg:grid-cols-2">
          {briefing.sharpener ? (
            <section className="h-full">
              <SectionCard label="Brain Sharpener">
                <BrainSharpenerSection key={`${briefing.date}-${briefing.sharpener.id}`} sharpener={briefing.sharpener} />
              </SectionCard>
            </section>
          ) : null}

          <section className="h-full">
            <SectionCard label="Learn Something">
              <div className="flex gap-3">
                <VisualMark tone="bg-surface-2 text-ink-2">
                  <IconReview width={18} height={18} />
                </VisualMark>
                <h3 className="pt-1 text-lg font-medium text-ink">
                  {briefing.learning.topic}
                </h3>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-ink-2">
                {briefing.learning.explanation}
              </p>
              {briefing.learning.url ? (
                <p className="mt-4 text-sm">
                  <LinkOut href={briefing.learning.url}>
                    Read a source →
                  </LinkOut>
                </p>
              ) : null}
            </SectionCard>
          </section>
        </div>
      </div>

      <footer className="mt-10 border-t border-line pt-5 text-center text-sm text-ink-3">
        That&apos;s today&apos;s briefing.
      </footer>
    </div>
  );
}
