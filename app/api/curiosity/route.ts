import { getDailyBriefing } from '@/lib/curiosity/server';
import { isIsoDate, publicationDate } from '@/lib/curiosity/schedule';

/**
 * The briefing for one day, as JSON.
 *
 * Used by an open tab when its date rolls over at midnight. The date must be a
 * real ISO day, and it is taken at face value: a request for a past or future day
 * gets the pool rotation for that day, never a publish. Only a request for the
 * current Asia/Kolkata day can trigger the once-a-day catch-up inside
 * `getDailyBriefing`.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const date = params.get('date') ?? publicationDate();
  if (!isIsoDate(date)) {
    return Response.json({ error: 'Invalid date' }, { status: 400, headers: { 'cache-control': 'no-store' } });
  }
  return Response.json(await getDailyBriefing(date), { headers: { 'cache-control': 'no-store' } });
}
