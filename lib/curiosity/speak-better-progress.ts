/**
 * Speak Better progress: Seen / Known / Saved / Review later.
 *
 * WHY THIS IS NOT IN `AppData`
 * Progress here is per *word*, not per lesson, and it is a personal reading
 * ledger rather than user-authored work. It follows the same shape as the
 * notification ledger (`lib/notification-store.ts`, IndexedDB) and the timer
 * dock preference: browser-side, per device, additive, and impossible to lose
 * user data with.
 *
 * There is deliberately **no migration and no new table**. The reason is not
 * laziness: a new `speak_better_progress` table would need a user-scoped RLS
 * policy, a grant review (the anon-grant audit is still open), and a backfill
 * question. Until that review happens, progress lives in one JSON document in
 * localStorage under a single versioned key, and this module owns every read and
 * write of it.
 *
 * COMPATIBILITY IS THE POINT
 * The key is versioned and the reader is total:
 *
 *   - a document written by an older build with fewer states is read as-is;
 *   - a document with an unknown state is dropped per-entry, not per-document;
 *   - a corrupt document yields an empty ledger rather than an exception;
 *   - the A2–B1 lessons keep their original ids, so progress recorded against
 *     them before this feature existed would still resolve — and because this is
 *     the first version of the ledger, nothing is ever reset by the B2–C2
 *     addition.
 */

import {
  SPEAK_BETTER_TRACKING_STATES,
  type SpeakBetterLevel,
  type SpeakBetterProgressEntry,
  type SpeakBetterTrackingState,
} from './types';

export const SPEAK_BETTER_PROGRESS_KEY = 'pace.speakBetter.progress.v1';
export const SPEAK_BETTER_PROGRESS_VERSION = 1;

export interface SpeakBetterProgressDocument {
  version: number;
  /** ISO instant of the last write, for a diagnostics line. */
  updatedAt: string;
  /** `id` → entry. An object rather than an array so a write is a merge, not a scan. */
  words: Record<string, SpeakBetterProgressEntry>;
}

export function emptyProgress(): SpeakBetterProgressDocument {
  return { version: SPEAK_BETTER_PROGRESS_VERSION, updatedAt: new Date(0).toISOString(), words: {} };
}

function isState(value: unknown): value is SpeakBetterTrackingState {
  return typeof value === 'string' && (SPEAK_BETTER_TRACKING_STATES as readonly string[]).includes(value);
}

function isLevel(value: unknown): value is SpeakBetterLevel {
  return value === 'A2-B1' || value === 'B2' || value === 'C1' || value === 'C2';
}

/**
 * Recover a band when an entry does not carry one. The lesson ids are
 * conventionally prefixed by band (`b2-…`, `c1-…`, `c2-…`; the original corpus
 * has no prefix), so a record written by a leaner build still lands on the right
 * shelf rather than being thrown away.
 */
function inferLevel(lessonId: string): SpeakBetterLevel {
  if (lessonId.startsWith('b2-')) return 'B2';
  if (lessonId.startsWith('c1-')) return 'C1';
  if (lessonId.startsWith('c2-')) return 'C2';
  return 'A2-B1';
}

/**
 * Read any stored document into the current shape.
 *
 * Total by construction: an unreadable value is empty, an entry that fails a
 * check is skipped alone, and a missing field is filled from the entry's own id
 * rather than guessed. Nothing in this function can throw on bad input.
 */
export function normalizeProgress(raw: unknown, now = new Date().toISOString()): SpeakBetterProgressDocument {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyProgress();
  const record = raw as Record<string, unknown>;
  const words: Record<string, SpeakBetterProgressEntry> = {};
  const incoming = record.words;
  if (incoming && typeof incoming === 'object' && !Array.isArray(incoming)) {
    for (const [key, value] of Object.entries(incoming as Record<string, unknown>)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const entry = value as Record<string, unknown>;
      const id = typeof entry.id === 'string' && entry.id ? entry.id : key;
      if (!id.includes(':')) continue;
      if (!isState(entry.state)) continue;
      const lessonId = typeof entry.lessonId === 'string' && entry.lessonId
        ? entry.lessonId
        : id.slice(0, id.indexOf(':'));
      // An unknown band is repaired from the lesson id; only an entry with no
      // usable identity at all is dropped.
      const level: SpeakBetterLevel = isLevel(entry.level) ? entry.level : inferLevel(lessonId);
      const word = typeof entry.word === 'string' && entry.word ? entry.word : id.slice(id.indexOf(':') + 1);
      const firstSeenAt = typeof entry.firstSeenAt === 'string' && entry.firstSeenAt ? entry.firstSeenAt : now;
      const updatedAt = typeof entry.updatedAt === 'string' && entry.updatedAt ? entry.updatedAt : firstSeenAt;
      words[id] = { id, lessonId, word, level, state: entry.state, firstSeenAt, updatedAt };
    }
  }
  return {
    version: SPEAK_BETTER_PROGRESS_VERSION,
    updatedAt: typeof record.updatedAt === 'string' && record.updatedAt ? record.updatedAt : now,
    words,
  };
}

/**
 * Mark a word as seen. Idempotent: seeing a word a second time keeps the first
 * `firstSeenAt`, and never overwrites a state the reader chose deliberately
 * (a saved word that reappears in a new lesson stays saved).
 */
export function markSeen(
  document: SpeakBetterProgressDocument,
  input: { id: string; lessonId: string; word: string; level: SpeakBetterLevel },
  now = new Date().toISOString(),
): SpeakBetterProgressDocument {
  const existing = document.words[input.id];
  if (existing) {
    if (existing.state !== 'seen') return document;
    return document;
  }
  return {
    ...document,
    updatedAt: now,
    words: {
      ...document.words,
      [input.id]: {
        id: input.id,
        lessonId: input.lessonId,
        word: input.word,
        level: input.level,
        state: 'seen',
        firstSeenAt: now,
        updatedAt: now,
      },
    },
  };
}

/**
 * Set one word's state. This is the only mutator the UI calls, and it never
 * deletes: “unsave” returns the word to `seen`, because the reader has still met
 * it and forgetting that would be a reset of their history by the back door.
 */
export function setWordState(
  document: SpeakBetterProgressDocument,
  input: { id: string; lessonId: string; word: string; level: SpeakBetterLevel; state: SpeakBetterTrackingState },
  now = new Date().toISOString(),
): SpeakBetterProgressDocument {
  const existing = document.words[input.id];
  const firstSeenAt = existing?.firstSeenAt ?? now;
  return {
    ...document,
    updatedAt: now,
    words: {
      ...document.words,
      [input.id]: {
        id: input.id,
        lessonId: input.lessonId,
        word: input.word,
        level: input.level,
        state: input.state,
        firstSeenAt,
        updatedAt: now,
      },
    },
  };
}

/** Toggle a state on one word, returning to `seen` when it is already set. */
export function toggleWordState(
  document: SpeakBetterProgressDocument,
  input: { id: string; lessonId: string; word: string; level: SpeakBetterLevel; state: SpeakBetterTrackingState },
  now = new Date().toISOString(),
): SpeakBetterProgressDocument {
  const current = document.words[input.id]?.state;
  return setWordState(document, { ...input, state: current === input.state ? 'seen' : input.state }, now);
}

/** How many words sit in each state, for the header counts. */
export function progressSummary(document: SpeakBetterProgressDocument): Record<SpeakBetterTrackingState, number> {
  const summary: Record<SpeakBetterTrackingState, number> = { seen: 0, known: 0, saved: 0, review: 0 };
  for (const entry of Object.values(document.words)) summary[entry.state] += 1;
  return summary;
}

export function entriesInState(
  document: SpeakBetterProgressDocument,
  state: SpeakBetterTrackingState,
): SpeakBetterProgressEntry[] {
  return Object.values(document.words)
    .filter((entry) => entry.state === state)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function wordState(document: SpeakBetterProgressDocument, id: string): SpeakBetterTrackingState | null {
  return document.words[id]?.state ?? null;
}

/* ------------------------------------------------------------------ */
/* Storage                                                            */
/*                                                                     */
/* One key, one document, every access guarded. A browser that refuses */
/* storage (private mode, quota, a locked-down webview) keeps progress */
/* for the session in memory and says so through `persistent: false` — */
/* which the UI surfaces rather than pretending the save worked.       */
/* ------------------------------------------------------------------ */

export interface ProgressStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface LoadedProgress {
  document: SpeakBetterProgressDocument;
  /** false when the browser refused storage, so the caller can be honest. */
  persistent: boolean;
}

export function loadProgress(storage?: ProgressStorage | null): LoadedProgress {
  let target = storage;
  if (target === undefined) {
    try {
      target = typeof window === 'undefined' ? null : window.localStorage;
    } catch {
      target = null;
    }
  }
  if (!target) return { document: emptyProgress(), persistent: false };
  try {
    const raw = target.getItem(SPEAK_BETTER_PROGRESS_KEY);
    if (!raw) return { document: emptyProgress(), persistent: true };
    return { document: normalizeProgress(JSON.parse(raw)), persistent: true };
  } catch {
    // A corrupt document is not a reason to lose the reader's place forever;
    // it is treated as empty, and the next write replaces it.
    return { document: emptyProgress(), persistent: true };
  }
}

export function saveProgress(document: SpeakBetterProgressDocument, storage?: ProgressStorage | null): boolean {
  let target = storage;
  if (target === undefined) {
    try {
      target = typeof window === 'undefined' ? null : window.localStorage;
    } catch {
      target = null;
    }
  }
  if (!target) return false;
  try {
    target.setItem(SPEAK_BETTER_PROGRESS_KEY, JSON.stringify(document));
    return true;
  } catch {
    return false;
  }
}
