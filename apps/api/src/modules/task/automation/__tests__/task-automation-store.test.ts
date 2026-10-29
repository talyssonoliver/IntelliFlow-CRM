/**
 * Task automation store (PG-208): query shapes and branches over prismaMock.
 * Concurrency and SQL behaviour are proven on a real DB in
 * tests/integration/task-automation.test.ts (store behaviour section).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prismaMock } from '../../../../test/setup';
import { createTaskAutomationStore } from '../task-automation-store';

const m = prismaMock as any;
const store = createTaskAutomationStore(prismaMock as never);
const NOW = new Date('2026-10-20T10:00:00.000Z');

function p2002() {
  return Object.assign(new Error('unique'), { code: 'P2002' });
}

describe('createTaskAutomationStore (PG-208)', () => {
  beforeEach(() => {
    m.taskAutomationRule.updateMany.mockResolvedValue({ count: 1 });
    m.taskAutomationRun.updateMany.mockResolvedValue({ count: 1 });
  });

  it('lists distinct active event types', async () => {
    m.taskAutomationRule.findMany.mockResolvedValue([
      { eventType: 'lead.created' },
      { eventType: null },
    ]);
    await expect(store.activeEventTypes()).resolves.toEqual(['lead.created']);
    expect(m.taskAutomationRule.findMany.mock.calls[0][0]).toMatchObject({
      where: { isActive: true, triggerType: 'ENTITY_EVENT' },
      distinct: ['eventType'],
    });
  });

  describe('loadRecord', () => {
    it('names a lead by person, then company, then "Lead"', async () => {
      m.lead.findUnique.mockResolvedValueOnce({
        tenantId: 't',
        ownerId: 'o',
        firstName: 'Ada',
        lastName: null,
        company: 'Acme',
        status: 'NEW',
      });
      await expect(store.loadRecord('lead', 'l1')).resolves.toMatchObject({
        name: 'Ada',
        state: 'NEW',
        tenantId: 't',
      });
      m.lead.findUnique.mockResolvedValueOnce({
        tenantId: 't',
        ownerId: 'o',
        firstName: null,
        lastName: ' ',
        company: ' Acme ',
        status: 'NEW',
      });
      await expect(store.loadRecord('lead', 'l1')).resolves.toMatchObject({ name: 'Acme' });
      m.lead.findUnique.mockResolvedValueOnce({
        tenantId: 't',
        ownerId: 'o',
        firstName: null,
        lastName: null,
        company: null,
        status: 'NEW',
      });
      await expect(store.loadRecord('lead', 'l1')).resolves.toMatchObject({ name: 'Lead' });
      m.lead.findUnique.mockResolvedValueOnce(null);
      await expect(store.loadRecord('lead', 'l1')).resolves.toBeNull();
    });

    it('loads contacts with their leadId, deals with stage and deletion, accounts', async () => {
      m.contact.findUnique.mockResolvedValueOnce({
        tenantId: 't',
        ownerId: 'o',
        firstName: 'A',
        lastName: 'B',
        leadId: 'l9',
      });
      await expect(store.loadRecord('contact', 'c1')).resolves.toMatchObject({
        name: 'A B',
        leadId: 'l9',
      });
      m.contact.findUnique.mockResolvedValueOnce({
        tenantId: 't',
        ownerId: 'o',
        firstName: '',
        lastName: '',
        leadId: null,
      });
      await expect(store.loadRecord('contact', 'c1')).resolves.toMatchObject({ name: 'Contact' });
      m.contact.findUnique.mockResolvedValueOnce(null);
      await expect(store.loadRecord('contact', 'c1')).resolves.toBeNull();
      m.opportunity.findUnique.mockResolvedValueOnce({
        tenantId: 't',
        ownerId: 'o',
        name: 'D',
        stage: 'PROPOSAL',
        deletedAt: NOW,
      });
      await expect(store.loadRecord('opportunity', 'd1')).resolves.toMatchObject({
        state: 'PROPOSAL',
        deleted: true,
      });
      m.opportunity.findUnique.mockResolvedValueOnce(null);
      await expect(store.loadRecord('opportunity', 'd1')).resolves.toBeNull();
      m.account.findUnique.mockResolvedValueOnce({ tenantId: 't', ownerId: 'o', name: 'Acme' });
      await expect(store.loadRecord('account', 'a1')).resolves.toMatchObject({
        name: 'Acme',
        deleted: false,
      });
      m.account.findUnique.mockResolvedValueOnce(null);
      await expect(store.loadRecord('account', 'a1')).resolves.toBeNull();
    });
  });

  it('scopes contact link checks, settings, rules and counts by tenant', async () => {
    m.contact.findFirst.mockResolvedValueOnce({ id: 'c1' }).mockResolvedValueOnce(null);
    await expect(store.contactInTenant('c1', 't1')).resolves.toBe(true);
    await expect(store.contactInTenant('c1', 't1')).resolves.toBe(false);
    expect(m.contact.findFirst.mock.calls[0][0].where).toEqual({ id: 'c1', tenantId: 't1' });

    m.taskAutomationSetting.findUnique.mockResolvedValueOnce(null);
    await expect(store.settings('t1')).resolves.toEqual({
      automationEnabled: true,
      maxRunsPerRulePerHour: 60,
      notifyRuleOwnerOnFailure: false,
    });

    m.taskAutomationRule.findMany.mockResolvedValueOnce([]);
    await store.findEventRules('t1', 'lead.created');
    expect(m.taskAutomationRule.findMany.mock.calls.at(-1)[0].where).toEqual({
      tenantId: 't1',
      isActive: true,
      triggerType: 'ENTITY_EVENT',
      eventType: 'lead.created',
    });

    m.taskAutomationRule.findFirst.mockResolvedValueOnce(null);
    await store.loadRule('t1', 'r1');
    expect(m.taskAutomationRule.findFirst.mock.calls.at(-1)[0].where).toEqual({
      id: 'r1',
      tenantId: 't1',
    });

    m.taskAutomationRun.count.mockResolvedValue(3);
    await store.countRunsSince('t1', 'r1', NOW);
    await store.countRunsSince('t1', null, NOW);
    expect(m.taskAutomationRun.count.mock.calls[0][0].where).toEqual({
      tenantId: 't1',
      ruleId: 'r1',
      createdAt: { gte: NOW },
    });
    expect(m.taskAutomationRun.count.mock.calls[1][0].where).toEqual({
      tenantId: 't1',
      createdAt: { gte: NOW },
    });
  });

  it('records suppressions on the rule', async () => {
    await store.recordSuppressed('t1', 'r1', NOW);
    expect(m.taskAutomationRule.updateMany).toHaveBeenCalledWith({
      where: { id: 'r1', tenantId: 't1' },
      data: { suppressedCount: { increment: 1 }, lastSuppressedAt: NOW },
    });
  });

  describe('insertRunIfAbsent', () => {
    const run = {
      tenantId: 't1',
      ruleId: 'r1',
      triggerType: 'WEBHOOK',
      idempotencyKey: 'webhook:k',
      context: {},
      payloadHash: 'h',
    };

    it('creates a run', async () => {
      m.taskAutomationRun.create.mockResolvedValueOnce({ id: 'run-1' });
      await expect(store.insertRunIfAbsent(run)).resolves.toEqual({
        created: true,
        runId: 'run-1',
      });
      expect(m.taskAutomationRun.create.mock.calls[0][0].data).toMatchObject({
        status: 'PENDING',
        payloadHash: 'h',
      });
    });

    it('reports a duplicate (P2002) with the existing payload hash', async () => {
      m.taskAutomationRun.create.mockRejectedValueOnce(p2002());
      m.taskAutomationRun.findUnique.mockResolvedValueOnce({ payloadHash: 'h' });
      await expect(store.insertRunIfAbsent(run)).resolves.toEqual({
        created: false,
        existingPayloadHash: 'h',
      });
      expect(m.taskAutomationRun.findUnique.mock.calls[0][0].where).toEqual({
        ruleId_idempotencyKey: { ruleId: 'r1', idempotencyKey: 'webhook:k' },
      });
      m.taskAutomationRun.create.mockRejectedValueOnce(p2002());
      m.taskAutomationRun.findUnique.mockResolvedValueOnce(null);
      await expect(store.insertRunIfAbsent(run)).resolves.toEqual({
        created: false,
        existingPayloadHash: null,
      });
    });

    it('rethrows other errors', async () => {
      m.taskAutomationRun.create.mockRejectedValueOnce(new Error('down'));
      await expect(store.insertRunIfAbsent(run)).rejects.toThrow('down');
    });
  });

  it('finds due schedules (complete ones only) and claims a slot by compare-and-set', async () => {
    m.taskAutomationRule.findMany.mockResolvedValueOnce([
      {
        id: 'r1',
        tenantId: 't1',
        nextRunAt: NOW,
        scheduleCron: '0 9 * * *',
        scheduleTimezone: 'UTC',
        actions: [{ type: 'CREATE_TASK', titleTemplate: 'Snapshot' }],
      },
      { id: 'r2', tenantId: 't1', nextRunAt: null, scheduleCron: null, scheduleTimezone: null },
    ]);
    const due = await store.findDueSchedules(NOW, 50);
    expect(due.map((d) => d.id)).toEqual(['r1']);
    // The slot's run snapshots these actions (owner ruling 9).
    expect(due[0].actions).toEqual([{ type: 'CREATE_TASK', titleTemplate: 'Snapshot' }]);
    expect(m.taskAutomationRule.findMany.mock.calls.at(-1)[0].where).toEqual({
      isActive: true,
      triggerType: 'SCHEDULE',
      nextRunAt: { lte: NOW },
    });

    const next = new Date('2026-10-21T09:00:00.000Z');
    await expect(store.claimDueSchedule(due[0], next)).resolves.toBe(true);
    expect(m.taskAutomationRule.updateMany.mock.calls.at(-1)[0]).toEqual({
      where: { id: 'r1', tenantId: 't1', isActive: true, nextRunAt: NOW },
      data: { nextRunAt: next },
    });
    m.taskAutomationRule.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(store.claimDueSchedule(due[0], next)).resolves.toBe(false);
  });

  it('deactivates a broken schedule', async () => {
    await store.deactivateSchedule('t1', 'r1', NOW, 'invalid_schedule');
    expect(m.taskAutomationRule.updateMany.mock.calls.at(-1)[0]).toEqual({
      where: { id: 'r1', tenantId: 't1' },
      data: {
        isActive: false,
        lastRunAt: NOW,
        lastRunStatus: 'FAILED',
        lastRunOutcome: 'invalid_schedule',
      },
    });
  });

  it('claims only the pending runs it wins', async () => {
    m.taskAutomationRun.findMany.mockResolvedValueOnce([
      { id: 'a', tenantId: 't1', ruleId: 'r1', triggerType: 'X', context: {} },
      { id: 'b', tenantId: 't1', ruleId: 'r1', triggerType: 'X', context: {} },
    ]);
    m.taskAutomationRun.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const claimed = await store.claimPendingRuns(50, NOW);
    expect(claimed.map((r) => r.id)).toEqual(['a']);
    expect(m.taskAutomationRun.updateMany.mock.calls[0][0]).toEqual({
      where: { id: 'a', status: 'PENDING' },
      data: { status: 'RUNNING', startedAt: NOW },
    });
  });

  it('keeps the runs already claimed when a later claim fails', async () => {
    m.taskAutomationRun.findMany.mockResolvedValueOnce([
      { id: 'a', tenantId: 't1', ruleId: 'r1', triggerType: 'X', context: {} },
      { id: 'b', tenantId: 't1', ruleId: 'r1', triggerType: 'X', context: {} },
      { id: 'c', tenantId: 't1', ruleId: 'r1', triggerType: 'X', context: {} },
    ]);
    m.taskAutomationRun.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockRejectedValueOnce(new Error('connection lost'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const claimed = await store.claimPendingRuns(50, NOW);
    expect(claimed.map((r) => r.id)).toEqual(['a']);
    expect(m.taskAutomationRun.updateMany).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it('finishes a run and records the rule’s last run', async () => {
    const run = { id: 'a', tenantId: 't1', ruleId: 'r1', triggerType: 'X', context: {} };
    await store.finishRun(run, { status: 'FAILED', errorCode: 'task_create_failed' }, NOW);
    expect(m.taskAutomationRun.updateMany.mock.calls.at(-1)[0]).toMatchObject({
      where: { id: 'a', tenantId: 't1' },
      data: { status: 'FAILED', errorCode: 'task_create_failed', finishedAt: NOW, taskId: null },
    });
    expect(m.taskAutomationRule.updateMany.mock.calls.at(-1)[0]).toEqual({
      where: { id: 'r1', tenantId: 't1' },
      data: { lastRunAt: NOW, lastRunStatus: 'FAILED', lastRunOutcome: 'task_create_failed' },
    });
  });

  it('resolves live tenant users with a display name', async () => {
    await expect(store.liveUsers('t1', [])).resolves.toEqual(new Map());
    m.user.findMany.mockResolvedValueOnce([
      { id: 'u1', name: ' Ada ', email: 'a@example.invalid' },
      { id: 'u2', name: null, email: 'b@example.invalid' },
    ]);
    const live = await store.liveUsers('t1', ['u1', 'u2', 'u1', '']);
    expect([...live.entries()]).toEqual([
      ['u1', 'Ada'],
      ['u2', 'b@example.invalid'],
    ]);
    const where = m.user.findMany.mock.calls.at(-1)[0].where;
    expect(where.AND[0]).toEqual({ id: { in: ['u1', 'u2'] } });
  });

  it('increments the round-robin cursor atomically', async () => {
    m.taskAutomationRule.update.mockResolvedValueOnce({ rrCursor: 4 });
    await expect(store.incrementRrCursor('t1', 'r1')).resolves.toBe(4);
    expect(m.taskAutomationRule.update.mock.calls.at(-1)[0]).toEqual({
      where: { tenantId_id: { tenantId: 't1', id: 'r1' } },
      data: { rrCursor: { increment: 1 } },
      select: { rrCursor: true },
    });
  });

  it('clears previous signing secrets after their grace period', async () => {
    m.taskAutomationRule.updateMany.mockResolvedValueOnce({ count: 1 });
    await expect(store.clearExpiredPreviousSecrets(NOW)).resolves.toBe(1);
    expect(m.taskAutomationRule.updateMany.mock.calls.at(-1)[0]).toEqual({
      where: { webhookSecretPreviousExpiresAt: { lt: NOW } },
      data: { webhookSecretPrevious: null, webhookSecretPreviousExpiresAt: null },
    });
  });

  describe('admitRun (duplicate check, caps and insert under one tenant lock)', () => {
    const run = {
      tenantId: 't1',
      ruleId: 'r1',
      triggerType: 'WEBHOOK',
      idempotencyKey: 'webhook:k1',
      payloadHash: 'h1',
      context: {},
    };
    const caps = { perMinute: 60, perHour: 2 };

    const current = [{ type: 'CREATE_TASK', titleTemplate: 'Current' }];

    beforeEach(() => {
      m.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(m));
      m.$executeRaw.mockResolvedValue(1);
      m.$queryRaw.mockResolvedValue([{ actions: current, isActive: true }]);
    });

    it('locks the tenant, then inserts when under every cap', async () => {
      m.taskAutomationRun.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(5);
      m.taskAutomationRun.findUnique.mockResolvedValueOnce(null);
      m.taskAutomationRun.create.mockResolvedValueOnce({ id: 'run-1' });
      await expect(store.admitRun(run, caps, NOW)).resolves.toEqual({
        created: true,
        runId: 'run-1',
      });
      expect(m.$executeRaw).toHaveBeenCalled();
      expect(m.taskAutomationRun.count.mock.calls.at(-1)[0]).toEqual({
        where: { tenantId: 't1', createdAt: { gte: new Date(NOW.getTime() - 3_600_000) } },
      });
      expect(m.taskAutomationRun.create.mock.calls.at(-1)[0].data).toMatchObject({
        idempotencyKey: 'webhook:k1',
        status: 'PENDING',
      });
    });

    it('builds the context from the locked actions when the run asks for it', async () => {
      m.taskAutomationRun.count.mockResolvedValue(0);
      m.taskAutomationRun.findUnique.mockResolvedValueOnce(null);
      m.taskAutomationRun.create.mockResolvedValueOnce({ id: 'run-ctx' });
      const contextFor = vi.fn((actions: unknown) => ({ seen: actions as never }));
      await store.admitRun({ ...run, context: { stale: true }, contextFor }, caps, NOW);
      expect(contextFor).toHaveBeenCalledWith(current);
      const data = m.taskAutomationRun.create.mock.calls.at(-1)[0].data;
      expect(data.context).toEqual({ seen: current });
      expect(data).not.toHaveProperty('contextFor');
    });

    it('writes nothing when a cap is reached', async () => {
      m.taskAutomationRun.create.mockClear();
      m.taskAutomationRun.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(2);
      await expect(store.admitRun(run, caps, NOW)).resolves.toEqual({ capped: true });
      m.taskAutomationRun.count
        .mockResolvedValueOnce(60)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      await expect(store.admitRun(run, caps, NOW)).resolves.toEqual({ capped: true });
      expect(m.taskAutomationRun.create).not.toHaveBeenCalled();
    });

    it('acknowledges a retry before the caps, and skips the minute count without a per-minute cap', async () => {
      m.taskAutomationRun.count.mockClear();
      m.taskAutomationRun.findUnique.mockResolvedValueOnce({ payloadHash: 'h1' });
      await expect(store.admitRun(run, { perHour: 0 }, NOW)).resolves.toEqual({
        created: false,
        existingPayloadHash: 'h1',
      });
      expect(m.taskAutomationRun.count).not.toHaveBeenCalled();
      m.taskAutomationRun.findUnique.mockResolvedValueOnce(null);
      m.taskAutomationRun.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
      m.taskAutomationRun.create.mockResolvedValueOnce({ id: 'run-2' });
      await expect(store.admitRun(run, { perHour: 5 }, NOW)).resolves.toMatchObject({
        created: true,
      });
      expect(m.taskAutomationRun.count).toHaveBeenCalledTimes(2);
    });

    it('claims a schedule slot and admits its run in one transaction', async () => {
      const due = {
        id: 'r1',
        tenantId: 't1',
        nextRunAt: NOW,
        scheduleCron: '0 9 * * *',
        scheduleTimezone: 'UTC',
      };
      const next = new Date(NOW.getTime() + 86_400_000);
      m.taskAutomationRule.updateMany.mockResolvedValueOnce({ count: 0 });
      await expect(store.claimSlotAndAdmit(due, next, run, caps, NOW)).resolves.toEqual({
        claimed: false,
      });
      m.taskAutomationRule.updateMany.mockResolvedValueOnce({ count: 1 });
      m.taskAutomationRun.findUnique.mockResolvedValueOnce(null);
      m.taskAutomationRun.count.mockResolvedValue(0);
      m.taskAutomationRun.create.mockResolvedValueOnce({ id: 'slot-run' });
      await expect(store.claimSlotAndAdmit(due, next, run, caps, NOW)).resolves.toEqual({
        created: true,
        runId: 'slot-run',
      });
      expect(m.taskAutomationRule.updateMany.mock.calls.at(-1)[0]).toEqual({
        where: { id: 'r1', tenantId: 't1', isActive: true, nextRunAt: NOW },
        data: { nextRunAt: next },
      });
    });

    it('admits the actions the rule holds under its row lock, not the ones the caller read', async () => {
      m.taskAutomationRun.findUnique.mockResolvedValueOnce(null);
      m.taskAutomationRun.count.mockResolvedValue(0);
      m.taskAutomationRun.create.mockResolvedValueOnce({ id: 'run-3' });
      const stale = [{ type: 'CREATE_TASK', titleTemplate: 'Read before admission' }];
      await store.admitRun({ ...run, actions: stale }, caps, NOW);
      const [sql, ...values] = m.$queryRaw.mock.calls.at(-1);
      expect(sql.join('?')).toMatch(/FROM "task_automation_rules"[\s\S]*FOR SHARE/);
      expect(values).toEqual(['r1', 't1']);
      expect(m.taskAutomationRun.create.mock.calls.at(-1)[0].data.actions).toEqual(current);
    });

    it('writes nothing for a rule deactivated or deleted after the caller read it', async () => {
      m.taskAutomationRun.create.mockClear();
      for (const rows of [[{ actions: current, isActive: false }], []]) {
        m.taskAutomationRun.findUnique.mockResolvedValueOnce(null);
        m.$queryRaw.mockResolvedValueOnce(rows);
        await expect(store.admitRun(run, caps, NOW)).resolves.toEqual({ inactive: true });
      }
      expect(m.taskAutomationRun.create).not.toHaveBeenCalled();
    });

    it('reports an existing idempotency key instead of inserting', async () => {
      m.taskAutomationRun.create.mockClear();
      m.taskAutomationRun.count.mockResolvedValue(0);
      m.taskAutomationRun.findUnique.mockResolvedValueOnce({ payloadHash: 'h0' });
      await expect(store.admitRun(run, caps, NOW)).resolves.toEqual({
        created: false,
        existingPayloadHash: 'h0',
      });
      expect(m.taskAutomationRun.create).not.toHaveBeenCalled();
    });
  });

  it('reaps stuck runs and purges terminal runs in bounded batches', async () => {
    m.taskAutomationRun.updateMany.mockResolvedValueOnce({ count: 2 });
    await expect(store.reapStaleRuns(NOW, NOW)).resolves.toBe(2);
    expect(m.taskAutomationRun.updateMany.mock.calls.at(-1)[0]).toEqual({
      where: { status: 'RUNNING', startedAt: { lt: NOW } },
      data: { status: 'FAILED', errorCode: 'interrupted', finishedAt: NOW },
    });

    m.taskAutomationRun.findMany.mockResolvedValueOnce([]);
    await expect(store.purgeRunsBefore(NOW, 500)).resolves.toBe(0);
    m.taskAutomationRun.findMany.mockResolvedValueOnce([{ id: 'old' }]);
    m.taskAutomationRun.deleteMany.mockResolvedValueOnce({ count: 1 });
    await expect(store.purgeRunsBefore(NOW, 500)).resolves.toBe(1);
    expect(m.taskAutomationRun.findMany.mock.calls.at(-1)[0]).toMatchObject({
      where: { status: { in: ['SUCCEEDED', 'FAILED', 'SKIPPED'] }, createdAt: { lt: NOW } },
      take: 500,
    });
    expect(m.taskAutomationRun.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['old'] } } });
  });

  it('loads a webhook rule by token hash through the model API (decrypting extension applies)', async () => {
    m.taskAutomationRule.findUnique.mockResolvedValueOnce(null);
    await store.loadWebhookRule('h'.repeat(64));
    const args = m.taskAutomationRule.findUnique.mock.calls.at(-1)[0];
    expect(args.where).toEqual({ webhookTokenHash: 'h'.repeat(64) });
    expect(args.select.webhookSecret).toBe(true);
    expect(m.$queryRaw).not.toHaveBeenCalled();
    expect(m.$queryRawUnsafe).not.toHaveBeenCalled();
  });
});
