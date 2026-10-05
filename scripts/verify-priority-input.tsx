/**
 * Headless check of the Today's Priority input — the mobile sizing contract
 * and the single-border/single-focus rule.
 *
 * jsdom has no layout engine, so this verifies the two things that actually
 * decide the rendered box: (a) the exact utilities on the element, and
 * (b) what those utilities compile to in the real stylesheet. The box model
 * is then computed from those values at 320 / 375 / 390 / 430 px.
 *
 * It also drives the real component the way the user does: focus the field,
 * type a priority, submit it, then reopen it for editing.
 *
 * Run: npm run build && npx tsx scripts/verify-priority-input.tsx
 * (the stylesheet assertions are skipped when no build output is present)
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' });
const g = globalThis as Record<string, unknown>;
g.window = dom.window; g.document = dom.window.document; g.localStorage = dom.window.localStorage;
g.IS_REACT_ACT_ENVIRONMENT = true;

let failures = 0;
const ok = (cond: boolean, msg: string) => {
  if (cond) console.log('✓', msg);
  else { failures += 1; console.error('FAIL:', msg); }
};

/** The compiled stylesheet, if the app has been built. */
function loadCss(): string | null {
  try {
    const dir = join(process.cwd(), '.next', 'static', 'chunks');
    const files = readdirSync(dir).filter((f) => f.endsWith('.css'));
    if (files.length === 0) return null;
    return files.map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
  } catch {
    return null;
  }
}

async function main() {
  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { act } = React;
  const { AuthProvider } = await import('../components/auth/auth-provider');
  const { DataProvider, useData } = await import('../components/data/data-provider');
  const { UIProvider } = await import('../components/ui/ui-provider');
  const { PriorityCard } = await import('../components/today/priority-card');
  const { todayISO } = await import('../lib/dates');

  let ctx: ReturnType<typeof useData> | null = null;
  const Probe = () => { ctx = useData(); return null; };
  const c = () => ctx!;

  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(
      React.createElement(AuthProvider, null,
        React.createElement(UIProvider, null,
          React.createElement(DataProvider, null,
            React.createElement(React.Fragment, null,
              React.createElement(PriorityCard),
              React.createElement(Probe))))),
    );
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 25)); });

  /* ---------------------------------------------------------------- */
  /* The empty-state input                                            */
  /* ---------------------------------------------------------------- */
  console.log('\n— Priority input (set) —');

  const input = el.querySelector('input') as HTMLInputElement | null;
  ok(input !== null, 'The priority form renders a text input');
  if (!input) throw new Error('no input');

  const classes = new Set(input.className.split(/\s+/).filter(Boolean));
  const has = (name: string) => classes.has(name);

  ok(has('box-border'), 'box-sizing: border-box is explicit');
  ok(has('w-full'), 'Width is 100% of the available card content width');
  ok(has('h-12'), 'Height is h-12 (a comfortable ~48px touch target)');
  ok(has('px-4'), 'Horizontal padding is px-4 (16px, inside the 14–16px range)');
  ok(has('leading-normal'), 'Normal line-height keeps the text vertically centred');
  ok(has('min-w-0'), 'min-width:0 — the field can never force its row to overflow');

  // Responsive font size, and 16px on mobile so iOS never zooms on focus.
  ok(has('text-base') && has('sm:text-[15px]'), 'Font size is responsive (16px mobile → 15px from sm up)');

  // The height bug: `flex-1` in the stacked (column) layout makes the input
  // flex along the VERTICAL axis, collapsing h-12 to content height. It must
  // only apply once the form becomes a row.
  ok(!has('flex-1'), 'No unconditional flex-1 (it would collapse the mobile height)');
  ok(has('sm:flex-1'), 'flex-1 applies only from sm up, where the form is a row');

  // No fixed widths that break small screens.
  ok(![...classes].some((n) => /^(w-\[|w-\d|max-w-\[|min-w-\[)/.test(n) && n !== 'w-full'),
     'No fixed desktop width on the field');

  // One border, one focus state.
  ok(has('border') && has('border-line'), 'Exactly one 1px border in the resting state');
  ok([...classes].filter((n) => n.startsWith('border-') && n !== 'border-line').every((n) => n.includes(':')),
     'No second border layer');
  ok(![...classes].some((n) => n.includes('ring')), 'The duplicated focus ring is gone');
  ok(has('focus:border-accent'), 'The single focus state is the border turning accent');
  ok(has('focus:outline-none'),
     'The global :focus-visible outline is suppressed, so focus never shows two green rings');

  /* ---------------------------------------------------------------- */
  /* Compiled values + box model at the four widths                   */
  /* ---------------------------------------------------------------- */
  const css = loadCss();
  if (!css) {
    console.log('… stylesheet assertions skipped (run `npm run build` first)');
  } else {
    console.log('\n— Compiled values —');
    /** Declarations of one literal CSS selector, e.g. `.focus\:outline-none:focus`. */
    const decl = (selector: string) => {
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const match = css.match(new RegExp(`${escaped}\\{([^}]*)\\}`));
      return match ? match[1] : '';
    };
    const varValue = (name: string) => {
      const match = css.match(new RegExp(`${name}:\\s*([^;}]+)`));
      return match ? match[1].trim() : '';
    };
    const rem = (value: string) => Math.round(parseFloat(value) * 16);

    const spacing = varValue('--spacing');            // .25rem
    const unit = rem(spacing);                        // 4px
    ok(decl('.box-border').includes('box-sizing:border-box'), 'box-border → box-sizing: border-box');
    ok(decl('.w-full').includes('width:100%'), 'w-full → width: 100%');
    ok(unit * 12 === 48, `h-12 → ${unit * 12}px height (~48px touch target)`);
    ok(unit * 4 === 16, `px-4 → ${unit * 4}px horizontal padding`);
    ok(rem(varValue('--text-base')) === 16, 'text-base → 16px (no iOS zoom-on-focus)');
    ok(varValue('--leading-normal') === '1.5', 'leading-normal → line-height 1.5');
    ok(decl(String.raw`.focus\:outline-none:focus`).includes('outline-style:none'),
       'focus:outline-none really removes the global 2px :focus-visible outline');
    ok(/:focus-visible\{outline:2px solid var\(--accent\)/.test(css),
       'The app-wide focus outline still exists for every other control');

    console.log('\n— Box model (page px-5 = 20px each side, card p-6 = 24px each side) —');
    for (const viewport of [320, 375, 390, 430]) {
      const content = viewport - 2 * 20 - 2 * 24;
      const text = content - 2 * 16;                  // border-box: padding is inside
      const fits = content > 0 && text >= 150;
      ok(fits, `${viewport}px → field ${content}px wide, ${text}px of text space, 48px tall — no overflow, not cramped`);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Behaviour: focus, type, submit                                   */
  /* ---------------------------------------------------------------- */
  console.log('\n— Behaviour —');

  await act(async () => { input.focus(); });
  ok(document.activeElement === input, 'The field can be focused');

  const setValue = async (field: HTMLInputElement, value: string) => {
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')?.set;
      if (setter) setter.call(field, value); else field.value = value;
      field.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
  };

  await setValue(input, 'Ship the mobile fix');
  ok(input.value === 'Ship the mobile fix', 'Typing updates the field');

  const form = el.querySelector('form') as HTMLFormElement;
  await act(async () => {
    form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 25));
  });
  ok(c().data.dailyPriorities.find((p) => p.date === todayISO())?.title === 'Ship the mobile fix',
     'Submitting sets today\'s priority (functionality unchanged)');

  const editButton = [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Edit'));
  ok(editButton !== undefined, 'The saved priority offers an Edit button');
  await act(async () => {
    editButton!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 15));
  });

  const editInput = el.querySelector('input') as HTMLInputElement | null;
  ok(editInput !== null && editInput.value === 'Ship the mobile fix', 'The edit field opens with the current title');
  const editClasses = new Set((editInput?.className ?? '').split(/\s+/).filter(Boolean));
  ok(editClasses.has('box-border') && editClasses.has('h-12') && editClasses.has('w-full') && editClasses.has('px-4'),
     'The edit field uses the same mobile sizing contract');
  ok(![...editClasses].some((n) => n.includes('ring')) && editClasses.has('focus:border-accent'),
     'The edit field has the same single border and single focus state');
  ok(editClasses.has('text-lg') && editClasses.has('sm:text-xl'),
     'The edit field font size is responsive (18px mobile → 20px from sm up)');

  await act(async () => { root.unmount(); });
}

main()
  .then(() => {
    if (failures > 0) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
    console.log('\nAll priority-input checks passed');
    process.exit(0);
  })
  .catch((error) => { console.error(error); process.exit(1); });
