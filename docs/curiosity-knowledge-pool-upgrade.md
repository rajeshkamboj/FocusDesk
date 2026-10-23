# Curiosity Persistent Knowledge Reservoir & Multi-Domain Today in History Upgrade

## 1. Architecture Audit Summary (Post-PR #51)

An audit of `main` at commit `2e7b177` (following merged PR #51) established what already existed and what remained transient:

- **Existing Anti-Repetition Layer (Preserved Intact)**:
  - `lib/curiosity/dedupe.ts`, `lib/curiosity/catalog.ts`, `lib/curiosity/candidates.ts`, `lib/curiosity/history.ts`, and `lib/curiosity/selection.ts` already enforce multi-signal anti-repetition across all 14 daily/book cards using canonical URLs, normalized titles, 64-bit content fingerprints, hashed 3-word shingle Jaccard similarity (`>= 0.55`), cross-card subject cooldown groups, version tracking, and deterministic age-ordered cooldown relaxation.
  - `curiosity_seen` (upgraded in `supabase/migrations/010_curiosity_dedupe_history.sql`) stores compact publication history (`content_id`, `category`, `shown_on`, `title`, `url`, `fingerprint`, `signature`, `subjects`, `source`, `version`).
- **Existing Publisher, Schedule & Storage (Preserved Intact)**:
  - `.github/workflows/curiosity-daily.yml` triggers `GET /api/curiosity/refresh` daily at `30 18 * * *` UTC (`00:00 Asia/Kolkata`), authenticating exclusively via `Authorization: Bearer ${SECRET}` and reading back `?action=status`.
  - `lib/curiosity/state.ts` persists snapshots atomically under a single-flight lease (`curiosity_jobs` / `.curiosity/state.json`), and `lib/curiosity/server.ts` guarantees zero external network calls during user page renders.
- **Root Gaps Identified & Addressed**:
  1. **No Persistent Candidate Reservoir**: `lib/curiosity/discovery.ts` held discovered science and mythology items in transient module memory only; nothing survived process exit, serverless cold starts, or across scheduled runs.
  2. **Single-Slot History Model**: `Today in History` carried only a single `HistoryEvent` backed by 9 static world/computing entries plus uncategorized live `onthisday` lookups, with no structured separation or priority ordering for **Sikh History**, **Indian History**, and **World History**.
  3. **No Bulk Cursor Pagination or Pool Telemetry**: Discovery ran inline during daily refresh without saved `cmcontinue` cursors, Wikidata SPARQL batching, `Retry-After` backoff telemetry, low-stock threshold tracking, or a separate replenishment schedule.

---

## 2. Persistent Knowledge Reservoir (`011_curiosity_candidates.sql`)

The candidate library is kept **strictly separate** from `curiosity_seen` (publication history):

| Table / File | Role | Read Access | Write Access |
|---|---|---|---|
| `curiosity_candidates` (`.curiosity/candidates.json` locally) | Validated candidate library across all 13 reservoir categories (`sikh-history`, `indian-history`, `world-history`, `mythology`, `chemistry`, `physics`, `biology`, `one-thing`, `learn-something`, `literature`, `book`, `ai-world`, `developer-radar`) | `publishable` key (`RLS select using (true)`) | `service_role` key only |
| `curiosity_discovery_state` | Saved MediaWiki `cmcontinue` pagination cursors & conditional ETag tokens per category | `publishable` key | `service_role` key only |
| `curiosity_discovery_runs` | Append-only operational telemetry for scheduled & manual replenishment runs | `publishable` key | `service_role` key only |
| `curiosity_seen` (untouched from `009`/`010`) | Historical record of items actually shown on published days | `publishable` key | `service_role` key only |

### Unmigrated Database & Local Zero-Credential Compatibility
- If `011_curiosity_candidates.sql` has not yet been applied in Supabase, `SupabaseCandidateStore` catches HTTP `404` / `PGRST205` / `42P01`, returns gracefully without throwing, logs a clear migration note in the discovery summary, and never interrupts daily publishing.
- With zero environment variables set, `FileCandidateStore` stores compact JSON at `.curiosity/candidates.json` (git-ignored) and relocates automatically to `os.tmpdir()` on read-only serverless filesystems.

---

## 3. Priority-Ordered Today in History (`1. Sikh -> 2. Indian -> 3. World`)

Every published daily briefing and every offline fallback briefing now populates `briefing.historyEntries` in strict priority order:

1. **`1 · Sikh History`** (`category: 'sikh-history'`) — 365-day exact cooldown, 45-day subject cooldown
2. **`2 · Indian History`** (`category: 'indian-history'`) — 365-day exact cooldown, 60-day subject cooldown
3. **`3 · World History`** (`category: 'world-history'`) — 365-day exact cooldown, 90-day subject cooldown

*(The legacy `briefing.history` field is preserved in parallel pointing to the top verified entry so pre-existing readers and tests remain 100% compatible.)*

### Selection & Historical Integrity Rules (`selectHistoryTriad`)
For each priority slot (`sikh-history`, then `indian-history`, then `world-history`):
1. **Cross-Slot Deduplication**: Candidates colliding with an already chosen slot on the same day by `id`, `entityId` (Wikidata QID), canonical URL, normalized title, fingerprint, shingle signature (`>= 0.55`), or subject key are excluded so the same event never appears twice under two headings.
2. **Exact Calendar Match First (`forThisDate: true`)**: Selects eligible validated candidates matching `(month, day)` outside their cooldown window, preferring curated primary/scholarly entries first, then reservoir entries.
3. **On-Demand Discovery Before Fallback**: If a category has no unseen calendar match, `discoverHistoryForDate` queries Wikimedia's On-This-Day feed before falling back to archive milestones or relaxing cooldowns.
4. **Leap-Year Handling**:
   - On February 29 of a leap year (`isIsoLeapYear(year) === true`), verified `02-29` events match with `forThisDate: true`.
   - On February 28 of a non-leap year (`isIsoLeapYear(year) === false`), `02-29` events remain reachable with `forThisDate: false`, `dateMatch: 'leap-day-observed'`, and an explicit leap-year note.
   - Impossible dates (`02-29` in non-leap years, `02-30`, `04-31`) are rejected at parse and validation boundaries.
5. **Honest Archive Fallback (`forThisDate: false`)**: If no verified anniversary exists for a slot on that date, a curated historical milestone for that category is surfaced with `"From the archive — not an event of this date."` rather than fabricating or guessing a date.
6. **Scholarly Nuance for Sikh History**: Entries involving Bikrami, Julian, Gregorian, Nanakshahi, or Janamsakhi textual variations preserve explicit `datePrecision` (`'exact' | 'month-year' | 'year' | 'approximate' | 'disputed'`) and rendered `calendarNote` explanations rather than flattening scholarly or calendar differences into single uncontextualized assertions.

---

## 4. Scheduled Discovery Workflow & Rate-Limit Etiquette

- **Daily Snapshot Workflow (Untouched)**: `.github/workflows/curiosity-daily.yml` — `30 18 * * *` UTC (`00:00 Asia/Kolkata`).
- **New Knowledge Discovery Workflow**: `.github/workflows/curiosity-discovery.yml` — `00 12 * * *` UTC (`17:30 Asia/Kolkata`, 6.5 hours ahead of midnight IST) plus manual `workflow_dispatch` (`categories`, `low_stock_only`).
  - Runs directly on the GitHub Actions runner via `npx tsx scripts/curiosity-refresh.ts --discover --trigger=cron` when `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SECRET_KEY` are configured in Actions secrets (avoiding serverless HTTP timeout ceilings), and automatically falls back to `POST ${APP_URL}/api/curiosity/refresh?action=discover` with `Authorization: Bearer ${CURIOSITY_CRON_SECRET}` when only the app URL + cron secret are configured.

### Source & Licensing Policy
- **Wikimedia REST & MediaWiki Action APIs (`en.wikipedia.org`)**: Descriptive `User-Agent` / `Api-User-Agent`, `maxlag=5`, batching (`<= 20` titles per `extracts` query, saved `cmcontinue` pagination cursors), exponential backoff + `Retry-After` header support (`computeBackoffMs`), compact 2-sentence lead summaries only, explicit `CC BY-SA 4.0` attribution + canonical article link on every record.
- **Wikidata Action & SPARQL (`www.wikidata.org` / `query.wikidata.org`)**: Structured QIDs, alternate spelling/transliteration aliases (`wbgetentities`), and bounded `LIMIT 30` SPARQL queries (`CC0 1.0`).
- **Curated Reference Corpus**: Primary Sikh textual/historical scholarship (*Sri Guru Granth Sahib*, *Varan Bhai Gurdas*, *Sri Gur Sobha*, *Prachin Panth Prakash*, *Mahan Kosh*, *Encyclopaedia of Sikhism* ed. Harbans Singh), Indian epigraphic/scientific/constitutional references, GitHub Search API (SPDX licence metadata preserved), Open Library, and official AI engineering RSS feeds.

---

## 5. Measured Candidate Counts vs Thresholds & Long-Term Targets

Measured via `NODE_USE_SYSTEM_CA=1 npm run curiosity:discover -- --full-sweep` on `2026-10-23`:

| Category | Verified Eligible Now | Low-Stock Replenishment Threshold | Long-Term Target Pool | Notes |
|---|---:|---:|---:|---|
| `sikh-history` | **37** | 60 | 365 | 37 curated entries with calendar/primary-source notes; below 365 unique-year ceiling until live Wikimedia/Wikidata scheduled runs accumulate |
| `indian-history` | **29** | 90 | 365 | 29 curated entries incl. leap day `02-29` & `10-23` anniversaries |
| `world-history` | **19** | 120 | 365 | 19 curated entries incl. all 9 original milestones + leap day `02-29` & `10-23` |
| `mythology` | **24** | 30 | 180 | 24 multi-layer authored cards; newly discovered titles stage as `needs-review` (`eligible=false`) |
| `chemistry` | **18** | 45 | 180 | 18 authored + continuous MediaWiki category discovery |
| `physics` | **18** | 45 | 180 | 18 authored + continuous MediaWiki category discovery |
| `biology` | **18** | 45 | 180 | 18 authored + continuous MediaWiki category discovery |
| `one-thing` | **22** | 30 | 120 | Curated editorial pool |
| `learn-something` | **24** | 30 | 120 | Curated micro-lesson pool |
| `literature` | **24** | 30 | 120 | Curated public-domain / literary passages |
| `book` | **25** | 30 | 120 | 3-day rotation (`25 * 3 = 75` days per cycle) |
| `ai-world` | **12** | 15 | 60 | 12 background items + daily RSS replenishment |
| `developer-radar` | **15** | 12 | 45 | 12 shelf items + **3 live GitHub repositories** fetched during verification (`above low-stock threshold`) |
| **Total Verified Eligible** | **285** | — | — | **0 validation failures; 0 duplicates on re-run** |

---

## 6. Deployment & Rollback Guide

### Apply Migration `011`
1. Open **Supabase Dashboard -> SQL Editor** (or run `supabase db push`).
2. Paste and execute [`supabase/migrations/011_curiosity_candidates.sql`](../supabase/migrations/011_curiosity_candidates.sql).
3. Verify tables and RLS:
   ```sql
   select relname, relrowsecurity
   from pg_class
   where relname in ('curiosity_candidates', 'curiosity_discovery_state', 'curiosity_discovery_runs');
   ```
4. Seed and run initial discovery once deployed:
   - Via GitHub Actions -> **Curiosity Knowledge Pool Discovery** -> **Run workflow**, OR
   - Via Settings -> Data -> **Replenish pool**, OR
   - Locally with Supabase env vars set: `npm run curiosity:discover -- --full-sweep`.

### Zero-Downtime Rollback
1. **Application Rollback**: Revert the Vercel deployment to the previous commit. Existing `curiosity_briefings` snapshots still contain valid `payload.history` single-event objects alongside `payload.historyEntries`, and `curiosity_seen` still uses only the exact 14 card keys from migration `010`.
2. **Workflow Pause**: Disable `.github/workflows/curiosity-discovery.yml` in GitHub Actions if desired; `.github/workflows/curiosity-daily.yml` continues operating independently.
3. **Optional Database Rollback** *(only if removing reservoir tables completely)*:
   ```sql
   drop table if exists curiosity_discovery_runs;
   drop table if exists curiosity_discovery_state;
   drop table if exists curiosity_candidates;
   ```
   All user tables (`tasks`, `projects`, `goals`, etc.) and all prior Curiosity tables (`curiosity_content`, `curiosity_briefings`, `curiosity_seen`, `curiosity_jobs`) remain completely untouched.
