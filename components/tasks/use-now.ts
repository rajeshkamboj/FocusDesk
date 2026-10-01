'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Shared ticking clock for live elapsed-time displays.
 *
 * Returns the current time in ms while `active`, refreshed about once a
 * second (and immediately when the tab becomes visible again). The value is
 * cached between ticks so `getSnapshot` stays stable, which is required by
 * `useSyncExternalStore`. Elapsed time itself is always derived from
 * timestamps by the caller — this clock only drives re-renders — so throttled
 * background tabs and slow renders can never drift the measurement.
 */
let clockCache = Date.now();

function refreshClock(): void {
  clockCache = Date.now();
}

export function useNow(active: boolean): number {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!active) return () => {};
      const bump = () => {
        refreshClock();
        onStoreChange();
      };
      // Refresh immediately on (re)subscribe so a timer that just started or
      // resumed displays the right value without waiting for the first tick.
      refreshClock();
      const id = window.setInterval(bump, 1000);
      document.addEventListener('visibilitychange', bump);
      window.addEventListener('focus', bump);
      return () => {
        window.clearInterval(id);
        document.removeEventListener('visibilitychange', bump);
        window.removeEventListener('focus', bump);
      };
    },
    [active],
  );

  const getSnapshot = useCallback(() => clockCache, []);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
