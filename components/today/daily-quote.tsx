'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Quote } from '@/lib/quotes';

/**
 * A thought for today — a compact editorial panel.
 * One step off the page background, a whisper of a border, a constrained
 * measure: clearly its own section, never a heavy card. The words carry it.
 * No shadow, no icons, no artwork — quieter than the dashboard cards around it.
 */
export function DailyQuote({ quote }: { quote: Quote }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const carry = useCallback(async () => {
    const payload = `“${quote.text}” — ${quote.author}`;
    try {
      await navigator.clipboard.writeText(payload);
    } catch {
      return;
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1800);
  }, [quote.author, quote.text]);

  return (
    <figure className="mt-8 w-full rounded-2xl border border-line bg-surface px-7 py-8 sm:px-9">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-3">
        A thought for today
      </p>
      <blockquote className="mt-3">
        <p className="max-w-[640px] text-[23px] font-normal leading-[1.35] tracking-[-0.01em] text-ink sm:text-[26px] lg:text-[28px]">
          {quote.text}
        </p>
      </blockquote>
      <figcaption className="mt-3 text-[13px] text-ink-3">{quote.author}</figcaption>
      <button
        type="button"
        onClick={carry}
        aria-live="polite"
        className="mt-3 text-[12.5px] font-medium text-ink-3 transition-colors hover:text-ink-2"
      >
        {copied ? 'Copied' : 'Carry this with you →'}
      </button>
    </figure>
  );
}
