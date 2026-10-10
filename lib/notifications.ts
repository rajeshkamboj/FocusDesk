'use client';

/**
 * Reminder delivery while FocusDesk is running — foreground, minimized, or
 * in a background tab.
 *
 * Architecture (see README → Background reminders):
 *   1. Pure schedule in lib/reminder-schedule.ts decides what is due.
 *   2. Fired keys live in IndexedDB (shared with the service worker) so a
 *      restart or a second tab cannot deliver the same reminder twice.
 *   3. Notifications are shown through the service worker when possible, so
 *      a minimized / unfocused document still produces an OS notification
 *      and a click can focus the existing client without unloading it.
 *   4. Visibility, focus, resume, online and timezone-offset changes all
 *      trigger an immediate catch-up (sleep/wake, overdue on launch).
 *   5. Future events are snapshotted for the service worker. Where the
 *      experimental Notification Triggers API exists, they are also armed as
 *      TimestampTriggers so a *fully closed* browser may still deliver them.
 *      There is no push server in this repository; without Triggers or
 *      Periodic Background Sync, a fully exited app cannot fire until it is
 *      opened again.
 */

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useData } from '@/components/data/data-provider';
import {
  CHECK_INTERVAL_MS,
  PERIODIC_SYNC_TAG,
  SW_CHECK_MESSAGE,
  SW_NAVIGATE_MESSAGE,
  buildReminderEvents,
  buildReminderSnapshot,
  delayUntilNextCheck,
  deliverDueReminders,
  isSafeAppPath,
  nextReminderAt,
  notificationOptions,
  type ReminderEvent,
} from './reminder-schedule';
import {
  createIndexedDbFiredStore,
  migrateFiredKeys,
  writeScheduleSnapshot,
} from './notification-store';

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  return notificationsSupported() ? Notification.permission : 'unsupported';
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!notificationsSupported()) return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return 'unsupported';
  }
}

function timestampTrigger(at: number): unknown | null {
  const Trigger = (globalThis as { TimestampTrigger?: new (timestamp: number) => unknown }).TimestampTrigger;
  if (typeof Trigger !== 'function') return null;
  if (!Number.isFinite(at) || at <= Date.now() + 1500) return null;
  try {
    return new Trigger(at);
  } catch {
    return null;
  }
}

async function serviceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

async function showEvent(event: ReminderEvent, registration: ServiceWorkerRegistration | null): Promise<void> {
  const options = notificationOptions(event);
  if (registration) {
    const existing = await registration.getNotifications({ tag: event.tag });
    if (existing.length > 0) return;
    await registration.showNotification(event.title, options);
    return;
  }
  const n = new Notification(event.title, options);
  n.onclick = () => {
    try {
      window.focus();
    } catch {
      /* ignore */
    }
    n.close();
    if (isSafeAppPath(event.url)) {
      window.dispatchEvent(new CustomEvent(SW_NAVIGATE_MESSAGE, { detail: { url: event.url } }));
    }
  };
}

async function claimVisibleNotifications(
  registration: ServiceWorkerRegistration | null,
  store: { claim(key: string): Promise<boolean> },
): Promise<void> {
  if (!registration) return;
  try {
    const shown = await registration.getNotifications();
    for (const notification of shown) {
      const key = (notification.data as { key?: string } | undefined)?.key;
      if (key) await store.claim(key);
    }
  } catch {
    /* ignore */
  }
}

async function armTimestampTriggers(
  events: ReminderEvent[],
  fired: ReadonlySet<string>,
  registration: ServiceWorkerRegistration | null,
): Promise<void> {
  if (!registration || !timestampTrigger(Date.now() + 120_000)) return;
  const now = Date.now();
  let pending: Notification[] = [];
  try {
    pending = await (
      registration.getNotifications as (filter?: { includeTriggered?: boolean }) => Promise<Notification[]>
    )({ includeTriggered: true });
  } catch {
    return;
  }

  const future = events.filter((event) => !fired.has(event.key) && event.at > now);
  const futureTags = new Set(future.map((event) => event.tag));
  const pendingTags = new Set<string>();

  for (const notification of pending) {
    const key = (notification.data as { key?: string } | undefined)?.key;
    if (key && fired.has(key)) {
      try {
        notification.close();
      } catch {
        /* ignore */
      }
      continue;
    }
    if (notification.tag) pendingTags.add(notification.tag);
    if (notification.tag && !futureTags.has(notification.tag) && !(key && fired.has(key))) {
      try {
        notification.close();
      } catch {
        /* ignore */
      }
      pendingTags.delete(notification.tag);
    }
  }

  for (const event of future) {
    if (pendingTags.has(event.tag)) continue;
    const trigger = timestampTrigger(event.at);
    if (!trigger) continue;
    try {
      await registration.showNotification(event.title, {
        ...notificationOptions(event),
        showTrigger: trigger,
      } as NotificationOptions);
      pendingTags.add(event.tag);
    } catch {
      /* Triggers not actually enabled */
      break;
    }
  }
}

async function registerPeriodicSync(registration: ServiceWorkerRegistration | null): Promise<void> {
  if (!registration) return;
  const periodic = (registration as ServiceWorkerRegistration & {
    periodicSync?: { register(tag: string, options: { minInterval: number }): Promise<void> };
  }).periodicSync;
  if (!periodic) return;
  try {
    const status = await navigator.permissions.query({ name: 'periodic-background-sync' as PermissionName });
    if (status.state !== 'granted') return;
    await periodic.register(PERIODIC_SYNC_TAG, { minInterval: 60 * 60 * 1000 });
  } catch {
    /* unsupported or denied */
  }
}

/**
 * Periodically checks what deserves a reminder and fires it at most once.
 * Also runs on visibility/focus/resume so a sleep cycle cannot swallow one.
 */
export function useNotificationScheduler() {
  const { data, ready } = useData();
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const reminderSignature = `${data.settings.notifications.morningPriorityReminder}:${data.settings.notifications.taskReminders}:${data.settings.notifications.deadlineReminders}:${data.settings.notifications.eveningReviewReminder}|${data.tasks
    .map((t) => `${t.id}:${t.reminder ?? ''}:${t.status}:${t.archived ? 1 : 0}:${t.dueDate ?? ''}`)
    .join(',')}|${data.dailyPriorities.map((p) => `${p.date}:${p.id}`).join(',')}`;

  useEffect(() => {
    if (!ready) return;

    let cancelled = false;
    let timeoutId: number | undefined;
    const store = createIndexedDbFiredStore();

    const stopTimer = () => {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
        timeoutId = undefined;
      }
    };

    const run = async () => {
      if (cancelled) return;
      stopTimer();

      const permission = notificationPermission();
      if (permission !== 'granted') {
        try {
          await writeScheduleSnapshot({
            version: 1,
            timezoneOffset: new Date().getTimezoneOffset(),
            writtenAt: Date.now(),
            events: [],
          });
        } catch {
          /* ignore */
        }
        timeoutId = window.setTimeout(() => {
          void run();
        }, CHECK_INTERVAL_MS);
        return;
      }

      try {
        await migrateFiredKeys(store);
        const now = new Date();
        const events = buildReminderEvents(dataRef.current, now);
        const snapshot = buildReminderSnapshot(dataRef.current, now);
        await writeScheduleSnapshot(snapshot);

        const registration = await serviceWorkerRegistration();
        await claimVisibleNotifications(registration, store);
        await deliverDueReminders(events, now.getTime(), store, (event) => showEvent(event, registration));

        const fired = await store.keys();
        await armTimestampTriggers(events, fired, registration);
        await registerPeriodicSync(registration);

        if (registration?.active) {
          registration.active.postMessage({ type: SW_CHECK_MESSAGE });
        }

        const nextAt = nextReminderAt(events, Date.now(), fired);
        const delay = delayUntilNextCheck(nextAt, Date.now());
        if (!cancelled) {
          timeoutId = window.setTimeout(() => {
            void run();
          }, delay);
        }
      } catch {
        if (!cancelled) {
          timeoutId = window.setTimeout(() => {
            void run();
          }, CHECK_INTERVAL_MS);
        }
      }
    };

    void run();

    const bump = () => {
      void run();
    };

    document.addEventListener('visibilitychange', bump);
    window.addEventListener('focus', bump);
    window.addEventListener('pageshow', bump);
    window.addEventListener('online', bump);
    document.addEventListener('resume', bump);

    let lastOffset = new Date().getTimezoneOffset();
    const tzId = window.setInterval(() => {
      const offset = new Date().getTimezoneOffset();
      if (offset !== lastOffset) {
        lastOffset = offset;
        bump();
      }
    }, CHECK_INTERVAL_MS);

    let permissionStatus: PermissionStatus | null = null;
    if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
      void navigator.permissions
        .query({ name: 'notifications' as PermissionName })
        .then((status) => {
          permissionStatus = status;
          status.addEventListener('change', bump);
        })
        .catch(() => {
          /* ignore */
        });
    }

    return () => {
      cancelled = true;
      stopTimer();
      document.removeEventListener('visibilitychange', bump);
      window.removeEventListener('focus', bump);
      window.removeEventListener('pageshow', bump);
      window.removeEventListener('online', bump);
      document.removeEventListener('resume', bump);
      window.clearInterval(tzId);
      permissionStatus?.removeEventListener('change', bump);
    };
    // reminderSignature is the precise "what would we schedule" fingerprint —
    // full `data` would restart the timer on every timer checkpoint.
  }, [ready, reminderSignature]);
}

/**
 * Open the task/screen a notification points at, without unloading the
 * document when an existing FocusDesk client is already running (an unload
 * would pause every running timer).
 */
export function useNotificationNavigation() {
  const router = useRouter();

  useEffect(() => {
    const go = (url: unknown) => {
      if (!isSafeAppPath(url)) return;
      router.push(url);
    };

    const onSwMessage = (event: MessageEvent) => {
      const payload = event.data;
      if (!payload || payload.type !== SW_NAVIGATE_MESSAGE) return;
      go(payload.url);
    };

    const onFallbackClick = (event: Event) => {
      const detail = (event as CustomEvent<{ url?: string }>).detail;
      go(detail?.url);
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', onSwMessage);
    }
    window.addEventListener(SW_NAVIGATE_MESSAGE, onFallbackClick);
    return () => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', onSwMessage);
      }
      window.removeEventListener(SW_NAVIGATE_MESSAGE, onFallbackClick);
    };
  }, [router]);
}
