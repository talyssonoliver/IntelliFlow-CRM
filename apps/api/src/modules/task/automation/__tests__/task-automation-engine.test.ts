/**
 * Task automation engine (PG-208, ADR-084) against the in-memory fake store.
 * The clock is pinned: every time-dependent case sets it explicitly.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TaskAutomationEngine, type CreateTaskRequest } from '../task-automation-engine';
import {
  ConversionCorrelation,
  TaskAutomationEventBuffer,
  type BufferedTaskAutomationEvent,
} from '../task-automation-event-intake';
import { FakeTaskAutomationStore, type FakeRule } from './fake-task-automation-store';

const T1 = 'tenant-a';
const T2 = 'tenant-b';
const START = new Date('2026-10-20T10:00:00.000Z');

const createTask = (extra: Record<string, unknown> = {}) => ({
  type: 'CREATE_TASK',
  titleTemplate: 'Call {{record.name}}',
  descriptionTemplate: '',
  priority: 'HIGH',
  dueInDays: 1,
  linkToRecord: true,
  ...extra,
});

let now: Date;
let store: FakeTaskAutomationStore;
let buffer: TaskAutomationEventBuffer;
let correlation: ConversionCorrelation;
let created: CreateTaskRequest[];
let createResult: (
  r: CreateTaskRequest
) => { ok: true; taskId: string } | { ok: false; reason: string };
let assigned: Array<[string, string, string]>;
let assignResult: boolean;
let assignThrows: boolean;
let notified: Array<{ userId: string; title: string; body: string; taskId?: string }>;
let notifyResult: () => Promise<'sent' | 'filtered'>;
let engine: TaskAutomationEngine;
const log = { warn: vi.fn(), info: vi.fn() };

function event(overrides: Partial<BufferedTaskAutomationEvent> = {}): BufferedTaskAutomationEvent {
  return {
    eventId: `evt-${Math.random().toString(36).slice(2, 8)}`,
    eventType: 'lead.created',
    recordId: 'lead-1',
    contactId: null,
    accountId: null,
    newStage: null,
    occurredAt: now.getTime(),
    firstSeenAt: null,
    ...overrides,
  };
}

function lead(id = 'lead-1', extra: Record<string, unknown> = {}) {
  store.records.set(id, {
    entity: 'lead',
    tenantId: T1,
    ownerId: 'owner',
    name: 'Ada Lovelace',
    state: 'NEW',
    leadId: null,
    deleted: false,
    ...extra,
  } as never);
}

function eventRule(extra: Partial<FakeRule> = {}) {
  return store.rule({ tenantId: T1, actions: [createTask()], ...extra });
}

async function runAll() {
  await engine.drainEvents();
  await engine.enqueueDueSchedules();
  await engine.executePendingRuns();
}

beforeEach(() => {
  now = new Date(START);
  store = new FakeTaskAutomationStore(() => now);
  buffer = new TaskAutomationEventBuffer();
  correlation = new ConversionCorrelation();
  created = [];
  createResult = () => ({ ok: true, taskId: `task-${created.length}` });
  assigned = [];
  assignResult = true;
  assignThrows = false;
  notified = [];
  notifyResult = async () => 'sent';
  log.warn.mockReset();
  store.users.set('owner', { tenantId: T1, name: 'Olive Owner' });
  store.users.set('creator', { tenantId: T1, name: 'Cara Creator' });
  engine = new TaskAutomationEngine({
    store,
    buffer,
    correlation,
    now: () => now,
    createTask: async (request) => {
      created.push(request);
      return createResult(request);
    },
    assignTask: async (taskId, assigneeId, tenantId) => {
      assigned.push([taskId, assigneeId, tenantId]);
      if (assignThrows) throw new Error('task read failed');
      return assignResult;
    },
    notify: async (request) => {
      notified.push(request);
      return notifyResult();
    },
    log,
  });
});

describe('drainEvents', () => {
  it('creates a PENDING run in the record’s tenant, idempotent per event', async () => {
    lead();
    const rule = eventRule();
    const e = event();
    buffer.push(e);
    buffer.push({ ...e });
    await engine.drainEvents();
    expect(store.runs).toHaveLength(1);
    expect(store.runs[0]).toMatchObject({
      tenantId: T1,
      ruleId: rule.id,
      status: 'PENDING',
      idempotencyKey: `event:${e.eventId}`,
    });
    expect(store.runs[0].context).toMatchObject({
      entity: 'lead',
      recordId: 'lead-1',
      ownerId: 'owner',
    });
  });

  /** The tick reads copies of the rules; `change` runs on the stored rule right after that read. */
  function changeRuleAfterTickRead(rule: FakeRule, change: (stored: FakeRule) => void) {
    const read = store.findEventRules.bind(store);
    vi.spyOn(store, 'findEventRules').mockImplementation(async (tenantId, eventType) => {
      const rules = (await read(tenantId, eventType)).map((r) => ({ ...r }));
      change(rule);
      return rules;
    });
  }

  it('admits an event run with the actions the rule holds at admission, not the tick’s copy', async () => {
    lead();
    const rule = eventRule();
    const edited = [createTask({ titleTemplate: 'Edited after the tick read' })];
    changeRuleAfterTickRead(rule, (stored) => {
      stored.actions = edited;
    });
    buffer.push(event());
    await engine.drainEvents();
    expect(store.runs).toHaveLength(1);
    expect(store.runs[0].actions).toEqual(edited);
  });

  it('admits nothing for a rule deactivated after the tick read it', async () => {
    lead();
    const rule = eventRule();
    changeRuleAfterTickRead(rule, (stored) => {
      stored.isActive = false;
    });
    buffer.push(event());
    await engine.drainEvents();
    expect(store.runs).toHaveLength(0);
    expect(store.rules[0].suppressedCount).toBe(0);
  });

  it.each<[string, Partial<FakeRule>]>([
    ['moved to another event', { eventType: 'lead.qualified' }],
    ['turned into a schedule', { triggerType: 'SCHEDULE', eventType: null }],
    ['re-saved after the event', { effectiveFrom: new Date(START.getTime() + 1) }],
  ])('admits nothing for a rule %s after the tick read it', async (_, edit) => {
    lead();
    const rule = eventRule();
    changeRuleAfterTickRead(rule, (stored) => {
      Object.assign(stored, edit);
    });
    buffer.push(event({ occurredAt: START.getTime() }));
    await engine.drainEvents();
    expect(store.runs).toHaveLength(0);
    expect(store.rules[0].suppressedCount).toBe(0);
  });

  it('never matches another tenant’s rule (tenant comes from the record row)', async () => {
    lead();
    store.rule({ tenantId: T2, actions: [createTask()] });
    buffer.push(event());
    await engine.drainEvents();
    expect(store.runs).toHaveLength(0);
  });

  it('retries a missing record until the grace period, then drops it', async () => {
    eventRule();
    buffer.push(event());
    await engine.drainEvents();
    expect(buffer.size).toBe(1);
    now = new Date(START.getTime() + 29_000);
    await engine.drainEvents();
    expect(buffer.size).toBe(1);
    now = new Date(START.getTime() + 31_000);
    await engine.drainEvents();
    expect(buffer.size).toBe(0);
    expect(store.runs).toHaveLength(0);
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('record not found'));
  });

  it('fires once the record appears within the grace period (uncommitted transaction)', async () => {
    eventRule();
    buffer.push(event());
    await engine.drainEvents();
    lead();
    now = new Date(START.getTime() + 5_000);
    await engine.drainEvents();
    expect(store.runs).toHaveLength(1);
  });

  it.each([
    ['lead.qualified rolled back', 'lead.qualified', 'CONTACTED', 0],
    ['lead.qualified holds', 'lead.qualified', 'NEGOTIATING', 1],
    ['lead.converted rolled back', 'lead.converted', 'QUALIFIED', 0],
    ['lead.converted holds', 'lead.converted', 'CONVERTED', 1],
  ])('checks the postcondition: %s', async (_label, eventType, state, expected) => {
    lead('lead-1', { state });
    eventRule({ eventType });
    buffer.push(event({ eventType }));
    await engine.drainEvents();
    expect(store.runs).toHaveLength(expected);
  });

  it('retries an unmet postcondition until the grace period (write not committed yet)', async () => {
    lead('lead-1', { state: 'CONTACTED' });
    eventRule({ eventType: 'lead.qualified' });
    buffer.push(event({ eventType: 'lead.qualified' }));
    await engine.drainEvents();
    expect(store.runs).toHaveLength(0);
    expect(buffer.size).toBe(1);
    // The qualifying transaction commits a moment later.
    lead('lead-1', { state: 'QUALIFIED' });
    now = new Date(START.getTime() + 5_000);
    await engine.drainEvents();
    expect(store.runs).toHaveLength(1);
  });

  it('drops a postcondition that never holds after the grace period', async () => {
    lead('lead-1', { state: 'CONTACTED' });
    eventRule({ eventType: 'lead.qualified' });
    buffer.push(event({ eventType: 'lead.qualified' }));
    await engine.drainEvents();
    now = new Date(START.getTime() + 31_000);
    await engine.drainEvents();
    expect(store.runs).toHaveLength(0);
    expect(buffer.size).toBe(0);
  });

  it('runs a rule only for events after it took effect (created, edited, reactivated)', async () => {
    lead();
    const older = eventRule();
    const newer = eventRule({ effectiveFrom: new Date(START.getTime() + 1) });
    buffer.push(event({ occurredAt: START.getTime() }));
    await engine.drainEvents();
    expect(store.runs.map((r) => r.ruleId)).toEqual([older.id]);
    expect(newer.id).not.toBe(older.id);
  });

  it('never runs an event that happened while automation was off', async () => {
    lead();
    eventRule();
    store.settingsByTenant.set(T1, {
      automationEnabled: true,
      maxRunsPerRulePerHour: 60,
      notifyRuleOwnerOnFailure: false,
      automationEnabledAt: new Date(START.getTime() + 1),
    });
    buffer.push(event({ occurredAt: START.getTime() }));
    buffer.push(event({ occurredAt: START.getTime() + 2 }));
    await engine.drainEvents();
    expect(store.runs).toHaveLength(1);
  });

  it('runs a lost rule even when the deal was reopened before the tick', async () => {
    store.records.set('opp-1', {
      entity: 'opportunity',
      tenantId: T1,
      ownerId: 'owner',
      name: 'Deal',
      state: 'PROSPECTING',
      leadId: null,
      deleted: false,
    } as never);
    const lost = eventRule({ eventType: 'opportunity.lost' });
    buffer.push(
      event({ eventType: 'opportunity.stage_changed', recordId: 'opp-1', newStage: 'CLOSED_LOST' })
    );
    await engine.drainEvents();
    expect(store.runs.map((r) => r.ruleId)).toEqual([lost.id]);
  });

  it('maps a closing stage change to the won rule and skips stage rules', async () => {
    store.records.set('opp-1', {
      entity: 'opportunity',
      tenantId: T1,
      ownerId: 'owner',
      name: 'Big deal',
      state: 'CLOSED_WON',
      leadId: null,
      deleted: false,
    } as never);
    const won = eventRule({ eventType: 'opportunity.won' });
    eventRule({ eventType: 'opportunity.stage_changed' });
    buffer.push(
      event({ eventType: 'opportunity.stage_changed', recordId: 'opp-1', newStage: 'CLOSED_WON' })
    );
    await engine.drainEvents();
    expect(store.runs.map((r) => r.ruleId)).toEqual([won.id]);
  });

  it('matches the stage filter against each event, even after a later stage change', async () => {
    // Two committed changes before the tick: PROPOSAL, then NEGOTIATION (the record's stage now).
    store.records.set('opp-1', {
      entity: 'opportunity',
      tenantId: T1,
      ownerId: 'owner',
      name: 'Deal',
      state: 'NEGOTIATION',
      leadId: null,
      deleted: false,
    } as never);
    const proposal = eventRule({
      eventType: 'opportunity.stage_changed',
      eventFilter: { toStage: 'PROPOSAL' },
    });
    const negotiation = eventRule({
      eventType: 'opportunity.stage_changed',
      eventFilter: { toStage: 'NEGOTIATION' },
    });
    eventRule({
      eventType: 'opportunity.stage_changed',
      eventFilter: { toStage: 'QUALIFICATION' },
    });
    buffer.push(
      event({ eventType: 'opportunity.stage_changed', recordId: 'opp-1', newStage: 'PROPOSAL' })
    );
    buffer.push(
      event({ eventType: 'opportunity.stage_changed', recordId: 'opp-1', newStage: 'NEGOTIATION' })
    );
    await engine.drainEvents();
    expect(store.runs.map((r) => r.ruleId).sort()).toEqual([proposal.id, negotiation.id].sort());
  });

  it('skips contact/account rules for records born of a lead conversion (ruling 7)', async () => {
    store.records.set('contact-1', {
      entity: 'contact',
      tenantId: T1,
      ownerId: 'owner',
      name: 'Ada',
      state: null,
      leadId: 'lead-9',
      deleted: false,
    } as never);
    store.records.set('account-1', {
      entity: 'account',
      tenantId: T1,
      ownerId: 'owner',
      name: 'Acme',
      state: null,
      leadId: null,
      deleted: false,
    } as never);
    eventRule({ eventType: 'contact.created' });
    eventRule({ eventType: 'account.created' });
    correlation.add('account-1', now.getTime());
    buffer.push(event({ eventType: 'contact.created', recordId: 'contact-1' }));
    buffer.push(event({ eventType: 'account.created', recordId: 'account-1' }));
    await engine.drainEvents();
    expect(store.runs.map((r) => [r.status, r.outcome])).toEqual([
      ['SKIPPED', 'covered_by_lead_conversion'],
      ['SKIPPED', 'covered_by_lead_conversion'],
    ]);
  });

  it('enforces the hourly cap before writing a run and counts suppressions', async () => {
    lead();
    const rule = eventRule();
    store.settingsByTenant.set(T1, {
      automationEnabled: true,
      maxRunsPerRulePerHour: 2,
      notifyRuleOwnerOnFailure: false,
    });
    for (let i = 0; i < 4; i++) buffer.push(event());
    await engine.drainEvents();
    expect(store.runs).toHaveLength(2);
    expect(rule.suppressedCount).toBe(2);
  });

  it('does nothing for a tenant with automation off, or a deleted record', async () => {
    lead();
    eventRule();
    store.settingsByTenant.set(T1, {
      automationEnabled: false,
      maxRunsPerRulePerHour: 60,
      notifyRuleOwnerOnFailure: false,
    });
    buffer.push(event());
    await engine.drainEvents();
    store.settingsByTenant.delete(T1);
    lead('lead-1', { deleted: true });
    buffer.push(event());
    await engine.drainEvents();
    expect(store.runs).toHaveLength(0);
  });

  it('drains at most 500 events per tick', async () => {
    for (let i = 0; i < 520; i++) buffer.push(event({ eventType: 'not.watched' }));
    await engine.drainEvents();
    expect(buffer.size).toBe(20);
  });

  it('keeps going when one event fails', async () => {
    lead();
    eventRule();
    const original = store.loadRecord.bind(store);
    vi.spyOn(store, 'loadRecord')
      .mockImplementationOnce(async () => {
        throw new Error('db blip');
      })
      .mockImplementation(original);
    buffer.push(event({ eventId: 'evt-a' }));
    buffer.push(event({ eventId: 'evt-b' }));
    await engine.drainEvents();
    expect(store.runs).toHaveLength(1);
    // The failed event is retried (not lost) and fires on the next drain.
    expect(buffer.size).toBe(1);
    await engine.drainEvents();
    expect(store.runs).toHaveLength(2);
  });

  it('drops an event that keeps failing after the grace period, with the reason', async () => {
    lead();
    eventRule();
    vi.spyOn(store, 'loadRecord').mockRejectedValue(new Error('db blip'));
    buffer.push(event());
    await engine.drainEvents();
    now = new Date(START.getTime() + 31_000);
    await engine.drainEvents();
    expect(buffer.size).toBe(0);
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('not processed: db blip'));
  });
});

describe('enqueueDueSchedules', () => {
  function scheduleRule(nextRunAt: Date, extra: Partial<FakeRule> = {}) {
    return store.rule({
      tenantId: T1,
      triggerType: 'SCHEDULE',
      eventType: null,
      scheduleCron: '0 9 * * *',
      scheduleTimezone: 'Europe/London',
      nextRunAt,
      actions: [createTask()],
      ...extra,
    });
  }

  it('enqueues a due slot once and advances to the next future slot', async () => {
    const rule = scheduleRule(new Date('2026-10-20T08:00:00.000Z'));
    await engine.enqueueDueSchedules();
    await engine.enqueueDueSchedules();
    expect(store.runs).toHaveLength(1);
    expect(store.runs[0]).toMatchObject({
      idempotencyKey: 'schedule:2026-10-20T08:00:00.000Z',
      triggerType: 'SCHEDULE',
    });
    expect(rule.nextRunAt?.toISOString()).toBe('2026-10-21T08:00:00.000Z');
  });

  it('puts a claimed slot back when admission fails, so the next tick retries it', async () => {
    const slot = new Date('2026-10-20T08:00:00.000Z');
    const rule = scheduleRule(slot);
    vi.spyOn(store, 'admitRun').mockRejectedValueOnce(new Error('db down'));
    await expect(engine.enqueueDueSchedules()).resolves.toBe(0);
    expect(rule.nextRunAt?.toISOString()).toBe(slot.toISOString());
    await expect(engine.enqueueDueSchedules()).resolves.toBe(1);
    expect(store.runs[0].idempotencyKey).toBe('schedule:2026-10-20T08:00:00.000Z');
  });

  // Owner ruling 9 (2): a slot that fell due while automation was off never runs.
  it('consumes a slot that fell due while automation was off, without a run', async () => {
    const slot = new Date('2026-10-20T08:00:00.000Z');
    const rule = scheduleRule(slot);
    store.settingsByTenant.set(T1, {
      automationEnabled: true,
      maxRunsPerRulePerHour: 60,
      notifyRuleOwnerOnFailure: false,
      automationEnabledAt: new Date('2026-10-20T09:30:00.000Z'),
    });
    await expect(engine.enqueueDueSchedules()).resolves.toBe(0);
    expect(store.runs).toHaveLength(0);
    expect(rule.nextRunAt?.toISOString()).toBe('2026-10-21T08:00:00.000Z');
  });

  it('runs once for a rule many slots behind (no catch-up burst)', async () => {
    const rule = scheduleRule(new Date('2026-10-10T08:00:00.000Z'));
    await engine.enqueueDueSchedules();
    expect(store.runs).toHaveLength(1);
    expect(rule.nextRunAt!.getTime()).toBeGreaterThan(now.getTime());
  });

  it('ignores a slot that is not due yet (boundary inclusive)', async () => {
    scheduleRule(new Date(now.getTime() + 1));
    await engine.enqueueDueSchedules();
    expect(store.runs).toHaveLength(0);
    scheduleRule(new Date(now.getTime()));
    await engine.enqueueDueSchedules();
    expect(store.runs).toHaveLength(1);
  });

  it('the compare-and-set loser enqueues nothing', async () => {
    scheduleRule(new Date('2026-10-20T08:00:00.000Z'));
    vi.spyOn(store, 'claimDueSchedule').mockResolvedValueOnce(false);
    await engine.enqueueDueSchedules();
    expect(store.runs).toHaveLength(0);
  });

  it('follows DST: the London 09:00 slot is 08:00Z in summer and 09:00Z after the change', async () => {
    now = new Date('2026-10-24T09:00:00.000Z');
    const rule = scheduleRule(new Date('2026-10-24T08:00:00.000Z'));
    await engine.enqueueDueSchedules();
    expect(rule.nextRunAt?.toISOString()).toBe('2026-10-25T09:00:00.000Z');
  });

  it('turns off only the rule whose schedule is invalid', async () => {
    const broken = scheduleRule(new Date('2026-10-20T08:00:00.000Z'), { scheduleCron: 'nope' });
    scheduleRule(new Date('2026-10-20T08:00:00.000Z'));
    await engine.enqueueDueSchedules();
    expect(broken.isActive).toBe(false);
    expect(broken.lastRunOutcome).toBe('invalid_schedule');
    expect(store.runs).toHaveLength(1);
  });

  it('respects automation off and the hourly cap', async () => {
    const rule = scheduleRule(new Date('2026-10-20T08:00:00.000Z'));
    store.settingsByTenant.set(T1, {
      automationEnabled: false,
      maxRunsPerRulePerHour: 60,
      notifyRuleOwnerOnFailure: false,
    });
    await engine.enqueueDueSchedules();
    expect(store.runs).toHaveLength(0);
    rule.nextRunAt = new Date('2026-10-20T08:00:00.000Z');
    store.settingsByTenant.set(T1, {
      automationEnabled: true,
      maxRunsPerRulePerHour: 1,
      notifyRuleOwnerOnFailure: false,
    });
    await store.insertRunIfAbsent({
      tenantId: T1,
      ruleId: rule.id,
      triggerType: 'SCHEDULE',
      idempotencyKey: 'x',
      context: {},
    });
    await engine.enqueueDueSchedules();
    expect(store.runs).toHaveLength(1);
    expect(rule.suppressedCount).toBe(1);
  });
});

describe('executePendingRuns', () => {
  async function fire(rule: FakeRule, e = event()) {
    buffer.push(e);
    await runAll();
    return store.runs.filter((r) => r.ruleId === rule.id).at(-1)!;
  }

  it('creates the task for the record owner, linked to the lead, due end of tomorrow (UTC)', async () => {
    lead();
    const rule = eventRule();
    const run = await fire(rule);
    expect(created[0]).toMatchObject({
      tenantId: T1,
      ownerId: 'owner',
      title: 'Call Ada Lovelace',
      priority: 'HIGH',
      leadId: 'lead-1',
    });
    expect(created[0].dueDate?.toISOString()).toBe('2026-10-21T23:59:59.000Z');
    expect(run).toMatchObject({ status: 'SUCCEEDED', outcome: 'task_created', taskId: 'task-1' });
    expect(rule.lastRunStatus).toBe('SUCCEEDED');
  });

  it('falls back to the rule creator when the owner left, then skips when nobody is left', async () => {
    lead('lead-1', { ownerId: 'gone' });
    const rule = eventRule();
    const run = await fire(rule);
    expect(created[0].ownerId).toBe('creator');
    expect(run.outcome).toBe('owner_fallback_creator');

    store.users.delete('creator');
    const rule2 = eventRule({ eventType: 'lead.created', name: 'Second' });
    rule.isActive = false;
    const run2 = await fire(rule2);
    expect(run2).toMatchObject({ status: 'SKIPPED', outcome: 'no_eligible_owner' });
  });

  it('renders an empty title as the event label and record type', async () => {
    lead('lead-1', { name: '' });
    eventRule({ actions: [createTask({ titleTemplate: '{{record.name}}' })] });
    buffer.push(event());
    await runAll();
    expect(created[0].title).toBe('Lead created – Lead');
  });

  it('round-robins over live members in pool order and skips ineligible ones', async () => {
    store.users.set('u1', { tenantId: T1, name: 'U1' });
    store.users.set('u3', { tenantId: T1, name: 'U3' });
    store.users.set('foreign', { tenantId: T2, name: 'F' });
    lead();
    eventRule({
      actions: [
        createTask(),
        { type: 'ASSIGN_ROUND_ROBIN', userIds: ['u3', 'foreign', 'gone', 'u1'] },
      ],
    });
    for (let i = 0; i < 3; i++) buffer.push(event());
    await runAll();
    expect(assigned.map(([, assignee]) => assignee)).toEqual(['u3', 'u1', 'u3']);
    expect(assigned.every(([, , tenant]) => tenant === T1)).toBe(true);
  });

  it('assigns to the owner when nobody in the pool is eligible', async () => {
    lead();
    const rule = eventRule({
      actions: [createTask(), { type: 'ASSIGN_ROUND_ROBIN', userIds: ['gone'] }],
    });
    const run = await fire(rule);
    expect(assigned[0][1]).toBe('owner');
    expect(run.outcome).toBe('pool_empty_fallback_owner');
    expect(rule.rrCursor).toBe(0);
  });

  it('advances the cursor even when the assignment fails', async () => {
    store.users.set('u1', { tenantId: T1, name: 'U1' });
    lead();
    const rule = eventRule({
      actions: [createTask(), { type: 'ASSIGN_ROUND_ROBIN', userIds: ['u1'] }],
    });
    assignResult = false;
    const run = await fire(rule);
    expect(rule.rrCursor).toBe(1);
    expect(run).toMatchObject({ status: 'SUCCEEDED', outcome: 'assign_failed', assigneeId: null });
  });

  it('links lead.converted to the contact in the same tenant, else unlinked with the record named', async () => {
    lead('lead-1', { state: 'CONVERTED' });
    store.contacts.set('contact-1', T1);
    store.contacts.set('contact-x', T2);
    const rule = eventRule({ eventType: 'lead.converted' });
    await fire(rule, event({ eventType: 'lead.converted', contactId: 'contact-1' }));
    expect(created[0]).toMatchObject({ contactId: 'contact-1' });
    expect(created[0].leadId).toBeUndefined();

    const run = await fire(rule, event({ eventType: 'lead.converted', contactId: 'contact-x' }));
    expect(created[1].contactId).toBeUndefined();
    expect(created[1].description).toContain('Lead: Ada Lovelace');
    expect(run.outcome).toBe('link_fallback_unlinked');
  });

  it('creates won-deal tasks unlinked with the deal named (ruling 5)', async () => {
    store.records.set('opp-1', {
      entity: 'opportunity',
      tenantId: T1,
      ownerId: 'owner',
      name: 'Big deal',
      state: 'CLOSED_WON',
      leadId: null,
      deleted: false,
    } as never);
    eventRule({ eventType: 'opportunity.won' });
    buffer.push(event({ eventType: 'opportunity.won', recordId: 'opp-1' }));
    await runAll();
    expect(created[0].opportunityId).toBeUndefined();
    expect(created[0].description).toBe('Deal: Big deal');
  });

  it('retries unlinked when TaskService refuses the link (closed or converted by now)', async () => {
    lead();
    const rule = eventRule();
    createResult = (request) =>
      request.leadId ? { ok: false, reason: 'converted' } : { ok: true, taskId: 'task-ok' };
    const run = await fire(rule);
    expect(created).toHaveLength(2);
    expect(created[1].leadId).toBeUndefined();
    expect(run).toMatchObject({
      status: 'SUCCEEDED',
      taskId: 'task-ok',
      outcome: 'link_fallback_unlinked',
    });
  });

  it('records a failed task creation with a safe code and notifies the creator only when enabled', async () => {
    lead();
    const rule = eventRule();
    createResult = () => ({ ok: false, reason: 'db' });
    const run = await fire(rule);
    expect(run).toMatchObject({ status: 'FAILED', errorCode: 'task_create_failed' });
    expect(notified).toHaveLength(0);

    store.settingsByTenant.set(T1, {
      automationEnabled: true,
      maxRunsPerRulePerHour: 60,
      notifyRuleOwnerOnFailure: true,
    });
    const second = await fire(rule);
    expect(second.status).toBe('FAILED');
    expect(notified).toEqual([expect.objectContaining({ userId: 'creator' })]);
    expect(notified[0].taskId).toBeUndefined();
  });

  // Owner ruling 9 (1): a run executes the actions it was admitted with.
  it('executes the actions snapshotted at admission, not a later edit of the rule', async () => {
    lead();
    const rule = eventRule({ actions: [createTask({ titleTemplate: 'Before edit' })] });
    buffer.push(event());
    await engine.drainEvents();
    rule.actions = [createTask({ titleTemplate: 'After edit' })];
    await engine.executePendingRuns();
    expect(created.map((c) => c.title)).toEqual(['Before edit']);
  });

  // Owner ruling 9 (3): a run that fails by an exception still notifies the rule owner.
  it('notifies the rule owner when a run fails by an exception', async () => {
    lead();
    const rule = eventRule();
    store.settingsByTenant.set(T1, {
      automationEnabled: true,
      maxRunsPerRulePerHour: 60,
      notifyRuleOwnerOnFailure: true,
    });
    vi.spyOn(store, 'liveUsers').mockRejectedValueOnce(new Error('db blip'));
    const run = await fire(rule);
    expect(run).toMatchObject({ status: 'FAILED', errorCode: 'internal_error' });
    expect(notified).toEqual([expect.objectContaining({ userId: 'creator' })]);
  });

  it('notifies de-duplicated live recipients; filtered by preference is still success', async () => {
    store.users.set('u1', { tenantId: T1, name: 'U1' });
    lead();
    const rule = eventRule({
      actions: [
        createTask(),
        {
          type: 'NOTIFY',
          recipients: { assignee: true, owner: true, userIds: ['u1', 'owner', 'gone'] },
          message: '',
        },
      ],
    });
    notifyResult = async () => 'filtered';
    const run = await fire(rule);
    expect(notified.map((n) => n.userId).sort()).toEqual(['owner', 'u1']);
    expect(notified[0].title).toBe('New task: Call Ada Lovelace');
    expect(notified[0].body).toContain('"Rule"');
    expect(run).toMatchObject({ status: 'SUCCEEDED', outcome: 'notify_filtered_by_preference' });
  });

  it('keeps the created task when the assignment or the cursor throws', async () => {
    store.users.set('u1', { tenantId: T1, name: 'U1' });
    lead();
    const rule = eventRule({
      actions: [createTask(), { type: 'ASSIGN_ROUND_ROBIN', userIds: ['u1'] }],
    });
    vi.spyOn(store, 'incrementRrCursor').mockRejectedValueOnce(new Error('db blip'));
    const first = await fire(rule);
    expect(first).toMatchObject({
      status: 'SUCCEEDED',
      outcome: 'assign_failed',
      taskId: 'task-1',
    });
    assignThrows = true;
    const second = await fire(rule);
    expect(second).toMatchObject({ status: 'SUCCEEDED', outcome: 'assign_failed' });
    expect(second.taskId).toBeTruthy();
  });

  it('keeps notifying the other recipients after one delivery fails', async () => {
    store.users.set('u1', { tenantId: T1, name: 'U1' });
    store.users.set('u2', { tenantId: T1, name: 'U2' });
    lead();
    const rule = eventRule({
      actions: [
        createTask(),
        { type: 'NOTIFY', recipients: { assignee: false, owner: false, userIds: ['u1', 'u2'] } },
      ],
    });
    let calls = 0;
    notifyResult = async () => {
      calls++;
      if (calls === 1) throw new Error('smtp');
      return 'sent';
    };
    const run = await fire(rule);
    expect(notified.map((n) => n.userId)).toEqual(['u1', 'u2']);
    expect(run).toMatchObject({ status: 'SUCCEEDED', outcome: 'notify_failed' });
  });

  it('keeps the task when the notification fails', async () => {
    lead();
    const rule = eventRule({
      actions: [
        createTask(),
        { type: 'NOTIFY', recipients: { assignee: false, owner: true, userIds: [] } },
      ],
    });
    notifyResult = async () => {
      throw new Error('smtp');
    };
    const run = await fire(rule);
    expect(run).toMatchObject({ status: 'SUCCEEDED', outcome: 'notify_failed', taskId: 'task-1' });
  });

  it('skips runs of rules turned off, deleted or with automation disabled', async () => {
    lead();
    const rule = eventRule();
    buffer.push(event());
    await engine.drainEvents();
    rule.isActive = false;
    await engine.executePendingRuns();
    expect(store.runs[0]).toMatchObject({ status: 'SKIPPED', outcome: 'rule_inactive' });

    rule.isActive = true;
    store.settingsByTenant.set(T1, {
      automationEnabled: false,
      maxRunsPerRulePerHour: 60,
      notifyRuleOwnerOnFailure: false,
    });
    await store.insertRunIfAbsent({
      tenantId: T1,
      ruleId: rule.id,
      triggerType: 'ENTITY_EVENT',
      idempotencyKey: 'k2',
      context: {},
    });
    await engine.executePendingRuns();
    expect(store.runs[1]).toMatchObject({ status: 'SKIPPED', outcome: 'automation_disabled' });
    expect(created).toHaveLength(0);
  });

  it('fails a run whose actions are unreadable, and survives a thrown error', async () => {
    const rule = eventRule({ actions: 'corrupt' as never });
    await store.insertRunIfAbsent({
      tenantId: T1,
      ruleId: rule.id,
      triggerType: 'ENTITY_EVENT',
      idempotencyKey: 'k',
      context: {},
    });
    vi.spyOn(store, 'liveUsers').mockRejectedValueOnce(new Error('boom'));
    const ok = eventRule();
    await store.insertRunIfAbsent({
      tenantId: T1,
      ruleId: ok.id,
      triggerType: 'ENTITY_EVENT',
      idempotencyKey: 'k',
      context: { ownerId: 'owner' },
    });
    await engine.executePendingRuns();
    expect(store.runs[0]).toMatchObject({ status: 'FAILED', errorCode: 'task_create_failed' });
    expect(store.runs[1]).toMatchObject({ status: 'FAILED', errorCode: 'internal_error' });
  });

  it('keeps executing the batch when saving one run result fails', async () => {
    const first = eventRule({ actions: 'corrupt' as never });
    const second = eventRule({ actions: 'corrupt' as never });
    for (const [rule, key] of [
      [first, 'a'],
      [second, 'b'],
    ] as const) {
      await store.insertRunIfAbsent({
        tenantId: T1,
        ruleId: rule.id,
        triggerType: 'ENTITY_EVENT',
        idempotencyKey: key,
        context: {},
      });
    }
    const finish = vi.spyOn(store, 'finishRun').mockRejectedValueOnce(new Error('db down'));
    await expect(engine.executePendingRuns()).resolves.toBe(2);
    expect(finish).toHaveBeenCalledTimes(2);
    expect(store.runs[0].status).toBe('RUNNING');
    expect(store.runs[1]).toMatchObject({ status: 'FAILED', errorCode: 'task_create_failed' });
  });

  it('renders schedule and webhook variables; schedule due dates use the rule timezone', async () => {
    now = new Date('2026-10-20T22:30:00.000Z'); // 11:30 next day in Auckland
    const rule = store.rule({
      tenantId: T1,
      triggerType: 'SCHEDULE',
      eventType: null,
      scheduleTimezone: 'Pacific/Auckland',
      actions: [
        createTask({ titleTemplate: 'Review {{schedule.date}} {{webhook.orderId}}', dueInDays: 0 }),
      ],
    });
    await store.insertRunIfAbsent({
      tenantId: T1,
      ruleId: rule.id,
      triggerType: 'SCHEDULE',
      idempotencyKey: 's',
      context: { slot: '2026-10-20T20:00:00.000Z', webhook: { orderId: 'A-1' } },
    });
    await engine.executePendingRuns();
    expect(created[0]).toMatchObject({ ownerId: 'creator', title: 'Review 2026-10-21 A-1' });
    expect(created[0].dueDate?.toISOString()).toBe('2026-10-21T10:59:59.000Z');
  });

  it('claims at most 50 runs per tick', async () => {
    lead();
    const rule = eventRule();
    for (let i = 0; i < 55; i++) {
      await store.insertRunIfAbsent({
        tenantId: T1,
        ruleId: rule.id,
        triggerType: 'ENTITY_EVENT',
        idempotencyKey: `k${i}`,
        context: { ownerId: 'owner' },
      });
    }
    await expect(engine.executePendingRuns()).resolves.toBe(50);
  });
});

describe('maintenance', () => {
  it('marks stuck runs interrupted and purges terminal runs older than 30 days, hourly', async () => {
    const rule = eventRule();
    await store.insertRunIfAbsent({
      tenantId: T1,
      ruleId: rule.id,
      triggerType: 'ENTITY_EVENT',
      idempotencyKey: 'old',
      context: {},
    });
    store.runs[0].status = 'SUCCEEDED';
    store.runs[0].createdAt = new Date(START.getTime() - 31 * 86_400_000);
    await store.insertRunIfAbsent({
      tenantId: T1,
      ruleId: rule.id,
      triggerType: 'ENTITY_EVENT',
      idempotencyKey: 'recent',
      context: {},
    });
    store.runs[1].status = 'SUCCEEDED';
    store.runs[1].createdAt = new Date(START.getTime() - 29 * 86_400_000);
    await store.insertRunIfAbsent({
      tenantId: T1,
      ruleId: rule.id,
      triggerType: 'ENTITY_EVENT',
      idempotencyKey: 'stuck',
      context: {},
    });
    store.runs[2].status = 'RUNNING';
    store.runs[2].startedAt = new Date(START.getTime() - 11 * 60_000);

    await engine.maintenance();
    expect(store.runs.map((r) => r.idempotencyKey)).toEqual(['recent', 'stuck']);
    expect(store.runs[1]).toMatchObject({ status: 'FAILED', errorCode: 'interrupted' });

    const reap = vi.spyOn(store, 'reapStaleRuns');
    const clearSecrets = vi.spyOn(store, 'clearExpiredPreviousSecrets');
    now = new Date(START.getTime() + 30 * 60_000);
    await engine.maintenance();
    expect(reap).not.toHaveBeenCalled();
    now = new Date(START.getTime() + 61 * 60_000);
    await engine.maintenance();
    expect(reap).toHaveBeenCalledTimes(1);
    expect(clearSecrets).toHaveBeenCalledWith(now);
  });

  it('maintenance clears previous signing secrets after their grace period', async () => {
    store.rule({
      id: 'expired',
      tenantId: T1,
      webhookSecretPrevious: 'old',
      webhookSecretPreviousExpiresAt: new Date(START.getTime() - 1),
    });
    store.rule({
      id: 'live',
      tenantId: T1,
      webhookSecretPrevious: 'old',
      webhookSecretPreviousExpiresAt: new Date(START.getTime() + 3_600_000),
    });
    await expect(store.clearExpiredPreviousSecrets(START)).resolves.toBe(1);
    expect(store.rules.find((r) => r.id === 'expired')?.webhookSecretPrevious).toBeNull();
    expect(store.rules.find((r) => r.id === 'live')?.webhookSecretPrevious).toBe('old');
  });

  it('tick runs every step and reports counts', async () => {
    lead();
    eventRule();
    buffer.push(event());
    await expect(engine.tick()).resolves.toEqual({ drained: 1, scheduled: 0, executed: 1 });
  });
});
