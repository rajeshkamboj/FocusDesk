import { getDailyBriefing } from '@/lib/curiosity/server';

export async function GET(request: Request) {
  const date = new URL(request.url).searchParams.get('date') ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
    return Response.json({ error: 'Invalid date' }, { status: 400 });
  }
  return Response.json(await getDailyBriefing(date));
}
