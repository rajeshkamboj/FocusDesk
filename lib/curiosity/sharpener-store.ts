'use client';

/**
 * The browser store for Brain Sharpener attempts.
 *
 * Same pattern as `speak-better-store.ts`: one module owns the document, its
 * storage and its subscribers, so the card reads it through
 * `useSyncExternalStore`. The server snapshot is fixed, so hydration matches and no
 * reader sees an attempt count flicker.
 */

import {
  emptySharpenerProgress,
  loadSharpenerProgress,
  saveSharpenerProgress,
  type SharpenerProgressDocument,
} from './sharpener-progress';

export * from './sharpener-progress';

const EMPTY = emptySharpenerProgress();

let cached: SharpenerProgressDocument | null = null;
let persistent = true;
const listeners = new Set<() => void>();

export function sharpenerProgressSnapshot(): SharpenerProgressDocument {
  if (cached) return cached;
  const loaded = loadSharpenerProgress();
  cached = loaded.document;
  persistent = loaded.persistent;
  return cached;
}

export function sharpenerServerSnapshot(): SharpenerProgressDocument {
  return EMPTY;
}

export function subscribeSharpenerProgress(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function publishSharpenerProgress(document: SharpenerProgressDocument): boolean {
  cached = document;
  const saved = saveSharpenerProgress(document);
  persistent = saved;
  for (const listener of listeners) listener();
  return saved;
}

export function sharpenerProgressIsPersistent(): boolean {
  return persistent;
}

/** Test seam: replace the in-memory document without touching storage. */
export function setSharpenerProgressForTesting(document: SharpenerProgressDocument | null): void {
  cached = document;
  for (const listener of listeners) listener();
}
