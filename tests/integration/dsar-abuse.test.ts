/**
 * PG-203 DSAR owner ruling Q24 - abuse limits, real-Database integration test.
 *
 * Proves on a real Postgres, through the Prisma adapter and the SLA sweep's store:
 *  1. the per-firm daily cap on public submissions (counted under the tenant lock, staff rows
 *     and rows older than 24 h not counted, other firms unaffected);
 *  2. the purge of public requests nobody confirmed (expired more than 7 days ago), in
 *     bounded batches, across firms, keeping fresh pending, verified and staff rows;
 *  3. the admin list leaving expired unverified requests out.
 *
 * Skips cleanly (with a visible reason) when DATABASE_URL is not set.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../packages/db/generated/prisma/client';
import { PrismaDsarRepository } from '../../packages/adapters/src/repositories/PrismaDsarRepository';
import {
  createPrismaDsarSlaStore,
  runDsarSlaSweep,
  type DsarSlaDeps,
  type DsarSlaPrisma,
} from '../../apps/api/src/modules/privacy/dsar-sla-scheduler';
import { DSAR_PURGE_SUITE_LOCK_KEY, applySchemaSql, holdSuiteLock } from './schema-lock';

const MIGRATION = join(
  __dirname,
  '../../packages/db/prisma/migrations/20261022120000_dsar_requests/migration.sql'
);

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
  console.log('Skipping DSAR abuse integration test: DATABASE_URL not set');
}

/** Already exists (type, constraint, policy), duplicate column, duplicate relation. */
const ALREADY_THERE = ['42710', '42701', '42P07'];

/** Same probe and rebuild as tests/integration/dsar.test.ts (CI builds with `db push`). */
async function ensureMigrationSql(client: any): Promise<string | null> {
  const tables: unknown[] = await client.$queryRawUnsafe(
    `SELECT 1 FROM pg_class WHERE relname = 'dsar_requests'`
  );
  if (tables.length === 0) return 'dsar_requests does not exist (schema not applied)';
  const present: unknown[] = await client.$queryRawUnsafe(
    `SELECT 1 FROM pg_constraint WHERE conname = 'dsar_requests_staff_identity_check'`
  );
  if (present.length > 0) return null;
  const sql = readFileSync(MIGRATION, 'utf-8')
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  const statements = [
    'DROP TABLE IF EXISTS "dsar_requests", "processing_restrictions" CASCADE',
    ...splitStatements(sql).filter((s) => !/^SET LOCAL/i.test(s)),
  ];
  await applySchemaSql(DB_URL!, statements, { tolerate: ALREADY_THERE });
  return null;
}

const RUN = `pg203x_${Date.now()}_${randomBytes(3).toString('hex')}`;
const TENANT_A = `${RUN}_a`;
const TENANT_B = `${RUN}_b`;
const TENANTS = [TENANT_A, TENANT_B];
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const CAPS = {
  perTenantEmailPerDay: 3,
  perIpPerHour: 10,
  globalEmailPerDay: 3,
  perTenantPerDay: 50,
  resendCooldownMinutes: 60,
};

describeDb('PG-203 DSAR abuse limits (real DB)', () => {
  let prisma: any;
  let dbReady = false;
  let dsars: PrismaDsarRepository;

  beforeEach((ctx) => {
    if (!dbReady) ctx.skip();
  });

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL! }) });
    const skipReason = await ensureMigrationSql(prisma);
    if (skipReason) {
      console.log(`Skipping DSAR abuse integration test: ${skipReason}`);
      return;
    }
    // Sweep tenants left by crashed runs of this suite (older than one day); FKs cascade.
    await prisma.$executeRawUnsafe(
      `DELETE FROM tenants WHERE id LIKE 'pg203x\\_%' AND id < $1`,
      `pg203x_${Date.now() - DAY}`
    );
    await prisma.tenant.create({ data: { id: TENANT_A, name: 'Smith Law', slug: TENANT_A } });
    await prisma.tenant.create({ data: { id: TENANT_B, name: 'Jones Law', slug: TENANT_B } });
    dsars = new PrismaDsarRepository(prisma);
    dbReady = true;
  });

  beforeEach(async () => {
    if (dbReady) await prisma.dsarRequest.deleteMany({ where: { tenantId: { in: TENANTS } } });
  });

  afterAll(async () => {
    if (!prisma) return;
    if (dbReady) {
      await prisma.dsarRequest.deleteMany({ where: { tenantId: { in: TENANTS } } });
      await prisma.tenant.deleteMany({ where: { id: { in: TENANTS } } });
    }
    await prisma.$disconnect();
  });

  const uniqueEmail = () => `${RUN}-${randomBytes(4).toString('hex')}@example.invalid`;

  const newPublic = (overrides: Record<string, unknown> = {}) => ({
    tenantId: TENANT_A,
    type: 'ACCESS' as const,
    subjectEmail: uniqueEmail(),
    capEmailHash: randomBytes(32).toString('hex'),
    details: null,
    objectionScope: null,
    ipHash: null,
    verificationTokenHash: '1'.repeat(64),
    verificationExpiresAt: new Date(Date.now() + DAY),
    ...overrides,
  });

  /** One row straight into the table, overriding a valid public-form default. */
  async function seed(columns: Record<string, unknown> = {}): Promise<string> {
    const row = await prisma.dsarRequest.create({
      data: {
        tenantId: TENANT_A,
        type: 'ACCESS',
        source: 'PUBLIC_FORM',
        status: 'PENDING_VERIFICATION',
        subjectEmail: uniqueEmail(),
        capEmailHash: randomBytes(32).toString('hex'),
        ...columns,
      },
      select: { id: true },
    });
    return row.id;
  }

  const idsPresent = async (ids: string[]): Promise<string[]> =>
    (
      (await prisma.dsarRequest.findMany({
        where: { id: { in: ids } },
        select: { id: true },
      })) as Array<{ id: string }>
    ).map((r) => r.id);

  describe('per-firm daily cap (Q24)', () => {
    async function fillFirm(
      tenantId: string,
      count: number,
      columns: Record<string, unknown> = {}
    ) {
      await prisma.dsarRequest.createMany({
        data: Array.from({ length: count }, () => ({
          tenantId,
          type: 'ACCESS',
          source: 'PUBLIC_FORM',
          subjectEmail: uniqueEmail(),
          capEmailHash: randomBytes(32).toString('hex'),
          verificationExpiresAt: new Date(Date.now() + DAY),
          ...columns,
        })),
      });
    }

    it('answers CAPPED from the 51st public submission of a firm in 24 h, creating nothing', async () => {
      await fillFirm(TENANT_A, 50);
      await expect(dsars.reserveSubmission(newPublic(), CAPS, new Date())).resolves.toEqual({
        outcome: 'CAPPED',
      });
      expect(await prisma.dsarRequest.count({ where: { tenantId: TENANT_A } })).toBe(50);
    });

    it('still accepts the 50th (49 on record)', async () => {
      await fillFirm(TENANT_A, 49);
      const result = await dsars.reserveSubmission(newPublic(), CAPS, new Date());
      expect(result.outcome).toBe('CREATED');
    });

    it('does not count staff-logged rows or rows older than 24 hours', async () => {
      await fillFirm(TENANT_A, 30);
      await fillFirm(TENANT_A, 30, { createdAt: new Date(Date.now() - 25 * HOUR) });
      await fillFirm(TENANT_A, 30, {
        source: 'STAFF',
        status: 'VERIFIED',
        identityMethod: 'IN_PERSON_ID',
        identityNote: 'Passport checked at the front desk',
        verificationExpiresAt: null,
      });
      const result = await dsars.reserveSubmission(newPublic(), CAPS, new Date());
      expect(result.outcome).toBe('CREATED');
    });

    it("never lets one firm's flood cap another firm", async () => {
      await fillFirm(TENANT_A, 50);
      const result = await dsars.reserveSubmission(
        newPublic({ tenantId: TENANT_B }),
        CAPS,
        new Date()
      );
      expect(result.outcome).toBe('CREATED');
    });
  });

  describe('purge of unverified requests (Q24)', () => {
    // dsar.test.ts runs the same cross-firm purge through the deadline sweep in another fork.
    let releasePurgeLock: (() => Promise<void>) | undefined;
    beforeAll(async () => {
      if (dbReady) releasePurgeLock = await holdSuiteLock(DB_URL!, DSAR_PURGE_SUITE_LOCK_KEY);
    });
    afterAll(async () => {
      await releasePurgeLock?.();
    });

    const now = () => new Date();
    const expiredDaysAgo = (days: number) => new Date(Date.now() - days * DAY);

    it('deletes pending rows expired over 7 days ago and keeps fresh pending, verified and staff rows', async () => {
      const old = await seed({ verificationExpiresAt: expiredDaysAgo(8) });
      const oldOtherFirm = await seed({
        tenantId: TENANT_B,
        verificationExpiresAt: expiredDaysAgo(30),
      });
      const justExpired = await seed({ verificationExpiresAt: expiredDaysAgo(6) });
      const fresh = await seed({ verificationExpiresAt: new Date(Date.now() + DAY) });
      const verified = await seed({
        status: 'VERIFIED',
        verifiedAt: new Date(),
        slaDeadline: new Date(Date.now() + 30 * DAY),
        verificationExpiresAt: expiredDaysAgo(30),
      });
      const staff = await seed({
        source: 'STAFF',
        status: 'VERIFIED',
        identityMethod: 'IN_PERSON_ID',
        identityNote: 'Passport checked at the front desk',
        verifiedAt: new Date(),
        slaDeadline: new Date(Date.now() + 30 * DAY),
        verificationExpiresAt: expiredDaysAgo(30),
      });
      const all = [old, oldOtherFirm, justExpired, fresh, verified, staff];

      const purged = await dsars.purgeExpiredUnverified(now());

      expect(purged).toBeGreaterThanOrEqual(2);
      expect((await idsPresent(all)).sort()).toEqual([justExpired, fresh, verified, staff].sort());
    });

    it('works through a backlog in bounded batches and returns the total', async () => {
      const ids: string[] = [];
      for (let i = 0; i < 5; i += 1) {
        ids.push(await seed({ verificationExpiresAt: expiredDaysAgo(9 + i) }));
      }
      const purged = await dsars.purgeExpiredUnverified(now(), 2);
      expect(purged).toBeGreaterThanOrEqual(5);
      expect(await idsPresent(ids)).toEqual([]);
    });

    it('is run by the SLA sweep under its advisory lock, with or without an email sender', async () => {
      const old = await seed({ verificationExpiresAt: expiredDaysAgo(8) });
      const fresh = await seed({ verificationExpiresAt: new Date(Date.now() + DAY) });
      const logs: string[] = [];
      const deps: DsarSlaDeps = {
        store: createPrismaDsarSlaStore(prisma as DsarSlaPrisma),
        sender: undefined,
        appUrl: () => 'https://app.example.invalid',
        now,
        log: {
          info: (m: string) => logs.push(m),
          warn: (m: string) => logs.push(m),
          error: (m: string) => logs.push(m),
        },
        deferred: new Map<string, number>(),
      };
      await expect(runDsarSlaSweep(deps)).resolves.toEqual({ skipped: 'NO_SENDER' });
      expect(await idsPresent([old, fresh])).toEqual([fresh]);
      expect(
        logs.some((m) => /^\[dsar-sla\] purged \d+ expired unverified requests$/.test(m))
      ).toBe(true);

      const old2 = await seed({ verificationExpiresAt: expiredDaysAgo(10) });
      const report = await runDsarSlaSweep({
        ...deps,
        sender: { sendEmail: async () => ({ isFailure: false }) },
      });
      expect(report).toMatchObject({ purged: expect.any(Number) });
      expect(await idsPresent([old2])).toEqual([]);
    });
  });

  describe('admin list (Q24)', () => {
    it('leaves out expired unverified requests and keeps everything else', async () => {
      const expired = await seed({ verificationExpiresAt: expiredAgo(1) });
      const fresh = await seed({ verificationExpiresAt: new Date(Date.now() + DAY) });
      const verified = await seed({
        status: 'VERIFIED',
        verifiedAt: new Date(),
        slaDeadline: new Date(Date.now() + 30 * DAY),
        verificationExpiresAt: null,
      });
      const completed = await seed({
        status: 'COMPLETED',
        verifiedAt: new Date(),
        completedAt: new Date(),
        slaDeadline: new Date(Date.now() + 30 * DAY),
        verificationExpiresAt: null,
      });

      const all = (await dsars.list(TENANT_A)).map((r) => r.id);
      expect(all).not.toContain(expired);
      expect(all.sort()).toEqual([fresh, verified, completed].sort());

      const pendingOnly = (await dsars.list(TENANT_A, 'PENDING_VERIFICATION')).map((r) => r.id);
      expect(pendingOnly).toEqual([fresh]);
    });
  });
});

function expiredAgo(hours: number): Date {
  return new Date(Date.now() - hours * HOUR);
}
