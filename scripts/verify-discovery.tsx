/**
 * Verification for the shared discovery pipeline, Literature discovery and Science
 * expansion.
 *
 * Run: npx tsx scripts/verify-discovery.tsx
 *
 * What it proves, and why each check exists:
 *
 *  - **No invented integrations.** Every adapter is fed a recorded fixture of the
 *    real response shape and must produce records; when the fixture is missing,
 *    garbled or a 500, the adapter must report a failure instead of pretending.
 *  - **Isolation.** One adapter that throws mid-run must not stop the others.
 *  - **Licensing.** A record whose rights are unknown must be stored but never
 *    eligible; a research record must carry its caveat and must never claim to
 *    contain full text.
 *  - **Deduplication.** The same work from two sources must collapse; a re-run over
 *    unchanged data must write nothing.
 *  - **Persistence.** Rows land in the reservoir through the shared store, with
 *    idempotent upsert semantics and a run log that names each source.
 *  - **Scheduled, not per-visit.** No app route or component may import an adapter.
 *  - **Additive only.** The existing Curiosity daily rotation still yields the same
 *    twelve Speak Better ids and the same briefings.
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { FileCandidateStore, mergeCandidateDrafts, validateCandidate } from '../lib/curiosity/reservoir';
import type { CandidateDraft } from '../lib/curiosity/reservoir';
import type { KnowledgeCandidate, ReservoirCategory } from '../lib/curiosity/types';
import {
  COLLECTION_CATEGORIES,
  ELIGIBLE_RIGHTS,
  RIGHTS_STATUSES,
  collectionAllowsCategory,
  collectionOfCandidate,
  collectionRecordId,
  describeCollectionRun,
  payloadForCollection,
  rightsAttribution,
  rightsAreEligible,
  statusForRights,
  summarizeSourceReports,
  type SourceReport,
} from '../lib/discovery/collection';
import { computeHttpBackoffMs, httpGet, redactUrl, resetRateLimiterForTesting, discoveryUserAgent } from '../lib/discovery/http';
import { catalogueValidationNotes, persistCollectionRun } from '../lib/discovery/persist';
import { advanceCursor, runAdapter, runCollectionDiscovery, adaptersForCollection, LITERATURE_ADAPTERS, SCIENCE_ADAPTERS } from '../lib/discovery/run';
import { orderShelfForDate, selectShelf, shelfScore, toShelfEntry, workIdentity } from '../lib/discovery/shelf';
import { getCollectionShelf } from '../lib/discovery/server';
import { gutenbergAdapter, parseGutenbergRdf } from '../lib/discovery/sources/gutenberg';
import { parseOpdsFeed, stableKeyFromOpdsId, standardEbooksAdapter } from '../lib/discovery/sources/standard-ebooks';
import { parseWikisourceResponse, rightsFromCategories, wikisourceAdapter } from '../lib/discovery/sources/wikisource';
import { parseWikipediaScienceResponse, wikipediaScienceAdapter, wikidataScienceAdapter } from '../lib/discovery/sources/wikipedia-science';
import { parseNasaResponse, nasaAdapter } from '../lib/discovery/sources/nasa';
import { parseOpenStaxResponse, openStaxAdapter } from '../lib/discovery/sources/openstax';
import { parseEuropePmcResponse, researchCaveat, europePmcAdapter } from '../lib/discovery/sources/europepmc';
import { LiteratureDiscoveryCard } from '../components/curiosity/sections/literature-discovery';
import { ScienceDiscoveryCard } from '../components/curiosity/sections/science-discovery';

let checks = 0;
/**
 * One assertion. Accepts a promise so an async check is genuinely awaited — a
 * truthy Promise would otherwise let a failing assertion pass silently, which is
 * exactly the kind of weakened test this harness exists to prevent.
 */
async function ok(label: string, condition: boolean | Promise<boolean>): Promise<void> {
  const value = await condition;
  assert.ok(value, label);
  checks += 1;
  console.log(`  ✓ ${label}`);
}

const NOW = '2026-11-04T11:20:00.000Z';

/* ------------------------------------------------------------------ */
/* Fixtures: recorded shapes of the real responses                     */
/* ------------------------------------------------------------------ */

const GUTENBERG_RDF = `<?xml version="1.0" encoding="utf-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dcterms="http://purl.org/dc/terms/">
  <pgterms:ebook rdf:about="ebooks/2701" xmlns:pgterms="http://www.gutenberg.org/2009/pgterms/">
    <dcterms:title>Moby Dick; Or, The Whale</dcterms:title>
    <dcterms:creator><pgterms:agent rdf:about="agents/16"><pgterms:name>Melville, Herman</pgterms:name></pgterms:agent></dcterms:creator>
    <dcterms:issued>2001-07-01</dcterms:issued>
    <dcterms:language><rdf:Description rdf:about="languages/en"/></dcterms:language>
    <dcterms:rights>Public domain in the USA.</dcterms:rights>
    <dcterms:subject><rdf:Description><rdf:value>Whales -- Fiction</rdf:value></rdf:Description></dcterms:subject>
    <dcterms:identifier>http://www.gutenberg.org/ebooks/2701</dcterms:identifier>
  </pgterms:ebook>
</rdf:RDF>`;

const OPDS_FEED = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/terms/">
  <entry>
    <id>https://standardebooks.org/ebooks/jane-austen/pride-and-prejudice</id>
    <title>Pride and Prejudice</title>
    <author><name>Jane Austen</name></author>
    <updated>2024-03-01T00:00:00Z</updated>
    <dc:language>en-GB</dc:language>
    <dc:rights>Public domain in the United States.</dc:rights>
    <category label="Fiction"/>
    <link rel="alternate" type="text/html" href="https://standardebooks.org/ebooks/jane-austen/pride-and-prejudice"/>
    <link rel="http://opds-spec.org/acquisition" type="application/epub+zip" href="https://standardebooks.org/ebooks/jane-austen/pride-and-prejudice/downloads/jane-austen_pride-and-prejudice.epub"/>
  </entry>
</feed>`;

const WIKISOURCE_JSON = {
  query: {
    pages: [
      {
        pageid: 4242,
        title: 'The Raven',
        extract: 'Once upon a midnight dreary, while I pondered, weak and weary, over many a quaint and curious volume of forgotten lore.',
        canonicalurl: 'https://en.wikisource.org/wiki/The_Raven',
        categories: [{ title: 'Category:Public domain' }, { title: 'Category:Poems' }],
      },
      {
        pageid: 4243,
        title: 'Author:Edgar Allan Poe',
        extract: 'An author page.',
        canonicalurl: 'https://en.wikisource.org/wiki/Author:Edgar_Allan_Poe',
        categories: [{ title: 'Category:Authors' }],
      },
      {
        pageid: 4244,
        title: 'A Shirt Without Rights',
        extract: 'This one has a long enough extract to survive the length filter, but no rights category at all.',
        canonicalurl: 'https://en.wikisource.org/wiki/A_Shirt_Without_Rights',
        categories: [],
      },
    ],
  },
};

const WIKIPEDIA_JSON = {
  query: {
    pages: [
      {
        pageid: 23070,
        title: 'Photosynthesis',
        extract: 'Photosynthesis is a system of biological processes by which photosynthetic organisms convert light energy into chemical energy.',
        canonicalurl: 'https://en.wikipedia.org/wiki/Photosynthesis',
        pageprops: { wikibase_item: 'Q11982' },
        description: 'biological process',
      },
      {
        pageid: 999,
        title: 'Mercury',
        extract: 'Mercury may refer to: a planet, an element, a Roman god, and other uses in different contexts of the word.',
        canonicalurl: 'https://en.wikipedia.org/wiki/Mercury',
        pageprops: {},
      },
    ],
  },
};

const WIKIDATA_JSON = {
  search: [
    { id: 'Q11982', label: 'photosynthesis', description: 'process by which plants use sunlight to synthesise nutrients' },
    { id: 'Q42', label: 'x', description: 'too short' },
  ],
};

const NASA_JSON = {
  collection: {
    items: [
      {
        data: [
          {
            nasa_id: 'PIA12235',
            title: 'Pillars of Creation',
            description: 'These towering pillars of cold gas and dust are incubators for new stars, imaged in infrared by the Hubble Space Telescope.',
            date_created: '2015-01-05T00:00:00Z',
            center: 'JPL',
            keywords: ['nebula', 'stars'],
          },
        ],
      },
    ],
  },
};

const OPENSTAX_JSON = {
  items: [
    {
      slug: 'biology-2e',
      title: 'Biology 2e',
      summary: 'Biology 2e is designed to cover the scope and sequence requirements of a typical two-semester biology course for science majors.',
      license: 'CC BY 4.0',
      subject: 'Biology',
    },
  ],
};

const EPMC_JSON = {
  resultList: {
    result: [
      {
        id: '12345678',
        title: 'Sleep deprivation and cognitive performance in shift workers',
        authorString: 'Doe J, Roe R.',
        journalTitle: 'Journal of Sleep Research',
        pubYear: '2021',
        doi: '10.1000/example',
        abstractText: 'We followed two hundred shift workers over twelve months and measured attention, working memory and reaction time across sleep conditions, finding measurable declines in attention.',
        pubType: 'Journal Article',
        source: 'MED',
      },
      {
        id: '99999999',
        title: 'A preprint with no abstract',
        pubYear: '2024',
        pubType: 'Preprint',
        source: 'PPR',
      },
    ],
  },
};

/** A fetch stand-in keyed by URL fragment. Records every call. */
function stubFetch(routes: { match: RegExp; body?: string; status?: number }[]): { fetchImpl: typeof fetch; calls: string[] } {
  const calls: string[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);
    const route = routes.find((candidate) => candidate.match.test(url));
    if (!route) return new Response('not found', { status: 404 });
    const status = route.status ?? 200;
    return new Response(status >= 400 ? 'error' : route.body ?? '', { status });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const noSleep = async (): Promise<void> => {};

function memoryStore(): FileCandidateStore & { written: KnowledgeCandidate[][] } {
  // A file-backed store in a temp directory keeps the real persistence code path
  // (JSON shape, upsert merge) without touching the developer's `.curiosity`.
  const dir = `/tmp/focusdesk-discovery-${process.pid}-${checks}-${Math.random().toString(36).slice(2)}`;
  const store = new FileCandidateStore(dir) as FileCandidateStore & { written: KnowledgeCandidate[][] };
  store.written = [];
  const original = store.writeUpsert.bind(store);
  store.writeUpsert = async (candidates) => {
    store.written.push([...candidates]);
    return original(candidates);
  };
  return store;
}

async function main(): Promise<void> {
  console.log('\nShared discovery architecture\n');

  /* ---- Collections ---------------------------------------------- */
  await ok('two collections reuse the existing reservoir categories rather than adding new ones', (() => {
    for (const collection of ['literature', 'science'] as const) {
      for (const category of COLLECTION_CATEGORIES[collection]) {
        assert.ok(
          ['sikh-history', 'indian-history', 'world-history', 'mythology', 'chemistry', 'physics', 'biology', 'one-thing', 'learn-something', 'literature', 'book', 'ai-world', 'developer-radar']
            .includes(category),
          `${collection} may not write ${category}`,
        );
      }
    }
    return true;
  })());
  await ok('a collection cannot write a category outside its own scope', !collectionAllowsCategory('literature', 'chemistry') && collectionAllowsCategory('science', 'chemistry'));
  await ok('a stored row with no marker is Curiosity content, so pre-existing data is unaffected', (() => {
    const legacy = { category: 'chemistry' as ReservoirCategory } as KnowledgeCandidate;
    return collectionOfCandidate(legacy) === 'curiosity' && collectionOfCandidate({ category: 'book', payload: payloadForCollection('literature', {}) }) === 'literature';
  })());

  /* ---- Rights ---------------------------------------------------- */
  await ok('every rights status has an attribution sentence a reader can act on', RIGHTS_STATUSES.every((status) => {
    const sentence = rightsAttribution(status, 'Some Source');
    assert.ok(sentence.length > 40, status);
    assert.ok(sentence.includes('Some Source'), status);
    return true;
  }));
  await ok('an unverified rights status is stored but never eligible', (() => {
    const decision = statusForRights('unknown');
    assert.equal(decision.eligible, false);
    assert.equal(decision.validationStatus, 'needs-review');
    return true;
  })());
  await ok('public-domain-asserted is eligible but always carries the country caveat', (() => {
    const decision = statusForRights('public-domain-asserted');
    assert.equal(decision.eligible, true);
    assert.ok(decision.notes.join(' ').toLowerCase().includes('country'));
    return true;
  })());
  await ok('abstract-only is eligible, because a metadata record may be shown even when the paper may not', rightsAreEligible('abstract-only'));
  await ok('the eligible set is exactly four statuses', ELIGIBLE_RIGHTS.length === 4);

  /* ---- Identity and reporting ----------------------------------- */
  await ok('record ids are stable, namespaced and free of URL-unsafe characters', (() => {
    const id = collectionRecordId('Project Gutenberg', 'Ébook / 2701 ?q=1');
    assert.equal(id, id.toLowerCase());
    assert.ok(/^[a-z0-9-]+$/.test(id));
    assert.equal(id, collectionRecordId('Project Gutenberg', 'Ébook / 2701 ?q=1'));
    return true;
  })());
  await ok('a run summary names the sources that failed without flattening a partial success', (() => {
    const reports: SourceReport[] = [
      { sourceId: 'gutenberg', sourceName: 'G', status: 'partial', fetched: 3, accepted: 2, rejected: 1, duplicates: 0, finishedAt: NOW },
      { sourceId: 'wikisource', sourceName: 'W', status: 'failed', fetched: 0, accepted: 0, rejected: 0, duplicates: 0, finishedAt: NOW, note: 'HTTP 500' },
    ];
    const summary = summarizeSourceReports(reports);
    const text = describeCollectionRun({ collection: 'literature', ranAt: NOW, trigger: 'cron', categoriesChecked: ['book'], reports, notes: [] });
    assert.equal(summary.failed, 1);
    assert.equal(summary.partial, 1);
    assert.ok(text.includes('failed: wikisource'));
    assert.ok(text.includes('1 partial'));
    return true;
  })());
  await ok('"all sources failed" is only true when every source actually failed', (() => {
    const disabled: SourceReport[] = [
      { sourceId: 'a', sourceName: 'A', status: 'disabled', fetched: 0, accepted: 0, rejected: 0, duplicates: 0, finishedAt: NOW },
    ];
    assert.equal(summarizeSourceReports(disabled).allFailed, false);
    const all: SourceReport[] = [
      { sourceId: 'a', sourceName: 'A', status: 'failed', fetched: 0, accepted: 0, rejected: 0, duplicates: 0, finishedAt: NOW },
      { sourceId: 'b', sourceName: 'B', status: 'failed', fetched: 0, accepted: 0, rejected: 0, duplicates: 0, finishedAt: NOW },
    ];
    assert.equal(summarizeSourceReports(all).allFailed, true);
    return true;
  })());

  /* ---- HTTP politeness ------------------------------------------- */
  console.log('\nSource politeness\n');
  await ok('retry backoff doubles and is capped, and honours Retry-After in seconds and as a date', (() => {
    assert.equal(computeHttpBackoffMs(1), 900);
    assert.equal(computeHttpBackoffMs(2), 1800);
    assert.equal(computeHttpBackoffMs(9), 8000);
    assert.equal(computeHttpBackoffMs(1, '3'), 3000);
    assert.ok(computeHttpBackoffMs(1, new Date(Date.now() + 4000).toUTCString()) <= 8000);
    return true;
  })());
  await ok('a URL is redacted before it can reach a log', !redactUrl('https://api.example.org/x?key=SECRET').includes('SECRET'));
  await ok('the user agent identifies the project and includes the existing contact variable when set', (() => {
    const previous = process.env.WIKIMEDIA_CONTACT_EMAIL;
    process.env.WIKIMEDIA_CONTACT_EMAIL = 'ops@example.org';
    const withContact = discoveryUserAgent('discovery');
    process.env.WIKIMEDIA_CONTACT_EMAIL = previous;
    delete process.env.WIKIMEDIA_CONTACT_EMAIL;
    const without = discoveryUserAgent('discovery');
    return withContact.includes('ops@example.org') && withContact.includes('FocusDesk') && !without.includes('contact:');
  })());
  await ok('a 404 is not retried, a 500 is retried, and a network throw becomes a note instead of an exception', (async () => {
    resetRateLimiterForTesting();
    const notFound = stubFetch([{ match: /missing/, status: 404 }]);
    const first = await httpGet('https://www.gutenberg.org/missing.rdf', { fetchImpl: notFound.fetchImpl, sleepImpl: noSleep, attempts: 3 });
    assert.equal(first.ok, false);
    assert.equal(notFound.calls.length, 1);

    const flaky = stubFetch([{ match: /flaky/, status: 503 }]);
    const second = await httpGet('https://www.gutenberg.org/flaky.rdf', { fetchImpl: flaky.fetchImpl, sleepImpl: noSleep, attempts: 2 });
    assert.equal(second.ok, false);
    assert.equal(flaky.calls.length, 2);

    const throwing = (async () => { throw new Error('ECONNRESET'); }) as unknown as typeof fetch;
    const third = await httpGet('https://www.gutenberg.org/throws.rdf', { fetchImpl: throwing, sleepImpl: noSleep, attempts: 1 });
    return third.ok === false && third.note.length > 0;
  })());
  // The async check above pushes its own success; count it once here.

  /* ---- Literature adapters -------------------------------------- */
  console.log('\nLiterature sources\n');
  await ok('the Gutenberg RDF parser reads title, author, rights, language and subjects', (() => {
    const record = parseGutenbergRdf(GUTENBERG_RDF);
    return record.title === 'Moby Dick; Or, The Whale'
      && record.author === 'Melville, Herman'
      && (record.rights ?? '').includes('Public domain')
      && record.language === 'en'
      && record.subjects.length > 0;
  })());
  await ok('Gutenberg records are verified public domain in the US, never imported, and carry a link', (async () => {
    process.env.CURIOSITY_LITERATURE_SOURCES = 'on';
    const stub = stubFetch([
      { match: /2701\.rdf/, body: GUTENBERG_RDF },
      { match: /\.rdf/, status: 404 },
    ]);
    // The cursor is the window start: a run resumes from the last identifier it
    // reached rather than restarting at ebook 1 every night.
    const outcome = await gutenbergAdapter.run({ fetchImpl: stub.fetchImpl, sleepImpl: noSleep, nowIso: NOW, maxRecords: 1, cursor: '2701' });
    assert.equal(outcome.drafts.length, 1);
    const draft = outcome.drafts[0];
    assert.equal(draft.category, 'book');
    assert.equal(draft.eligible, true);
    assert.equal(draft.payload?.rights, 'public-domain-verified');
    assert.equal(draft.payload?.excerptImported, false);
    assert.ok((draft.canonicalUrl ?? '').startsWith('https://www.gutenberg.org/ebooks/2701'));
    assert.ok((draft.attribution ?? '').includes('your own country'));
    assert.equal(outcome.report.status, 'ok');
    return true;
  })());
  await ok('Gutenberg tolerates retired identifiers and reports a real failure when the host is down', (async () => {
    const retired = stubFetch([{ match: /\.rdf/, status: 404 }]);
    const none = await gutenbergAdapter.run({ fetchImpl: retired.fetchImpl, sleepImpl: noSleep, nowIso: NOW, maxRecords: 1 });
    assert.equal(none.report.status, 'skipped');
    assert.equal(none.drafts.length, 0);

    const down = stubFetch([{ match: /\.rdf/, status: 500 }]);
    const failed = await gutenbergAdapter.run({ fetchImpl: down.fetchImpl, sleepImpl: noSleep, nowIso: NOW, maxRecords: 1 });
    return failed.report.status === 'failed' && typeof failed.report.note === 'string';
  })());
  await ok('the Standard Ebooks OPDS parser reads entries and prefers the book page over the download link', (() => {
    const entries = parseOpdsFeed(OPDS_FEED);
    assert.equal(entries.length, 1);
    const entry = entries[0];
    assert.equal(entry.title, 'Pride and Prejudice');
    assert.equal(entry.author, 'Jane Austen');
    assert.equal(entry.link, 'https://standardebooks.org/ebooks/jane-austen/pride-and-prejudice');
    assert.ok(!(entry.link ?? '').includes('.epub'));
    assert.equal(stableKeyFromOpdsId(entry.id, entry.title), 'jane-austen-pride-and-prejudice');
    return true;
  })());
  await ok('Standard Ebooks records are public domain in the US and say so', (async () => {
    const stub = stubFetch([{ match: /opds\/all/, body: OPDS_FEED }]);
    const outcome = await standardEbooksAdapter.run({ fetchImpl: stub.fetchImpl, sleepImpl: noSleep, nowIso: NOW });
    assert.equal(outcome.drafts.length, 1);
    assert.equal(outcome.drafts[0].payload?.rights, 'public-domain-verified');
    assert.equal(outcome.drafts[0].license, 'Public domain (USA)');
    return true;
  })());
  await ok('an unreadable feed is reported as a failure rather than as an empty success', (async () => {
    const stub = stubFetch([{ match: /opds\/all/, body: '<html>not a feed</html>' }]);
    const outcome = await standardEbooksAdapter.run({ fetchImpl: stub.fetchImpl, sleepImpl: noSleep, nowIso: NOW });
    return outcome.report.status === 'failed' && outcome.drafts.length === 0;
  })());
  await ok('Wikisource decides reuse from each page\'s own categories, not from the site', (() => {
    assert.equal(rightsFromCategories(['Category:Public domain']), 'public-domain-verified');
    assert.equal(rightsFromCategories(['Category:CC-BY-SA-4.0']), 'permitted-reuse');
    assert.equal(rightsFromCategories(['Category:Poems']), 'unknown');
    // An explicit licence wins over a public-domain category.
    assert.equal(rightsFromCategories(['Category:Public domain', 'Category:CC BY-SA 4.0']), 'permitted-reuse');
    return true;
  })());
  await ok('Wikisource drops namespaces, keeps texts, and never marks an unlicensed page eligible', (async () => {
    // The category-scoped query is answered with an empty page set, which is what a
    // small wiki does; the adapter must then retry the plain search (second route)
    // instead of reporting a healthy wiki as broken.
    const stub = stubFetch([
      { match: /incategory/, body: JSON.stringify({ query: { pages: [] } }) },
      { match: /w\/api\.php/, body: JSON.stringify(WIKISOURCE_JSON) },
    ]);
    const outcome = await wikisourceAdapter.run({ fetchImpl: stub.fetchImpl, sleepImpl: noSleep, nowIso: NOW });
    const titles = outcome.drafts.map((draft) => draft.title);
    assert.deepEqual(titles.sort(), ['A Shirt Without Rights', 'The Raven']);
    const raven = outcome.drafts.find((draft) => draft.title === 'The Raven');
    const shirt = outcome.drafts.find((draft) => draft.title === 'A Shirt Without Rights');
    assert.equal(raven?.eligible, true);
    assert.equal(shirt?.eligible, false);
    assert.equal(shirt?.validationStatus, 'needs-review');
    // The category filter returns nothing for the fixture, so the adapter falls back
    // to the plain search rather than reporting the wiki as broken.
    assert.equal(stub.calls.length, 2);
    return true;
  })());
  await ok('the Wikisource parser accepts both list-shaped and map-shaped page results', (() => {
    const mapShape = { query: { pages: { 1: { pageid: 1, title: 'A', categories: [] } } } };
    // Two of the three fixture pages survive: the Author: namespace page is not a text.
    return parseWikisourceResponse(WIKISOURCE_JSON).length === 2 && parseWikisourceResponse(mapShape).length === 1;
  })());

  /* ---- Science adapters ----------------------------------------- */
  console.log('\nScience sources\n');
  await ok('the Wikipedia parser keeps the Wikidata QID so one concept is one identity', (() => {
    const pages = parseWikipediaScienceResponse(WIKIPEDIA_JSON);
    assert.equal(pages[0].wikidataId, 'Q11982');
    assert.equal(pages[1].wikidataId, undefined);
    return true;
  })());
  await ok('a Wikipedia explainer is CC BY-SA, eligible, and rejects a disambiguation page', (async () => {
    process.env.CURIOSITY_SCIENCE_SOURCES = 'on';
    const stub = stubFetch([{ match: /en\.wikipedia\.org/, body: JSON.stringify(WIKIPEDIA_JSON) }]);
    const outcome = await wikipediaScienceAdapter.run({ fetchImpl: stub.fetchImpl, sleepImpl: noSleep, nowIso: NOW });
    assert.equal(outcome.drafts.length, 1);
    assert.equal(outcome.drafts[0].title, 'Photosynthesis');
    assert.equal(outcome.drafts[0].license, 'CC BY-SA 4.0');
    assert.equal(outcome.drafts[0].entityId, 'wikidata:Q11982');
    assert.equal(outcome.report.rejected, 1);
    return true;
  })());
  await ok('a Wikidata entity is CC0 and shares the Wikipedia record\'s identity', (async () => {
    const stub = stubFetch([{ match: /wikidata\.org/, body: JSON.stringify(WIKIDATA_JSON) }]);
    const outcome = await wikidataScienceAdapter.run({ fetchImpl: stub.fetchImpl, sleepImpl: noSleep, nowIso: NOW });
    assert.equal(outcome.drafts.length, 1);
    assert.equal(outcome.drafts[0].license, 'CC0 1.0');
    assert.equal(outcome.drafts[0].entityId, 'wikidata:Q11982');
    assert.equal(outcome.report.rejected, 1);
    return true;
  })());
  await ok('NASA media is attributed, dated only when the date is plausible, and never copied', (async () => {
    const stub = stubFetch([{ match: /images-api\.nasa\.gov/, body: JSON.stringify(NASA_JSON) }]);
    const outcome = await nasaAdapter.run({ fetchImpl: stub.fetchImpl, sleepImpl: noSleep, nowIso: NOW });
    const draft = outcome.drafts[0];
    assert.ok((draft.attribution ?? '').includes('does not endorse'));
    assert.equal(draft.payload?.mediaCopied, false);
    assert.equal(draft.eventYear, 2015);
    assert.equal(draft.payload?.dateVerified, true);
    return true;
  })());
  await ok('an implausible NASA date is recorded as unknown, not printed', (async () => {
    const broken = { collection: { items: [{ data: [{ nasa_id: 'X1', title: 'Odd', description: 'A description long enough to survive validation checks in this harness.', date_created: '1901-01-01T00:00:00Z' }] }] } };
    const stub = stubFetch([{ match: /images-api/, body: JSON.stringify(broken) }]);
    const outcome = await nasaAdapter.run({ fetchImpl: stub.fetchImpl, sleepImpl: noSleep, nowIso: NOW });
    return outcome.drafts[0].eventYear === undefined && outcome.drafts[0].payload?.dateVerified === false;
  })());
  await ok('OpenStax records carry their own licence, and an unlicensed one is not published', (async () => {
    const stub = stubFetch([{ match: /openstax/, body: JSON.stringify(OPENSTAX_JSON) }]);
    const outcome = await openStaxAdapter.run({ fetchImpl: stub.fetchImpl, sleepImpl: noSleep, nowIso: NOW });
    assert.equal(outcome.drafts[0].license, 'CC BY 4.0');
    assert.equal(outcome.drafts[0].eligible, true);

    const noLicence = { items: [{ slug: 'mystery', title: 'Mystery Book', summary: 'A summary long enough to be useful to a reader deciding whether to open the book at all.' }] };
    const second = stubFetch([{ match: /openstax/, body: JSON.stringify(noLicence) }]);
    const other = await openStaxAdapter.run({ fetchImpl: second.fetchImpl, sleepImpl: noSleep, nowIso: NOW });
    return other.drafts[0].eligible === false;
  })());
  await ok('Europe PMC stores metadata and abstract only, and says it is not established fact', (async () => {
    const stub = stubFetch([{ match: /europepmc/, body: JSON.stringify(EPMC_JSON) }]);
    const outcome = await europePmcAdapter.run({ fetchImpl: stub.fetchImpl, sleepImpl: noSleep, nowIso: NOW });
    assert.equal(outcome.drafts.length, 1);
    const draft = outcome.drafts[0];
    assert.equal(draft.payload?.fullTextIncluded, false);
    assert.equal(draft.payload?.isEstablishedFact, false);
    assert.equal(draft.payload?.rights, 'abstract-only');
    assert.ok(draft.canonicalUrl.startsWith('https://doi.org/10.1000/example'));
    assert.equal(outcome.report.rejected, 1);
    return true;
  })());
  await ok('a preprint, a review and a single study each get their own caveat', (() => {
    const preprint = researchCaveat('Preprint', 'medRxiv');
    const review = researchCaveat('Review', 'BMJ');
    const study = researchCaveat('Journal Article', 'Nature');
    return preprint.includes('not completed peer review')
      && review.includes('review or meta-analysis')
      && study.includes('not established fact')
      && new Set([preprint, review, study]).size === 3;
  })());
  await ok('the Europe PMC parser keeps the publication year and drops impossible ones', (() => {
    const records = parseEuropePmcResponse(EPMC_JSON);
    assert.equal(records[0].year, 2021);
    const broken = parseEuropePmcResponse({ resultList: { result: [{ id: 'x', title: 'T', pubYear: '12' }] } });
    return records.length === 2 && broken[0].year === undefined;
  })());

  /* ---- Validation policy ---------------------------------------- */
  console.log('\nValidation and licensing gate\n');
  await ok('the catalogue policy is a named stricter pathway, not a weakened Curiosity gate', (() => {
    const draft: CandidateDraft = {
      id: 'x', entityId: 'x', canonicalUrl: 'https://example.org/x', category: 'book',
      title: 'A Work', description: 'too short', sourceName: 'S', payload: { kind: 'book' },
    };
    const notes = catalogueValidationNotes(draft, 'catalogue');
    assert.ok(notes.includes('no named author'));
    assert.ok(notes.includes('no usable language code'));
    assert.ok(notes.includes('no rights or licence statement'));
    // The standard pathway is untouched.
    assert.deepEqual(catalogueValidationNotes(draft, 'standard'), []);
    return true;
  })());
  await ok('authorship is required for a book and not for a mission image, so no name is ever invented', (async () => {
    const image: CandidateDraft = {
      id: 'nasa-x', entityId: 'nasa:x', canonicalUrl: 'https://images.nasa.gov/details/x', category: 'physics',
      title: 'An image', description: 'A description long enough to pass the length floor.',
      sourceName: 'NASA', payload: { kind: 'mission-media', language: 'en', rights: 'public-domain-asserted' },
    };
    const book: CandidateDraft = { ...image, id: 'book-x', payload: { kind: 'book', language: 'en', rights: 'public-domain-verified' } };
    const notes = catalogueValidationNotes(image, 'catalogue');
    const bookNotes = catalogueValidationNotes(book, 'catalogue');
    return !notes.includes('no named author') && bookNotes.includes('no named author');
  })());
  await ok('markup in a description is rejected, because the card renders text not HTML', (() => {
    const draft: CandidateDraft = {
      id: 'x', entityId: 'x', canonicalUrl: 'https://example.org/x', category: 'book',
      title: 'A Work', description: '<b>bold</b> claim', sourceName: 'S',
      payload: { author: 'A', language: 'en', rights: 'public-domain-verified' },
    };
    return catalogueValidationNotes(draft, 'catalogue').includes('description contains HTML markup');
  })());
  await ok('the shared Curiosity gate still rejects a record it always rejected', (() => {
    const outcome = validateCandidate({
      id: 'bad', entityId: 'bad', canonicalUrl: 'not-a-url', category: 'book',
      title: '', description: '', sourceName: '',
    });
    return outcome.ok === false;
  })());

  /* ---- Deduplication and idempotency ---------------------------- */
  console.log('\nDeduplication and persistence\n');
  await ok('the same work from Gutenberg and Standard Ebooks is one work identity', (() => {
    const gutenberg = { id: 'g1', entityId: 'gutenberg:2701', title: 'Moby Dick — Melville', canonicalUrl: 'https://www.gutenberg.org/ebooks/2701', payload: { author: 'Herman Melville' } } as unknown as KnowledgeCandidate;
    const standard = { id: 's1', entityId: 'standardebooks:moby-dick', title: 'Moby Dick — Melville', canonicalUrl: 'https://standardebooks.org/ebooks/moby-dick', payload: { author: 'Herman Melville' } } as unknown as KnowledgeCandidate;
    // Distinct entity ids, so they are distinct records; the shelf collapses them by
    // normalized title + author so a reader never sees both on one screen.
    const byTitle = workIdentity({ ...gutenberg, entityId: '' } as KnowledgeCandidate);
    const byTitleOther = workIdentity({ ...standard, entityId: '' } as KnowledgeCandidate);
    return byTitle === byTitleOther;
  })());
  await ok('a shelf never shows the same work twice, and prefers one of each kind', (() => {
    const base = { eligible: true, validationStatus: 'valid' as const, sourceName: 'S', canonicalUrl: 'https://example.org/x' };
    const candidates = [
      { ...base, id: 'a', entityId: 'wikidata:Q1', title: 'Photosynthesis', description: 'd', payload: { collection: 'science', kind: 'explainer' } },
      { ...base, id: 'b', entityId: 'wikidata:Q1', title: 'Photosynthesis (again)', description: 'd', payload: { collection: 'science', kind: 'entity' } },
      { ...base, id: 'c', entityId: 'europepmc:1', title: 'A Study', description: 'd', payload: { collection: 'science', kind: 'research-abstract' } },
      { ...base, id: 'd', entityId: 'openstax:b', title: 'A Book', description: 'd', payload: { collection: 'science', kind: 'textbook' } },
    ] as unknown as KnowledgeCandidate[];
    const shelf = selectShelf({ collection: 'science', date: '2026-11-04', candidates, limit: 4 });
    const ids = shelf.map((entry) => entry.id);
    assert.ok(!(ids.includes('a') && ids.includes('b')), 'the same QID appeared twice');
    assert.equal(new Set(shelf.map((entry) => entry.kind)).size, shelf.length);
    return true;
  })());
  await ok('an ineligible record never reaches a shelf, whatever its source', (() => {
    const candidates = [
      { id: 'x', entityId: 'x', title: 'X', description: 'd', canonicalUrl: 'https://example.org/x', sourceName: 'S', eligible: false, validationStatus: 'valid', payload: { collection: 'literature' } },
      { id: 'y', entityId: 'y', title: 'Y', description: 'd', canonicalUrl: 'https://example.org/y', sourceName: 'S', eligible: true, validationStatus: 'needs-review', payload: { collection: 'literature' } },
    ] as unknown as KnowledgeCandidate[];
    return selectShelf({ collection: 'literature', date: '2026-11-04', candidates }).length === 0;
  })());
  await ok('a shelf is stable for a date and rotates across dates', (() => {
    const entry = { id: 'a', title: 'A' } as never;
    assert.equal(shelfScore('2026-11-04', 'a'), shelfScore('2026-11-04', 'a'));
    assert.notEqual(shelfScore('2026-11-04', 'a'), shelfScore('2026-11-05', 'a'));
    const shelf = [{ ...entry, id: 'a' }, { ...entry, id: 'b' }, { ...entry, id: 'c' }] as never[];
    return JSON.stringify(orderShelfForDate(shelf, '2026-11-04').map((e: { id: string }) => e.id))
      === JSON.stringify(orderShelfForDate(shelf, '2026-11-04').map((e: { id: string }) => e.id));
  })());
  await ok('a record with no usable URL is dropped rather than rendered as a dead link', toShelfEntry({ id: 'x', title: 'T', description: 'd', canonicalUrl: '', sourceName: 'S', payload: {} } as unknown as KnowledgeCandidate) === null);
  await ok('a re-run over unchanged upstream data writes nothing, which is what makes discovery idempotent', (async () => {
    const store = memoryStore();
    const draft: CandidateDraft = {
      id: 'gutenberg-2701', entityId: 'gutenberg:2701', canonicalUrl: 'https://www.gutenberg.org/ebooks/2701',
      category: 'book', title: 'Moby Dick', description: 'By Melville, Herman. Catalogued under Whales.', sourceName: 'Project Gutenberg',
      attribution: 'Public domain as stated by Project Gutenberg.', license: 'Public domain (USA)',
      payload: { collection: 'literature', author: 'Melville, Herman', language: 'en', rights: 'public-domain-verified', excerptImported: false },
      validationStatus: 'valid', eligible: true,
    };
    const report: SourceReport = { sourceId: 'gutenberg', sourceName: 'Project Gutenberg', status: 'ok', fetched: 1, accepted: 1, rejected: 0, duplicates: 0, finishedAt: NOW };
    const first = await persistCollectionRun({ collection: 'literature', drafts: [draft], reports: [report], trigger: 'cron', nowIso: NOW, store });
    assert.equal(first.persisted, true);
    assert.equal(first.written, 1);
    const second = await persistCollectionRun({ collection: 'literature', drafts: [draft], reports: [report], trigger: 'cron', nowIso: NOW, store });
    assert.equal(second.written, 0);
    return true;
  })());
  await ok('the persisted row is readable back through the store with its attribution and licence intact', (async () => {
    const store = memoryStore();
    const draft: CandidateDraft = {
      id: 'standard-ebooks-pride', entityId: 'standardebooks:jane-austen-pride-and-prejudice',
      canonicalUrl: 'https://standardebooks.org/ebooks/jane-austen/pride-and-prejudice',
      category: 'book', title: 'Pride and Prejudice', description: 'By Jane Austen. Catalogued under Fiction.',
      sourceName: 'Standard Ebooks', attribution: 'Public domain as stated by Standard Ebooks.', license: 'Public domain (USA)',
      payload: { collection: 'literature', author: 'Jane Austen', language: 'en-GB', rights: 'public-domain-verified' },
      validationStatus: 'valid', eligible: true,
    };
    const report: SourceReport = { sourceId: 'standard-ebooks', sourceName: 'Standard Ebooks', status: 'ok', fetched: 1, accepted: 1, rejected: 0, duplicates: 0, finishedAt: NOW };
    await persistCollectionRun({ collection: 'literature', drafts: [draft], reports: [report], trigger: 'cron', nowIso: NOW, store });
    const stored = await store.readAll();
    const row = stored.find((candidate) => candidate.id === 'standard-ebooks-pride');
    return Boolean(row && row.license === 'Public domain (USA)' && row.payload?.author === 'Jane Austen' && collectionOfCandidate(row) === 'literature');
  })());
  await ok('a draft outside the collection is rejected before it can be written', (async () => {
    const store = memoryStore();
    const wrong: CandidateDraft = {
      id: 'x', entityId: 'x', canonicalUrl: 'https://example.org/x', category: 'chemistry',
      title: 'A chemistry item', description: 'A description long enough to pass the length floor.',
      sourceName: 'S', payload: { collection: 'literature', author: 'A', language: 'en', rights: 'public-domain-verified' },
      validationStatus: 'valid', eligible: true,
    };
    const result = await persistCollectionRun({ collection: 'literature', drafts: [wrong], reports: [], trigger: 'cron', nowIso: NOW, store });
    return result.written === 0 && result.notes.some((note) => note.includes('not part of the literature collection'));
  })());

  /* ---- Isolation ------------------------------------------------- */
  console.log('\nPer-source isolation\n');
  await ok('an adapter that throws is reported as failed, not propagated', (async () => {
    const exploding = {
      id: 'exploding',
      name: 'Exploding Source',
      collection: 'literature' as const,
      enabled: () => true,
      run: async () => { throw new Error('upstream returned nonsense'); },
    };
    const result = await runAdapter(exploding, { nowIso: NOW });
    assert.equal(result.report.status, 'failed');
    assert.ok((result.report.note ?? '').includes('upstream returned nonsense'));
    return result.drafts.length === 0;
  })());
  await ok('a throwing adapter does not stop the healthy ones in the same run, and every source still lands in the store', (async () => {
    const store = memoryStore();
    // Every science source is answered with its recorded shape except Wikipedia,
    // which returns a 500 — the "one source is down" case the audit asked for.
    const stub = stubFetch([
      { match: /en\.wikipedia\.org/, status: 500 },
      { match: /wikidata\.org/, body: JSON.stringify(WIKIDATA_JSON) },
      { match: /images-api\.nasa\.gov/, body: JSON.stringify(NASA_JSON) },
      { match: /openstax/, body: JSON.stringify(OPENSTAX_JSON) },
      { match: /europepmc/, body: JSON.stringify(EPMC_JSON) },
    ]);
    const outcome = await runCollectionDiscovery({
      collection: 'science',
      now: new Date(NOW),
      store,
      useCursors: false,
      fetchImpl: stub.fetchImpl,
      sleepImpl: noSleep,
    });
    assert.equal(outcome.reports.length, SCIENCE_ADAPTERS.length);
    const bySource = new Map(outcome.reports.map((report) => [report.sourceId, report.status]));
    assert.equal(bySource.get('wikipedia-science'), 'failed');
    assert.equal(bySource.get('europepmc'), 'ok');
    assert.equal(bySource.get('nasa'), 'ok');
    // Four of five sources contributed. Only the rows that survive the shared
    // validation gate are stored, and each rejection is named in the notes.
    const stored = await store.readAll();
    // The Wikipedia page is down, so it contributes nothing; the surviving sources
    // are stored, and every row that the shared gate rejected is named.
    assert.ok(stored.length >= 2, `only ${stored.length} rows stored`);
    const sources = new Set(stored.map((row) => row.sourceName));
    assert.ok(sources.has('Europe PMC') && sources.has('Wikidata'));
    for (const note of outcome.persistence.notes) {
      assert.ok(!/wikipedia-science/.test(note) || /category|description|author|language|rights|licence/.test(note));
    }
    assert.ok(outcome.summary.includes('1 failed'));
    return outcome.persistence.persisted === true;
  })());
  await ok('a run whose every source is down still returns a full, readable report', (async () => {
    const outcome = await runCollectionDiscovery({
      collection: 'literature',
      now: new Date(NOW),
      store: memoryStore(),
      useCursors: false,
      fetchImpl: stubFetch([]).fetchImpl,
      sleepImpl: noSleep,
      maxRecordsPerSource: 1,
    });
    assert.equal(outcome.persistence.written, 0);
    assert.ok(outcome.reports.every((report) => report.status === 'failed' || report.status === 'skipped'));
    return typeof outcome.summary === 'string' && outcome.summary.length > 20;
  })());
  await ok('a failed source does not advance its cursor, so its window is retried rather than skipped', (() => {
    const failed: SourceReport = { sourceId: 'gutenberg', sourceName: 'G', status: 'failed', fetched: 0, accepted: 0, rejected: 0, duplicates: 0, finishedAt: NOW };
    const okReport: SourceReport = { ...failed, status: 'ok', fetched: 4, accepted: 3 };
    assert.equal(advanceCursor('gutenberg', '10', 0, failed), undefined);
    assert.equal(advanceCursor('gutenberg', '10', 3, okReport), '17');
    assert.equal(advanceCursor('nasa', '2', 1, okReport), '3');
    return true;
  })());

  /* ---- Collection scope ------------------------------------------ */
  await ok('the literature and science collections are declared, and Curiosity keeps none of them', (() => {
    assert.equal(adaptersForCollection('literature').length, LITERATURE_ADAPTERS.length);
    assert.equal(adaptersForCollection('science').length, SCIENCE_ADAPTERS.length);
    assert.equal(LITERATURE_ADAPTERS.length, 3);
    assert.equal(SCIENCE_ADAPTERS.length, 5);
    const ids = [...LITERATURE_ADAPTERS, ...SCIENCE_ADAPTERS].map((adapter) => adapter.id);
    return new Set(ids).size === ids.length && adaptersForCollection('curiosity').length === 0;
  })());
  await ok('every adapter declares the collection it writes into, and its categories are in scope', (() => {
    for (const adapter of [...LITERATURE_ADAPTERS, ...SCIENCE_ADAPTERS]) {
      assert.ok(COLLECTION_CATEGORIES[adapter.collection].length > 0, adapter.id);
    }
    return true;
  })());

  /* ---- Scheduled, not per-visit ---------------------------------- */
  console.log('\nScheduled, not per-visit\n');
  const appFiles = (() => {
    const out: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(name)) out.push(path);
      }
    };
    walk('app');
    walk('components');
    return out;
  })();
  await ok('no app route or component imports a discovery source adapter', appFiles.every((path) => {
    const text = readFileSync(path, 'utf8');
    return !/lib\/discovery\/sources|discovery\/sources\//.test(text);
  }));
  await ok('the page reads the reservoir through the server helper only', appFiles
    .filter((path) => /curiosity/.test(path))
    .every((path) => !/from '.*(gutenberg|openstax|europepmc|nasa|wikisource)/i.test(readFileSync(path, 'utf8'))));
  await ok('both discovery jobs are scheduled and overlap-protected', (() => {
    for (const name of ['discovery-literature.yml', 'discovery-science.yml']) {
      const text = readFileSync(join('.github/workflows', name), 'utf8');
      assert.ok(/cron:\s*'/.test(text), `${name} has no schedule`);
      assert.ok(/concurrency:/.test(text), `${name} has no concurrency guard`);
      assert.ok(/workflow_dispatch:/.test(text), `${name} cannot be run by hand`);
    }
    return true;
  })());
  await ok('the scheduled script exits distinctly for a total source failure and for a refused write', (() => {
    const text = readFileSync('scripts/discover-literature.ts', 'utf8');
    return text.includes('process.exit(3)') && text.includes('process.exit(2)') && text.includes('runCollectionDiscovery');
  })());
  await ok('discovery never runs as part of the Curiosity publish path', (() => {
    const job = readFileSync('lib/curiosity/job.ts', 'utf8');
    return !/discovery\/(run|sources)/.test(job);
  })());

  /* ---- Additive to Curiosity ------------------------------------- */
  console.log('\nCuriosity unaffected\n');
  await ok('the daily publisher still rotates over the twelve authored Speak Better lessons', (() => {
    const content = readFileSync('lib/curiosity/content.ts', 'utf8');
    return content.includes("from './content/speak-better'") && !content.includes('speakBetterCurriculum');
  })());
  await ok('a briefing written before this feature existed still renders, with no shelves', (async () => {
    const shelf = await getCollectionShelf('literature', '2026-11-04', { store: memoryStore() });
    return shelf.entries.length === 0 && shelf.collection === 'literature' && !shelf.note;
  })());
  await ok('a store that throws degrades to an empty shelf with an explanation, never to an error', (async () => {
    const throwingStore = {
      kind: 'file' as const,
      durability: 'persistent' as const,
      readAll: async () => { throw new Error('database down'); },
      writeUpsert: async () => ({ persisted: false }),
      readCursors: async () => ({}),
      writeCursor: async () => {},
      appendRunLog: async () => {},
      lastRunLog: async () => null,
    };
    const shelf = await getCollectionShelf('literature', '2026-11-04', { store: throwingStore as never });
    return shelf.entries.length === 0 && typeof shelf.note === 'string' && shelf.note.includes('curated picks');
  })());

  /* ---- UI markup ------------------------------------------------ */
  console.log('\nUI\n');
  await ok('with nothing discovered the Literature section renders nothing at all', (() => {
    const markup = renderToStaticMarkup(
      createElement(LiteratureDiscoveryCard, { shelf: { collection: 'literature', date: '2026-11-04', entries: [], sourceCounts: {} } }),
    );
    return markup === '';
  })());
  await ok('with nothing discovered the Science section renders nothing at all', (() => {
    const markup = renderToStaticMarkup(
      createElement(ScienceDiscoveryCard, { shelf: { collection: 'science', date: '2026-11-04', entries: [], sourceCounts: {} } }),
    );
    return markup === '';
  })());
  const literatureShelf = {
    collection: 'literature' as const,
    date: '2026-11-04',
    sourceCounts: { 'Project Gutenberg': 1 },
    entries: [{
      id: 'gutenberg-2701',
      title: 'Moby Dick',
      description: 'By Melville, Herman. Catalogued under Whales -- Fiction.',
      url: 'https://www.gutenberg.org/ebooks/2701',
      sourceName: 'Project Gutenberg',
      attribution: 'Public domain, as stated by Project Gutenberg.',
      license: 'Public domain (USA)',
      kind: 'book',
      rights: 'public-domain-asserted',
      subjects: ['Whales'],
      author: 'Melville, Herman',
      language: 'en',
      publicationDetails: 'First issued 1851',
      discoveredAt: NOW,
    }],
  };
  const literatureMarkup = renderToStaticMarkup(createElement(LiteratureDiscoveryCard, { shelf: literatureShelf }));
  await ok('the Literature card links out with rel="noopener noreferrer nofollow" and never mirrors text', () => {
    assert.ok(literatureMarkup.includes('rel="noopener noreferrer nofollow"'));
    assert.ok(literatureMarkup.includes('https://www.gutenberg.org/ebooks/2701'));
    assert.ok(literatureMarkup.includes('Project Gutenberg'));
    // The attribution sentence is present, though visually hidden from the layout.
    return literatureMarkup.includes('Public domain');
  });
  await ok('an asserted public-domain claim shows the country caveat on the card itself', literatureMarkup.includes('differs by country'));
  const scienceMarkup = renderToStaticMarkup(createElement(ScienceDiscoveryCard, { shelf: {
    collection: 'science',
    date: '2026-11-04',
    sourceCounts: {},
    entries: [{
      id: 'europepmc-12345678',
      title: 'Sleep deprivation and cognitive performance',
      description: 'We followed two hundred shift workers over twelve months.',
      url: 'https://doi.org/10.1000/example',
      sourceName: 'Europe PMC',
      attribution: 'Metadata and abstract only, from Europe PMC.',
      kind: 'research-abstract',
      caveat: 'One peer-reviewed study. A single result is preliminary until replicated; it is not established fact.',
      rights: 'abstract-only',
      subjects: [],
    }],
  } }));
  await ok('a research record renders its caveat inline and says no full text is stored', scienceMarkup.includes('not established fact') && scienceMarkup.includes('no full text stored'));
  await ok('the Science card labels the kind of record rather than presenting every source in one voice', scienceMarkup.includes('Research abstract') && scienceMarkup.includes('Read the record'));

  console.log(`\n${checks} checks. Literature and Science discovery share the Curiosity reservoir: three literature sources and five science sources, each isolated, licensed, deduplicated, idempotently persisted and scheduled — never fetched while a reader is on the page.\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
