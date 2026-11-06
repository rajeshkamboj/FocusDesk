/** Geometry shared by the task menu and its viewport regression tests. */
export interface MenuRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface MenuViewport {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface MenuPosition {
  left: number;
  top: number;
  maxHeight: number;
  placement: 'above' | 'below';
}

/**
 * Keep the usual below-trigger placement when it fits. Otherwise use the
 * roomier side, clamp to the visual viewport, and let a long menu scroll.
 * Fixed coordinates are relative to the layout viewport; visual-viewport
 * offsets also account for a mobile keyboard or pinch zoom.
 */
export function positionMenu(
  anchor: MenuRect,
  size: { width: number; height: number },
  viewport: MenuViewport,
  align: 'left' | 'right' = 'right',
  gap = 6,
  margin = 8,
): MenuPosition {
  const right = viewport.left + viewport.width - margin;
  const bottom = viewport.top + viewport.height - margin;
  const maxWidth = Math.max(0, viewport.width - margin * 2);
  const width = Math.min(size.width, maxWidth);
  const belowSpace = Math.max(0, bottom - anchor.bottom - gap);
  const aboveSpace = Math.max(0, anchor.top - viewport.top - margin - gap);
  const placement = size.height <= belowSpace || belowSpace >= aboveSpace ? 'below' : 'above';
  const available = placement === 'below' ? belowSpace : aboveSpace;
  const height = Math.min(size.height, available);
  const left = align === 'right' ? anchor.right - width : anchor.left;
  const top = placement === 'below' ? anchor.bottom + gap : anchor.top - gap - height;

  return {
    left: Math.max(viewport.left + margin, Math.min(left, right - width)),
    top: Math.max(viewport.top + margin, Math.min(top, bottom - height)),
    maxHeight: Math.max(0, Math.min(available, viewport.height - margin * 2)),
    placement,
  };
}
