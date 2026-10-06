/**
 * Guards the repo secret-scan configuration (.gitleaks.toml + .gitleaks/).
 *
 * The scan itself is gitleaks (pre-commit hook and CI job run
 * `.gitleaks/scan.sh`). This test verifies the configuration deterministically
 * and without the gitleaks binary:
 *   - the repo config extends the shared rule file and keeps no legacy blanket
 *     allowlist (`[allowlist]`, global regexes, commit list) or `.gitleaksignore`;
 *   - every allowlist entry names its rules and lists exact files;
 *   - the shared uri-credentials / password-literal rules catch credential-shaped
 *     strings that this repo's old custom `postgres-literal-in-workflow` rule
 *     targeted, and do not flag env or template references.
 *
 * Trigger strings are assembled at runtime so this file holds no
 * credential-shaped literal.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const repoToml = fs.readFileSync(path.join(REPO_ROOT, '.gitleaks.toml'), 'utf8');
const sharedToml = fs.readFileSync(path.join(REPO_ROOT, '.gitleaks', 'shared.toml'), 'utf8');

/** Pull the `regex = '''...'''` value out of the shared rule block with the given id. */
function sharedRuleRegex(id: string): RegExp {
  const block = sharedToml.slice(sharedToml.indexOf(`id = "${id}"`));
  const m = /regex\s*=\s*'''([\s\S]*?)'''/.exec(block);
  if (!m) throw new Error(`rule regex not found for ${id}`);
  // gitleaks uses Go RE2; translate a leading (?i) into the JS `i` flag.
  let body = m[1];
  let flags = '';
  while (body.startsWith('(?i)')) {
    flags = 'i';
    body = body.slice(4);
  }
  return new RegExp(body, flags);
}

/** Assemble a connection URI with embedded credentials at runtime. */
function uri(scheme: string, user: string, pass: string, host: string): string {
  return [scheme, '://', user, ':', pass, '@', host].join('');
}

describe('repo gitleaks configuration', () => {
  it('extends the shared rule file', () => {
    expect(/\[extend\][\s\S]*path\s*=\s*"\.gitleaks\/shared\.toml"/.test(repoToml)).toBe(true);
  });

  it('keeps no legacy blanket exemptions', () => {
    expect(/^\[allowlist\]/m.test(repoToml)).toBe(false);
    const keys = repoToml.split('\n').map((l) => l.trim().split('=')[0].trim());
    expect(keys.includes('commits')).toBe(false);
    expect(keys.includes('regexes')).toBe(false);
    expect(fs.existsSync(path.join(REPO_ROOT, '.gitleaksignore'))).toBe(false);
  });

  it('scopes every allowlist entry to named rules and exact files', () => {
    const entries = repoToml.split('[[allowlists]]').slice(1);
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(/description\s*=\s*".{20,}"/.test(entry)).toBe(true);
      expect(/targetRules\s*=\s*\[\s*"[a-z-]+"/.test(entry)).toBe(true);
      const paths = [...entry.matchAll(/'''\^([^']*)\$'''/g)].map((m) => m[1]);
      expect(paths.length).toBeGreaterThan(0);
      for (const p of paths) {
        // exact file: no wildcard quantifiers or alternation
        expect(/\.\*|\.\+|\|/.test(p)).toBe(false);
      }
    }
  });
});

describe('shared rules cover the old postgres-literal-in-workflow cases', () => {
  const uriRule = sharedRuleRegex('uri-credentials');
  const pwRule = sharedRuleRegex('password-literal');

  it('flags a postgres URI with literal credentials, on a real host or localhost', () => {
    const pg = ['post', 'gres'].join('');
    expect(uriRule.test(uri('postgresql', pg, pg, 'db.internal.example.invalid:5432/app'))).toBe(
      true
    );
    expect(uriRule.test(uri('postgresql', pg, pg, 'localhost:5432/app'))).toBe(true);
  });

  it('flags a quoted password literal', () => {
    const line = ['password: ', "'", ['post', 'gres'].join(''), "'"].join('');
    expect(pwRule.test(line)).toBe(true);
  });

  it('does not flag secret, env or template references', () => {
    expect(uriRule.test('DATABASE_URL: ${{ secrets.DATABASE_URL }}')).toBe(false);
    expect(
      uriRule.test('DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@localhost:5432/db')
    ).toBe(false);
    expect(uriRule.test(uri('postgresql', '<user>', '<password>', 'localhost'))).toBe(false);
    expect(pwRule.test('password: ${{ secrets.DB_PASSWORD }}')).toBe(false);
  });
});
