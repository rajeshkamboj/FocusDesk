/**
 * Brain Sharpener progress: what this device has already attempted.
 *
 * WHY A LEDGER IS NEEDED AT ALL
 * The daily puzzle is chosen at publish time and stored in the snapshot, so without
 * a local record a reader who solved Tuesday's puzzle would meet it again on the day
 * it is re-published, and the "try another challenge" button would have no way to
 * avoid handing back the same puzzle. This is the smallest record that fixes both:
 * puzzle id, when it was first attempted, and when it was last attempted.
 *
 * WHERE IT LIVES
 * `localStorage`, under one versioned key, exactly like the Speak Better word
 * ledger. There is deliberately **no table and no migration**: attempts are personal
 * reading history, not user-authored work, and the RLS review that would be needed
 * before writing per-user rows is still open. A corrupt or older document is read as
 * empty rather than throwing, and nothing here can lose the published snapshot.
 */

export const SHARPENER_PROGRESS_KEY = 'pace.sharpener.progress.v1';
export const SHARPENER_PROGRESS_VERSION = 1;

export interface SharpenerAttempt {
  id: string;
  firstAttemptedAt: string;
  lastAttemptedAt: string;
  /** How many times it has been opened. */
  attempts: number;
  /** Set when the reader reported solving it. */
  solvedAt?: string;
}

export interface SharpenerProgressDocument {
  version: number;
  updatedAt: string;
  attempts: Record<string, SharpenerAttempt>;
}

export function emptySharpenerProgress(): SharpenerProgressDocument {
  return { version: SHARPENER_PROGRESS_VERSION, updatedAt: new Date(0).toISOString(), attempts: {} };
}

/** Read any stored document into the current shape. Total: never throws. */
export function normalizeSharpenerProgress(raw: unknown, now = new Date().toISOString()): SharpenerProgressDocument {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptySharpenerProgress();
  const record = raw as Record<string, unknown>;
  const attempts: Record<string, SharpenerAttempt> = {};
  const incoming = record.attempts;
  if (incoming && typeof incoming === 'object' && !Array.isArray(incoming)) {
    for (const [id, value] of Object.entries(incoming as Record<string, unknown>)) {
      if (!id || typeof id !== 'string') continue;
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const entry = value as Record<string, unknown>;
      const first = typeof entry.firstAttemptedAt === 'string' && entry.firstAttemptedAt ? entry.firstAttemptedAt : now;
      const last = typeof entry.lastAttemptedAt === 'string' && entry.lastAttemptedAt ? entry.lastAttemptedAt : first;
      attempts[id] = {
        id,
        firstAttemptedAt: first,
        lastAttemptedAt: last,
        attempts: typeof entry.attempts === 'number' && entry.attempts > 0 ? Math.floor(entry.attempts) : 1,
        ...(typeof entry.solvedAt === 'string' && entry.solvedAt ? { solvedAt: entry.solvedAt } : {}),
      };
    }
  }
  return {
    version: SHARPENER_PROGRESS_VERSION,
    updatedAt: typeof record.updatedAt === 'string' && record.updatedAt ? record.updatedAt : now,
    attempts,
  };
}

/** Record that a puzzle was opened. Idempotent within the same minute. */
export function markAttempted(
  document: SharpenerProgressDocument,
  id: string,
  now = new Date().toISOString(),
): SharpenerProgressDocument {
  if (!id) return document;
  const existing = document.attempts[id];
  return {
    version: SHARPENER_PROGRESS_VERSION,
    updatedAt: now,
    attempts: {
      ...document.attempts,
      [id]: existing
        ? { ...existing, lastAttemptedAt: now, attempts: existing.attempts + 1 }
        : { id, firstAttemptedAt: now, lastAttemptedAt: now, attempts: 1 },
    },
  };
}

export function markSolved(
  document: SharpenerProgressDocument,
  id: string,
  now = new Date().toISOString(),
): SharpenerProgressDocument {
  if (!id) return document;
  const existing = document.attempts[id]
    ?? { id, firstAttemptedAt: now, lastAttemptedAt: now, attempts: 1 };
  return {
    version: SHARPENER_PROGRESS_VERSION,
    updatedAt: now,
    attempts: { ...document.attempts, [id]: { ...existing, solvedAt: now } },
  };
}

export function attemptedIds(document: SharpenerProgressDocument): string[] {
  return Object.keys(document.attempts);
}

export function hasAttempted(document: SharpenerProgressDocument, id: string): boolean {
  return Boolean(document.attempts[id]);
}

/** Attempt/solve counts, for the quiet line under the card. */
export function sharpenerSummary(document: SharpenerProgressDocument): { attempted: number; solved: number } {
  const entries = Object.values(document.attempts);
  return {
    attempted: entries.length,
    solved: entries.filter((entry) => Boolean(entry.solvedAt)).length,
  };
}

export interface ProgressStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStorage(): ProgressStorage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadSharpenerProgress(
  storage: ProgressStorage | null = defaultStorage(),
): { document: SharpenerProgressDocument; persistent: boolean } {
  if (!storage) return { document: emptySharpenerProgress(), persistent: false };
  try {
    const raw = storage.getItem(SHARPENER_PROGRESS_KEY);
    if (!raw) return { document: emptySharpenerProgress(), persistent: true };
    return { document: normalizeSharpenerProgress(JSON.parse(raw)), persistent: true };
  } catch {
    return { document: emptySharpenerProgress(), persistent: false };
  }
}

export function saveSharpenerProgress(
  document: SharpenerProgressDocument,
  storage: ProgressStorage | null = defaultStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(SHARPENER_PROGRESS_KEY, JSON.stringify(document));
    return true;
  } catch {
    return false;
  }
}
