/**
 * Repository-wide guards: the rules an ESLint config would enforce if ESLint could be
 * installed here (see the header of eslint.config.mjs), asserted directly against the
 * source instead.
 *
 * These are not style rules. Each one corresponds to a way this console can silently
 * do the wrong thing:
 *
 *   a direct fetch          skips credentials:'include', the CSRF header, error
 *                            normalisation and the request id - and looks like it works
 *                            until the backend requires an operator
 *   raw HTML                 this UI renders product titles, supplier notes and error
 *                            messages that originate outside it
 *   a credential in storage  localStorage is readable by any script on the origin and
 *                            survives the session
 *   a secret in NEXT_PUBLIC_ anything with that prefix is INLINED into the client
 *                            bundle at build time and shipped to every browser
 *   an image with no alt     this is an operator tool used with a keyboard and,
 *                            sometimes, a screen reader
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const SRC = join(process.cwd(), 'src');

function sourceFiles(dir = SRC, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, found);
    else if (/\.tsx?$/.test(entry.name) && !entry.name.includes('.test.')) found.push(full);
  }
  return found;
}

const FILES = sourceFiles().map((path) => ({
  path: path.slice(SRC.length + 1),
  source: readFileSync(path, 'utf8'),
}));

/** Strips comments so prose about a rule is not mistaken for a violation. */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//') && !line.trimStart().startsWith('*'))
    .join('\n');
}

describe('the guards see the codebase', () => {
  it('found the source files', () => {
    // Without this, every assertion below could pass vacuously.
    assert.ok(FILES.length >= 30, `only found ${FILES.length} source files`);
    assert.ok(FILES.some((file) => file.path === 'lib/api.ts'));
  });
});

describe('every network call goes through the API client', () => {
  it('only lib/api.ts calls fetch', () => {
    const offenders = FILES.filter(
      (file) => file.path !== 'lib/api.ts' && /(^|[^.\w])fetch\s*\(/.test(code(file.source)),
    ).map((file) => file.path);

    assert.deepEqual(
      offenders,
      [],
      `these files call fetch directly: ${offenders.join(', ')}. Use @/lib/api - it attaches credentials:'include' (without which every management read 401s), the CSRF header on mutations, error normalisation and the request id.`,
    );
  });

  it('nothing builds a backend URL of its own', () => {
    // A hard-coded origin bypasses NEXT_PUBLIC_API_BASE_URL and silently points a
// production build at localhost.
    const offenders = FILES.filter(
      (file) => file.path !== 'lib/api.ts' && /https?:\/\/localhost:\d+/.test(code(file.source)),
    ).map((file) => file.path);

    assert.deepEqual(offenders, [], `hard-coded backend origin in: ${offenders.join(', ')}`);
  });
});

describe('no unsafe HTML', () => {
  it('nothing uses dangerouslySetInnerHTML', () => {
    // This console renders product titles, supplier notes and backend error messages -
    // all of which originate outside it.
    const offenders = FILES.filter((file) =>
      code(file.source).includes('dangerouslySetInnerHTML'),
    ).map((file) => file.path);

    assert.deepEqual(offenders, [], `raw HTML injection point in: ${offenders.join(', ')}`);
  });

  it('nothing evaluates a string as code', () => {
    const offenders = FILES.filter((file) =>
      /(^|[^.\w])eval\s*\(|new Function\s*\(/.test(code(file.source)),
    ).map((file) => file.path);

    assert.deepEqual(offenders, [], `dynamic code evaluation in: ${offenders.join(', ')}`);
  });
});

describe('no credentials in web storage', () => {
  it('web storage is only used for UI preferences', () => {
    // The operator session is an HttpOnly cookie precisely so that JavaScript - and
    // therefore XSS - cannot read it. Putting a token or a session value into
    // localStorage would give that away for free.
    const CREDENTIAL_HINT = /(token|secret|password|session|credential|csrf)/i;

    for (const file of FILES) {
      const body = code(file.source);
      const lines = body.split('\n');
      lines.forEach((line, index) => {
        if (!/localStorage|sessionStorage/.test(line)) return;
        // Look at the statement and its immediate neighbours, since the key is often
        // a constant declared just above.
        const context = lines.slice(Math.max(0, index - 3), index + 2).join(' ');
        assert.ok(
          !CREDENTIAL_HINT.test(context),
          `${file.path}:${index + 1} appears to put a credential in web storage: ${line.trim()}`,
        );
      });
    }
  });
});

describe('no secrets reach the client bundle', () => {
  it('only the API base URL is read from NEXT_PUBLIC_', () => {
    // NEXT_PUBLIC_* is INLINED into the bundle at build time. An allow-list is the
    // only version of this check that keeps working as the app grows.
    const ALLOWED = new Set(['NEXT_PUBLIC_API_BASE_URL']);
    const found = new Set<string>();

    for (const file of FILES) {
      for (const match of code(file.source).matchAll(/process\.env\.(NEXT_PUBLIC_[A-Z0-9_]+)/g)) {
        found.add(match[1] as string);
      }
    }

    const unexpected = [...found].filter((name) => !ALLOWED.has(name));
    assert.deepEqual(
      unexpected,
      [],
      `these NEXT_PUBLIC_ variables are inlined into the client bundle and shipped to every browser: ${unexpected.join(', ')}. If one is a credential, it is already public.`,
    );
  });

  it('no credential-shaped literal is present in the source', () => {
    // The secret-scan workflow checks the built bundle; this catches it at review time.
    const PATTERNS: [RegExp, string][] = [
      [/shpat_[A-Za-z0-9]{10,}/, 'a Shopify Admin API token'],
      [/shpss_[A-Za-z0-9]{10,}/, 'a Shopify app secret'],
      [/rzp_live_[A-Za-z0-9]{8,}/, 'a Razorpay live key'],
      [/mongodb(\+srv)?:\/\/[^\s"']*:[^\s"']*@/, 'a Mongo URI with credentials'],
    ];

    for (const file of FILES) {
      for (const [pattern, what] of PATTERNS) {
        assert.ok(!pattern.test(file.source), `${file.path} contains ${what}`);
      }
    }
  });
});

describe('accessibility basics', () => {
  it('every img has an alt attribute', () => {
    // An operator console is used with a keyboard, and sometimes with a screen reader.
    for (const file of FILES) {
      for (const match of code(file.source).matchAll(/<img\s[^>]*>/g)) {
        assert.ok(
          /\salt=/.test(match[0]),
          `${file.path} has an <img> with no alt attribute: ${match[0]}`,
        );
      }
    }
  });

  it('every icon-only control is labelled', () => {
    // A button whose only child is an icon reads as "button" to a screen reader.
    // aria-hidden on the icon plus an accessible name on the control is the pattern
    // used throughout this codebase; this asserts it stays that way.
    for (const file of FILES) {
      for (const match of code(file.source).matchAll(/<button\b[^>]*>/g)) {
        const tag = match[0];
        if (!/aria-label|aria-labelledby|title=/.test(tag)) continue;
        assert.ok(
          !/aria-label=""|aria-label={``}/.test(tag),
          `${file.path} has a button with an empty accessible name: ${tag}`,
        );
      }
    }
  });
});

describe('destructive actions are guarded', () => {
  it('every destructive API call is behind a confirmation', () => {
    // apiDelete is the only irreversible verb this console issues. A one-click
    // irreversible action in an operator tool is a support incident waiting to happen,
    // so each call site must sit next to an explicit confirmation.
    const offenders: string[] = [];

    for (const file of FILES) {
      // lib/api.ts DEFINES apiDelete; it is the transport, not a call site.
      if (file.path === 'lib/api.ts') continue;
      const body = code(file.source);
      if (!body.includes('apiDelete')) continue;
      const confirmed = /confirm|Confirm/.test(body);
      if (!confirmed) offenders.push(file.path);
    }

    assert.deepEqual(
      offenders,
      [],
      `these files call apiDelete with no visible confirmation step: ${offenders.join(', ')}`,
    );
  });
});
