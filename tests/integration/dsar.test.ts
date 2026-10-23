/**
 * PG-203 DSAR — data subject requests and processing restrictions, real-Database
 * integration test (spec Addendum A, plan Step D5).
 *
 * Proves the Class A migration 20261022120000_dsar_requests on a real Postgres (named
 * CHECKs with their NULL guards, the partial unique active-restriction index, RLS) and
 * drives the three Prisma adapters against it: the capped submission under advisory locks
 * (including two concurrent submissions and the cross-firm cap), the restriction upsert
 * merge and email move, the export scope (exact email, own firm only), and the erasure
 * transaction (every Q19 column, a full rollback on failure, a second run is a no-op).
 * It also carries the assertions of the retired IFC-155 `dsar-search-purge.test.ts`:
 * note embeddings and search vectors are cleared by the erasure.
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
import { PrismaProcessingRestrictionRepository } from '../../packages/adapters/src/repositories/PrismaProcessingRestrictionRepository';
import { PrismaSubjectDataRepository } from '../../packages/adapters/src/repositories/PrismaSubjectDataRepository';
import { PrismaContactRepository } from '../../packages/adapters/src/repositories/PrismaContactRepository';
import { PrismaLeadRepository } from '../../packages/adapters/src/repositories/PrismaLeadRepository';
import {
  dispatchCandidateIds,
  writeSubjectIfStillEligible,
} from '../../apps/ai-worker/src/lib/data-request-guard';
import { applySchemaSql, sqlState } from './schema-lock';

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
  console.log('Skipping DSAR integration test: DATABASE_URL not set');
}

/** Already exists (type, constraint, policy), duplicate column, duplicate relation. */
const ALREADY_THERE = ['42710', '42701', '42P07'];

/**
 * CI builds its test database with `prisma db push`: the tables exist but the named CHECKs,
 * the partial unique index, the SQL-only user FKs and RLS do not. When the probe CHECK is
 * missing, rebuild the two DSAR tables (they hold only this suite's rows) from the
 * migration's own SQL. The enum types db push already created are tolerated.
 */
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

const RUN = `pg203d_${Date.now()}_${randomBytes(3).toString('hex')}`;
const TENANT_A = `${RUN}_a`;
const TENANT_B = `${RUN}_b`;
const TENANTS = [TENANT_A, TENANT_B];
const ADMIN_A = `${RUN}_admin_a`;
const ADMIN_B = `${RUN}_admin_b`;
const SUBJECT = `${RUN}-ada@example.invalid`;
/** Same mailbox family, different address: never part of the subject (no +tag folding). */
const SUBJECT_TAGGED = `${RUN}-ada+news@example.invalid`;

const hex = (ch: string) => ch.repeat(64);
const UNIQUE = ['23505', 'P2002'];
const CHECK = ['23514', 'P2004', 'P2010'];
const HOUR = 3_600_000;

function pgCode(error: unknown): string | undefined {
  const state = sqlState(error);
  if (state) return state;
  const code = (error as { code?: string })?.code;
  if (code) return code;
  const text = String((error as { message?: string })?.message ?? '');
  if (/check constraint/i.test(text)) return '23514';
  if (/unique constraint|duplicate key/i.test(text)) return '23505';
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

const CAPS = {
  perTenantEmailPerDay: 3,
  perIpPerHour: 10,
  globalEmailPerDay: 3,
  resendCooldownMinutes: 60,
};

describeDb('PG-203 DSAR adapters (real DB)', () => {
  let prisma: any;
  let dbReady = false;
  let dsars: PrismaDsarRepository;
  let restrictions: PrismaProcessingRestrictionRepository;
  let subjects: PrismaSubjectDataRepository;

  beforeEach((ctx) => {
    if (!dbReady) ctx.skip();
  });

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL! }) });
    const skipReason = await ensureMigrationSql(prisma);
    if (skipReason) {
      console.log(`Skipping DSAR integration test: ${skipReason}`);
      return;
    }
    // Sweep tenants left by crashed runs of this suite (older than one day); FKs cascade.
    await prisma.$executeRawUnsafe(
      `DELETE FROM tenants WHERE id LIKE 'pg203d\\_%' AND id < $1`,
      `pg203d_${Date.now() - 86_400_000}`
    );
    await prisma.tenant.create({ data: { id: TENANT_A, name: 'Smith Law', slug: TENANT_A } });
    await prisma.tenant.create({ data: { id: TENANT_B, name: 'Jones Law', slug: TENANT_B } });
    for (const [id, tenantId] of [
      [ADMIN_A, TENANT_A],
      [ADMIN_B, TENANT_B],
    ]) {
      await prisma.user.create({
        data: { id, tenantId, email: `${id}@example.invalid`, role: 'ADMIN' },
      });
    }
    dsars = new PrismaDsarRepository(prisma);
    restrictions = new PrismaProcessingRestrictionRepository(prisma);
    subjects = new PrismaSubjectDataRepository(prisma);
    dbReady = true;
  });

  afterAll(async () => {
    if (!prisma) return;
    if (dbReady) {
      const tenants = { in: TENANTS };
      await prisma.dsarRequest.deleteMany({ where: { tenantId: tenants } });
      await prisma.processingRestriction.deleteMany({ where: { tenantId: tenants } });
      await prisma.appointment.deleteMany({ where: { tenantId: tenants } });
      await prisma.aIInsight.deleteMany({ where: { tenantId: tenants } });
      await prisma.aIScore.deleteMany({ where: { tenantId: tenants } });
      await prisma.contact.deleteMany({ where: { tenantId: tenants } });
      await prisma.lead.deleteMany({ where: { tenantId: tenants } });
      await prisma.user.deleteMany({ where: { tenantId: tenants } });
      await prisma.tenant.deleteMany({ where: { id: tenants } });
    }
    await prisma.$disconnect();
  });

  const newPublic = (overrides: Record<string, unknown> = {}) => ({
    tenantId: TENANT_A,
    type: 'ACCESS' as const,
    subjectEmail: `${RUN}-${randomBytes(3).toString('hex')}@example.invalid`,
    capEmailHash: randomBytes(32).toString('hex'),
    details: null,
    objectionScope: null,
    ipHash: null,
    verificationTokenHash: hex('1'),
    verificationExpiresAt: new Date(Date.now() + 24 * HOUR),
    ...overrides,
  });

  /** A raw dsar_requests row with `column` overriding a valid default. */
  const rawDsar = (columns: Record<string, unknown>) => {
    const row: Record<string, unknown> = {
      id: randomBytes(8).toString('hex'),
      tenantId: TENANT_A,
      type: 'ACCESS',
      source: 'PUBLIC_FORM',
      subjectEmail: `${RUN}-raw@example.invalid`,
      capEmailHash: hex('c'),
      ...columns,
    };
    const names = Object.keys(row)
      .map((c) => '"' + c + '"')
      .join(', ');
    const params = Object.keys(row)
      .map((c, i) => (c === 'type' ? `$${i + 1}::"DsarRequestType"` : '$' + String(i + 1)))
      .join(', ');
    return prisma.$executeRawUnsafe(
      `INSERT INTO dsar_requests (${names}, "updatedAt") VALUES (${params}, now())`,
      ...Object.values(row)
    );
  };

  describe('migration constraints', () => {
    it('rejects a non-normalised email, a bad hash and an out-of-range download count', async () => {
      await expectRejected(rawDsar({ subjectEmail: 'Ada@Example.invalid' }), CHECK);
      await expectRejected(rawDsar({ capEmailHash: 'z'.repeat(64) }), CHECK);
      await expectRejected(rawDsar({ exportDownloads: 6 }), CHECK);
      await expectRejected(rawDsar({ source: 'EMAIL' }), CHECK);
    });

    it('requires an objection scope on OBJECTION only, NULL included', async () => {
      await expectRejected(rawDsar({ type: 'OBJECTION' }), CHECK);
      await expectRejected(rawDsar({ type: 'ACCESS', objectionScope: 'MARKETING' }), CHECK);
      await expect(rawDsar({ type: 'OBJECTION', objectionScope: 'MARKETING' })).resolves.toBe(1);
    });

    it('requires identity method and a 20+ character note on STAFF rows, NULL included', async () => {
      await expectRejected(rawDsar({ source: 'STAFF' }), CHECK);
      await expectRejected(
        rawDsar({ source: 'STAFF', identityMethod: 'IN_PERSON_ID', identityNote: 'too short' }),
        CHECK
      );
      await expectRejected(
        rawDsar({ source: 'STAFF', identityMethod: 'IN_PERSON_ID', identityNote: null }),
        CHECK
      );
      await expect(
        rawDsar({
          source: 'STAFF',
          identityMethod: 'IN_PERSON_ID',
          identityNote: 'Passport checked at the front desk',
        })
      ).resolves.toBe(1);
    });

    it('keeps the export token and its expiry together', async () => {
      await expectRejected(rawDsar({ exportTokenHash: hex('e') }), CHECK);
    });

    it('allows one ACTIVE restriction per email, any number of lifted ones', async () => {
      const email = `${RUN}-uniq@example.invalid`;
      const insert = (lifted: boolean) =>
        prisma.$executeRawUnsafe(
          `INSERT INTO processing_restrictions (id, "tenantId", "subjectEmail", "updatedAt", "liftedAt")
           VALUES ($1, $2, $3, now(), $4)`,
          randomBytes(8).toString('hex'),
          TENANT_A,
          email,
          lifted ? new Date() : null
        );
      await insert(true);
      await insert(true);
      await insert(false);
      await expectRejected(insert(false), UNIQUE);
    });

    it('enables RLS with USING and WITH CHECK on both tables', async () => {
      const policies: Array<{ qual: string; with_check: string }> = await prisma.$queryRawUnsafe(
        `SELECT qual, with_check FROM pg_policies
          WHERE tablename IN ('dsar_requests','processing_restrictions')`
      );
      expect(policies).toHaveLength(2);
      for (const p of policies) {
        expect(p.qual).toContain('app.current_tenant_id');
        expect(p.with_check).toContain('app.current_tenant_id');
      }
    });

    it("hides B's requests and restrictions from a tenant-A session", async (ctx) => {
      const roles: Array<{ exists: boolean }> = await prisma.$queryRawUnsafe(
        `SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') AS exists`
      );
      if (!roles[0]?.exists) {
        console.log('RLS session check NOT proven: no "authenticated" role (disclosed skip)');
        ctx.skip();
      }
      await rawDsar({ tenantId: TENANT_B, subjectEmail: `${RUN}-b@example.invalid` });
      await restrictions.restrict({
        tenantId: TENANT_B,
        subjectEmail: `${RUN}-b@example.invalid`,
        blocksMarketing: false,
        dsarRequestId: 'req-b',
        createdById: null,
      });
      let seen: { requests: Array<{ tenantId: string }>; rows: Array<{ tenantId: string }> };
      try {
        seen = await prisma.$transaction(async (tx: any) => {
          await tx.$executeRawUnsafe('SET LOCAL ROLE authenticated');
          await tx.$executeRawUnsafe(
            `SELECT set_config('app.current_tenant_id', $1, true)`,
            TENANT_A
          );
          return {
            requests: await tx.$queryRawUnsafe(`SELECT "tenantId" FROM dsar_requests`),
            rows: await tx.$queryRawUnsafe(`SELECT "tenantId" FROM processing_restrictions`),
          };
        });
      } catch (error) {
        console.log(
          'RLS session check NOT proven: role lacks grants (disclosed skip)',
          pgCode(error)
        );
        ctx.skip();
        return;
      }
      expect(seen.requests.every((r) => r.tenantId === TENANT_A)).toBe(true);
      expect(seen.rows.every((r) => r.tenantId === TENANT_A)).toBe(true);
    });
  });

  describe('PrismaDsarRepository.reserveSubmission', () => {
    it('applies the resend cooldown, then the per-firm cap', async () => {
      const email = `${RUN}-caps@example.invalid`;
      const base = { subjectEmail: email, capEmailHash: hex('2') };
      const now = new Date();
      const first = await dsars.reserveSubmission(newPublic(base), CAPS, now);
      expect(first.outcome).toBe('CREATED');
      await expect(dsars.reserveSubmission(newPublic(base), CAPS, now)).resolves.toEqual({
        outcome: 'COOLDOWN',
      });
      for (const type of ['ERASURE', 'RECTIFICATION'] as const) {
        const created = await dsars.reserveSubmission(newPublic({ ...base, type }), CAPS, now);
        expect(created.outcome).toBe('CREATED');
      }
      await expect(
        dsars.reserveSubmission(newPublic({ ...base, type: 'PORTABILITY' }), CAPS, now)
      ).resolves.toEqual({ outcome: 'CAPPED' });
    });

    it('counts other firms toward the global cap on the folded email hash', async () => {
      const now = new Date();
      const hash = hex('3');
      for (let i = 0; i < 3; i++) {
        const created = await dsars.reserveSubmission(
          newPublic({ tenantId: TENANT_A, capEmailHash: hash }),
          { ...CAPS, perTenantEmailPerDay: 99 },
          now
        );
        expect(created.outcome).toBe('CREATED');
      }
      // Another firm and another address in the same folded family: still capped.
      await expect(
        dsars.reserveSubmission(
          newPublic({ tenantId: TENANT_B, capEmailHash: hash }),
          { ...CAPS, perTenantEmailPerDay: 99 },
          now
        )
      ).resolves.toEqual({ outcome: 'CAPPED' });
    });

    it('caps by IP hash per firm and hour', async () => {
      const now = new Date();
      const ipHash = hex('4');
      const caps = { ...CAPS, perIpPerHour: 2 };
      for (let i = 0; i < 2; i++) {
        const created = await dsars.reserveSubmission(newPublic({ ipHash }), caps, now);
        expect(created.outcome).toBe('CREATED');
      }
      await expect(dsars.reserveSubmission(newPublic({ ipHash }), caps, now)).resolves.toEqual({
        outcome: 'CAPPED',
      });
    });

    it('serialises two concurrent submissions so a cap of one admits exactly one', async () => {
      const email = `${RUN}-race@example.invalid`;
      const caps = { ...CAPS, perTenantEmailPerDay: 1 };
      const now = new Date();
      const results = await Promise.all(
        (['ACCESS', 'ERASURE'] as const).map((type) =>
          dsars.reserveSubmission(
            newPublic({ subjectEmail: email, capEmailHash: hex('5'), type }),
            caps,
            now
          )
        )
      );
      expect(results.map((r) => r.outcome).sort()).toEqual(['CAPPED', 'CREATED']);
      expect(await prisma.dsarRequest.count({ where: { subjectEmail: email } })).toBe(1);
    });
  });

  describe('PrismaDsarRepository status changes', () => {
    it('applies a transition once and only from the expected status', async () => {
      const created = await dsars.reserveSubmission(newPublic(), CAPS, new Date());
      if (created.outcome !== 'CREATED') throw new Error('seed failed');
      const patch = {
        status: 'VERIFIED' as const,
        verificationTokenHash: null,
        verificationExpiresAt: null,
        verifiedAt: new Date(),
      };
      const [one, two] = await Promise.all([
        dsars.transition(TENANT_A, created.record.id, 'PENDING_VERIFICATION', patch),
        dsars.transition(TENANT_A, created.record.id, 'PENDING_VERIFICATION', patch),
      ]);
      expect([one, two].filter(Boolean)).toHaveLength(1);
      // Another firm can never change it.
      await expect(
        dsars.transition(TENANT_B, created.record.id, 'VERIFIED', { status: 'REJECTED' })
      ).resolves.toBeNull();
      await expect(dsars.findForTenant(TENANT_B, created.record.id)).resolves.toBeNull();
    });

    it('verifies a RESTRICTION and starts its restriction in one transaction, once', async () => {
      const email = `${RUN}-verify@example.invalid`;
      const created = await dsars.reserveSubmission(
        newPublic({ type: 'RESTRICTION', subjectEmail: email }),
        CAPS,
        new Date()
      );
      if (created.outcome !== 'CREATED') throw new Error('seed failed');
      const patch = {
        status: 'VERIFIED' as const,
        verificationTokenHash: null,
        verificationExpiresAt: null,
        verifiedAt: new Date(),
      };
      const condition = {
        restrict: { subjectEmail: email, blocksMarketing: false, createdById: null },
      };
      const first = await dsars.transition(
        TENANT_A,
        created.record.id,
        'PENDING_VERIFICATION',
        patch,
        condition
      );
      expect(first?.status).toBe('VERIFIED');
      await expect(restrictions.status(TENANT_A, email)).resolves.toMatchObject({
        restricted: true,
      });
      // An admin lifts it; a late, losing verification must not bring it back.
      await restrictions.liftForRequest({
        tenantId: TENANT_A,
        dsarRequestId: created.record.id,
        liftedById: ADMIN_A,
        note: 'Request rejected',
      });
      await expect(
        dsars.transition(TENANT_A, created.record.id, 'PENDING_VERIFICATION', patch, condition)
      ).resolves.toBeNull();
      await expect(restrictions.status(TENANT_A, email)).resolves.toMatchObject({
        restricted: false,
      });
    });

    it('counts downloads up to the cap, only for the live token (codex: revocation race)', async () => {
      const created = await dsars.reserveSubmission(newPublic(), CAPS, new Date());
      if (created.outcome !== 'CREATED') throw new Error('seed failed');
      const now = new Date();
      await prisma.dsarRequest.update({
        where: { id: created.record.id },
        data: { exportTokenHash: hex('a'), exportExpiresAt: new Date(now.getTime() + 3_600_000) },
      });
      const download = (tokenHash: string) =>
        dsars.recordDownload({ id: created.record.id, tokenHash, maxDownloads: 5, now });
      // Another token (a revoked or replaced link) never counts.
      await expect(download(hex('b'))).resolves.toBe(false);
      const counted: boolean[] = [];
      for (let i = 0; i < 6; i++) counted.push(await download(hex('a')));
      expect(counted).toEqual([true, true, true, true, true, false]);
      // Revoked after the check: the conditional write refuses it.
      await prisma.dsarRequest.update({
        where: { id: created.record.id },
        data: { exportTokenHash: null, exportExpiresAt: null, exportDownloads: 0 },
      });
      await expect(download(hex('a'))).resolves.toBe(false);
    });

    it('counts only ADMIN users and resolves the firm identity', async () => {
      await expect(dsars.countAdmins(TENANT_A)).resolves.toBe(1);
      await expect(dsars.findFirm(TENANT_A)).resolves.toMatchObject({
        tenantId: TENANT_A,
        name: 'Smith Law',
      });
      await expect(dsars.findFirm(`${RUN}_none`)).resolves.toBeNull();
    });
  });

  describe('PrismaProcessingRestrictionRepository', () => {
    it('merges a RESTRICTION and an OBJECTION into one active row (sign-off 1)', async () => {
      const email = `${RUN}-merge@example.invalid`;
      await restrictions.restrict({
        tenantId: TENANT_A,
        subjectEmail: email,
        blocksMarketing: false,
        dsarRequestId: 'req-restrict',
        createdById: null,
      });
      const merged = await restrictions.restrict({
        tenantId: TENANT_A,
        subjectEmail: ` ${email.toUpperCase()} `,
        blocksMarketing: true,
        dsarRequestId: 'req-object',
        createdById: ADMIN_A,
      });
      // Repeating the same request id never duplicates it (verify is retried idempotently).
      await restrictions.restrict({
        tenantId: TENANT_A,
        subjectEmail: email,
        blocksMarketing: false,
        dsarRequestId: 'req-restrict',
        createdById: null,
      });
      const rows = await prisma.processingRestriction.findMany({
        where: { tenantId: TENANT_A, subjectEmail: email, liftedAt: null },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].blocksMarketing).toBe(true);
      expect(rows[0].dsarRequestIds.sort()).toEqual(['req-object', 'req-restrict']);
      expect(merged.id).toBe(rows[0].id);
      await expect(restrictions.status(TENANT_A, email)).resolves.toMatchObject({
        restricted: true,
        blocksMarketing: true,
      });
      await expect(restrictions.status(TENANT_B, email)).resolves.toMatchObject({
        restricted: false,
      });

      // Rejecting the RESTRICTION detaches it; the OBJECTION keeps the row active.
      await expect(
        restrictions.liftForRequest({
          tenantId: TENANT_A,
          dsarRequestId: 'req-restrict',
          liftedById: ADMIN_A,
          note: 'Request rejected',
        })
      ).resolves.toBeNull();
      await expect(restrictions.status(TENANT_A, email)).resolves.toMatchObject({
        restricted: true,
      });
      const lifted = await restrictions.liftForRequest({
        tenantId: TENANT_A,
        dsarRequestId: 'req-object',
        liftedById: ADMIN_A,
        note: 'Request rejected',
      });
      expect(lifted?.id).toBe(rows[0].id);
      await expect(restrictions.status(TENANT_A, email)).resolves.toMatchObject({
        restricted: false,
      });
    });

    it('releases every address a request covers after its email was followed (codex)', async () => {
      const first = `${RUN}-first@example.invalid`;
      const second = `${RUN}-second@example.invalid`;
      await restrictions.restrict({
        tenantId: TENANT_A,
        subjectEmail: first,
        blocksMarketing: false,
        dsarRequestId: 'req-followed',
        createdById: null,
      });
      await restrictions.followEmail(TENANT_A, first, second);
      await restrictions.liftForRequest({
        tenantId: TENANT_A,
        dsarRequestId: 'req-followed',
        liftedById: ADMIN_A,
        note: 'Request rejected',
      });
      for (const email of [first, second]) {
        await expect(restrictions.status(TENANT_A, email)).resolves.toMatchObject({
          restricted: false,
        });
      }
    });

    it('lifts by id within the firm only', async () => {
      const email = `${RUN}-lift@example.invalid`;
      const row = await restrictions.restrict({
        tenantId: TENANT_A,
        subjectEmail: email,
        blocksMarketing: false,
        dsarRequestId: 'req-lift',
        createdById: null,
      });
      await expect(
        restrictions.lift({
          tenantId: TENANT_B,
          restrictionId: row.id,
          expectedRequestIds: ['req-lift'],
          liftedById: ADMIN_B,
          note: 'x',
        })
      ).resolves.toBeNull();
      await expect(restrictions.findActive(TENANT_A, row.id)).resolves.toMatchObject({
        id: row.id,
      });
      await expect(
        restrictions.lift({
          tenantId: TENANT_A,
          restrictionId: row.id,
          expectedRequestIds: ['req-other'],
          liftedById: ADMIN_A,
          note: 'stale',
        })
      ).resolves.toBeNull(); // the row holds a request the admin did not review
      await expect(
        restrictions.lift({
          tenantId: TENANT_A,
          restrictionId: row.id,
          expectedRequestIds: ['req-lift'],
          liftedById: ADMIN_A,
          note: 'ok',
        })
      ).resolves.toMatchObject({ id: row.id });
      await expect(restrictions.findActive(TENANT_A, row.id)).resolves.toBeNull();
    });

    it('extends a restriction to a changed email, merging into one already there', async () => {
      const from = `${RUN}-old@example.invalid`;
      const to = `${RUN}-new@example.invalid`;
      await restrictions.restrict({
        tenantId: TENANT_A,
        subjectEmail: from,
        blocksMarketing: true,
        dsarRequestId: 'req-old',
        createdById: null,
      });
      await restrictions.restrict({
        tenantId: TENANT_A,
        subjectEmail: to,
        blocksMarketing: false,
        dsarRequestId: 'req-new',
        createdById: null,
      });
      await restrictions.followEmail(TENANT_A, from, to.toUpperCase());
      // The old address stays restricted: another record of the firm may still use it.
      await expect(restrictions.status(TENANT_A, from)).resolves.toMatchObject({
        restricted: true,
      });
      const active = await prisma.processingRestriction.findMany({
        where: { tenantId: TENANT_A, subjectEmail: to, liftedAt: null },
      });
      expect(active).toHaveLength(1);
      expect(active[0].blocksMarketing).toBe(true);
      expect(active[0].dsarRequestIds.sort()).toEqual(['req-new', 'req-old']);
      // Following again changes nothing (the ids are already merged).
      await restrictions.followEmail(TENANT_A, from, to);
      const again = await prisma.processingRestriction.findMany({
        where: { tenantId: TENANT_A, subjectEmail: to, liftedAt: null },
      });
      expect(again).toHaveLength(1);
      expect(again[0].dsarRequestIds.sort()).toEqual(['req-new', 'req-old']);
      // An address without a restriction has nothing to follow.
      await expect(
        restrictions.followEmail(
          TENANT_A,
          `${RUN}-free@example.invalid`,
          `${RUN}-x@example.invalid`
        )
      ).resolves.toBeUndefined();
    });
  });

  describe('restrictions follow a record to its new address (codex HIGH x2)', () => {
    const restrict = (subjectEmail: string, dsarRequestId: string) =>
      restrictions.restrict({
        tenantId: TENANT_A,
        subjectEmail,
        blocksMarketing: true,
        dsarRequestId,
        createdById: null,
      });
    const person = (email: string) => ({
      tenantId: TENANT_A,
      ownerId: ADMIN_A,
      email,
      firstName: 'Grace',
      lastName: 'Hopper',
    });

    it('carries a restriction when a contact or a lead changes address, in the same write', async () => {
      const oldContact = `${RUN}-c-old@example.invalid`;
      const oldLead = `${RUN}-l-old@example.invalid`;
      await restrict(oldContact, 'req-c');
      await restrict(oldLead, 'req-l');
      const contact = await prisma.contact.create({ data: person(oldContact) });
      const lead = await prisma.lead.create({ data: person(oldLead) });
      await prisma.contact.update({
        where: { id: contact.id },
        data: { email: `${RUN}-c-new@example.invalid` },
      });
      await prisma.lead.update({
        where: { id: lead.id },
        data: { email: `${RUN}-l-new@example.invalid` },
      });
      await expect(
        restrictions.status(TENANT_A, `${RUN}-c-new@example.invalid`)
      ).resolves.toMatchObject({ restricted: true, blocksMarketing: true });
      await expect(
        restrictions.status(TENANT_A, `${RUN}-l-new@example.invalid`)
      ).resolves.toMatchObject({ restricted: true });
      // The old address stays restricted, and an erasure rewrite is never carried.
      await expect(restrictions.status(TENANT_A, oldContact)).resolves.toMatchObject({
        restricted: true,
      });
      await prisma.contact.update({
        where: { id: contact.id },
        data: { email: `erased-${contact.id}@erased.invalid` },
      });
      expect(
        await prisma.processingRestriction.count({
          where: { subjectEmail: `erased-${contact.id}@erased.invalid` },
        })
      ).toBe(0);
    });

    it("a merge extends the secondary's restriction to the surviving contact", async () => {
      const secondaryEmail = `${RUN}-m-sec@example.invalid`;
      const primaryEmail = `${RUN}-m-pri@example.invalid`;
      await restrict(secondaryEmail, 'req-m');
      const primary = await prisma.contact.create({ data: person(primaryEmail) });
      const secondary = await prisma.contact.create({ data: person(secondaryEmail) });
      await new PrismaContactRepository(prisma).mergeInTransaction({
        primaryId: primary.id,
        secondaryId: secondary.id,
        tenantId: TENANT_A,
        mergedBy: ADMIN_A,
        mergeFields: {},
      });
      const carried = await prisma.processingRestriction.findFirst({
        where: { tenantId: TENANT_A, subjectEmail: primaryEmail, liftedAt: null },
      });
      expect(carried?.dsarRequestIds).toEqual(['req-m']);
    });
  });

  describe('PrismaSubjectDataRepository', () => {
    let leadA: string;
    let contactA: string;
    let leadTagged: string;
    let leadB: string;
    let appointmentA: string;

    /** Seed the subject in firm A, the +tag address in firm A and the same address in firm B. */
    async function seedSubject() {
      const lead = (tenantId: string, ownerId: string, email: string) =>
        prisma.lead.create({
          data: {
            tenantId,
            ownerId,
            email,
            firstName: 'Ada',
            lastName: 'Lovelace',
            company: 'Engines Ltd',
            phone: '+440000000000',
            utmSource: 'newsletter',
            tags: ['vip'],
            score: 75,
            estimatedValue: 5000,
          },
        });
      // Stored with stray case and whitespace (a tab, a newline): the match is
      // dsar_normalise_email(email), the SQL twin of normalizeSubjectEmail (codex).
      leadA = (await lead(TENANT_A, ADMIN_A, `\t${SUBJECT.toUpperCase()}\n `)).id;
      leadTagged = (await lead(TENANT_A, ADMIN_A, SUBJECT_TAGGED)).id;
      leadB = (await lead(TENANT_B, ADMIN_B, SUBJECT)).id;
      contactA = (
        await prisma.contact.create({
          data: {
            tenantId: TENANT_A,
            ownerId: ADMIN_A,
            email: SUBJECT,
            firstName: 'Ada',
            lastName: 'Lovelace',
            city: 'London',
            contactNotes: 'Prefers mornings',
            leadId: leadA,
          },
        })
      ).id;
      await prisma.leadNote.create({
        data: { tenantId: TENANT_A, leadId: leadA, content: 'Met at the fair', author: ADMIN_A },
      });
      await prisma.contactNote.create({
        data: { tenantId: TENANT_A, contactId: contactA, content: 'Called back', author: ADMIN_A },
      });
      await prisma.$executeRawUnsafe(
        `UPDATE lead_notes SET search_vector = to_tsvector('simple', content) WHERE "leadId" = $1`,
        leadA
      );
      await prisma.$executeRawUnsafe(
        `UPDATE contact_notes SET search_vector = to_tsvector('simple', content) WHERE "contactId" = $1`,
        contactA
      );
      await prisma.leadActivity.create({
        data: {
          tenantId: TENANT_A,
          leadId: leadA,
          type: 'EMAIL',
          title: 'Sent brochure',
          description: 'Asked about fees',
          userName: 'Admin',
          metadata: { subject: 'Fees' },
        },
      });
      await prisma.contactActivity.create({
        data: {
          tenantId: TENANT_A,
          contactId: contactA,
          type: 'CALL',
          title: 'Call',
          description: 'Discussed divorce',
          userName: 'Admin',
        },
      });
      await prisma.leadFile.create({
        data: {
          tenantId: TENANT_A,
          leadId: leadA,
          name: 'passport.pdf',
          size: '1 MB',
          fileType: 'PDF',
          url: 'https://files.example.invalid/passport.pdf',
        },
      });
      await prisma.aIScore.create({
        data: {
          tenantId: TENANT_A,
          leadId: leadA,
          score: 80,
          confidence: 0.9,
          factors: {},
          modelVersion: 'v1',
          scoredById: ADMIN_A,
        },
      });
      await prisma.leadAIInsight.create({
        data: {
          tenantId: TENANT_A,
          leadId: leadA,
          conversionProbability: 50,
          estimatedValue: 1000,
          churnRisk: 'LOW',
          engagementScore: 10,
          lastEngagementDays: 1,
        },
      });
      await prisma.aIInsight.create({
        data: {
          tenantId: TENANT_A,
          type: 'lead',
          category: 'scoring',
          title: 'Hot lead',
          description: 'Ada looks ready',
          confidence: 80,
          priority: 'high',
          entityType: 'lead',
          entityId: leadA,
        },
      });
      const start = new Date(Date.now() + 40 * 24 * HOUR);
      appointmentA = (
        await prisma.appointment.create({
          data: {
            tenantId: TENANT_A,
            organizerId: ADMIN_A,
            title: 'Consultation with Ada',
            notes: 'Bring documents',
            // Free text a cancellation can carry (codex): erased with the booking.
            cancellationReason: 'Ada is in hospital',
            startTime: start,
            endTime: new Date(start.getTime() + HOUR / 2),
            bookerName: 'Ada Lovelace',
            bookerEmail: SUBJECT,
            bookingAnswers: { matter: 'Divorce' },
            bookingConsentAt: new Date(),
            bookingConsentVersion: 'v1',
          },
        })
      ).id;
    }

    async function verifiedErasure(): Promise<string> {
      const record = await dsars.createStaff({
        tenantId: TENANT_A,
        type: 'ERASURE',
        subjectEmail: SUBJECT,
        capEmailHash: hex('6'),
        details: null,
        objectionScope: null,
        identityMethod: 'IN_PERSON_ID',
        identityNote: 'Passport checked at the front desk',
        receivedAt: new Date(),
        receivedOnReason: null,
        verifiedAt: new Date(),
        slaDeadline: new Date(Date.now() + 30 * 24 * HOUR),
        createdById: ADMIN_A,
      });
      return record.id;
    }

    beforeAll(async () => {
      if (dbReady) await seedSubject();
    });

    it('lets the scoring dispatcher exclude a restricted address however it is stored (codex)', async () => {
      // The subject's lead is stored as " UPPER-CASE " with spaces: SQL still matches it on the
      // normalised address, before the limit; the tagged address is someone else and stays.
      const ids = await dispatchCandidateIds(prisma as never, {
        tenantId: TENANT_A,
        restricted: [SUBJECT],
        staleBefore: new Date(),
        limit: 1000,
      });
      expect(ids).not.toContain(leadA);
      expect(ids).toContain(leadTagged);
      const unrestricted = await dispatchCandidateIds(prisma as never, {
        tenantId: TENANT_A,
        restricted: [],
        staleBefore: new Date(),
        limit: 1000,
      });
      expect(unrestricted).toContain(leadA);
    });

    it('stores a score for a lead whose address is stored with stray case and spaces (codex)', async () => {
      const leads = new PrismaLeadRepository(prisma as never);
      const stored = await leads.findById({ value: leadA } as never);
      expect(stored).not.toBeNull();
      await expect(
        leads.save(stored!, { scoreOnlyIfEmail: stored!.email.value })
      ).resolves.toBeUndefined();
      await expect(
        leads.save(stored!, { scoreOnlyIfEmail: `${RUN}-someone-else@example.invalid` })
      ).rejects.toThrow(/changed while it was being scored/);
    });

    it('exports the exact address in its own firm only, withholding free text', async () => {
      const exported = await subjects.buildExport(TENANT_A, SUBJECT);
      expect(exported.data.leads).toHaveLength(1);
      expect(exported.data.contacts).toHaveLength(1);
      expect(exported.data.bookings).toHaveLength(1);
      expect(exported.data.leadScores).toHaveLength(1);
      const text = JSON.stringify(exported.data);
      expect(text).not.toContain(SUBJECT_TAGGED);
      expect(text).not.toContain('Met at the fair');
      expect(text).not.toContain('Asked about fees');
      expect(text).not.toContain('passport.pdf');
      // 2 note rows + the contact's inline staff note.
      expect(exported.withheld).toMatchObject({ NOTES: 3, ACTIVITY_TEXT: 2, DOCUMENTS: 1 });
      expect(exported.data.leadInsights).toHaveLength(1);
      expect(exported.data.aiInsights).toHaveLength(1);
      expect(text).not.toContain('Prefers mornings');
    });

    it('finds mail sent to the person among several recipients or only on CC/BCC (codex)', async () => {
      const grace = `${RUN}-grace@example.invalid`;
      const other = `${RUN}-other@example.invalid`;
      const mail = (tenantId: string, fields: Record<string, string | null>) =>
        prisma.emailRecord.create({
          data: {
            tenantId,
            subject: 'Hello',
            body: 'Body',
            fromEmail: other,
            toEmail: other,
            ...fields,
          },
        });
      const found = [
        await mail(TENANT_A, { toEmail: `${other}, ${grace.toUpperCase()}` }),
        await mail(TENANT_A, { ccEmails: ` ${grace}` }),
        await mail(TENANT_A, { bccEmails: `${other}, ${grace}` }),
      ].map((r) => r.id);
      const decoys = [
        await mail(TENANT_A, { toEmail: `x${grace}`, ccEmails: `${grace}.uk` }),
        await mail(TENANT_B, { toEmail: grace }),
      ].map((r) => r.id);
      try {
        // Exactly the three: the substring decoy and the other firm's copy are left out. The
        // export lists dates only for mail and withholds the bodies.
        const exported = await subjects.buildExport(TENANT_A, grace);
        expect(exported.data.emailRecords).toHaveLength(3);
        expect(exported.withheld.MESSAGE_BODIES).toBe(3);
        const preview = await subjects.previewErasure(TENANT_A, grace);
        expect(preview.checklist.emailRecords).toBe(3);
      } finally {
        await prisma.emailRecord.deleteMany({ where: { id: { in: [...found, ...decoys] } } });
      }
    });

    it('lists staff notifications about the person on the checklist (codex)', async () => {
      const before = await subjects.previewErasure(TENANT_A, SUBJECT);
      const alert = await prisma.notification.create({
        data: {
          tenantId: TENANT_A,
          recipientId: ADMIN_A,
          subject: 'High churn risk',
          body: 'Ada has gone quiet',
          sourceType: 'ai_recommendation',
          sourceId: contactA,
        },
      });
      try {
        const after = await subjects.previewErasure(TENANT_A, SUBJECT);
        expect(after.checklist.notifications).toBe(before.checklist.notifications + 1);
      } finally {
        await prisma.notification.delete({ where: { id: alert.id } });
      }
    });

    it('previews counts without changing anything', async () => {
      const preview = await subjects.previewErasure(TENANT_A, SUBJECT);
      expect(preview.counts).toEqual({ leads: 1, contacts: 1, bookings: 1 });
      expect(preview.checklist.storedLeadFiles).toBe(1);
      const lead = await prisma.lead.findUnique({ where: { id: leadA } });
      expect(lead.firstName).toBe('Ada');
    });

    it('rolls back every change when one statement fails', async () => {
      const requestId = await verifiedErasure();
      const failing = new Proxy(prisma, {
        get(target, prop) {
          if (prop !== '$transaction') return target[prop];
          return (fn: (tx: unknown) => Promise<unknown>, opts: unknown) =>
            target.$transaction(
              (tx: any) =>
                fn(
                  new Proxy(tx, {
                    get(inner, key) {
                      if (key === 'aIInsight') {
                        return {
                          deleteMany: async () => {
                            throw new Error('simulated failure');
                          },
                        };
                      }
                      return inner[key];
                    },
                  })
                ),
              opts
            );
        },
      });
      await expect(
        new PrismaSubjectDataRepository(failing).erase({
          tenantId: TENANT_A,
          requestId,
          subjectEmail: SUBJECT,
          resolvedById: ADMIN_A,
          note: 'No hold applies',
          now: new Date(),
          clockBreached: false,
        })
      ).rejects.toThrow('simulated failure');
      const lead = await prisma.lead.findUnique({ where: { id: leadA } });
      expect(lead.firstName).toBe('Ada');
      expect(await prisma.aIScore.count({ where: { leadId: leadA } })).toBe(1);
      const request = await prisma.dsarRequest.findUnique({ where: { id: requestId } });
      expect(request.status).toBe('VERIFIED');
      await prisma.dsarRequest.update({
        where: { id: requestId },
        data: { status: 'REJECTED', completedAt: new Date() },
      });
    });

    it('erases every Q19 column in one transaction and leaves other people untouched', async () => {
      const requestId = await verifiedErasure();
      const result = await subjects.erase({
        tenantId: TENANT_A,
        requestId,
        subjectEmail: SUBJECT,
        resolvedById: ADMIN_A,
        note: 'No hold applies',
        now: new Date(),
        clockBreached: false,
      });
      expect(result.outcome).toBe('ERASED');
      if (result.outcome !== 'ERASED') return;
      expect(result.result.counts).toMatchObject({
        leads: 1,
        contacts: 1,
        leadNotes: 1,
        contactNotes: 1,
        leadActivities: 1,
        contactActivities: 1,
        leadFiles: 1,
        aiScores: 1,
        aiInsights: 2,
        bookings: 1,
      });

      const lead = await prisma.lead.findUnique({ where: { id: leadA } });
      expect(lead.email).toBe(`erased-${leadA}@erased.invalid`);
      for (const column of ['firstName', 'lastName', 'company', 'phone', 'utmSource']) {
        expect(lead[column]).toBeNull();
      }
      expect(lead.tags).toEqual([]);
      // Derived values on the surviving row go too (codex).
      expect(lead.score).toBe(0);
      expect(lead.estimatedValue).toBeNull();
      const contact = await prisma.contact.findUnique({ where: { id: contactA } });
      expect(contact).toMatchObject({
        firstName: 'Erased',
        lastName: 'Erased',
        city: null,
        contactNotes: null,
      });
      expect(contact.email).toBe(`erased-${contactA}@erased.invalid`);

      // Ported from IFC-155 dsar-search-purge: note embeddings and search vectors are cleared.
      const notes: Array<{ content: string; has_vector: boolean; has_embedding: boolean }> =
        await prisma.$queryRawUnsafe(
          `SELECT content, search_vector IS NOT NULL AS has_vector, embedding IS NOT NULL AS has_embedding
             FROM lead_notes WHERE "leadId" = $1
           UNION ALL
           SELECT content, search_vector IS NOT NULL, embedding IS NOT NULL
             FROM contact_notes WHERE "contactId" = $2`,
          leadA,
          contactA
        );
      expect(notes).toHaveLength(2);
      for (const note of notes) {
        expect(note).toEqual({
          content: '[erased under a data request]',
          has_vector: false,
          has_embedding: false,
        });
      }
      const leadActivity = await prisma.leadActivity.findFirst({ where: { leadId: leadA } });
      expect(leadActivity).toMatchObject({
        title: 'Erased activity',
        description: null,
        metadata: null,
      });
      const contactActivity = await prisma.contactActivity.findFirst({
        where: { contactId: contactA },
      });
      expect(contactActivity.description).toBe('Erased activity');
      const file = await prisma.leadFile.findFirst({ where: { leadId: leadA } });
      // The locator stays so the stored object can still be found and deleted by hand.
      expect(file).toMatchObject({
        name: 'erased',
        url: 'https://files.example.invalid/passport.pdf',
      });
      expect(await prisma.aIScore.count({ where: { leadId: leadA } })).toBe(0);
      expect(await prisma.leadAIInsight.count({ where: { leadId: leadA } })).toBe(0);
      expect(await prisma.aIInsight.count({ where: { entityId: leadA } })).toBe(0);
      const booking = await prisma.appointment.findUnique({ where: { id: appointmentA } });
      expect(booking).toMatchObject({
        title: 'Booked appointment',
        notes: null,
        cancellationReason: null,
        bookerName: null,
        bookerEmail: null,
        bookingAnswers: null,
        bookingConsentAt: null,
        bookingConsentVersion: null,
      });
      const request = await prisma.dsarRequest.findUnique({ where: { id: requestId } });
      expect(request).toMatchObject({ status: 'COMPLETED', resolvedById: ADMIN_A });
      expect(request.noHoldConfirmedAt).not.toBeNull();

      // The +tag address and the same address in another firm are different people's data.
      const tagged = await prisma.lead.findUnique({ where: { id: leadTagged } });
      expect(tagged.firstName).toBe('Ada');
      const other = await prisma.lead.findUnique({ where: { id: leadB } });
      expect(other).toMatchObject({ email: SUBJECT, firstName: 'Ada' });

      // A second run (double click, second admin) is a no-op.
      await expect(
        subjects.erase({
          tenantId: TENANT_A,
          requestId,
          subjectEmail: SUBJECT,
          resolvedById: ADMIN_A,
          note: 'again',
          now: new Date(),
          clockBreached: false,
        })
      ).resolves.toEqual({ outcome: 'NOT_PENDING' });
    });

    it('exports and erases AI insights stored under the deals of the person (codex, Q22)', async () => {
      // Insight generation treats a deal as its contact's and stores the insight under the
      // opportunity id, so the export and the erasure must reach it through the contact.
      const frank = `${RUN}-frank@example.invalid`;
      const contact = await prisma.contact.create({
        data: {
          tenantId: TENANT_A,
          ownerId: ADMIN_A,
          email: frank,
          firstName: 'Frank',
          lastName: 'Deal',
        },
      });
      const account = await prisma.account.create({
        data: { tenantId: TENANT_A, ownerId: ADMIN_A, name: `${RUN} Frank Co` },
      });
      const deal = await prisma.opportunity.create({
        data: {
          tenantId: TENANT_A,
          ownerId: ADMIN_A,
          accountId: account.id,
          contactId: contact.id,
          name: 'Frank renewal',
          value: 1000,
        },
      });
      await prisma.aIInsight.create({
        data: {
          tenantId: TENANT_A,
          type: 'warning',
          category: 'sales',
          title: 'Frank has gone quiet',
          description: 'Frank Deal stopped replying',
          confidence: 80,
          entityType: 'opportunity',
          entityId: deal.id,
        },
      });
      const request = await dsars.createStaff({
        tenantId: TENANT_A,
        type: 'ERASURE',
        subjectEmail: frank,
        capEmailHash: hex('8'),
        details: null,
        objectionScope: null,
        identityMethod: 'IN_PERSON_ID',
        identityNote: 'Passport checked at the front desk',
        receivedAt: new Date(),
        receivedOnReason: null,
        verifiedAt: new Date(),
        slaDeadline: new Date(Date.now() + 30 * 24 * HOUR),
        createdById: ADMIN_A,
      });
      try {
        const exported = await subjects.buildExport(TENANT_A, frank);
        expect(exported.data.aiInsights).toHaveLength(1);

        const result = await subjects.erase({
          tenantId: TENANT_A,
          requestId: request.id,
          subjectEmail: frank,
          resolvedById: ADMIN_A,
          note: 'No hold applies',
          now: new Date(),
          clockBreached: false,
        });
        expect(result).toMatchObject({ outcome: 'ERASED', result: { counts: { aiInsights: 1 } } });
        await expect(
          prisma.aIInsight.count({ where: { tenantId: TENANT_A, entityId: deal.id } })
        ).resolves.toBe(0);
      } finally {
        await prisma.aIInsight.deleteMany({ where: { tenantId: TENANT_A, entityId: deal.id } });
        await prisma.opportunity.delete({ where: { id: deal.id } });
        await prisma.account.delete({ where: { id: account.id } });
      }
    });

    it('never erases a record whose address is corrected away while the erasure runs (codex)', async () => {
      const carol = `${RUN}-carol@example.invalid`;
      const dave = `${RUN}-dave@example.invalid`;
      const lead = await prisma.lead.create({
        data: { tenantId: TENANT_A, ownerId: ADMIN_A, email: carol, firstName: 'Dave' },
      });
      const request = await dsars.createStaff({
        tenantId: TENANT_A,
        type: 'ERASURE',
        subjectEmail: carol,
        capEmailHash: hex('7'),
        details: null,
        objectionScope: null,
        identityMethod: 'IN_PERSON_ID',
        identityNote: 'Passport checked at the front desk',
        receivedAt: new Date(),
        receivedOnReason: null,
        verifiedAt: new Date(),
        slaDeadline: new Date(Date.now() + 30 * 24 * HOUR),
        createdById: ADMIN_A,
      });
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      let corrected!: () => void;
      const correctedYet = new Promise<void>((resolve) => (corrected = resolve));
      try {
        // A staff correction: the record was Dave's all along. Held open until the erasure waits.
        const correction = prisma.$transaction(
          async (tx: any) => {
            await tx.lead.update({ where: { id: lead.id }, data: { email: dave } });
            corrected();
            await gate;
          },
          { timeout: 20_000 }
        );
        await correctedYet;
        const erasing = subjects.erase({
          tenantId: TENANT_A,
          requestId: request.id,
          subjectEmail: carol,
          resolvedById: ADMIN_A,
          note: 'No hold applies',
          now: new Date(),
          clockBreached: false,
        });
        await new Promise((resolve) => setTimeout(resolve, 300));
        release();
        await correction;
        const result = await erasing;

        expect(result).toMatchObject({ outcome: 'ERASED', result: { counts: { leads: 0 } } });
        await expect(prisma.lead.findUnique({ where: { id: lead.id } })).resolves.toMatchObject({
          email: dave,
          firstName: 'Dave',
        });
      } finally {
        release();
        await prisma.lead.delete({ where: { id: lead.id } });
      }
    });

    it('a worker write waits for a restriction being written, then writes nothing (Q21/Q22)', async () => {
      // The AI workers' locked write on real locks: the lead row, then the person's address
      // lock (dsar_subject_lock), then the restriction read. A restriction committed while
      // the worker waits on the address lock must be seen, so nothing is stored.
      const erin = `${RUN}-erin@example.invalid`;
      const lead = await prisma.lead.create({
        data: { tenantId: TENANT_A, ownerId: ADMIN_A, email: erin, firstName: 'Erin' },
      });
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      let locked!: () => void;
      const lockedYet = new Promise<void>((resolve) => (locked = resolve));
      try {
        const restricting = prisma.$transaction(
          async (tx: any) => {
            await tx.$executeRaw`SELECT dsar_subject_lock(${TENANT_A}, ${erin})`;
            locked();
            await gate;
            await tx.processingRestriction.create({
              data: { tenantId: TENANT_A, subjectEmail: erin },
            });
          },
          { timeout: 20_000 }
        );
        await lockedYet;
        let wrote = false;
        const writing = writeSubjectIfStillEligible(
          prisma,
          { kind: 'lead', id: lead.id, tenantId: TENANT_A, email: erin },
          async () => {
            wrote = true;
          }
        );
        await new Promise((resolve) => setTimeout(resolve, 300));
        release();
        await restricting;

        await expect(writing).resolves.toEqual({ written: false, reason: 'RESTRICTED' });
        expect(wrote).toBe(false);
      } finally {
        release();
        await prisma.processingRestriction.deleteMany({
          where: { tenantId: TENANT_A, subjectEmail: erin },
        });
        await prisma.lead.delete({ where: { id: lead.id } });
      }
    });

    it('refuses any AI-derived write for the erased person afterwards (owner ruling: DB guard)', async () => {
      // A late AI job (queued before the erasure) tries to store derived data again.
      const late = [
        prisma.aIScore.create({
          data: {
            tenantId: TENANT_A,
            leadId: leadA,
            score: 90,
            confidence: 0.9,
            factors: {},
            modelVersion: 'late',
            scoredById: ADMIN_A,
          },
        }),
        prisma.leadAIInsight.create({
          data: {
            tenantId: TENANT_A,
            leadId: leadA,
            conversionProbability: 50,
            estimatedValue: 1000,
            churnRisk: 'LOW',
            engagementScore: 10,
            lastEngagementDays: 1,
          },
        }),
        prisma.contactAIInsight.create({
          data: {
            tenantId: TENANT_A,
            contactId: contactA,
            conversionProbability: 50,
            lifetimeValue: 1000,
            churnRisk: 'LOW',
            engagementScore: 10,
            lastEngagementDays: 1,
          },
        }),
        prisma.aIInsight.create({
          data: {
            tenantId: TENANT_A,
            type: 'lead',
            category: 'scoring',
            title: 'Late insight',
            description: 'Derived from erased data',
            confidence: 80,
            priority: 'high',
            entityType: 'lead',
            entityId: leadA,
          },
        }),
      ];
      for (const write of late) {
        await expect(write).rejects.toThrow(/DSAR: .* was erased/);
      }
      expect(await prisma.aIScore.count({ where: { leadId: leadA } })).toBe(0);
      // Someone never erased is untouched by the guard.
      await expect(
        prisma.aIScore.create({
          data: {
            tenantId: TENANT_A,
            leadId: leadTagged,
            score: 40,
            confidence: 0.5,
            factors: {},
            modelVersion: 'v1',
            scoredById: ADMIN_A,
          },
        })
      ).resolves.toMatchObject({ leadId: leadTagged });
    });

    it('refuses a save from a snapshot read before the erasure (codex HIGH: no resurrection)', async () => {
      // An edit that read the record before the erasure saves it afterwards, old address and all.
      await expect(
        prisma.contact.update({
          where: { id: contactA },
          data: { email: `${RUN}-ada-again@example.invalid`, firstName: 'Ada', phone: '0' },
        })
      ).rejects.toThrow(/DSAR: contacts .* was erased/);
      await expect(
        prisma.lead.update({
          where: { id: leadA },
          data: { email: `${RUN}-ada-again@example.invalid`, firstName: 'Ada' },
        })
      ).rejects.toThrow(/DSAR: leads .* was erased/);
      const contact = await prisma.contact.findUniqueOrThrow({ where: { id: contactA } });
      expect(contact.email).toBe(`erased-${contactA}@erased.invalid`);
      expect(contact.phone).toBeNull();
      const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadA } });
      expect(lead.email).toBe(`erased-${leadA}@erased.invalid`);
      expect(lead.firstName).toBeNull();
      // A write that keeps the erased address (for example a status change) still works.
      await expect(
        prisma.lead.update({
          where: { id: leadA },
          data: { email: `erased-${leadA}@erased.invalid`, status: 'UNQUALIFIED' },
        })
      ).resolves.toMatchObject({ status: 'UNQUALIFIED' });
    });
  });
});
