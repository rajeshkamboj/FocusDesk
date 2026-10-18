'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth/auth-provider';
import { getSupabaseBrowserClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { SectionTitle } from '@/components/layout/page-header';
import { formatPublicationDate, formatPublicationInstant } from '@/lib/curiosity/schedule';
import { ORIGIN_WORDS, type SectionOrigins } from '@/lib/curiosity/origins';

/**
 * Curiosity content — the administrative refresh.
 *
 * A testing and recovery affordance, not a feature readers need: it shows what the
 * scheduler has actually published, and lets the owner run the job on demand.
 *
 * It is not a privileged control, and it is careful not to become one:
 *
 *  - The browser holds no secret. When the app is signed in to Supabase the request
 *    carries the *user's own* access token, which the route verifies before it does
 *    anything; `CURIOSITY_CRON_SECRET` and the service-role key live only in the
 *    deployment environment and are never sent here or rendered.
 *  - In local mode (no Supabase project) there is no session to present, so the
 *    request goes without one — accepted only because a development server has no
 *    users to be unauthorized. `triggeredBy` in the response says which path was
 *    taken, so nobody reads a working button as proof that production is locked down.
 *  - Nothing destructive is offered. "Publish today" is the same call the cron
 *    makes; it cannot clear or edit content, and a failed run leaves the current
 *    day's briefing on screen.
 *
 * Everything reported here is read from the store or returned by the run itself — never
 * inferred from a config file, an environment variable's presence, or a 200 status. The
 * two places where a panel like this usually lies are durability ("we saved it", on a
 * filesystem that will not keep it) and the scheduler ("it runs at midnight", which no
 * process inside the app can observe). Both are stated as what they are.
 */

type Status = {
  store: { kind: string; location: string; durability?: string; durable?: boolean };
  today: string;
  scheduler: {
    cronSecretConfigured: boolean;
    autoPublish: boolean;
    schedule: string;
    timezone: string;
    lastPublishAt?: string | null;
    provenActive?: boolean;
  };
  daily: {
    published: boolean;
    date?: string;
    publishedAt?: string;
    contentIds?: Record<string, string>;
    degraded?: string[];
    sections?: SectionOrigins;
    complete?: boolean;
  } | null;
  book: { published: boolean; date?: string; publishedAt?: string; contentId?: string; source?: string; nextChangeAfter?: string } | null;
  pool: Record<string, { eligible: number; total: number }>;
  runs: { at: string; trigger: string; ok: boolean; detail: string }[];
  triggeredBy?: string;
};

type Summary = {
  status: string;
  date: string;
  detail: string;
  triggeredBy?: string;
  store?: { kind: string; location: string; durability?: string; durable?: boolean };
  daily?: { published: boolean; reason?: string; detail?: string; degraded?: string[] };
  book?: { published: boolean; reason?: string; detail?: string; cover?: boolean };
  error?: string;
};

type Probe = { name: string; url: string; ok: boolean; status: number | null; ms: number; note: string };
type ProbeResult = { checkedAt: string; probes: Probe[]; store?: Status['store']; scheduler?: Status['scheduler'] };

const ENDPOINT = '/api/curiosity/refresh';

const DURABILITY_WORDS: Record<string, string> = {
  shared: 'durable and shared — every instance and restart reads the same record',
  'single-host': 'this machine only — a restart keeps it, another instance will not see it',
  'instance-only': 'ephemeral — it disappears when this instance stops',
  unproven: 'nothing has been written from this process yet',
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
      <span className="text-[11.5px] text-ink-3">{label}</span>
      <span className="min-w-0 text-right text-[12px] text-ink-2">{value}</span>
    </div>
  );
}

export function CuriosityRefreshSettings() {
  const { user } = useAuth();
  const [status, setStatus] = useState<Status | null>(null);
  const [result, setResult] = useState<Summary | null>(null);
  const [probes, setProbes] = useState<ProbeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'status' | 'daily' | 'book' | 'probe' | null>(null);

  /**
   * The caller's own Supabase access token, when there is a session. It is the
   * same token every other request in the app already carries — not an API key, and
   * the route verifies it server-side rather than trusting the client's word. With
   * no session (local mode) nothing is attached and the route decides whether that
   * is acceptable.
   */
  const call = useCallback(async (query: string, method: 'GET' | 'POST' = 'GET') => {
    const session = isSupabaseConfigured() ? await getSupabaseBrowserClient().auth.getSession() : null;
    const token = session?.data.session?.access_token;
    const response = await fetch(`${ENDPOINT}?${query}`, {
      method,
      headers: token ? { authorization: `Bearer ${token}` } : undefined,
      cache: 'no-store',
    });
    const body = (await response.json().catch(() => null)) as (Status & Summary & ProbeResult) | null;
    if (!response.ok) {
      throw new Error(body && 'error' in body && typeof body.error === 'string' ? body.error : `Refresh endpoint returned ${response.status}.`);
    }
    return body;
  }, []);

  const requestStatus = useCallback(async () => (await call('action=status')) as unknown as Status, [call]);

  // The state updates happen in the promise callbacks rather than in the effect
  // body, so opening Settings does one read and one render, not a cascade.
  useEffect(() => {
    let cancelled = false;
    void requestStatus()
      .then((body) => {
        if (cancelled) return;
        setStatus(body);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Status unavailable');
      });
    return () => {
      cancelled = true;
    };
  }, [requestStatus]);

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await requestStatus());
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Status unavailable');
    }
  }, [requestStatus]);

  /**
   * The administrative run. `force=1` is what makes it useful for testing: it
   * publishes now instead of reporting that today already exists. Idempotence
   * still applies to everything else — the lease is taken, so a manual click
   * during a scheduled run is refused rather than interleaved.
   */
  const run = async (scope: 'all' | 'book') => {
    setBusy(scope === 'book' ? 'book' : 'daily');
    setError(null);
    try {
      // The publish is reported from the *body*, and the status is then re-read from the
      // store: a 200 whose payload says `failed` is a failure, and the panel must show the
      // record instead of the transport.
      const published = (await call(`scope=${scope}&force=1`, 'POST')) as unknown as Summary;
      setResult(published);
      setStatus((await call('action=status')) as unknown as Status);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Refresh failed');
    } finally {
      setBusy(null);
    }
  };

  const checkSources = async () => {
    setBusy('probe');
    setError(null);
    try {
      setProbes((await call('action=probe')) as unknown as ProbeResult);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Source check failed');
    } finally {
      setBusy(null);
    }
  };

  const lastAttempt = status?.runs?.[0] ?? null;
  const schedulerLine = status
    ? status.scheduler.cronSecretConfigured
      ? `${status.scheduler.schedule} UTC (${status.scheduler.timezone} midnight) · secret configured`
      : status.scheduler.autoPublish
        ? 'no cron secret — the first request of the day publishes instead'
        : 'no cron secret and catch-up is off — content changes only when something calls the endpoint'
    : null;

  return (
    <section>
      <SectionTitle>Curiosity content</SectionTitle>
      <div className="mt-3 rounded-2xl border border-line bg-surface p-5 shadow-card">
        <div className="flex flex-wrap gap-2.5">
          <Button variant="secondary" onClick={() => void run('all')} disabled={busy !== null}>
            {busy === 'daily' ? 'Publishing…' : 'Publish today'}
          </Button>
          <Button variant="secondary" onClick={() => void run('book')} disabled={busy !== null}>
            {busy === 'book' ? 'Refreshing…' : 'New book now'}
          </Button>
          <Button variant="ghost" onClick={() => void loadStatus()} disabled={busy !== null}>
            Re-check status
          </Button>
          <Button variant="ghost" onClick={() => void checkSources()} disabled={busy !== null}>
            {busy === 'probe' ? 'Checking sources…' : 'Check sources'}
          </Button>
        </div>

        <div className="mt-4 space-y-1.5 text-[11.5px] leading-relaxed text-ink-3">
          {error ? <p className="text-[12px] text-danger">Status unavailable: {error}</p> : null}
          {status ? (
            <>
              <Row label="Store" value={`${status.store.kind} · ${status.store.location}`} />
              <Row
                label="Persistence"
                value={DURABILITY_WORDS[status.store.durability ?? 'unproven'] ?? status.store.durability ?? 'unknown'}
              />
              <Row label="Publication day" value={`${formatPublicationDate(status.today)} · ${status.scheduler.timezone}`} />
              <Row
                label="Daily snapshot"
                value={
                  status.daily
                    ? `${formatPublicationDate(status.daily.date ?? '')}, published ${formatPublicationInstant(status.daily.publishedAt ?? '')}${
                        status.daily.complete === false ? ' · some cards used fallback' : ' · every card has content'
                      }`
                    : 'not published yet — showing the built-in rotation'
                }
              />
              {status.daily?.sections ? (
                <Row
                  label="Cards"
                  value={(Object.entries(status.daily.sections) as [keyof SectionOrigins, string][]).map(([section, origin]) => (
                    <span key={section} className="ml-2 whitespace-nowrap">
                      {section === 'aiWorld' ? 'AI World' : section === 'developerRadar' ? 'Radar' : 'History'}:{' '}
                      {ORIGIN_WORDS[origin as keyof typeof ORIGIN_WORDS] ?? origin}
                    </span>
                  ))}
                />
              ) : null}
              <Row
                label="One Book"
                value={
                  status.book
                    ? `${formatPublicationDate(status.book.date ?? '')} · ${status.book.source ?? 'curated'} · next ${formatPublicationDate(status.book.nextChangeAfter ?? '')}`
                    : 'not published yet'
                }
              />
              <Row
                label="Pool"
                value={Object.entries(status.pool)
                  .map(([category, counts]) => `${category} ${counts.eligible}/${counts.total}`)
                  .join(' · ')}
              />
              <Row label="Last attempt" value={lastAttempt ? `${formatPublicationInstant(lastAttempt.at)} · ${lastAttempt.ok ? 'ok' : 'failed'} — ${lastAttempt.detail}` : 'nothing has run in this record'} />
              <Row label="Schedule" value={schedulerLine ?? ''} />
              <Row
                label="Scheduler observed"
                value={
                  status.scheduler.provenActive
                    ? 'reported active'
                    : `not observable from inside the app — last publish visible: ${
                        status.scheduler.lastPublishAt ? formatPublicationInstant(status.scheduler.lastPublishAt) : 'never'
                      }`
                }
              />
              <Row label="Authorized as" value={user?.email ? `signed-in user (${user.email})` : 'local mode — no session token was sent'} />
              {status.daily?.degraded?.length ? (
                <p>
                  Last publish degraded: {status.daily.degraded.join('; ')}
                </p>
              ) : null}
              {status.runs?.length ? (
                <ul className="mt-2 space-y-1 border-t border-line pt-2">
                  {status.runs.slice(0, 3).map((run) => (
                    <li key={run.at}>
                      {formatPublicationInstant(run.at)} · {run.trigger} · {run.ok ? 'ok' : 'failed'} — {run.detail}
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <p>{busy === 'status' ? 'Reading the published record…' : 'The refresh endpoint did not answer, so there is nothing to show yet.'}</p>
          )}
          {probes ? (
            <ul className="mt-2 space-y-1 border-t border-line pt-2">
              <li className="text-ink-3">Sources as seen from this server at {formatPublicationInstant(probes.checkedAt)}:</li>
              {probes.probes.map((probe) => (
                <li key={probe.url || probe.name}>
                  <span className={probe.ok ? 'text-ink-2' : 'text-danger'}>{probe.ok ? 'reachable' : 'not reachable'}</span>{' '}
                  · {probe.name} · {probe.ms}ms · {probe.note}
                </li>
              ))}
            </ul>
          ) : null}
          {result ? (
            <p className="mt-2 rounded-lg border border-line bg-surface-2/60 px-3 py-2 text-[11.5px] text-ink-2">
              <span className="font-medium text-ink">{result.status}</span>
              {result.triggeredBy ? ` · authorized as ${result.triggeredBy}` : ''} · {result.detail}
              {result.daily?.detail ? ` Daily: ${result.daily.detail}.` : ''}
              {result.book?.detail ? ` Book: ${result.book.detail}.` : ''}
              {result.store ? ` Written to ${result.store.kind} (${result.store.location}).` : ''}
            </p>
          ) : null}
          <p>
            The daily scheduler posts to <span className="font-mono text-[10.5px]">/api/curiosity/refresh</span> at{' '}
            {status?.scheduler.schedule ?? '30 18 * * *'} UTC, which is 00:00 in Asia/Kolkata year-round. Publishing is
            idempotent per day and runs under a lease, so a double fire or a concurrent manual click changes nothing.
            See <span className="font-medium text-ink-2">docs/curiosity-content-automation.md</span>.
          </p>
        </div>
      </div>
    </section>
  );
}
