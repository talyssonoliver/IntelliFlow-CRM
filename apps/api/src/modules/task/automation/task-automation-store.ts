/**
 * Task automation store — PG-208 (ADR-084).
 *
 * The only database seam of the engine and the webhook verifier. Model API only,
 * so the field-encryption extension always decrypts webhook secrets (the only raw
 * SQL is the admission lock and the rule row lock, which read no encrypted
 * column), and every "claim" is a conditional update that exactly one replica
 * can win: a schedule slot (`nextRunAt` compare-and-set) and a pending run
 * (`status = PENDING` → `RUNNING`). Run idempotency is the unique
 * `(ruleId, idempotencyKey)`: a second insert is P2002, reported as a duplicate.
 *
 * Reads use the shared API client (no tenant session) and select only what the
 * engine needs; every query that targets tenant data filters by `tenantId`
 * except the two id/hash lookups that discover the tenant (a record by id, a
 * webhook rule by token hash). Time always comes from the caller (no SQL now()).
 */

import { Prisma, tenantUserWhere, type PrismaClient } from '@intelliflow/db';
import {
  TASK_AUTOMATION_LIMITS,
  leadDisplayName,
  type TaskAutomationEntity,
} from '@intelliflow/domain';
import { TASK_AUTOMATION_SETTINGS_DEFAULTS } from '@intelliflow/validators';

export interface RecordInfo {
  tenantId: string;
  ownerId: string;
  name: string;
  /** lead.status or opportunity.stage */
  state: string | null;
  /** contacts created by a lead conversion carry leadId */
  leadId: string | null;
  deleted: boolean;
}

export interface AutomationSettings {
  automationEnabled: boolean;
  maxRunsPerRulePerHour: number;
  notifyRuleOwnerOnFailure: boolean;
  /** Last time automation was turned back on; earlier events never run. */
  automationEnabledAt?: Date | null;
}

export interface RuleForRun {
  id: string;
  tenantId: string;
  name: string;
  isActive: boolean;
  triggerType: string;
  eventType: string | null;
  eventFilter: Prisma.JsonValue;
  scheduleTimezone: string | null;
  actions: Prisma.JsonValue;
  createdBy: string | null;
  /** Events that occurred before this do not run the rule. */
  effectiveFrom: Date;
}

export interface DueSchedule {
  id: string;
  tenantId: string;
  nextRunAt: Date;
  scheduleCron: string;
  scheduleTimezone: string;
  /** Snapshotted onto the slot's run. */
  actions?: Prisma.JsonValue;
}

export interface ClaimedRun {
  id: string;
  tenantId: string;
  ruleId: string;
  triggerType: string;
  context: Prisma.JsonValue;
  /** Actions snapshotted at admission (null for runs admitted before snapshots). */
  actions?: Prisma.JsonValue;
}

export interface WebhookRule {
  id: string;
  tenantId: string;
  isActive: boolean;
  triggerType: string;
  actions: Prisma.JsonValue;
  webhookSecret: string | null;
  webhookSecretPrevious: string | null;
  webhookSecretPreviousExpiresAt: Date | null;
}

export interface NewRun {
  tenantId: string;
  ruleId: string;
  triggerType: string;
  idempotencyKey: string;
  context: Prisma.InputJsonValue;
  payloadHash?: string | null;
  status?: 'PENDING' | 'SKIPPED';
  outcome?: string | null;
  finishedAt?: Date | null;
  /** The rule's actions at admission; the run executes these. */
  actions?: Prisma.JsonValue;
}

export type InsertRunResult =
  | { created: true; runId: string }
  | { created: false; existingPayloadHash: string | null };

/** Per-rule caps for one admission (the per-tenant hourly cap is fixed). */
export interface RunCaps {
  perHour: number;
  /** Webhook rules only. */
  perMinute?: number;
}

/** `inactive`: the rule was deactivated or deleted after the caller read it; nothing is written. */
export type AdmitRunResult = InsertRunResult | { capped: true } | { inactive: true };

/** A schedule slot claimed and its run admitted in one transaction, or lost to another runner. */
export type ClaimSlotResult = AdmitRunResult | { claimed: false };

export interface FinishRun {
  status: 'SUCCEEDED' | 'FAILED' | 'SKIPPED';
  outcome?: string | null;
  errorCode?: string | null;
  taskId?: string | null;
  assigneeId?: string | null;
}

export interface TaskAutomationStore {
  activeEventTypes(): Promise<string[]>;
  loadRecord(entity: TaskAutomationEntity, id: string): Promise<RecordInfo | null>;
  contactInTenant(contactId: string, tenantId: string): Promise<boolean>;
  settings(tenantId: string): Promise<AutomationSettings>;
  findEventRules(tenantId: string, eventType: string): Promise<RuleForRun[]>;
  loadRule(tenantId: string, ruleId: string): Promise<RuleForRun | null>;
  countRunsSince(tenantId: string, ruleId: string | null, since: Date): Promise<number>;
  recordSuppressed(tenantId: string, ruleId: string, now: Date): Promise<void>;
  insertRunIfAbsent(run: NewRun): Promise<InsertRunResult>;
  /**
   * Run admission for every trigger path (owner ruling 8): under a per-tenant
   * transaction lock, a repeated idempotency key reports the existing run, then
   * the caps are counted and the run inserted, so concurrent requests, ticks and
   * replicas cannot overshoot a cap. A capped run writes nothing. The run
   * snapshots the rule's actions as read under a row lock inside the
   * transaction, never `run.actions`, which the caller read earlier.
   */
  admitRun(run: NewRun, caps: RunCaps, now: Date): Promise<AdmitRunResult>;
  /**
   * Compare-and-set the schedule's next slot and admit its run in ONE
   * transaction: a crash between the two can never consume a slot without a run.
   */
  claimSlotAndAdmit(
    schedule: DueSchedule,
    next: Date,
    run: NewRun,
    caps: RunCaps,
    now: Date
  ): Promise<ClaimSlotResult>;
  findDueSchedules(now: Date, limit: number): Promise<DueSchedule[]>;
  claimDueSchedule(schedule: DueSchedule, next: Date): Promise<boolean>;
  deactivateSchedule(tenantId: string, ruleId: string, now: Date, errorCode: string): Promise<void>;
  claimPendingRuns(limit: number, now: Date): Promise<ClaimedRun[]>;
  finishRun(run: ClaimedRun, result: FinishRun, now: Date): Promise<void>;
  liveUsers(tenantId: string, ids: string[]): Promise<Map<string, string>>;
  incrementRrCursor(tenantId: string, ruleId: string): Promise<number>;
  reapStaleRuns(startedBefore: Date, now: Date): Promise<number>;
  purgeRunsBefore(before: Date, limit: number): Promise<number>;
  /** Clear previous signing secrets whose grace period has ended. */
  clearExpiredPreviousSecrets(now: Date): Promise<number>;
  loadWebhookRule(tokenHash: string): Promise<WebhookRule | null>;
}

const SETTINGS_DEFAULTS: AutomationSettings = TASK_AUTOMATION_SETTINGS_DEFAULTS;

export const HOUR_MS = 3_600_000;

/** Advisory-lock key prefix shared by every run admission path (+ tenant id). */
export const RUN_ADMISSION_LOCK_PREFIX = 'task_automation_run_admission:';

/** The hourly caps every run path enforces before a run row is written (AC-TA-013). */
export function exceedsHourlyRunCaps(
  ruleRunsLastHour: number,
  tenantRunsLastHour: number,
  perRuleCap: number
): boolean {
  return (
    ruleRunsLastHour >= perRuleCap ||
    tenantRunsLastHour >= TASK_AUTOMATION_LIMITS.maxRunsPerTenantPerHour
  );
}

const RULE_FOR_RUN_SELECT = {
  id: true,
  tenantId: true,
  name: true,
  isActive: true,
  triggerType: true,
  eventType: true,
  eventFilter: true,
  scheduleTimezone: true,
  actions: true,
  createdBy: true,
  effectiveFrom: true,
} as const;

const TERMINAL_STATUSES = ['SUCCEEDED', 'FAILED', 'SKIPPED'];

function isUniqueViolation(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && (err as { code?: string }).code === 'P2002');
}

function personName(first: string | null, last: string | null): string {
  return [first, last]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ');
}

function runCreateData(run: NewRun) {
  return {
    tenantId: run.tenantId,
    ruleId: run.ruleId,
    triggerType: run.triggerType,
    idempotencyKey: run.idempotencyKey,
    payloadHash: run.payloadHash ?? null,
    context: run.context,
    status: run.status ?? 'PENDING',
    outcome: run.outcome ?? null,
    finishedAt: run.finishedAt ?? null,
    actions: run.actions === undefined || run.actions === null ? Prisma.DbNull : run.actions,
  };
}

type Tx = Prisma.TransactionClient;

async function lockRunAdmission(tx: Tx, tenantId: string): Promise<void> {
  const lockKey = RUN_ADMISSION_LOCK_PREFIX + tenantId;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
}

/**
 * The rule's current state, read with a row share lock inside an admission
 * transaction: an action edit or a deactivation committed before admission is
 * always seen, and one still in flight is waited for (ruling 9: a run executes
 * the actions it was admitted with). Every admission path uses it, Test Rule too.
 */
export async function lockRuleForAdmission(
  tx: Tx,
  tenantId: string,
  ruleId: string
): Promise<{ actions: Prisma.JsonValue; isActive: boolean } | undefined> {
  const rows = await tx.$queryRaw<{ actions: Prisma.JsonValue; isActive: boolean }[]>`
    SELECT "actions", "isActive" FROM "task_automation_rules"
    WHERE "id" = ${ruleId} AND "tenantId" = ${tenantId}
    FOR SHARE`;
  return rows[0];
}

/**
 * Inside the admission lock: a repeated key reports the existing run (checked,
 * not caught: a failed statement would abort the transaction, and a retry of an
 * accepted run is acknowledged even when the caps are now full), then the
 * rule's current actions, then the caps, then the insert.
 */
async function admitInTransaction(
  tx: Tx,
  run: NewRun,
  caps: RunCaps,
  now: Date
): Promise<AdmitRunResult> {
  const existing = await tx.taskAutomationRun.findUnique({
    where: { ruleId_idempotencyKey: { ruleId: run.ruleId, idempotencyKey: run.idempotencyKey } },
    select: { payloadHash: true },
  });
  if (existing) return { created: false, existingPayloadHash: existing.payloadHash };
  const rule = await lockRuleForAdmission(tx, run.tenantId, run.ruleId);
  if (!rule?.isActive) return { inactive: true };
  const since = (ms: number) => ({ gte: new Date(now.getTime() - ms) });
  const forRule = { tenantId: run.tenantId, ruleId: run.ruleId };
  if (caps.perMinute !== undefined) {
    const lastMinute = await tx.taskAutomationRun.count({
      where: { ...forRule, createdAt: since(60_000) },
    });
    if (lastMinute >= caps.perMinute) return { capped: true };
  }
  const lastHour = await tx.taskAutomationRun.count({
    where: { ...forRule, createdAt: since(HOUR_MS) },
  });
  const tenantHour = await tx.taskAutomationRun.count({
    where: { tenantId: run.tenantId, createdAt: since(HOUR_MS) },
  });
  if (exceedsHourlyRunCaps(lastHour, tenantHour, caps.perHour)) return { capped: true };
  const created = await tx.taskAutomationRun.create({
    data: runCreateData({ ...run, actions: rule.actions }),
    select: { id: true },
  });
  return { created: true, runId: created.id };
}

/** Store over the shared API Prisma client (`@intelliflow/db` `prisma`). */
export function createTaskAutomationStore(db: PrismaClient): TaskAutomationStore {
  return {
    async activeEventTypes() {
      const rows = await db.taskAutomationRule.findMany({
        where: { isActive: true, triggerType: 'ENTITY_EVENT' },
        distinct: ['eventType'],
        select: { eventType: true },
      });
      return rows.map((row) => row.eventType).filter((t): t is string => t !== null);
    },

    async loadRecord(entity, id) {
      switch (entity) {
        case 'lead': {
          const row = await db.lead.findUnique({
            where: { id },
            select: {
              tenantId: true,
              ownerId: true,
              firstName: true,
              lastName: true,
              company: true,
              status: true,
            },
          });
          if (!row) return null;
          return {
            tenantId: row.tenantId,
            ownerId: row.ownerId,
            name: leadDisplayName(row),
            state: row.status,
            leadId: null,
            deleted: false,
          };
        }
        case 'contact': {
          const row = await db.contact.findUnique({
            where: { id },
            select: {
              tenantId: true,
              ownerId: true,
              firstName: true,
              lastName: true,
              leadId: true,
            },
          });
          if (!row) return null;
          return {
            tenantId: row.tenantId,
            ownerId: row.ownerId,
            name: personName(row.firstName, row.lastName) || 'Contact',
            state: null,
            leadId: row.leadId,
            deleted: false,
          };
        }
        case 'opportunity': {
          const row = await db.opportunity.findUnique({
            where: { id },
            select: { tenantId: true, ownerId: true, name: true, stage: true, deletedAt: true },
          });
          if (!row) return null;
          return {
            tenantId: row.tenantId,
            ownerId: row.ownerId,
            name: row.name,
            state: row.stage,
            leadId: null,
            deleted: row.deletedAt !== null,
          };
        }
        case 'account': {
          const row = await db.account.findUnique({
            where: { id },
            select: { tenantId: true, ownerId: true, name: true },
          });
          if (!row) return null;
          return {
            tenantId: row.tenantId,
            ownerId: row.ownerId,
            name: row.name,
            state: null,
            leadId: null,
            deleted: false,
          };
        }
      }
    },

    async contactInTenant(contactId, tenantId) {
      const row = await db.contact.findFirst({
        where: { id: contactId, tenantId },
        select: { id: true },
      });
      return row !== null;
    },

    async settings(tenantId) {
      const row = await db.taskAutomationSetting.findUnique({
        where: { tenantId },
        select: {
          automationEnabled: true,
          maxRunsPerRulePerHour: true,
          notifyRuleOwnerOnFailure: true,
          automationEnabledAt: true,
        },
      });
      return row ?? { ...SETTINGS_DEFAULTS };
    },

    findEventRules(tenantId, eventType) {
      return db.taskAutomationRule.findMany({
        where: { tenantId, isActive: true, triggerType: 'ENTITY_EVENT', eventType },
        select: RULE_FOR_RUN_SELECT,
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      });
    },

    loadRule(tenantId, ruleId) {
      return db.taskAutomationRule.findFirst({
        where: { id: ruleId, tenantId },
        select: RULE_FOR_RUN_SELECT,
      });
    },

    countRunsSince(tenantId, ruleId, since) {
      return db.taskAutomationRun.count({
        where: { tenantId, ...(ruleId && { ruleId }), createdAt: { gte: since } },
      });
    },

    async recordSuppressed(tenantId, ruleId, now) {
      await db.taskAutomationRule.updateMany({
        where: { id: ruleId, tenantId },
        data: { suppressedCount: { increment: 1 }, lastSuppressedAt: now },
      });
    },

    async insertRunIfAbsent(run) {
      try {
        const created = await db.taskAutomationRun.create({
          data: runCreateData(run),
          select: { id: true },
        });
        return { created: true, runId: created.id };
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        const existing = await db.taskAutomationRun.findUnique({
          where: {
            ruleId_idempotencyKey: { ruleId: run.ruleId, idempotencyKey: run.idempotencyKey },
          },
          select: { payloadHash: true },
        });
        return { created: false, existingPayloadHash: existing?.payloadHash ?? null };
      }
    },

    admitRun(run, caps, now) {
      return db.$transaction(async (tx): Promise<AdmitRunResult> => {
        await lockRunAdmission(tx, run.tenantId);
        return admitInTransaction(tx, run, caps, now);
      });
    },

    claimSlotAndAdmit(schedule, next, run, caps, now) {
      return db.$transaction(async (tx): Promise<ClaimSlotResult> => {
        await lockRunAdmission(tx, run.tenantId);
        const claim = await tx.taskAutomationRule.updateMany({
          where: {
            id: schedule.id,
            tenantId: schedule.tenantId,
            isActive: true,
            nextRunAt: schedule.nextRunAt,
          },
          data: { nextRunAt: next },
        });
        if (claim.count !== 1) return { claimed: false };
        return admitInTransaction(tx, run, caps, now);
      });
    },

    async findDueSchedules(now, limit) {
      const rows = await db.taskAutomationRule.findMany({
        where: { isActive: true, triggerType: 'SCHEDULE', nextRunAt: { lte: now } },
        select: {
          id: true,
          tenantId: true,
          nextRunAt: true,
          scheduleCron: true,
          scheduleTimezone: true,
          actions: true,
        },
        orderBy: { nextRunAt: 'asc' },
        take: limit,
      });
      return rows.flatMap((row) =>
        row.nextRunAt && row.scheduleCron && row.scheduleTimezone
          ? [
              {
                id: row.id,
                tenantId: row.tenantId,
                nextRunAt: row.nextRunAt,
                scheduleCron: row.scheduleCron,
                scheduleTimezone: row.scheduleTimezone,
                actions: row.actions,
              },
            ]
          : []
      );
    },

    async claimDueSchedule(schedule, next) {
      const result = await db.taskAutomationRule.updateMany({
        where: {
          id: schedule.id,
          tenantId: schedule.tenantId,
          isActive: true,
          nextRunAt: schedule.nextRunAt,
        },
        data: { nextRunAt: next },
      });
      return result.count === 1;
    },

    async deactivateSchedule(tenantId, ruleId, now, errorCode) {
      await db.taskAutomationRule.updateMany({
        where: { id: ruleId, tenantId },
        data: {
          isActive: false,
          lastRunAt: now,
          lastRunStatus: 'FAILED',
          lastRunOutcome: errorCode,
        },
      });
    },

    async claimPendingRuns(limit, now) {
      const candidates = await db.taskAutomationRun.findMany({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
        take: limit,
        select: {
          id: true,
          tenantId: true,
          ruleId: true,
          triggerType: true,
          context: true,
          actions: true,
        },
      });
      const claimed: ClaimedRun[] = [];
      for (const run of candidates) {
        try {
          const result = await db.taskAutomationRun.updateMany({
            where: { id: run.id, status: 'PENDING' },
            data: { status: 'RUNNING', startedAt: now },
          });
          if (result.count === 1) claimed.push(run);
        } catch (err) {
          // Runs already claimed must still execute; the rest stay PENDING for the next tick.
          console.warn(
            `[task-automation] claim stopped after ${claimed.length} run(s): ${err instanceof Error ? err.name : 'error'}`
          );
          break;
        }
      }
      return claimed;
    },

    async finishRun(run, result, now) {
      // Independent writes: the run row and the rule's last-run summary.
      await Promise.all([
        db.taskAutomationRun.updateMany({
          where: { id: run.id, tenantId: run.tenantId },
          data: {
            status: result.status,
            outcome: result.outcome ?? null,
            errorCode: result.errorCode ?? null,
            taskId: result.taskId ?? null,
            assigneeId: result.assigneeId ?? null,
            finishedAt: now,
          },
        }),
        db.taskAutomationRule.updateMany({
          where: { id: run.ruleId, tenantId: run.tenantId },
          data: {
            lastRunAt: now,
            lastRunStatus: result.status,
            lastRunOutcome: result.outcome ?? result.errorCode ?? null,
          },
        }),
      ]);
    },

    async liveUsers(tenantId, ids) {
      const unique = [...new Set(ids.filter(Boolean))];
      if (unique.length === 0) return new Map();
      const rows = await db.user.findMany({
        where: { AND: [{ id: { in: unique } }, tenantUserWhere(tenantId)] },
        select: { id: true, name: true, email: true },
      });
      return new Map(rows.map((row) => [row.id, row.name?.trim() || row.email]));
    },

    async incrementRrCursor(tenantId, ruleId) {
      const row = await db.taskAutomationRule.update({
        where: { tenantId_id: { tenantId, id: ruleId } },
        data: { rrCursor: { increment: 1 } },
        select: { rrCursor: true },
      });
      return row.rrCursor;
    },

    async reapStaleRuns(startedBefore, now) {
      const result = await db.taskAutomationRun.updateMany({
        where: { status: 'RUNNING', startedAt: { lt: startedBefore } },
        data: { status: 'FAILED', errorCode: 'interrupted', finishedAt: now },
      });
      return result.count;
    },

    async clearExpiredPreviousSecrets(now) {
      const result = await db.taskAutomationRule.updateMany({
        where: { webhookSecretPreviousExpiresAt: { lt: now } },
        data: { webhookSecretPrevious: null, webhookSecretPreviousExpiresAt: null },
      });
      return result.count;
    },

    async purgeRunsBefore(before, limit) {
      const old = await db.taskAutomationRun.findMany({
        where: { status: { in: TERMINAL_STATUSES }, createdAt: { lt: before } },
        orderBy: { createdAt: 'asc' },
        take: limit,
        select: { id: true },
      });
      if (old.length === 0) return 0;
      const result = await db.taskAutomationRun.deleteMany({
        where: { id: { in: old.map((r) => r.id) } },
      });
      return result.count;
    },

    loadWebhookRule(tokenHash) {
      // findUnique (model API) so the field-encryption extension decrypts the secrets.
      return db.taskAutomationRule.findUnique({
        where: { webhookTokenHash: tokenHash },
        select: {
          id: true,
          tenantId: true,
          isActive: true,
          triggerType: true,
          actions: true,
          webhookSecret: true,
          webhookSecretPrevious: true,
          webhookSecretPreviousExpiresAt: true,
        },
      });
    },
  };
}
