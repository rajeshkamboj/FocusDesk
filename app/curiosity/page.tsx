import type { Metadata } from 'next';
import { CuriosityScreen } from '@/components/curiosity/curiosity-screen';
import { getDailyBriefing } from '@/lib/curiosity/server';
import { publicationDate } from '@/lib/curiosity/schedule';

export const metadata: Metadata = {
  title: 'Curiosity',
};

export const dynamic = 'force-dynamic';

export default async function CuriosityPage() {
  // The publication day, not the UTC day: `toISOString().slice(0, 10)` would keep
  // showing yesterday’s briefing for the first 5h30m of every Indian morning.
  const date = publicationDate();
  const briefing = await getDailyBriefing(date);
  return <CuriosityScreen briefing={briefing} />;
}
