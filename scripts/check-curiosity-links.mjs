#!/usr/bin/env node
/**
 * Check every source URL in the Curiosity content pool.
 *
 * The published cards link out to these URLs, so a 404 here is a broken promise on
 * someone's screen. This script exists because the link check cannot run inside the
 * scheduler: the refresh job would then fail a day's publication because a third-party
 * site was briefly down, which is the wrong coupling. Run it by hand, or in CI, after
 * editing anything in `lib/curiosity/content/`.
 *
 *   node scripts/check-curiosity-links.mjs            # every pool URL
 *   node scripts/check-curiosity-links.mjs --only=gutenberg
 *
 * It reports a result for every URL and exits 1 if any of them is dead. A host that
 * refuses the request (403, 429, or a TLS failure against a proxy) is reported as
 * `blocked`, not `dead`: those need a browser to confirm, and one blocked host does
 * not fail the run — a dead path does.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const POOL_FILES = [
  'lib/curiosity/content/one-things.ts',
  'lib/curiosity/content/literature.ts',
  'lib/curiosity/content/learn-something.ts',
  'lib/curiosity/content/books.ts',
];
// The curated shelves that back the live cards link out too, so they belong in this
// check: a card the reader can act on is a card whose source still opens.
const SHELF_FILES = [
  'lib/curiosity/content/ai-background.ts',
  'lib/curiosity/content/radar-fallback.ts',
];
const TIMEOUT_MS = 15_000;
const CONCURRENCY = 4;
const UA = 'FocusDesk link check (content maintenance; not a crawler)';

const only = process.argv.slice(2).find((arg) => arg.startsWith('--only='))?.slice('--only='.length) ?? '';

/** The URL belongs to the entry whose `id:` precedes it. */
async function poolUrls() {
  const found = [];
  for (const file of [...POOL_FILES, ...SHELF_FILES]) {
    const source = await readFile(join(ROOT, file), 'utf8');
    const lines = source.split('\n');
    let currentId = '';
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      let id = line.match(/^\s+id: '([^']+)'/)?.[1] ?? null;
      if (!id) {
        // The shelves build their entries through a helper whose first argument is the
        // id, on its own line and followed within the entry by an https link.
        const bare = line.trim().match(/^'([a-z][a-z0-9]*(?:-[a-z0-9]+)+)',$/);
        if (bare && lines.slice(index + 1, index + 8).some((next) => /'https?:\/\//.test(next))) id = bare[1];
      }
      if (id) currentId = id;
      for (const url of line.matchAll(/'(https?:\/\/[^']+)'/g)) {
        if (!found.some((entry) => entry.url === url[1])) found.push({ url: url[1], id: currentId, file });
      }
    }
  }
  return only ? found.filter((entry) => entry.url.includes(only) || entry.id.includes(only)) : found;
}

async function check(entry) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    // GET, not HEAD: several literary and government sites answer HEAD with 405 and
    // some proxies drop it entirely, which would report a working page as broken.
    const response = await fetch(entry.url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
    });
    const bytes = Number(response.headers.get('content-length') ?? 0);
    await response.body?.cancel().catch(() => {});
    if (response.ok) return { ...entry, status: response.status, verdict: 'ok', note: bytes ? `${(bytes / 1024).toFixed(0)} kB` : '' };
    if (response.status === 403 || response.status === 429 || response.status === 405 || response.status === 451) {
      return { ...entry, status: response.status, verdict: 'blocked', note: 'refused this request; confirm in a browser' };
    }
    return { ...entry, status: response.status, verdict: 'dead', note: response.status === 404 ? 'no such page' : '' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ...entry, status: 'ERR', verdict: 'unreachable', note: message.slice(0, 80) };
  } finally {
    clearTimeout(timer);
  }
}

const entries = await poolUrls();
if (entries.length === 0) {
  console.error('No pool URLs matched. Pass --only=<substring> that exists, or nothing at all.');
  process.exit(1);
}

const results = new Array(entries.length);
let next = 0;
async function worker() {
  while (next < entries.length) {
    const index = next++;
    results[index] = await check(entries[index]);
  }
}
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, entries.length) }, worker));

const counts = { ok: 0, blocked: 0, dead: 0, unreachable: 0 };
for (const result of results) {
  counts[result.verdict] += 1;
  const line = `${result.verdict.toUpperCase().padEnd(11)} ${String(result.status).padEnd(4)} ${result.url}`;
  console.log(result.note ? `${line}  — ${result.note} [${result.id}]` : `${line}  [${result.id}]`);
}

console.log(`\n${entries.length} URLs: ${counts.ok} ok, ${counts.blocked} refused-the-probe, ${counts.unreachable} unreachable, ${counts.dead} dead.`);
if (counts.unreachable === entries.length && entries.length > 0) {
  console.error('Every request failed: this machine has no outbound access to these hosts. Run the check where it does.');
  process.exit(1);
}
if (counts.dead > 0) {
  console.error(`${counts.dead} link(s) are dead. Replace the URL in the entry named above — a card must not publish a broken source.`);
  process.exit(1);
}
if (counts.blocked > 0) {
  console.error(`${counts.blocked} host(s) refused the probe. Confirm them in a browser before publishing an edit that touches them.`);
}
console.log('No dead links.');
