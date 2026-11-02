/**
 * PG-207 architecture guards (SEC-05, CA-3, CA-12, W2).
 *
 * User mail leaves only through dispatchUserMail and the sender's own mailbox:
 * the old module-level outbound service with its mock fallback must not come
 * back, TLS verification is never switched off, and the email routers never
 * use adminTenantProcedure (it skips the CSRF and rate-limit middleware) or
 * write secrets in a way that bypasses the field-encryption extension.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../../../..');
const emailModule = resolve(__dirname, '..');
const adapterDirs = [
  join(repoRoot, 'packages/adapters/src/messaging/email'),
  join(repoRoot, 'packages/adapters/src/email'),
];

/** Production .ts files under `dir` (tests excluded: they name the patterns to forbid them). */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== '__tests__') out.push(...sourceFiles(path));
    } else if (name.endsWith('.ts') && !/\.(test|spec)\.ts$/.test(name)) {
      out.push(path);
    }
  }
  return out;
}

/** Source text without comments, so documentation naming a forbidden pattern does not trip a guard. */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');
}

function offenders(files: string[], pattern: RegExp): string[] {
  return files.filter((f) => pattern.test(code(f))).map((f) => relative(repoRoot, f));
}

const SECRET_COLUMNS = String.raw`(?:smtpPassword|imapPassword|refreshToken|codeVerifier|smtp_password|imap_password|refresh_token|code_verifier)`;

describe('PG-207 architecture guards', () => {
  const emailFiles = sourceFiles(emailModule);
  const adapterFiles = adapterDirs.flatMap((d) => sourceFiles(d));

  it('scans the real trees', () => {
    expect(emailFiles.map((f) => relative(emailModule, f))).toEqual(
      expect.arrayContaining(['inbound.router.ts', 'mailbox-sender.ts', 'email-mailbox.router.ts'])
    );
    expect(adapterFiles.some((f) => f.endsWith('smtp-provider.ts'))).toBe(true);
  });

  it('has no outbound-service singleton or mock fallback in the email module', () => {
    expect(
      offenders(emailFiles, /createOutboundEmailService|\buseMock\b|MockEmailProvider/)
    ).toEqual([]);
  });

  it('never disables TLS certificate verification', () => {
    expect(offenders([...emailFiles, ...adapterFiles], /rejectUnauthorized\s*:\s*false/)).toEqual(
      []
    );
  });

  it('never uses adminTenantProcedure in the email routers', () => {
    expect(offenders(emailFiles, /\badminTenantProcedure\b/)).toEqual([]);
  });

  it('writes secrets as plain values (encrypted by the extension), never via { set: }', () => {
    expect(
      offenders(emailFiles, new RegExp(String.raw`${SECRET_COLUMNS}\s*:\s*\{\s*set\s*:`))
    ).toEqual([]);
  });

  it('never names a secret column in raw SQL', () => {
    const secret = new RegExp(SECRET_COLUMNS);
    const leaking = emailFiles.filter((f) =>
      [
        ...code(f).matchAll(
          /\$(?:queryRaw|executeRaw)(?:Unsafe)?(?:<[^>]*>)?\s*(?:`([^`]*)`|\(([^)]*)\))/g
        ),
      ].some((m) => secret.test(m[1] ?? m[2] ?? ''))
    );
    expect(leaking.map((f) => relative(repoRoot, f))).toEqual([]);
    // The guard does see the raw queries that exist (the lease claim, the storage sum).
    expect(emailFiles.filter((f) => /\$queryRaw/.test(code(f))).length).toBeGreaterThan(0);
  });
});
