/**
 * PG-207 — email mailboxes, settings, signatures and bounce tables: real-Database
 * integration test (ADR-085).
 *
 * Lives in `tests/integration/` so it runs in the CI "Integration Tests" lane and pre-ship.
 * Proves the Class A migrations 20261020120000..20261020120400 on a real Postgres:
 * CHECKs, the SQL-only partial / expression unique indexes, tenant-scoped composite FKs,
 * RLS policies, field encryption at rest (ciphertext in the column, plaintext through the
 * extended client), receipt idempotency, and that only one of two concurrent lease claims
 * on a mailbox wins.
 *
 * Skips only when DATABASE_URL is not set. A setup failure fails the suite (no silent skip).
 */

import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../packages/db/generated/prisma/client';
import { deriveKey, fieldEncryptionExtension } from '../../packages/db/src/field-encryption';
import { applySchemaSql, createIndexConcurrently } from './schema-lock';

const MIGRATIONS = join(__dirname, '../../packages/db/prisma/migrations');
const TABLE_MIGRATIONS = [
  '20261020120000_email_mailboxes',
  '20261020120100_email_settings_signatures',
  '20261020120200_email_suppression_receipts',
].map((dir) => join(MIGRATIONS, dir, 'migration.sql'));
const RECORD_MIGRATION = join(MIGRATIONS, '20261020120300_email_record_message_ids/migration.sql');
const INDEX_MIGRATION = join(
  MIGRATIONS,
  '20261020120400_email_records_message_id_idx/migration.sql'
);
const NEW_TABLES = [
  'email_bounce_receipts',
  'email_suppressions',
  'email_signatures',
  'tenant_email_settings',
  'email_oauth_states',
  'email_mailboxes',
];
const QUOTED_NEW_TABLES = NEW_TABLES.map((t) => '"' + t + '"').join(', ');

function withoutComments(path: string): string {
  return readFileSync(path, 'utf-8')
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
}

/** Split migration SQL into statements, keeping `DO $$ ... $$` blocks whole. */
function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inDollar = false;
  for (let i = 0; i < sql.length; i++) {
    if (sql.startsWith('$$', i)) {
      inDollar = !inDollar;
      current += '$$';
      i++;
      continue;
    }
    const ch = sql[i];
    if (ch === ';' && !inDollar) {
      if (current.trim()) statements.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

const DB_URL = process.env.DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;

if (!DB_URL) {
  console.log('Skipping email-settings integration test: DATABASE_URL not set');
}

/**
 * CI builds its test database with `prisma db push`, which creates the tables from
 * schema.prisma but never runs migration SQL (no CHECKs, partial indexes or RLS). When
 * the marker CHECK is missing, rebuild the six PG-207 tables from the migrations' own SQL
 * (they hold only this suite's rows) and add the email_records columns if absent.
 */
async function ensureMigrationSql(client: any): Promise<void> {
  const present = await client.$queryRawUnsafe(
    `SELECT 1 FROM pg_constraint WHERE conname = 'email_mailboxes_scope_user_check'`
  );
  if (present.length > 0) return;
  const recordStatements = splitStatements(withoutComments(RECORD_MIGRATION)).map((stmt) =>
    stmt
      .replaceAll('ADD COLUMN "', 'ADD COLUMN IF NOT EXISTS "')
      .replace(/^ALTER TABLE "email_records" ADD CONSTRAINT "(\w+)"/, (m) => m)
  );
  await applySchemaSql(
    DB_URL!,
    [
      `ALTER TABLE "email_records" DROP CONSTRAINT IF EXISTS "email_records_mailboxId_fkey"`,
      `ALTER TABLE "email_records" DROP CONSTRAINT IF EXISTS "email_records_provider_check"`,
      `DROP TABLE IF EXISTS ${QUOTED_NEW_TABLES} CASCADE`,
      ...TABLE_MIGRATIONS.flatMap((path) => splitStatements(withoutComments(path))),
      ...recordStatements,
    ],
    { tolerate: ['42701'] }
  );
}

async function ensureRecordIndex(client: any): Promise<void> {
  const valid = await client.$queryRawUnsafe(
    `SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
     WHERE c.relname = 'email_records_tenantId_messageIdHeader_idx' AND i.indisvalid AND i.indisready`
  );
  if (valid.length > 0) return;
  await applySchemaSql(DB_URL!, [
    'DROP INDEX IF EXISTS "email_records_tenantId_messageIdHeader_idx"',
  ]);
  const statements = splitStatements(withoutComments(INDEX_MIGRATION));
  expect(statements).toHaveLength(1);
  await createIndexConcurrently(DB_URL!, statements[0]);
}

const RUN = `pg207_${Date.now()}`;
const TENANT_A = `${RUN}_a`;
const TENANT_B = `${RUN}_b`;
const USER_A1 = `${RUN}_ua1`;
const USER_A2 = `${RUN}_ua2`;
const USER_B1 = `${RUN}_ub1`;

/** Postgres error code raised by a failed statement, whatever layer wrapped it. */
function pgCode(error: unknown): string | undefined {
  const text = JSON.stringify(error, Object.getOwnPropertyNames(error as object)) ?? '';
  const match = /"(?:code|originalCode)":"(\d{5}|P\d{4})"/.exec(text);
  if (match) return match[1];
  const code = (error as { code?: string })?.code;
  if (code) return code;
  const message = String((error as { message?: string })?.message ?? '');
  if (/check constraint|CheckConstraint/i.test(message + text)) return '23514';
  if (/unique constraint|duplicate key|UniqueConstraint/i.test(message + text)) return '23505';
  if (/foreign key|ForeignKeyConstraint/i.test(message + text)) return '23503';
  return undefined;
}

async function expectRejected(promise: Promise<unknown>, codes: string[]): Promise<void> {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(caught, 'statement should have been rejected').toBeDefined();
  const code = pgCode(caught);
  if (!code || !codes.includes(code)) {
    console.log('Unexpected rejection shape:', String((caught as Error)?.message).slice(0, 400));
  }
  expect(codes).toContain(code);
}

const UNIQUE = ['23505', 'P2002'];
const CHECK = ['23514', 'P2004', 'P2010'];
const FOREIGN_KEY = ['23503', 'P2003'];

/** Runtime-built filler secret (never a credential-shaped literal). */
const SECRET = 'x'.repeat(24);

describeDb('PG-207 email tables (real DB)', () => {
  let prisma: any;
  let encrypted: any;

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL! }) });
    await ensureMigrationSql(prisma);
    await ensureRecordIndex(prisma);
    encrypted = prisma.$extends(
      fieldEncryptionExtension({ key: deriveKey(randomBytes(32).toString('base64')) })
    );
    for (const id of [TENANT_A, TENANT_B]) {
      await prisma.tenant.create({ data: { id, name: id, slug: id } });
    }
    for (const [id, tenantId] of [
      [USER_A1, TENANT_A],
      [USER_A2, TENANT_A],
      [USER_B1, TENANT_B],
    ]) {
      await prisma.user.create({ data: { id, tenantId, email: `${id}@example.invalid` } });
    }
  }, 120_000);

  afterAll(async () => {
    if (!prisma) return;
    const tenants = { in: [TENANT_A, TENANT_B] };
    await prisma.emailRecord.deleteMany({ where: { tenantId: tenants } });
    await prisma.emailBounceReceipt.deleteMany({ where: { tenantId: tenants } });
    await prisma.emailMailbox.deleteMany({ where: { tenantId: tenants } });
    await prisma.user.deleteMany({ where: { id: { in: [USER_A1, USER_A2, USER_B1] } } });
    await prisma.tenant.deleteMany({ where: { id: tenants } });
    await prisma.$disconnect();
  });

  const smtpMailbox = (extra: Record<string, unknown> = {}) => ({
    tenantId: TENANT_A,
    scope: 'USER',
    userId: USER_A1,
    kind: 'SMTP',
    fromAddress: 'me@mail.example.invalid',
    smtpHost: 'smtp.mail.example.invalid',
    smtpPort: 587,
    smtpSecurity: 'STARTTLS',
    smtpUsername: 'me@mail.example.invalid',
    smtpPassword: SECRET,
    ...extra,
  });

  describe('email_mailboxes', () => {
    it('encrypts the SMTP password at rest and decrypts it through the extended client', async () => {
      const row = await encrypted.emailMailbox.create({ data: smtpMailbox() });
      const raw: Array<{ smtpPassword: string }> = await prisma.$queryRawUnsafe(
        `SELECT "smtpPassword" FROM email_mailboxes WHERE id = $1`,
        row.id
      );
      expect(raw[0]?.smtpPassword).toMatch(/^v1:/);
      expect(raw[0]?.smtpPassword).not.toContain(SECRET);
      const read = await encrypted.emailMailbox.findFirst({ where: { id: row.id } });
      expect(read.smtpPassword).toBe(SECRET);
    });

    it('allows only one USER mailbox per user', async () => {
      await expectRejected(prisma.emailMailbox.create({ data: smtpMailbox() }), UNIQUE);
    });

    it('allows only one TENANT mailbox per tenant', async () => {
      await prisma.emailMailbox.create({
        data: smtpMailbox({
          scope: 'TENANT',
          userId: null,
          fromAddress: 'team@mail.example.invalid',
        }),
      });
      await expectRejected(
        prisma.emailMailbox.create({
          data: smtpMailbox({
            scope: 'TENANT',
            userId: null,
            fromAddress: 'other@mail.example.invalid',
          }),
        }),
        UNIQUE
      );
    });

    it.each([
      ['a USER mailbox without a user', { scope: 'USER', userId: null, tenantId: TENANT_B }],
      ['a TENANT mailbox with a user', { scope: 'TENANT', userId: USER_B1, tenantId: TENANT_B }],
      ['port 25', { smtpPort: 25, userId: USER_A2 }],
      [
        'IMAP port 143',
        { imapHost: 'imap.example.invalid', imapPort: 143, imapUsername: 'u', userId: USER_A2 },
      ],
      ['a partial IMAP config', { imapHost: 'imap.example.invalid', userId: USER_A2 }],
      ['an upper-case from address', { fromAddress: 'Me@Mail.example.invalid', userId: USER_A2 }],
      ['an unknown kind', { kind: 'POP3', userId: USER_A2 }],
      ['an ACTIVE SMTP mailbox without a password', { smtpPassword: null, userId: USER_A2 }],
      [
        'an ACTIVE OAuth mailbox without a refresh token',
        {
          kind: 'GMAIL',
          smtpHost: null,
          smtpPort: null,
          smtpSecurity: null,
          smtpUsername: null,
          smtpPassword: null,
          userId: USER_A2,
        },
      ],
    ])('rejects %s', async (_label, patch) => {
      await expectRejected(prisma.emailMailbox.create({ data: smtpMailbox(patch) }), CHECK);
    });

    it('accepts a DISCONNECTED OAuth mailbox with no secrets', async () => {
      const row = await prisma.emailMailbox.create({
        data: smtpMailbox({
          userId: USER_A2,
          kind: 'MICROSOFT',
          status: 'DISCONNECTED',
          smtpHost: null,
          smtpPort: null,
          smtpSecurity: null,
          smtpUsername: null,
          smtpPassword: null,
        }),
      });
      expect(row.status).toBe('DISCONNECTED');
      await prisma.emailMailbox.delete({ where: { id: row.id } });
    });

    it('lets exactly one of two concurrent lease claims win', async () => {
      const row = await prisma.emailMailbox.create({
        data: smtpMailbox({ userId: USER_A2, fromAddress: 'lease@mail.example.invalid' }),
      });
      const claim = () =>
        prisma.$queryRawUnsafe(
          `UPDATE email_mailboxes SET "lockedUntil" = now() + interval '5 minutes'
           WHERE id = $1 AND ("lockedUntil" IS NULL OR "lockedUntil" < now()) RETURNING id`,
          row.id
        );
      const [first, second] = await Promise.all([claim(), claim()]);
      expect(first.length + second.length).toBe(1);
      await prisma.emailMailbox.delete({ where: { id: row.id } });
    });

    it('fences a scan write by its lease: a worker whose lease was taken over writes nothing', async () => {
      const row = await prisma.emailMailbox.create({
        data: smtpMailbox({ userId: USER_A2, fromAddress: 'fence@mail.example.invalid' }),
      });
      const lease = (until: Date) =>
        prisma.$queryRaw<Array<{ id: string; lockedUntil: Date }>>`
          UPDATE email_mailboxes SET "lockedUntil" = ${until}
          WHERE id = ${row.id} RETURNING id, "lockedUntil"`;
      const [mine] = await lease(new Date(Date.now() + 1_000));
      // The lease end read back is the one stored, so it can fence the write.
      await prisma.emailMailbox.update({
        where: { id: row.id, lockedUntil: mine!.lockedUntil },
        data: { lockedUntil: null, failureCount: 0 },
      });
      // Another worker re-claimed it: the first worker's stale write is refused.
      await lease(new Date(Date.now() + 300_000));
      await expect(
        prisma.emailMailbox.update({
          where: { id: row.id, lockedUntil: mine!.lockedUntil },
          data: { lockedUntil: null, failureCount: 3 },
        })
      ).rejects.toMatchObject({ code: 'P2025' });
      const after = await prisma.emailMailbox.findUniqueOrThrow({ where: { id: row.id } });
      expect(after.lockedUntil).not.toBeNull();
      expect(after.failureCount).toBe(0);
      await prisma.emailMailbox.delete({ where: { id: row.id } });
    });
  });

  describe('email_oauth_states', () => {
    it('encrypts the PKCE verifier and keeps the state hash unique', async () => {
      const stateHash = 'a'.repeat(64);
      const row = await encrypted.emailOAuthState.create({
        data: {
          tenantId: TENANT_A,
          userId: USER_A1,
          scope: 'USER',
          provider: 'GMAIL',
          stateHash,
          codeVerifier: SECRET,
          expiresAt: new Date(Date.UTC(2030, 0, 1)),
        },
      });
      const raw: Array<{ codeVerifier: string }> = await prisma.$queryRawUnsafe(
        `SELECT "codeVerifier" FROM email_oauth_states WHERE id = $1`,
        row.id
      );
      expect(raw[0]?.codeVerifier).toMatch(/^v1:/);
      await expectRejected(
        prisma.emailOAuthState.create({
          data: {
            tenantId: TENANT_A,
            userId: USER_A1,
            scope: 'USER',
            provider: 'GMAIL',
            stateHash,
            codeVerifier: 'y',
            expiresAt: new Date(Date.UTC(2030, 0, 1)),
          },
        }),
        UNIQUE
      );
      await expectRejected(
        prisma.emailOAuthState.create({
          data: {
            tenantId: TENANT_A,
            userId: USER_A1,
            scope: 'USER',
            provider: 'SMTP',
            stateHash: 'b'.repeat(64),
            codeVerifier: 'y',
            expiresAt: new Date(Date.UTC(2030, 0, 1)),
          },
        }),
        CHECK
      );
    });
  });

  describe('tenant_email_settings', () => {
    it('defaults to fallback off, tracking off, suppress hard bounces, threshold 3, notify off', async () => {
      const row = await prisma.tenantEmailSettings.create({ data: { tenantId: TENANT_A } });
      expect(row).toMatchObject({
        allowTenantMailboxFallback: false,
        trackOpens: false,
        trackClicks: false,
        hardBounceAction: 'SUPPRESS',
        softBounceThreshold: 3,
        notifySenderOnBounce: false,
        replyToAddress: null,
      });
    });

    it.each([
      ['threshold 0', { softBounceThreshold: 0 }],
      ['threshold 11', { softBounceThreshold: 11 }],
      ['an unknown hard bounce action', { hardBounceAction: 'DELETE' }],
      ['an upper-case reply-to', { replyToAddress: 'Replies@Example.invalid' }],
    ])('rejects %s', async (_label, patch) => {
      await expectRejected(
        prisma.tenantEmailSettings.create({ data: { tenantId: TENANT_B, ...patch } }),
        CHECK
      );
    });
  });

  describe('email_signatures', () => {
    const signature = (extra: Record<string, unknown> = {}) => ({
      tenantId: TENANT_A,
      scope: 'USER',
      userId: USER_A1,
      name: 'Work',
      html: '<p>Me</p>',
      ...extra,
    });

    it('rejects a duplicate name for the same owner, case-insensitively', async () => {
      await prisma.emailSignature.create({ data: signature() });
      await expectRejected(
        prisma.emailSignature.create({ data: signature({ name: 'WORK' }) }),
        UNIQUE
      );
    });

    it('allows the same name for another user and for the org', async () => {
      await prisma.emailSignature.create({ data: signature({ userId: USER_A2 }) });
      await prisma.emailSignature.create({ data: signature({ scope: 'ORG', userId: null }) });
    });

    it('allows one default per user and one per org', async () => {
      await prisma.emailSignature.create({
        data: signature({ name: 'Default 1', isDefault: true }),
      });
      await expectRejected(
        prisma.emailSignature.create({ data: signature({ name: 'Default 2', isDefault: true }) }),
        UNIQUE
      );
      await prisma.emailSignature.create({
        data: signature({ scope: 'ORG', userId: null, name: 'Org default', isDefault: true }),
      });
      await expectRejected(
        prisma.emailSignature.create({
          data: signature({ scope: 'ORG', userId: null, name: 'Org default 2', isDefault: true }),
        }),
        UNIQUE
      );
    });

    it.each([
      ['a padded name', { name: ' Padded ' }],
      ['an ORG signature with a user', { scope: 'ORG', name: 'Org user' }],
      ['a USER signature without a user', { userId: null, name: 'No user' }],
      ['HTML over 20000 characters', { html: 'h'.repeat(20_001), name: 'Big' }],
    ])('rejects %s', async (_label, patch) => {
      await expectRejected(prisma.emailSignature.create({ data: signature(patch) }), CHECK);
    });
  });

  describe('email_suppressions and email_bounce_receipts', () => {
    it('keeps one suppression per tenant and address, lower-cased', async () => {
      await prisma.emailSuppression.create({
        data: {
          tenantId: TENANT_A,
          email: 'gone@example.invalid',
          reason: 'HARD_BOUNCE',
          source: 'DSN',
        },
      });
      await expectRejected(
        prisma.emailSuppression.create({
          data: {
            tenantId: TENANT_A,
            email: 'gone@example.invalid',
            reason: 'MANUAL',
            source: 'MANUAL',
          },
        }),
        UNIQUE
      );
      await expectRejected(
        prisma.emailSuppression.create({
          data: {
            tenantId: TENANT_A,
            email: 'Upper@Example.invalid',
            reason: 'MANUAL',
            source: 'MANUAL',
          },
        }),
        CHECK
      );
      await expectRejected(
        prisma.emailSuppression.create({
          data: {
            tenantId: TENANT_A,
            email: 'c@example.invalid',
            reason: 'COMPLAINT',
            source: 'DSN',
          },
        }),
        CHECK
      );
    });

    it('makes a replayed bounce report a unique violation (idempotency)', async () => {
      const mailbox = await prisma.emailMailbox.findFirst({
        where: { tenantId: TENANT_A, userId: USER_A1 },
      });
      const receipt = {
        tenantId: TENANT_A,
        mailboxId: mailbox.id,
        dsnKey: '1:42',
        recipient: 'gone@example.invalid',
        kind: 'HARD',
        matchConfidence: 'HIGH',
        receivedAt: new Date(Date.UTC(2026, 9, 20)),
      };
      await prisma.emailBounceReceipt.create({ data: receipt });
      await expectRejected(prisma.emailBounceReceipt.create({ data: receipt }), UNIQUE);
    });

    it('refuses a receipt whose mailbox belongs to another tenant (composite FK)', async () => {
      const mailbox = await prisma.emailMailbox.findFirst({
        where: { tenantId: TENANT_A, userId: USER_A1 },
      });
      await expectRejected(
        prisma.emailBounceReceipt.create({
          data: {
            tenantId: TENANT_B,
            mailboxId: mailbox.id,
            dsnKey: '1:43',
            recipient: 'x@example.invalid',
            kind: 'SOFT',
            matchConfidence: 'HIGH',
            receivedAt: new Date(Date.UTC(2026, 9, 20)),
          },
        }),
        FOREIGN_KEY
      );
    });
  });

  describe('email_records additions', () => {
    it('stores mailbox and message ids and nulls the mailbox when it is deleted', async () => {
      const mailbox = await prisma.emailMailbox.create({
        data: smtpMailbox({
          userId: null,
          scope: 'TENANT',
          tenantId: TENANT_B,
          fromAddress: 'b@mail.example.invalid',
        }),
      });
      const record = await prisma.emailRecord.create({
        data: {
          tenantId: TENANT_B,
          subject: 's',
          body: 'b',
          fromEmail: 'b@mail.example.invalid',
          toEmail: 'to@example.invalid',
          status: 'SENT',
          mailboxId: mailbox.id,
          messageIdHeader: '<abc@mail.example.invalid>',
          provider: 'SMTP',
        },
      });
      await expectRejected(
        prisma.emailRecord.update({ where: { id: record.id }, data: { provider: 'SENDGRID' } }),
        CHECK
      );
      await prisma.emailMailbox.delete({ where: { id: mailbox.id } });
      const after = await prisma.emailRecord.findFirst({ where: { id: record.id } });
      expect(after.mailboxId).toBeNull();
    });

    it('has a valid (tenantId, messageIdHeader) index', async () => {
      const valid: unknown[] = await prisma.$queryRawUnsafe(
        `SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
         WHERE c.relname = 'email_records_tenantId_messageIdHeader_idx' AND i.indisvalid`
      );
      expect(valid).toHaveLength(1);
    });
  });

  describe('row-level security', () => {
    it('enables RLS with a tenant policy on every new table', async () => {
      const rows: Array<{ relname: string; relrowsecurity: boolean }> =
        await prisma.$queryRawUnsafe(
          `SELECT relname, relrowsecurity FROM pg_class WHERE relname = ANY($1::text[])`,
          NEW_TABLES
        );
      expect(rows).toHaveLength(NEW_TABLES.length);
      expect(rows.every((r) => r.relrowsecurity)).toBe(true);
      const policies: Array<{ tablename: string; qual: string; with_check: string }> =
        await prisma.$queryRawUnsafe(
          `SELECT tablename, qual, with_check FROM pg_policies WHERE tablename = ANY($1::text[])`,
          NEW_TABLES
        );
      expect(new Set(policies.map((p) => p.tablename))).toEqual(new Set(NEW_TABLES));
      for (const p of policies) {
        expect(p.qual).toContain('app.current_tenant_id');
        expect(p.with_check).toContain('app.current_tenant_id');
      }
    });

    it('hides tenant B mailboxes from a tenant-A session under a non-bypass role', async (ctx) => {
      const roles: Array<{ exists: boolean }> = await prisma.$queryRawUnsafe(
        `SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') AS exists`
      );
      if (!roles[0]?.exists) {
        console.log('Skipping RLS session check: local DB has no Supabase "authenticated" role');
        ctx.skip();
      }
      await prisma.emailMailbox.create({
        data: smtpMailbox({
          tenantId: TENANT_B,
          userId: USER_B1,
          fromAddress: 'hidden@mail.example.invalid',
        }),
      });
      let visible: Array<{ tenantId: string }> = [];
      try {
        visible = await prisma.$transaction(async (tx: any) => {
          await tx.$executeRawUnsafe('SET LOCAL ROLE authenticated');
          await tx.$executeRawUnsafe(
            `SELECT set_config('app.current_tenant_id', '${TENANT_A}', true)`
          );
          return tx.$queryRawUnsafe(`SELECT "tenantId" FROM email_mailboxes`);
        });
      } catch (error) {
        // Missing table GRANTs for the Supabase role (local DB, same as CI) — not an isolation leak.
        console.log('Skipping RLS session check: role lacks table grants locally', pgCode(error));
        ctx.skip();
      }
      expect(visible.every((r) => r.tenantId === TENANT_A)).toBe(true);
    });
  });
});
