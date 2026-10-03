import { CuriosityScreen } from '@/components/curiosity/curiosity-screen';
import { getDailyBriefing } from '@/lib/curiosity/server';

export const dynamic = 'force-dynamic';

export default async function CuriosityPage() {
  const date = new Date().toISOString().slice(0, 10);
  const briefing = await getDailyBriefing(date);
  return <CuriosityScreen briefing={briefing} />;
}
