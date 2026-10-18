import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';

/**
 * Who may start a Curiosity refresh.
 *
 * The endpoint is a *trigger*, and the distinction matters. Two paths are
 * accepted, and both of them fail closed:
 *
 *  - **`CURIOSITY_CRON_SECRET`** — the shared secret a scheduler sends as
 *    `Authorization: Bearer <secret>`. Vercel Cron cannot present a user session,
 *    so a header is the only portable option; the comparison is constant-time so
 *    the endpoint does not leak the secret one matching byte at a time. Set in
 *    the deployment environment only, never in a `NEXT_PUBLIC_*` variable.
 *  - **A signed-in app user** — the Settings page passes the caller’s own Supabase
 *    access token and it is verified server-side with `auth.getUser()`. It is the
 *    user’s token, not the app’s: nothing privileged is ever placed in client
 *    code, and the service-role key stays on the server, used only by the store.
 *
 * When neither exists — no secret and no Supabase project — production refuses
 * the request with 503 rather than allowing anonymous writes to an endpoint that
 * reaches external APIs. Outside production the local app has no accounts at all
 * (its data lives in the browser), so an unauthenticated refresh is allowed; that
 * bypass is limited by `NODE_ENV` and is called out in the response so nobody
 * mistakes a working local button for a configured production one.
 */

export type RefreshAuthorization =
  | { ok: true; via: 'cron-secret' | 'app-user' | 'local-dev'; account?: string }
  | { ok: false; status: 401 | 503; reason: string };

function bearer(request: Request): string | null {
  const header = request.headers.get('authorization') ?? request.headers.get('Authorization');
  if (!header) return null;
  const [scheme, value] = header.trim().split(/\s+/, 2);
  return scheme?.toLowerCase() === 'bearer' && value ? value.trim() : null;
}

function secretsMatch(candidate: string, expected: string): boolean {
  const a = Buffer.from(candidate.slice(0, 512), 'utf8');
  const b = Buffer.from(expected.slice(0, 512), 'utf8');
  // Equal-length buffers first, so the comparison itself cannot time the length.
  if (a.length !== b.length) {
    timingSafeEqual(Buffer.alloc(32), Buffer.alloc(32));
    return false;
  }
  return timingSafeEqual(a, b);
}

export function cronSecretConfigured(): boolean {
  return Boolean((process.env.CURIOSITY_CRON_SECRET ?? '').trim());
}

export async function authorizeRefresh(request: Request): Promise<RefreshAuthorization> {
  const token = bearer(request);
  const secret = (process.env.CURIOSITY_CRON_SECRET ?? '').trim();
  if (secret && token && secretsMatch(token, secret)) return { ok: true, via: 'cron-secret' };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (token && url && publishable) {
    try {
      const supabase = createClient(url, publishable, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data, error } = await supabase.auth.getUser(token);
      if (!error && data.user) return { ok: true, via: 'app-user', account: data.user.email ?? data.user.id };
    } catch {
      // A Supabase that cannot answer is an authorization failure, not a pass.
    }
    return { ok: false, status: 401, reason: 'That token is not a signed-in Focus Desk user.' };
  }

  if (process.env.NODE_ENV !== 'production') return { ok: true, via: 'local-dev' };

  return {
    ok: false,
    status: 503,
    reason: secret
      ? 'No refresh credential matched: send the CURIOSITY_CRON_SECRET bearer token, or sign in.'
      : 'Refresh is not enabled. Set CURIOSITY_CRON_SECRET for the scheduler, or configure Supabase so signed-in users can trigger it.',
  };
}
