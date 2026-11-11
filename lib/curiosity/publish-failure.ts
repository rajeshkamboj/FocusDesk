/**
 * Why a publication was refused, in a form a scheduler can branch on.
 *
 * THE PROBLEM THIS SOLVES
 * Every failed run left the endpoint as a 502 with one sentence. A scheduler
 * therefore could not tell "the content this run produced is invalid" (a code or
 * data fault someone must fix) from "the store refused the write" (retry later) from
 * "an upstream source died" (someone else's outage) from "there is nothing eligible
 * to publish" (a quiet, legitimate day). All four produced the same status and the
 * same shape of message, and the message itself named the *field* that failed without
 * naming what was expected of it.
 *
 * This module defines the classification, the structured problem records and the HTTP
 * status each kind maps to. It imports nothing from the publisher or the store, so
 * both can use it without a cycle.
 */

export type PublishFailureKind =
  /** The content this run produced failed validation. Nothing was written. */
  | 'invalid-content'
  /** Nothing was eligible: every candidate was excluded, or the pool was empty. */
  | 'no-eligible-content'
  /** The state store could not be read or written. Retrying may work. */
  | 'storage'
  /** A source or discovery job failed in a way that stopped the run. */
  | 'upstream'
  /** An unexpected error. A bug, not a data or network condition. */
  | 'internal';

export type PublishProblem = {
  /** The section the problem belongs to, e.g. `scienceLevels.undergraduate.physics`. */
  section: string;
  /** The validator's own field path, so logs and tests can match exactly. */
  field: string;
  /** What the field was required to be, when that can be said in a word. */
  expected?: string;
  /** What it actually was — never the whole record, only the narrow field. */
  actual?: string;
  /** The candidate's own stable id, when the problem is about a stored record. */
  candidateId?: string;
  reason: string;
};

export class PublishRefusal extends Error {
  readonly kind: PublishFailureKind;
  readonly problems: PublishProblem[];

  constructor(kind: PublishFailureKind, message: string, problems: PublishProblem[] = []) {
    super(message);
    this.name = 'PublishRefusal';
    this.kind = kind;
    this.problems = problems;
  }
}

/** The status a caller should see for each kind. */
export const FAILURE_HTTP_STATUS: Record<PublishFailureKind, number> = {
  // The request was understood and the publisher ran; the content it produced is not
  // publishable. 422, not 500: nothing is broken in transport or storage.
  'invalid-content': 422,
  // Nothing eligible today. 409: the schedule is fine, the state of the library is not.
  'no-eligible-content': 409,
  // The store refused. 503 invites a retry, which is the correct operator action.
  storage: 503,
  // A source or discovery job failed. 502 is exactly "an upstream answer was bad".
  upstream: 502,
  internal: 500,
};

/** A stable machine code, for logs and for anything that branches on the response. */
export const FAILURE_CODE: Record<PublishFailureKind, string> = {
  'invalid-content': 'invalid_content',
  'no-eligible-content': 'no_eligible_content',
  storage: 'storage_unavailable',
  upstream: 'upstream_unavailable',
  internal: 'internal_error',
};

/**
 * Classify an error that reached the lease.
 *
 * A `PublishRefusal` carries its own kind. Anything else was thrown by the store or
 * by code around it, so the message is the only evidence available — and a message
 * that mentions the database, the store or a filesystem is a storage fault far more
 * often than it is anything else. The patterns are deliberately narrow: an unknown
 * message becomes `internal` rather than being dressed up as a retryable condition.
 */
export function describePublishError(error: unknown): {
  kind: PublishFailureKind;
  message: string;
  problems: PublishProblem[];
} {
  if (error instanceof PublishRefusal) {
    return { kind: error.kind, message: error.message, problems: error.problems };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { kind: classifyMessage(message), message, problems: [] };
}

function classifyMessage(message: string): PublishFailureKind {
  if (/supabase|postgrest|database|state store|could not be written|could not be read|EACCES|EROFS|ENOENT|ENOSPC/i.test(message)) {
    return 'storage';
  }
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|socket hang up|network|upstream|discovery job/i.test(message)) {
    return 'upstream';
  }
  return 'internal';
}
