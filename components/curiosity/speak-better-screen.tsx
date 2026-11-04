'use client';

import { PageHeader } from '@/components/layout/page-header';
import { SpeakBetterLibrary } from './speak-better-library';

/**
 * The page around the library. It keeps the app's existing screen frame — the
 * same width, padding and `PageHeader` every other section uses — so a reader
 * arriving from the sidebar sees the same workspace rather than a second design.
 */
export function SpeakBetterScreen() {
  return (
    <div className="mx-auto w-full max-w-4xl px-5 pb-10 pt-8 sm:px-8 sm:pb-16 sm:pt-10">
      <PageHeader
        title="Speak Better"
        subtitle="Practical spoken English, by level. Search a word, meet its Hindi meaning, see the mistake people actually make — then say it out loud."
      />
      <SpeakBetterLibrary />
    </div>
  );
}
