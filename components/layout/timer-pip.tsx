'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { IconPause } from '@/components/ui/icons';
import { formatStopwatch } from '@/lib/dates';
import { elapsedActiveSeconds, isTimerRunning } from '@/lib/timer';
import type { Task } from '@/lib/types';

/**
 * Active Timers, popped out into a native Document Picture-in-Picture window
 * so the running clock stays visible above other applications.
 *
 * It is a second *view* of the dock, never a second timer: the task list and
 * the clock are handed in by the dock, and elapsed time is read with the same
 * `lib/timer` helpers. No state, no interval, no persistence of its own — when
 * the window closes, nothing about the timers changes.
 *
 * The window is rendered with `createPortal` into the PiP document, so it is
 * still the same React tree (same DataProvider, same clock): route changes
 * never touch it, and every update the dock sees, it sees.
 */

/** Comfortably inside the 280–360 × 100–220 range; the browser may clamp it. */
const PIP_WIDTH = 320;
const PIP_HEIGHT = 190;
const PIP_TITLE = 'FocusDesk — Active timers';

/**
 * Copy the app's stylesheets into the Picture-in-Picture document — a new
 * document starts with none, and this is the documented way to keep the
 * popped-out markup looking exactly like the dock. One-time copy by design.
 */
function copyStyles(target: Window): void {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const css = Array.from(sheet.cssRules)
        .map((rule) => rule.cssText)
        .join('');
      const style = target.document.createElement('style');
      style.textContent = css;
      if (sheet.media.mediaText) style.media = sheet.media.mediaText;
      target.document.head.append(style);
    } catch {
      // Cross-origin sheet: its rules can't be read, so link it instead.
      if (!sheet.href) continue;
      const link = target.document.createElement('link');
      link.rel = 'stylesheet';
      link.href = sheet.href;
      if (sheet.media.mediaText) link.media = sheet.media.mediaText;
      target.document.head.append(link);
    }
  }
}

/**
 * Mirror the app's current theme onto the Picture-in-Picture document. The
 * existing `data-theme` attribute drives every colour token, so following it is
 * all a second document needs — and a change in Settings reaches the popped-out
 * window live. Returns a cleanup function.
 */
function mirrorTheme(target: Window): () => void {
  const root = document.documentElement;
  const apply = () => {
    const theme = root.getAttribute('data-theme');
    if (theme) target.document.documentElement.setAttribute('data-theme', theme);
    else target.document.documentElement.removeAttribute('data-theme');
  };
  apply();
  const observer = new MutationObserver(apply);
  observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}

/**
 * Support is a client-only fact: read it the way the app reads hydration
 * (`useSyncExternalStore`) so the server render stays "unsupported" and the
 * button simply appears on browsers that have the API — no hydration mismatch,
 * no error, no fallback UI on the ones that don't.
 */
const subscribeToSupport = () => () => {};
const getSupportSnapshot = () => 'documentPictureInPicture' in window;
const getServerSupportSnapshot = () => false;

export interface TimerPip {
  /** Whether this browser exposes Document PiP (resolved after mount). */
  supported: boolean;
  /** The open Picture-in-Picture window, or null while none is open. */
  pipWindow: Window | null;
  /**
   * Open the window — or focus the one already open. Call it straight from a
   * click handler: `requestWindow()` needs transient activation.
   */
  open: () => void;
}

export function useTimerPip(): TimerPip {
  const supported = useSyncExternalStore(subscribeToSupport, getSupportSnapshot, getServerSupportSnapshot);
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  // The live window plus the listeners/observers opened alongside it, kept in a
  // ref so unmount can tear them down without re-running any effect.
  const openedRef = useRef<{ win: Window; dispose: () => void } | null>(null);

  // The dock itself going away (sign-out, unmount) must not leave an orphan
  // window floating over the desktop.
  useEffect(
    () => () => {
      const opened = openedRef.current;
      openedRef.current = null;
      opened?.dispose();
      opened?.win.close();
    },
    [],
  );

  const open = useCallback(() => {
    const opened = openedRef.current;
    if (opened) {
      // Already open: never a second window — reuse (and focus) this one.
      if (!opened.win.closed) {
        opened.win.focus();
        return;
      }
      // Gone without a 'pagehide' (rare): tidy up, then open a fresh one.
      openedRef.current = null;
      opened.dispose();
      setPipWindow(null);
    }
    const pip = window.documentPictureInPicture;
    if (!pip) return;

    // Reached synchronously from the click, so the gesture is still valid.
    pip.requestWindow({ width: PIP_WIDTH, height: PIP_HEIGHT }).then(
      (win) => {
        win.document.title = PIP_TITLE;
        win.document.documentElement.lang = 'en';
        copyStyles(win);
        const stopThemeMirror = mirrorTheme(win);

        // Closing the window is only a view change: drop the subscriptions,
        // forget the window, leave every timer exactly as it is.
        const onPageHide = () => {
          const opened = openedRef.current;
          openedRef.current = null;
          opened?.dispose();
          setPipWindow(null);
        };
        win.addEventListener('pagehide', onPageHide);

        openedRef.current = {
          win,
          dispose: () => {
            win.removeEventListener('pagehide', onPageHide);
            stopThemeMirror();
          },
        };
        setPipWindow(win);
      },
      (error: unknown) => {
        // Refused (no user gesture, policy, already closing…). Nothing to
        // recover from: the dock keeps working, no timer state is touched.
        if (process.env.NODE_ENV !== 'production') {
          console.warn('FocusDesk: the timers Picture-in-Picture window was not opened', error);
        }
      },
    );
  }, []);

  return { supported, pipWindow, open };
}

/**
 * The popped-out view: the same rows as the dock, read-only and compact.
 * `tasks` and `now` come from the dock, so the two views can never disagree.
 */
export function TimerPipView({
  pipWindow,
  tasks,
  now,
}: {
  pipWindow: Window;
  tasks: Task[];
  now: number;
}) {
  return createPortal(
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-3">Active timers</p>
        {tasks.length > 1 ? (
          <span className="font-mono text-[10px] tabular-nums text-ink-3">{tasks.length}</span>
        ) : null}
      </div>
      {tasks.length === 0 ? (
        <p className="flex flex-1 items-center justify-center px-3 text-[12px] text-ink-3">No active timers</p>
      ) : (
        <ul className="flex-1 overflow-y-auto p-1.5">
          {tasks.map((task) => {
            const running = isTimerRunning(task);
            // Running: live from the shared timestamps. Paused: the frozen
            // accumulated time — the same helper returns both.
            const seconds = elapsedActiveSeconds(task, now);
            return (
              <li key={task.id} className="flex items-center gap-2 px-2 py-1.5">
                {running ? (
                  <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                ) : (
                  <IconPause width={10} height={10} className="shrink-0 text-ink-3" />
                )}
                <span
                  title={task.title}
                  className={`min-w-0 flex-1 truncate text-[13px] ${running ? 'text-ink' : 'text-ink-3'}`}
                >
                  {task.title}
                </span>
                <span className={`shrink-0 font-mono text-[12px] tabular-nums ${running ? 'text-ink-2' : 'text-ink-3'}`}>
                  {formatStopwatch(seconds)}
                  <span className="sr-only">{running ? ' elapsed, running' : ' elapsed, paused'}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>,
    pipWindow.document.body,
  );
}
