// An optional third way to run the schedule: a Supabase Edge Function called by
// Supabase Cron (pg_cron + pg_net — see the block at the end of
// supabase/migrations/009_curiosity_content.sql).
//
// It deliberately contains no content logic. The publisher lives in the app
// (lib/curiosity/job.ts), because that is where the pool, the sources and the
// briefing shape are; a second implementation here would drift from it within a
// month. This function is a caller: it presents the shared secret and passes the
// app's answer through.
//
// Deployment (needs the Supabase CLI and a linked project):
//   supabase functions deploy curiosity-refresh --no-verify-jwt
//   supabase secrets set APP_URL=https://<your-app-origin> CURIOSITY_CRON_SECRET=<secret>
//
// STATUS: not executed in this environment — it needs a Supabase project. It is
// offered as the documented option, not as something tested. The behaviour it
// relies on (the endpoint, the lease, the per-day idempotence) is exercised by
// scripts/verify-curiosity-automation.tsx, which calls those paths directly.

const APP_URL = (Deno.env.get('APP_URL') ?? '').replace(/\/$/, '');
const SECRET = Deno.env.get('CURIOSITY_CRON_SECRET') ?? '';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

Deno.serve(async (request: Request) => {
  if (!APP_URL || !SECRET) return json({ error: 'APP_URL and CURIOSITY_CRON_SECRET must both be set as function secrets.' }, 503);

  const scope = new URL(request.url).searchParams.get('scope') ?? 'all';
  if (!['all', 'daily', 'book'].includes(scope)) return json({ error: 'scope must be all, daily or book' }, 400);

  try {
    const response = await fetch(`${APP_URL}/api/curiosity/refresh?scope=${encodeURIComponent(scope)}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${SECRET}` },
      signal: AbortSignal.timeout(60_000),
    });
    const body = await response.text();
    // Passed through unchanged, including 502: that means "the refresh failed and
    // readers are still seeing the last published content", which pg_cron should
    // record as a failing run so it shows up in cron.job_run_details.
    return new Response(body, {
      status: response.status,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  } catch (error) {
    return json({ error: `Could not reach the app: ${error instanceof Error ? error.message : String(error)}` }, 502);
  }
});
