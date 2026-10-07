/**
 * Bulk import for the Learnings timeline.
 *
 * Accepts pasted lines in either shape:
 *   2026-10 | Tauri | framework | Desktop-app experiments
 *   2026-10,Tauri,framework,"Desktop-app experiments, with commas"
 *
 * Only the date and title are required. Everything is parsed and reported
 * line by line — a bad row never silently disappears, and nothing is written
 * until the user has seen the count.
 */

import { LEARNING_CATEGORIES, isValidLearningDate } from './learnings';
import type { LearningCategory, LearningInput } from './types';

export interface ParsedLearningRow {
  line: number;
  raw: string;
  value?: LearningInput;
  error?: string;
}

export interface ParseResult {
  rows: ParsedLearningRow[];
  valid: LearningInput[];
  errors: ParsedLearningRow[];
}

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

/** Split one line into fields, honouring `|` first and quoted CSV otherwise. */
function splitFields(line: string): string[] {
  if (line.includes('|')) return line.split('|').map((f) => f.trim());

  const fields: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else quoted = !quoted;
    } else if (ch === ',' && !quoted) {
      fields.push(current.trim());
      current = '';
    } else current += ch;
  }
  fields.push(current.trim());
  return fields;
}

/**
 * Accepts '2025', '2025-08', '2025-08-14', 'Aug 2025', 'August 2025',
 * '14 Aug 2025' and '14-Aug-2025'. Returns a partial ISO date, or undefined.
 */
export function parseLearningDate(input: string): string | undefined {
  const raw = input.trim().replace(/\s+/g, ' ');
  if (!raw) return undefined;

  if (/^\d{4}$/.test(raw)) return raw;
  if (/^\d{4}[-/]\d{1,2}$/.test(raw)) {
    const [y, m] = raw.split(/[-/]/);
    const iso = `${y}-${m.padStart(2, '0')}`;
    return isValidLearningDate(iso) ? iso : undefined;
  }
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(raw)) {
    const [y, m, d] = raw.split(/[-/]/);
    const iso = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    return isValidLearningDate(iso) ? iso : undefined;
  }

  const named = raw.replace(/[-,]/g, ' ').replace(/\s+/g, ' ').split(' ');
  const monthIndex = named.findIndex((part) =>
    MONTHS.some((m) => m.startsWith(part.toLowerCase()) && part.length >= 3),
  );
  if (monthIndex !== -1) {
    const month = MONTHS.findIndex((m) => m.startsWith(named[monthIndex].toLowerCase())) + 1;
    const year = named.find((p) => /^\d{4}$/.test(p));
    const day = named.find((p, i) => i !== monthIndex && /^\d{1,2}$/.test(p));
    if (!year) return undefined;
    const mm = String(month).padStart(2, '0');
    const iso = day ? `${year}-${mm}-${day.padStart(2, '0')}` : `${year}-${mm}`;
    return isValidLearningDate(iso) ? iso : undefined;
  }

  return undefined;
}

function parseCategory(input: string | undefined): LearningCategory {
  if (!input) return 'other';
  const key = input.trim().toLowerCase().replace(/[\s_]+/g, '-');
  const byId = LEARNING_CATEGORIES.find((c) => c.id === key);
  if (byId) return byId.id;
  const byLabel = LEARNING_CATEGORIES.find((c) => c.label.toLowerCase() === input.trim().toLowerCase());
  return byLabel?.id ?? 'other';
}

export function parseLearnings(text: string): ParseResult {
  const rows: ParsedLearningRow[] = [];

  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line) return;
    // Tolerate a pasted header row.
    if (/^date\s*[|,]/i.test(line)) return;

    const fields = splitFields(line);
    const [dateField, title, categoryField, ...rest] = fields;
    const description = rest.join(fields.includes('|') ? ' | ' : ', ').trim();

    if (!title) {
      rows.push({ line: index + 1, raw: line, error: 'Needs at least a date and a title' });
      return;
    }

    const date = parseLearningDate(dateField ?? '');
    if (!date) {
      rows.push({ line: index + 1, raw: line, error: `Could not read the date “${dateField ?? ''}”` });
      return;
    }

    rows.push({
      line: index + 1,
      raw: line,
      value: {
        title: title.trim(),
        category: parseCategory(categoryField),
        description: description || undefined,
        date,
      },
    });
  });

  return {
    rows,
    valid: rows.filter((r) => r.value).map((r) => r.value!),
    errors: rows.filter((r) => r.error),
  };
}
