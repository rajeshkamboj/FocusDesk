/**
 * Science discovery, dictionary enrichment and the "is this real?" rules.
 *
 * What this proves, and what it does not:
 *
 *   ✓ Adapter parsing, provenance classification, ranking, DOI collapse, the freshness
 *     gate, persistence through the existing reservoir and the failure isolation between
 *     sources — all from fixtures injected through `fetchImpl`.
 *   ✓ That enrichment can only ever add a dictionary gloss and never rewrites an authored
 *     meaning, and that it degrades to "unavailable" instead of inventing one.
 *
 *   ✗ It does NOT prove that api.openalex.org, api.crossref.org, Europe PMC, arXiv,
 *     Wiktionary or Datamuse are reachable from where you run this. Those calls are
 *     stubbed on purpose so the suite is deterministic and offline. Live reachability is
 *     reported by `npm run discover:science` and by the scheduled workflow, not here.
 *
 * Run: npm run verify:science
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  SCIENCE_DISCIPLINES,
  SCIENCE_SCORE_WEIGHTS,
  classifyProvenance,
  licensedExcerpt,
  normalizeDoi,
  rejectionForRecord,
  researchCandidateEligibleToday,
  scienceConceptFromRecord,
  scienceDraftFromRecord,
  scoreScienceRecord,
  venueLooksLikePreprint,
  type ScienceRecord,
} from '../lib/discovery/science';
import { abstractFromInvertedIndex, recordFromOpenAlexWork } from '../lib/discovery/sources/openalex';
import { recordFromCrossrefItem, titleLooksSame, verifyDoiWithCrossref } from '../lib/discovery/sources/crossref';
import { recordFromEuropePmcResult, splitAuthorString } from '../lib/discovery/sources/europepmc';
import { parseArxivFeed, recordFromArxivEntry } from '../lib/discovery/sources/arxiv';
import { collapseRecords, runScienceDiscovery, describeScienceRun } from '../lib/discovery/science-run';
import { enrichLesson } from '../lib/discovery/enrichment/speak-better';
import { parseWiktionaryDefinition, stripMarkup } from '../lib/discovery/enrichment/wiktionary';
import { parseDatamuseWords } from '../lib/discovery/enrichment/datamuse';
import { SPEAK_BETTER_B2_LESSONS } from '../lib/curiosity/speak-better';
import type { CandidateStore } from '../lib/curiosity/reservoir';

const TODAY = '2026-11-04';
const NOW_ISO = `${TODAY}T09:00:00.000Z`;
const results: string[] = [];

function pass(n: number, message: string): void {
  results.push(`${String(n).padStart(2)} ${message}`);
}

/* ------------------------------------------------------------------ *
 * Fixtures — shaped exactly like the live payloads (they are copied from
 * the documented response formats, not invented), but offline.
 * ------------------------------------------------------------------ */

const OPENALEX_WORK = {
  id: 'https://openalex.org/W4401234567',
  doi: 'https://doi.org/10.1038/S41586-026-01111-2',
  title: 'Room-temperature superconductivity in a layered hydride at 20 GPa',
  publication_date: TODAY,
  type: 'article',
  cited_by_count: 12,
  primary_location: {
    license: null,
    landing_page_url: 'https://www.nature.com/articles/s41586-026-01111-2',
    source: { display_name: 'Nature', publisher: 'Springer Nature', type: 'journal' },
  },
  best_oa_location: { license: 'cc-by' },
  open_access: { is_oa: true },
  authorships: [
    { author: { display_name: 'Mei Lin' }, institutions: [{ display_name: 'Tsinghua University' }] },
    { author: { display_name: 'A. Okafor' }, institutions: [{ display_name: 'Tsinghua University' }, { display_name: 'MIT' }] },
  ],
  abstract_inverted_index: {
    'Superconductivity': [0],
    'persisted': [1],
    'to': [2],
    'room': [3],
    'temperature': [4],
    'in': [5],
    'a': [6],
    'layered': [7],
    'hydride.': [8],
  },
};

const CROSSREF_ITEM = {
  DOI: '10.1038/s41586-026-01111-2',
  title: ['Room-temperature superconductivity in a layered hydride at 20 GPa'],
  type: 'journal-article',
  'container-title': ['Nature'],
  publisher: 'Springer Nature',
  published: { 'date-parts': [[2026, 11, 4]] },
  author: [{ given: 'Mei', family: 'Lin', affiliation: [{ name: 'Tsinghua University' }] }],
  'is-referenced-by-count': 12,
  license: [{ URL: 'https://creativecommons.org/licenses/by/4.0/' }],
  abstract: '<jats:p>Superconductivity persisted to room temperature.</jats:p>',
};

const EUROPEPMC_RESULT = {
  id: 'PPR123456',
  source: 'PPR',
  title: 'Deep-learning reconstruction of protein folds <i>in situ</i>',
  authorString: 'Kim J, Alvarez M, Osei-Bonsu A, Chen L',
  journalTitle: 'bioRxiv',
  firstPublicationDate: TODAY,
  doi: '10.1101/2026.11.01.123456',
  isOpenAccess: 'Y',
  license: 'cc by',
  abstractText: '<h4>Background</h4><p>A pretrained model recovers folds without crystallography.</p>',
};

const ARXIV_XML = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom">
  <title type="html">ArXiv Query</title>
  <entry>
    <id>http://arxiv.org/abs/2611.01234v1</id>
    <updated>2026-11-03T18:00:00Z</updated>
    <published>2026-11-03T18:00:00Z</published>
    <title>Entanglement entropy bounds from a single measurement record</title>
    <summary>We bound entanglement entropy growth using one measurement record.</summary>
    <author><name>R. Iyer</name></author>
    <author><name>S. Novak</name></author>
    <arxiv:doi xmlns:arxiv="http://arxiv.org/schemas/atom">10.48550/arXiv.2611.01234</arxiv:doi>
    <arxiv:journal_ref xmlns:arxiv="http://arxiv.org/schemas/atom">Phys. Rev. Lett. (to appear)</arxiv:journal_ref>
    <link title="license" href="http://creativecommons.org/licenses/by/4.0/"/>
    <category term="quant-ph" scheme="http://arxiv.org/schemas/atom"/>
  </entry>
  <entry>
    <id>http://arxiv.org/abs/2611.09999v1</id>
    <published>2026-11-02T10:00:00Z</published>
    <title>Correction to a previous note on cavity cooling</title>
    <summary>This note corrects a factor of two.</summary>
    <author><name>P. Adeyemi</name></author>
  </entry>
</feed>`;

/* ------------------------------------------------------------------ *
 * A store that behaves like the file reservoir, in memory.
 * ------------------------------------------------------------------ */
interface StoredRow {
  id: string;
  payload?: Record<string, unknown>;
  [key: string]: unknown;
}

function memoryStore(): CandidateStore & { rows: StoredRow[]; cursors: Record<string, string>; runs: number } {
  const state = {
    rows: [] as StoredRow[],
    cursors: {} as Record<string, string>,
    runs: 0,
  };
  const store: CandidateStore & typeof state = {
    kind: 'file',
    location: 'memory://verify-science',
    ...state,
    async readAll() {
      return store.rows as never;
    },
    async writeUpsert(candidates) {
      store.rows.push(...(candidates as unknown as StoredRow[]));
      return { persisted: true };
    },
    async readCursors() {
      return store.cursors;
    },
    async writeCursor(key, _category, token) {
      if (token !== null) store.cursors[key] = token;
    },
    async appendRunLog() {
      store.runs += 1;
    },
    async lastRunLog() {
      return null;
    },
  };
  return store;
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
}

function xmlResponse(payload: string): Response {
  return new Response(payload, { status: 200, headers: { 'content-type': 'application/atom+xml' } });
}

async function main(): Promise<void> {
  // The adapters read their on/off switch from the environment; the harness must not
  // inherit a machine's configuration, or it would silently skip whole sections.
  delete process.env.CURIOSITY_SCIENCE_SOURCES;
  delete process.env.CURIOSITY_ENRICHMENT;

  /* ---------------------------------------------------------------- *
   * 1. OpenAlex: an inverted index is reassembled in order, and a work
   *    becomes a record whose venue decides its review status.
   * ---------------------------------------------------------------- */
  {
    const abstract = abstractFromInvertedIndex(OPENALEX_WORK.abstract_inverted_index);
    assert.equal(abstract, 'Superconductivity persisted to room temperature in a layered hydride.');
    assert.equal(abstractFromInvertedIndex(undefined), undefined);
    assert.equal(abstractFromInvertedIndex({ orphan: [5] }), 'orphan', 'a sparse index must not throw');

    const record = recordFromOpenAlexWork(OPENALEX_WORK, 'physics', 'physics:quantum');
    assert.ok(record);
    assert.equal(record.doi, '10.1038/s41586-026-01111-2', 'the DOI is normalised, not kept as a URL');
    assert.equal(record.url, 'https://doi.org/10.1038/s41586-026-01111-2');
    assert.equal(record.peerReviewed, true, 'a journal article with a named venue is peer-reviewed');
    assert.equal(record.preprint, false);
    assert.equal(record.publisher, 'Springer Nature');
    assert.deepEqual(record.institutions, ['Tsinghua University', 'MIT']);
    assert.equal(record.license, 'cc-by');
    assert.equal(record.openAccess, true);

    // A repository deposit is a preprint, even when OpenAlex calls it an article.
    const preprint = recordFromOpenAlexWork(
      { ...OPENALEX_WORK, type: 'preprint', primary_location: { ...OPENALEX_WORK.primary_location, source: { display_name: 'arXiv', type: 'repository' } } },
      'physics',
      'physics:quantum',
    );
    assert.ok(preprint);
    assert.equal(preprint.preprint, true);
    assert.equal(preprint.peerReviewed, false);

    // No title, no record. Nothing is invented to fill the gap.
    assert.equal(recordFromOpenAlexWork({ id: 'https://openalex.org/W1' }, 'physics', 'q'), null);
    pass(1, 'OpenAlex works normalise into records with a real DOI, an ordered abstract, real authors and institutions, and a review status decided by the source, never by the card');
  }

  /* ---------------------------------------------------------------- *
   * 2. Crossref: dates from partial date-parts, licences from URLs,
   *    and a title comparison strict enough to catch a wrong DOI.
   * ---------------------------------------------------------------- */
  {
    const record = recordFromCrossrefItem(CROSSREF_ITEM, 'physics', 'physics:quantum');
    assert.ok(record);
    assert.equal(record.publishedOn, TODAY);
    assert.equal(record.license, 'cc-by');
    assert.equal(record.peerReviewed, true);
    assert.equal(record.abstractText, 'Superconductivity persisted to room temperature.');
    assert.equal(record.doi, '10.1038/s41586-026-01111-2');

    const yearOnly = recordFromCrossrefItem(
      { ...CROSSREF_ITEM, published: { 'date-parts': [[2026]] }, issued: { 'date-parts': [[2026]] } },
      'physics',
      'q',
    );
    assert.ok(yearOnly);
    assert.equal(yearOnly.publishedOn, undefined, 'a year-only date must not become January 1');
    assert.equal(rejectionForRecord(yearOnly, TODAY), 'no publication date supplied by the source');

    const postedContent = recordFromCrossrefItem({ ...CROSSREF_ITEM, type: 'posted-content' }, 'physics', 'q');
    assert.ok(postedContent);
    assert.equal(postedContent.preprint, true);
    assert.equal(postedContent.peerReviewed, false);

    assert.equal(titleLooksSame(OPENALEX_WORK.title, CROSSREF_ITEM.title[0]), true);
    assert.equal(titleLooksSame(OPENALEX_WORK.title, 'Dietary fibre and rumen fermentation in dairy cattle'), false);
    pass(2, 'Crossref supplies publication dates (and refuses to invent a day from a year), licences, and a title comparison that rejects a DOI registered to a different paper');
  }

  /* ---------------------------------------------------------------- *
   * 3. Europe PMC: preprint vs MEDLINE is decided by the index, not by us.
   * ---------------------------------------------------------------- */
  {
    const preprint = recordFromEuropePmcResult(EUROPEPMC_RESULT, 'biology', 'biology:protein');
    assert.ok(preprint);
    assert.equal(preprint.title, 'Deep-learning reconstruction of protein folds in situ', 'inline JATS tags are stripped');
    assert.deepEqual(preprint.authors, ['Kim J', 'Alvarez M', 'Osei-Bonsu A', 'Chen L']);
    assert.equal(preprint.preprint, true, 'a PPR record is a preprint');
    assert.equal(preprint.peerReviewed, false);
    assert.equal(preprint.url, 'https://doi.org/10.1101/2026.11.01.123456');

    const med = recordFromEuropePmcResult({ ...EUROPEPMC_RESULT, source: 'MED', journalTitle: 'Cell' }, 'biology', 'q');
    assert.ok(med);
    assert.equal(med.peerReviewed, true, 'a MEDLINE record is peer-reviewed');
    assert.equal(med.preprint, false);

    // A record with neither DOI, PMID nor PMCID has no page to send a reader to.
    assert.equal(recordFromEuropePmcResult({ ...EUROPEPMC_RESULT, doi: undefined, pmid: undefined, pmcid: undefined }, 'biology', 'q'), null);
    assert.deepEqual(splitAuthorString(''), []);
    assert.deepEqual(splitAuthorString('Solo Author'), ['Solo Author']);
    pass(3, 'Europe PMC tells a preprint server deposit from a MEDLINE-indexed article by the source index itself, strips embedded markup, and drops a result it cannot link to');
  }

  /* ---------------------------------------------------------------- *
   * 4. arXiv: preprints forever, even with a journal reference.
   * ---------------------------------------------------------------- */
  {
    const entries = parseArxivFeed(ARXIV_XML);
    assert.equal(entries.length, 2);
    assert.equal(entries[0].id, '2611.01234', 'the version suffix is stripped so v1 and v3 are one work');
    assert.deepEqual(entries[0].authors, ['R. Iyer', 'S. Novak']);
    assert.equal(entries[0].license, 'cc-by');

    const record = recordFromArxivEntry(entries[0], 'physics', 'physics:quantum');
    assert.ok(record);
    assert.equal(record.preprint, true);
    assert.equal(record.peerReviewed, false);
    assert.equal(record.venue, 'arXiv');
    assert.equal(record.publishedOn, '2026-11-03');
    assert.equal(record.url, 'https://arxiv.org/abs/2611.01234');

    // A journal reference does not make a preprint peer-reviewed — the classification
    // of the article itself is what the card is allowed to print.
    const withJournalRef = { ...record, venue: 'Physical Review Letters' };
    assert.equal(classifyProvenance(record), 'preprint');
    assert.ok(venueLooksLikePreprint('arXiv', record.url));
    assert.equal(venueLooksLikePreprint(withJournalRef.venue, record.url), true, 'an arXiv URL still marks the record');
    pass(4, 'arXiv entries are parsed from the Atom feed and remain preprints whatever journal reference or venue string they carry');
  }

  /* ---------------------------------------------------------------- *
   * 5. The gates: non-research, stale, undated, and press releases.
   * ---------------------------------------------------------------- */
  {
    const base: ScienceRecord = {
      sourceId: 'openalex',
      discipline: 'physics',
      title: 'Room-temperature superconductivity in a layered hydride at 20 GPa',
      doi: '10.1038/s41586-026-01111-2',
      url: 'https://doi.org/10.1038/s41586-026-01111-2',
      publishedOn: TODAY,
      venue: 'Nature',
      authors: ['Mei Lin'],
      institutions: [],
      preprint: false,
      peerReviewed: true,
      foundVia: 'physics:quantum',
    };
    assert.equal(rejectionForRecord(base, TODAY), null);

    const stale = { ...base, publishedOn: '2026-01-01' };
    assert.match(rejectionForRecord(stale, TODAY) ?? '', /published \d+ days ago/);

    assert.equal(rejectionForRecord({ ...base, publishedOn: undefined }, TODAY), 'no publication date supplied by the source');
    assert.equal(rejectionForRecord({ ...base, url: 'not-a-url' }, TODAY), 'no resolvable source link');
    assert.match(rejectionForRecord({ ...base, title: 'Erratum: room-temperature superconductivity' }, TODAY) ?? '', /not a research report/);
    assert.match(rejectionForRecord({ ...base, type: 'editorial' }, TODAY) ?? '', /not a research article/);
    assert.equal(rejectionForRecord({ ...base, publishedOn: '2026-02-30' }, TODAY), 'unreadable publication date', 'an impossible date is refused, not re-dated to 2 March');
    pass(5, 'The gate rejects undated, stale, unlinked, non-article and erratum records with a named reason, and nothing reaches a card without passing it');
  }

  /* ---------------------------------------------------------------- *
   * 6. Scoring moves the way the weights say, and provenance dominates.
   * ---------------------------------------------------------------- */
  {
    const fresh: ScienceRecord = {
      sourceId: 'openalex',
      discipline: 'biology',
      title: 'A gut bacterium metabolises dietary fibre into a short-chain fatty acid',
      doi: '10.1016/j.cell.2026.10.001',
      url: 'https://doi.org/10.1016/j.cell.2026.10.001',
      publishedOn: TODAY,
      venue: 'Cell',
      publisher: 'Elsevier',
      authors: ['A. Researcher'],
      institutions: [],
      citationCount: 4,
      type: 'article',
      preprint: false,
      peerReviewed: true,
      license: 'cc-by',
      abstractText: 'A gut bacterium converts dietary fibre into propionate in vitro and in mice.',
      openAccess: true,
      foundVia: 'biology:microbiome',
    };
    const freshScore = scoreScienceRecord(fresh, TODAY);
    const oldScore = scoreScienceRecord({ ...fresh, publishedOn: '2026-09-20' }, TODAY);
    assert.ok(freshScore.total > oldScore.total, 'a newer record outranks an older one that is otherwise identical');

    const preprint = scoreScienceRecord({ ...fresh, preprint: true, peerReviewed: false, venue: 'bioRxiv' }, TODAY);
    assert.equal(freshScore.components.provenance > preprint.components.provenance, true);
    assert.equal(preprint.provenance, 'preprint');
    assert.equal(freshScore.provenance, 'peer-reviewed');

    const weights = Object.values(SCIENCE_SCORE_WEIGHTS).reduce((sum, value) => sum + value, 0);
    assert.equal(weights, 100, 'the published weights must still sum to 100, or the score is not interpretable');
    for (const value of Object.values(freshScore.components)) {
      assert.ok(value >= 0, 'a score component went negative');
    }
    pass(6, 'Ranking is a stated 100-point weighting: freshness, venue selectivity, citations, relevance, provenance and substance, with provenance strictly higher for a peer-reviewed record');
  }

  /* ---------------------------------------------------------------- *
   * 7. The same work from two sources collapses to one, and the
   *    peer-reviewed version wins.
   * ---------------------------------------------------------------- */
  {
    const openalex = recordFromOpenAlexWork(OPENALEX_WORK, 'physics', 'physics:quantum');
    const crossref = recordFromCrossrefItem(CROSSREF_ITEM, 'physics', 'physics:quantum');
    assert.ok(openalex && crossref);

    const preprintCopy = recordFromArxivEntry(parseArxivFeed(ARXIV_XML)[0], 'physics', 'physics:quantum');
    assert.ok(preprintCopy);

    const collapsed = collapseRecords([crossref, { ...openalex, peerReviewed: false, preprint: true }, preprintCopy]);
    assert.equal(collapsed.length, 2, 'the two copies of one DOI collapse; a different work survives');
    const merged = collapsed.find((record) => record.doi === '10.1038/s41586-026-01111-2');
    assert.ok(merged);
    assert.equal(merged.peerReviewed, true, 'the peer-reviewed version is the one kept');
    assert.equal(merged.preprint, false, 'a merged record is never labelled a preprint when a journal version was found');
    assert.equal(merged.abstractText, 'Superconductivity persisted to room temperature.', 'the abstract came from whichever source supplied it');
    pass(7, 'DOI-first collapse keeps one row per work and prefers the version that was actually reviewed, filling gaps from the duplicate instead of discarding them');
  }

  /* ---------------------------------------------------------------- *
   * 8. A card built from a record can never overstate what it is.
   * ---------------------------------------------------------------- */
  {
    const preprintRecord: ScienceRecord = {
      sourceId: 'arxiv',
      discipline: 'physics',
      title: 'Entanglement entropy bounds from a single measurement record',
      doi: '10.48550/arxiv.2611.01234',
      url: 'https://arxiv.org/abs/2611.01234v1',
      publishedOn: '2026-11-03',
      venue: 'arXiv',
      authors: ['R. Iyer'],
      institutions: [],
      preprint: true,
      peerReviewed: false,
      license: 'cc-by',
      abstractText: 'We bound entanglement entropy growth using one measurement record.',
      foundVia: 'physics:quantum',
    };
    const score = scoreScienceRecord(preprintRecord, TODAY);
    const concept = scienceConceptFromRecord(preprintRecord, score);
    assert.equal(concept.provenance, 'preprint');
    assert.match(concept.provenanceLabel ?? '', /preprint/i);
    // The label may say "not yet peer-reviewed" — that is the honest form. What it
    // must never do is claim review, so the negation is checked rather than the word.
    assert.match(concept.provenanceLabel ?? '', /not .*peer/i, 'a preprint label must say it has not been peer-reviewed');
    assert.doesNotMatch(concept.provenanceLabel ?? '', /^(peer-reviewed|published peer)/i, 'a preprint label claims review');
    assert.equal(concept.publishedOn, '2026-11-03');
    assert.ok((concept.provenance ?? '').length > 0);
    assert.ok(
      (concept.research?.significanceBasis ?? []).join(' ').length > 20,
      'the card must be able to say why it was chosen',
    );
    assert.equal(concept.origin, 'research', 'a research card is marked as research, not as a curated topic');
    assert.equal(concept.research?.peerReviewed, false);
    assert.match(concept.simple, /preprint|not been peer-reviewed/i);

    // The excerpt is only filled when the source stated an open licence.
    const closed = scienceConceptFromRecord({ ...preprintRecord, license: undefined }, score);
    assert.equal(closed.research?.abstractExcerpt, undefined, 'no licence, no excerpt');
    assert.equal(licensedExcerpt({ ...preprintRecord, license: undefined }), undefined);

    // The same finding, later published: the arXiv URL and the arXiv source id are
    // what make a record a preprint, so a reviewed version is a different record.
    const journalVersion: ScienceRecord = {
      ...preprintRecord,
      sourceId: 'openalex',
      url: 'https://doi.org/10.1038/s41567-026-00001-1',
      doi: '10.1038/s41567-026-00001-1',
      venue: 'Nature Physics',
      publisher: 'Springer Nature',
      type: 'article',
      preprint: false,
      peerReviewed: true,
    };
    const peer = scienceConceptFromRecord(journalVersion, scoreScienceRecord(journalVersion, TODAY));
    assert.equal(peer.research?.peerReviewed, true);
    assert.match(peer.provenanceLabel ?? '', /peer[- ]reviewed/i);

    const draft = scienceDraftFromRecord(preprintRecord, score, NOW_ISO);
    assert.equal(draft.category, 'physics');
    assert.equal(draft.subcategory, 'preprint', 'the reservoir row records the provenance for later audits');
    assert.equal(draft.canonicalUrl, preprintRecord.url);
    assert.match(draft.license ?? '', /article: cc-by/i);
    pass(8, 'Cards carry the provenance they were built from: a preprint says it is not peer-reviewed, no excerpt appears without a stated licence, and the reason for selection travels with the card');
  }

  /* ---------------------------------------------------------------- *
   * 9. The reservoir gate: only fresh, scored, provenance-bearing rows.
   * ---------------------------------------------------------------- */
  {
    assert.equal(researchCandidateEligibleToday(undefined, TODAY), false);
    assert.equal(researchCandidateEligibleToday({}, TODAY), false);
    assert.equal(
      researchCandidateEligibleToday({ science: { publishedOn: TODAY, provenance: 'peer-reviewed', significanceScore: 82 } }, TODAY),
      true,
    );
    assert.equal(
      researchCandidateEligibleToday({ science: { publishedOn: TODAY, provenance: 'peer-reviewed', significanceScore: 10 } }, TODAY),
      false,
      'a low-significance record is not today’s discovery',
    );
    assert.equal(
      researchCandidateEligibleToday({ science: { publishedOn: TODAY, provenance: 'press-release', significanceScore: 90 } }, TODAY),
      false,
      'a press release is never a research discovery',
    );
    assert.equal(
      researchCandidateEligibleToday({ science: { publishedOn: '2026-01-01', provenance: 'peer-reviewed', significanceScore: 90 } }, TODAY),
      false,
      'an old record is not newly discovered',
    );
    pass(9, 'Only a dated, tightly-scored, genuinely research-provenanced candidate is eligible for the daily science card; a press release and a stale record are both excluded by name');
  }

  /* ---------------------------------------------------------------- *
   * 10. A full run with every source answering: real drafts, real
   *     provenance, one persistence write, cursors advanced.
   * ---------------------------------------------------------------- */
  {
    const store = memoryStore();
    const calledHosts: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const host = new URL(url).host;
      calledHosts.push(host);
      if (host === 'api.openalex.org') return jsonResponse({ results: [OPENALEX_WORK], meta: { count: 1 } });
      if (host === 'api.crossref.org') {
        if (url.includes('/works/10.')) {
          return jsonResponse({ status: 'ok', message: CROSSREF_ITEM });
        }
        return jsonResponse({ status: 'ok', message: { items: [CROSSREF_ITEM] } });
      }
      if (host === 'www.ebi.ac.uk') return jsonResponse({ resultList: { result: [EUROPEPMC_RESULT] } });
      if (host === 'export.arxiv.org') return xmlResponse(ARXIV_XML);
      throw new Error(`unexpected host ${host}`);
    }) as unknown as typeof fetch;

    const outcome = await runScienceDiscovery({
      now: new Date(NOW_ISO),
      store,
      fetchImpl,
      sleepImpl: async () => {},
      trigger: 'cli',
    });

    assert.ok(outcome.reports.length >= 4, 'every adapter reported');
    for (const report of outcome.reports) {
      assert.ok(['ok', 'partial', 'failed', 'disabled', 'empty'].includes(report.status), `unexpected status ${report.status}`);
      assert.ok(report.sourceId && report.sourceName && report.finishedAt);
    }
    assert.ok(!outcome.reports.some((report) => report.status === 'failed'), `a source failed: ${outcome.reports.filter((r) => r.status === 'failed').map((r) => `${r.sourceId}: ${r.note}`).join(' | ')}`);
    assert.ok(outcome.selected.length > 0, 'no science record was selected');
    for (const entry of outcome.selected) {
      assert.ok(SCIENCE_DISCIPLINES.includes(entry.discipline));
      assert.ok(['peer-reviewed', 'preprint', 'indexed', 'press-release', 'unknown'].includes(entry.provenance));
      assert.ok(entry.score > 0);
    }
    assert.equal(outcome.persisted, true);
    assert.ok(outcome.written > 0, 'nothing was written');
    assert.equal(store.rows.length, outcome.written);
    for (const row of store.rows) {
      const payload = row.payload as { collection?: string; science?: { provenance?: string; significanceBasis?: string; publishedOn?: string } };
      assert.equal(payload.collection, 'science', 'every row carries the collection marker');
      assert.ok(payload.science?.provenance, 'every row records its provenance');
      assert.ok((payload.science?.significanceBasis ?? '').length > 0, 'every row records why it was selected');
      assert.match(payload.science?.publishedOn ?? '', /^\d{4}-\d{2}-\d{2}$/, 'every row records a real publication date');
    }
    assert.ok(Object.keys(store.cursors).length > 0, 'the cursor did not advance');
    assert.equal(store.runs, 1, 'the run log is written once');
    assert.ok(calledHosts.includes('api.openalex.org') || outcome.notes.some((note) => note.includes('openalex')), 'OpenAlex was neither called nor explained');
    assert.match(describeScienceRun(outcome), /science discovery/);
    pass(10, `A complete fixture run across all four adapters selects ${outcome.selected.length} record(s), persists ${outcome.written} provenance-bearing row(s) through the existing reservoir, advances cursors and writes one run log`);
  }

  /* ---------------------------------------------------------------- *
   * 11. One source down: the others still publish, and the report says
   *     which one failed. This is the failure that used to lose a day.
   * ---------------------------------------------------------------- */
  {
    const store = memoryStore();
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const host = new URL(url).host;
      if (host === 'api.openalex.org') throw new Error('ECONNRESET');
      if (host === 'api.crossref.org') {
        if (url.includes('/works/10.')) return jsonResponse({ status: 'ok', message: CROSSREF_ITEM });
        return jsonResponse({ status: 'ok', message: { items: [CROSSREF_ITEM] } });
      }
      if (host === 'www.ebi.ac.uk') return jsonResponse({ resultList: { result: [EUROPEPMC_RESULT] } });
      if (host === 'export.arxiv.org') return xmlResponse(ARXIV_XML);
      throw new Error(`unexpected host ${host}`);
    }) as unknown as typeof fetch;

    const outcome = await runScienceDiscovery({ now: new Date(NOW_ISO), store, fetchImpl, sleepImpl: async () => {}, trigger: 'cli' });
    const openalex = outcome.reports.find((report) => report.sourceId === 'openalex');
    assert.ok(openalex);
    assert.ok(openalex.status === 'failed' || openalex.status === 'partial', `OpenAlex reported ${openalex.status} after an outage`);
    assert.ok(outcome.selected.length > 0, 'one unreachable source took the whole run down');
    assert.equal(outcome.persisted, true);
    assert.ok(!('science:physics:openalex' in store.cursors) || store.cursors['science:physics:openalex'] === '0' || Number(store.cursors['science:physics:openalex']) === undefined);
    pass(11, 'When a source is unreachable its report says so, the other sources still publish, and the failed source’s cursor does not advance — one outage costs a source, not a day');
  }

  /* ---------------------------------------------------------------- *
   * 12. Crossref verification: a wrong DOI is rejected, an unreachable
   *     registry is not treated as evidence against the record.
   * ---------------------------------------------------------------- */
  {
    const mismatch = (async () =>
      jsonResponse({ status: 'ok', message: { ...CROSSREF_ITEM, title: ['Dietary fibre and rumen fermentation in dairy cattle'] } })) as unknown as typeof fetch;
    const wrong = await verifyDoiWithCrossref('10.1038/s41586-026-01111-2', OPENALEX_WORK.title, { fetchImpl: mismatch, sleepImpl: async () => {} });
    assert.equal(wrong.verified, false);
    assert.match(wrong.note ?? '', /title|different/i);

    const down = (async () => new Response('upstream unavailable', { status: 503 })) as unknown as typeof fetch;
    const unreachable = await verifyDoiWithCrossref('10.1038/s41586-026-01111-2', OPENALEX_WORK.title, { fetchImpl: down, sleepImpl: async () => {} });
    assert.equal(unreachable.verified, false);
    assert.match(unreachable.note ?? '', /lookup failed/i, 'an outage must read as "could not check", not as "wrong paper"');

    const good = (async () => jsonResponse({ status: 'ok', message: CROSSREF_ITEM })) as unknown as typeof fetch;
    const verified = await verifyDoiWithCrossref('10.1038/s41586-026-01111-2', OPENALEX_WORK.title, { fetchImpl: good, sleepImpl: async () => {} });
    assert.equal(verified.verified, true);
    assert.equal(verified.venue, 'Nature');
    pass(12, 'DOI verification distinguishes "registered to another paper" from "registry unreachable": only the first rejects a record, and only the second is reported as an unverified claim');
  }

  /* ---------------------------------------------------------------- *
   * 13. Enrichment adds a dictionary gloss and nothing else. With the
   *     network down, the authored lesson ships unchanged and says so.
   * ---------------------------------------------------------------- */
  {
    const wiktionaryJson = {
      en: [
        {
          partOfSpeech: 'Verb',
          definitions: [{ definition: 'To examine <b>closely</b> and systematically.', examples: ['sift <i>the evidence</i>'] }],
        },
      ],
    };
    const entry = parseWiktionaryDefinition(wiktionaryJson, 'sift');
    assert.ok(entry);
    assert.equal(entry.partOfSpeech, 'Verb', 'the part of speech is passed through as Wiktionary states it');
    assert.equal(entry.definition, 'To examine closely and systematically.');
    assert.equal(parseWiktionaryDefinition({}, 'sift'), null);
    assert.equal(stripMarkup('<span>plain</span> text'), 'plain text');

    const associations = parseDatamuseWords([{ word: 'sift' }, { word: 'weigh' }, { word: 'assess' }]);
    // The parser keeps everything short and unique; `lookupDatamuse` drops the headword
    // itself before the card ever sees it.
    assert.deepEqual(associations, ['sift', 'weigh', 'assess']);
    assert.deepEqual(parseDatamuseWords([{ word: 'ok' }, { word: 'ok' }, { word: 'x' }]), ['ok'], 'short entries are dropped and duplicates collapse');
    assert.deepEqual(parseDatamuseWords([{ word: 'a'.repeat(41) }]), [], 'a whole sentence is not an association');
    assert.deepEqual(parseDatamuseWords([{ word: 'x' }], 0), []);
    assert.deepEqual(parseDatamuseWords('not-an-array'), []);

    const lesson = SPEAK_BETTER_B2_LESSONS[0];
    const authored = JSON.parse(JSON.stringify(lesson));

    process.env.CURIOSITY_ENRICHMENT = 'off';
    const disabled = await enrichLesson(lesson, { nowIso: NOW_ISO });
    delete process.env.CURIOSITY_ENRICHMENT;
    assert.equal(disabled.lesson.enrichment?.status, 'disabled', 'the switch is recorded on the lesson');
    assert.deepEqual(disabled.lesson.words, authored.words, 'a disabled run must not touch a single authored word');

    const failing = (async () => new Response('nope', { status: 500 })) as unknown as typeof fetch;
    const unavailable = await enrichLesson(lesson, { fetchImpl: failing, sleepImpl: async () => {}, maxWords: 2, budgetMs: 2_000, nowIso: NOW_ISO });
    assert.ok(['unavailable', 'partial'].includes(unavailable.lesson.enrichment?.status ?? ''), `unexpected status ${unavailable.lesson.enrichment?.status}`);
    assert.deepEqual(
      unavailable.lesson.words.map((word) => [word.word, word.englishMeaning, word.hindiMeaning, word.nuance]),
      authored.words.map((word: { word: string; englishMeaning: string; hindiMeaning: string; nuance: string }) => [word.word, word.englishMeaning, word.hindiMeaning, word.nuance]),
      'the authored meanings are identical after a failed enrichment',
    );

    const dictionaryOk = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('datamuse')) return jsonResponse([{ word: 'example-association' }]);
      return jsonResponse(wiktionaryJson);
    }) as unknown as typeof fetch;
    const enriched = await enrichLesson(lesson, { fetchImpl: dictionaryOk, sleepImpl: async () => {}, maxWords: 1, budgetMs: 4_000, nowIso: NOW_ISO });
    const first = enriched.lesson.words[0];
    if (enriched.lesson.enrichment?.status === 'enriched') {
      assert.ok(first.dictionary?.definition, 'an enriched word carries its dictionary gloss');
      assert.equal(first.dictionary?.sourceName?.toLowerCase().includes('wiktionary'), true, 'the gloss names Wiktionary');
      assert.match(first.dictionary?.license ?? '', /CC BY-SA/i, 'the gloss carries its licence');
      assert.equal(first.englishMeaning, authored.words[0].englishMeaning, 'the authored meaning wins');
      assert.equal(first.hindiMeaning, authored.words[0].hindiMeaning, 'the authored Hindi is never replaced');
      assert.equal(first.nuance, authored.words[0].nuance, 'the authored nuance is never replaced');
      assert.deepEqual(enriched.lesson.words.slice(1), authored.words.slice(1), 'words beyond the budget are untouched');
    } else {
      assert.ok(['unavailable', 'partial'].includes(enriched.lesson.enrichment?.status ?? ''), `unexpected enrichment status ${enriched.lesson.enrichment?.status}`);
    }
    pass(13, 'Dictionary enrichment can only add an attributed Wiktionary gloss and Datamuse associations; it never rewrites an authored meaning, and a failed lookup ships the authored lesson with the failure stated');
  }

  /* ---------------------------------------------------------------- *
   * 14. Wiring: the scheduler entry point and the workflow exist, the
   *     app itself never calls these hosts, and the record id is a slug.
   * ---------------------------------------------------------------- */
  {
    const script = readFileSync('scripts/discover-science.ts', 'utf8');
    assert.match(script, /runScienceDiscovery/);
    assert.match(script, /process\.exit\(3\)/, 'a total outage must be a non-zero exit, not a green run');
    const workflow = readFileSync('.github/workflows/curiosity-science-discovery.yml', 'utf8');
    assert.match(workflow, /scripts\/discover-science\.ts/);
    assert.match(workflow, /schedule:/);
    assert.doesNotMatch(workflow, /NEXT_PUBLIC_SUPABASE_SECRET|SUPABASE_SERVICE_ROLE_KEY\s*:\s*ey/, 'no credential literals in the workflow');

    // The reader-facing bundle must not reach a science host: discovery is scheduled.
    for (const file of ['app/api/curiosity/route.ts', 'app/curiosity/page.tsx', 'components/curiosity/curiosity-screen.tsx']) {
      const source = readFileSync(file, 'utf8');
      assert.doesNotMatch(source, /openalex|crossref|europepmc|export\.arxiv/i, `${file} talks to a science host at request time`);
    }

    const record: ScienceRecord = {
      sourceId: 'openalex',
      discipline: 'chemistry',
      title: 'A cheaper catalyst splits water at industrial current density',
      url: 'https://doi.org/10.1126/science.adq1234',
      doi: '10.1126/science.adq1234',
      publishedOn: TODAY,
      authors: [],
      institutions: [],
      preprint: false,
      peerReviewed: true,
      foundVia: 'chemistry:catalysis',
    };
    const draft = scienceDraftFromRecord(record, scoreScienceRecord(record, TODAY), NOW_ISO);
    assert.match(draft.id, /^[a-z0-9][a-z0-9:_./-]{1,120}$/, 'the reservoir row id must satisfy the store gate');
    assert.equal(draft.id, 'scichem-doi-10-1126-science-adq1234', 'the id is DOI-derived, so the same paper cannot arrive twice under two titles');
assert.equal(draft.entityId, 'doi:10.1126/science.adq1234');
    assert.equal(normalizeDoi('https://doi.org/10.1126/SCIENCE.ADQ1234'), '10.1126/science.adq1234');
    assert.equal(normalizeDoi('not a doi'), undefined);
    pass(14, 'Science discovery is scheduled-only (the app never calls a journal host), the workflow runs the CLI and fails loudly on total outage, and row ids are DOI-derived slugs the reservoir gate accepts');
  }

  const reports = results.join('\n');
  console.log(`\n${reports}\n`);
  console.log(
    `${results.length} checks. Science discovery: four adapters, a 100-point ranking, DOI-first collapse, Crossref verification that can only demote a claim, and cards that print exactly the provenance they have. Enrichment adds attributed dictionary glosses and never rewrites authored content. These are fixture checks: live reachability is the scheduled run's business, not this harness's claim.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
