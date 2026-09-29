'use client';

/**
 * In-session notification scheduling.
 *
 * Real Notification API deliveries while the app is open. Background push
 * (when the browser is closed) will arrive together with Supabase sync —
 * until then the app is honest about the limitation.
 */

import { useEffect, useRef } from 'react';
import { useData } from '@/components/data/data-provider';
import { todayISO, addDays } from './dates';
import { isOpenTask } from './selectors';

const FIRED_KEY = 'pace.notifications.fired.v1';
const CHECK_INTERVAL = 60 * 1000;

const MORNING_HOUR = 8; // local time
const EVENING_HOUR = 20;
const DEADLINE_HOUR = 9;

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

function loadFired(): Set<string> {
  try {
    const raw = window.localStorage.getItem(FIRED_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function saveFired(fired: Set<string>) {
  try {
    // Keep the set small: only today's and future keys matter day to day.
    window.localStorage.setItem(FIRED_KEY, JSON.stringify([...fired].slice(-200)));
  } catch {
    /* ignore */
  }
}

function show(title: string, body: string) {
  try {
    new Notification(title, { body, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png' });
  } catch {
    /* some platforms require a service worker registration */
  }
}

/**
 * Periodically checks what deserves a reminder and fires it at most once.
 */
export function useNotificationScheduler() {
  const { data, ready } = useData();
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    if (!ready) return;
    if (!notificationsSupported() || Notification.permission !== 'granted') return;

    const settings = data.settings.notifications;
    const anyEnabled =
      settings.morningPriorityReminder ||
      settings.taskReminders ||
      settings.deadlineReminders ||
      settings.eveningReviewReminder;
    if (!anyEnabled) return;

    const check = () => {
      const d = dataRef.current;
      const now = new Date();
      const today = todayISO();
      const minutes = now.getHours() * 60 + now.getMinutes();
      const fired = loadFired();
      let changed = false;

      const fire = (key: string, title: string, body: string) => {
        if (fired.has(key)) return;
        fired.add(key);
        changed = true;
        show(title, body);
      };

      if (settings.morningPriorityReminder && minutes >= MORNING_HOUR * 60 && minutes < MORNING_HOUR * 60 + 60) {
        const hasPriority = d.dailyPriorities.some((p) => p.date === today);
        if (!hasPriority) {
          fire(`morning-${today}`, "What's your #1 priority today?", 'Set today’s priority in Pace.');
        }
      }

      if (settings.eveningReviewReminder && minutes >= EVENING_HOUR * 60 && minutes < EVENING_HOUR * 60 + 60) {
        fire(`evening-${today}`, 'Daily review', 'Take a moment to review your day in Pace.');
      }

      if (settings.taskReminders) {
        for (const t of d.tasks) {
          if (!t.reminder || !isOpenTask(t)) continue;
          if (new Date(t.reminder).getTime() <= now.getTime()) {
            fire(`task-${t.id}-${t.reminder}`, 'Task reminder', t.title);
          }
        }
      }

      if (settings.deadlineReminders && minutes >= DEADLINE_HOUR * 60) {
        const soon = addDays(today, 1);
        for (const t of d.tasks) {
          if (!t.dueDate || !isOpenTask(t)) continue;
          if (t.dueDate === today) fire(`deadline-${t.id}-${t.dueDate}`, 'Deadline today', t.title);
          else if (t.dueDate === soon) fire(`deadline-${t.id}-${t.dueDate}`, 'Deadline tomorrow', t.title);
        }
      }

      if (changed) saveFired(fired);
    };

    check();
    const id = setInterval(check, CHECK_INTERVAL);
    return () => clearInterval(id);
  }, [ready, data.settings.notifications]);
}
