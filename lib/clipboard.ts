/**
 * Clipboard write with a fallback that works where `navigator.clipboard` does
 * not — a non-secure origin, an older browser, or a webview that ships the API
 * but refuses the permission.
 *
 * The fallback is the long-standing textarea + `execCommand('copy')` path. It is
 * deprecated, and it is also the only thing that works in some embedded
 * browsers, so it is kept behind a feature test rather than replaced.
 *
 * Nothing here throws at import time and nothing reads `navigator` at module
 * scope, so the module can be imported in a Node test process.
 */

export interface CopyDeps {
  /** Injectable for tests; defaults to the real `navigator`. */
  navigator?: Pick<Navigator, 'clipboard'> | undefined;
  /** Injectable for tests; defaults to the real `document`. */
  document?: Pick<Document, 'createElement' | 'body' | 'execCommand'> | undefined;
}

export class CopyFailedError extends Error {
  constructor(message = 'Could not copy to the clipboard') {
    super(message);
    this.name = 'CopyFailedError';
  }
}

async function writeWithClipboardApi(text: string, nav: Pick<Navigator, 'clipboard'>): Promise<void> {
  await nav.clipboard.writeText(text);
}

function writeWithTextarea(text: string, doc: Pick<Document, 'createElement' | 'body' | 'execCommand'>): void {
  const area = doc.createElement('textarea');
  area.value = text;
  // Keep it out of the flow and out of the accessibility tree, but selectable,
  // and prevent the mobile keyboard from opening.
  area.setAttribute('readonly', '');
  area.setAttribute('aria-hidden', 'true');
  area.style.position = 'fixed';
  area.style.top = '0';
  area.style.left = '-9999px';
  area.style.opacity = '0';
  doc.body.appendChild(area);
  try {
    area.focus();
    area.select();
    area.setSelectionRange(0, text.length);
    const ok = doc.execCommand('copy');
    if (!ok) throw new CopyFailedError();
  } finally {
    doc.body.removeChild(area);
  }
}

/**
 * Copy `text` to the clipboard. Resolves on success; rejects with
 * `CopyFailedError` when neither path works, so a caller can show a real
 * failure message instead of pretending the copy happened.
 */
export async function copyTextToClipboard(text: string, deps: CopyDeps = {}): Promise<void> {
  const nav = 'navigator' in deps ? deps.navigator : (typeof navigator === 'undefined' ? undefined : navigator);
  const doc = 'document' in deps ? deps.document : (typeof document === 'undefined' ? undefined : document);

  if (nav?.clipboard?.writeText) {
    try {
      await writeWithClipboardApi(text, nav);
      return;
    } catch {
      // Permission denied, or not a secure context: fall through to the legacy path.
    }
  }

  // `execCommand` is typed as always present, but it is genuinely absent in
  // some embedded browsers and in every Node process — hence the cast.
  if (typeof (doc as Document | undefined)?.execCommand === 'function' && doc?.createElement && doc.body) {
    try {
      writeWithTextarea(text, doc);
      return;
    } catch {
      throw new CopyFailedError();
    }
  }

  throw new CopyFailedError();
}
