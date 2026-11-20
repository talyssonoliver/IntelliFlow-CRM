/**
 * email_records.provider accepts 'RESEND': real-Database integration test (MVP-011).
 *
 * The COA send importer (tools/scripts/import-coa-sends.ts) writes provider RESEND. The CHECK on
 * "email_records"."provider" allowed only SMTP, GMAIL, MICROSOFT and ZOHO, so `--apply` stopped on
 * production with `violates check constraint "email_records_provider_check"`. Its dry run never
 * inserts and its unit tests use a fake database that does not enforce constraints, so nothing caught
 * it. This suite proves two Class A migrations on a real Postgres and runs the importer's own insert
 * path (`importCoaSends`, a real Prisma client) against the result:
 *
 *   20261120140000_email_records_provider_resend           adds the wider check NOT VALID
 *   20261120140100_email_records_provider_resend_validate  validates it, drops the old one, renames it
 *
 * Skips only when DATABASE_URL is not set. CI builds its test database with `prisma db push`, which
 * creates no CHECK, so the suite first puts the previous check in place (what production has), proves
 * RESEND is refused by it, then applies the two migrations' own SQL.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../packages/db/generated/prisma/client';
import { applySchemaSql } from './schema-lock';
import { importCoaSends, type CoaSend, type CoaSource } from '../../tools/scripts/import-coa-sends';

const MIGRATIONS = join(__dirname, '../../packages/db/prisma/migrations');
const ADD_NEW = join(MIGRATIONS, '20261120140000_email_records_provider_resend/migration.sql');
const VALIDATE = join(
  MIGRATIONS,
  '20261120140100_email_records_provider_resend_validate/migration.sql'
);

/** What production had before these migrations (20261115140000_email_mailbox_zoho). */
const PREVIOUS_CHECK =
  `ALTER TABLE "email_records" ADD CONSTRAINT "email_records_provider_check" ` +
  `CHECK ("provider" IS NULL OR "provider" IN ('SMTP', 'GMAIL', 'MICROSOFT', 'ZOHO')) NOT VALID`;

function withoutComments(path: string): string {
  return readFileSync(path, 'utf-8')
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
}

function statements(path: string): string[] {
  return withoutComments(path)
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

const DB_URL = process.env.DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;

if (!DB_URL) {
  console.log('Skipping email-records-provider-resend integration test: DATABASE_URL not set');
}

const RUN = `resend_${Date.now()}`;
const TENANT = `${RUN}_t`;
const USER = `${RUN}_u`;
const LEAD_EMAIL = `${RUN}-lead@example.invalid`;

function checkViolation(error: unknown): boolean {
  const text = JSON.stringify(error, Object.getOwnPropertyNames(error as object)) ?? '';
  return /23514|email_records_provider_check|check constraint/i.test(text);
}

describeDb('email_records provider RESEND (real DB)', () => {
  let prisma: any;

  const record = (provider: string | null, messageId: string) => ({
    tenantId: TENANT,
    subject: 'Hello',
    body: '<p>Hi</p>',
    fromEmail: 'sender@example.invalid',
    toEmail: LEAD_EMAIL,
    status: 'SENT',
    provider,
    providerMessageId: messageId,
  });

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL! }) });
    // One transaction under the shared schema lock: the table is never without a check, and the
    // other email suites (which expect an unknown provider to be refused) never see a gap.
    await applySchemaSql(DB_URL!, [
      `ALTER TABLE "email_records" DROP CONSTRAINT IF EXISTS "email_records_provider_check"`,
      `ALTER TABLE "email_records" DROP CONSTRAINT IF EXISTS "email_records_provider_check_v2"`,
      PREVIOUS_CHECK,
    ]);
    await prisma.tenant.create({ data: { id: TENANT, name: TENANT, slug: TENANT } });
    await prisma.user.create({
      data: { id: USER, tenantId: TENANT, email: `${USER}@example.invalid` },
    });
  }, 120_000);

  afterAll(async () => {
    if (!prisma) return;
    await prisma.leadActivity.deleteMany({ where: { tenantId: TENANT } });
    await prisma.emailRecord.deleteMany({ where: { tenantId: TENANT } });
    await prisma.lead.deleteMany({ where: { tenantId: TENANT } });
    await prisma.user.deleteMany({ where: { id: USER } });
    await prisma.tenant.deleteMany({ where: { id: TENANT } });
    await prisma.$disconnect();
  });

  it('is refused by the previous check, which is the production failure', async () => {
    let caught: unknown;
    try {
      await prisma.emailRecord.create({ data: record('RESEND', `${RUN}-before`) });
    } catch (error) {
      caught = error;
    }
    expect(caught, 'RESEND must be refused before the migrations').toBeDefined();
    expect(checkViolation(caught)).toBe(true);
  });

  it('applies both migrations, and no old or temporary check is left behind', async () => {
    await applySchemaSql(
      DB_URL!,
      statements(ADD_NEW).filter((s) => !s.startsWith('SET'))
    );
    // Between the two migrations the new check is NOT VALID and the old one still stands.
    const between = await prisma.$queryRawUnsafe(
      `SELECT conname, convalidated FROM pg_constraint
       WHERE conrelid = '"email_records"'::regclass AND conname LIKE 'email_records_provider_check%'
       ORDER BY conname`
    );
    expect(between).toEqual([
      { conname: 'email_records_provider_check', convalidated: false },
      { conname: 'email_records_provider_check_v2', convalidated: false },
    ]);

    await applySchemaSql(
      DB_URL!,
      statements(VALIDATE).filter((s) => !s.startsWith('SET'))
    );
    const after = await prisma.$queryRawUnsafe(
      `SELECT conname, convalidated, pg_get_constraintdef(oid) AS def FROM pg_constraint
       WHERE conrelid = '"email_records"'::regclass AND conname LIKE 'email_records_provider_check%'`
    );
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ conname: 'email_records_provider_check', convalidated: true });
    expect(after[0].def).toContain('RESEND');
  });

  it('still refuses a provider that is not allowed, and accepts every allowed one and none', async () => {
    let caught: unknown;
    try {
      await prisma.emailRecord.create({ data: record('SENDGRID', `${RUN}-bad`) });
    } catch (error) {
      caught = error;
    }
    expect(checkViolation(caught)).toBe(true);

    for (const provider of ['SMTP', 'GMAIL', 'MICROSOFT', 'ZOHO', 'RESEND', null]) {
      await expect(
        prisma.emailRecord.create({ data: record(provider, `${RUN}-ok-${provider}`) })
      ).resolves.toBeDefined();
    }
  });

  it('runs the COA importer insert against the real database: the record and the timeline entry', async () => {
    await prisma.lead.create({
      data: {
        tenantId: TENANT,
        ownerId: USER,
        email: LEAD_EMAIL,
        firstName: 'Robert',
        lastName: 'Example',
      },
    });
    const send: CoaSend = {
      id: `${RUN}-draft`,
      subject: 'Following up',
      body: '<p>Hello Robert</p>',
      sentAt: new Date('2026-11-18T09:16:00.000Z'),
      messageId: `${RUN}-resend-message`,
      status: 'SENT',
      sequenceNo: 2,
      updatedAt: new Date('2026-11-18T09:16:00.000Z'),
      recipients: [LEAD_EMAIL],
    };
    const source: CoaSource = { loadSends: async () => [send] };
    const options = {
      tenantId: TENANT,
      from: 'sender@example.invalid',
      apply: true,
      target: { host: 'localhost', local: true },
    };

    const result = await importCoaSends(prisma, source, options);

    expect(result).toMatchObject({ read: 1, created: 1, alreadyImported: 0 });
    const rows = await prisma.emailRecord.findMany({
      where: { tenantId: TENANT, providerMessageId: send.messageId },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ provider: 'RESEND', status: 'SENT', toEmail: LEAD_EMAIL });
    const activities = await prisma.leadActivity.findMany({ where: { tenantId: TENANT } });
    expect(activities).toHaveLength(1);
    expect(activities[0].metadata).toMatchObject({ emailRecordId: rows[0].id });

    // Idempotent: a second run writes nothing more.
    const again = await importCoaSends(prisma, source, options);
    expect(again).toMatchObject({ created: 0, alreadyImported: 1 });
    expect(
      await prisma.emailRecord.count({
        where: { tenantId: TENANT, providerMessageId: send.messageId },
      })
    ).toBe(1);
  });
});
