'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export interface FocusTarget {
  /** 'daily-priority' completes the day's priority; 'task' completes a task. */
  type: 'daily-priority' | 'task';
  id: string;
  title: string;
}

interface UIContextValue {
  quickAddOpen: boolean;
  openQuickAdd: () => void;
  closeQuickAdd: () => void;
  focusTarget: FocusTarget | null;
  startFocus: (target: FocusTarget) => void;
  stopFocus: () => void;
}

const UIContext = createContext<UIContextValue | null>(null);

export function useUI(): UIContextValue {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI must be used inside <UIProvider>');
  return ctx;
}

export function UIProvider({ children }: { children: ReactNode }) {
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null);

  const openQuickAdd = useCallback(() => setQuickAddOpen(true), []);
  const closeQuickAdd = useCallback(() => setQuickAddOpen(false), []);
  const startFocus = useCallback((target: FocusTarget) => {
    setQuickAddOpen(false);
    setFocusTarget(target);
  }, []);
  const stopFocus = useCallback(() => setFocusTarget(null), []);

  const value = useMemo(
    () => ({ quickAddOpen, openQuickAdd, closeQuickAdd, focusTarget, startFocus, stopFocus }),
    [quickAddOpen, openQuickAdd, closeQuickAdd, focusTarget, startFocus, stopFocus],
  );

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}
