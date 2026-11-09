/**
 * This Week's Learning — one specific assignment a week, tied to a real project.
 *
 * WHAT THIS IS
 *   A weekly recommendation that names one thing to learn and one thing to do with
 *   it on a project that already exists (Sikhizm, PatientScure, PixlDot, UI/UX,
 *   LatestPunjabiMovies, AI). It is not a reading list: every assignment ends in an
 *   artefact the reader can point at — a test, a page, a clip, a prompt, a fix.
 *
 * THE TWO PROPERTIES THAT MATTER
 *   1. **Seven-day stability.** The pick is a pure function of the week, computed
 *      from the Monday of the current week in Asia/Kolkata. Reloading, switching
 *      devices, or opening the app at 00:01 on Monday cannot change this week's
 *      assignment, because nothing random and nothing time-of-day enters the
 *      calculation. A new week starts on Monday, which is the same boundary the
 *      rest of the app already uses.
 *   2. **Rotation without a history table.** The corpus is interleaved
 *      round-robin across projects, so advancing one slot per week changes the
 *      project as well as the task. The reader's decisions are *recorded*, never
 *      used to re-pick: an assignment marked completed stays on screen, marked
 *      completed, until the week ends. Jumping to the next task the moment
 *      someone finishes this one would make the state unreadable and would turn
 *      a weekly commitment into an endless queue.
 *
 * WHAT IS STORED
 *   Only the reader's decisions (`WeeklyLearningRecord` per assignment id), inside
 *   the existing settings blob. Neither the corpus nor the week's pick is persisted:
 *   both are derived, so there is nothing to keep in sync and nothing to backfill.
 */

import type { ISODateTime, WeeklyLearningRecord, WeeklyLearningStatus } from './types';

export interface WeeklyLearningResource {
  label: string;
  url: string;
}

export interface WeeklyAssignment {
  /** Stable id. Never reuse one: stored reader decisions are keyed by it. */
  id: string;
  /** The project this assignment pays into. */
  projectKey: WeeklyProjectKey;
  projectLabel: string;
  title: string;
  /** Why this, why now — in the reader's terms, not a course catalogue's. */
  why: string;
  /** Two to four concrete steps. Each one is something to do, not to read. */
  steps: string[];
  /** How the reader knows it worked. One sentence, checkable. */
  outcome: string;
  /** Realistic time for one sitting. */
  minutes: number;
  difficulty: 'starter' | 'focused' | 'deep';
  resources?: WeeklyLearningResource[];
}

export const WEEKLY_PROJECTS = [
  { key: 'sikhizm', label: 'Sikhizm' },
  { key: 'patientsecure', label: 'PatientScure' },
  { key: 'pixldot', label: 'PixlDot' },
  { key: 'ui-ux', label: 'UI / UX' },
  { key: 'latest-punjabi-movies', label: 'LatestPunjabiMovies' },
  { key: 'ai', label: 'AI' },
] as const;

export type WeeklyProjectKey = (typeof WEEKLY_PROJECTS)[number]['key'];

export const WEEKLY_DIFFICULTY_LABELS: Record<WeeklyAssignment['difficulty'], string> = {
  starter: 'One sitting',
  focused: 'A focused session',
  deep: 'A deeper piece of work',
};

/**
 * The corpus.
 *
 * Every entry is deliberately narrow. "Learn React hooks" is advice; "add a
 * cancel-token to the fetch in the appointment list so a slow response cannot
 * overwrite a newer one" is an assignment. This file only contains the second kind.
 */
export const WEEKLY_ASSIGNMENTS: readonly WeeklyAssignment[] = [
  /* ---- Sikhizm ---------------------------------------------------------- */
  {
    id: 'weekly-sikhizm-gurbani-index',
    projectKey: 'sikhizm',
    projectLabel: 'Sikhizm',
    title: 'Make one Gurbani passage findable by its first line',
    why: 'Search is the first thing a reader tries and the last thing most scripture apps get right. One real passage, wired end to end, exposes the whole path: data shape, transliteration, Devanagari, and result ranking.',
    steps: [
      'Pick one shabad from Sri Guru Granth Sahib that you can verify against a printed or institutional edition — write down the Ang number while you do it.',
      'Add it to the corpus with four fields: Gurmukhi first line, transliteration, Hindi/English meaning, and Ang number.',
      'Type the first three Gurmukhi characters into your own search box and confirm the passage is the first result.',
      'Type the transliteration instead and confirm it still finds it.',
    ],
    outcome: 'Both the Gurmukhi and the transliterated first line return the same passage, with the Ang number visible on the result.',
    minutes: 90,
    difficulty: 'focused',
    resources: [{ label: 'Sri Granth (Ang lookup)', url: 'https://www.srigranth.org/' }],
  },
  {
    id: 'weekly-sikhizm-hukamnama-diff',
    projectKey: 'sikhizm',
    projectLabel: 'Sikhizm',
    title: 'Add a “today’s hukamnama” cache with an explicit staleness rule',
    why: 'A daily item that is fetched live is a daily outage waiting to happen. Writing the staleness rule down is the actual learning — the cache is ten lines, the policy is the design.',
    steps: [
      'Write the rule in one sentence: how old may the stored hukamnama be before the UI says “yesterday’s”?',
      'Store the last fetched date, the Ang and the text; render from storage first and refresh in the background.',
      'Add a visible label when the rendered date is not today — a small “from <date>” line, not an error banner.',
      'Test it by pretending the fetch failed for two days and confirming the page still renders with the honest label.',
    ],
    outcome: 'With the network blocked, the page still shows the stored hukamnama and states which date it is from.',
    minutes: 120,
    difficulty: 'focused',
  },
  {
    id: 'weekly-sikhizm-punjabi-type',
    projectKey: 'sikhizm',
    projectLabel: 'Sikhizm',
    title: 'Fix Punjabi typography at the one size that is actually broken',
    why: 'Gurmukhi has taller ascenders and a deeper baseline than Latin; line-height tuned for English clips it. This is a two-hour lesson in why typography is per-script, not global.',
    steps: [
      'Screenshot the densest Gurmukhi block in your app at the smallest size it is used.',
      'Measure the gap between the top of a sihari and the line above; increase line-height for Gurmukhi only (a class or a lang-scoped rule, not a global change).',
      'Check the same block at 320px width and at 200% browser zoom.',
      'Keep the Latin line-height untouched and confirm the page still looks right.',
    ],
    outcome: 'No Gurmukhi ascender touches the line above at 320px or at 200% zoom, and Latin text is unchanged.',
    minutes: 60,
    difficulty: 'starter',
  },

  /* ---- PatientScure ----------------------------------------------------- */
  {
    id: 'weekly-patientsecure-audit-log',
    projectKey: 'patientsecure',
    projectLabel: 'PatientScure',
    title: 'Put a real audit trail on one health record read',
    why: 'In health software the question is never “is it secure”, it is “who read this, and when”. Building the log for a single read teaches the discipline before it has to scale.',
    steps: [
      'Pick one sensitive read path (a patient record, a prescription, a lab result) and trace it from UI to data layer.',
      'Write an append-only entry for it: actor, patient id (hashed or opaque), resource, timestamp, and whether the read was allowed or denied.',
      'Make the log write fail closed: if the audit row cannot be written, the read is refused.',
      'Prove it: break the log write deliberately and confirm the read is denied rather than silently permitted.',
    ],
    outcome: 'A denied read and an allowed read both produce an audit row, and an unwritable audit log blocks the read.',
    minutes: 150,
    difficulty: 'deep',
  },
  {
    id: 'weekly-patientsecure-rls-check',
    projectKey: 'patientsecure',
    projectLabel: 'PatientScure',
    title: 'Prove one Supabase row is invisible to the wrong user',
    why: 'Row-level security is either verified or assumed. One deliberate cross-tenant read attempt, from a second real session, turns an assumption into a fact you can show.',
    steps: [
      'Choose the table that holds the most sensitive record and find its RLS policy.',
      'Sign in as a second user (or a test account) that should not see the first user’s row.',
      'Try to read that row by id directly through the API — not through your UI, which may filter first.',
      'Record the result: a policy that returns an empty set is a pass; anything else is a fix before the next feature.',
    ],
    outcome: 'The second session receives an empty result for the other user’s record id, and you have the request and response saved.',
    minutes: 75,
    difficulty: 'focused',
  },
  {
    id: 'weekly-patientsecure-consent-copy',
    projectKey: 'patientsecure',
    projectLabel: 'PatientScure',
    title: 'Rewrite one consent screen so a patient can actually refuse',
    why: 'Consent that is easier to accept than to decline is not consent. Rewriting one screen teaches plain-language, symmetry between the two choices, and evidence of what was agreed.',
    steps: [
      'Take the consent screen with the most legal language and count the words.',
      'Rewrite the primary explanation to under 80 words, second person, no defined terms.',
      'Make “not now” the same size, same colour and same position as “agree”, and remove preselected options.',
      'Store the version of the text that was accepted, not just a boolean.',
    ],
    outcome: 'A reader can decline in one tap without hunting, and the stored consent records which text version they agreed to.',
    minutes: 90,
    difficulty: 'focused',
  },

  /* ---- PixlDot ---------------------------------------------------------- */
  {
    id: 'weekly-pixldot-lcp',
    projectKey: 'pixldot',
    projectLabel: 'PixlDot',
    title: 'Cut PixlDot’s largest contentful paint by a measured amount',
    why: 'Performance work that is not measured is decoration. One before/after LCP number on the real deployment teaches the whole chain: the audit, the cause, the fix, the proof.',
    steps: [
      'Run Lighthouse on the production page over a throttled connection and save the report.',
      'Identify the LCP element and its single largest cost (an unoptimised hero image, a blocking font, a client component that should be server-rendered).',
      'Fix only that one cause — size/format the image, preload the font with `font-display: swap`, or move the component across the server boundary.',
      'Re-run the same audit on the same throttling and write the two numbers down.',
    ],
    outcome: 'LCP improves by a number you can quote, measured with the same tool and the same throttling before and after.',
    minutes: 120,
    difficulty: 'focused',
  },
  {
    id: 'weekly-pixldot-case-study',
    projectKey: 'pixldot',
    projectLabel: 'PixlDot',
    title: 'Write one client case study with a number in the headline',
    why: 'A studio’s portfolio is a sales argument, and a sales argument without evidence is a mood board. Writing one case with a real before/after figure teaches you to instrument the next project from day one.',
    steps: [
      'Choose the project with the most measurable outcome (load time, conversion, enquiry rate, support tickets).',
      'Write five sentences: the problem, the constraint, what you changed, the number, and what you would do differently.',
      'Attach the evidence you actually have — a screenshot, an analytics export, a client sentence. If there is none, pick a different project.',
      'Publish it on the site itself rather than waiting for a deck.',
    ],
    outcome: 'A published case study states one real before/after number and shows the evidence beside it.',
    minutes: 90,
    difficulty: 'starter',
  },
  {
    id: 'weekly-pixldot-404-forms',
    projectKey: 'pixldot',
    projectLabel: 'PixlDot',
    title: 'Audit the one form every lead uses',
    why: 'The contact form is the highest-value component on the site and the least tested. One pass with real failure cases teaches validation, error copy and recoverability together.',
    steps: [
      'Submit the form with an empty field, a bad email, a very long message and a duplicate submission.',
      'For each case, note what the reader sees — specifically whether their typed text survives.',
      'Fix the two worst: preserve input on error, and make the duplicate submission idempotent.',
      'Confirm the enquiry actually arrives in the inbox you check.',
    ],
    outcome: 'Every failed submission keeps the typed text, a duplicate submission creates one enquiry, and the test enquiry arrives.',
    minutes: 60,
    difficulty: 'starter',
  },

  /* ---- UI / UX ---------------------------------------------------------- */
  {
    id: 'weekly-uiux-focus-order',
    projectKey: 'ui-ux',
    projectLabel: 'UI / UX',
    title: 'Fix the keyboard order on one screen, tab by tab',
    why: 'Focus order is where visual design and actual use disagree. One screen, tabbed through end to end, teaches more about layout than an accessibility checklist read twice.',
    steps: [
      'Open the busiest screen and press Tab repeatedly without touching the mouse.',
      'Write down the order you actually get, then the order the eye reads.',
      'Fix it in the DOM order first — `tabIndex` is the last resort, not the first.',
      'Confirm every control shows a visible focus ring and that no control traps focus.',
    ],
    outcome: 'The tab order matches the reading order, every stop is visible, and Escape leaves any open overlay.',
    minutes: 45,
    difficulty: 'starter',
  },
  {
    id: 'weekly-uiux-empty-states',
    projectKey: 'ui-ux',
    projectLabel: 'UI / UX',
    title: 'Design the empty state before the loaded one',
    why: 'Empty states are where most interfaces quietly fail: they either say nothing or blame the user. Designing one first is a lesson in writing UI copy that does a job.',
    steps: [
      'Pick a list that starts empty in your own product.',
      'Write three variants of the empty state copy: what this is, why it is empty, one action to start.',
      'Remove every sentence that only restates the headline.',
      'Show the single best action as a button and check it works with a keyboard.',
    ],
    outcome: 'The empty state answers “what is this, why is it empty, what do I do” in under 25 words, with one working action.',
    minutes: 45,
    difficulty: 'starter',
  },
  {
    id: 'weekly-uiux-contrast-measure',
    projectKey: 'ui-ux',
    projectLabel: 'UI / UX',
    title: 'Measure, don’t eyeball, the contrast of your muted text',
    why: 'Muted greys are the most common accessibility failure in dark interfaces, and they always look fine on the designer’s monitor. Measuring one token changes how you choose the next ten.',
    steps: [
      'Pick the three most-used secondary text colours in the product.',
      'Measure each against its actual background with a contrast tool.',
      'Adjust only the failing ones — aiming for 4.5:1 for body text, 3:1 for large text — and keep the visual hierarchy.',
      'Re-measure the pair you just changed and note the numbers in the design tokens file.',
    ],
    outcome: 'Every secondary-text token you use has a measured ratio recorded beside it, and none is below 4.5:1 for body text.',
    minutes: 40,
    difficulty: 'starter',
    resources: [{ label: 'WebAIM contrast checker', url: 'https://webaim.org/resources/contrastchecker/' }],
  },

  /* ---- LatestPunjabiMovies ---------------------------------------------- */
  {
    id: 'weekly-movies-metadata',
    projectKey: 'latest-punjabi-movies',
    projectLabel: 'LatestPunjabiMovies',
    title: 'Add one verified field that no aggregator has',
    why: 'A listings site competes on data quality, not on the list. Adding a single field that has to be checked by hand — a certification, a runtime, a release date that differs by territory — teaches where your data actually comes from.',
    steps: [
      'Choose one field (certification, exact runtime, language dub availability) and pick five films.',
      'Verify each value from two independent sources and note both URLs.',
      'Store the field with its source attached, not as a bare string.',
      'Add it to the film page with a “verified <date>” line.',
    ],
    outcome: 'Five films show the new field with two independent sources recorded and a verification date on the page.',
    minutes: 90,
    difficulty: 'focused',
  },
  {
    id: 'weekly-movies-release-accuracy',
    projectKey: 'latest-punjabi-movies',
    projectLabel: 'LatestPunjabiMovies',
    title: 'Make one upcoming release date impossible to be wrong',
    why: 'A wrong release date is the one error users never forgive. Handling postponement explicitly — a new date replacing an old one, with the old one still visible — is a lesson in data that changes.',
    steps: [
      'Take the next release on the calendar and find its official announcement (distributor or studio, not an aggregator).',
      'Model the change: keep the announced date, add a `postponedTo` field and the announcement link.',
      'Render “postponed from <old date>” rather than silently swapping the date.',
      'Add a check that flags any film whose announced date has passed without a status change.',
    ],
    outcome: 'A postponed film shows both dates and its source, and no film can sit past its announced date without a flag.',
    minutes: 75,
    difficulty: 'focused',
  },
  {
    id: 'weekly-movies-schema',
    projectKey: 'latest-punjabi-movies',
    projectLabel: 'LatestPunjabiMovies',
    title: 'Emit one correct Movie schema block and validate it',
    why: 'Structured data is how a listing site enters search results without paying for them. Getting one block genuinely valid — not “it renders” — teaches the difference between markup and meaning.',
    steps: [
      'Pick one film page and write its JSON-LD: name, datePublished, director, actor, inLanguage (pa), and a canonical URL.',
      'Validate it with a schema validator and fix every warning, not only the errors.',
      'Check the rendered page in a browser, not just the source, because hydration can strip a script tag.',
      'Add the same block to the film template and re-validate a second page.',
    ],
    outcome: 'Two film pages pass a schema validator with zero errors, and the rendered HTML contains the block after hydration.',
    minutes: 60,
    difficulty: 'focused',
    resources: [{ label: 'Schema Markup Validator', url: 'https://validator.schema.org/' }],
  },

  /* ---- AI --------------------------------------------------------------- */
  {
    id: 'weekly-ai-eval-set',
    projectKey: 'ai',
    projectLabel: 'AI',
    title: 'Build a ten-example eval set before changing the prompt',
    why: 'Prompt engineering without an eval set is improvising. Ten real examples, scored by hand, turn “it feels better” into a comparison — and it is the single habit that separates working AI features from demos.',
    steps: [
      'Take one prompt you actually use in production and collect ten real inputs from its logs or your own usage.',
      'Write down the correct answer for each, in your own words, before you touch the prompt.',
      'Change one thing about the prompt only.',
      'Score all ten again and count how many got better, worse, or unchanged.',
    ],
    outcome: 'You can state the change, the score before, and the score after, using the same ten examples.',
    minutes: 75,
    difficulty: 'focused',
  },
  {
    id: 'weekly-ai-structured-output',
    projectKey: 'ai',
    projectLabel: 'AI',
    title: 'Make one AI response structurally impossible to misparse',
    why: 'Most “the AI broke production” incidents are parsing incidents. Constraining output and validating it at the boundary is a small piece of work with a large payoff.',
    steps: [
      'Pick a place where you parse a model response with a regular expression or string splitting.',
      'Replace it with a schema: a JSON response format or a tool call with a declared shape.',
      'Validate the parsed value against the schema and reject — not guess — when it does not fit.',
      'Add one test with a deliberately malformed response and confirm graceful failure.',
    ],
    outcome: 'A malformed model response produces a handled error, and the happy path no longer depends on string parsing.',
    minutes: 90,
    difficulty: 'focused',
  },
  {
    id: 'weekly-ai-cost-per-call',
    projectKey: 'ai',
    projectLabel: 'AI',
    title: 'Measure the real cost of one AI call, per user action',
    why: 'AI features fail commercially, not technically. Attributing tokens to one user action teaches you where the money goes, which is usually the prompt, not the model.',
    steps: [
      'Pick one user-visible AI action and log its input and output tokens for a day.',
      'Compute the average cost per action from your provider’s current price list.',
      'Find the waste: repeated context, an oversized system prompt, retries, or a bigger model than the task needs.',
      'Cut one source of waste and re-measure the same action.',
    ],
    outcome: 'You can state cost per action before and after, with the token counts that produced both numbers.',
    minutes: 90,
    difficulty: 'deep',
  },
];

/* ------------------------------------------------------------------ */
/* Week arithmetic (Asia/Kolkata, Monday start)                        */
/* ------------------------------------------------------------------ */

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

/** The calendar day in Asia/Kolkata as `YYYY-MM-DD`. */
export function kolkataDayKey(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * The Monday of the week containing `date`, as `YYYY-MM-DD`.
 *
 * Parsed as a UTC midnight so daylight saving, if it ever applies, cannot shift the
 * boundary: the key is a date, and dates do not have hours.
 */
export function weekStartKey(date: Date = new Date()): string {
  const [year, month, day] = kolkataDayKey(date).split('-').map(Number);
  const utc = Date.UTC(year, month - 1, day);
  const weekday = new Date(utc).getUTCDay(); // 0 = Sunday
  const backToMonday = (weekday + 6) % 7;
  const monday = new Date(utc - backToMonday * DAY_MS);
  return monday.toISOString().slice(0, 10);
}

/** Weeks since the Unix epoch for a `weekStartKey` — a stable, global index. */
export function weekIndexOf(weekStart: string): number {
  const [year, month, day] = weekStart.split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / WEEK_MS);
}

/** The seven day keys of one week, Monday first. Used by the UI and the verifier. */
export function weekDays(weekStart: string): string[] {
  const [year, month, day] = weekStart.split('-').map(Number);
  const start = Date.UTC(year, month - 1, day);
  return Array.from({ length: 7 }, (_, offset) =>
    new Date(start + offset * DAY_MS).toISOString().slice(0, 10),
  );
}

/**
 * Interleave the corpus across projects.
 *
 * Grouped by project, consecutive weeks would repeat the same project for as many
 * weeks as that project has assignments. Round-robin makes every weekly step a
 * change of project *and* of task, while staying a pure function of the corpus order.
 */
export function rotationOrder(
  pool: readonly WeeklyAssignment[] = WEEKLY_ASSIGNMENTS,
): WeeklyAssignment[] {
  const byProject = new Map<WeeklyProjectKey, WeeklyAssignment[]>();
  for (const project of WEEKLY_PROJECTS) byProject.set(project.key, []);
  for (const assignment of pool) {
    const bucket = byProject.get(assignment.projectKey);
    if (bucket) bucket.push(assignment);
    else byProject.set(assignment.projectKey, [assignment]);
  }
  const longest = Math.max(0, ...[...byProject.values()].map((bucket) => bucket.length));
  const ordered: WeeklyAssignment[] = [];
  for (let index = 0; index < longest; index += 1) {
    for (const bucket of byProject.values()) {
      const assignment = bucket[index];
      if (assignment) ordered.push(assignment);
    }
  }
  return ordered;
}

export interface WeeklySelection {
  assignment: WeeklyAssignment;
  /** Monday of the week the assignment belongs to, `YYYY-MM-DD`. */
  weekStart: string;
  weekIndex: number;
}

/**
 * This week's assignment.
 *
 * Deterministic in `weekStart` alone: the same week gives the same assignment on
 * every device, on every reload, and after any number of status changes. The
 * reader's records are not an input to the choice — they are only read by the card
 * to decide what to show beside it. That is what makes the seven-day promise hold
 * *after* interaction, not just before it.
 */
export function selectWeeklyAssignment(options: {
  date?: Date;
  /**
   * Accepted for call-site compatibility and deliberately **not used** to pick.
   * A reader's status must never change which assignment the week is about.
   */
  records?: Readonly<Record<string, WeeklyLearningRecord>>;
  pool?: readonly WeeklyAssignment[];
} = {}): WeeklySelection {
  const pool = options.pool ?? WEEKLY_ASSIGNMENTS;
  const weekStart = weekStartKey(options.date);
  const index = weekIndexOf(weekStart);
  const ordered = rotationOrder(pool);
  if (ordered.length === 0) throw new Error('the weekly learning corpus is empty');

  const start = ((index % ordered.length) + ordered.length) % ordered.length;
  return { assignment: ordered[start], weekStart, weekIndex: index };
}

/** Assignments the reader saved for later, newest decision first. */
export function savedAssignments(
  records: Readonly<Record<string, WeeklyLearningRecord>>,
  pool: readonly WeeklyAssignment[] = WEEKLY_ASSIGNMENTS,
): WeeklyAssignment[] {
  return Object.entries(records)
    .filter(([, record]) => record.savedForLater)
    .sort((left, right) => right[1].updatedAt.localeCompare(left[1].updatedAt))
    .map(([id]) => pool.find((assignment) => assignment.id === id))
    .filter((assignment): assignment is WeeklyAssignment => Boolean(assignment));
}

/**
 * Apply one decision, returning a new record map.
 *
 * Kept pure so the UI is a thin shell and the behaviour is testable without a
 * browser: setting a status never clears `savedForLater`, and unsaving never
 * touches the status. The two decisions are independent on purpose.
 */
export function applyWeeklyDecision(
  records: Readonly<Record<string, WeeklyLearningRecord>>,
  id: string,
  patch: { status?: WeeklyLearningStatus; savedForLater?: boolean },
  now: ISODateTime = new Date().toISOString(),
): Record<string, WeeklyLearningRecord> {
  const current = records[id];
  const status = patch.status ?? current?.status ?? 'not-started';
  const savedForLater = patch.savedForLater ?? current?.savedForLater ?? false;
  // A no-op decision (same status, same flag) keeps the old timestamp, so the
  // "recently saved" order does not churn on a stray click.
  if (current && current.status === status && current.savedForLater === savedForLater) {
    return { ...records };
  }
  return { ...records, [id]: { status, savedForLater, updatedAt: now } };
}
