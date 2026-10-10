/*
 * FocusDesk service worker.
 *
 * Network: pass-through (no cache) so Supabase/local data stays fresh.
 * Reminders: show OS notifications on behalf of the page, catch up from the
 * IndexedDB snapshot when woken (periodic background sync), and on click
 * focus an existing client — posting FOCUSDESK_NAVIGATE so the app can
 * router.push without unloading running timers. openWindow is used only when
 * no client exists (the app was fully closed).
 *
 * Keep path/key validation in sync with lib/reminder-schedule.ts.
 */

const VERSION = 'focusdesk-reminders-v1';
const DB_NAME = 'pace.notifications.v1';
const DB_VERSION = 1;
const FIRED_STORE = 'fired';
const META_STORE = 'meta';
const SCHEDULE_META_KEY = 'schedule';
const SW_NAVIGATE_MESSAGE = 'FOCUSDESK_NAVIGATE';
const SW_CHECK_MESSAGE = 'FOCUSDESK_REMINDER_CHECK';
const PERIODIC_SYNC_TAG = 'focusdesk-reminders';
const ICON = '/icons/icon-192.png';
const MAX_URL_LENGTH = 500;
const MAX_KEY_LENGTH = 400;

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isSafeAppPath(url) {
  if (typeof url !== 'string' || url.length === 0 || url.length > MAX_URL_LENGTH) return false;
  if (!url.startsWith('/')) return false;
  if (url.startsWith('//') || url.includes('\\') || url.includes('://')) return false;
  try {
    const parsed = new URL(url, 'https://focusdesk.local');
    if (parsed.origin !== 'https://focusdesk.local') return false;
    if (parsed.username || parsed.password) return false;
    if (parsed.hash) return false;
    return parsed.pathname.startsWith('/');
  } catch {
    return false;
  }
}

function isValidKey(key) {
  return typeof key === 'string' && key.length > 0 && key.length <= MAX_KEY_LENGTH && !key.includes('\0');
}

function resolveAppUrl(path) {
  const safe = isSafeAppPath(path) ? path : '/today';
  const url = new URL(safe, self.registration.scope);
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin) return new URL('/today', self.registration.scope).href;
  return url.href;
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(FIRED_STORE)) db.createObjectStore(FIRED_STORE, { keyPath: 'key' });
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('indexedDB open failed'));
  });
}

function idbReq(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('indexedDB request failed'));
  });
}

function waitTx(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('indexedDB transaction failed'));
    tx.onabort = () => reject(tx.error || new Error('indexedDB transaction aborted'));
  });
}

async function claimFired(key) {
  if (!isValidKey(key)) return false;
  const db = await openDb();
  try {
    const claimed = await new Promise((resolve, reject) => {
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
      tx.onerror = () => reject(tx.error || new Error('indexedDB claim failed'));
      tx.onabort = () => reject(tx.error || new Error('indexedDB claim aborted'));
    });
    return claimed;
  } finally {
    db.close();
  }
}

async function loadSnapshot() {
  const db = await openDb();
  try {
    const tx = db.transaction(META_STORE, 'readonly');
    const value = await idbReq(tx.objectStore(META_STORE).get(SCHEDULE_META_KEY));
    await waitTx(tx);
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  } finally {
    db.close();
  }
}

function wellFormedEvent(event) {
  return (
    event &&
    isValidKey(event.key) &&
    Number.isFinite(event.at) &&
    typeof event.title === 'string' &&
    event.title.length > 0 &&
    typeof event.body === 'string' &&
    isSafeAppPath(event.url) &&
    typeof event.tag === 'string' &&
    event.tag.length > 0
  );
}

async function showEvent(event) {
  const existing = await self.registration.getNotifications({ tag: event.tag });
  if (existing.length > 0) return;
  await self.registration.showNotification(event.title, {
    body: event.body,
    icon: ICON,
    badge: ICON,
    tag: event.tag,
    renotify: false,
    data: { url: event.url, key: event.key, kind: event.kind, taskId: event.taskId || null },
    timestamp: event.at,
  });
}

async function checkDue() {
  const snapshot = await loadSnapshot();
  if (!snapshot || !Array.isArray(snapshot.events)) return;
  const now = Date.now();
  const tzOk = typeof snapshot.timezoneOffset !== 'number' || snapshot.timezoneOffset === new Date(now).getTimezoneOffset();
  for (const event of snapshot.events) {
    if (!wellFormedEvent(event)) continue;
    if (event.at > now) continue;
    if (!tzOk && event.kind !== 'task') continue;
    const claimed = await claimFired(event.key);
    if (!claimed) continue;
    try {
      await showEvent(event);
    } catch {
      /* permission revoked or platform refusal — key stays claimed so we
         do not retry-storm; the page will rebuild on next launch. */
    }
  }
}

async function focusOrOpen(path) {
  const target = resolveAppUrl(path);
  const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of windowClients) {
    try {
      await client.focus();
    } catch {
      /* some platforms refuse focus */
    }
    const url = isSafeAppPath(path) ? path : '/today';
    client.postMessage({ type: SW_NAVIGATE_MESSAGE, url });
    return;
  }
  await self.clients.openWindow(target);
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const url = data.url;
  const key = data.key;
  event.waitUntil(
    Promise.resolve()
      .then(() => (key ? claimFired(key) : undefined))
      .then(() => focusOrOpen(url)),
  );
});

self.addEventListener('notificationclose', (event) => {
  const key = event.notification.data && event.notification.data.key;
  if (!key) return;
  event.waitUntil(claimFired(key));
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== SW_CHECK_MESSAGE) return;
  event.waitUntil(checkDue());
});

self.addEventListener('periodicsync', (event) => {
  if (event.tag !== PERIODIC_SYNC_TAG) return;
  event.waitUntil(checkDue());
});

self.addEventListener('sync', (event) => {
  if (event.tag !== PERIODIC_SYNC_TAG) return;
  event.waitUntil(checkDue());
});

void VERSION;
