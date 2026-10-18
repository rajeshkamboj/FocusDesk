import type { DeveloperDiscovery } from '../types';

/**
 * Developer Radar — the curated shelf.
 *
 * When `api.github.com` cannot be reached, the card would otherwise say "unavailable"
 * while a genuinely useful list sits one file away. These entries are the fallback:
 * established open-source tools whose description does not depend on what happened
 * this week, so none of them is presented as a discovery, a trending project or a
 * recent release. The card marks the whole list as the curated shelf when it is
 * showing these, and the live "recently updated" framing disappears with it.
 *
 * Facts here are the kind a reader can confirm on the repository in one look: what the
 * tool does and what it is for. No star counts, no popularity claims, no version
 * numbers, no "latest release" — those go stale on their own schedule.
 *
 * Rotation: three a day out of twelve, keyed to the publication day, so a reader who
 * opens Curiosity every day sees a different shelf for four days before the cycle
 * repeats, and two days in a row never share an entry.
 */
export interface RadarFallbackEntry {
  id: string;
  item: DeveloperDiscovery;
}

const tool = (
  id: string,
  name: string,
  description: string,
  why: string,
  url: string,
): RadarFallbackEntry => ({
  id,
  item: {
    name,
    description,
    why,
    pricing: 'Open source. Confirm the licence in the repository before depending on it.',
    url,
    origin: 'curated' as const,
  },
});

export const radarFallbackShelf: RadarFallbackEntry[] = [
  tool(
    'radar-esbuild',
    'esbuild',
    'A JavaScript and TypeScript bundler and minifier written in Go, built so that a full rebuild is fast enough to run on every save.',
    'Long builds quietly change how often you run them. A bundler that finishes in milliseconds gets run on every change instead of being scheduled around.',
    'https://github.com/evanw/esbuild',
  ),
  tool(
    'radar-playwright',
    'Playwright',
    'Browser automation for end-to-end tests: it drives Chromium, Firefox and WebKit with the same script, and waits on real page conditions rather than fixed sleeps.',
    'Tests that flake because a click raced a render get deleted, not fixed. Explicit waits on the thing you actually care about is the difference.',
    'https://github.com/microsoft/playwright',
  ),
  tool(
    'radar-zod',
    'Zod',
    'Schema declaration and parsing for TypeScript: describe the shape once, then validate untrusted input and get the matching type for free.',
    'Data crossing a boundary — an API response, an imported JSON file, a form — is where a project pretends it knows something it does not. Parsing at the edge is cheaper than checking everywhere after.',
    'https://github.com/colinhacks/zod',
  ),
  tool(
    'radar-vite',
    'Vite',
    'A dev server and build tool that serves source files as native ES modules during development and bundles for production separately, so startup does not scale with project size.',
    'When the dev server is the bottleneck, the feedback loop gets longer than the work. The split between "fast to start" and "fast to ship" is the whole idea.',
    'https://github.com/vitejs/vite',
  ),
  tool(
    'radar-drizzle',
    'Drizzle ORM',
    'A TypeScript ORM that keeps the query in the shape of SQL, with a schema definition that generates the types instead of a query language of its own.',
    'Most performance surprises in an ORM come from not knowing the SQL it will send. Keeping SQL visible makes the review question ordinary instead of expert.',
    'https://github.com/drizzle-team/drizzle-orm',
  ),
  tool(
    'radar-tanstack-query',
    'TanStack Query',
    'Client-state management for server data: caching, refetching, invalidation and the loading/error states of data that is not yours.',
    'Hand-rolled fetch effects reimplement cache invalidation badly, one component at a time. Server data and UI state behave differently, and this keeps them apart.',
    'https://github.com/TanStack/query',
  ),
  tool(
    'radar-ripgrep',
    'ripgrep',
    'A command-line search tool that walks a repository quickly, respects ignore files by default, and treats a pattern as the common case rather than an option.',
    'Reading code is mostly searching it. Search that honours `.gitignore` and finishes before you lose your place changes how often you check instead of assume.',
    'https://github.com/BurntSushi/ripgrep',
  ),
  tool(
    'radar-prettier',
    'Prettier',
    'An opinionated code formatter: style is decided by the tool, so it stops being a review comment or a per-file accident.',
    'Formatting arguments cost review attention and produce diffs nobody chose. Removing the choice is the value, and the escape hatch is configuration you rarely open.',
    'https://github.com/prettier/prettier',
  ),
  tool(
    'radar-biome',
    'Biome',
    'A formatter and linter for JavaScript, TypeScript, JSON and CSS in a single fast binary, aimed at replacing several tools that each want a config file.',
    'A toolchain of seven config files is a toolchain nobody maintains. Fewer moving parts usually means the checks still run next month.',
    'https://github.com/biomejs/biome',
  ),
  tool(
    'radar-fd',
    'fd',
    'A file finder for the terminal: recursive, ignore-file aware, sensible defaults, and a pattern rather than an expression by default.',
    '`find` is powerful and almost nobody writes it from memory. A tool you will actually type at a prompt turns "where is that file" into one command.',
    'https://github.com/sharkdp/fd',
  ),
  tool(
    'radar-nextjs',
    'Next.js',
    'The React framework this app runs on: server components, file-based routing, and a build that decides what renders where.',
    'Worth knowing from the inside rather than by habit — the boundary between server render and client component is where both the performance and the complexity come from.',
    'https://github.com/vercel/next.js',
  ),
  tool(
    'radar-supabase',
    'Supabase',
    'A Postgres project with auth, row-level security, storage and generated APIs sitting on top of it, so the database is the application platform rather than a backing detail.',
    'When your persistence is a real database with policies on the rows, "who may read this" is answered in one place instead of in every query string.',
    'https://github.com/supabase/supabase',
  ),
];

export const radarFallbackIds = radarFallbackShelf.map((entry) => entry.id);
