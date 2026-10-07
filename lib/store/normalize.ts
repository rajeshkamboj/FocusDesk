/**
 * The one place stored or imported data is brought up to the current shape.
 *
 * Callers — and there are no others:
 *   - LocalRepository, every time it reads `pace.db.v1` (first load and the
 *     multi-tab re-read in `sync()`);
 *   - LocalRepository.importData and SupabaseRepository.importData, which
 *     between them handle JSON exports and the `pace.backup.v1` device backup.
 *
 * Guarantees:
 *   - Lossless. Records are carried over as the very same objects: ids,
 *     partial dates ('2015', '2026-09', '2025-02-28'), categories and any
 *     field this version does not know about all survive, and so do unknown
 *     top-level keys. Nothing is converted, re-dated or re-identified.
 *   - Idempotent. Normalizing already-normalized data returns equal data.
 *   - Side-effect free. It never writes; LocalRepository simply persists the
 *     current shape on its next ordinary write.
 *
 * PHASE 3 RENAME (Milestones → Learnings)
 * The learning timeline used to be stored and exported under `milestones`.
 * That key is read here as `learnings` — a union by id with any `learnings`
 * already present (the `learnings` copy wins on an id clash), so data written
 * by an old and a new tab side by side loses nothing — and is then dropped
 * from the result, so no duplicate copy is ever kept or exported.
 *
 * Legacy `milestones` records are NEVER treated as Project Milestones:
 * `projectMilestones` only ever comes from its own key.
 */

import type { AppData, Learning } from '../types';
import { emptyData } from './defaults';

type Rec = Record<string, unknown>;

const isRecord = (value: unknown): value is Rec =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * `learnings` first (in its own order), then every legacy record whose id is
 * not already there. Records without a usable id are kept, never dropped.
 */
function mergeLearnings(current: unknown, legacy: unknown): Learning[] {
  const primary = Array.isArray(current) ? (current as Learning[]) : [];
  if (!Array.isArray(legacy) || legacy.length === 0) return primary;
  const known = new Set(primary.map((item) => (isRecord(item) ? item.id : undefined)).filter((id) => typeof id === 'string'));
  const additions = (legacy as Learning[]).filter((item) => {
    const id = isRecord(item) ? item.id : undefined;
    return typeof id !== 'string' || !known.has(id);
  });
  return additions.length === 0 ? primary : [...primary, ...additions];
}

export function normalizeAppData(input: unknown): AppData {
  const base = emptyData();
  if (!isRecord(input)) return base;

  const { milestones: legacyLearnings, settings, ...rest } = input;
  // Unknown top-level keys ride along untouched, exactly as before Phase 3.
  const out: Rec = { ...rest };
  for (const key of Object.keys(base) as (keyof AppData)[]) {
    if (key === 'settings') continue;
    out[key] = Array.isArray(rest[key]) ? rest[key] : base[key];
  }
  out.learnings = mergeLearnings(rest.learnings, legacyLearnings);

  const stored = isRecord(settings) ? settings : {};
  const section = (name: keyof AppData['settings']) => (isRecord(stored[name]) ? stored[name] : {});
  out.settings = {
    general: { ...base.settings.general, ...section('general') },
    notifications: { ...base.settings.notifications, ...section('notifications') },
    appearance: { ...base.settings.appearance, ...section('appearance') },
  };
  return out as unknown as AppData;
}
