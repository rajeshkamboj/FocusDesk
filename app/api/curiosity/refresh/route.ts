import { authorizeRefresh } from '@/lib/curiosity/refresh-auth';
import { normalizeScope, runCuriosityRefresh, getCuriosityStatus } from '@/lib/curiosity/job';
import { clearBriefingMemo } from '@/lib/curiosity/server';

/**
 * The scheduler’s door.
 *
 * `GET` exists because cron senders issue GET; `POST` exists for the Settings
 * button and for any caller that prefers it. Both do the same thing, and both are
 * authorized by `authorizeRefresh` — see lib/curiosity/refresh-auth.ts.
 *
 * Query parameters:
 *   scope=daily|book|all   which record to refresh (default `all`)
 *   force=1                publish even if today’s record already exists
 *   action=status          read-only: what is published, where, and the last runs
 *
 * `force` is administrative: a scheduled run never needs it, and the idempotence
 * check is exactly what makes a double-fired cron harmless.
 *
 * The response is the run summary. A failed run returns 502 with the reason and
 * leaves the published content exactly as it was; an unneeded run returns 200
 * with `already-published`, because "the schedule fired twice" is a success case.
 */

const NO_STORE = { 'cache-control': 'no-store, max-age=0' } as const;

async function handle(request: Request) {
  const authorization = await authorizeRefresh(request);
  if (!authorization.ok) {
    return Response.json({ error: authorization.reason }, { status: authorization.status, headers: { ...NO_STORE } });
  }

  const params = new URL(request.url).searchParams;
  if (params.get('action') === 'status') {
    const status = await getCuriosityStatus();
    return Response.json({ ...status, triggeredBy: authorization.via }, { headers: { ...NO_STORE } });
  }

  const summary = await runCuriosityRefresh({
    scope: normalizeScope(params.get('scope')),
    force: params.get('force') === '1' || params.get('force') === 'true',
    // A signed-in user or a local developer is an administrative action; the
    // shared cron secret is the schedule speaking. The distinction is recorded on
    // the snapshot so a published day says who published it.
    trigger: authorization.via === 'cron-secret' ? 'cron' : 'admin',
  });
  clearBriefingMemo();

  const status = summary.status === 'failed' ? 502 : 200;
  return Response.json({ ...summary, triggeredBy: authorization.via }, { status, headers: { ...NO_STORE } });
}

export { handle as GET, handle as POST };
