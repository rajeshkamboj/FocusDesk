/**
 * A remembered collection layout (list or grid) for Projects and Goals.
 *
 * WHY localStorage AND NOT A NEW SETTINGS TABLE
 * The app already distinguishes two kinds of preference:
 *
 *   - **synced** preferences (theme, display name, notifications, carry-forward)
 *     live in `Settings` and therefore in `app_settings` / `pace.db.v1`, because
 *     they must follow the user to another device;
 *   - **this-device view state** lives in `localStorage` under a `pace.*` key —
 *     `pace.timerDock.collapsed` and `pace.lastSection` already do exactly this.
 *
 * A collection's layout is view state on a par with the collapsed timer dock: it
 * is worth remembering, it is not worth a migration, and it must not add a
 * settings system of its own. So it follows the existing convention, keyed per
 * collection, and everything is guarded because localStorage throws in private
 * modes and is absent during server rendering.
 */

export type ViewMode = 'list' | 'grid';

export const VIEW_MODE_STORAGE_PREFIX = 'pace.viewMode.';

export type ViewCollection = 'projects' | 'goals';

/** The screen a collection's copy of the preference is stored under. */
export function viewModeStorageKey(collection: ViewCollection): string {
  return `${VIEW_MODE_STORAGE_PREFIX}${collection}`;
}

export function isViewMode(value: unknown): value is ViewMode {
  return value === 'list' || value === 'grid';
}

/**
 * Read a remembered layout. Anything unreadable, unrecognised or written by an
 * older build falls back to `'list'` — the layout every existing user already
 * has, so nothing moves under them on the first load after this change.
 */
export function readViewMode(collection: ViewCollection, storage?: Pick<Storage, 'getItem'> | null): ViewMode {
  let target = storage;
  if (target === undefined) {
    try {
      target = typeof window === 'undefined' ? null : window.localStorage;
    } catch {
      target = null;
    }
  }
  if (!target) return 'list';
  try {
    const stored = target.getItem(viewModeStorageKey(collection));
    return isViewMode(stored) ? stored : 'list';
  } catch {
    return 'list';
  }
}

/** Persist a layout. A failure (private mode, quota) is ignored — the view still works. */
export function writeViewMode(
  collection: ViewCollection,
  mode: ViewMode,
  storage?: Pick<Storage, 'setItem'> | null,
): void {
  let target = storage;
  if (target === undefined) {
    try {
      target = typeof window === 'undefined' ? null : window.localStorage;
    } catch {
      target = null;
    }
  }
  if (!target) return;
  try {
    target.setItem(viewModeStorageKey(collection), mode);
  } catch {
    /* remember for this session only */
  }
}

/* ------------------------------------------------------------------ */
/* Change notification                                                 */
/*                                                                     */
/* The screens read the layout through `useSyncExternalStore`, which    */
/* needs a subscription: the same tab's own writes, and another tab's    */
/* `storage` event. Reading through an external store — rather than      */
/* copying localStorage into React state inside an effect — is what      */
/* keeps server and client markup identical on the first paint, so the   */
/* list never flashes into a grid after hydration.                      */
/* ------------------------------------------------------------------ */

const listeners = new Set<() => void>();
let crossTabBound = false;

function emit(): void {
  for (const listener of [...listeners]) listener();
}

function bindCrossTab(): void {
  if (crossTabBound || typeof window === 'undefined') return;
  crossTabBound = true;
  try {
    window.addEventListener('storage', (event) => {
      // A null key is the browser's "storage was cleared" event.
      if (event.key === null || event.key.startsWith(VIEW_MODE_STORAGE_PREFIX)) emit();
    });
  } catch {
    /* no cross-tab sync; the current tab still works */
  }
}

/** Subscribe to layout changes in this tab and across tabs. */
export function subscribeViewMode(listener: () => void): () => void {
  listeners.add(listener);
  bindCrossTab();
  return () => {
    listeners.delete(listener);
  };
}

/** The server's answer: always the list, exactly as the first paint renders. */
export function serverViewMode(): ViewMode {
  return 'list';
}

/** Persist a layout and tell every subscribed screen, in every tab. */
export function setViewMode(collection: ViewCollection, mode: ViewMode, storage?: Pick<Storage, 'setItem'> | null): void {
  writeViewMode(collection, mode, storage);
  emit();
}
