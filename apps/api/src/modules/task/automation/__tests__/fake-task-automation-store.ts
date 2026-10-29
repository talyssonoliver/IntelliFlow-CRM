/**
 * In-memory TaskAutomationStore for engine tests (PG-208). Mirrors the Prisma
 * store's contract: idempotent run inserts, compare-and-set schedule claims,
 * conditional run claims, tenant-scoped lookups. The real store's SQL behaviour
 * is covered on a real database in tests/integration/task-automation.test.ts.
 */
import type { TaskAutomationEntity } from '@intelliflow/domain';
import {
  exceedsHourlyRunCaps,
  type AdmitRunResult,
  type ClaimSlotResult,
  type AutomationSettings,
  type ClaimedRun,
  type DueSchedule,
  type FinishRun,
  type InsertRunResult,
  type NewRun,
  type RecordInfo,
  type RuleForRun,
  type RunCaps,
  type TaskAutomationStore,
  type WebhookRule,
} from '../task-automation-store';

export interface FakeRule extends RuleForRun {
  sortOrder: number;
  rrCursor: number;
  nextRunAt: Date | null;
  scheduleCron: string | null;
  suppressedCount: number;
  lastRunStatus: string | null;
  lastRunOutcome: string | null;
  webhookTokenHash?: string | null;
  webhookSecret?: string | null;
  webhookSecretPrevious?: string | null;
  webhookSecretPreviousExpiresAt?: Date | null;
}

export interface FakeRun extends ClaimedRun {
  idempotencyKey: string;
  payloadHash: string | null;
  status: string;
  outcome: string | null;
  errorCode: string | null;
  taskId: string | null;
  assigneeId: string | null;
  createdAt: Date;
  startedAt: Date | null;
}

export class FakeTaskAutomationStore implements TaskAutomationStore {
  rules: FakeRule[] = [];
  runs: FakeRun[] = [];
  records = new Map<string, RecordInfo & { entity: TaskAutomationEntity }>();
  users = new Map<string, { tenantId: string; name: string }>();
  settingsByTenant = new Map<string, AutomationSettings>();
  contacts = new Map<string, string>(); // contactId → tenantId
  private nextId = 1;

  constructor(private readonly clock: () => Date) {}

  rule(overrides: Partial<FakeRule> & Pick<FakeRule, 'tenantId'>): FakeRule {
    const rule: FakeRule = {
      id: `rule-${this.nextId++}`,
      name: 'Rule',
      isActive: true,
      triggerType: 'ENTITY_EVENT',
      eventType: 'lead.created',
      eventFilter: null,
      scheduleTimezone: null,
      actions: [],
      createdBy: 'creator',
      effectiveFrom: new Date(0),
      sortOrder: 0,
      rrCursor: 0,
      nextRunAt: null,
      scheduleCron: null,
      suppressedCount: 0,
      lastRunStatus: null,
      lastRunOutcome: null,
      ...overrides,
    };
    this.rules.push(rule);
    return rule;
  }

  async activeEventTypes() {
    return [
      ...new Set(this.rules.filter((r) => r.isActive && r.eventType).map((r) => r.eventType!)),
    ];
  }

  async loadRecord(entity: TaskAutomationEntity, id: string) {
    const record = this.records.get(id);
    return record && record.entity === entity ? record : null;
  }

  async contactInTenant(contactId: string, tenantId: string) {
    return this.contacts.get(contactId) === tenantId;
  }

  async settings(tenantId: string) {
    return (
      this.settingsByTenant.get(tenantId) ?? {
        automationEnabled: true,
        maxRunsPerRulePerHour: 60,
        notifyRuleOwnerOnFailure: false,
      }
    );
  }

  async findEventRules(tenantId: string, eventType: string) {
    return this.rules.filter(
      (r) =>
        r.tenantId === tenantId &&
        r.isActive &&
        r.triggerType === 'ENTITY_EVENT' &&
        r.eventType === eventType
    );
  }

  async loadRule(tenantId: string, ruleId: string) {
    return this.rules.find((r) => r.id === ruleId && r.tenantId === tenantId) ?? null;
  }

  async countRunsSince(tenantId: string, ruleId: string | null, since: Date) {
    return this.runs.filter(
      (r) => r.tenantId === tenantId && (!ruleId || r.ruleId === ruleId) && r.createdAt >= since
    ).length;
  }

  async recordSuppressed(tenantId: string, ruleId: string) {
    const rule = this.rules.find((r) => r.id === ruleId && r.tenantId === tenantId);
    if (rule) rule.suppressedCount++;
  }

  async claimSlotAndAdmit(
    schedule: DueSchedule,
    next: Date,
    run: NewRun,
    caps: RunCaps,
    now: Date
  ): Promise<ClaimSlotResult> {
    if (!(await this.claimDueSchedule(schedule, next))) return { claimed: false };
    try {
      return await this.admitRun(run, caps, now);
    } catch (err) {
      // One transaction in the real store: a failed admission leaves the slot due.
      const rule = this.rules.find((r) => r.id === schedule.id);
      if (rule) rule.nextRunAt = schedule.nextRunAt;
      throw err;
    }
  }

  async admitRun(run: NewRun, caps: RunCaps, now: Date): Promise<AdmitRunResult> {
    const existing = this.runs.find(
      (r) => r.ruleId === run.ruleId && r.idempotencyKey === run.idempotencyKey
    );
    if (existing) return { created: false, existingPayloadHash: existing.payloadHash };
    // Like the real store: the run snapshots the rule's actions at admission.
    const rule = this.rules.find((r) => r.id === run.ruleId && r.tenantId === run.tenantId);
    if (!rule?.isActive) return { inactive: true };
    const hourAgo = new Date(now.getTime() - 3_600_000);
    if (caps.perMinute !== undefined) {
      const minuteAgo = new Date(now.getTime() - 60_000);
      if ((await this.countRunsSince(run.tenantId, run.ruleId, minuteAgo)) >= caps.perMinute) {
        return { capped: true };
      }
    }
    const [lastHour, tenantHour] = await Promise.all([
      this.countRunsSince(run.tenantId, run.ruleId, hourAgo),
      this.countRunsSince(run.tenantId, null, hourAgo),
    ]);
    if (exceedsHourlyRunCaps(lastHour, tenantHour, caps.perHour)) return { capped: true };
    return this.insertRunIfAbsent({
      ...run,
      actions: rule.actions,
      context: run.contextFor ? run.contextFor(rule.actions) : run.context,
    });
  }

  async insertRunIfAbsent(run: NewRun): Promise<InsertRunResult> {
    const existing = this.runs.find(
      (r) => r.ruleId === run.ruleId && r.idempotencyKey === run.idempotencyKey
    );
    if (existing) return { created: false, existingPayloadHash: existing.payloadHash };
    const id = `run-${this.nextId++}`;
    this.runs.push({
      id,
      tenantId: run.tenantId,
      ruleId: run.ruleId,
      triggerType: run.triggerType,
      context: run.context as never,
      actions: run.actions ?? null,
      idempotencyKey: run.idempotencyKey,
      payloadHash: run.payloadHash ?? null,
      status: run.status ?? 'PENDING',
      outcome: run.outcome ?? null,
      errorCode: null,
      taskId: null,
      assigneeId: null,
      createdAt: this.clock(),
      startedAt: null,
    });
    return { created: true, runId: id };
  }

  async findDueSchedules(now: Date, limit: number): Promise<DueSchedule[]> {
    return this.rules
      .filter(
        (r) => r.isActive && r.triggerType === 'SCHEDULE' && r.nextRunAt && r.nextRunAt <= now
      )
      .slice(0, limit)
      .map((r) => ({
        id: r.id,
        tenantId: r.tenantId,
        nextRunAt: r.nextRunAt!,
        scheduleCron: r.scheduleCron!,
        scheduleTimezone: r.scheduleTimezone!,
        actions: r.actions,
      }));
  }

  async claimDueSchedule(schedule: DueSchedule, next: Date) {
    const rule = this.rules.find((r) => r.id === schedule.id && r.tenantId === schedule.tenantId);
    if (!rule?.isActive || rule.nextRunAt?.getTime() !== schedule.nextRunAt.getTime()) return false;
    rule.nextRunAt = next;
    return true;
  }

  async deactivateSchedule(tenantId: string, ruleId: string, _now: Date, errorCode: string) {
    const rule = this.rules.find((r) => r.id === ruleId && r.tenantId === tenantId);
    if (rule) {
      rule.isActive = false;
      rule.lastRunStatus = 'FAILED';
      rule.lastRunOutcome = errorCode;
    }
  }

  async claimPendingRuns(limit: number, now: Date) {
    const claimed = this.runs.filter((r) => r.status === 'PENDING').slice(0, limit);
    for (const run of claimed) {
      run.status = 'RUNNING';
      run.startedAt = now;
    }
    return claimed.map((r) => ({ ...r }));
  }

  async finishRun(run: ClaimedRun, result: FinishRun) {
    const stored = this.runs.find((r) => r.id === run.id)!;
    stored.status = result.status;
    stored.outcome = result.outcome ?? null;
    stored.errorCode = result.errorCode ?? null;
    stored.taskId = result.taskId ?? null;
    stored.assigneeId = result.assigneeId ?? null;
    const rule = this.rules.find((r) => r.id === run.ruleId);
    if (rule) {
      rule.lastRunStatus = result.status;
      rule.lastRunOutcome = result.outcome ?? result.errorCode ?? null;
    }
  }

  async liveUsers(tenantId: string, ids: string[]) {
    const out = new Map<string, string>();
    for (const id of ids) {
      const user = this.users.get(id);
      if (user?.tenantId === tenantId) out.set(id, user.name);
    }
    return out;
  }

  async incrementRrCursor(tenantId: string, ruleId: string) {
    const rule = this.rules.find((r) => r.id === ruleId && r.tenantId === tenantId)!;
    rule.rrCursor++;
    return rule.rrCursor;
  }

  async reapStaleRuns(startedBefore: Date) {
    let count = 0;
    for (const run of this.runs) {
      if (run.status === 'RUNNING' && run.startedAt && run.startedAt < startedBefore) {
        run.status = 'FAILED';
        run.errorCode = 'interrupted';
        count++;
      }
    }
    return count;
  }

  async clearExpiredPreviousSecrets(now: Date) {
    let count = 0;
    for (const rule of this.rules) {
      if (rule.webhookSecretPreviousExpiresAt && rule.webhookSecretPreviousExpiresAt < now) {
        rule.webhookSecretPrevious = null;
        rule.webhookSecretPreviousExpiresAt = null;
        count++;
      }
    }
    return count;
  }

  async purgeRunsBefore(before: Date, limit: number) {
    const old = this.runs
      .filter((r) => ['SUCCEEDED', 'FAILED', 'SKIPPED'].includes(r.status) && r.createdAt < before)
      .slice(0, limit);
    this.runs = this.runs.filter((r) => !old.includes(r));
    return old.length;
  }

  async loadWebhookRule(tokenHash: string): Promise<WebhookRule | null> {
    const rule = this.rules.find((r) => r.webhookTokenHash === tokenHash);
    if (!rule) return null;
    return {
      id: rule.id,
      tenantId: rule.tenantId,
      isActive: rule.isActive,
      triggerType: rule.triggerType,
      actions: rule.actions,
      webhookSecret: rule.webhookSecret ?? null,
      webhookSecretPrevious: rule.webhookSecretPrevious ?? null,
      webhookSecretPreviousExpiresAt: rule.webhookSecretPreviousExpiresAt ?? null,
    };
  }
}
