/**
 * Task Automation Router Tests — PG-208 (ADR-084).
 *
 * The transaction client is prismaMock itself (`$transaction(fn) => fn(prismaMock)`,
 * playbook §12); array transactions resolve their promises. Cross-tenant ids resolve to
 * NOT_FOUND because every lookup is scoped by the caller's tenantId, and nothing is written.
 * Secrets and tokens are built at runtime; nothing secret-shaped is committed.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import {
  prismaMock,
  createTestContext,
  createAdminContext,
  createManagerContext,
  createPublicContext,
  generateTestUUID,
  TEST_UUIDS,
} from '../../../test/setup';

const logAction = vi.fn();
const logPermissionDenied = vi.fn();
vi.mock('../../../security/audit-logger', () => ({
  getAuditLogger: () => ({ logAction, logPermissionDenied }),
}));

// The sensitive-mutation limiter is replaced by a controllable gate; every other tier is real.
const sensitiveGate = vi.fn();
vi.mock('../../../middleware/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../middleware/rate-limit')>();
  return {
    ...actual,
    createDistributedRateLimitMiddleware: (tier: { name: string }, options?: unknown) =>
      tier.name === 'task-automation-sensitive'
        ? (opts: { next: () => Promise<unknown> }) => sensitiveGate(opts)
        : actual.createDistributedRateLimitMiddleware(tier as never, options as never),
  };
});

import {
  assertWebhookEncryptionReady,
  getApiPublicUrl,
  nextScheduledRun,
  taskAutomationRouter,
} from '../task-automation.router';

const tenantId = TEST_UUIDS.tenant;
const R1 = generateTestUUID('ta-rule-1');
const R2 = generateTestUUID('ta-rule-2');
const FOREIGN = generateTestUUID('ta-rule-foreign');
const TAG = generateTestUUID('ta-tag-1');
const U1 = generateTestUUID('ta-user-1');
const U2 = generateTestUUID('ta-user-2');
const NOW = new Date('2026-10-20T10:00:00.000Z');

const createTask = {
  type: 'CREATE_TASK' as const,
  titleTemplate: 'Call {{record.name}}',
  priority: 'MEDIUM' as const,
  dueInDays: 1,
  linkToRecord: true,
};
const eventInput = {
  name: 'Follow up',
  trigger: { type: 'ENTITY_EVENT' as const, eventType: 'lead.created' as const },
  actions: [createTask],
};
const scheduleInput = {
  name: 'Weekly review',
  trigger: {
    type: 'SCHEDULE' as const,
    cadence: 'weekly' as const,
    dayOfWeek: 1,
    timeOfDay: '09:00',
    timezone: 'Europe/London',
  },
  actions: [createTask],
};
const webhookInput = {
  name: 'From billing',
  trigger: { type: 'WEBHOOK' as const },
  actions: [createTask],
};

function ruleRow(overrides: Record<string, unknown> = {}) {
  return {
    id: R1,
    name: 'Follow up',
    description: null,
    isActive: true,
    sortOrder: 0,
    tags: [],
    triggerType: 'ENTITY_EVENT',
    eventType: 'lead.created',
    eventFilter: null,
    scheduleCadence: null,
    scheduleDayOfWeek: null,
    scheduleDayOfMonth: null,
    scheduleTimeOfDay: null,
    scheduleCron: null,
    scheduleTimezone: null,
    nextRunAt: null,
    webhookTokenPrefix: null,
    actions: [createTask],
    lastRunAt: null,
    lastRunStatus: null,
    lastRunOutcome: null,
    suppressedCount: 0,
    createdBy: TEST_UUIDS.admin1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function owned(overrides: Record<string, unknown> = {}) {
  return {
    id: R1,
    name: 'Follow up',
    isActive: true,
    triggerType: 'ENTITY_EVENT',
    scheduleCron: null,
    scheduleTimezone: null,
    ...overrides,
  };
}

function prismaError(code: string, meta?: unknown) {
  return Object.assign(new Error(`prisma ${code}`), { code, meta });
}

async function expectCode(promise: Promise<unknown>, code: TRPCError['code']) {
  await expect(promise).rejects.toMatchObject({ code });
}

const m = prismaMock as any;

function expectNoRuleWrites() {
  expect(m.taskAutomationRule.create).not.toHaveBeenCalled();
  expect(m.taskAutomationRule.update).not.toHaveBeenCalled();
  expect(m.taskAutomationRule.updateMany).not.toHaveBeenCalled();
  expect(m.taskAutomationRule.deleteMany).not.toHaveBeenCalled();
  expect(m.taskAutomationRun.create).not.toHaveBeenCalled();
}

describe('taskAutomationRouter (PG-208)', () => {
  let admin: ReturnType<typeof taskAutomationRouter.createCaller>;
  let manager: ReturnType<typeof taskAutomationRouter.createCaller>;
  let user: ReturnType<typeof taskAutomationRouter.createCaller>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    vi.stubEnv('API_PUBLIC_URL', 'https://api.example.invalid/');
    logAction.mockReset().mockResolvedValue('audit-1');
    logPermissionDenied.mockReset().mockResolvedValue('audit-2');
    sensitiveGate
      .mockReset()
      .mockImplementation((opts: { next: () => Promise<unknown> }) => opts.next());
    m.$transaction.mockImplementation(async (arg: any) =>
      typeof arg === 'function' ? arg(prismaMock) : Promise.all(arg)
    );
    m.$executeRaw.mockResolvedValue(1);
    m.taskAutomationRule.count.mockResolvedValue(0);
    m.taskAutomationTag.findMany.mockResolvedValue([]);
    m.user.findMany.mockResolvedValue([]);
    m.taskAutomationSetting.findUnique.mockResolvedValue(null);
    admin = taskAutomationRouter.createCaller(createAdminContext());
    manager = taskAutomationRouter.createCaller(createManagerContext());
    user = taskAutomationRouter.createCaller(createTestContext());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('rejects an unauthenticated caller', async () => {
    const anon = taskAutomationRouter.createCaller(createPublicContext());
    await expect(anon.list()).rejects.toBeInstanceOf(TRPCError);
  });

  describe('write access', () => {
    it.each([
      ['create', () => user.create(eventInput)],
      ['update', () => user.update({ ...eventInput, id: R1 })],
      ['delete', () => user.delete({ id: R1 })],
      ['setActive', () => user.setActive({ id: R1, isActive: false })],
      ['reorder', () => user.reorder({ ids: [R1] })],
      ['rotateWebhookSecret', () => user.rotateWebhookSecret({ id: R1 })],
      ['regenerateWebhookUrl', () => user.regenerateWebhookUrl({ id: R1 })],
      ['runNow', () => user.runNow({ id: R1 })],
      ['listRuns', () => user.listRuns({ ruleId: R1 })],
      ['settings.update', () => user.settings.update({ automationEnabled: false })],
      ['resetToDefaults', () => user.resetToDefaults()],
      ['tags.create', () => user.tags.create({ name: 'VIP' })],
      ['tags.update', () => user.tags.update({ id: TAG, name: 'VIP' })],
      ['tags.delete', () => user.tags.delete({ id: TAG })],
    ])('%s is FORBIDDEN for a USER, writes nothing and logs the denial', async (_name, call) => {
      await expectCode(call(), 'FORBIDDEN');
      expectNoRuleWrites();
      expect(m.taskAutomationSetting.upsert).not.toHaveBeenCalled();
      expect(m.taskAutomationTag.create).not.toHaveBeenCalled();
      expect(logPermissionDenied).toHaveBeenCalledWith(
        'task',
        expect.any(String),
        expect.stringMatching(/^task_automation:/),
        tenantId,
        expect.any(Object)
      );
    });

    it('lets a MANAGER create an event rule', async () => {
      m.taskAutomationRule.create.mockResolvedValue(ruleRow());
      await expect(manager.create(eventInput)).resolves.toMatchObject({ webhook: null });
    });

    it('keeps MANAGERs off webhook rules', async () => {
      await expectCode(manager.create(webhookInput), 'FORBIDDEN');
      await expectCode(manager.rotateWebhookSecret({ id: R1 }), 'FORBIDDEN');
      await expectCode(manager.regenerateWebhookUrl({ id: R1 }), 'FORBIDDEN');
      m.taskAutomationRule.findFirst.mockResolvedValue(owned({ triggerType: 'WEBHOOK' }));
      await expectCode(manager.delete({ id: R1 }), 'FORBIDDEN');
      expectNoRuleWrites();
    });
  });

  describe('list / listRuns', () => {
    it('returns rules without secrets, settings defaults, tags, catalogue and capabilities', async () => {
      m.taskAutomationRule.findMany.mockResolvedValue([ruleRow()]);
      m.taskAutomationTag.findMany.mockResolvedValue([
        {
          id: TAG,
          name: 'VIP',
          colorToken: 'rose',
          description: null,
          sortOrder: 0,
          isActive: true,
        },
      ]);
      const result = await admin.list();
      const select = m.taskAutomationRule.findMany.mock.calls[0][0].select;
      expect(select.webhookSecret).toBeUndefined();
      expect(select.webhookSecretPrevious).toBeUndefined();
      expect(select.webhookTokenHash).toBeUndefined();
      expect(select.ruleKey).toBeUndefined();
      expect(m.taskAutomationRule.findMany.mock.calls[0][0].where).toEqual({ tenantId });
      expect(result.rules[0]).toMatchObject({
        id: R1,
        trigger: { type: 'ENTITY_EVENT', eventType: 'lead.created' },
      });
      expect(JSON.stringify(result.rules)).not.toMatch(/webhookSecret|webhookTokenHash|ruleKey/);
      expect(result.settings).toEqual({
        automationEnabled: true,
        notifyRuleOwnerOnFailure: false,
        maxRunsPerRulePerHour: 60,
      });
      expect(result.events).toHaveLength(9);
      expect(result).toMatchObject({ canEdit: true, canManageWebhooks: true });
    });

    it('maps schedule and webhook rows back to triggers, and survives corrupt actions', async () => {
      m.taskAutomationRule.findMany.mockResolvedValue([
        ruleRow({
          id: R2,
          triggerType: 'SCHEDULE',
          eventType: null,
          scheduleCadence: 'weekly',
          scheduleDayOfWeek: 1,
          scheduleTimeOfDay: '09:00',
          scheduleCron: '0 9 * * 1',
          scheduleTimezone: 'Europe/London',
          actions: 'not-an-array',
        }),
        ruleRow({ triggerType: 'WEBHOOK', eventType: null, webhookTokenPrefix: 'tat_abcdefgh' }),
        ruleRow({ eventType: 'opportunity.stage_changed', eventFilter: { toStage: 'PROPOSAL' } }),
      ]);
      const { rules } = await user.list();
      expect(rules[0].trigger).toMatchObject({
        type: 'SCHEDULE',
        cadence: 'weekly',
        dayOfWeek: 1,
        timezone: 'Europe/London',
      });
      expect(rules[0].actions).toEqual([]);
      expect(rules[1].trigger).toEqual({ type: 'WEBHOOK' });
      expect(rules[2].trigger).toMatchObject({ filter: { toStage: 'PROPOSAL' } });
    });

    it('refuses to return a stored trigger that breaks the contract', async () => {
      m.taskAutomationRule.findMany.mockResolvedValue([
        ruleRow({ eventType: 'opportunity.stage_changed', eventFilter: { toStage: 'CLOSED_WON' } }),
      ]);
      await expectCode(user.list(), 'INTERNAL_SERVER_ERROR');
    });

    it('shows a USER the page read-only', async () => {
      m.taskAutomationRule.findMany.mockResolvedValue([]);
      await expect(user.list()).resolves.toMatchObject({
        canEdit: false,
        canManageWebhooks: false,
      });
    });

    it('lists the 20 latest runs of an owned rule', async () => {
      m.taskAutomationRule.findFirst.mockResolvedValue(owned());
      m.taskAutomationRun.findMany.mockResolvedValue([]);
      await admin.listRuns({ ruleId: R1 });
      expect(m.taskAutomationRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId, ruleId: R1 },
          take: 20,
          orderBy: { createdAt: 'desc' },
        })
      );
      const select = m.taskAutomationRun.findMany.mock.calls[0][0].select;
      expect(select.context).toBeUndefined();
    });
  });

  describe('create', () => {
    it('creates an event rule under the tenant lock with a hashed rule key', async () => {
      m.taskAutomationRule.create.mockResolvedValue(ruleRow());
      const result = await admin.create(eventInput);
      expect(m.$executeRaw).toHaveBeenCalled();
      const data = m.taskAutomationRule.create.mock.calls[0][0].data;
      expect(data).toMatchObject({
        tenantId,
        name: 'Follow up',
        triggerType: 'ENTITY_EVENT',
        eventType: 'lead.created',
        createdBy: TEST_UUIDS.admin1,
        webhookTokenHash: null,
        webhookSecret: null,
        sortOrder: 0,
      });
      expect(data.ruleKey).toMatch(/^[0-9a-f]{64}$/);
      expect(result.webhook).toBeNull();
      expect(logAction).toHaveBeenCalledWith(
        'CREATE',
        'task',
        R1,
        tenantId,
        expect.objectContaining({ actionReason: 'task_automation.rules.create' })
      );
    });

    it('computes the next run of a schedule rule from now', async () => {
      m.taskAutomationRule.create.mockResolvedValue(
        ruleRow({
          triggerType: 'SCHEDULE',
          eventType: null,
          scheduleCadence: 'weekly',
          scheduleDayOfWeek: 1,
          scheduleTimeOfDay: '09:00',
          scheduleCron: '0 9 * * 1',
          scheduleTimezone: 'Europe/London',
        })
      );
      const result = await admin.create(scheduleInput);
      expect(result.rule.trigger).toEqual({
        type: 'SCHEDULE',
        cadence: 'weekly',
        dayOfWeek: 1,
        timeOfDay: '09:00',
        cronExpression: '0 9 * * 1',
        timezone: 'Europe/London',
      });
      const data = m.taskAutomationRule.create.mock.calls[0][0].data;
      expect(data).toMatchObject({ scheduleCron: '0 9 * * 1', scheduleTimezone: 'Europe/London' });
      expect(data.nextRunAt.toISOString()).toBe('2026-10-26T09:00:00.000Z');
    });

    it('refuses a cadence more frequent than hourly', async () => {
      await expectCode(
        admin.create({
          ...scheduleInput,
          trigger: {
            type: 'SCHEDULE',
            cadence: 'custom',
            cronExpression: '*/5 * * * *',
            timezone: 'UTC',
          },
        }),
        'BAD_REQUEST'
      );
      expectNoRuleWrites();
    });

    it('issues a webhook URL and signing secret once, from plaintext, storing only the hash', async () => {
      m.taskAutomationRule.create.mockResolvedValue(
        ruleRow({ triggerType: 'WEBHOOK', webhookTokenPrefix: 'tat_x' })
      );
      const result = await admin.create(webhookInput);
      const data = m.taskAutomationRule.create.mock.calls[0][0].data;
      const token = result.webhook!.webhookUrl!.split('/').pop()!;
      expect(result.webhook!.webhookUrl).toBe(
        `https://api.example.invalid/api/webhooks/task-automation/${token}`
      );
      expect(token).toMatch(/^tat_[A-Za-z0-9_-]{43}$/);
      expect(data.webhookTokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(data.webhookTokenHash).not.toContain(token);
      expect(data.webhookTokenPrefix).toBe(token.slice(0, 12));
      expect(result.webhook!.signingSecret).toMatch(/^[0-9a-f]{64}$/);
      expect(data.webhookSecret).toBe(result.webhook!.signingSecret);
      expect(data.ruleKey).toBeNull();
      expect(JSON.stringify(result.rule)).not.toContain(result.webhook!.signingSecret!);
    });

    it('needs the public API URL for webhook rules', async () => {
      vi.stubEnv('API_PUBLIC_URL', '');
      await expectCode(admin.create(webhookInput), 'PRECONDITION_FAILED');
      expectNoRuleWrites();
    });

    it('caps a workspace at 50 rules', async () => {
      m.taskAutomationRule.count.mockResolvedValue(50);
      await expectCode(admin.create(eventInput), 'BAD_REQUEST');
      expect(m.taskAutomationRule.create).not.toHaveBeenCalled();
    });

    it('refuses pool or notify users outside the tenant', async () => {
      m.user.findMany.mockResolvedValue([{ id: U1 }]);
      await expectCode(
        admin.create({
          ...eventInput,
          actions: [createTask, { type: 'ASSIGN_ROUND_ROBIN', userIds: [U1, U2] }],
        }),
        'BAD_REQUEST'
      );
      const where = m.user.findMany.mock.calls[0][0].where;
      expect(where.id).toEqual({ in: [U1, U2] });
      expectNoRuleWrites();
    });

    it('accepts catalogue tags with catalogue casing and refuses unknown ones', async () => {
      m.taskAutomationTag.findMany.mockResolvedValue([{ name: 'VIP' }]);
      m.taskAutomationRule.create.mockResolvedValue(ruleRow());
      await admin.create({ ...eventInput, tags: ['vip'] });
      expect(m.taskAutomationRule.create.mock.calls[0][0].data.tags).toEqual(['VIP']);
      // Tags are resolved after the tenant rule lock that tag rename / delete take.
      const lockOrder = m.$executeRaw.mock.invocationCallOrder[0];
      expect(lockOrder).toBeLessThan(m.taskAutomationTag.findMany.mock.invocationCallOrder[0]);
      await expectCode(admin.create({ ...eventInput, tags: ['Other'] }), 'BAD_REQUEST');
      expect(m.taskAutomationRule.create).toHaveBeenCalledTimes(1);
    });

    it('maps P2002 (name or duplicate rule) to CONFLICT and rethrows other errors', async () => {
      m.taskAutomationRule.create.mockRejectedValueOnce(
        prismaError('P2002', { target: ['ruleKey'] })
      );
      await expectCode(admin.create(eventInput), 'CONFLICT');
      m.taskAutomationRule.create.mockRejectedValueOnce(prismaError('P2002'));
      await expectCode(admin.create(eventInput), 'CONFLICT');
      m.taskAutomationRule.create.mockRejectedValueOnce(new Error('boom'));
      await expect(admin.create(eventInput)).rejects.toThrow('boom');
    });

    it('is rate limited per user (sensitive limiter)', async () => {
      sensitiveGate.mockRejectedValueOnce(new TRPCError({ code: 'TOO_MANY_REQUESTS' }));
      await expectCode(admin.create(eventInput), 'TOO_MANY_REQUESTS');
      expect(m.taskAutomationRule.create).not.toHaveBeenCalled();
    });
  });

  describe('cross-tenant (every mutation)', () => {
    beforeEach(() => {
      m.taskAutomationRule.findFirst.mockResolvedValue(null);
      m.taskAutomationTag.findFirst.mockResolvedValue(null);
    });

    it.each([
      ['update', () => admin.update({ ...eventInput, id: FOREIGN })],
      ['delete', () => admin.delete({ id: FOREIGN })],
      ['setActive', () => admin.setActive({ id: FOREIGN, isActive: false })],
      ['rotateWebhookSecret', () => admin.rotateWebhookSecret({ id: FOREIGN })],
      ['runNow', () => admin.runNow({ id: FOREIGN })],
      ['listRuns', () => admin.listRuns({ ruleId: FOREIGN })],
    ])(
      '%s of a foreign rule is NOT_FOUND, scoped by tenant, and writes nothing',
      async (_name, call) => {
        await expectCode(call(), 'NOT_FOUND');
        expect(m.taskAutomationRule.findFirst.mock.calls[0][0].where).toMatchObject({
          id: FOREIGN,
          tenantId,
        });
        expectNoRuleWrites();
      }
    );

    it('regenerateWebhookUrl of a foreign rule is NOT_FOUND (tenant-scoped updateMany)', async () => {
      m.taskAutomationRule.updateMany.mockResolvedValue({ count: 0 });
      await expectCode(admin.regenerateWebhookUrl({ id: FOREIGN }), 'NOT_FOUND');
      expect(m.taskAutomationRule.updateMany.mock.calls[0][0].where).toMatchObject({
        id: FOREIGN,
        tenantId,
      });
    });

    it.each([
      ['tags.update', () => admin.tags.update({ id: FOREIGN, name: 'X' })],
      ['tags.delete', () => admin.tags.delete({ id: FOREIGN })],
    ])('%s of a foreign tag is NOT_FOUND and writes nothing', async (_name, call) => {
      await expectCode(call(), 'NOT_FOUND');
      expect(m.taskAutomationTag.findFirst.mock.calls[0][0].where).toEqual({
        id: FOREIGN,
        tenantId,
      });
      expect(m.taskAutomationTag.update).not.toHaveBeenCalled();
      expect(m.taskAutomationTag.deleteMany).not.toHaveBeenCalled();
    });

    it('P2025 inside the update transaction is NOT_FOUND', async () => {
      m.taskAutomationRule.findFirst.mockResolvedValue(owned());
      m.taskAutomationRule.updateMany.mockRejectedValue(prismaError('P2025'));
      await expectCode(admin.update({ ...eventInput, id: R1 }), 'NOT_FOUND');
    });

    it('reorder refuses an id that is not this tenant’s', async () => {
      m.taskAutomationRule.findMany.mockResolvedValue([{ id: R1 }]);
      await expectCode(admin.reorder({ ids: [FOREIGN] }), 'BAD_REQUEST');
      await expectCode(admin.reorder({ ids: [R1, FOREIGN] }), 'BAD_REQUEST');
      expect(m.taskAutomationRule.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('update / delete / setActive / reorder', () => {
    beforeEach(() => {
      m.taskAutomationRule.findFirst.mockResolvedValue(owned());
      m.taskAutomationRule.updateMany.mockResolvedValue({ count: 1 });
      m.taskAutomationRule.deleteMany.mockResolvedValue({ count: 1 });
      m.taskAutomationRule.findFirstOrThrow.mockResolvedValue(ruleRow());
    });

    it('updates in a transaction, scoped by tenant', async () => {
      await admin.update({ ...eventInput, id: R1, name: 'Renamed', isActive: true });
      // Edits apply to events after saving.
      expect(m.taskAutomationRule.updateMany.mock.calls[0][0].data.effectiveFrom).toBeInstanceOf(
        Date
      );
      expect(m.taskAutomationRule.updateMany.mock.calls[0][0]).toMatchObject({
        where: { id: R1, tenantId },
        data: { name: 'Renamed', eventType: 'lead.created' },
      });
    });

    it('keeps a due schedule slot when an edit leaves the schedule unchanged', async () => {
      const schedule = {
        triggerType: 'SCHEDULE',
        scheduleCron: '0 9 * * 1',
        scheduleTimezone: 'Europe/London',
      };
      m.taskAutomationRule.findFirst.mockResolvedValue(owned(schedule));
      await admin.update({ ...scheduleInput, id: R1, name: 'Renamed', isActive: true });
      expect(m.taskAutomationRule.updateMany.mock.calls[0][0].data).not.toHaveProperty('nextRunAt');

      // A changed time (or an inactive rule) recomputes the slot.
      m.taskAutomationRule.updateMany.mockClear();
      await admin.update({
        ...scheduleInput,
        trigger: { ...scheduleInput.trigger, timeOfDay: '10:00' },
        id: R1,
        isActive: true,
      });
      expect(m.taskAutomationRule.updateMany.mock.calls[0][0].data.nextRunAt).toBeInstanceOf(Date);
      m.taskAutomationRule.updateMany.mockClear();
      m.taskAutomationRule.findFirst.mockResolvedValue(owned({ ...schedule, isActive: false }));
      await admin.update({ ...scheduleInput, id: R1, isActive: true });
      expect(m.taskAutomationRule.updateMany.mock.calls[0][0].data.nextRunAt).toBeInstanceOf(Date);
    });

    it('keeps the trigger type immutable', async () => {
      await expectCode(admin.update({ ...scheduleInput, id: R1, isActive: true }), 'BAD_REQUEST');
      expect(m.taskAutomationRule.updateMany).not.toHaveBeenCalled();
    });

    it('deletes in a transaction (runs cascade)', async () => {
      await expect(admin.delete({ id: R1 })).resolves.toEqual({ deleted: true });
      expect(m.taskAutomationRule.deleteMany).toHaveBeenCalledWith({ where: { id: R1, tenantId } });
    });

    it('recomputes the next run from now when a schedule is reactivated', async () => {
      m.taskAutomationRule.findFirst.mockResolvedValue(
        owned({
          triggerType: 'SCHEDULE',
          isActive: false,
          scheduleCron: '0 9 * * 1',
          scheduleTimezone: 'Europe/London',
        })
      );
      await admin.setActive({ id: R1, isActive: true });
      const data = m.taskAutomationRule.updateMany.mock.calls[0][0].data;
      expect(data.isActive).toBe(true);
      expect(data.nextRunAt.toISOString()).toBe('2026-10-26T09:00:00.000Z');
      // A reactivated rule only runs for events after now, decided under the rule lock.
      expect(data.effectiveFrom).toBeInstanceOf(Date);
      expect(m.$executeRaw).toHaveBeenCalled();
    });

    it('does not touch the next run when deactivating', async () => {
      await admin.setActive({ id: R1, isActive: false });
      expect(m.taskAutomationRule.updateMany.mock.calls[0][0].data).toEqual({ isActive: false });
    });

    it('maps a duplicate active rule on reactivation to CONFLICT', async () => {
      m.taskAutomationRule.updateMany.mockRejectedValue(
        prismaError('P2002', { target: ['ruleKey'] })
      );
      await expectCode(admin.setActive({ id: R1, isActive: true }), 'CONFLICT');
    });

    it('reorders every rule in one transaction', async () => {
      m.taskAutomationRule.findMany.mockResolvedValue([{ id: R1 }, { id: R2 }]);
      await admin.reorder({ ids: [R2, R1] });
      expect(m.$transaction).toHaveBeenCalled();
      expect(m.taskAutomationRule.updateMany).toHaveBeenCalledWith({
        where: { id: R2, tenantId },
        data: { sortOrder: 0 },
      });
      expect(m.taskAutomationRule.updateMany).toHaveBeenCalledWith({
        where: { id: R1, tenantId },
        data: { sortOrder: 1 },
      });
    });
  });

  describe('webhook secrets', () => {
    const current = () => 'c'.repeat(64);

    it('rotates the secret and keeps the previous one for 24 hours', async () => {
      m.taskAutomationRule.findFirst.mockResolvedValue({ id: R1, webhookSecret: current() });
      m.taskAutomationRule.update.mockResolvedValue({ id: R1 });
      const result = await admin.rotateWebhookSecret({ id: R1 });
      const args = m.taskAutomationRule.update.mock.calls[0][0];
      expect(args.where).toEqual({ tenantId_id: { tenantId, id: R1 } });
      expect(args.data.webhookSecret).toBe(result.signingSecret);
      expect(args.data.webhookSecretPrevious).toBe(current());
      expect(args.data.webhookSecretPreviousExpiresAt.toISOString()).toBe(
        '2026-10-21T10:00:00.000Z'
      );
      expect(result.webhookUrl).toBeNull();
      expect(m.taskAutomationRule.findFirst.mock.calls[0][0].where).toEqual({
        id: R1,
        tenantId,
        triggerType: 'WEBHOOK',
      });
    });

    it('rotates under the tenant rule lock, reading the current secret inside it', async () => {
      m.taskAutomationRule.findFirst.mockResolvedValue({ id: R1, webhookSecret: current() });
      m.taskAutomationRule.update.mockResolvedValue({ id: R1 });
      await admin.rotateWebhookSecret({ id: R1 });
      expect(m.$transaction).toHaveBeenCalled();
      expect(m.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
        m.taskAutomationRule.findFirst.mock.invocationCallOrder[0]
      );
    });

    it('revokes the previous secret immediately when asked', async () => {
      m.taskAutomationRule.findFirst.mockResolvedValue({ id: R1, webhookSecret: current() });
      m.taskAutomationRule.update.mockResolvedValue({ id: R1 });
      await admin.rotateWebhookSecret({ id: R1, revokePrevious: true });
      const data = m.taskAutomationRule.update.mock.calls[0][0].data;
      expect(data).toMatchObject({
        webhookSecretPrevious: null,
        webhookSecretPreviousExpiresAt: null,
      });
    });

    it('regenerates the URL (new hash, old URL dead)', async () => {
      m.taskAutomationRule.updateMany.mockResolvedValue({ count: 1 });
      const result = await admin.regenerateWebhookUrl({ id: R1 });
      const token = result.webhookUrl!.split('/').pop()!;
      const data = m.taskAutomationRule.updateMany.mock.calls[0][0].data;
      expect(data.webhookTokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(data.webhookTokenPrefix).toBe(token.slice(0, 12));
      expect(result.signingSecret).toBeNull();
    });

    it.each([
      ['rotateWebhookSecret', () => admin.rotateWebhookSecret({ id: R1 })],
      ['regenerateWebhookUrl', () => admin.regenerateWebhookUrl({ id: R1 })],
    ])('%s needs the public API URL', async (_name, call) => {
      vi.stubEnv('API_PUBLIC_URL', '');
      await expectCode(call(), 'PRECONDITION_FAILED');
      expect(m.taskAutomationRule.update).not.toHaveBeenCalled();
      expect(m.taskAutomationRule.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('runNow (Test Rule)', () => {
    const current = [{ type: 'CREATE_TASK', titleTemplate: 'As saved at admission' }];

    beforeEach(() => {
      m.taskAutomationRun.count.mockResolvedValue(0);
      m.taskAutomationRun.create.mockResolvedValue({ id: 'run-1' });
      m.$queryRaw.mockResolvedValue([{ actions: current, isActive: true }]);
    });

    it('snapshots the actions the rule holds at admission, read under its row lock', async () => {
      m.taskAutomationRule.findFirst.mockResolvedValue(owned({ triggerType: 'SCHEDULE' }));
      await admin.runNow({ id: R1 });
      const [sql, ...values] = m.$queryRaw.mock.calls.at(-1);
      expect(sql.join('?')).toMatch(/FROM "task_automation_rules"[\s\S]*FOR SHARE/);
      expect(values).toEqual([R1, tenantId]);
      expect(m.taskAutomationRun.create.mock.calls.at(-1)[0].data.actions).toEqual(current);
    });

    it('refuses a rule paused or deleted after it was read', async () => {
      m.taskAutomationRule.findFirst.mockResolvedValue(owned({ triggerType: 'WEBHOOK' }));
      m.$queryRaw.mockResolvedValueOnce([{ actions: current, isActive: false }]);
      await expectCode(admin.runNow({ id: R1 }), 'PRECONDITION_FAILED');
      m.$queryRaw.mockResolvedValueOnce([]);
      await expectCode(admin.runNow({ id: R1 }), 'PRECONDITION_FAILED');
      expect(m.taskAutomationRun.create).not.toHaveBeenCalled();
    });

    it('queues a manual run for an active schedule rule', async () => {
      m.taskAutomationRule.findFirst.mockResolvedValue(owned({ triggerType: 'SCHEDULE' }));
      await expect(admin.runNow({ id: R1 })).resolves.toEqual({ runId: 'run-1' });
      const data = m.taskAutomationRun.create.mock.calls[0][0].data;
      expect(data).toMatchObject({ tenantId, ruleId: R1, triggerType: 'SCHEDULE' });
      expect(data.idempotencyKey).toMatch(/^manual:[0-9a-f-]{36}$/);
    });

    it('refuses event rules, inactive rules and disabled automation', async () => {
      m.taskAutomationRule.findFirst.mockResolvedValueOnce(owned());
      await expectCode(admin.runNow({ id: R1 }), 'PRECONDITION_FAILED');
      m.taskAutomationRule.findFirst.mockResolvedValueOnce(
        owned({ triggerType: 'WEBHOOK', isActive: false })
      );
      await expectCode(admin.runNow({ id: R1 }), 'PRECONDITION_FAILED');
      m.taskAutomationRule.findFirst.mockResolvedValueOnce(owned({ triggerType: 'WEBHOOK' }));
      m.taskAutomationSetting.findUnique.mockResolvedValueOnce({
        automationEnabled: false,
        notifyRuleOwnerOnFailure: false,
        maxRunsPerRulePerHour: 60,
      });
      await expectCode(admin.runNow({ id: R1 }), 'PRECONDITION_FAILED');
      expect(m.taskAutomationRun.create).not.toHaveBeenCalled();
    });

    it('counts toward the hourly caps', async () => {
      m.taskAutomationRule.findFirst.mockResolvedValue(owned({ triggerType: 'WEBHOOK' }));
      m.taskAutomationRun.count.mockResolvedValueOnce(60).mockResolvedValueOnce(60);
      await expectCode(admin.runNow({ id: R1 }), 'TOO_MANY_REQUESTS');
      const since = m.taskAutomationRun.count.mock.calls[0][0].where.createdAt.gte;
      expect(since.toISOString()).toBe('2026-10-20T09:00:00.000Z');
      expect(m.taskAutomationRun.create).not.toHaveBeenCalled();
      // Counted under the shared per-tenant run-admission lock (owner ruling 8).
      expect(m.$transaction).toHaveBeenCalled();
      expect(m.$executeRaw).toHaveBeenCalled();
    });
  });

  describe('settings, reset, tags', () => {
    it('returns defaults without a settings row and upserts by tenant', async () => {
      await expect(admin.settings.get()).resolves.toEqual({
        automationEnabled: true,
        notifyRuleOwnerOnFailure: false,
        maxRunsPerRulePerHour: 60,
      });
      m.taskAutomationSetting.upsert.mockResolvedValue({
        automationEnabled: false,
        notifyRuleOwnerOnFailure: false,
        maxRunsPerRulePerHour: 30,
      });
      await admin.settings.update({ automationEnabled: false, maxRunsPerRulePerHour: 30 });
      expect(m.taskAutomationSetting.upsert.mock.calls[0][0]).toMatchObject({
        where: { tenantId },
        create: { tenantId, automationEnabled: false, maxRunsPerRulePerHour: 30 },
        update: { automationEnabled: false, maxRunsPerRulePerHour: 30 },
      });
    });

    it('records when automation is turned back on (events from the off period never run)', async () => {
      m.taskAutomationSetting.upsert.mockResolvedValue({
        automationEnabled: true,
        notifyRuleOwnerOnFailure: false,
        maxRunsPerRulePerHour: 60,
      });
      m.taskAutomationSetting.findUnique.mockResolvedValueOnce({ automationEnabled: false });
      await admin.settings.update({ automationEnabled: true });
      expect(
        m.taskAutomationSetting.upsert.mock.calls[0][0].update.automationEnabledAt
      ).toBeInstanceOf(Date);
      // Already on, or not being turned on: the boundary is left alone.
      m.taskAutomationSetting.findUnique.mockResolvedValueOnce({ automationEnabled: true });
      await admin.settings.update({ automationEnabled: true });
      await admin.settings.update({ maxRunsPerRulePerHour: 20 });
      for (const call of m.taskAutomationSetting.upsert.mock.calls.slice(1)) {
        expect(call[0].update).not.toHaveProperty('automationEnabledAt');
      }
      // Reset turns it back on too.
      m.taskAutomationSetting.findUnique.mockResolvedValueOnce({ automationEnabled: false });
      await admin.resetToDefaults();
      expect(
        m.taskAutomationSetting.upsert.mock.calls.at(-1)[0].update.automationEnabledAt
      ).toBeInstanceOf(Date);
    });

    // A disable committed between the read and the write must not leave a re-enable unstamped.
    it.each([
      ['settings.update', () => admin.settings.update({ automationEnabled: true })],
      ['resetToDefaults', () => admin.resetToDefaults()],
    ])(
      '%s reads the stored switch under the settings lock, in the write transaction',
      async (_name, call) => {
        m.taskAutomationSetting.upsert.mockResolvedValue({
          automationEnabled: true,
          notifyRuleOwnerOnFailure: false,
          maxRunsPerRulePerHour: 60,
        });
        m.taskAutomationSetting.findUnique.mockResolvedValueOnce({ automationEnabled: false });
        await call();
        expect(m.$transaction).toHaveBeenCalledTimes(1);
        const lock = m.$executeRaw.mock.invocationCallOrder[0];
        const read = m.taskAutomationSetting.findUnique.mock.invocationCallOrder[0];
        const write = m.taskAutomationSetting.upsert.mock.invocationCallOrder[0];
        const begin = m.$transaction.mock.invocationCallOrder[0];
        expect(begin).toBeLessThan(lock);
        expect(lock).toBeLessThan(read);
        expect(read).toBeLessThan(write);
      }
    );

    it('resetToDefaults resets settings only (rules, runs, tags kept)', async () => {
      m.taskAutomationSetting.upsert.mockResolvedValue({
        automationEnabled: true,
        notifyRuleOwnerOnFailure: false,
        maxRunsPerRulePerHour: 60,
      });
      await admin.resetToDefaults();
      expect(m.$transaction).toHaveBeenCalled();
      expect(m.taskAutomationSetting.upsert.mock.calls[0][0].update).toEqual({
        automationEnabled: true,
        notifyRuleOwnerOnFailure: false,
        maxRunsPerRulePerHour: 60,
      });
      expectNoRuleWrites();
      expect(m.taskAutomationTag.deleteMany).not.toHaveBeenCalled();
    });

    it('renames a tag and rewrites the rules that carry it in the same transaction', async () => {
      m.taskAutomationTag.findFirst.mockResolvedValue({ id: TAG, name: 'VIP' });
      m.taskAutomationTag.update.mockResolvedValue({
        id: TAG,
        name: 'Priority',
        colorToken: 'rose',
        description: null,
        sortOrder: 0,
        isActive: true,
      });
      m.taskAutomationRule.findMany.mockResolvedValue([{ id: R1, tags: ['VIP', 'Other'] }]);
      m.taskAutomationRule.updateMany.mockResolvedValue({ count: 1 });
      await admin.tags.update({ id: TAG, name: 'Priority' });
      expect(m.taskAutomationRule.findMany).toHaveBeenCalledWith({
        where: { tenantId, tags: { has: 'VIP' } },
        select: { id: true, tags: true },
      });
      expect(m.taskAutomationRule.updateMany).toHaveBeenCalledWith({
        where: { id: R1, tenantId },
        data: { tags: ['Priority', 'Other'] },
      });
    });

    it('deletes a tag and strips it from rules in the same transaction', async () => {
      m.taskAutomationTag.findFirst.mockResolvedValue({ id: TAG, name: 'VIP' });
      m.taskAutomationRule.findMany.mockResolvedValue([{ id: R1, tags: ['VIP'] }]);
      m.taskAutomationRule.updateMany.mockResolvedValue({ count: 1 });
      m.taskAutomationTag.deleteMany.mockResolvedValue({ count: 1 });
      await admin.tags.delete({ id: TAG });
      expect(m.taskAutomationRule.updateMany).toHaveBeenCalledWith({
        where: { id: R1, tenantId },
        data: { tags: [] },
      });
      expect(m.taskAutomationTag.deleteMany).toHaveBeenCalledWith({ where: { id: TAG, tenantId } });
    });

    it('creates tags at the end of the list and maps a duplicate name to CONFLICT', async () => {
      m.taskAutomationTag.aggregate.mockResolvedValue({ _max: { sortOrder: 2 } });
      m.taskAutomationTag.create.mockResolvedValueOnce({
        id: TAG,
        name: 'VIP',
        colorToken: 'slate',
        description: null,
        sortOrder: 3,
        isActive: true,
      });
      await expect(admin.tags.create({ name: 'VIP' })).resolves.toMatchObject({ sortOrder: 3 });
      m.taskAutomationTag.create.mockRejectedValueOnce(prismaError('P2002'));
      await expectCode(admin.tags.create({ name: 'VIP' }), 'CONFLICT');
    });
  });
});

describe('task automation helpers', () => {
  it('builds the public URL from config only and trims trailing slashes', () => {
    expect(
      getApiPublicUrl({ API_PUBLIC_URL: 'https://api.example.invalid//' } as NodeJS.ProcessEnv)
    ).toBe('https://api.example.invalid');
    expect(() => getApiPublicUrl({} as NodeJS.ProcessEnv)).toThrow(TRPCError);
  });

  it('accepts only an http(s) origin, and only https in production', () => {
    const url = (API_PUBLIC_URL: string, NODE_ENV = 'development') =>
      getApiPublicUrl({ API_PUBLIC_URL, NODE_ENV } as NodeJS.ProcessEnv);
    expect(url('https://api.example.invalid/base/path')).toBe('https://api.example.invalid');
    expect(url('http://localhost:4000')).toBe('http://localhost:4000');
    expect(() => url('http://api.example.invalid', 'production')).toThrow(/valid https URL/);
    expect(() => url('not a url')).toThrow(/valid https URL/);
    expect(() => url('ftp://api.example.invalid')).toThrow(TRPCError);
  });

  it('requires the field-encryption key outside tests', () => {
    expect(() =>
      assertWebhookEncryptionReady({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)
    ).toThrow(/encryption/);
    expect(() =>
      assertWebhookEncryptionReady({
        NODE_ENV: 'production',
        PRISMA_FIELD_ENCRYPTION_KEY: 'k',
      } as NodeJS.ProcessEnv)
    ).not.toThrow();
    expect(() =>
      assertWebhookEncryptionReady({ NODE_ENV: 'test' } as NodeJS.ProcessEnv)
    ).not.toThrow();
  });

  it('refuses invalid cron expressions', () => {
    expect(() => nextScheduledRun('not a cron', 'UTC', new Date('2026-10-20T10:00:00Z'))).toThrow(
      TRPCError
    );
  });
});
