/**
 * Which FocusDesk tabs are alive right now.
 *
 * WHY THIS EXISTS
 * ---------------
 * When FocusDesk opens it treats any task still marked running as a session
 * left behind by a page that died, and stops it at its last durable
 * checkpoint (`interruptedTimerPatch`). That is exactly right for a crashed or
 * closed app — and exactly wrong for a *second tab*, where the first tab is
 * alive and still timing. Without this module, opening a new tab pauses the
 * timers running in the old one, which would break the rule that no tab may
 * ever stop or pause another tab's task.
 *
 * WHAT IT IS NOT
 * --------------
 * This is not a lock, a leader election, or a sync channel. It answers one
 * question — "is another FocusDesk page currently alive?" — so recovery can
 * tell a dead app from a second window. It never decides who may run a timer:
 * any number of tabs may run any number of timers.
 *
 * It lives under its own key and is deliberately NOT part of `pace.db.v1`, so
 * it can never affect application data, export or import. A stale entry is
 * harmless: entries expire on their own, and the key is rewritten from scratch
 * whenever it cannot be parsed.
 */

const PRESENCE_KEY = 'pace.tabs.v1';

/**
 * How often a tab re-announces itself. Short enough that a crashed tab stops
 * looking alive quickly, and cheap: a few dozen bytes under its own key.
 */
export const PRESENCE_HEARTBEAT_MS = 3_000;

/**
 * How long an announcement stays valid. Deliberately equal to the timer
 * checkpoint interval, so the worst case this can cost — a tab that crashes
 * and is reopened before its entry expires, whose running timers are then
 * continued instead of being stopped — is bounded by the same interval the
 * checkpoint architecture already works to.
 */
export const PRESENCE_TTL_MS = 10_000;

type PresenceMap = Record<string, number>;

function storage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  } catch {
    /* storage unavailable (private mode, etc.) */
  }
  return null;
}

function readMap(): PresenceMap {
  const store = storage();
  if (!store) return {};
  try {
    const raw = store.getItem(PRESENCE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const map: PresenceMap = {};
    for (const [id, at] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof at === 'number' && Number.isFinite(at)) map[id] = at;
    }
    return map;
  } catch {
    return {};
  }
}

function writeMap(map: PresenceMap): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(PRESENCE_KEY, JSON.stringify(map));
  } catch {
    /* quota or storage error — presence is best-effort by design */
  }
}

/** Drop entries whose last announcement is older than the TTL. */
function withoutExpired(map: PresenceMap, nowMs: number): PresenceMap {
  const live: PresenceMap = {};
  for (const [id, at] of Object.entries(map)) {
    if (nowMs - at < PRESENCE_TTL_MS) live[id] = at;
  }
  return live;
}

/** A per-page identifier. Never persisted beyond this tab's presence entry. */
export function createTabId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Is another FocusDesk page alive right now?
 *
 * Expired entries are pruned as a side effect, so a tab that crashed stops
 * being counted without anyone having to clean up after it.
 */
export function otherTabAlive(selfId: string, nowMs: number = Date.now()): boolean {
  const live = withoutExpired(readMap(), nowMs);
  return Object.keys(live).some((id) => id !== selfId);
}

/** Announce this tab (and prune anything that has expired). */
export function announceTab(selfId: string, nowMs: number = Date.now()): void {
  const live = withoutExpired(readMap(), nowMs);
  live[selfId] = nowMs;
  writeMap(live);
}

/** Withdraw this tab — called when the page goes away. */
export function releaseTab(selfId: string, nowMs: number = Date.now()): void {
  const live = withoutExpired(readMap(), nowMs);
  delete live[selfId];
  writeMap(live);
}
