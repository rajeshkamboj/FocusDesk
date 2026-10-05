import Image from 'next/image';
import type { Quote } from '@/lib/quotes';

export function QuoteCard({ quote }: { quote: Quote }) {
  return (
    <figure className="quote-card relative isolate mt-6 overflow-hidden rounded-2xl border border-line bg-surface px-6 pb-16 pt-7 shadow-card sm:px-12 sm:pb-20 sm:pt-8">
      {/* Decorative background layer. It is absolutely positioned and inert, so
          it can never influence the quote's layout, and it sits behind the copy
          so the words stay the only thing the eye is asked to read. */}
      <Image
        src="/images/today/mountains-bg.webp"
        alt=""
        aria-hidden="true"
        fill
        sizes="(min-width: 640px) 704px, 100vw"
        className="quote-card__art pointer-events-none select-none object-cover object-bottom"
      />
      <span aria-hidden="true" className="quote-card__veil pointer-events-none absolute inset-0" />

      <blockquote className="relative z-10 mx-auto max-w-lg text-center">
        <p className="font-serif text-lg leading-relaxed text-ink sm:text-xl">“{quote.text}”</p>
      </blockquote>
      <figcaption className="relative z-10 mt-3 text-center text-xs text-ink-2">— {quote.author}</figcaption>
    </figure>
  );
}
