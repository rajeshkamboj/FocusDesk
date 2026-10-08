/**
 * Headless mobile-layout audit — does the app fit a phone, and *why*.
 *
 * jsdom has no layout engine, so this script brings its own. It reads the
 * real compiled Tailwind stylesheet out of `.next/`, resolves every class on
 * every rendered element at a given viewport width (honouring the `sm:`/`md:`
 * /`lg:` media blocks and stylesheet source order, ignoring `:hover`-style
 * pseudo rules), and then runs a CSS intrinsic-sizing pass over the real DOM
 * the components produce:
 *
 *   min   the narrowest border-box the element can be squeezed into
 *   pref  its max-content width (what `flex-shrink: 0` pins it to)
 *
 * The combination rules are the ones the browser uses, and they are the ones
 * that were actually broken here:
 *
 *   • a non-wrapping flex row sums its children — a flex item will NOT shrink
 *     below its own min-content unless it says `min-width: 0` or hides its
 *     overflow (this is what the seven-item filter row and the Inbox capture
 *     row tripped over);
 *   • a scroll container absorbs its children, so overflow stops there and
 *     never reaches the document;
 *   • `grid-cols-N` compiles to `minmax(0, 1fr)`, so its tracks can shrink
 *     past their content — the grid never pushes the page, but a track that
 *     is narrower than its content is reported as a clipping risk.
 *
 * What it can prove: no element forces the document wider than the viewport
 * at 320 / 360 / 390 / 430px, and the one control that *is* wider than a
 * phone scrolls inside itself. What it cannot prove: pixel-accurate text
 * rendering — glyph advances are estimated from a per-character table, so
 * text-derived numbers are approximations and are labelled as such.
 *
 * Run: npm run build && npx tsx scripts/verify-mobile-layout.tsx
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' });
const g = globalThis as Record<string, unknown>;
g.window = dom.window; g.document = dom.window.document; g.localStorage = dom.window.localStorage;
g.navigator = dom.window.navigator;
g.IS_REACT_ACT_ENVIRONMENT = true;
// next/link reaches for these during its passive effects; jsdom ships neither.
g.self = dom.window;
g.requestIdleCallback = (cb: (d: unknown) => void) => setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 0 }), 0);
g.cancelIdleCallback = (id: number) => clearTimeout(id);
class NoopObserver { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
g.IntersectionObserver = NoopObserver;
dom.window.IntersectionObserver = NoopObserver as unknown as typeof dom.window.IntersectionObserver;

let failures = 0;
const ok = (cond: boolean, msg: string) => {
  if (cond) console.log('✓', msg);
  else { failures += 1; console.error('FAIL:', msg); }
};

/* ------------------------------------------------------------------ */
/* 1. The compiled stylesheet                                          */
/* ------------------------------------------------------------------ */

const ROOT_FONT = 16;
const SPACING = 4; // --spacing: .25rem

interface Rule { bp: number; order: number; decls: Record<string, string> }

/** class name → the rules that set it, in stylesheet order. */
const CSS = new Map<string, Rule[]>();
let cssLoaded = false;

function loadCss(): string | null {
  for (const sub of [['.next', 'static', 'chunks'], ['.next', 'static', 'css']]) {
    try {
      const dir = join(process.cwd(), ...sub);
      const files = readdirSync(dir).filter((f) => f.endsWith('.css'));
      if (files.length > 0) return files.map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
    } catch { /* keep looking */ }
  }
  return null;
}

/** `.sm\:w-40` → `sm:w-40`; rejects anything that is not one bare class. */
function classOfSelector(sel: string): string | null {
  const s = sel.trim();
  if (!s.startsWith('.')) return null;
  let out = '';
  for (let i = 1; i < s.length; i += 1) {
    const ch = s[i];
    if (ch === '\\') { i += 1; out += s[i]; continue; }
    // A combinator, pseudo, attribute or second simple selector: not ours.
    if (/[\s.,:>+~[\]#*()]/.test(ch)) return null;
    out += ch;
  }
  return out.length > 0 ? out : null;
}

function parseDecls(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  let depth = 0; let buf = '';
  const flush = () => {
    const i = buf.indexOf(':');
    if (i > 0) {
      const prop = buf.slice(0, i).trim();
      const value = buf.slice(i + 1).trim();
      if (prop && !prop.startsWith('--')) out[prop] = value;
    }
    buf = '';
  };
  for (const ch of body) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ';' && depth === 0) { flush(); continue; }
    buf += ch;
  }
  flush();
  return out;
}

let order = 0;

function ingest(css: string, bp: number): void {
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open === -1) break;
    const prelude = css.slice(i, open).trim();
    // Find the matching close brace.
    let depth = 1; let j = open + 1;
    while (j < css.length && depth > 0) {
      if (css[j] === '{') depth += 1;
      else if (css[j] === '}') depth -= 1;
      j += 1;
    }
    const body = css.slice(open + 1, j - 1);
    i = j;

    if (prelude.startsWith('@')) {
      const at = prelude.slice(1).split(/[\s(]/)[0].toLowerCase();
      if (at === 'media') {
        const m = /min-width:\s*([\d.]+)(rem|px)/.exec(prelude);
        // Only min-width queries describe "a wider screen". `print`,
        // `prefers-reduced-motion`, `hover` etc. must not leak in.
        const otherCondition = /print|prefers-|pointer|hover|orientation|max-width/.test(prelude);
        if (m && !otherCondition) {
          ingest(body, m[2] === 'rem' ? parseFloat(m[1]) * ROOT_FONT : parseFloat(m[1]));
        }
        continue;
      }
      if (at === 'layer' || at === 'supports' || at === 'scope') { ingest(body, bp); continue; }
      continue; // @keyframes, @property, @font-face, @charset…
    }

    const decls = parseDecls(body);
    if (Object.keys(decls).length === 0) continue;
    for (const sel of prelude.split(',')) {
      const cls = classOfSelector(sel);
      if (!cls) continue;
      order += 1;
      const list = CSS.get(cls);
      if (list) list.push({ bp, order, decls });
      else CSS.set(cls, [{ bp, order, decls }]);
    }
  }
}

/* ------------------------------------------------------------------ */
/* 2. Value resolution                                                 */
/* ------------------------------------------------------------------ */

/** A CSS length in px, or null when it is not a fixed length. */
function lengthPx(value: string | undefined, fontSize: number): number | null {
  if (!value) return null;
  const v = value.trim();
  if (v === '0') return 0;
  let m = /^calc\(var\(--spacing\)\s*\*\s*(-?[\d.]+)\)$/.exec(v);
  if (m) return parseFloat(m[1]) * SPACING;
  m = /^(-?[\d.]+)px$/.exec(v);
  if (m) return parseFloat(m[1]);
  m = /^(-?[\d.]+)rem$/.exec(v);
  if (m) return parseFloat(m[1]) * ROOT_FONT;
  m = /^(-?[\d.]+)em$/.exec(v);
  if (m) return parseFloat(m[1]) * fontSize;
  return null; // %, auto, max-content, calc(... env(...)), var(...) …
}

type Style = Record<string, string>;

function styleOf(el: Element, vw: number): Style {
  const picked: Record<string, { v: string; bp: number; order: number }> = {};
  const classes = (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
  for (const cls of classes) {
    for (const rule of CSS.get(cls) ?? []) {
      if (rule.bp > vw) continue;
      for (const [p, v] of Object.entries(rule.decls)) {
        const prev = picked[p];
        // Later breakpoint wins; inside one breakpoint, stylesheet order wins.
        if (!prev || rule.bp > prev.bp || (rule.bp === prev.bp && rule.order > prev.order)) {
          picked[p] = { v, bp: rule.bp, order: rule.order };
        }
      }
    }
  }
  const out: Style = {};
  for (const [p, { v }] of Object.entries(picked)) out[p] = v;
  const inline = el.getAttribute('style');
  if (inline) for (const [p, v] of Object.entries(parseDecls(inline))) out[p] = v;
  return out;
}

/* ------------------------------------------------------------------ */
/* 3. Text measurement (estimated — Inter, no real font metrics here)  */
/* ------------------------------------------------------------------ */

function advance(ch: string): number {
  if (ch === ' ') return 0.26;
  if (/[ilj!.,:;'|]/.test(ch)) return 0.28;
  if (/[fltr()[\]{}/\\-]/.test(ch)) return 0.36;
  if (/[0-9]/.test(ch)) return 0.6;
  if (/[A-Z]/.test(ch)) return 0.68;
  if (/[mwMW@]/.test(ch)) return 0.88;
  if (/[a-z]/.test(ch)) return 0.55;
  return 0.6;
}

function textWidth(s: string, fontSize: number, bold: boolean): number {
  let w = 0;
  for (const ch of s) w += advance(ch);
  return w * fontSize * (bold ? 1.03 : 1);
}

function longestWord(s: string, fontSize: number, bold: boolean): number {
  let max = 0;
  for (const word of s.split(/\s+/)) max = Math.max(max, textWidth(word, fontSize, bold));
  return max;
}

/* ------------------------------------------------------------------ */
/* 4. Intrinsic sizing pass                                            */
/* ------------------------------------------------------------------ */

interface Size { min: number; pref: number; node: string; from: string }

const BLOCKISH = new Set(['DIV', 'SECTION', 'MAIN', 'NAV', 'HEADER', 'FOOTER', 'ARTICLE', 'ASIDE',
  'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'FORM', 'LABEL', 'FIELDSET']);

function describe(el: Element): string {
  const cls = (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean).slice(0, 6).join('.');
  return `<${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''}>`;
}

interface Ctx { vw: number; fontSize: number; bold: boolean; clipping: string[] }

function measure(el: Element, ctx: Ctx): Size {
  const st = styleOf(el, ctx.vw);
  const display = st.display ?? (BLOCKISH.has(el.tagName) ? 'block' : 'inline');
  if (display === 'none' || el.tagName === 'SCRIPT' || el.tagName === 'STYLE') {
    return { min: 0, pref: 0, node: describe(el), from: 'display:none' };
  }

  const fontSize = lengthPx(st['font-size'], ctx.fontSize) ?? ctx.fontSize;
  const weight = st['font-weight'];
  const bold = weight ? parseInt(weight, 10) >= 600 : ctx.bold;
  const child: Ctx = { ...ctx, fontSize, bold };

  // Own horizontal chrome.
  const pad = (side: 'left' | 'right') =>
    lengthPx(st[`padding-${side}`], fontSize)
    ?? lengthPx(st['padding-inline'], fontSize)
    ?? lengthPx(st.padding, fontSize)
    ?? 0;
  const bord = (side: 'left' | 'right') =>
    lengthPx(st[`border-${side}-width`], fontSize)
    ?? lengthPx(st['border-inline-width'], fontSize)
    ?? lengthPx(st['border-width'], fontSize)
    ?? 0;
  const own = pad('left') + pad('right') + bord('left') + bord('right');

  // Children (elements and text nodes alike).
  const kids: Size[] = [];
  for (const n of Array.from(el.childNodes)) {
    if (n.nodeType === 1) {
      kids.push(measure(n as Element, child));
    } else if (n.nodeType === 3) {
      const text = (n.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (!text) continue;
      const nowrap = st['white-space'] === 'nowrap';
      const pref = textWidth(text, fontSize, bold);
      kids.push({ min: nowrap ? pref : longestWord(text, fontSize, bold), pref, node: `"${text.slice(0, 28)}"`, from: 'text' });
    }
  }
  if (el.tagName === 'SVG' || el.tagName === 'svg') {
    const w = parseFloat(el.getAttribute('width') ?? '0');
    if (w) kids.push({ min: w, pref: w, node: '<svg>', from: 'width attr' });
  }
  // A form control carries an intrinsic size that min-width:auto resolves to —
  // the reason an <input> next to a button used to burst a 320px row.
  if (el.tagName === 'INPUT') {
    const size = parseInt(el.getAttribute('size') ?? '20', 10);
    const intrinsic = size * 0.5 * fontSize;
    kids.push({ min: intrinsic, pref: intrinsic, node: '<input>', from: `intrinsic ${size}ch` });
  }
  if (el.tagName === 'SELECT') {
    let widest = 0;
    for (const opt of Array.from(el.querySelectorAll('option'))) {
      widest = Math.max(widest, textWidth((opt.textContent ?? '').trim(), fontSize, bold));
    }
    kids.push({ min: widest, pref: widest, node: '<select>', from: 'longest option' });
  }

  const gap = lengthPx(st['column-gap'], fontSize) ?? lengthPx(st.gap, fontSize) ?? 0;
  const isFlex = display === 'flex' || display === 'inline-flex';
  const column = (st['flex-direction'] ?? 'row').startsWith('column');
  const wraps = (st['flex-wrap'] ?? 'nowrap') === 'wrap';

  // How far each child can be squeezed inside this container.
  const floor = (k: Size, kid: Element | null): number => {
    if (!kid) return k.min;
    const ks = styleOf(kid, ctx.vw);
    const shrink = ks['flex-shrink'] ?? (ks.flex ? ks.flex.split(/\s+/)[1] : undefined);
    if (isFlex && (shrink === '0' || ks.flex === 'none')) return k.pref; // pinned at max-content
    const ovx = ks['overflow-x'] ?? ks.overflow;
    const minW = lengthPx(ks['min-width'], fontSize);
    // `min-width: auto` on a flex item == min-content, unless the item opts
    // out with `min-width: 0` or hides its overflow (what `truncate` does).
    if (isFlex && (minW === 0 || (ovx && ovx !== 'visible'))) return Math.max(minW ?? 0, 0);
    return k.min;
  };

  const elementKids = Array.from(el.children);
  let kidIndex = 0;
  const floors = kids.map((k) => {
    const kid = k.from === 'text' || k.node === '<svg>' || k.node === '<input>' || k.node === '<select>'
      ? null
      : (elementKids[kidIndex++] ?? null);
    return floor(k, kid);
  });

  let innerMin: number;
  let innerPref: number;
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0) + Math.max(0, xs.length - 1) * gap;
  const max = (xs: number[]) => xs.reduce((a, b) => Math.max(a, b), 0);

  if (display === 'grid') {
    const cols = /repeat\((\d+),/.exec(st['grid-template-columns'] ?? '')?.[1];
    const n = cols ? parseInt(cols, 10) : 1;
    // Tailwind's grid-cols-N is `minmax(0, 1fr)`: tracks may be narrower than
    // their content, so the grid never widens the page — but note the squeeze.
    innerMin = 0;
    innerPref = sum(kids.map((k) => k.pref).slice(0, n)) || max(kids.map((k) => k.pref));
    const track = (ctx.vw - own) / n;
    for (const k of kids) {
      if (k.min > track + 0.5) ctx.clipping.push(`${describe(el)} grid track ≈${track.toFixed(0)}px < ${k.node} min ${k.min.toFixed(0)}px`);
    }
  } else if (isFlex && !column && !wraps) {
    innerMin = sum(floors);
    innerPref = sum(kids.map((k) => k.pref));
  } else if (isFlex && !column && wraps) {
    innerMin = max(floors);
    innerPref = sum(kids.map((k) => k.pref));
  } else if (isFlex && column) {
    innerMin = max(floors);
    innerPref = max(kids.map((k) => k.pref));
  } else if (display === 'inline' || el.tagName === 'SPAN' || el.tagName === 'A' || el.tagName === 'BUTTON') {
    innerMin = max(kids.map((k) => k.min));
    innerPref = sum(kids.map((k) => k.pref)) - Math.max(0, kids.length - 1) * gap;
  } else {
    innerMin = max(kids.map((k) => k.min));
    innerPref = max(kids.map((k) => k.pref));
  }

  const scrolls = ['auto', 'scroll', 'hidden', 'clip'].includes(st['overflow-x'] ?? st.overflow ?? 'visible');
  let min = scrolls ? own : own + innerMin;
  let pref = scrolls ? own : own + innerPref;
  let from = scrolls ? 'scroll container' : 'content';

  const wPx = lengthPx(st.width, fontSize);
  if (wPx !== null) { min = Math.max(min, wPx); pref = Math.max(pref, wPx); from = `width:${st.width}`; }
  const minPx = lengthPx(st['min-width'], fontSize);
  if (minPx !== null && minPx > 0) { min = Math.max(min, minPx); pref = Math.max(pref, minPx); from = `min-width:${st['min-width']}`; }
  const maxPx = lengthPx(st['max-width'], fontSize);
  if (maxPx !== null) { min = Math.min(min, maxPx); pref = Math.min(pref, maxPx); }

  // Margins are part of what the parent has to find room for.
  const mx = (lengthPx(st['margin-left'], fontSize) ?? lengthPx(st['margin-inline'], fontSize) ?? 0)
    + (lengthPx(st['margin-right'], fontSize) ?? lengthPx(st['margin-inline'], fontSize) ?? 0);
  min += Math.max(0, mx); pref += Math.max(0, mx);

  // Fixed/absolute boxes are taken out of flow: they cannot widen the page.
  if (st.position === 'fixed' || st.position === 'absolute') {
    return { min: 0, pref: 0, node: describe(el), from: `out of flow (${st.position})` };
  }

  return { min, pref, node: describe(el), from };
}

/**
 * Does this subtree force the document wider than `vw`?
 *
 * One number decides it — the min-width of the page root. When that number is
 * too big, `blame` walks down the single path that explains it, so the output
 * names the element to fix rather than every element that happens to be wide.
 */
function blame(el: Element, vw: number, avail: number, clipping: string[], depth = 0): string[] {
  const ctx: Ctx = { vw, fontSize: ROOT_FONT, bold: false, clipping };
  const here = measure(el, ctx);
  if (here.min <= avail + 0.5 || depth > 14) return [];

  const st = styleOf(el, vw);
  const display = st.display ?? (BLOCKISH.has(el.tagName) ? 'block' : 'inline');
  if (['auto', 'scroll', 'hidden', 'clip'].includes(st['overflow-x'] ?? st.overflow ?? 'visible')) return [];

  const fontSize = lengthPx(st['font-size'], ROOT_FONT) ?? ROOT_FONT;
  const own = (lengthPx(st['padding-left'], fontSize) ?? lengthPx(st['padding-inline'], fontSize) ?? lengthPx(st.padding, fontSize) ?? 0)
    + (lengthPx(st['padding-right'], fontSize) ?? lengthPx(st['padding-inline'], fontSize) ?? lengthPx(st.padding, fontSize) ?? 0)
    + (lengthPx(st['border-left-width'], fontSize) ?? lengthPx(st['border-width'], fontSize) ?? 0)
    + (lengthPx(st['border-right-width'], fontSize) ?? lengthPx(st['border-width'], fontSize) ?? 0);
  const gap = lengthPx(st['column-gap'], fontSize) ?? lengthPx(st.gap, fontSize) ?? 0;

  const kids = Array.from(el.children);
  const sizes = kids.map((k) => measure(k, ctx));
  const line = `${'  '.repeat(depth)}${describe(el)} needs ${here.min.toFixed(0)}px of ${avail.toFixed(0)}px (${here.from})`;

  if (kids.length === 0) return [line];

  // A grid's `minmax(0, 1fr)` tracks never widen the page; stop there.
  if (display === 'grid') return [line];

  const isRow = (display === 'flex' || display === 'inline-flex') && !(st['flex-direction'] ?? 'row').startsWith('column');
  const wraps = (st['flex-wrap'] ?? 'nowrap') === 'wrap';

  let worst = 0;
  for (let i = 1; i < sizes.length; i += 1) if (sizes[i].min > sizes[worst].min) worst = i;

  const childAvail = isRow && !wraps
    ? avail - own - gap * Math.max(0, kids.length - 1) - sizes.reduce((a, b, i) => a + (i === worst ? 0 : b.min), 0)
    : avail - own;

  const deeper = blame(kids[worst], vw, childAvail, clipping, depth + 1);
  return deeper.length > 0 ? [line, ...deeper] : [line];
}

/** The page fits when its root does; everything below that is diagnosis. */
function auditRoot(rootEl: Element, vw: number): { fits: boolean; need: number; chain: string[]; clipping: string[] } {
  const clipping: string[] = [];
  const size = measure(rootEl, { vw, fontSize: ROOT_FONT, bold: false, clipping });
  return {
    fits: size.min <= vw + 0.5,
    need: size.min,
    chain: size.min > vw + 0.5 ? blame(rootEl, vw, vw, clipping) : [],
    clipping: Array.from(new Set(clipping)),
  };
}

/* ------------------------------------------------------------------ */
/* 5. Render the real screens and audit them                           */
/* ------------------------------------------------------------------ */

/** The four phone widths from the brief; override with WIDTHS=300,320 to probe. */
const WIDTHS = (process.env.WIDTHS ?? '320,360,390,430').split(',').map((n) => parseInt(n, 10));

async function main() {
  const css = loadCss();
  if (!css) {
    console.error('FAIL: no compiled stylesheet found — run `npm run build` first.');
    process.exit(1);
  }
  ingest(css, 0);
  cssLoaded = CSS.size > 0;
  ok(cssLoaded, `Compiled stylesheet parsed (${CSS.size} utility classes)`);

  /* -- Static contract: the cause is fixed, not hidden --------------- */
  console.log('\n— No symptom-hiding —');
  ok(!/(^|[}\s])(html|body)\s*\{[^}]*overflow-x\s*:\s*hidden/i.test(css),
    'No global overflow-x:hidden on html/body — the page is not papered over');
  const strip = CSS.get('scroll-strip')?.[0]?.decls ?? {};
  ok(strip['overflow-x'] === 'auto', '.scroll-strip scrolls horizontally inside itself');
  ok(strip['overscroll-behavior-x'] === 'contain', '.scroll-strip does not chain its scroll to the page');

  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { act } = React;
  const { AppRouterContext } = await import('next/dist/shared/lib/app-router-context.shared-runtime');
  const { AuthProvider } = await import('../components/auth/auth-provider');
  const { DataProvider, useData } = await import('../components/data/data-provider');
  const { UIProvider } = await import('../components/ui/ui-provider');

  // Curiosity is server-fed in the app (the page passes a briefing prop), so it
  // is rendered here with a real editorial briefing for today's date. Using the
  // current date matters: the screen refetches only when the day changes, so a
  // stale date would send it looking for a fetch that jsdom does not provide.
  const { CuriosityScreen } = await import('../components/curiosity/curiosity-screen');
  const { dailyEditorial } = await import('../lib/curiosity/content');
  const curiosityDate = (await import('../lib/dates')).todayISO();
  const curiosityBriefing: React.ComponentProps<typeof CuriosityScreen>['briefing'] = {
    date: curiosityDate,
    aiWorld: [],
    developerRadar: [],
    ...dailyEditorial(curiosityDate),
  };
  const Curiosity = () => React.createElement(CuriosityScreen, { briefing: curiosityBriefing });

  const screens = {
    Today: (await import('../components/today/today-screen')).TodayScreen,
    Curiosity,
    Tasks: (await import('../components/tasks/tasks-screen')).TasksScreen,
    Inbox: (await import('../components/inbox/inbox-screen')).InboxScreen,
    Review: (await import('../components/review/review-screen')).ReviewScreen,
    Calendar: (await import('../components/calendar/calendar-screen')).CalendarScreen,
    Settings: (await import('../components/settings/settings-screen')).SettingsScreen,
    Projects: (await import('../components/projects/projects-screen')).ProjectsScreen,
    Goals: (await import('../components/goals/goals-screen')).GoalsScreen,
    Ideas: (await import('../components/ideas/ideas-screen')).IdeasScreen,
  };

  const router = {
    push: () => {}, replace: () => {}, prefetch: () => Promise.resolve(),
    back: () => {}, forward: () => {}, refresh: () => {},
  } as unknown as import('next/dist/shared/lib/app-router-context.shared-runtime').AppRouterInstance;

  let ctx: ReturnType<typeof useData> | null = null;
  const Probe = () => { ctx = useData(); return null; };

  let Current: () => React.ReactElement | null = () => null;
  const Slot = () => Current();

  // The shell's <main>: below `lg` it adds no horizontal padding, so the page
  // wrapper inside it sees the whole viewport — exactly as on a phone.
  const MAIN_CLASS = 'pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-0 lg:pl-[248px]';
  const tree = () =>
    React.createElement(
      AppRouterContext.Provider,
      { value: router },
      React.createElement(
        AuthProvider,
        null,
        React.createElement(
          UIProvider,
          null,
          React.createElement(
            DataProvider,
            null,
            React.createElement('main', { className: MAIN_CLASS }, React.createElement(Slot)),
            React.createElement(Probe),
          ),
        ),
      ),
    );

  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const settle = async () => {
    await act(async () => { root.render(tree()); });
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
  };
  await settle();

  const c = () => ctx!;

  const show = async (name: keyof typeof screens) => {
    Current = () => React.createElement(screens[name]);
    await settle();
  };

  const audit = (label: string) => {
    const main = host.querySelector('main')!;
    let clean = true;
    const allClipping: string[] = [];
    const needs: string[] = [];
    for (const vw of WIDTHS) {
      const { fits, need, chain, clipping } = auditRoot(main, vw);
      allClipping.push(...clipping);
      needs.push(`${vw}:${need.toFixed(0)}`);
      if (!fits) {
        clean = false;
        console.error(`    ${vw}px → the page wants ${need.toFixed(0)}px:`);
        for (const c2 of chain) console.error(`      ${c2}`);
      }
    }
    ok(clean, `${label}: fits at ${WIDTHS.join(' / ')}px  [needs ${needs.join('  ')}]`);
    return Array.from(new Set(allClipping));
  };

  /* -- Empty states (the first thing a new user sees) ---------------- */
  console.log('\n— Empty states —');
  for (const name of Object.keys(screens) as (keyof typeof screens)[]) {
    await show(name);
    audit(`${name} (empty)`);
  }

  /* -- Tasks, filled, with deliberately awkward content -------------- */
  console.log('\n— Populated —');
  await act(async () => {
    const goal = await c().actions.addGoal({ name: 'Ship the FocusDesk mobile polish release' });
    const project = await c().actions.addProject({
      name: 'Quarterly Infrastructure Modernisation Programme',
      goalId: goal.id,
    });
    await c().actions.addTask({
      title: 'Review the authentication middleware and rewrite the session refresh path',
      projectId: project.id,
    });
    await c().actions.addTask({ title: 'Call the accountant', scheduledDate: (await import('../lib/dates')).todayISO() });
    await c().actions.addTask({ title: 'Unscheduled-with-a-very-long-unbreakable-token-xxxxxxxx' });
    await c().actions.setDailyPriority('Finish the mobile layout audit and ship it');
    await c().actions.addInboxItem('A captured thought that runs on for a while to test wrapping');
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 30)); });

  const clips: string[] = [];
  for (const name of Object.keys(screens) as (keyof typeof screens)[]) {
    await show(name);
    clips.push(...audit(`${name} (populated)`));
  }

  // Review hides two thirds of itself behind tabs, and the weekly/monthly
  // panels are where project names reach the layout. Click through them.
  console.log('\n— Review tabs —');
  await show('Review');
  for (const tab of ['Weekly', 'Monthly']) {
    const btn = Array.from(host.querySelectorAll('main button')).find((b) => b.textContent?.trim() === tab);
    ok(btn !== undefined, `Review has a ${tab} tab`);
    if (!btn) continue;
    await act(async () => { (btn as HTMLButtonElement).click(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    clips.push(...audit(`Review · ${tab}`));
  }

  /* -- The specific components called out in the brief --------------- */
  console.log('\n— Tasks filter row —');
  await show('Tasks');
  const main = host.querySelector('main')!;

  const stripEl = main.querySelector('.scroll-strip');
  ok(stripEl !== null, 'The filter row is a contained scroll strip, not a page-wide row');
  if (stripEl) {
    const chips = Array.from(stripEl.querySelectorAll('button'));
    ok(chips.length === 7, `All seven filters are present (${chips.map((b) => b.textContent).join(' / ')})`);
    const pill = stripEl.firstElementChild!;
    const pillSize = measure(pill, { vw: 320, fontSize: ROOT_FONT, bold: false, clipping: [] });
    ok(pillSize.pref > 430,
      `The control really is wider than a phone (${pillSize.pref.toFixed(0)}px) — so it must scroll, not shrink`);
    const stripSize = measure(stripEl, { vw: 320, fontSize: ROOT_FONT, bold: false, clipping: [] });
    ok(stripSize.min <= 320,
      `…and it does: the strip itself needs only ${stripSize.min.toFixed(0)}px at 320px`);
    const chipStyle = styleOf(chips[0], 320);
    ok(lengthPx(chipStyle['font-size'], 16) === 13, 'Filter labels keep their 13px type — nothing was shrunk to fit');
    const active = chips.find((b) => (b.getAttribute('class') ?? '').includes('bg-accent'));
    ok(active !== undefined, 'The active filter stays visually distinct inside the strip');
  }

  const selects = Array.from(main.querySelectorAll('select'));
  ok(selects.length === 2, 'Search / All projects / All goals all render');
  for (const s of selects) {
    const wrapper = s.parentElement!.parentElement!;
    const st = styleOf(wrapper, 320);
    ok(st['min-width'] === '0', `Scope select wrapper opts out of min-content (${describe(wrapper)})`);
  }
  const search = main.querySelector('input[placeholder^="Search"]') as HTMLInputElement | null;
  ok(search !== null && !(search.getAttribute('class') ?? '').match(/(^|\s)w-\d/),
    'The search field carries no fixed mobile width');

  console.log('\n— Tasks empty state —');
  await act(async () => {
    for (const t of [...c().data.tasks]) await c().actions.deleteTask(t.id);
  });
  await show('Tasks');
  const empty = host.querySelector('main .border-dashed');
  ok(empty !== null, 'The empty state renders');
  if (empty) {
    const cls = empty.getAttribute('class') ?? '';
    ok(!cls.includes('justify-center'), 'It is not vertically centred — it keeps its natural content height');
    ok(!/\b(h-|min-h-)(screen|dvh|\[\d+vh\])/.test(cls), 'It claims no viewport height');
    ok(cls.includes('py-8') && cls.includes('sm:py-12'), 'Mobile padding is tightened (py-8) and desktop restored (sm:py-12)');
    ok((empty.textContent ?? '').includes('No tasks here'), 'The messaging is unchanged');
    ok(empty.querySelector('button')?.textContent?.includes('Add Task') === true, 'The Add Task action is still there');
  }
  const mainCls = host.querySelector('main')!.getAttribute('class') ?? '';
  ok(mainCls.includes('env(safe-area-inset-bottom)'),
    'The shell clears the bottom nav by its real height plus the safe-area inset');

  console.log('\n— Inbox capture —');
  await show('Inbox');
  const form = host.querySelector('main form')!;
  const formCls = form.getAttribute('class') ?? '';
  ok(formCls.includes('flex-col') && formCls.includes('sm:flex-row'),
    'Capture stacks on a phone and returns to a row from sm up');
  const capture = form.querySelector('input')!;
  const capCls = capture.getAttribute('class') ?? '';
  ok(capCls.includes('min-w-0') && capCls.includes('w-full'), 'The capture field is fluid and may shrink');
  ok(!/(^|\s)flex-1(\s|$)/.test(capCls) && capCls.includes('sm:flex-1'),
    'flex-1 is sm-only, so the stacked field keeps its 48px height');
  for (const vw of [320, 360]) {
    const s = measure(form, { vw, fontSize: ROOT_FONT, bold: false, clipping: [] });
    ok(s.min <= vw - 40, `Capture row fits inside the ${vw}px page gutters (needs ${s.min.toFixed(0)}px)`);
  }

  console.log('\n— Today priority card —');
  // The brief is about the "set your priority" card, so clear the seeded one.
  await act(async () => {
    for (const dp of [...c().data.dailyPriorities]) await c().actions.deleteDailyPriority(dp.id);
  });
  await show('Today');
  const card = host.querySelector('main .animate-rise-in')!;
  const cardCls = card.getAttribute('class') ?? '';
  ok(cardCls.includes('p-5') && cardCls.includes('sm:p-8'), 'Card padding is 20px on mobile, unchanged (32px) from sm up');
  const question = Array.from(host.querySelectorAll('main h2'))
    .find((h) => (h.textContent ?? '').includes('ONE thing'));
  ok(question !== undefined, 'The question is still asked');
  if (question) {
    const qCls = question.getAttribute('class') ?? '';
    ok(qCls.includes('text-xl') && qCls.includes('sm:text-2xl'), 'The question keeps its existing type scale');
    ok(qCls.includes('mt-3') && qCls.includes('sm:mt-4'), 'Only its top margin tightened on mobile');
  }
  const setBtn = Array.from(host.querySelectorAll('main button'))
    .find((b) => (b.textContent ?? '').trim() === 'Set Priority');
  ok(setBtn !== undefined, 'The Set Priority button is unchanged and still present');
  const pInput = host.querySelector('main input');
  if (pInput) {
    const pc = pInput.getAttribute('class') ?? '';
    ok(pc.includes('h-12'), 'The priority input keeps its 48px touch target');
    ok(pc.includes('w-full') && pc.includes('min-w-0'), 'The priority input is still fluid');
  }

  /* -- Desktop must be exactly where it was ---------------------------- */
  console.log('\n— Desktop unchanged —');
  await show('Tasks');
  const dmain = host.querySelector('main')!;
  const dstrip = dmain.querySelector('.scroll-strip')!;
  const dpill = dstrip.firstElementChild!;
  const pillPref = measure(dpill, { vw: 1280, fontSize: ROOT_FONT, bold: false, clipping: [] }).pref;
  ok(pillPref <= 832, `At 1280px the filter row fits the 832px content column (${pillPref.toFixed(0)}px) — it never scrolls on a desktop`);

  const dsearchWrap = (dmain.querySelector('input[placeholder^="Search"]') as HTMLElement).parentElement!;
  ok(lengthPx(styleOf(dsearchWrap, 1280).width, 16) === 208, 'Search keeps its original 208px (w-52) desktop width');
  for (const sel of Array.from(dmain.querySelectorAll('select'))) {
    const wrap = sel.parentElement!.parentElement!;
    ok(lengthPx(styleOf(wrap, 1280).width, 16) === 160, 'Scope select keeps its original 160px (w-40) desktop width');
  }
  const dsel = styleOf(dmain.querySelector('.grid.min-w-0')!, 1280);
  ok(dsel.display === 'flex', 'The mobile two-up grid becomes a plain flex row again from sm up');

  const padding = (el: Element, vw: number, side: 'left' | 'top') => {
    const st = styleOf(el, vw);
    const axis = side === 'left' ? 'padding-inline' : 'padding-block';
    return lengthPx(st[`padding-${side}`] ?? st[axis] ?? st.padding, 16);
  };

  await show('Today');
  const dcard = Array.from(host.querySelectorAll('main div'))
    .find((d) => (d.getAttribute('class') ?? '').includes('animate-rise-in')
      && (d.textContent ?? '').includes("Today's priority"))!;
  ok(padding(dcard, 1280, 'left') === 32, 'The priority card keeps its 32px (p-8) desktop padding');
  ok(padding(dcard, 320, 'left') === 20, '…and spends 20px (p-5) instead of 24px (p-6) on a phone');

  await show('Tasks');
  const dempty = host.querySelector('main .border-dashed');
  if (dempty) {
    ok(padding(dempty, 1280, 'top') === 48, 'The empty state keeps its 48px (py-12) desktop padding');
    ok(padding(dempty, 320, 'top') === 32, '…and 32px (py-8) on a phone');
  }
  for (const vw of [1024, 1280, 1536]) {
    const r = auditRoot(host.querySelector('main')!, vw);
    ok(r.fits, `Nothing overflows at ${vw}px either`);
  }

  /* -- Informational --------------------------------------------------- */
  if (clips.length > 0) {
    console.log('\n— Narrow grid tracks (clipped, never page-widening) —');
    for (const c2 of clips.slice(0, 12)) console.log('  ·', c2);
  }

  console.log(failures === 0 ? '\nAll mobile-layout checks passed.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
