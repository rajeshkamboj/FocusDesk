import { Card, EmptyState } from '@/components/ui/card';
import { SectionTitle } from '@/components/layout/page-header';
import { IconBook, IconIdeas, IconProjects, IconReview } from '@/components/ui/icons';
import type { CuriosityBriefing, CuriosityNewsItem, DeveloperDiscovery } from '@/lib/curiosity/types';

function LinkOut({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover hover:underline">{children}</a>;
}

function VisualMark({ children, tone = 'bg-accent-soft text-accent' }: { children: React.ReactNode; tone?: string }) {
  return <div aria-hidden className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone}`}>{children}</div>;
}

function NewsItem({ item }: { item: CuriosityNewsItem }) {
  return <article className="border-b border-line py-4 last:border-0 first:pt-0 last:pb-0">
    <div className="flex gap-3"><VisualMark><span className="text-xs font-semibold">AI</span></VisualMark><div className="min-w-0"><LinkOut href={item.url}><h3 className="text-[15px] font-medium leading-snug text-ink">{item.title}</h3></LinkOut><p className="mt-1 text-[12px] text-ink-3">{item.source}{item.publishedAt ? ` · ${new Date(item.publishedAt).toLocaleDateString('en', { month: 'short', day: 'numeric' })}` : ''}</p></div></div>
    {item.summary ? <p className="mt-2 pl-12 text-[13px] leading-relaxed text-ink-2">{item.summary}</p> : null}
  </article>;
}

function RadarItem({ item }: { item: DeveloperDiscovery }) {
  return <article className="border-b border-line py-4 last:border-0 first:pt-0 last:pb-0"><div className="flex gap-3"><VisualMark tone="bg-surface-2 text-ink-2"><IconProjects width={17} height={17} /></VisualMark><div className="min-w-0"><LinkOut href={item.url}><h3 className="text-[15px] font-medium text-ink">{item.name}</h3></LinkOut><p className="mt-1 text-[13px] leading-relaxed text-ink-2">{item.description}</p></div></div><p className="mt-2 pl-12 text-[12px] leading-relaxed text-ink-3"><strong className="font-medium text-ink-2">Why it may help:</strong> {item.why} {item.pricing}</p></article>;
}

function SectionCard({ label, className = '', children }: { label: React.ReactNode; className?: string; children: React.ReactNode }) {
  return <Card className={`flex h-full flex-col p-4 sm:p-6 ${className}`}>
    <SectionTitle>{label}</SectionTitle>
    <div className="mt-3.5">{children}</div>
  </Card>;
}

export function CuriosityScreen({ briefing }: { briefing: CuriosityBriefing }) {
  return <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8 lg:px-10 lg:py-12">
    <header className="mb-8 max-w-2xl"><p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">Optional learning break</p><h1 className="text-[26px] font-semibold tracking-tight text-ink">Today&apos;s Curiosity</h1><p className="mt-2 text-sm leading-relaxed text-ink-2">A few things worth knowing today. This is a finite briefing, not a feed.</p><p className="mt-2 text-xs text-ink-3">{briefing.date}</p></header>

    <div className="space-y-7">
      <section><SectionCard label={<>AI World <span className="ml-2 font-normal tracking-normal text-ink-3">up to 10</span></>}>{briefing.aiWorld.length ? briefing.aiWorld.map((item) => <NewsItem key={`${item.source}-${item.url}`} item={item} />) : <EmptyState title="No AI updates available right now" hint="Sources could not be reached or had no meaningful recent developments." />}</SectionCard></section>

      <div className="grid gap-7 lg:grid-cols-2"><section className="h-full"><SectionCard label={<>Developer Radar <span className="ml-2 font-normal tracking-normal text-ink-3">up to 3</span></>}>{briefing.developerRadar.length ? briefing.developerRadar.map((item) => <RadarItem key={item.url} item={item} />) : <EmptyState title="Developer Radar is unavailable" hint="The source could not be reached. No unverified recommendations are shown." />}</SectionCard></section>

        <section className="h-full"><SectionCard label="One Thing Worth Knowing"><div className="flex gap-3"><VisualMark><IconIdeas width={18} height={18} /></VisualMark><h3 className="pt-1 text-[17px] font-medium leading-snug text-ink">{briefing.oneThing.title}</h3></div><p className="mt-4 text-sm leading-relaxed text-ink-2">{briefing.oneThing.explanation}</p>{briefing.oneThing.url ? <p className="mt-4 text-sm"><LinkOut href={briefing.oneThing.url}>Explore further →</LinkOut></p> : null}</SectionCard></section></div>

      <div className="grid gap-7 lg:grid-cols-2"><section className="h-full"><SectionCard label="One Book"><div className="flex gap-4"><VisualMark tone="bg-warning-soft text-warning"><IconBook width={18} height={18} /></VisualMark><div><LinkOut href={briefing.book.url}><h3 className="text-lg font-medium text-ink">{briefing.book.title}</h3></LinkOut><p className="mt-1 text-sm text-ink-2">by {briefing.book.author}</p></div></div><p className="mt-4 text-sm leading-relaxed text-ink-2">{briefing.book.description}</p><p className="mt-3 text-sm leading-relaxed text-ink-2"><strong className="font-medium text-ink">Why it may help:</strong> {briefing.book.why}</p></SectionCard></section>

        <section className="h-full"><SectionCard label="Learn Something"><div className="flex gap-3"><VisualMark tone="bg-surface-2 text-ink-2"><IconReview width={18} height={18} /></VisualMark><h3 className="pt-1 text-lg font-medium text-ink">{briefing.learning.topic}</h3></div><p className="mt-4 text-sm leading-relaxed text-ink-2">{briefing.learning.explanation}</p>{briefing.learning.url ? <p className="mt-4 text-sm"><LinkOut href={briefing.learning.url}>Read a source →</LinkOut></p> : null}</SectionCard></section></div>
    </div>
    <footer className="mt-10 border-t border-line pt-5 text-center text-sm text-ink-3">That&apos;s today&apos;s briefing.</footer>
  </div>;
}
