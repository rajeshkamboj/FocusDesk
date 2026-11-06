'use client';

import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { positionMenu } from '@/lib/menu-position';

const MenuContext = createContext({ touch: false, semantic: false });

/**
 * The app's existing action menu. `portal` opts into a fixed, body-level panel
 * for task rows: it cannot be clipped by a card or scroll container, but keeps
 * the same trigger, items and handlers. Other menus retain their inline layout.
 */
export function Menu({
  trigger,
  children,
  align = 'right',
  portal = false,
  touch = false,
  label = 'Actions',
}: {
  trigger: (props: { open: boolean; toggle: () => void; triggerRef: RefObject<HTMLButtonElement | null>; triggerId: string; menuId: string }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: 'left' | 'right';
  portal?: boolean;
  touch?: boolean;
  label?: string;
}) {
  const pathname = usePathname();
  // Deriving dismissal from the route also removes the portal immediately on
  // navigation, without waiting for an effect (or leaking it into the new page).
  const [state, setState] = useState({ pathname, open: false });
  const open = state.open && state.pathname === pathname;
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef(false);
  const menuId = useId();
  const triggerId = useId();

  const close = useCallback(() => {
    setState((previous) => ({ ...previous, open: false }));
  }, []);
  const dismiss = useCallback(() => {
    restoreFocusRef.current = false;
    setState((previous) => ({ ...previous, open: false }));
  }, []);

  useLayoutEffect(() => {
    if (!open || !portal) return;
    const panel = panelRef.current;
    // The wrapper is the original absolute menu's containing block. Anchoring
    // to it preserves the desktop gap exactly, including its baseline space.
    const anchor = ref.current;
    const triggerElement = triggerRef.current;
    if (!panel || !anchor) return;

    const updatePosition = () => {
      const visual = window.visualViewport;
      const viewport = {
        left: visual?.offsetLeft ?? 0,
        top: visual?.offsetTop ?? 0,
        width: visual?.width ?? document.documentElement.clientWidth,
        height: visual?.height ?? document.documentElement.clientHeight,
      };
      const rect = anchor.getBoundingClientRect();
      if (!anchor.isConnected || rect.bottom < viewport.top || rect.top > viewport.top + viewport.height || rect.right < viewport.left || rect.left > viewport.left + viewport.width) {
        dismiss();
        return;
      }
      // Measure the complete menu before constraining it, so flipping and
      // scrolling use its real height rather than the previous viewport's cap.
      panel.style.maxHeight = 'none';
      panel.style.maxWidth = `${Math.max(0, viewport.width - 16)}px`;
      panel.style.minWidth = `${Math.min(208, viewport.width - 16)}px`;
      const position = positionMenu(rect, { width: panel.offsetWidth, height: panel.offsetHeight }, viewport, align);
      panel.style.left = `${position.left}px`;
      panel.style.top = `${position.top}px`;
      panel.style.maxHeight = `${position.maxHeight}px`;
      panel.dataset.placement = position.placement;
      panel.style.visibility = 'visible';
    };
    const onScroll = (event: Event) => {
      if (event.target instanceof Node && panel.contains(event.target)) return;
      updatePosition();
    };
    updatePosition();
    restoreFocusRef.current = true;
    panel.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    window.visualViewport?.addEventListener('resize', updatePosition);
    window.visualViewport?.addEventListener('scroll', updatePosition);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', onScroll, { capture: true });
      window.visualViewport?.removeEventListener('resize', updatePosition);
      window.visualViewport?.removeEventListener('scroll', updatePosition);
      // Return keyboard/AT focus after an action or Escape, but not after an
      // outside tap or navigation. A newly opened dialog takes focus after us.
      if (restoreFocusRef.current && triggerElement?.isConnected && (panel.contains(document.activeElement) || document.activeElement === document.body)) {
        triggerElement.focus({ preventScroll: true });
      }
      restoreFocusRef.current = false;
    };
  }, [open, portal, align, dismiss]);

  useEffect(() => {
    if (!open) return;
    const onOutside = (event: Event) => {
      const target = event.target;
      if (!target || !('nodeType' in target)) return;
      const node = target as Node;
      if (!ref.current?.contains(node) && !panelRef.current?.contains(node)) dismiss();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
    };
    // Pointer events cover mouse, touch and pen. Mobile browsers do not always
    // synthesize the mousedown listener this menu previously relied on.
    document.addEventListener('pointerdown', onOutside, { capture: true });
    // Keyboard focus leaving the trigger/menu also dismisses it, and opening
    // another menu cannot leave two floating panels behind.
    document.addEventListener('focusin', onOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onOutside, { capture: true });
      document.removeEventListener('focusin', onOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close, dismiss]);

  const items = children(close);
  const content = portal ? <MenuContext.Provider value={{ touch, semantic: true }}>{items}</MenuContext.Provider> : items;

  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setState({ pathname, open: !open }), triggerRef, triggerId, menuId })}
      {open ? (
        portal ? createPortal(
          <div
            ref={panelRef}
            id={menuId}
            role="menu"
            aria-labelledby={triggerId}
            aria-label={label}
            tabIndex={-1}
            data-menu-portal=""
            className={`animate-scale-in fixed z-50 min-w-52 overflow-y-auto overscroll-contain rounded-xl border border-line bg-surface py-1 shadow-pop ${touch ? 'menu-touch' : ''}`}
            style={{ visibility: 'hidden', left: 0, top: 0 }}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'));
              const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
              let next: number;
              if (event.key === 'ArrowDown') next = (index + 1) % buttons.length;
              else if (event.key === 'ArrowUp') next = (index - 1 + buttons.length) % buttons.length;
              else if (event.key === 'Home') next = 0;
              else if (event.key === 'End') next = buttons.length - 1;
              else {
                if (event.key === 'Tab') dismiss();
                return;
              }
              event.preventDefault();
              buttons[next]?.focus();
            }}
          >
            {content}
          </div>,
          document.body,
        ) : (
          <div
            id={menuId}
            className={`animate-scale-in absolute top-full z-40 mt-1.5 min-w-52 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-pop ${
              align === 'right' ? 'right-0' : 'left-0'
            }`}
          >
            {content}
          </div>
        )
      ) : null}
    </div>
  );
}

export function MenuItem({
  onClick,
  children,
  danger,
}: {
  onClick: () => void;
  children: ReactNode;
  danger?: boolean;
}) {
  const { semantic } = useContext(MenuContext);
  return (
    <button
      type="button"
      role={semantic ? 'menuitem' : undefined}
      tabIndex={semantic ? -1 : undefined}
      onClick={onClick}
      className={`menu-item flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] transition-colors ${
        danger ? 'text-danger hover:bg-danger-soft' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div role={useContext(MenuContext).semantic ? 'presentation' : undefined} className="px-3.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-ink-3">{children}</div>;
}

export function MenuSeparator() {
  return <div role="separator" className="my-1 h-px bg-line" />;
}
