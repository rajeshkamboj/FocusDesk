import type { Quote } from '@/lib/quotes';

export function QuoteCard({ quote }: { quote: Quote }) {
  return (
    <figure className="quote-card relative isolate mt-6 overflow-hidden rounded-2xl border border-line bg-surface px-6 pb-16 pt-7 shadow-card sm:px-12 sm:pb-20 sm:pt-8">
      <blockquote className="relative z-10 mx-auto max-w-lg text-center">
        <p className="font-sans text-lg leading-relaxed text-ink sm:text-xl">“{quote.text}”</p>
      </blockquote>
      <figcaption className="relative z-10 mt-3 text-center font-sans text-xs text-ink-2">— {quote.author}</figcaption>
    </figure>
  );
}
