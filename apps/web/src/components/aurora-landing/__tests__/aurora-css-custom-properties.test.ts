/**
 * Every custom property the Aurora landing's CSS reads must exist.
 *
 * A `var(--x)` with no fallback, where nothing defines --x, makes the whole
 * declaration invalid at computed-value time, and the property silently falls
 * back to inheritance. That is how every icon on the landing came to render in
 * Manrope as its ligature name ("task_alt", "lock"): its font-family read
 * --font-material-symbols, which nothing defined. Nothing in a unit test or a
 * screenshot diff names that cause, so check it at the source.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const WEB_SRC = path.resolve(__dirname, '../../..');
const LANDING = path.resolve(__dirname, '..');

function files(dir: string, ext: RegExp): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : files(p, ext);
    return ext.test(e.name) ? [p] : [];
  });
}

const QUOTES = new Set(["'", '"', '`']);

/** Each `--name` token in `text`, with the code just before and just after it. */
function* customPropertyTokens(text: string) {
  for (const m of text.matchAll(/--[\w-]+/g)) {
    const start = m.index;
    let end = start + m[0].length;
    const quoted = QUOTES.has(text[start - 1] ?? '') && text[end] === text[start - 1];
    if (quoted) end += 1;
    yield {
      name: m[0],
      before: text.slice(Math.max(0, start - (quoted ? 1 : 0) - 40), start - (quoted ? 1 : 0)),
      after: text.slice(end, end + 40),
    };
  }
}

/** Custom properties set anywhere in the web app: CSS, inline styles, next/font. */
function definedProperties(): Set<string> {
  const defined = new Set<string>();
  for (const file of files(WEB_SRC, /\.(css|tsx?)$/)) {
    for (const { name, before, after } of customPropertyTokens(fs.readFileSync(file, 'utf8'))) {
      const prefix = before.trimEnd();
      if (
        after.trimStart().startsWith(':') || // `--x: ...` and style={{ '--x': ... }}
        prefix.endsWith('variable:') || // next/font `variable: '--x'`
        prefix.endsWith('setProperty(') // el.style.setProperty('--x', ...)
      ) {
        defined.add(name);
      }
    }
  }
  return defined;
}

/** `var(--x)` reads in `css` that give no fallback. */
function readsWithoutFallback(css: string): string[] {
  const names: string[] = [];
  for (const { name, before, after } of customPropertyTokens(css)) {
    if (before.trimEnd().endsWith('var(') && !after.trimStart().startsWith(',')) names.push(name);
  }
  return names;
}

describe('Aurora landing CSS custom properties', () => {
  it('reads no custom property that nothing defines, unless it gives a fallback', () => {
    const defined = definedProperties();
    const missing: string[] = [];
    for (const file of files(LANDING, /\.css$/)) {
      for (const name of readsWithoutFallback(fs.readFileSync(file, 'utf8'))) {
        if (!defined.has(name)) missing.push(`${path.basename(file)}: ${name}`);
      }
    }
    expect([...new Set(missing)]).toEqual([]);
  });

  it('gives the icon font a real family when the variable is unset', () => {
    const css = fs.readFileSync(path.join(LANDING, 'aurora-landing.css'), 'utf8');
    const selector = '.aurora-page .material-symbols-outlined {';
    const start = css.indexOf(selector);
    expect(start).toBeGreaterThan(-1);
    const body = css.slice(start + selector.length, css.indexOf('}', start));
    const fontFamily = body.split(';').find((d) => d.trim().startsWith('font-family:'));
    expect(fontFamily).toContain("'Material Symbols Outlined'");
  });
});
