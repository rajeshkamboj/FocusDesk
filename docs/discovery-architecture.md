# Discovery architecture — Literature

How discovered reading reaches a reader, what each source is allowed to claim, and
what is deliberately **not** verified.

- Literature discovery — books and texts from Project Gutenberg, Standard Ebooks and Wikisource

The same engine is designed to carry a second collection (Science expansion) without
a new persistence path; that collection is added in a follow-up change, and the
sections it touches are marked below.

## The pipeline

```
scheduled job (GitHub Actions)
      │
      ├─ source adapters          lib/discovery/sources/*
      │      one bounded, polite request per source per run
      │
      ├─ normalization            lib/discovery/collection.ts
      │      record id, rights status, attribution sentence, payload marker
      │
      ├─ validation               lib/discovery/persist.ts → validateCandidate()
      │      the Curiosity gate, unchanged, plus the additive catalogue checks
      │
      ├─ deduplication            mergeCandidateDrafts()
      │      canonical id, entity id, normalized identity, URL, fingerprint, title
      │
      ├─ persistence              CandidateStore.writeUpsert()
      │      supabase `curiosity_candidates` (or a file in development)
      │
      ├─ run log                  CandidateStore.appendRunLog()
      │      supabase `curiosity_discovery_runs`, with per-source status
      │
      └─ selection                lib/discovery/shelf.ts
             eligibility → no repeats → one work → diverse kinds
                    │
                    └─ lib/discovery/server.ts → Curiosity page (server read only)
```

**There is no second discovery engine.** The Literature and Science features reuse
`curiosity_candidates`, `curiosity_discovery_state` and `curiosity_discovery_runs`
verbatim. They add no table, no column and no migration: a collection is a derived
property of a record's category plus a `payload.collection` marker.

## Scheduled, never per-visit

Nothing in `app/` or `components/` imports a source adapter, and
`scripts/verify-discovery.tsx` asserts it — a reader's page load physically cannot
make an outbound request to a third-party catalogue. The only writers are:

| Workflow | Schedule (UTC) | Script |
| --- | --- | --- |
| `discovery-literature.yml` | `20 11 * * *` | `scripts/discover-literature.ts` |

It is offset from the existing Curiosity discovery run (`00 12 * * *`) so it never
contends for the same API rate limits, and it finishes well before the midnight IST
publish. It is `workflow_dispatch`-able and uses a `concurrency` group so two runs
cannot overlap — the per-host rate limiter lives in process memory, so
overlap is prevented by the scheduler rather than by the client.

## Sources, terms and what may be claimed

| Source | Endpoint | Rights recorded | Text stored |
| --- | --- | --- | --- |
| Project Gutenberg | `gutenberg.org/ebooks/<id>.rdf` | `public-domain-verified` when the RDF says "Public domain in the USA" | **None** — metadata and a link |
| Standard Ebooks | `standardebooks.org/opds/all` | `public-domain-verified` (the project's own statement) | **None** — metadata and a link |
| Wikisource | `en.wikisource.org/w/api.php` | per page: `permitted-reuse` if CC/GDlF, `public-domain-verified` if a PD category, else `unknown` | **None** — intro extract capped at 600 characters, plus a link |

Every adapter identifies itself with
`FocusDesk/0.1 (<tool>; contact: <email>; <repository url>)`, using the existing
`WIKIMEDIA_CONTACT_EMAIL` variable. Requests are spaced per host (one per second for
the catalogues and Wikimedia, 700 ms for Europe PMC), retried at most twice with
capped exponential backoff, and honour `Retry-After` in both seconds and HTTP-date
form. A `4xx` other than 408/429 is never retried.

## Rights: the one invariant

Only four statuses may be shown to a reader:

| Status | Meaning | Shown |
| --- | --- | --- |
| `public-domain-verified` | the source says so for a named jurisdiction | yes |
| `public-domain-asserted` | widely treated as PD, jurisdiction unconfirmed | yes, with "check your country" |
| `permitted-reuse` | an explicit open licence | yes, with the licence named |
| `abstract-only` | research metadata and abstract | yes, as a link with a caveat |
| `unknown` | anything else | **stored, never shown** |

`statusForRights()` is the only place that decision is made, so an adapter cannot
publish something the licensing review has not covered. A record with `unknown`
rights is still persisted — that is deliberate, so a human can review it later —
but it is never eligible and therefore never reaches a shelf.

**No country's law is assumed.** Gutenberg and Standard Ebooks make a US claim, and
both the record and the card say so; a reader elsewhere is told to check their own
rules. Wikisource is decided per page from its own categories, because that site
hosts both public-domain and CC BY-SA texts.

## Deduplication

Three levels, reusing the reservoir's existing logic:

1. **Canonical id / entity id** — a record discovered twice is one row, updated.
2. **Normalized identity** — `mergeCandidateDrafts` compares normalized URL,
   fingerprint and title aliases, so the same article from two feeds collapses.
3. **Work identity at the shelf** — a QID, an ISBN, or normalized title + author. A
   concept arriving from Wikipedia *and* Wikidata is one work, and only one of them
   appears on a given day's shelf.

Idempotency is a property of `mergeCandidateDrafts`: a re-run over unchanged
upstream data returns nothing to write, and the harness asserts that a second
identical run writes `0` rows.

## Failure reporting

Each source is run inside its own `try/catch`; a throw becomes a `failed` report with
a short reason and never stops the others. Statuses are `ok`, `partial`, `failed`,
`skipped` and `disabled` — "partial" exists because a source that returned 14 usable
records out of 63 pages is not the same as one that worked.

A **failed** source does not advance its cursor, so its window is retried instead of
being skipped forever. The run log in `curiosity_discovery_runs` carries one line per
source, so a red scheduled job names the culprit.

The CLI scripts exit distinctly so the scheduler can tell the cases apart:

- `0` — at least one source worked and the run persisted
- `2` — the sources worked but the store refused the write (usually a missing migration)
- `3` — every source failed

## Fallback behaviour

`getCollectionShelf` returns an **empty shelf** — not an error — when the reservoir
is unmigrated, empty, unreadable or unreachable. The Curiosity page then renders
exactly the authored Literature and Science cards it has always rendered. The
discovered sections appear only when there is something verified to show, so a
reader never loses content to a failed discovery run.

## Environment variables

No new secrets. Reused:

- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY` — the existing server-only
  reservoir credentials, needed by the scheduled job to persist.
- `WIKIMEDIA_CONTACT_EMAIL` — the contact address every source's terms ask for in
  the user agent. Optional; without it the user agent simply omits the contact.
- `CURIOSITY_STORE=file` — the existing switch to a local `.curiosity` JSON store,
  used for a manual run without a database.

Optional switches (no code change needed):

- `CURIOSITY_LITERATURE_SOURCES=off` — disable all three literature sources
- `CURIOSITY_SCIENCE_SOURCES=off` — disable all five science sources
- Individual sources can be restricted per run with `--sources=`.

## What is verified, and what is not

`npm run verify:discovery` — **53 checks** — covers every adapter against recorded
response shapes, the rights policy, the strictness policy, the HTTP client's
retry/backoff/redaction behaviour, per-source isolation, cursor advancement,
deduplication and idempotent persistence, the selection rules, the UI markup, the
scheduled-not-per-visit guarantee, and that Curiosity's daily rotation is untouched.

**Not verified in this environment:** no live request was made to any of the three
sources, because this sandbox's network policy allows only GitHub, npm and PyPI. Every
adapter is exercised against a fixture that mirrors the documented response shape,
and every failure path against a stub, but **no claim is made here that a source
currently returns exactly these shapes in production**. The first scheduled run is
the real integration test, and its run log will say per source whether it worked.
If a source's shape has changed, the adapter reports `failed` (or `skipped`) rather
than inventing records — that is the failure mode to watch for in
`curiosity_discovery_runs.notes`.
