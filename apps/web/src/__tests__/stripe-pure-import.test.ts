/**
 * Stripe.js must load only where a payment is taken. The main entry of `@stripe/stripe-js` injects
 * `https://js.stripe.com/v3` as a side effect of being imported, and the onboarding modal is mounted by
 * the root layout, so one value import of it put Stripe on every page (4 requests to stripe.com per
 * page load). The `/pure` entry loads the script only when `loadStripe()` is called. Type-only imports
 * are erased and are fine.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(__dirname, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === '__tests__' ? [] : sourceFiles(full);
    return /\.tsx?$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name) ? [full] : [];
  });
}

/** A value import (not `import type`, not an all-`type` specifier list) from the side-effecting entry. */
function valueImportsOfMainEntry(source: string): string[] {
  const found: string[] = [];
  for (const quote of ["'", '"']) {
    const tail = `from ${quote}@stripe/stripe-js${quote}`;
    let at = source.indexOf(tail);
    while (at !== -1) {
      const start = source.lastIndexOf('import', at);
      if (start !== -1) {
        const clause = source.slice(start + 'import'.length, at).trim();
        const specifiers = clause
          .split('{')
          .join('')
          .split('}')
          .join('')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        const typeOnly = clause.startsWith('type ') && !clause.startsWith('type,');
        if (!typeOnly && specifiers.some((s) => !s.startsWith('type '))) {
          found.push(source.slice(start, at + tail.length));
        }
      }
      at = source.indexOf(tail, at + tail.length);
    }
  }
  return found;
}

describe('Stripe.js is loaded lazily', () => {
  const files = sourceFiles(SRC);

  it('finds the web source to check', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('no file imports a value from the main @stripe/stripe-js entry (use @stripe/stripe-js/pure)', () => {
    const offenders = files
      .filter((file) => valueImportsOfMainEntry(readFileSync(file, 'utf8')).length > 0)
      .map((file) => path.relative(SRC, file));

    expect(offenders).toEqual([]);
  });

  it('the files that call loadStripe use the pure entry', () => {
    const callers = files.filter((file) => /\bloadStripe\(/.test(readFileSync(file, 'utf8')));

    expect(callers.length).toBeGreaterThan(0);
    for (const file of callers) {
      expect(readFileSync(file, 'utf8')).toContain("from '@stripe/stripe-js/pure'");
    }
  });

  it('recognises a value import, and ignores a type-only one', () => {
    expect(valueImportsOfMainEntry("import { loadStripe } from '@stripe/stripe-js';")).toHaveLength(
      1
    );
    expect(
      valueImportsOfMainEntry("import type { Stripe } from '@stripe/stripe-js';")
    ).toHaveLength(0);
    expect(
      valueImportsOfMainEntry(
        "import { type Stripe, type StripeElements } from '@stripe/stripe-js';"
      )
    ).toHaveLength(0);
    expect(
      valueImportsOfMainEntry("import { loadStripe } from '@stripe/stripe-js/pure';")
    ).toHaveLength(0);
  });
});
