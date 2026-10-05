import type { Quote } from '@/lib/quotes';

export function QuoteCard({ quote }: { quote: Quote }) {
  return (
    <figure className="quote-card relative mt-6 overflow-hidden rounded-2xl border border-line bg-surface px-6 pb-16 pt-7 shadow-card sm:px-12 sm:pb-20 sm:pt-8">
      <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 720 250" preserveAspectRatio="xMidYMax slice" fill="none">
        <circle cx="640" cy="54" r="27" fill="#edc775" opacity=".7" />
        <path d="M0 210 100 128 173 188 260 156 390 229 510 136 580 185 666 102 720 148V250H0Z" fill="#bfd4ce" />
        <path d="m0 203 107-38 150 70 115-28 88 24 125-55 135 43v31H0Z" fill="#8bb4a4" />
        <path d="M0 224q125-33 251 11t240-1 229-6v22H0Z" fill="#4c8872" />
        <path d="m37 237 0-86m-19 59 19-31 19 31m-34-18 15-28 15 28m-29 37 14-26 14 26" stroke="#30644f" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <blockquote className="relative mx-auto max-w-lg text-center">
        <p className="font-serif text-lg leading-relaxed text-ink sm:text-xl">“{quote.text}”</p>
      </blockquote>
      <figcaption className="relative mt-3 text-center text-xs text-ink-2">— {quote.author}</figcaption>
    </figure>
  );
}
