'use client';

import { useSyncExternalStore } from 'react';
import { todayISO } from './dates';

function subscribe(onChange: () => void) {
  const interval = window.setInterval(onChange, 30_000);
  window.addEventListener('focus', onChange);
  return () => { window.clearInterval(interval); window.removeEventListener('focus', onChange); };
}

/** Refresh daily content at midnight and when returning to an open tab. */
export function useLocalDate(serverDate: string) {
  return useSyncExternalStore(subscribe, todayISO, () => serverDate);
}
