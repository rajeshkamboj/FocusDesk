'use client';

/**
 * The browser-side store for Speak Better progress.
 *
 * One module owns the ledger, its storage and its subscribers, so the screen can
 * read it through `useSyncExternalStore` — the same pattern the Projects/Goals
 * layout preference uses, and for the same reason: the server snapshot is fixed,
 * so hydration matches and no reader sees their tracked words flicker.
 *
 * `lib/curiosity/speak-better-progress.ts` holds the pure document operations
 * (normalize, mark seen, set state, summarise) and is testable without a DOM.
 * This file is the thin browser layer around it.
 */

import {
  loadProgress,
  saveProgress,
  type SpeakBetterProgressDocument,
} from './speak-better-progress';

export * from './speak-better-progress';

let cached: SpeakBetterProgressDocument | null = null;
let persistent = true;
const listeners = new Set<() => void>();

/** The current ledger, loaded once per page from storage. */
export function speakBetterProgressSnapshot(): SpeakBetterProgressDocument {
  if (cached) return cached;
  const loaded = loadProgress();
  cached = loaded.document;
  persistent = loaded.persistent;
  return cached;
}

/**
 * The server snapshot: always empty. A server render has no reader and no
 * storage, so claiming anything else would either leak one reader's progress
 * into another's HTML or mismatch on hydration.
 */
export function speakBetterServerSnapshot(): SpeakBetterProgressDocument {
  return EMPTY;
}

const EMPTY: SpeakBetterProgressDocument = { version: 1, updatedAt: new Date(0).toISOString(), words: {} };

export function subscribeSpeakBetterProgress(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Replace the ledger, persist it, and notify every subscribed screen.
 *
 * A storage refusal (private mode, quota) is reported rather than swallowed, so
 * the screen can say the save is session-only instead of implying durability it
 * does not have.
 */
export function publishSpeakBetterProgress(document: SpeakBetterProgressDocument): boolean {
  cached = document;
  persistent = saveProgress(document);
  for (const listener of [...listeners]) listener();
  return persistent;
}

/** Whether the last write actually reached storage. */
export function speakBetterProgressIsPersistent(): boolean {
  return persistent;
}

/** Test seam: put a known ledger in place without touching storage. */
export function setSpeakBetterProgressForTesting(document: SpeakBetterProgressDocument | null): void {
  cached = document;
  for (const listener of [...listeners]) listener();
}
