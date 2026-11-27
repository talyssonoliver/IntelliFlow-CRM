// @vitest-environment node
/**
 * PG-207 DoD: "Secrets MUST go through server-side tRPC, never in the client bundle."
 *
 * The API side is covered by apps/api/.../no-secret-leak.test.ts (no procedure returns a secret).
 * This guard covers the browser side, by reading source:
 *  1. the DTOs the browser receives carry no secret field (only `has...` booleans);
 *  2. the email pages and components never read a server-only environment variable and never
 *     import a server-only library (the field-encryption key, OAuth client secrets, SMTP/IMAP
 *     libraries, the database client);
 *  3. a secret field name appears in the web code only as a write-only form input, never as a
 *     property read off data the server returned.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../../../../..');
const webSrc = join(repoRoot, 'apps/web/src');
const validatorsSrc = join(repoRoot, 'packages/validators/src');

/** The email pages and components. Tests are excluded. */
const EMAIL_DIRS = [join(webSrc, 'app/email'), join(webSrc, 'components/email')];

/** Any other web file that calls an email tRPC router (hover card, sidebar...) is held to the same rules. */
const EMAIL_TRPC_CALL = /\btrpc\.email\w*\./;

/** The validator files whose DTOs are returned to the browser. */
const DTO_FILES = [
  'email-mailbox.ts',
  'email-settings.ts',
  'email-signatures.ts',
  // MailboxDto extends the two below, so a secret added there reaches the browser too.
  'smtp-account.ts',
  'smtp-endpoint.ts',
].map((f) => join(validatorsSrc, f));

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of names) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== '__tests__') out.push(...sourceFiles(path));
    } else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.(ts|tsx)$/.test(name)) {
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

const SECRET_FIELDS = [
  'smtpPassword',
  'imapPassword',
  'refreshToken',
  'codeVerifier',
  'accessToken',
];

/** Each `export interface XDto` / `export type XDto` with the text between its braces. */
function dtoBlocks(text: string): { name: string; body: string }[] {
  const blocks: { name: string; body: string }[] = [];
  for (const match of text.matchAll(/export (?:interface|type) (\w+Dto)\b/g)) {
    const open = text.indexOf('{', match.index);
    // A DTO block ends at the first closing brace that starts a line.
    const close = text.indexOf('\n}', open);
    if (open !== -1 && close !== -1)
      blocks.push({ name: match[1], body: text.slice(open + 1, close) });
  }
  return blocks;
}

/** The property names declared one level deep in a block body (`name: type` or `name?: type`). */
function propertyNames(body: string): string[] {
  const names: string[] = [];
  for (const line of body.split('\n')) {
    const colon = line.indexOf(':');
    if (colon === -1 || !line.startsWith('  ') || line.startsWith('   ')) continue;
    const name = line.slice(0, colon).trim().replace('?', '');
    if (/^\w+$/.test(name)) names.push(name);
  }
  return names;
}

/** A property that would hold a secret value (a `has...` boolean never does). */
const SECRET_PROPERTY = /password|secret|token|verifier|ciphertext|apikey|privatekey|credential/i;

describe('PG-207: secrets never reach the client bundle', () => {
  const clientFiles = [
    ...new Set([
      ...EMAIL_DIRS.flatMap((d) => sourceFiles(d)),
      ...sourceFiles(webSrc).filter((f) => EMAIL_TRPC_CALL.test(code(f))),
    ]),
  ];

  it('scans the real trees', () => {
    const names = clientFiles.map((f) => relative(webSrc, f).replaceAll('\\', '/'));
    expect(names).toEqual(
      expect.arrayContaining([
        'app/email/email-settings/EmailSettingsContent.tsx',
        'app/email/email-settings/components/SmtpMailboxForm.tsx',
      ])
    );
    for (const file of DTO_FILES) {
      expect(readFileSync(file, 'utf8')).toContain('Dto');
    }
  });

  it('returns no secret field in any DTO the browser receives', () => {
    const offenders: string[] = [];
    let interfaces = 0;
    for (const file of DTO_FILES) {
      const text = code(file);
      for (const dto of dtoBlocks(text)) {
        interfaces += 1;
        for (const name of propertyNames(dto.body)) {
          if (!name.startsWith('has') && SECRET_PROPERTY.test(name)) {
            offenders.push(`${relative(repoRoot, file)} ${dto.name}.${name}`);
          }
        }
      }
    }
    // Proves the regex really found the DTOs (a silent zero would pass the check below).
    expect(interfaces).toBeGreaterThanOrEqual(5);
    expect(offenders).toEqual([]);
  });

  it('keeps the write-only secret fields out of the response contract', () => {
    const mailboxDto = code(join(validatorsSrc, 'email-mailbox.ts')).match(
      /export interface MailboxDto\b[^{]*\{([\s\S]*?)\n\}/
    );
    expect(mailboxDto).not.toBeNull();
    for (const field of SECRET_FIELDS) {
      expect(mailboxDto?.[1]).not.toMatch(new RegExp(`\\b${field}\\b`));
    }
    // What the page may know instead: whether a secret is stored.
    expect(mailboxDto?.[1]).toMatch(/hasImapPassword/);
  });

  it('never reads a server-only environment variable in the email pages and components', () => {
    const offenders = clientFiles
      .filter((f) => {
        const text = code(f);
        // Any env read here is a build-time inline: only NEXT_PUBLIC_ names are meant for it.
        const reads = [...text.matchAll(/process\.env(?:\.|\[['"])([A-Z0-9_]+)/g)].map((m) => m[1]);
        // A destructured env (`const { X } = process.env`) hides the name: refuse it here.
        const lines = text.split('\n').map((l) => l.trim());
        if (lines.some((l) => l.endsWith('= process.env;') || l.endsWith('= process.env'))) {
          return true;
        }
        return (
          reads.some((name) => !name.startsWith('NEXT_PUBLIC_') && name !== 'NODE_ENV') ||
          /PRISMA_FIELD_ENCRYPTION_KEY|EMAIL_OAUTH_|EMAIL_BOUNCE_|_CLIENT_SECRET/.test(text)
        );
      })
      .map((f) => relative(webSrc, f));
    expect(offenders).toEqual([]);
  });

  it('never imports a server-only library in the email pages and components', () => {
    const offenders = clientFiles
      .filter((f) =>
        /from\s+['"](nodemailer|imapflow|mailparser|@intelliflow\/db|@intelliflow\/adapters)(\/[^'"]*)?['"]/.test(
          code(f)
        )
      )
      .map((f) => relative(webSrc, f));
    expect(offenders).toEqual([]);
  });

  it('never exposes an email secret through a NEXT_PUBLIC_ variable', () => {
    const exampleEnv = readFileSync(join(repoRoot, '.env.example'), 'utf8');
    const publicNames = exampleEnv
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('NEXT_PUBLIC_') && line.includes('='))
      .map((line) => line.slice(0, line.indexOf('=')).trim());
    expect(publicNames.length).toBeGreaterThan(0);
    expect(publicNames.filter((n) => /PASSWORD|SECRET|ENCRYPTION|OAUTH|SMTP|IMAP/.test(n))).toEqual(
      []
    );
  });

  it('uses a secret field name only as a form input, never as a property read off server data', () => {
    // `mailbox.smtpPassword` / `data?.refreshToken` would read a secret off what the server
    // returned. Form state (`draft.imapPassword`, `errors.smtpPassword`) and object keys are fine.
    const read = new RegExp(
      `\\b(mailbox|smtp|stored|data|row|result|dto|response|mine|company|settings)\\??\\.(${SECRET_FIELDS.join('|')})\\b`
    );
    const offenders = clientFiles.filter((f) => read.test(code(f))).map((f) => relative(webSrc, f));
    expect(offenders).toEqual([]);
  });
});
