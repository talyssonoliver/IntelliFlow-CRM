/**
 * Guards #1103: no tracked file names an SMTP host, an SMTP user name and a
 * password together.
 *
 * The shared rule smtp-credential-fields (.gitleaks/shared.toml) mirrors
 * GitGuardian's "SMTP credentials" detector, which fires on those identifiers
 * even when no value is present. The owner's rule is that if GitGuardian would
 * flag it, an adversary would too, and it gets no allowlist. So the mailbox code
 * keeps the endpoint fields (packages/validators/src/smtp-endpoint.ts) and the
 * account fields (smtp-account.ts) in separate modules.
 *
 * The gitleaks binary is not on every test runner, so this applies the rule's
 * own regex and path filter, read from shared.toml, to every tracked file. That
 * is the check system-audit's tree scan makes. It also proves the regex still
 * fires on the joined form and not on the split form. Identifiers are assembled
 * at runtime so this file does not trip the rule itself.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const RULE_ID = 'smtp-credential-fields';
const sharedToml = fs.readFileSync(path.join(REPO_ROOT, '.gitleaks', 'shared.toml'), 'utf8');

/** The rule's regex and path filter, as gitleaks reads them (Go `(?is)` → JS `is`). */
function ruleFromSharedToml(): { regex: RegExp; pathFilter: RegExp; allowedPaths: RegExp[] } {
  const start = sharedToml.indexOf(`id = "${RULE_ID}"`);
  if (start < 0) throw new Error(`rule ${RULE_ID} not found in .gitleaks/shared.toml`);
  const next = sharedToml.indexOf('\n[[rules]]', start);
  const block = sharedToml.slice(start, next < 0 ? undefined : next);
  const regex = /^regex\s*=\s*'''([\s\S]*?)'''/m.exec(block)?.[1];
  const pathFilter = /^path\s*=\s*'''([\s\S]*?)'''/m.exec(block)?.[1];
  if (!regex || !pathFilter) throw new Error(`regex or path missing for ${RULE_ID}`);
  const flags = /^\(\?([a-z]+)\)/.exec(regex)?.[1] ?? '';
  const allowedPaths = [...block.matchAll(/paths\s*=\s*\[([\s\S]*?)\]/g)].flatMap((m) =>
    [...m[1].matchAll(/'''([\s\S]*?)'''/g)].map((p) => new RegExp(p[1]))
  );
  return {
    regex: new RegExp(regex.replace(/^\(\?[a-z]+\)/, ''), flags),
    pathFilter: new RegExp(pathFilter),
    allowedPaths,
  };
}

const rule = ruleFromSharedToml();
const id = (...parts: string[]) => parts.join('');
const HOST = id('smtp', 'Host');
const USER = id('smtp', 'Username');
const SECRET = id('smtp', 'Pass', 'word');

describe(`${RULE_ID} rule`, () => {
  it('fires when the host, user name and password are named together', () => {
    const joined = `interface Mailbox {\n  ${HOST}: string;\n  ${USER}: string;\n  ${SECRET}: string;\n}`;
    expect(rule.regex.test(joined)).toBe(true);
  });

  it('does not fire on the endpoint half or the account half alone', () => {
    const endpoint = `interface Endpoint {\n  ${HOST}: string;\n  smtpPort: number;\n}`;
    const account = `interface Account {\n  ${USER}: string;\n  ${SECRET}: string;\n}`;
    expect(rule.regex.test(endpoint)).toBe(false);
    expect(rule.regex.test(account)).toBe(false);
  });
});

describe(`${RULE_ID} in tracked files`, () => {
  it('finds no tracked file that the rule flags', () => {
    const ls = spawnSync('git', ['ls-files', '-z'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    expect(ls.status).toBe(0);
    const files = ls.stdout
      .split('\0')
      .filter((f) => f && rule.pathFilter.test(f) && !rule.allowedPaths.some((p) => p.test(f)));
    expect(files.length).toBeGreaterThan(0);

    const flagged: string[] = [];
    for (const file of files) {
      const abs = path.join(REPO_ROOT, file);
      if (!fs.existsSync(abs)) continue;
      const text = fs.readFileSync(abs, 'utf8');
      if (!/smtp/i.test(text)) continue;
      const match = rule.regex.exec(text);
      if (match) flagged.push(`${file}:${text.slice(0, match.index).split('\n').length}`);
    }
    expect(flagged).toEqual([]);
  });
});
