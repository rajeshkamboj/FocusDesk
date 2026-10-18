/**
 * Values shared by the server (publisher, store) and the browser (the cards).
 *
 * This module must stay free of anything that touches `process.env`, the
 * filesystem or the network: the Curiosity cards are client components, and the
 * moment they import a server module the whole editorial pipeline ships in the
 * bundle. `lib/curiosity/openlibrary.ts` and
 * `components/curiosity/sections/book-card.tsx` both read these constants from
 * here for exactly that reason.
 */

/** Shown whenever Open Library has no cover, or the cover fails to load. */
export const BOOK_COVER_PLACEHOLDER = '/images/curiosity/book-cover-placeholder.svg';

export const BOOK_COVER_PLACEHOLDER_ALT = 'No cover available for this edition';

/** Card chrome that used to be spread across the screen component. */
export const OPEN_LIBRARY_ATTRIBUTION = 'Book metadata from Open Library';
export const BOOK_CADENCE_LABEL = 'Changes every 3 days';
export const DAILY_CADENCE_LABEL = 'Changes at midnight, Asia/Kolkata';
