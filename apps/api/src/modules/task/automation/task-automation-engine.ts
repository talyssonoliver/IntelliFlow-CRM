/**
 * Task automation engine — PG-208 (ADR-084).
 *
 * One `tick` per runner interval:
 *   1. drainEvents — buffered domain events → PENDING runs, after loading the
 *      record by id (the tenant comes from the row, never from the event),
 *      checking the event's postcondition (rolled-back changes never fire),
 *      skipping records born of a lead conversion (owner ruling 7) and
 *      admitting each run under the store's per-tenant lock, which enforces the
 *      hourly caps BEFORE a run row is written (owner ruling 8).
 *   2. enqueueDueSchedules — claim each due schedule slot (compare-and-set on
 *      nextRunAt, one slot even after downtime) → PENDING run.
 *   3. executePendingRuns — claim PENDING runs and execute their actions:
 *      Create Task (owner ruling 3, links per ruling 5), Assign Round-Robin
 *      (live tenant users in pool order, atomic cursor), Notify.
 *   4. maintenance — mark stuck RUNNING runs interrupted; purge old runs.
 *
 * Pure orchestration over injected dependencies; every failure is recorded on
 * the run with a safe code and never stops the batch.
 */

import {
  TASK_AUTOMATION_LIMITS,
  TASK_AUTOMATION_RECORD_TYPE_LABELS,
  computeAutomationDueDate,
  effectiveTaskAutomationEvent,
  fallbackTaskTitle,
  getTaskAutomationEvent,
  pickRoundRobinAssignee,
  renderTaskTemplate,
  type TaskAutomationEntity,
  type TaskAutomationOutcome,
  type TaskPriority,
} from '@intelliflow/domain';
import {
  parseTaskAutomationActions,
  type TaskAutomationActionInput,
} from '@intelliflow/validators';
import { formatISODateInTimezone, safeTimezone } from '../../../lib/timezone-utils';
import { InvalidCronError, computeNextRun } from '../../analytics/scheduled-reports.schedule';
import {
  HOUR_MS,
  type AutomationSettings,
  type ClaimedRun,
  type DueSchedule,
  type FinishRun,
  type NewRun,
  type RuleForRun,
  type TaskAutomationStore,
} from './task-automation-store';
import type {
  BufferedTaskAutomationEvent,
  ConversionCorrelation,
  TaskAutomationEventBuffer,
} from './task-automation-event-intake';

const L = TASK_AUTOMATION_LIMITS;
const MAINTENANCE_EVERY_MS = HOUR_MS;

export interface CreateTaskRequest {
  tenantId: string;
  ownerId: string;
  title: string;
  description?: string;
  priority: TaskPriority;
  dueDate?: Date;
  leadId?: string;
  contactId?: string;
  opportunityId?: string;
}

export type CreateTaskResult = { ok: true; taskId: string } | { ok: false; reason: string };

export interface NotifyRequest {
  tenantId: string;
  userId: string;
  title: string;
  body: string;
  /** Absent for rule-failure notices (the link opens Task Automation). */
  taskId?: string;
}

export interface TaskAutomationEngineDeps {
  store: TaskAutomationStore;
  buffer: TaskAutomationEventBuffer;
  correlation: ConversionCorrelation;
  now: () => Date;
  createTask: (request: CreateTaskRequest) => Promise<CreateTaskResult>;
  assignTask: (taskId: string, assigneeId: string, tenantId: string) => Promise<boolean>;
  /** 'sent' | 'filtered' (muted by preferences); throws on failure. */
  notify: (request: NotifyRequest) => Promise<'sent' | 'filtered'>;
  log?: Pick<Console, 'warn' | 'info'>;
}

export interface TickResult {
  drained: number;
  scheduled: number;
  executed: number;
}

/** What a run carries from its trigger to its execution. */
export interface RunContext {
  entity?: TaskAutomationEntity;
  recordId?: string;
  recordName?: string;
  ownerId?: string;
  eventType?: string;
  newStage?: string | null;
  linkContactId?: string | null;
  slot?: string;
  manual?: boolean;
  webhook?: Record<string, string | number | boolean>;
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function asContext(value: unknown): RunContext {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as RunContext) : {};
}

/** Task link column for a record the task links to itself (accounts have none). */
const LINK_ID_FIELD: Partial<
  Record<TaskAutomationEntity, 'leadId' | 'contactId' | 'opportunityId'>
> = {
  lead: 'leadId',
  contact: 'contactId',
  opportunity: 'opportunityId',
};

const RECORD_PATHS: Record<TaskAutomationEntity, string> = {
  lead: '/leads/',
  contact: '/contacts/',
  opportunity: '/deals/',
  account: '/accounts/',
};

function slotDate(slotIso: string | undefined, timeZone: string): string {
  return slotIso ? formatISODateInTimezone(slotIso, safeTimezone(timeZone)) : '';
}

/** Per-tick settings lookups, one query per tenant. */
type SettingsCache = Map<string, AutomationSettings>;

/**
 * Lead events are published inside LeadService's transaction, so the record
 * must show the change (else it rolled back). Stage changes are published after
 * OpportunityService saves, so they are committed facts: a later stage change
 * before the tick must not drop them (the filter matches the event's new stage).
 */
function postconditionHolds(effectiveType: string, state: string | null): boolean {
  const definition = getTaskAutomationEvent(effectiveType);
  if (!definition) return false;
  if (!definition.postcondition) return true;
  return state !== null && definition.postcondition.anyOf.includes(state);
}

function ruleMatchesFilter(
  rule: Pick<RuleForRun, 'eventFilter'>,
  event: BufferedTaskAutomationEvent
): boolean {
  const filter = rule.eventFilter;
  if (!filter || typeof filter !== 'object' || Array.isArray(filter)) return true;
  const toStage = (filter as Record<string, unknown>).toStage;
  return typeof toStage !== 'string' || toStage === event.newStage;
}

/** Owner (ruling 3): the record owner if still a member, else the rule creator, else none. */
/** De-duplicated Notify recipients (the assignee falls back to the owner). */
function notifyRecipients(
  notify: Extract<TaskAutomationActionInput, { type: 'NOTIFY' }>,
  ownerId: string,
  assigneeId: string | null
): Set<string> {
  const recipients = new Set<string>();
  if (notify.recipients.assignee) recipients.add(assigneeId ?? ownerId);
  if (notify.recipients.owner) recipients.add(ownerId);
  for (const id of notify.recipients.userIds) recipients.add(id);
  return recipients;
}

function resolveOwner(
  recordOwnerId: string | undefined,
  creatorId: string | null,
  live: Map<string, string>,
  outcomes: TaskAutomationOutcome[]
): string | null {
  if (recordOwnerId && live.has(recordOwnerId)) return recordOwnerId;
  if (creatorId && live.has(creatorId)) {
    if (recordOwnerId) outcomes.push('owner_fallback_creator');
    return creatorId;
  }
  return null;
}

export class TaskAutomationEngine {
  private lastMaintenance = 0;

  constructor(private readonly deps: TaskAutomationEngineDeps) {}

  private get log(): Pick<Console, 'warn' | 'info'> {
    return this.deps.log ?? console;
  }

  async tick(): Promise<TickResult> {
    const drained = await this.drainEvents();
    const scheduled = await this.enqueueDueSchedules();
    const executed = await this.executePendingRuns();
    await this.maintenance();
    return { drained, scheduled, executed };
  }

  // ─── 1. Events ─────────────────────────────────────────────────────────────

  async drainEvents(): Promise<number> {
    const now = this.deps.now();
    const events = this.deps.buffer.take(L.drainBatchSize);
    const settingsCache: SettingsCache = new Map();
    const rulesCache = new Map<string, RuleForRun[]>();
    const retry: BufferedTaskAutomationEvent[] = [];
    let inserted = 0;

    for (const event of events) {
      try {
        const outcome = await this.drainOne(event, now, settingsCache, rulesCache);
        if (outcome === 'retry') retry.push(event);
        else inserted += outcome;
      } catch (err) {
        // A transient failure retries within the grace period; the event id keeps
        // the idempotency key, so a partly admitted event cannot double up.
        const reason = `not processed: ${errMessage(err)}`;
        if (this.retryOrDrop(event, now, reason) === 'retry') retry.push(event);
      }
    }
    this.deps.buffer.requeue(retry);
    this.deps.correlation.prune(now.getTime());
    return inserted;
  }

  private async drainOne(
    event: BufferedTaskAutomationEvent,
    now: Date,
    settingsCache: SettingsCache,
    rulesCache: Map<string, RuleForRun[]>
  ): Promise<number | 'retry'> {
    const definition = getTaskAutomationEvent(event.eventType);
    if (!definition) return 0;
    const record = await this.deps.store.loadRecord(definition.entity, event.recordId);
    if (!record) return this.retryOrDrop(event, now, 'record not found');
    if (record.deleted) return 0;

    const effectiveType = effectiveTaskAutomationEvent(event.eventType, event.newStage);
    if (!effectiveType) return 0;
    // Events are published inside the writing transaction: an unmet postcondition
    // may be a write not yet committed, so retry within the grace period first.
    if (!postconditionHolds(effectiveType, record.state)) {
      return this.retryOrDrop(event, now, 'postcondition not met (rolled back)');
    }
    const settings = await this.settingsFor(record.tenantId, settingsCache);
    if (!settings.automationEnabled) return 0;
    // It happened while automation was off (turned back on since): never run later.
    const enabledAt = settings.automationEnabledAt?.getTime();
    if (enabledAt !== undefined && event.occurredAt < enabledAt) return 0;

    const rules = await this.eventRulesFor(record.tenantId, effectiveType, rulesCache);
    const conversionBorn =
      getTaskAutomationEvent(effectiveType)!.skipWhenConversionBorn &&
      (record.leadId !== null || this.deps.correlation.has(event.recordId, now.getTime()));
    const context: RunContext = {
      entity: definition.entity,
      recordId: event.recordId,
      recordName: record.name,
      ownerId: record.ownerId,
      eventType: effectiveType,
      newStage: event.newStage,
      linkContactId: event.contactId,
    };

    let inserted = 0;
    // A rule runs only for events after it took effect (created, edited or reactivated).
    const matches = (r: Pick<RuleForRun, 'eventFilter' | 'effectiveFrom'>) =>
      ruleMatchesFilter(r, event) && event.occurredAt >= r.effectiveFrom.getTime();
    const applicable = rules.filter(matches);
    for (const rule of applicable) {
      const run: NewRun = {
        tenantId: record.tenantId,
        ruleId: rule.id,
        triggerType: 'ENTITY_EVENT',
        idempotencyKey: `event:${event.eventId}`,
        context: context as Record<string, string | null>,
        actions: rule.actions,
        // The tick's copy may be stale: the trigger is checked again under the admission lock.
        stillMatches: (locked) =>
          locked.triggerType === 'ENTITY_EVENT' &&
          locked.eventType === effectiveType &&
          matches(locked),
      };
      if (await this.insertEventRun(run, conversionBorn, settings, now)) inserted++;
    }
    return inserted;
  }

  /** The publishing transaction may not have committed yet (LeadService): retry within the grace period. */
  private retryOrDrop(event: BufferedTaskAutomationEvent, now: Date, reason: string): 'retry' | 0 {
    const firstSeen = event.firstSeenAt ?? now.getTime();
    if (now.getTime() - firstSeen < L.missingRecordGraceMs) {
      event.firstSeenAt = firstSeen;
      return 'retry';
    }
    this.log.warn(`[task-automation] dropped ${event.eventType}: ${reason}`);
    return 0;
  }

  /** A burst of events for one tenant and type reads its rules once per tick. */
  private async eventRulesFor(
    tenantId: string,
    eventType: string,
    cache: Map<string, RuleForRun[]>
  ): Promise<RuleForRun[]> {
    const key = `${tenantId}:${eventType}`;
    let rules = cache.get(key);
    if (!rules) {
      rules = await this.deps.store.findEventRules(tenantId, eventType);
      cache.set(key, rules);
    }
    return rules;
  }

  private async settingsFor(tenantId: string, cache: SettingsCache): Promise<AutomationSettings> {
    let settings = cache.get(tenantId);
    if (!settings) {
      settings = await this.deps.store.settings(tenantId);
      cache.set(tenantId, settings);
    }
    return settings;
  }

  /** Conversion-born records record a skip; other runs go through the locked admission. */
  private async insertEventRun(
    run: NewRun,
    conversionBorn: boolean,
    settings: AutomationSettings,
    now: Date
  ): Promise<boolean> {
    if (conversionBorn) {
      await this.deps.store.insertRunIfAbsent({
        ...run,
        status: 'SKIPPED',
        outcome: 'covered_by_lead_conversion',
        finishedAt: now,
      });
      return false;
    }
    return this.admit(run, settings, now);
  }

  /** Caps checked and the run written under one tenant lock; a capped run is counted on the rule. */
  private async admit(run: NewRun, settings: AutomationSettings, now: Date): Promise<boolean> {
    const result = await this.deps.store.admitRun(
      run,
      { perHour: settings.maxRunsPerRulePerHour },
      now
    );
    // A rule deactivated or deleted since this tick read it admits nothing.
    if ('inactive' in result) return false;
    if ('capped' in result) {
      await this.deps.store.recordSuppressed(run.tenantId, run.ruleId, now);
      return false;
    }
    return result.created;
  }

  // ─── 2. Schedules ──────────────────────────────────────────────────────────

  async enqueueDueSchedules(): Promise<number> {
    const now = this.deps.now();
    const due = await this.deps.store.findDueSchedules(now, L.runBatchSize);
    const settingsCache: SettingsCache = new Map();
    let inserted = 0;
    for (const schedule of due) {
      try {
        if (await this.enqueueSchedule(schedule, now, settingsCache)) inserted++;
      } catch (err) {
        this.log.warn(`[task-automation] schedule ${schedule.id} not enqueued: ${errMessage(err)}`);
      }
    }
    return inserted;
  }

  private async enqueueSchedule(
    schedule: DueSchedule,
    now: Date,
    settingsCache: SettingsCache
  ): Promise<boolean> {
    let next: Date;
    try {
      // Strictly after now: a rule many slots behind runs once (no catch-up burst).
      next = computeNextRun(schedule.scheduleCron, schedule.scheduleTimezone, now);
    } catch (err) {
      if (!(err instanceof InvalidCronError)) throw err;
      await this.deps.store.deactivateSchedule(
        schedule.tenantId,
        schedule.id,
        now,
        'invalid_schedule'
      );
      return false;
    }
    // Disabled automation and full caps consume the slot on purpose (no catch-up),
    // and so does a slot that fell due while automation was off.
    const settings = await this.settingsFor(schedule.tenantId, settingsCache);
    const enabledAt = settings.automationEnabledAt?.getTime();
    const dueWhileOff = enabledAt !== undefined && schedule.nextRunAt.getTime() < enabledAt;
    if (!settings.automationEnabled || dueWhileOff) {
      await this.deps.store.claimDueSchedule(schedule, next);
      return false;
    }
    const slot = schedule.nextRunAt.toISOString();
    const run: NewRun = {
      tenantId: schedule.tenantId,
      ruleId: schedule.id,
      triggerType: 'SCHEDULE',
      idempotencyKey: `schedule:${slot}`,
      context: { slot },
      actions: schedule.actions,
    };
    // Claim and admission in one transaction: a slot is never consumed without its run.
    const result = await this.deps.store.claimSlotAndAdmit(
      schedule,
      next,
      run,
      { perHour: settings.maxRunsPerRulePerHour },
      now
    );
    // The claim needs an active rule, so a won slot is never `inactive`; both admit nothing.
    if ('claimed' in result || 'inactive' in result) return false;
    if ('capped' in result) {
      await this.deps.store.recordSuppressed(schedule.tenantId, schedule.id, now);
      return false;
    }
    return result.created;
  }

  // ─── 3. Execution ──────────────────────────────────────────────────────────

  async executePendingRuns(): Promise<number> {
    const now = this.deps.now();
    const runs = await this.deps.store.claimPendingRuns(L.runBatchSize, now);
    const settingsCache: SettingsCache = new Map();
    for (const run of runs) {
      let result: FinishRun;
      try {
        result = await this.executeRun(run, settingsCache);
      } catch (err) {
        this.log.warn(`[task-automation] run ${run.id} failed: ${errMessage(err)}`);
        result = { status: 'FAILED', errorCode: 'internal_error' };
      }
      // Returned and thrown failures alike notify the rule owner when enabled.
      if (result.status === 'FAILED') await this.notifyFailureIfEnabled(run, settingsCache);
      try {
        await this.deps.store.finishRun(run, result, this.deps.now());
      } catch (err) {
        // One failed write must not strand the rest of the claimed batch; this run
        // stays RUNNING and maintenance marks it interrupted.
        this.log.warn(`[task-automation] run ${run.id} result not saved: ${errMessage(err)}`);
      }
    }
    return runs.length;
  }

  private async executeRun(run: ClaimedRun, settingsCache: SettingsCache): Promise<FinishRun> {
    const rule = await this.deps.store.loadRule(run.tenantId, run.ruleId);
    if (!rule?.isActive) return { status: 'SKIPPED', outcome: 'rule_inactive' };
    const settings = await this.settingsFor(run.tenantId, settingsCache);
    if (!settings.automationEnabled) return { status: 'SKIPPED', outcome: 'automation_disabled' };
    // The actions admitted with the run: an edit applies to new events only.
    const actions = parseTaskAutomationActions(run.actions ?? rule.actions);
    const create = actions?.find((a) => a.type === 'CREATE_TASK');
    if (!actions || create?.type !== 'CREATE_TASK') {
      return { status: 'FAILED', errorCode: 'task_create_failed' };
    }

    return this.runActions(rule, run, asContext(run.context), actions, create);
  }

  private async notifyFailureIfEnabled(run: ClaimedRun, settingsCache: SettingsCache) {
    try {
      const settings = await this.settingsFor(run.tenantId, settingsCache);
      if (!settings.notifyRuleOwnerOnFailure) return;
      const rule = await this.deps.store.loadRule(run.tenantId, run.ruleId);
      if (rule) await this.notifyFailure(rule, run);
    } catch (err) {
      // A failure notice must never stop the run's result from being saved.
      this.log.warn(
        `[task-automation] failure notice for run ${run.id} not sent: ${errMessage(err)}`
      );
    }
  }

  private async runActions(
    rule: RuleForRun,
    run: ClaimedRun,
    context: RunContext,
    actions: TaskAutomationActionInput[],
    create: Extract<TaskAutomationActionInput, { type: 'CREATE_TASK' }>
  ): Promise<FinishRun> {
    const outcomes: TaskAutomationOutcome[] = [];
    const assign = actions.find((a) => a.type === 'ASSIGN_ROUND_ROBIN');
    const notify = actions.find((a) => a.type === 'NOTIFY');
    const pool = assign?.type === 'ASSIGN_ROUND_ROBIN' ? assign.userIds : [];
    const notifyUsers = notify?.type === 'NOTIFY' ? notify.recipients.userIds : [];
    const live = await this.deps.store.liveUsers(run.tenantId, [
      ...(context.ownerId ? [context.ownerId] : []),
      ...(rule.createdBy ? [rule.createdBy] : []),
      ...pool,
      ...notifyUsers,
    ]);
    const ownerId = resolveOwner(context.ownerId, rule.createdBy, live, outcomes);
    if (!ownerId) return { status: 'SKIPPED', outcome: 'no_eligible_owner' };

    const vars = this.templateVars(rule, context, live.get(ownerId) ?? '');
    const { request, linked } = await this.taskRequest(
      rule,
      run,
      context,
      create,
      vars,
      ownerId,
      outcomes
    );
    const created = await this.createWithLinkFallback(
      request,
      linked,
      create,
      vars,
      context,
      outcomes
    );
    if (!created.ok) return { status: 'FAILED', errorCode: 'task_create_failed' };

    const assigneeId = await this.assign(run, rule, pool, live, ownerId, created.taskId, outcomes);
    await this.sendNotifications(
      run,
      notify,
      created.taskId,
      request.title,
      rule.name,
      ownerId,
      assigneeId,
      live,
      outcomes
    );

    return {
      status: 'SUCCEEDED',
      outcome: outcomes[0] ?? 'task_created',
      taskId: created.taskId,
      assigneeId,
    };
  }

  private async taskRequest(
    rule: RuleForRun,
    run: ClaimedRun,
    context: RunContext,
    create: Extract<TaskAutomationActionInput, { type: 'CREATE_TASK' }>,
    vars: Map<string, string>,
    ownerId: string,
    outcomes: TaskAutomationOutcome[]
  ): Promise<{ request: CreateTaskRequest; linked: boolean }> {
    const eventLabel = vars.get('event.label') ?? rule.name;
    const recordType = context.entity
      ? TASK_AUTOMATION_RECORD_TYPE_LABELS[context.entity]
      : undefined;
    const title =
      renderTaskTemplate(create.titleTemplate, vars, L.titleMax) ||
      fallbackTaskTitle(eventLabel, recordType);
    const link = await this.resolveLink(run.tenantId, context, create.linkToRecord);
    if (link.fallback) outcomes.push('link_fallback_unlinked');
    const description = this.description(create.descriptionTemplate ?? '', vars, link.namedRecord);
    const timeZone = rule.triggerType === 'SCHEDULE' ? (rule.scheduleTimezone ?? 'UTC') : 'UTC';
    const dueDate = computeAutomationDueDate(this.deps.now(), create.dueInDays, timeZone);
    return {
      request: {
        tenantId: run.tenantId,
        ownerId,
        title,
        priority: create.priority,
        ...(description && { description }),
        ...(dueDate && { dueDate }),
        ...link.ids,
      },
      linked: Object.keys(link.ids).length > 0,
    };
  }

  /** TaskService refused the link (closed or converted by now): keep the task, name the record. */
  private async createWithLinkFallback(
    request: CreateTaskRequest,
    linked: boolean,
    create: Extract<TaskAutomationActionInput, { type: 'CREATE_TASK' }>,
    vars: Map<string, string>,
    context: RunContext,
    outcomes: TaskAutomationOutcome[]
  ): Promise<CreateTaskResult> {
    const created = await this.deps.createTask(request);
    if (created.ok || !linked) return created;
    const { leadId: _l, contactId: _c, opportunityId: _o, ...unlinked } = request;
    const retried = await this.deps.createTask({
      ...unlinked,
      description: this.description(
        create.descriptionTemplate ?? '',
        vars,
        context.recordName ?? null
      ),
    });
    if (retried.ok) outcomes.push('link_fallback_unlinked');
    return retried;
  }

  private templateVars(
    rule: RuleForRun,
    context: RunContext,
    ownerName: string
  ): Map<string, string> {
    const vars = new Map<string, string>();
    const definition = context.eventType ? getTaskAutomationEvent(context.eventType) : undefined;
    vars.set('rule.name', rule.name);
    vars.set(
      'event.label',
      definition?.label ?? (rule.triggerType === 'SCHEDULE' ? 'Scheduled rule' : rule.name)
    );
    if (context.entity) {
      vars.set('record.type', TASK_AUTOMATION_RECORD_TYPE_LABELS[context.entity]);
      if (context.recordId) vars.set('record.url', RECORD_PATHS[context.entity] + context.recordId);
    }
    if (context.recordName) vars.set('record.name', context.recordName);
    if (ownerName) vars.set('record.owner', ownerName);
    if (context.newStage) vars.set('stage.new', context.newStage);
    if (context.slot)
      vars.set('schedule.date', slotDate(context.slot, rule.scheduleTimezone ?? 'UTC'));
    for (const [key, value] of Object.entries(context.webhook ?? {})) {
      vars.set(`webhook.${key}`, String(value));
    }
    return vars;
  }

  private description(
    template: string,
    vars: Map<string, string>,
    namedRecord: string | null
  ): string {
    const body = renderTaskTemplate(template, vars, L.descriptionMax);
    if (!namedRecord) return body;
    const type = vars.get('record.type') ?? 'Record';
    const line = `${type}: ${namedRecord}`;
    return (body ? `${body}\n\n${line}` : line).slice(0, L.descriptionMax);
  }

  /** Link per the event's mode and the record's current state (owner ruling 5). */
  private async resolveLink(
    tenantId: string,
    context: RunContext,
    linkToRecord: boolean
  ): Promise<{
    ids: Partial<Pick<CreateTaskRequest, 'leadId' | 'contactId' | 'opportunityId'>>;
    namedRecord: string | null;
    fallback: boolean;
  }> {
    const none = { ids: {}, namedRecord: context.recordName ?? null, fallback: false };
    const definition = context.eventType ? getTaskAutomationEvent(context.eventType) : undefined;
    if (!linkToRecord || !definition || !context.recordId) return { ...none, namedRecord: null };
    if (definition.link === 'none') return none;
    if (definition.link === 'contact') {
      const contactId = context.linkContactId;
      if (contactId && (await this.deps.store.contactInTenant(contactId, tenantId))) {
        return { ids: { contactId }, namedRecord: null, fallback: false };
      }
      return { ...none, fallback: true };
    }
    const key = context.entity ? LINK_ID_FIELD[context.entity] : undefined;
    if (!key) return none;
    return { ids: { [key]: context.recordId }, namedRecord: null, fallback: false };
  }

  private async assign(
    run: ClaimedRun,
    rule: RuleForRun,
    pool: string[],
    live: Map<string, string>,
    ownerId: string,
    taskId: string,
    outcomes: TaskAutomationOutcome[]
  ): Promise<string | null> {
    if (pool.length === 0) return null;
    const eligible = pool.filter((id) => live.has(id));
    let assigneeId: string;
    if (eligible.length === 0) {
      assigneeId = ownerId;
      outcomes.unshift('pool_empty_fallback_owner');
    } else {
      // The cursor advances even if the assignment below fails, so one bad user cannot stall rotation.
      const cursor = await this.deps.store
        .incrementRrCursor(run.tenantId, rule.id)
        .catch(() => null);
      if (cursor === null) {
        outcomes.push('assign_failed');
        return null;
      }
      assigneeId = pickRoundRobinAssignee(eligible, cursor) ?? ownerId;
    }
    // The task already exists: an assignment error is an outcome, not a failed run.
    const assigned = await this.deps
      .assignTask(taskId, assigneeId, run.tenantId)
      .catch(() => false);
    if (!assigned) {
      outcomes.push('assign_failed');
      return null;
    }
    return assigneeId;
  }

  private async sendNotifications(
    run: ClaimedRun,
    notify: TaskAutomationActionInput | undefined,
    taskId: string,
    title: string,
    ruleName: string,
    ownerId: string,
    assigneeId: string | null,
    live: Map<string, string>,
    outcomes: TaskAutomationOutcome[]
  ): Promise<void> {
    if (notify?.type !== 'NOTIFY') return;
    const body = (notify.message?.trim() || `Created by automation rule "${ruleName}".`).slice(
      0,
      L.messageMax
    );
    const results: Array<'sent' | 'filtered' | 'failed'> = [];
    for (const userId of notifyRecipients(notify, ownerId, assigneeId)) {
      if (!live.has(userId)) continue;
      // One failed delivery never stops the other recipients.
      const result = await this.deps
        .notify({ tenantId: run.tenantId, userId, title: `New task: ${title}`, body, taskId })
        .catch(() => 'failed' as const);
      results.push(result);
    }
    if (results.includes('failed')) outcomes.push('notify_failed');
    else if (results.includes('filtered') && !results.includes('sent')) {
      outcomes.push('notify_filtered_by_preference');
    }
  }

  private async notifyFailure(rule: RuleForRun, run: ClaimedRun): Promise<void> {
    if (!rule.createdBy) return;
    const live = await this.deps.store.liveUsers(run.tenantId, [rule.createdBy]);
    if (!live.has(rule.createdBy)) return;
    try {
      await this.deps.notify({
        tenantId: run.tenantId,
        userId: rule.createdBy,
        title: `Automation rule "${rule.name}" failed`,
        body: 'A run of this rule could not create its task. Open Task Automation to see the recent runs.',
      });
    } catch {
      // A failure notice must never mask the run's own result.
    }
  }

  // ─── 4. Maintenance ────────────────────────────────────────────────────────

  async maintenance(): Promise<void> {
    const now = this.deps.now();
    if (now.getTime() - this.lastMaintenance < MAINTENANCE_EVERY_MS) return;
    this.lastMaintenance = now.getTime();
    await this.deps.store.reapStaleRuns(new Date(now.getTime() - L.staleRunMinutes * 60_000), now);
    await this.deps.store.clearExpiredPreviousSecrets(now);
    await this.deps.store.purgeRunsBefore(
      new Date(now.getTime() - L.runRetentionDays * 24 * HOUR_MS),
      500
    );
  }
}
