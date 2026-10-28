/**
 * Task Automation Router — PG-208 (Module Settings: Task Automation, ADR-084).
 *
 * Tenant rules: when a trigger fires (entity event, schedule, signed webhook),
 * create a task, optionally assign it by round-robin, optionally notify. Rules
 * are executed by the API-side runner (`./automation/`); this router only
 * manages them. Tasks are CORE_CRM, so this is plain `tenantProcedure`; writes
 * are gated by `assertTaskAutomationAdmin` (webhook secrets by the narrower
 * webhook-admin set). `prismaWithTenant` does not inject `tenantId`, so every
 * read and write passes it explicitly, Prisma `data` is built field by field,
 * and reads use select allow-lists: the token hash, secrets and rule key never
 * leave the server. The URL token and signing secret are returned exactly once,
 * from the locally generated plaintext (writes return ciphertext).
 */

import { randomBytes, randomUUID } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { Prisma, tenantUserWhere } from '@intelliflow/db';
import {
  TASK_AUTOMATION_EVENTS,
  TASK_AUTOMATION_LIMITS,
  canonicalRuleKey,
  isTaskAutomationAdminRole,
  isTaskAutomationWebhookAdminRole,
} from '@intelliflow/domain';
import {
  TASK_AUTOMATION_SETTINGS_DEFAULTS,
  createTaskAutomationRuleSchema,
  createTaskAutomationTagSchema,
  listTaskAutomationRunsSchema,
  presetToCron,
  reorderTaskAutomationRulesSchema,
  rotateTaskAutomationWebhookSecretSchema,
  parseTaskAutomationActions,
  setTaskAutomationRuleActiveSchema,
  taskAutomationRuleIdSchema,
  taskAutomationTriggerSchema,
  updateTaskAutomationRuleSchema,
  updateTaskAutomationSettingsSchema,
  updateTaskAutomationTagSchema,
  type CreateTaskAutomationRuleInput,
  type TaskAutomationActionInput,
  type TaskAutomationRuleView,
  type TaskAutomationRunView,
  type TaskAutomationSettingsView,
  type TaskAutomationTagView,
  type TaskAutomationTriggerInput,
  type TaskAutomationWebhookCredentials,
} from '@intelliflow/validators';
import { createTRPCRouter, tenantProcedure } from '../../trpc';
import { createDistributedRateLimitMiddleware } from '../../middleware/rate-limit';
import {
  InvalidCronError,
  computeNextRun,
  isIntervalAllowed,
} from '../analytics/scheduled-reports.schedule';
import {
  assertTaskAutomationAdmin,
  logTaskAutomationAudit,
  type TaskAutomationCtx,
} from './automation/task-automation-admin';
import {
  HOUR_MS,
  RUN_ADMISSION_LOCK_PREFIX,
  exceedsHourlyRunCaps,
  lockRuleForAdmission,
} from './automation/task-automation-store';
import {
  TASK_AUTOMATION_WEBHOOK_PATHS,
  sha256Hex,
  webhookEncryptionReady,
} from './automation/task-automation-webhook';

export { sha256Hex };

type RuleTx = Parameters<Parameters<TaskAutomationCtx['prismaWithTenant']['$transaction']>[0]>[0];

const L = TASK_AUTOMATION_LIMITS;
const NOT_FOUND = 'Automation rule not found.';
const WEBHOOK_PATH = TASK_AUTOMATION_WEBHOOK_PATHS[0];
const TOKEN_PREFIX = 'tat_';
/** Stored, non-secret token prefix shown on the rule (`tat_` + 8 chars). */
const TOKEN_PREFIX_LENGTH = 12;

// ─── Secrets and configuration ───────────────────────────────────────────────

/** `tat_` + 32 random bytes, base64url (43 chars). The prefix keeps it off secret-scanner shapes. */
export function generateWebhookToken(): string {
  return TOKEN_PREFIX + randomBytes(32).toString('base64url');
}

export function generateSigningSecret(): string {
  return randomBytes(32).toString('hex');
}

function parseUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

/** Public API origin for webhook URLs — config only, never the request Host header. */
export function getApiPublicUrl(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.API_PUBLIC_URL?.trim();
  if (!raw) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Webhook rules are unavailable: the public API URL is not configured.',
    });
  }
  const url = parseUrl(raw);
  const allowed = env.NODE_ENV === 'production' ? ['https:'] : ['https:', 'http:'];
  if (!url || !allowed.includes(url.protocol)) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Webhook rules are unavailable: the public API URL is not a valid https URL.',
    });
  }
  return url.origin;
}

/** Signing secrets must be encrypted at rest (field-encryption key) outside tests. */
export function assertWebhookEncryptionReady(env: NodeJS.ProcessEnv = process.env): void {
  if (webhookEncryptionReady(env)) return;
  throw new TRPCError({
    code: 'PRECONDITION_FAILED',
    message: 'Webhook rules are unavailable: secret encryption is not configured.',
  });
}

/** Webhook writes refuse up front when the URL could not be issued. */
function assertWebhookUrlConfigured(): void {
  getApiPublicUrl();
}

function webhookUrl(token: string): string {
  return getApiPublicUrl() + WEBHOOK_PATH + token;
}

// ─── Rate limiting for secret-issuing and run-now mutations ──────────────────

const sensitiveLimiter = createDistributedRateLimitMiddleware(
  { limit: 10, windowMs: 60_000, name: 'task-automation-sensitive' },
  { fallback: 'in-memory' }
);

/** 10 calls per minute per user: create, rotate, regenerate, runNow. */
const sensitiveProcedure = tenantProcedure.use(async ({ ctx, next }) =>
  sensitiveLimiter({ ctx, next })
);

// ─── Mapping ─────────────────────────────────────────────────────────────────

const RULE_SELECT = {
  id: true,
  name: true,
  description: true,
  isActive: true,
  sortOrder: true,
  tags: true,
  triggerType: true,
  eventType: true,
  eventFilter: true,
  scheduleCadence: true,
  scheduleDayOfWeek: true,
  scheduleDayOfMonth: true,
  scheduleTimeOfDay: true,
  scheduleCron: true,
  scheduleTimezone: true,
  nextRunAt: true,
  webhookTokenPrefix: true,
  actions: true,
  lastRunAt: true,
  lastRunStatus: true,
  lastRunOutcome: true,
  suppressedCount: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true,
} as const;

type RuleRow = Prisma.TaskAutomationRuleGetPayload<{ select: typeof RULE_SELECT }>;

function storedTrigger(row: RuleRow): unknown {
  if (row.triggerType === 'SCHEDULE') {
    return {
      type: 'SCHEDULE',
      cadence: row.scheduleCadence,
      ...(row.scheduleDayOfWeek !== null && { dayOfWeek: row.scheduleDayOfWeek }),
      ...(row.scheduleDayOfMonth !== null && { dayOfMonth: row.scheduleDayOfMonth }),
      ...(row.scheduleTimeOfDay !== null && { timeOfDay: row.scheduleTimeOfDay }),
      ...(row.scheduleCron !== null && { cronExpression: row.scheduleCron }),
      timezone: row.scheduleTimezone ?? 'UTC',
    };
  }
  if (row.triggerType === 'WEBHOOK') return { type: 'WEBHOOK' };
  return {
    type: 'ENTITY_EVENT',
    eventType: row.eventType,
    ...(row.eventFilter !== null && { filter: row.eventFilter }),
  };
}

/** Trigger columns → the validated trigger contract (the DB CHECKs keep rows valid). */
function toTriggerView(row: RuleRow): TaskAutomationTriggerInput {
  const parsed = taskAutomationTriggerSchema.safeParse(storedTrigger(row));
  if (!parsed.success) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'A stored automation rule is not valid.',
    });
  }
  return parsed.data;
}

function toRuleView(row: RuleRow): TaskAutomationRuleView {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    tags: row.tags,
    trigger: toTriggerView(row),
    actions: parseTaskAutomationActions(row.actions) ?? [],
    webhookTokenPrefix: row.webhookTokenPrefix,
    nextRunAt: row.nextRunAt,
    lastRunAt: row.lastRunAt,
    lastRunStatus: row.lastRunStatus,
    lastRunOutcome: row.lastRunOutcome,
    suppressedCount: row.suppressedCount,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Select allow-lists that already have the view shapes (no tenantId, no internals). */
const TAG_SELECT = {
  id: true,
  name: true,
  colorToken: true,
  description: true,
  sortOrder: true,
  isActive: true,
} as const satisfies Record<keyof TaskAutomationTagView, true>;

const SETTINGS_SELECT = {
  automationEnabled: true,
  notifyRuleOwnerOnFailure: true,
  maxRunsPerRulePerHour: true,
} as const satisfies Record<keyof TaskAutomationSettingsView, true>;

// ─── Trigger → columns ───────────────────────────────────────────────────────

interface TriggerColumns {
  triggerType: string;
  eventType: string | null;
  eventFilter: Prisma.InputJsonValue | typeof DB_NULL;
  scheduleCadence: string | null;
  scheduleDayOfWeek: number | null;
  scheduleDayOfMonth: number | null;
  scheduleTimeOfDay: string | null;
  scheduleCron: string | null;
  scheduleTimezone: string | null;
  nextRunAt: Date | null;
}

/** SQL NULL for a Json? column (a bare `null` writes the JSON value null, which the CHECKs refuse). */
const DB_NULL = Prisma.DbNull;

function scheduleCron(trigger: Extract<TaskAutomationTriggerInput, { type: 'SCHEDULE' }>): string {
  const cron =
    trigger.cadence === 'custom' ? (trigger.cronExpression ?? null) : presetToCron(trigger);
  if (!cron) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Complete the schedule.' });
  }
  return cron;
}

/** Next fire time for a schedule rule; refuses invalid or too-frequent cadences. */
export function nextScheduledRun(cron: string, timezone: string, now: Date): Date {
  try {
    if (!isIntervalAllowed(cron, timezone, now)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'A scheduled rule can run at most once an hour.',
      });
    }
    return computeNextRun(cron, timezone, now);
  } catch (err) {
    if (err instanceof InvalidCronError) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'The schedule is not valid.' });
    }
    throw err;
  }
}

/** Exported for the real-DB test of the trigger-column CHECKs. */
export function triggerColumns(trigger: TaskAutomationTriggerInput, now: Date): TriggerColumns {
  const empty: TriggerColumns = {
    triggerType: trigger.type,
    eventType: null,
    eventFilter: DB_NULL,
    scheduleCadence: null,
    scheduleDayOfWeek: null,
    scheduleDayOfMonth: null,
    scheduleTimeOfDay: null,
    scheduleCron: null,
    scheduleTimezone: null,
    nextRunAt: null,
  };
  if (trigger.type === 'ENTITY_EVENT') {
    return {
      ...empty,
      eventType: trigger.eventType,
      eventFilter: trigger.filter?.toStage ? { toStage: trigger.filter.toStage } : DB_NULL,
    };
  }
  if (trigger.type === 'SCHEDULE') {
    const cron = scheduleCron(trigger);
    return {
      ...empty,
      scheduleCadence: trigger.cadence,
      scheduleDayOfWeek: trigger.dayOfWeek ?? null,
      scheduleDayOfMonth: trigger.dayOfMonth ?? null,
      scheduleTimeOfDay: trigger.timeOfDay ?? null,
      scheduleCron: cron,
      scheduleTimezone: trigger.timezone,
      nextRunAt: nextScheduledRun(cron, trigger.timezone, now),
    };
  }
  return empty;
}

/**
 * An edit that leaves the schedule (cron and timezone) unchanged keeps the
 * stored next slot, so renaming a rule never skips an occurrence that is due.
 */
function keepDueSlot(
  columns: TriggerColumns,
  existing: { isActive: boolean; scheduleCron: string | null; scheduleTimezone: string | null }
): Omit<TriggerColumns, 'nextRunAt'> & { nextRunAt?: Date | null } {
  const unchanged =
    columns.triggerType === 'SCHEDULE' &&
    existing.isActive &&
    columns.scheduleCron === existing.scheduleCron &&
    columns.scheduleTimezone === existing.scheduleTimezone;
  if (!unchanged) return columns;
  const { nextRunAt: _recomputed, ...rest } = columns;
  return rest;
}

function ruleKeyHash(
  input: Pick<CreateTaskAutomationRuleInput, 'trigger' | 'actions'>
): string | null {
  const key = canonicalRuleKey(input.trigger, input.actions);
  return key === null ? null : sha256Hex(key);
}

// ─── Guards and lookups ──────────────────────────────────────────────────────

function prismaCode(err: unknown): string | undefined {
  return err && typeof err === 'object' ? (err as { code?: string }).code : undefined;
}

function rethrowRuleWriteError(err: unknown): never {
  if (prismaCode(err) === 'P2002') {
    const target = JSON.stringify((err as { meta?: unknown }).meta ?? '');
    throw new TRPCError({
      code: 'CONFLICT',
      message: target.includes('ruleKey')
        ? 'An active rule already does exactly this. Change the trigger or the actions.'
        : 'A rule with this name already exists, or an active rule already does exactly this.',
    });
  }
  if (prismaCode(err) === 'P2025') throw new TRPCError({ code: 'NOT_FOUND', message: NOT_FOUND });
  throw err;
}

function rethrowTagWriteError(err: unknown): never {
  if (prismaCode(err) === 'P2002') {
    throw new TRPCError({ code: 'CONFLICT', message: 'A tag with this name already exists.' });
  }
  if (prismaCode(err) === 'P2025') {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Tag not found.' });
  }
  throw err;
}

async function findOwnedRule(ctx: TaskAutomationCtx, id: string) {
  const rule = await ctx.prismaWithTenant.taskAutomationRule.findFirst({
    where: { id, tenantId: ctx.tenant.tenantId },
    select: {
      id: true,
      name: true,
      isActive: true,
      triggerType: true,
      scheduleCron: true,
      scheduleTimezone: true,
      actions: true,
    },
  });
  if (!rule) throw new TRPCError({ code: 'NOT_FOUND', message: NOT_FOUND });
  return rule;
}

/**
 * Rule writes: admin role, the tenant's own rule, and the narrower webhook-admin
 * role for webhook rules (secrets live on them).
 */
async function findWritableRule(ctx: TaskAutomationCtx, id: string) {
  assertTaskAutomationAdmin(ctx);
  const rule = await findOwnedRule(ctx, id);
  if (rule.triggerType === 'WEBHOOK') assertTaskAutomationAdmin(ctx, 'webhooks', rule.id);
  return rule;
}

/** Round-robin pool and notify users must be current users of the tenant. */
async function assertUsersInTenant(ctx: TaskAutomationCtx, actions: TaskAutomationActionInput[]) {
  const ids = new Set<string>();
  for (const action of actions) {
    if (action.type === 'ASSIGN_ROUND_ROBIN') action.userIds.forEach((id) => ids.add(id));
    if (action.type === 'NOTIFY') action.recipients.userIds.forEach((id) => ids.add(id));
  }
  if (ids.size === 0) return;
  const users = await ctx.prismaWithTenant.user.findMany({
    where: { id: { in: [...ids] }, ...tenantUserWhere(ctx.tenant.tenantId) },
    select: { id: true },
  });
  if (users.length !== ids.size) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Every person in a rule must be a member of this workspace.',
    });
  }
}

/**
 * Rules may only use catalogue tags; stored with the catalogue's casing. Called
 * inside the rule write's transaction after `lockTenantRules`, the lock tag
 * rename / delete take, so a concurrent rename cannot leave a stale tag name.
 */
async function catalogueTags(tx: RuleTx, tenantId: string, names: string[]): Promise<string[]> {
  if (names.length === 0) return [];
  const rows = await tx.taskAutomationTag.findMany({
    where: { tenantId },
    select: { name: true },
  });
  const byLower = new Map(rows.map((row) => [row.name.toLowerCase(), row.name]));
  return names.map((name) => {
    const stored = byLower.get(name.toLowerCase());
    if (!stored) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: `Unknown tag: ${name}.` });
    }
    return stored;
  });
}

async function lockRunAdmission(tx: RuleTx, tenantId: string): Promise<void> {
  const lockKey = RUN_ADMISSION_LOCK_PREFIX + tenantId;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
}

async function lockTenantRules(tx: RuleTx, tenantId: string): Promise<void> {
  const lockKey = 'task_automation_rules:' + tenantId;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
}

async function loadSettings(ctx: TaskAutomationCtx): Promise<TaskAutomationSettingsView> {
  const row = await ctx.prismaWithTenant.taskAutomationSetting.findUnique({
    where: { tenantId: ctx.tenant.tenantId },
    select: SETTINGS_SELECT,
  });
  return row ?? { ...TASK_AUTOMATION_SETTINGS_DEFAULTS };
}

/**
 * Per-rule hourly cap (tenant setting) and per-tenant hourly cap, counted inside
 * the caller's transaction after the run-admission lock (owner ruling 8).
 */
export async function assertWithinRunCaps(
  tx: RuleTx,
  tenantId: string,
  ruleId: string,
  perRuleCap: number,
  now: Date
): Promise<void> {
  const since = new Date(now.getTime() - HOUR_MS);
  const ruleRuns = await tx.taskAutomationRun.count({
    where: { tenantId, ruleId, createdAt: { gte: since } },
  });
  const tenantRuns = await tx.taskAutomationRun.count({
    where: { tenantId, createdAt: { gte: since } },
  });
  if (exceedsHourlyRunCaps(ruleRuns, tenantRuns, perRuleCap)) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: 'This rule reached its hourly limit. Try again later.',
    });
  }
}

function ruleData(
  input: Pick<
    CreateTaskAutomationRuleInput,
    'name' | 'description' | 'isActive' | 'trigger' | 'actions'
  >,
  tags: string[]
) {
  return {
    name: input.name,
    description: input.description ?? null,
    isActive: input.isActive,
    tags,
    actions: input.actions as unknown as Prisma.InputJsonValue,
    ruleKey: ruleKeyHash(input),
  };
}

// ─── Settings, tags ──────────────────────────────────────────────────────────

/**
 * The moment automation goes from off to on (else null). Events that occurred
 * before it happened while automation was off and are never run later.
 */
async function reenabledAt(
  ctx: TaskAutomationCtx,
  nextEnabled: boolean | undefined
): Promise<Date | null> {
  if (nextEnabled !== true) return null;
  const current = await ctx.prismaWithTenant.taskAutomationSetting.findUnique({
    where: { tenantId: ctx.tenant.tenantId },
    select: { automationEnabled: true },
  });
  return current?.automationEnabled === false ? new Date() : null;
}

const settingsRouter = createTRPCRouter({
  get: tenantProcedure.query(({ ctx }) => loadSettings(ctx)),

  update: tenantProcedure
    .input(updateTaskAutomationSettingsSchema)
    .mutation(async ({ ctx, input }): Promise<TaskAutomationSettingsView> => {
      assertTaskAutomationAdmin(ctx);
      const tenantId = ctx.tenant.tenantId;
      const data = {
        ...(input.automationEnabled !== undefined && {
          automationEnabled: input.automationEnabled,
        }),
        ...(input.notifyRuleOwnerOnFailure !== undefined && {
          notifyRuleOwnerOnFailure: input.notifyRuleOwnerOnFailure,
        }),
        ...(input.maxRunsPerRulePerHour !== undefined && {
          maxRunsPerRulePerHour: input.maxRunsPerRulePerHour,
        }),
      };
      const enabledAt = await reenabledAt(ctx, input.automationEnabled);
      const row = await ctx.prismaWithTenant.taskAutomationSetting.upsert({
        where: { tenantId },
        create: { tenantId, ...data },
        update: { ...data, ...(enabledAt && { automationEnabledAt: enabledAt }) },
        select: SETTINGS_SELECT,
      });
      logTaskAutomationAudit(ctx, 'UPDATE', tenantId, 'settings.update', {
        fields: Object.keys(data),
      });
      return row;
    }),
});

/** Replace (rename) or remove (delete) a tag name on every tenant rule that carries it. */
async function rewriteRuleTags(
  tx: RuleTx,
  tenantId: string,
  oldName: string,
  newName: string | null
): Promise<void> {
  const rules = await tx.taskAutomationRule.findMany({
    where: { tenantId, tags: { has: oldName } },
    select: { id: true, tags: true },
  });
  const replacement = newName ? [newName] : [];
  for (const rule of rules) {
    const next = rule.tags.flatMap((t) => (t === oldName ? replacement : [t]));
    await tx.taskAutomationRule.updateMany({
      where: { id: rule.id, tenantId },
      data: { tags: [...new Set(next)] },
    });
  }
}

const tagsRouter = createTRPCRouter({
  list: tenantProcedure.query(async ({ ctx }): Promise<TaskAutomationTagView[]> => {
    const rows = await ctx.prismaWithTenant.taskAutomationTag.findMany({
      where: { tenantId: ctx.tenant.tenantId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: TAG_SELECT,
    });
    return rows;
  }),

  create: tenantProcedure
    .input(createTaskAutomationTagSchema)
    .mutation(async ({ ctx, input }): Promise<TaskAutomationTagView> => {
      assertTaskAutomationAdmin(ctx);
      const tenantId = ctx.tenant.tenantId;
      const max = await ctx.prismaWithTenant.taskAutomationTag.aggregate({
        where: { tenantId },
        _max: { sortOrder: true },
      });
      try {
        const row = await ctx.prismaWithTenant.taskAutomationTag.create({
          data: {
            tenantId,
            name: input.name,
            colorToken: input.colorToken ?? 'slate',
            description: input.description ?? null,
            sortOrder: (max._max.sortOrder ?? -1) + 1,
          },
          select: TAG_SELECT,
        });
        logTaskAutomationAudit(ctx, 'CREATE', row.id, 'tags.create');
        return row;
      } catch (err) {
        rethrowTagWriteError(err);
      }
    }),

  update: tenantProcedure
    .input(updateTaskAutomationTagSchema)
    .mutation(async ({ ctx, input }): Promise<TaskAutomationTagView> => {
      assertTaskAutomationAdmin(ctx);
      const tenantId = ctx.tenant.tenantId;
      try {
        const row = await ctx.prismaWithTenant.$transaction(async (tx) => {
          await lockTenantRules(tx, tenantId);
          const existing = await tx.taskAutomationTag.findFirst({
            where: { id: input.id, tenantId },
          });
          if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Tag not found.' });
          const updated = await tx.taskAutomationTag.update({
            where: { id: input.id, tenantId },
            data: {
              ...(input.name !== undefined && { name: input.name }),
              ...(input.colorToken !== undefined && { colorToken: input.colorToken }),
              ...(input.description !== undefined && {
                description: input.description === '' ? null : input.description,
              }),
              ...(input.isActive !== undefined && { isActive: input.isActive }),
            },
            select: TAG_SELECT,
          });
          if (input.name !== undefined && input.name !== existing.name) {
            await rewriteRuleTags(tx, tenantId, existing.name, input.name);
          }
          return updated;
        });
        logTaskAutomationAudit(ctx, 'UPDATE', row.id, 'tags.update');
        return row;
      } catch (err) {
        rethrowTagWriteError(err);
      }
    }),

  delete: tenantProcedure
    .input(taskAutomationRuleIdSchema)
    .mutation(async ({ ctx, input }): Promise<{ deleted: true }> => {
      assertTaskAutomationAdmin(ctx);
      const tenantId = ctx.tenant.tenantId;
      await ctx.prismaWithTenant.$transaction(async (tx) => {
        await lockTenantRules(tx, tenantId);
        const existing = await tx.taskAutomationTag.findFirst({
          where: { id: input.id, tenantId },
        });
        if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Tag not found.' });
        await rewriteRuleTags(tx, tenantId, existing.name, null);
        await tx.taskAutomationTag.deleteMany({ where: { id: input.id, tenantId } });
      });
      logTaskAutomationAudit(ctx, 'DELETE', input.id, 'tags.delete');
      return { deleted: true };
    }),
});

// ─── Rules ───────────────────────────────────────────────────────────────────

export interface CreateRuleResult {
  rule: TaskAutomationRuleView;
  webhook: TaskAutomationWebhookCredentials | null;
}

export const taskAutomationRouter = createTRPCRouter({
  list: tenantProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    const [rules, settings, tags] = await Promise.all([
      ctx.prismaWithTenant.taskAutomationRule.findMany({
        where: { tenantId },
        select: RULE_SELECT,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        take: L.maxRulesPerTenant,
      }),
      loadSettings(ctx),
      ctx.prismaWithTenant.taskAutomationTag.findMany({
        where: { tenantId },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: TAG_SELECT,
      }),
    ]);
    return {
      rules: rules.map(toRuleView),
      settings,
      tags,
      limits: L,
      events: TASK_AUTOMATION_EVENTS.map((e) => ({ eventType: e.eventType, label: e.label })),
      canEdit: isTaskAutomationAdminRole(ctx.user?.role),
      canManageWebhooks: isTaskAutomationWebhookAdminRole(ctx.user?.role),
    };
  }),

  listRuns: tenantProcedure
    .input(listTaskAutomationRunsSchema)
    .query(async ({ ctx, input }): Promise<TaskAutomationRunView[]> => {
      assertTaskAutomationAdmin(ctx, 'rules', input.ruleId);
      await findOwnedRule(ctx, input.ruleId);
      const runs = await ctx.prismaWithTenant.taskAutomationRun.findMany({
        where: { tenantId: ctx.tenant.tenantId, ruleId: input.ruleId },
        orderBy: { createdAt: 'desc' },
        take: L.recentRunsShown,
        select: {
          id: true,
          status: true,
          triggerType: true,
          outcome: true,
          errorCode: true,
          taskId: true,
          createdAt: true,
          finishedAt: true,
        },
      });
      return runs;
    }),

  create: sensitiveProcedure
    .input(createTaskAutomationRuleSchema)
    .mutation(async ({ ctx, input }): Promise<CreateRuleResult> => {
      const isWebhook = input.trigger.type === 'WEBHOOK';
      assertTaskAutomationAdmin(ctx, isWebhook ? 'webhooks' : 'rules');
      if (isWebhook) {
        assertWebhookEncryptionReady();
        assertWebhookUrlConfigured();
      }
      const tenantId = ctx.tenant.tenantId;
      await assertUsersInTenant(ctx, input.actions);
      const columns = triggerColumns(input.trigger, new Date());
      const token = isWebhook ? generateWebhookToken() : null;
      const secret = isWebhook ? generateSigningSecret() : null;

      try {
        const row = await ctx.prismaWithTenant.$transaction(async (tx) => {
          await lockTenantRules(tx, tenantId);
          const tags = await catalogueTags(tx, tenantId, input.tags);
          const count = await tx.taskAutomationRule.count({ where: { tenantId } });
          if (count >= L.maxRulesPerTenant) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `A workspace can have at most ${L.maxRulesPerTenant} automation rules.`,
            });
          }
          return tx.taskAutomationRule.create({
            data: {
              tenantId,
              ...ruleData(input, tags),
              ...columns,
              sortOrder: count,
              createdBy: ctx.tenant.userId,
              webhookTokenHash: token ? sha256Hex(token) : null,
              webhookTokenPrefix: token ? token.slice(0, TOKEN_PREFIX_LENGTH) : null,
              webhookSecret: secret,
            },
            select: RULE_SELECT,
          });
        });
        logTaskAutomationAudit(ctx, 'CREATE', row.id, 'rules.create', {
          triggerType: input.trigger.type,
          actionTypes: input.actions.map((a) => a.type),
        });
        return {
          rule: toRuleView(row),
          webhook: token ? { webhookUrl: webhookUrl(token), signingSecret: secret } : null,
        };
      } catch (err) {
        rethrowRuleWriteError(err);
      }
    }),

  update: tenantProcedure
    .input(updateTaskAutomationRuleSchema)
    .mutation(async ({ ctx, input }): Promise<TaskAutomationRuleView> => {
      const existing = await findWritableRule(ctx, input.id);
      if (existing.triggerType !== input.trigger.type) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'A rule’s trigger type cannot change. Create a new rule instead.',
        });
      }
      const tenantId = ctx.tenant.tenantId;
      await assertUsersInTenant(ctx, input.actions);
      const now = new Date();
      const computed = triggerColumns(input.trigger, now);

      try {
        const row = await ctx.prismaWithTenant.$transaction(async (tx) => {
          await lockTenantRules(tx, tenantId);
          // The stored schedule is read under the lock, so a concurrent edit cannot
          // make "unchanged" true against a stale copy.
          const current = await tx.taskAutomationRule.findFirst({
            where: { id: input.id, tenantId },
            select: { isActive: true, scheduleCron: true, scheduleTimezone: true },
          });
          if (!current) throw new TRPCError({ code: 'NOT_FOUND', message: NOT_FOUND });
          const tags = await catalogueTags(tx, tenantId, input.tags);
          const result = await tx.taskAutomationRule.updateMany({
            where: { id: input.id, tenantId },
            data: {
              ...ruleData(input, tags),
              ...keepDueSlot(computed, current),
              effectiveFrom: now,
            },
          });
          if (result.count === 0) throw new TRPCError({ code: 'NOT_FOUND', message: NOT_FOUND });
          return tx.taskAutomationRule.findFirstOrThrow({
            where: { id: input.id, tenantId },
            select: RULE_SELECT,
          });
        });
        logTaskAutomationAudit(ctx, 'UPDATE', row.id, 'rules.update', {
          actionTypes: input.actions.map((a) => a.type),
        });
        return toRuleView(row);
      } catch (err) {
        rethrowRuleWriteError(err);
      }
    }),

  delete: tenantProcedure
    .input(taskAutomationRuleIdSchema)
    .mutation(async ({ ctx, input }): Promise<{ deleted: true }> => {
      await findWritableRule(ctx, input.id);
      await ctx.prismaWithTenant.$transaction(async (tx) => {
        const result = await tx.taskAutomationRule.deleteMany({
          where: { id: input.id, tenantId: ctx.tenant.tenantId },
        });
        if (result.count === 0) throw new TRPCError({ code: 'NOT_FOUND', message: NOT_FOUND });
      });
      logTaskAutomationAudit(ctx, 'DELETE', input.id, 'rules.delete');
      return { deleted: true };
    }),

  setActive: tenantProcedure
    .input(setTaskAutomationRuleActiveSchema)
    .mutation(async ({ ctx, input }): Promise<{ id: string; isActive: boolean }> => {
      await findWritableRule(ctx, input.id);
      const tenantId = ctx.tenant.tenantId;
      const now = new Date();
      try {
        // Under the rule lock, from the stored schedule (an edit cannot interleave).
        await ctx.prismaWithTenant.$transaction(async (tx) => {
          await lockTenantRules(tx, tenantId);
          const current = await tx.taskAutomationRule.findFirst({
            where: { id: input.id, tenantId },
            select: { triggerType: true, scheduleCron: true, scheduleTimezone: true },
          });
          if (!current) throw new TRPCError({ code: 'NOT_FOUND', message: NOT_FOUND });
          // Reactivating a schedule starts from now: one future slot, no catch-up burst;
          // a reactivated rule only runs for events after now.
          const nextRunAt =
            input.isActive && current.triggerType === 'SCHEDULE' && current.scheduleCron
              ? nextScheduledRun(current.scheduleCron, current.scheduleTimezone ?? 'UTC', now)
              : undefined;
          await tx.taskAutomationRule.updateMany({
            where: { id: input.id, tenantId },
            data: {
              isActive: input.isActive,
              ...(nextRunAt && { nextRunAt }),
              ...(input.isActive && { effectiveFrom: now }),
            },
          });
        });
      } catch (err) {
        rethrowRuleWriteError(err);
      }
      logTaskAutomationAudit(ctx, 'UPDATE', input.id, 'rules.setActive', {
        isActive: input.isActive,
      });
      return { id: input.id, isActive: input.isActive };
    }),

  reorder: tenantProcedure
    .input(reorderTaskAutomationRulesSchema)
    .mutation(async ({ ctx, input }): Promise<{ success: true }> => {
      assertTaskAutomationAdmin(ctx);
      const tenantId = ctx.tenant.tenantId;
      const rules = await ctx.prismaWithTenant.taskAutomationRule.findMany({
        where: { tenantId },
        select: { id: true },
      });
      const owned = new Set(rules.map((r) => r.id));
      if (owned.size !== input.ids.length || input.ids.some((id) => !owned.has(id))) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'The order must list every rule of this workspace exactly once.',
        });
      }
      await ctx.prismaWithTenant.$transaction(
        input.ids.map((id, sortOrder) =>
          ctx.prismaWithTenant.taskAutomationRule.updateMany({
            where: { id, tenantId },
            data: { sortOrder },
          })
        )
      );
      logTaskAutomationAudit(ctx, 'UPDATE', tenantId, 'rules.reorder');
      return { success: true };
    }),

  rotateWebhookSecret: sensitiveProcedure
    .input(rotateTaskAutomationWebhookSecretSchema)
    .mutation(async ({ ctx, input }): Promise<TaskAutomationWebhookCredentials> => {
      assertTaskAutomationAdmin(ctx, 'webhooks', input.id);
      assertWebhookEncryptionReady();
      assertWebhookUrlConfigured();
      const tenantId = ctx.tenant.tenantId;
      const secret = generateSigningSecret();
      // Serialised with other rule writes, and the current secret read under the
      // lock: two rotations cannot resurrect a secret one of them revoked.
      await ctx.prismaWithTenant.$transaction(async (tx) => {
        await lockTenantRules(tx, tenantId);
        const existing = await tx.taskAutomationRule.findFirst({
          where: { id: input.id, tenantId, triggerType: 'WEBHOOK' },
          select: { id: true, webhookSecret: true },
        });
        if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: NOT_FOUND });
        const keepPrevious = !input.revokePrevious && existing.webhookSecret;
        await tx.taskAutomationRule.update({
          where: { tenantId_id: { tenantId, id: input.id } },
          data: {
            webhookSecret: secret,
            webhookSecretPrevious: keepPrevious ? existing.webhookSecret : null,
            webhookSecretPreviousExpiresAt: keepPrevious
              ? new Date(Date.now() + L.webhookSecretGraceHours * HOUR_MS)
              : null,
          },
          select: { id: true },
        });
      });
      logTaskAutomationAudit(ctx, 'UPDATE', input.id, 'webhook.rotateSecret', {
        revokePrevious: input.revokePrevious,
      });
      return { webhookUrl: null, signingSecret: secret };
    }),

  regenerateWebhookUrl: sensitiveProcedure
    .input(taskAutomationRuleIdSchema)
    .mutation(async ({ ctx, input }): Promise<TaskAutomationWebhookCredentials> => {
      assertTaskAutomationAdmin(ctx, 'webhooks', input.id);
      assertWebhookUrlConfigured();
      const token = generateWebhookToken();
      const result = await ctx.prismaWithTenant.taskAutomationRule.updateMany({
        where: { id: input.id, tenantId: ctx.tenant.tenantId, triggerType: 'WEBHOOK' },
        data: {
          webhookTokenHash: sha256Hex(token),
          webhookTokenPrefix: token.slice(0, TOKEN_PREFIX_LENGTH),
        },
      });
      if (result.count === 0) throw new TRPCError({ code: 'NOT_FOUND', message: NOT_FOUND });
      logTaskAutomationAudit(ctx, 'UPDATE', input.id, 'webhook.regenerateUrl');
      return { webhookUrl: webhookUrl(token), signingSecret: null };
    }),

  /** "Test Rule": queue one run now (schedule and webhook rules only). */
  runNow: sensitiveProcedure
    .input(taskAutomationRuleIdSchema)
    .mutation(async ({ ctx, input }): Promise<{ runId: string }> => {
      assertTaskAutomationAdmin(ctx, 'rules', input.id);
      const [rule, settings] = await Promise.all([findOwnedRule(ctx, input.id), loadSettings(ctx)]);
      if (rule.triggerType === 'ENTITY_EVENT') {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Event rules run when the event happens; they cannot be tested on demand.',
        });
      }
      const turnedOff = () =>
        new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Turn the rule and task automation on before testing it.',
        });
      if (!rule.isActive || !settings.automationEnabled) throw turnedOff();
      const now = new Date();
      const tenantId = ctx.tenant.tenantId;
      try {
        // Same per-tenant admission lock as the engine and the webhook route.
        const run = await ctx.prismaWithTenant.$transaction(async (tx) => {
          await lockRunAdmission(tx, tenantId);
          // The rule as it stands at admission: an edit or a pause since the read above wins.
          const current = await lockRuleForAdmission(tx, tenantId, rule.id);
          if (!current?.isActive) throw turnedOff();
          await assertWithinRunCaps(tx, tenantId, rule.id, settings.maxRunsPerRulePerHour, now);
          return tx.taskAutomationRun.create({
            data: {
              tenantId,
              ruleId: rule.id,
              triggerType: rule.triggerType,
              idempotencyKey: `manual:${randomUUID()}`,
              context: { manual: true, slot: now.toISOString() },
              actions: current.actions ?? Prisma.DbNull,
            },
            select: { id: true },
          });
        });
        logTaskAutomationAudit(ctx, 'CREATE', rule.id, 'rules.runNow');
        return { runId: run.id };
      } catch (err) {
        rethrowRuleWriteError(err);
      }
    }),

  resetToDefaults: tenantProcedure.mutation(
    async ({ ctx }): Promise<TaskAutomationSettingsView> => {
      assertTaskAutomationAdmin(ctx);
      const tenantId = ctx.tenant.tenantId;
      // Settings only: rules, runs and tags are preserved (the dialog says so).
      const enabledAt = await reenabledAt(ctx, TASK_AUTOMATION_SETTINGS_DEFAULTS.automationEnabled);
      const row = await ctx.prismaWithTenant.$transaction(async (tx) =>
        tx.taskAutomationSetting.upsert({
          where: { tenantId },
          create: { tenantId, ...TASK_AUTOMATION_SETTINGS_DEFAULTS },
          update: {
            ...TASK_AUTOMATION_SETTINGS_DEFAULTS,
            ...(enabledAt && { automationEnabledAt: enabledAt }),
          },
          select: SETTINGS_SELECT,
        })
      );
      logTaskAutomationAudit(ctx, 'UPDATE', tenantId, 'settings.resetToDefaults');
      return row;
    }
  ),

  settings: settingsRouter,
  tags: tagsRouter,
});
