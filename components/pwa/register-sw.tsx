'use client';

import { useEffect } from 'react';

/** Registers the service worker for offline/installability support. */
export function RegisterSW() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      const register = () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {
          /* offline support unavailable — the app still works online */
        });
      };
      if (document.readyState === 'complete') register();
      else window.addEventListener('load', register, { once: true });
    }
  }, []);
  return null;
}
