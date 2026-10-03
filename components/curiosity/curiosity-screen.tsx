import { Card, EmptyState } from '@/components/ui/card';
import { SectionTitle } from '@/components/layout/page-header';
import type { CuriosityBriefing, CuriosityNewsItem, DeveloperDiscovery } from '@/lib/curiosity/types';

function LinkOut({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover hover:underline">{children}</a>;
}

function NewsItem({ item }: { item: CuriosityNewsItem }) {
  return <article className="border-b border-line py-4 last:border-0 first:pt-0 last:pb-0">
    <LinkOut href={item.url}><h3 className="text-[15px] font-medium leading-snug text-ink">{item.title}</h3></LinkOut>
    <p className="mt-1 text-[12px] text-ink-3">{item.source}{item.publishedAt ? ` · ${new Date(item.publishedAt).toLocaleDateString('en', { month: 'short', day: 'numeric' })}` : ''}</p>
    {item.summary ? <p className="mt-2 text-[13px] leading-relaxed text-ink-2">{item.summary}</p> : null}
  </article>;
}

function RadarItem({ item }: { item: DeveloperDiscovery }) {
  return <article className="border-b border-line py-4 last:border-0 first:pt-0 last:pb-0"><LinkOut href={item.url}><h3 className="text-[15px] font-medium text-ink">{item.name}</h3></LinkOut><p className="mt-1 text-[13px] leading-relaxed text-ink-2">{item.description}</p><p className="mt-2 text-[12px] text-ink-3"><strong className="font-medium text-ink-2">Why it may help:</strong> {item.why} {item.pricing}</p></article>;
}

export function CuriosityScreen({ briefing }: { briefing: CuriosityBriefing }) {
  return <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8 lg:px-10 lg:py-12">
    <header className="mb-9 max-w-2xl"><p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">Optional learning break</p><h1 className="text-[26px] font-semibold tracking-tight text-ink">Today&apos;s Curiosity</h1><p className="mt-2 text-sm leading-relaxed text-ink-2">A few things worth knowing today. This is a finite briefing, not a feed.</p><p className="mt-2 text-xs text-ink-3">{briefing.date}</p></header>

    <div className="space-y-8">
      <section><SectionTitle>Today&apos;s Gurbani</SectionTitle><div className="mt-3">{briefing.gurbani ? <Card className="p-5 sm:p-6"><p className="text-xl leading-loose text-ink" lang="pa">{briefing.gurbani.text}</p><p className="mt-3 text-xs text-ink-3">Ang {briefing.gurbani.ang} · <LinkOut href={briefing.gurbani.url}>{briefing.gurbani.source}</LinkOut></p><div className="mt-5 grid gap-4 border-t border-line pt-4 sm:grid-cols-2"><div><p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">Short translation</p><p className="mt-1 text-sm leading-relaxed text-ink-2">{briefing.gurbani.translation}</p></div><div><p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">Context</p><p className="mt-1 text-sm leading-relaxed text-ink-2">{briefing.gurbani.explanation}</p></div></div></Card> : <EmptyState title="Gurbani is unavailable right now" hint="The authoritative source could not be reached. Nothing has been substituted." />}</div></section>

      <section><SectionTitle>AI World <span className="ml-2 font-normal tracking-normal text-ink-3">up to 10</span></SectionTitle><Card className="mt-3 p-5 sm:p-6">{briefing.aiWorld.length ? briefing.aiWorld.map((item) => <NewsItem key={`${item.source}-${item.url}`} item={item} />) : <EmptyState title="No AI updates available right now" hint="Sources could not be reached. Check back later; this briefing never invents news." />}</Card></section>

      <div className="grid gap-8 lg:grid-cols-2"><section><SectionTitle>3 Things Worth Watching <span className="ml-2 font-normal tracking-normal text-ink-3">up to 3</span></SectionTitle><div className="mt-3">{briefing.videos.length ? <Card className="divide-y divide-line p-5">{briefing.videos.map((video) => <article key={video.url} className="py-3 first:pt-0 last:pb-0"><LinkOut href={video.url}><h3 className="text-[15px] font-medium text-ink">{video.title}</h3></LinkOut><p className="mt-1 text-xs text-ink-3">{video.source}</p><p className="mt-2 text-[13px] leading-relaxed text-ink-2">{video.why}</p></article>)}</Card> : <EmptyState title="No videos selected today" hint="Video sources are optional, so this section stays empty rather than becoming a feed." />}</div></section>
        <section><SectionTitle>Developer Radar</SectionTitle><Card className="mt-3 p-5 sm:p-6">{briefing.developerRadar.length ? briefing.developerRadar.map((item) => <RadarItem key={item.url} item={item} />) : <EmptyState title="Developer Radar is unavailable" hint="The source could not be reached. No unverified recommendations are shown." />}</Card></section></div>

      <div className="grid gap-8 lg:grid-cols-2"><section><SectionTitle>One Book</SectionTitle><Card className="mt-3 p-5 sm:p-6"><LinkOut href={briefing.book.url}><h3 className="text-lg font-medium text-ink">{briefing.book.title}</h3></LinkOut><p className="mt-1 text-sm text-ink-2">by {briefing.book.author}</p><p className="mt-4 text-sm leading-relaxed text-ink-2">{briefing.book.description}</p><p className="mt-3 text-sm leading-relaxed text-ink-2"><strong className="font-medium text-ink">Why it may help:</strong> {briefing.book.why}</p></Card></section><section><SectionTitle>Learn Something</SectionTitle><Card className="mt-3 p-5 sm:p-6"><h3 className="text-lg font-medium text-ink">{briefing.learning.topic}</h3><p className="mt-4 text-sm leading-relaxed text-ink-2">{briefing.learning.explanation}</p>{briefing.learning.url ? <p className="mt-4 text-sm"><LinkOut href={briefing.learning.url}>Read a source →</LinkOut></p> : null}</Card></section></div>
    </div>
    <footer className="mt-12 border-t border-line pt-6 text-center text-sm text-ink-3">That&apos;s today&apos;s briefing.</footer>
  </div>;
}
