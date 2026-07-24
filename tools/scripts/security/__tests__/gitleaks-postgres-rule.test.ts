/**
 * Rule test for the gitleaks custom rule `postgres-literal-in-workflow` in
 * .gitleaks.toml (Harness hardening — Gap #1).
 *
 * gitleaks is not part of the local toolchain (it runs in CI via
 * gitleaks/gitleaks-action, which is authoritative). This test verifies the rule
 * DEFINITION deterministically and cross-platform: it loads the rule's regex and
 * per-line allowlist straight from .gitleaks.toml and asserts, against the
 * committed fixture, that TRIGGER lines match the rule while ALLOW lines are
 * exempted. It also guards the critical `[extend] useDefault = true` invariant —
 * without it, adding a custom rule silently disables gitleaks' entire default
 * ruleset.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const TOML_PATH = path.join(REPO_ROOT, '.gitleaks.toml');
const FIXTURE_PATH = path.join(
  REPO_ROOT,
  'tools',
  'scripts',
  'security',
  'fixtures',
  'gitleaks-postgres-literal.fixture.yml'
);

const toml = fs.readFileSync(TOML_PATH, 'utf8');
const fixture = fs.readFileSync(FIXTURE_PATH, 'utf8');

/** Pull the `regex = '''...'''` value out of the rule block for the given id. */
function ruleRegex(id: string): string {
  const block = toml.slice(toml.indexOf(`id = "${id}"`));
  const m = /regex\s*=\s*'''([\s\S]*?)'''/.exec(block);
  if (!m) throw new Error(`rule regex not found for ${id}`);
  return m[1];
}

/** Pull the per-line allowlist `regexes = [...]` triple-quoted entries. */
function ruleAllowlistRegexes(id: string): string[] {
  const block = toml.slice(toml.indexOf(`id = "${id}"`));
  const listStart = block.indexOf('regexes = [');
  const listEnd = block.indexOf(']', listStart);
  const list = block.slice(listStart, listEnd);
  return [...list.matchAll(/'''([\s\S]*?)'''/g)].map((m) => m[1]);
}

/**
 * gitleaks uses Go's RE2 engine, which supports the inline `(?i)`
 * case-insensitive flag. JS RegExp does not — translate a leading `(?i)` into
 * the JS `i` flag so the rule can be exercised locally.
 */
function toJsRegex(src: string): RegExp {
  let flags = '';
  let body = src;
  while (body.startsWith('(?i)')) {
    if (!flags.includes('i')) flags += 'i';
    body = body.slice(4);
  }
  return new RegExp(body, flags);
}

const RULE_ID = 'postgres-literal-in-workflow';
const ruleRe = toJsRegex(ruleRegex(RULE_ID));
const allowRes = ruleAllowlistRegexes(RULE_ID).map(toJsRegex);

/** A line is reported only if the rule matches AND no allowlist regex exempts it. */
function isReported(line: string): boolean {
  if (!ruleRe.test(line)) return false;
  return !allowRes.some((re) => re.test(line));
}

describe('gitleaks rule: postgres-literal-in-workflow', () => {
  it('preserves the default ruleset via [extend] useDefault = true', () => {
    expect(/\[extend\][\s\S]*useDefault\s*=\s*true/.test(toml)).toBe(true);
  });

  it('is scoped to .github/workflows paths', () => {
    const block = toml.slice(toml.indexOf(`id = "${RULE_ID}"`));
    expect(/path\s*=\s*'''[^']*workflows[^']*'''/.test(block)).toBe(true);
  });

  it('defines a non-empty per-line allowlist', () => {
    expect(allowRes.length).toBeGreaterThanOrEqual(3);
  });

  it('REPORTS every TRIGGER-tagged fixture line', () => {
    const lines = fixture.split(/\r?\n/);
    const triggers = lines.filter((_, i) => /TRIGGER:/.test(lines[i - 1] ?? ''));
    expect(triggers.length).toBeGreaterThanOrEqual(2);
    for (const line of triggers) {
      expect(isReported(line), `expected TRIGGER to be reported: ${line.trim()}`).toBe(true);
    }
  });

  it('EXEMPTS every ALLOW-tagged fixture line', () => {
    const lines = fixture.split(/\r?\n/);
    const allows = lines.filter((_, i) => /ALLOW:/.test(lines[i - 1] ?? ''));
    expect(allows.length).toBeGreaterThanOrEqual(3);
    for (const line of allows) {
      expect(isReported(line), `expected ALLOW to be exempted: ${line.trim()}`).toBe(false);
    }
  });

  it('matches the raw postgres:postgres and password: postgres shapes', () => {
    expect(ruleRe.test('  DATABASE_URL: postgresql://postgres:postgres@host/db')).toBe(true);
    expect(ruleRe.test('  password: postgres')).toBe(true);
    expect(ruleRe.test("  password: 'postgres'")).toBe(true);
    expect(ruleRe.test('  DATABASE_URL: ${{ secrets.DATABASE_URL }}')).toBe(false);
  });
});
