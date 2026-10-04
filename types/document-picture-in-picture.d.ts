/**
 * Minimal ambient types for the Document Picture-in-Picture API.
 *
 * TypeScript's bundled DOM library (5.9) only describes the <video> flavour of
 * Picture-in-Picture, so the document flavour the Active Timers pop-out uses is
 * declared here — narrowly, and optional on `Window`, so every call site is
 * still forced to feature-detect it instead of assuming it exists.
 *
 * Spec: https://wicg.github.io/document-picture-in-picture/
 * Support: Chromium 116+ (not Firefox/Safari at the time of writing).
 */

interface DocumentPictureInPictureOptions {
  /** Initial width in px. The browser may clamp it. */
  width?: number;
  /** Initial height in px. The browser may clamp it. */
  height?: number;
  disallowReturnToOpener?: boolean;
  preferInitialWindowPlacement?: boolean;
}

interface DocumentPictureInPicture extends EventTarget {
  /** The open Picture-in-Picture window, or null when none is open. */
  readonly window: Window | null;
  /**
   * Opens the Picture-in-Picture window. Requires transient activation, so it
   * must be reached synchronously from a user gesture; the promise rejects
   * otherwise (and when the browser refuses for any other reason).
   */
  requestWindow(options?: DocumentPictureInPictureOptions): Promise<Window>;
}

interface Window {
  /** Undefined in browsers without Document Picture-in-Picture support. */
  readonly documentPictureInPicture?: DocumentPictureInPicture;
}
