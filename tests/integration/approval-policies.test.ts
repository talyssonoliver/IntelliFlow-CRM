/**
 * PG-198 — approval policy tables, real-Database integration test.
 *
 * Lives in `tests/integration/` so it runs in the CI "Integration Tests" lane and pre-ship.
 * Proves the Class A migrations `20261016120000_approval_policies` and
 * `20261016120100_agent_actions_pending_sweep_idx` on a real Postgres: safe defaults
 * (AI auto-approval off), CHECK constraints, case-insensitive names and one default
 * per queue, one policy per (agent, action) pair, tenant- and scope-consistent
 * assignments, cascade/SET NULL behaviour, RLS, and the nullable agent confidence.
 *
 * Skips cleanly when DATABASE_URL is not set.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../packages/db/generated/prisma/client';
import { applySchemaSql, createIndexConcurrently } from './schema-lock';

const MIGRATIONS = join(__dirname, '../../packages/db/prisma/migrations');
const POLICY_MIGRATION = join(MIGRATIONS, '20261016120000_approval_policies/migration.sql');
const INDEX_MIGRATION = join(
  MIGRATIONS,
  '20261016120100_agent_actions_pending_sweep_idx/migration.sql'
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

function readSql(path: string): string[] {
  const sql = readFileSync(path, 'utf-8')
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  return splitStatements(sql);
}

/**
 * CI builds its test database with `prisma db push`, which creates tables from
 * schema.prisma but never runs migration SQL: the CHECK constraints, the
 * expression/partial unique indexes and the RLS policies this suite asserts are
 * absent there. When they are missing, rebuild the two policy tables from the
 * migration's own SQL (they hold only this suite's rows). The agent_actions
 * column changes are applied only when db push has not already made them. All of it
 * runs under the shared schema lock (see ./schema-lock).
 */
async function ensureMigrationSql(client: any): Promise<void> {
  const present = await client.$queryRawUnsafe(
    `SELECT 1 FROM pg_constraint WHERE conname = 'approval_policies_scope_check'`
  );
  if (present.length === 0) {
    const columns = await client.$queryRawUnsafe(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'agent_actions' AND column_name = 'escalatedAt'`
    );
    const statements = [
      'DROP TABLE IF EXISTS "approval_policy_assignments", "approval_policies" CASCADE',
    ];
    for (const stmt of readSql(POLICY_MIGRATION)) {
      if (columns.length > 0 && /^ALTER TABLE "agent_actions"/.test(stmt)) continue;
      statements.push(stmt);
    }
    await applySchemaSql(DB_URL!, statements);
  }
  // CONCURRENTLY cannot run in a transaction: one statement at a time, outside it.
  for (const stmt of readSql(INDEX_MIGRATION)) await createIndexConcurrently(DB_URL!, stmt);
}

const DB_URL = process.env.DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;

if (!DB_URL) {
  console.log('Skipping approval-policies integration test: DATABASE_URL not set');
}

const RUN = `pg198_${Date.now()}`;
const TENANT_A = `${RUN}_a`;
const TENANT_B = `${RUN}_b`;
const USER_A = `${RUN}_ua`;
const USER_GONE = `${RUN}_ugone`;

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

describeDb('PG-198 approval policies (real DB)', () => {
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
    for (const id of [USER_A, USER_GONE]) {
      await prisma.user.create({
        data: { id, tenantId: TENANT_A, email: `${id}@example.invalid` },
      });
    }
    dbReady = true;
  });

  afterAll(async () => {
    if (!prisma) return;
    if (dbReady) {
      const tenants = { in: [TENANT_A, TENANT_B] };
      await prisma.approvalPolicy.deleteMany({ where: { tenantId: tenants } });
      await prisma.agentAction.deleteMany({ where: { tenantId: tenants } });
      await prisma.user.deleteMany({ where: { tenantId: tenants } });
      await prisma.tenant.deleteMany({ where: { id: tenants } });
    }
    await prisma.$disconnect();
  });

  let seq = 0;
  function policy(extra: Record<string, unknown> = {}) {
    seq += 1;
    return prisma.approvalPolicy.create({
      data: {
        tenantId: TENANT_A,
        name: `${RUN} policy ${seq}`,
        scope: 'AGENT_TOOL',
        timeoutMinutes: 60,
        ...extra,
      },
    });
  }

  function assignment(p: { id: string; tenantId: string; scope: string }, extra = {}) {
    return prisma.approvalPolicyAssignment.create({
      data: {
        tenantId: p.tenantId,
        policyId: p.id,
        scope: p.scope,
        agentKey: 'create_case',
        actionType: 'CREATE',
        ...extra,
      },
    });
  }

  describe('defaults', () => {
    it('are safe: AI auto-approval and escalation off, slate, USER reviewer', async () => {
      const p = await policy();
      expect(p).toMatchObject({
        colorToken: 'slate',
        isDefault: false,
        minReviewerRole: 'USER',
        autoApproveEnabled: false,
        autoApproveMinConfidence: null,
        escalationEnabled: false,
        escalateAfterMinutes: null,
        escalationTargetUserId: null,
      });
    });
  });

  describe('CHECK constraints', () => {
    it.each([
      ['colour outside the allowlist', { colorToken: 'gold' }],
      ['unknown scope', { scope: 'TICKETS' }],
      ['unknown reviewer role', { minReviewerRole: 'OWNER' }],
      ['timeout below 5 minutes', { timeoutMinutes: 4 }],
      ['timeout above 7 days', { timeoutMinutes: 10081 }],
      ['threshold 89', { autoApproveMinConfidence: 89 }],
      ['threshold 100', { autoApproveMinConfidence: 100 }],
      ['auto-approve without a threshold', { autoApproveEnabled: true }],
      ['escalation without a delay', { escalationEnabled: true }],
      ['escalation delay equal to the timeout', { escalateAfterMinutes: 60 }],
      ['escalation delay below 5 minutes', { escalateAfterMinutes: 4 }],
    ])('rejects %s', async (_label, extra) => {
      await expectRejected(policy(extra), CHECK);
    });

    it('accepts a fully configured policy', async () => {
      const p = await policy({
        colorToken: 'amber',
        minReviewerRole: 'MANAGER',
        autoApproveEnabled: true,
        autoApproveMinConfidence: 95,
        escalationEnabled: true,
        escalateAfterMinutes: 30,
        escalationTargetUserId: USER_A,
      });
      expect(p.autoApproveMinConfidence).toBe(95);
    });

    it('rejects a "*" / "*" assignment', async () => {
      const p = await policy();
      await expectRejected(assignment(p, { agentKey: '*', actionType: '*' }), CHECK);
    });
  });

  describe('uniqueness', () => {
    it('names are unique per tenant and queue, case-insensitively', async () => {
      await policy({ name: `${RUN} Strict` });
      await expectRejected(policy({ name: `${RUN} STRICT` }), UNIQUE);
      const otherQueue = await policy({ name: `${RUN} strict`, scope: 'AUTO_RESPONSE' });
      expect(otherQueue.scope).toBe('AUTO_RESPONSE');
      const otherTenant = await policy({ name: `${RUN} strict`, tenantId: TENANT_B });
      expect(otherTenant.tenantId).toBe(TENANT_B);
    });

    it('allows at most one default per tenant and queue', async () => {
      await policy({ isDefault: true, tenantId: TENANT_B });
      await expectRejected(policy({ isDefault: true, tenantId: TENANT_B }), UNIQUE);
      const otherQueue = await policy({
        isDefault: true,
        tenantId: TENANT_B,
        scope: 'AUTO_RESPONSE',
      });
      expect(otherQueue.isDefault).toBe(true);
    });

    it('routes each (agent, action) pair of a queue to one policy only', async () => {
      const first = await policy();
      const second = await policy();
      await assignment(first, { agentKey: 'update_case', actionType: 'UPDATE' });
      await expectRejected(
        assignment(second, { agentKey: 'update_case', actionType: 'UPDATE' }),
        UNIQUE
      );
    });
  });

  describe('tenant and scope consistency', () => {
    it('rejects an assignment whose scope differs from its policy', async () => {
      const p = await policy();
      await expectRejected(assignment({ ...p, scope: 'AUTO_RESPONSE' }), FOREIGN_KEY);
    });

    it('rejects an assignment carrying another tenant', async () => {
      const p = await policy();
      await expectRejected(assignment({ ...p, tenantId: TENANT_B }), FOREIGN_KEY);
    });

    it('cascades a scope change and a delete to assignments', async () => {
      const p = await policy();
      await assignment(p, { agentKey: '*', actionType: 'DRAFT' });
      await prisma.approvalPolicy.update({
        where: { id: p.id },
        data: { scope: 'AUTO_RESPONSE' },
      });
      const moved = await prisma.approvalPolicyAssignment.findMany({ where: { policyId: p.id } });
      expect(moved.map((a: { scope: string }) => a.scope)).toEqual(['AUTO_RESPONSE']);

      await prisma.approvalPolicy.delete({ where: { id: p.id } });
      const left = await prisma.approvalPolicyAssignment.count({ where: { policyId: p.id } });
      expect(left).toBe(0);
    });

    it('clears the escalation target when that user is deleted', async () => {
      const p = await policy({
        escalationEnabled: true,
        escalateAfterMinutes: 30,
        escalationTargetUserId: USER_GONE,
      });
      await prisma.user.delete({ where: { id: USER_GONE } });
      const after = await prisma.approvalPolicy.findUnique({ where: { id: p.id } });
      expect(after.escalationTargetUserId).toBeNull();
      expect(after.escalationEnabled).toBe(true);
    });
  });

  describe('agent_actions', () => {
    it('stores a NULL confidence and the escalation columns', async () => {
      const action = await prisma.agentAction.create({
        data: {
          tenantId: TENANT_A,
          actionType: 'create_case',
          description: 'Create case',
          aiReasoning: '{}',
          confidenceScore: null,
          entityId: `${RUN}_e`,
          entityType: 'case',
          entityName: 'Case',
          previousState: {},
          proposedState: {},
          agentId: USER_A,
          agentName: 'session',
          expiresAt: new Date(Date.now() + 60_000),
          escalatedAt: new Date(),
          escalatedTo: USER_A,
        },
      });
      expect(action.confidenceScore).toBeNull();
      expect(action.escalatedTo).toBe(USER_A);
    });

    it('has the partial sweep index', async () => {
      const rows = await prisma.$queryRawUnsafe(
        `SELECT indexdef FROM pg_indexes WHERE indexname = 'agent_actions_pending_sweep_idx'`
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].indexdef).toMatch(/PENDING_APPROVAL/);
    });
  });

  it('enables row-level security on both policy tables', async () => {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('approval_policies', 'approval_policy_assignments') ORDER BY relname`
    );
    expect(rows).toEqual([
      { relname: 'approval_policies', relrowsecurity: true },
      { relname: 'approval_policy_assignments', relrowsecurity: true },
    ]);
  });
});
