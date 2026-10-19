/**
 * PG-199 — tenant model configuration, real-Database integration test.
 *
 * Lives in `tests/integration/` so it runs in the CI "Integration Tests" lane and pre-ship.
 * Proves the Class A migrations `20261019120000_tenant_model_config` (new nullable
 * columns, relaxed `tier`, named CHECK constraints) and `20261019120100_tenant_ai_config_rls`
 * (tenant isolation policy) on a real Postgres, plus tenant scoping by explicit tenantId.
 *
 * Skips cleanly when DATABASE_URL is not set.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../packages/db/generated/prisma/client';

const MIGRATIONS = join(__dirname, '../../packages/db/prisma/migrations');
const CONFIG_MIGRATION = join(MIGRATIONS, '20261019120000_tenant_model_config/migration.sql');
const RLS_MIGRATION = join(MIGRATIONS, '20261019120100_tenant_ai_config_rls/migration.sql');

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

function readSql(path: string): string[] {
  const sql = readFileSync(path, 'utf-8')
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  return splitStatements(sql);
}

/**
 * CI builds its test database with `prisma db push`, which adds the new columns from
 * schema.prisma but never runs migration SQL, so the named CHECK constraints and the
 * RLS policy are absent there. `tenant_ai_config` may hold other suites' rows, so it is
 * never dropped: each migration statement is replayed only when its object is missing.
 */
async function ensureMigrationSql(client: any): Promise<void> {
  const columns: { column_name: string }[] = await client.$queryRawUnsafe(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'tenant_ai_config'`
  );
  const constraints: { conname: string }[] = await client.$queryRawUnsafe(
    `SELECT conname FROM pg_constraint WHERE conrelid = '"tenant_ai_config"'::regclass`
  );
  const hasColumn = (name: string) => columns.some((c) => c.column_name === name);
  const hasConstraint = (name: string) => constraints.some((c) => c.conname === name);
  for (const stmt of readSql(CONFIG_MIGRATION)) {
    const addColumn = /ADD COLUMN\s+"(\w+)"/.exec(stmt);
    if (addColumn && hasColumn(addColumn[1])) continue;
    const addConstraint = /ADD CONSTRAINT\s+"(\w+)"/.exec(stmt);
    if (addConstraint && hasConstraint(addConstraint[1])) continue;
    await client.$executeRawUnsafe(stmt);
  }
  for (const stmt of readSql(RLS_MIGRATION)) await client.$executeRawUnsafe(stmt);
}

const DB_URL = process.env.DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;

if (!DB_URL) {
  console.log('Skipping model-config integration test: DATABASE_URL not set');
}

const RUN = `pg199_${Date.now()}`;
const TENANT_A = `${RUN}_a`;
const TENANT_B = `${RUN}_b`;

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

describeDb('PG-199 tenant model config (real DB)', () => {
  let prisma: any;
  let dbReady = false;

  beforeEach((ctx) => {
    if (!dbReady) ctx.skip();
  });

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL! }) });
    await ensureMigrationSql(prisma);
    for (const id of [TENANT_A, TENANT_B]) {
      await prisma.tenant.create({ data: { id, name: id, slug: id } });
    }
    dbReady = true;
  });

  afterAll(async () => {
    if (!prisma) return;
    if (dbReady) {
      const tenants = { in: [TENANT_A, TENANT_B] };
      await prisma.tenantAIConfig.deleteMany({ where: { tenantId: tenants } });
      await prisma.tenant.deleteMany({ where: { id: tenants } });
    }
    await prisma.$disconnect();
  });

  function row(purpose: string, extra: Record<string, unknown> = {}, tenantId = TENANT_A) {
    return prisma.tenantAIConfig.create({ data: { tenantId, purpose, ...extra } });
  }

  async function cleanup() {
    await prisma.tenantAIConfig.deleteMany({ where: { tenantId: { in: [TENANT_A, TENANT_B] } } });
  }

  describe('columns and defaults', () => {
    it('accepts a row with a NULL tier and empty fallbacks (caller defaults apply)', async () => {
      const r = await row('scoring');
      expect(r).toMatchObject({
        tier: null,
        modelId: null,
        fallbackModelIds: [],
        monthlyCostCeilingCents: null,
      });
      await cleanup();
    });

    it('stores a pin, ordered fallbacks and a ceiling', async () => {
      const r = await row('reasoning', {
        modelId: 'claude-sonnet-4-5',
        fallbackModelIds: ['claude-haiku-4-5', 'gpt-oss-20b-free'],
        monthlyCostCeilingCents: 5000,
        temperature: 0.4,
        maxTokens: 2000,
      });
      expect(r.fallbackModelIds).toEqual(['claude-haiku-4-5', 'gpt-oss-20b-free']);
      expect(r.monthlyCostCeilingCents).toBe(5000);
      await cleanup();
    });

    it('allows a 0 ceiling (block outright)', async () => {
      const r = await row('email', { monthlyCostCeilingCents: 0 });
      expect(r.monthlyCostCeilingCents).toBe(0);
      await cleanup();
    });
  });

  describe('CHECK constraints', () => {
    it.each([
      ['unknown purpose', 'billing', {}],
      ['unknown tier', 'scoring', { tier: 'gold' }],
      ['temperature above 2', 'scoring', { temperature: 2.5 }],
      ['temperature below 0', 'scoring', { temperature: -0.1 }],
      ['maxTokens 0', 'scoring', { maxTokens: 0 }],
      ['negative ceiling', 'scoring', { monthlyCostCeilingCents: -1 }],
      ['ceiling above 2,000,000', 'scoring', { monthlyCostCeilingCents: 2_000_001 }],
      ['four fallbacks', 'reasoning', { fallbackModelIds: ['a', 'b', 'c', 'd'] }],
      [
        'pinned primary inside its fallbacks',
        'reasoning',
        { modelId: 'claude-sonnet-4-5', fallbackModelIds: ['claude-sonnet-4-5'] },
      ],
    ])('rejects %s', async (_label, purpose, extra) => {
      await expectRejected(row(purpose as string, extra as Record<string, unknown>), CHECK);
    });
  });

  describe('tenant scoping', () => {
    it('keeps one row per (tenant, purpose)', async () => {
      await row('structured');
      await expectRejected(row('structured'), UNIQUE);
      await cleanup();
    });

    it('never returns another tenant’s row when queried with an explicit tenantId', async () => {
      await row('scoring', { modelId: 'gpt-4o-mini' }, TENANT_A);
      await row('scoring', { modelId: 'mistral-small' }, TENANT_B);
      const forA = await prisma.tenantAIConfig.findMany({
        where: { tenantId: TENANT_A, purpose: 'scoring' },
      });
      expect(forA).toHaveLength(1);
      expect(forA[0].modelId).toBe('gpt-4o-mini');
      const foreign = await prisma.tenantAIConfig.findFirst({
        where: {
          tenantId: TENANT_A,
          id: (await prisma.tenantAIConfig.findFirst({ where: { tenantId: TENANT_B } })).id,
        },
      });
      expect(foreign).toBeNull();
      await cleanup();
    });
  });

  describe('row-level security (defence in depth)', () => {
    it('is enabled with a tenant isolation policy', async () => {
      const rls = await prisma.$queryRawUnsafe(
        `SELECT relrowsecurity FROM pg_class WHERE relname = 'tenant_ai_config'`
      );
      expect(rls).toEqual([{ relrowsecurity: true }]);
      const policies = await prisma.$queryRawUnsafe(
        `SELECT policyname FROM pg_policies WHERE tablename = 'tenant_ai_config'`
      );
      expect(policies).toEqual([{ policyname: 'tenant_ai_config_tenant_isolation' }]);
    });
  });
});
