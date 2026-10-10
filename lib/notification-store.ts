/**
 * Durable fired-key and schedule storage for reminders.
 *
 * IndexedDB is the source of truth because the service worker cannot read
 * localStorage. The legacy `pace.notifications.fired.v1` localStorage set is
 * imported once so a restart after this migration cannot re-fire old keys.
 *
 * Claim uses a readwrite IndexedDB transaction so the page and the service
 * worker cannot both "win" the same fire key.
 */

import {
  FIRED_STORAGE_KEY,
  FIRED_STORE,
  META_STORE,
  NOTIFICATION_DB,
  NOTIFICATION_DB_VERSION,
  SCHEDULE_META_KEY,
  isValidReminderKey,
  type FiredStore,
  type ReminderSnapshot,
} from './reminder-schedule';

const MAX_FIRED = 200;

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(NOTIFICATION_DB, NOTIFICATION_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(FIRED_STORE)) {
        db.createObjectStore(FIRED_STORE, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'));
  });
}

function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexedDB request failed'));
  });
}

function waitTx(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('indexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('indexedDB transaction aborted'));
  });
}

function readLegacyFired(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(FIRED_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidReminderKey);
  } catch {
    return [];
  }
}

function writeLegacyFired(keys: string[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(FIRED_STORAGE_KEY, JSON.stringify(keys.slice(-MAX_FIRED)));
  } catch {
    /* quota / private mode */
  }
}

async function pruneFired(db: IDBDatabase): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(FIRED_STORE, 'readwrite');
    const store = tx.objectStore(FIRED_STORE);
    const req = store.getAll();
    req.onsuccess = () => {
      const all = (req.result as { key: string; at: number }[]) ?? [];
      if (all.length <= MAX_FIRED) return;
      all.sort((a, b) => (a.at || 0) - (b.at || 0));
      for (const row of all.slice(0, all.length - MAX_FIRED)) store.delete(row.key);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('indexedDB prune failed'));
    tx.onabort = () => reject(tx.error ?? new Error('indexedDB prune aborted'));
  });
}

async function readAllFiredKeys(): Promise<Set<string>> {
  const legacy = new Set(readLegacyFired());
  if (!hasIndexedDb()) return legacy;
  const db = await openDb();
  try {
    const tx = db.transaction(FIRED_STORE, 'readonly');
    const all = (await idbRequest(tx.objectStore(FIRED_STORE).getAllKeys())) as IDBValidKey[];
    await waitTx(tx);
    for (const key of all) {
      if (typeof key === 'string' && isValidReminderKey(key)) legacy.add(key);
    }
    return legacy;
  } catch {
    return legacy;
  } finally {
    db.close();
  }
}

export function createIndexedDbFiredStore(): FiredStore {
  return {
    async claim(key: string) {
      if (!isValidReminderKey(key)) return false;
      if (!hasIndexedDb()) {
        const existing = readLegacyFired();
        if (existing.includes(key)) return false;
        writeLegacyFired([...existing, key]);
        return true;
      }
      const db = await openDb();
      try {
        const claimed = await new Promise<boolean>((resolve, reject) => {
          const tx = db.transaction(FIRED_STORE, 'readwrite');
          const store = tx.objectStore(FIRED_STORE);
          const req = store.get(key);
          let won = false;
          req.onsuccess = () => {
            if (req.result) return;
            won = true;
            store.put({ key, at: Date.now() });
          };
          tx.oncomplete = () => resolve(won);
          tx.onerror = () => reject(tx.error ?? new Error('indexedDB claim failed'));
          tx.onabort = () => reject(tx.error ?? new Error('indexedDB claim aborted'));
        });
        if (claimed) {
          writeLegacyFired([...(await readAllFiredKeys())]);
          await pruneFired(db);
        }
        return claimed;
      } finally {
        db.close();
      }
    },

    async release(key: string) {
      if (!isValidReminderKey(key)) return;
      if (!hasIndexedDb()) {
        writeLegacyFired(readLegacyFired().filter((k) => k !== key));
        return;
      }
      const db = await openDb();
      try {
        const tx = db.transaction(FIRED_STORE, 'readwrite');
        tx.objectStore(FIRED_STORE).delete(key);
        await waitTx(tx);
        writeLegacyFired(readLegacyFired().filter((k) => k !== key));
      } finally {
        db.close();
      }
    },

    async keys() {
      return readAllFiredKeys();
    },
  };
}

let migrated = false;

/** Import the pre-migration localStorage set into IndexedDB, once per session. */
export async function migrateFiredKeys(store: FiredStore = createIndexedDbFiredStore()): Promise<void> {
  if (migrated) return;
  migrated = true;
  const legacy = readLegacyFired();
  for (const key of legacy) {
    await store.claim(key);
  }
}

export async function writeScheduleSnapshot(snapshot: ReminderSnapshot): Promise<void> {
  if (!hasIndexedDb()) return;
  const db = await openDb();
  try {
    const tx = db.transaction(META_STORE, 'readwrite');
    tx.objectStore(META_STORE).put(snapshot, SCHEDULE_META_KEY);
    await waitTx(tx);
  } finally {
    db.close();
  }
}

export async function readScheduleSnapshot(): Promise<ReminderSnapshot | null> {
  if (!hasIndexedDb()) return null;
  const db = await openDb();
  try {
    const tx = db.transaction(META_STORE, 'readonly');
    const value = await idbRequest(tx.objectStore(META_STORE).get(SCHEDULE_META_KEY));
    await waitTx(tx);
    if (!value || typeof value !== 'object') return null;
    return value as ReminderSnapshot;
  } catch {
    return null;
  } finally {
    db.close();
  }
}

export { MAX_FIRED };
