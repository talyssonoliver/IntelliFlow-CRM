/**
 * PG-208 — task automation, real-Database integration test (ADR-084).
 *
 * Lives in `tests/integration/` so it runs in the CI "Integration Tests" lane and pre-ship.
 * Section A proves the Class A migration `20261020120000_task_automation` on a real Postgres:
 * CHECKs (trigger-column consistency, colour palette, statuses), case-insensitive names,
 * the partial unique duplicate-rule key, per-rule idempotency, the tenant-consistent run → rule
 * FK, RLS enabled, cascades, and encrypted webhook secrets at rest.
 *
 * Skips only when DATABASE_URL is not set. A setup failure fails the suite (no silent skip).
 */

import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../packages/db/generated/prisma/client';
import { fieldEncryptionExtension, isEncrypted } from '../../packages/db/src/field-encryption';
import { TASK_AUTOMATION_TAG_COLOR_TOKENS } from '../../packages/validators/src/task-automation';
import { createTaskAutomationStore } from '../../apps/api/src/modules/task/automation/task-automation-store';
import { triggerColumns } from '../../apps/api/src/modules/task/task-automation.router';
import {
  WebhookFailureLimiter,
  handleTaskAutomationWebhook,
  sha256Hex,
  signWebhookPayload,
} from '../../apps/api/src/modules/task/automation/task-automation-webhook';
import { webhookEncryptionReady } from '../../apps/api/src/modules/task/automation/task-automation-runtime';
import { applySchemaSql } from './schema-lock';

const MIGRATION = join(
  __dirname,
  '../../packages/db/prisma/migrations/20261020120000_task_automation/migration.sql'
);
const TABLES = [
  'task_automation_runs',
  'task_automation_rules',
  'task_automation_settings',
  'task_automation_tags',
];

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

/**
 * CI builds its test database with `prisma db push`, which never runs migration SQL: the
 * CHECKs, the expression/partial indexes and the RLS policies are absent there. When they
 * are missing, rebuild the four task-automation tables from the migration's own SQL (they
 * hold only this suite's rows), children first, under the shared schema lock (L14).
 */
async function ensureMigrationSql(client: any): Promise<void> {
  // Keyed on the newest object in the migration, so an older local copy is replaced.
  const present = await client.$queryRawUnsafe(
    `SELECT 1 FROM information_schema.columns
      WHERE table_name = 'task_automation_runs' AND column_name = 'actions'`
  );
  if (present.length > 0) return;
  await applySchemaSql(DB_URL!, [
    'DROP TABLE IF EXISTS ' + TABLES.map((t) => '"' + t + '"').join(', ') + ' CASCADE',
    ...splitStatements(withoutComments(MIGRATION)),
  ]);
}

const DB_URL = process.env.DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;

if (!DB_URL) {
  console.log('Skipping task-automation integration test: DATABASE_URL not set');
}

const RUN = `pg208_${Date.now()}`;
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

const ACTIONS = [
  {
    type: 'CREATE_TASK',
    titleTemplate: 'Call',
    priority: 'MEDIUM',
    dueInDays: 1,
    linkToRecord: true,
  },
];

function key(): string {
  return randomBytes(32).toString('hex');
}

/** Valid column sets per trigger type (each test overrides one thing). */
function eventRule(tenantId: string, extra: Record<string, unknown> = {}) {
  return {
    tenantId,
    name: `Event ${Math.random().toString(36).slice(2, 8)}`,
    triggerType: 'ENTITY_EVENT',
    eventType: 'lead.created',
    actions: ACTIONS,
    ruleKey: key(),
    ...extra,
  };
}

function scheduleRule(tenantId: string, extra: Record<string, unknown> = {}) {
  return {
    tenantId,
    name: `Schedule ${Math.random().toString(36).slice(2, 8)}`,
    triggerType: 'SCHEDULE',
    scheduleCadence: 'daily',
    scheduleTimeOfDay: '09:00',
    scheduleCron: '0 9 * * *',
    scheduleTimezone: 'Europe/London',
    nextRunAt: new Date(Date.now() + 3_600_000),
    actions: ACTIONS,
    ruleKey: key(),
    ...extra,
  };
}

function webhookRule(tenantId: string, extra: Record<string, unknown> = {}) {
  return {
    tenantId,
    name: `Webhook ${Math.random().toString(36).slice(2, 8)}`,
    triggerType: 'WEBHOOK',
    webhookTokenHash: key(),
    webhookTokenPrefix: 'tat_abcd',
    webhookSecret: key(),
    actions: ACTIONS,
    ...extra,
  };
}

describeDb('PG-208 task automation (real DB)', () => {
  let prisma: any;

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL! }) });
    await ensureMigrationSql(prisma);
    for (const id of [TENANT_A, TENANT_B]) {
      await prisma.tenant.create({ data: { id, name: id, slug: id } });
    }
  }, 120_000);

  afterAll(async () => {
    if (!prisma) return;
    const tenants = { in: [TENANT_A, TENANT_B] };
    await prisma.taskAutomationRun.deleteMany({ where: { tenantId: tenants } });
    await prisma.taskAutomationRule.deleteMany({ where: { tenantId: tenants } });
    await prisma.taskAutomationSetting.deleteMany({ where: { tenantId: tenants } });
    await prisma.taskAutomationTag.deleteMany({ where: { tenantId: tenants } });
    await prisma.tenant.deleteMany({ where: { id: tenants } });
    await prisma.$disconnect();
  });

  describe('constraints', () => {
    it('accepts one valid rule per trigger type with the column defaults', async () => {
      for (const data of [eventRule(TENANT_A), scheduleRule(TENANT_A), webhookRule(TENANT_A)]) {
        const row = await prisma.taskAutomationRule.create({ data });
        expect(row).toMatchObject({
          isActive: true,
          sortOrder: 0,
          tags: [],
          rrCursor: 0,
          suppressedCount: 0,
        });
      }
    });

    it.each([
      ['an event rule without an event type', () => eventRule(TENANT_A, { eventType: null })],
      [
        'an event rule with schedule columns',
        () => eventRule(TENANT_A, { scheduleCron: '0 9 * * *' }),
      ],
      [
        'an event rule with a webhook secret',
        () => eventRule(TENANT_A, { webhookSecret: 'x'.repeat(10) }),
      ],
      ['an event rule without a rule key', () => eventRule(TENANT_A, { ruleKey: null })],
      ['an unknown event type', () => eventRule(TENANT_A, { eventType: 'task.created' })],
      [
        'an active schedule rule without a next run',
        () => scheduleRule(TENANT_A, { nextRunAt: null }),
      ],
      ['a weekday outside 0-6', () => scheduleRule(TENANT_A, { scheduleDayOfWeek: 7 })],
      ['a day of month outside 1-28', () => scheduleRule(TENANT_A, { scheduleDayOfMonth: 29 })],
      ['a malformed time of day', () => scheduleRule(TENANT_A, { scheduleTimeOfDay: '24:00' })],
      ['a schedule rule without a cron', () => scheduleRule(TENANT_A, { scheduleCron: null })],
      [
        'a schedule rule with an event type',
        () => scheduleRule(TENANT_A, { eventType: 'lead.created' }),
      ],
      ['an unknown cadence', () => scheduleRule(TENANT_A, { scheduleCadence: 'hourly' })],
      [
        'a webhook rule without a token hash',
        () => webhookRule(TENANT_A, { webhookTokenHash: null }),
      ],
      ['a webhook rule without a secret', () => webhookRule(TENANT_A, { webhookSecret: null })],
      ['a webhook rule with a rule key', () => webhookRule(TENANT_A, { ruleKey: key() })],
      ['an unknown trigger type', () => eventRule(TENANT_A, { triggerType: 'MANUAL' })],
      ['a padded name', () => eventRule(TENANT_A, { name: ' Padded ' })],
      ['a negative sort order', () => eventRule(TENANT_A, { sortOrder: -1 })],
      [
        'eleven tags',
        () => eventRule(TENANT_A, { tags: Array.from({ length: 11 }, (_, i) => `t${i}`) }),
      ],
      ['an unknown last-run status', () => eventRule(TENANT_A, { lastRunStatus: 'DONE' })],
    ])('rejects %s', async (_label, build) => {
      await expectRejected(prisma.taskAutomationRule.create({ data: build() }), CHECK);
    });

    it('bounds the per-rule hourly cap', async () => {
      await expectRejected(
        prisma.taskAutomationSetting.create({
          data: { tenantId: TENANT_B, maxRunsPerRulePerHour: 0 },
        }),
        CHECK
      );
      const row = await prisma.taskAutomationSetting.create({ data: { tenantId: TENANT_B } });
      expect(row).toMatchObject({
        automationEnabled: true,
        maxRunsPerRulePerHour: 60,
        notifyRuleOwnerOnFailure: false,
      });
    });

    it('uses the 18-token tag palette from the validators', async () => {
      await expectRejected(
        prisma.taskAutomationTag.create({
          data: { tenantId: TENANT_A, name: 'Neon', colorToken: 'neon' },
        }),
        CHECK
      );
      const rows: Array<{ def: string }> = await prisma.$queryRawUnsafe(
        `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'task_automation_tags_colorToken_check'`
      );
      const tokens = [...rows[0].def.matchAll(/'([a-z]+)'/g)].map((m) => m[1]).sort();
      expect(tokens).toEqual([...TASK_AUTOMATION_TAG_COLOR_TOKENS].sort());
    });

    it('rejects an unknown run status', async () => {
      const rule = await prisma.taskAutomationRule.create({ data: eventRule(TENANT_A) });
      await expectRejected(
        prisma.taskAutomationRun.create({
          data: {
            tenantId: TENANT_A,
            ruleId: rule.id,
            triggerType: 'ENTITY_EVENT',
            idempotencyKey: 'k',
            status: 'DONE',
          },
        }),
        CHECK
      );
    });
  });

  describe('constraints: columns written by the router', () => {
    // The router writes these exact columns; a JSON null in eventFilter would break the CHECK.
    it.each([
      [
        'schedule',
        {
          type: 'SCHEDULE',
          cadence: 'weekly',
          dayOfWeek: 1,
          timeOfDay: '09:00',
          timezone: 'Europe/London',
        },
      ],
      ['webhook', { type: 'WEBHOOK' }],
      ['event', { type: 'ENTITY_EVENT', eventType: 'lead.created' }],
      [
        'stage filter',
        {
          type: 'ENTITY_EVENT',
          eventType: 'opportunity.stage_changed',
          filter: { toStage: 'PROPOSAL' },
        },
      ],
    ] as const)('accepts a %s rule from triggerColumns', async (_label, trigger) => {
      const columns = triggerColumns(trigger as never, new Date());
      const base =
        trigger.type === 'WEBHOOK'
          ? webhookRule(TENANT_A)
          : {
              tenantId: TENANT_A,
              name: `Router ${key().slice(0, 8)}`,
              actions: ACTIONS,
              ruleKey: key(),
            };
      const row = await prisma.taskAutomationRule.create({ data: { ...base, ...columns } });
      const stored = await prisma.$queryRawUnsafe(
        'SELECT "eventFilter" IS NULL AS "isNull" FROM task_automation_rules WHERE id = $1',
        row.id
      );
      expect(stored[0].isNull).toBe(trigger.type !== 'ENTITY_EVENT' || !('filter' in trigger));
    });
  });

  describe('constraints: deactivated schedules', () => {
    it('lets an inactive schedule rule keep no next run', async () => {
      const row = await prisma.taskAutomationRule.create({
        data: scheduleRule(TENANT_A, { isActive: false, nextRunAt: null }),
      });
      expect(row.nextRunAt).toBeNull();
    });
  });

  describe('constraints: uniqueness and keys', () => {
    it('makes lower(name) unique per tenant for rules and tags, not across tenants', async () => {
      await prisma.taskAutomationRule.create({ data: eventRule(TENANT_A, { name: 'Follow Up' }) });
      await expectRejected(
        prisma.taskAutomationRule.create({ data: eventRule(TENANT_A, { name: 'follow up' }) }),
        UNIQUE
      );
      await prisma.taskAutomationRule.create({ data: eventRule(TENANT_B, { name: 'follow up' }) });

      await prisma.taskAutomationTag.create({ data: { tenantId: TENANT_A, name: 'VIP' } });
      await expectRejected(
        prisma.taskAutomationTag.create({ data: { tenantId: TENANT_A, name: 'vip' } }),
        UNIQUE
      );
      await prisma.taskAutomationTag.create({ data: { tenantId: TENANT_B, name: 'vip' } });
    });

    it('allows one ACTIVE rule per rule key (DoD 9), inactive copies allowed', async () => {
      const ruleKey = key();
      await prisma.taskAutomationRule.create({ data: eventRule(TENANT_A, { ruleKey }) });
      await expectRejected(
        prisma.taskAutomationRule.create({ data: eventRule(TENANT_A, { ruleKey }) }),
        UNIQUE
      );
      await prisma.taskAutomationRule.create({
        data: eventRule(TENANT_A, { ruleKey, isActive: false }),
      });
      await prisma.taskAutomationRule.create({ data: eventRule(TENANT_B, { ruleKey }) });
    });

    it('makes the idempotency key unique per rule', async () => {
      const rule = await prisma.taskAutomationRule.create({ data: eventRule(TENANT_A) });
      const run = {
        tenantId: TENANT_A,
        ruleId: rule.id,
        triggerType: 'ENTITY_EVENT',
        idempotencyKey: 'event:e1',
      };
      await prisma.taskAutomationRun.create({ data: run });
      await expectRejected(prisma.taskAutomationRun.create({ data: run }), UNIQUE);
    });

    it('rejects a run whose tenant differs from its rule (composite FK)', async () => {
      const rule = await prisma.taskAutomationRule.create({ data: eventRule(TENANT_A) });
      await expectRejected(
        prisma.taskAutomationRun.create({
          data: {
            tenantId: TENANT_B,
            ruleId: rule.id,
            triggerType: 'ENTITY_EVENT',
            idempotencyKey: 'x',
          },
        }),
        FOREIGN_KEY
      );
    });

    it('cascades runs when a rule is deleted', async () => {
      const rule = await prisma.taskAutomationRule.create({ data: eventRule(TENANT_A) });
      await prisma.taskAutomationRun.create({
        data: {
          tenantId: TENANT_A,
          ruleId: rule.id,
          triggerType: 'ENTITY_EVENT',
          idempotencyKey: 'cascade',
        },
      });
      await prisma.taskAutomationRule.delete({ where: { id: rule.id } });
      expect(await prisma.taskAutomationRun.count({ where: { ruleId: rule.id } })).toBe(0);
    });

    it('enables RLS on all four tables', async () => {
      const rows: Array<{ relname: string; relrowsecurity: boolean }> =
        await prisma.$queryRawUnsafe(
          `SELECT relname, relrowsecurity FROM pg_class WHERE relname = ANY($1)`,
          TABLES
        );
      expect(rows).toHaveLength(4);
      expect(rows.every((row) => row.relrowsecurity)).toBe(true);
    });

    it('reads rules without a tenant session setting (API role, RLS not forced)', async () => {
      const rule = await prisma.taskAutomationRule.create({ data: webhookRule(TENANT_A) });
      const found = await prisma.taskAutomationRule.findUnique({
        where: { webhookTokenHash: rule.webhookTokenHash },
        select: { id: true, tenantId: true },
      });
      expect(found).toEqual({ id: rule.id, tenantId: TENANT_A });
    });

    it('stores webhook secrets encrypted when the encryption key is configured', async () => {
      const encryptionKey = randomBytes(32);
      const encrypted: any = prisma.$extends(fieldEncryptionExtension({ key: encryptionKey }));
      const secret = key();
      const rule = await encrypted.taskAutomationRule.create({
        data: webhookRule(TENANT_A, { webhookSecret: secret }),
        select: { id: true },
      });
      const raw: Array<{ webhookSecret: string }> = await prisma.$queryRawUnsafe(
        `SELECT "webhookSecret" FROM task_automation_rules WHERE id = $1`,
        rule.id
      );
      expect(isEncrypted(raw[0].webhookSecret)).toBe(true);
      expect(raw[0].webhookSecret).not.toContain(secret);
      const back = await encrypted.taskAutomationRule.findUnique({ where: { id: rule.id } });
      expect(back.webhookSecret).toBe(secret);
    });
  });
  describe('store behaviour', () => {
    function store() {
      return createTaskAutomationStore(prisma);
    }

    it('lets exactly one of two concurrent claims win a schedule slot', async () => {
      const slot = new Date(Date.now() - 60_000);
      const rule = await prisma.taskAutomationRule.create({
        data: scheduleRule(TENANT_A, { nextRunAt: slot }),
      });
      const due = {
        id: rule.id,
        tenantId: TENANT_A,
        nextRunAt: slot,
        scheduleCron: '0 9 * * *',
        scheduleTimezone: 'Europe/London',
      };
      const next = new Date(Date.now() + 86_400_000);
      const results = await Promise.all([
        store().claimDueSchedule(due, next),
        store().claimDueSchedule(due, next),
      ]);
      expect(results.filter(Boolean)).toHaveLength(1);
    });

    it('gives two concurrent run claims disjoint sets', async () => {
      const rule = await prisma.taskAutomationRule.create({ data: eventRule(TENANT_A) });
      await prisma.taskAutomationRun.createMany({
        data: Array.from({ length: 6 }, (_, i) => ({
          tenantId: TENANT_A,
          ruleId: rule.id,
          triggerType: 'ENTITY_EVENT',
          idempotencyKey: `claim-${i}`,
        })),
      });
      const now = new Date();
      const [a, b] = await Promise.all([
        store().claimPendingRuns(50, now),
        store().claimPendingRuns(50, now),
      ]);
      const ids = [...a, ...b].map((run) => run.id).filter((id) => id);
      const mine = ids.filter(Boolean);
      expect(new Set(mine).size).toBe(mine.length);
      const running = await prisma.taskAutomationRun.count({
        where: { ruleId: rule.id, status: 'RUNNING' },
      });
      expect(running).toBe(6);
    });

    it('stores the actions snapshot with the run and returns it when claimed', async () => {
      const rule = await prisma.taskAutomationRule.create({ data: eventRule(TENANT_A) });
      await store().insertRunIfAbsent({
        tenantId: TENANT_A,
        ruleId: rule.id,
        triggerType: 'ENTITY_EVENT',
        idempotencyKey: 'snapshot-1',
        context: {},
        actions: ACTIONS,
      });
      await store().insertRunIfAbsent({
        tenantId: TENANT_A,
        ruleId: rule.id,
        triggerType: 'ENTITY_EVENT',
        idempotencyKey: 'snapshot-2',
        context: {},
      });
      const rows = await prisma.taskAutomationRun.findMany({
        where: { ruleId: rule.id },
        orderBy: { idempotencyKey: 'asc' },
        select: { actions: true },
      });
      expect(rows.map((r: { actions: unknown }) => r.actions)).toEqual([ACTIONS, null]);
    });

    it('reports a duplicate idempotency key instead of inserting twice', async () => {
      const rule = await prisma.taskAutomationRule.create({ data: eventRule(TENANT_A) });
      const run = {
        tenantId: TENANT_A,
        ruleId: rule.id,
        triggerType: 'WEBHOOK',
        idempotencyKey: 'webhook:dup',
        context: {},
        payloadHash: 'a'.repeat(64),
      };
      await expect(store().insertRunIfAbsent(run)).resolves.toMatchObject({ created: true });
      await expect(store().insertRunIfAbsent(run)).resolves.toEqual({
        created: false,
        existingPayloadHash: 'a'.repeat(64),
      });
    });

    it('claims a schedule slot and inserts its run atomically, once across racers', async () => {
      const slot = new Date(Date.now() - 60_000);
      const rule = await prisma.taskAutomationRule.create({
        data: scheduleRule(TENANT_A, { nextRunAt: slot }),
      });
      const due = {
        id: rule.id,
        tenantId: TENANT_A,
        nextRunAt: slot,
        scheduleCron: '0 9 * * *',
        scheduleTimezone: 'Europe/London',
      };
      const next = new Date(Date.now() + 86_400_000);
      const run = {
        tenantId: TENANT_A,
        ruleId: rule.id,
        triggerType: 'SCHEDULE',
        idempotencyKey: `schedule:${slot.toISOString()}`,
        context: {},
      };
      const results = await Promise.all(
        [0, 1, 2].map(() => store().claimSlotAndAdmit(due, next, run, { perHour: 60 }, new Date()))
      );
      expect(results.filter((r) => 'created' in r && r.created)).toHaveLength(1);
      expect(results.filter((r) => 'claimed' in r)).toHaveLength(2);
      await expect(prisma.taskAutomationRun.count({ where: { ruleId: rule.id } })).resolves.toBe(1);
      const stored = await prisma.taskAutomationRule.findUnique({ where: { id: rule.id } });
      expect(stored.nextRunAt.toISOString()).toBe(next.toISOString());
    });

    it('admits a schedule run with actions edited after the due read, not the stale ones', async () => {
      const slot = new Date(Date.now() - 60_000);
      const rule = await prisma.taskAutomationRule.create({
        data: scheduleRule(TENANT_A, { nextRunAt: slot }),
      });
      const due = (await store().findDueSchedules(new Date(), 500)).find((s) => s.id === rule.id);
      expect(due?.actions).toEqual(ACTIONS);
      // The router's update keeps nextRunAt when the cadence is unchanged.
      const edited = [{ ...ACTIONS[0], titleTemplate: 'Edited after the due read' }];
      await prisma.taskAutomationRule.update({ where: { id: rule.id }, data: { actions: edited } });
      const result = await store().claimSlotAndAdmit(
        due!,
        new Date(Date.now() + 86_400_000),
        {
          tenantId: TENANT_A,
          ruleId: rule.id,
          triggerType: 'SCHEDULE',
          idempotencyKey: `schedule:${slot.toISOString()}`,
          context: {},
          actions: due!.actions,
        },
        { perHour: 60 },
        new Date()
      );
      expect(result).toMatchObject({ created: true });
      const stored = await prisma.taskAutomationRun.findFirst({
        where: { ruleId: rule.id },
        select: { actions: true },
      });
      expect(stored.actions).toEqual(edited);
    });

    it.each([
      ['an event', 'ENTITY_EVENT', eventRule, {}],
      ['a webhook', 'WEBHOOK', webhookRule, { perMinute: 60 }],
    ] as const)(
      'admits %s run with the actions the rule holds at admission, not the caller’s read',
      async (_label, triggerType, makeRule, minuteCap) => {
        const rule = await prisma.taskAutomationRule.create({ data: makeRule(TENANT_A) });
        const read = await store().loadRule(TENANT_A, rule.id);
        const edited = [{ ...ACTIONS[0], titleTemplate: `Edited ${triggerType}` }];
        await prisma.taskAutomationRule.update({
          where: { id: rule.id },
          data: { actions: edited },
        });
        const result = await store().admitRun(
          {
            tenantId: TENANT_A,
            ruleId: rule.id,
            triggerType,
            idempotencyKey: `stale-${triggerType}`,
            context: {},
            actions: read!.actions,
          },
          { perHour: 60, ...minuteCap },
          new Date()
        );
        expect(result).toMatchObject({ created: true });
        const stored = await prisma.taskAutomationRun.findFirst({
          where: { ruleId: rule.id },
          select: { actions: true },
        });
        expect(stored.actions).toEqual(edited);
      }
    );

    it('admits nothing for a rule deactivated after the caller read it', async () => {
      const rule = await prisma.taskAutomationRule.create({ data: eventRule(TENANT_A) });
      await prisma.taskAutomationRule.update({ where: { id: rule.id }, data: { isActive: false } });
      const result = await store().admitRun(
        {
          tenantId: TENANT_A,
          ruleId: rule.id,
          triggerType: 'ENTITY_EVENT',
          idempotencyKey: 'deactivated',
          context: {},
          actions: ACTIONS,
        },
        { perHour: 60 },
        new Date()
      );
      expect(result).toEqual({ inactive: true });
      await expect(prisma.taskAutomationRun.count({ where: { ruleId: rule.id } })).resolves.toBe(0);
    });

    it('admits concurrent webhook runs up to the hourly cap and no further', async () => {
      const rule = await prisma.taskAutomationRule.create({ data: eventRule(TENANT_A) });
      const now = new Date();
      const results = await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          store().admitRun(
            {
              tenantId: TENANT_A,
              ruleId: rule.id,
              triggerType: 'WEBHOOK',
              idempotencyKey: `webhook:race-${i}`,
              payloadHash: 'b'.repeat(64),
              context: {},
            },
            { perMinute: 60, perHour: 2 },
            now
          )
        )
      );
      expect(results.filter((r) => 'created' in r && r.created)).toHaveLength(2);
      expect(results.filter((r) => 'capped' in r)).toHaveLength(4);
      await expect(prisma.taskAutomationRun.count({ where: { ruleId: rule.id } })).resolves.toBe(2);
    });

    it('hands N concurrent round-robin increments N distinct cursor values', async () => {
      const rule = await prisma.taskAutomationRule.create({ data: eventRule(TENANT_A) });
      const values = await Promise.all(
        Array.from({ length: 8 }, () => store().incrementRrCursor(TENANT_A, rule.id))
      );
      expect(new Set(values).size).toBe(8);
      expect(Math.max(...values)).toBe(8);
    });

    it('purges only terminal runs older than the cutoff and reaps stuck ones', async () => {
      const rule = await prisma.taskAutomationRule.create({ data: eventRule(TENANT_A) });
      const now = new Date();
      const old = new Date(now.getTime() - 31 * 86_400_000);
      const recent = new Date(now.getTime() - 29 * 86_400_000);
      await prisma.taskAutomationRun.createMany({
        data: [
          {
            tenantId: TENANT_A,
            ruleId: rule.id,
            triggerType: 'ENTITY_EVENT',
            idempotencyKey: 'p-old',
            status: 'SUCCEEDED',
            createdAt: old,
          },
          {
            tenantId: TENANT_A,
            ruleId: rule.id,
            triggerType: 'ENTITY_EVENT',
            idempotencyKey: 'p-old-pending',
            status: 'PENDING',
            createdAt: old,
          },
          {
            tenantId: TENANT_A,
            ruleId: rule.id,
            triggerType: 'ENTITY_EVENT',
            idempotencyKey: 'p-recent',
            status: 'SUCCEEDED',
            createdAt: recent,
          },
          {
            tenantId: TENANT_A,
            ruleId: rule.id,
            triggerType: 'ENTITY_EVENT',
            idempotencyKey: 'p-stuck',
            status: 'RUNNING',
            startedAt: new Date(now.getTime() - 11 * 60_000),
          },
        ],
      });
      await store().purgeRunsBefore(new Date(now.getTime() - 30 * 86_400_000), 500);
      const left = await prisma.taskAutomationRun.findMany({
        where: { ruleId: rule.id },
        select: { idempotencyKey: true },
      });
      expect(left.map((r: { idempotencyKey: string }) => r.idempotencyKey).sort()).toEqual([
        'p-old-pending',
        'p-recent',
        'p-stuck',
      ]);
      await store().reapStaleRuns(new Date(now.getTime() - 10 * 60_000), now);
      const stuck = await prisma.taskAutomationRun.findFirst({
        where: { ruleId: rule.id, idempotencyKey: 'p-stuck' },
      });
      expect(stuck).toMatchObject({ status: 'FAILED', errorCode: 'interrupted' });
    });
  });

  describe('webhook verifier', () => {
    it('accepts a signed request against a real rule and refuses (503) when secrets would be stored unencrypted', async () => {
      const token = 'tat_' + randomBytes(32).toString('base64url');
      const secret = key();
      await prisma.taskAutomationRule.create({
        data: webhookRule(TENANT_A, { webhookTokenHash: sha256Hex(token), webhookSecret: secret }),
      });
      const raw = Buffer.from('{"orderId":"A-1"}');
      const t = String(Math.floor(Date.now() / 1000));
      const headers = {
        'x-intelliflow-signature': `t=${t},v1=${signWebhookPayload(secret, t, 'int-1', raw)}`,
        'idempotency-key': 'int-1',
      };
      const deps = {
        store: createTaskAutomationStore(prisma),
        limiter: new WebhookFailureLimiter(),
        now: () => new Date(),
        encryptionReady: () => true,
      };
      await expect(
        handleTaskAutomationWebhook(token, headers, raw, '127.0.0.1', deps)
      ).resolves.toMatchObject({ status: 202 });
      const unencrypted = {
        ...deps,
        encryptionReady: () =>
          webhookEncryptionReady({ NODE_ENV: 'production' } as NodeJS.ProcessEnv),
      };
      await expect(
        handleTaskAutomationWebhook(token, headers, raw, '127.0.0.1', unencrypted)
      ).resolves.toEqual({
        status: 503,
        body: { error: 'unavailable' },
      });
    });
  });
});
