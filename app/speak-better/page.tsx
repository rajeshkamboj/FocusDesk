import type { Metadata } from 'next';
import { SpeakBetterScreen } from '@/components/curiosity/speak-better-screen';

export const metadata: Metadata = {
  title: 'Speak Better',
};

/**
 * The Speak Better practice library.
 *
 * Static content, no server work: the lessons live in typed data files under
 * `lib/curiosity/content/`, the components are client-side, and progress is
 * browser-local. Nothing here is fetched, so a visit costs no network request and
 * nothing can fail behind a source outage.
 */
export default function SpeakBetterPage() {
  return <SpeakBetterScreen />;
}
