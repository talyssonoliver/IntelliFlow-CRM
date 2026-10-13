/**
 * Approval escalation sweep (PG-198, ADR-076, AC-014).
 *
 * One tick, run inside a single transaction guarded by a transaction-scoped
 * advisory lock so replicas never double-fire:
 *   1. escalate pending agent actions whose policy escalation delay has passed
 *      (once — `escalatedAt` is set with a status-guarded update);
 *   2. escalate pending auto-response drafts the same way, through the
 *      aggregate (`escalate(system:approval-policy, …)`), with the escalation
 *      window bounded by the draft's own expiry;
 *   3. expire overdue pending agent actions.
 * Escalation runs before expiry. The sweep never approves or executes anything.
 * Every per-tenant query carries an explicit tenantId; the only cross-tenant reads
 * are "which tenants have escalation policies" and the expiry flip.
 */

import {
  APPROVAL_AGENT_TOOL_KEYS,
  APPROVAL_AGENT_TOOLS,
  AUTO_RESPONSE_AGENT_KEY,
  TRIGGER_TYPES,
  SYSTEM_APPROVAL_ACTOR,
  isEscalationDue,
  resolveApprovalPolicy,
  type ApprovalPolicyRecord,
  type ApprovalPolicyScope,
  type ApprovalRule,
  type AutoResponseDraft,
  type AutoResponseDraftRepository,
  type TriggerType,
} from '@intelliflow/domain';
import { tenantUserWhere } from '@intelliflow/db';
import { loadTenantApprovalPolicies, type ApprovalPolicyReader } from './approval-policy-loader';

/** Advisory-lock key for the sweep (any constant unique to this job). */
export const APPROVAL_SWEEP_LOCK_KEY = 1_980_001;
/** NF-002: items per query page. */
export const APPROVAL_SWEEP_BATCH = 100;
/** Draft candidates scanned per policy per tick at most (pages of APPROVAL_SWEEP_BATCH). */
export const APPROVAL_SWEEP_MAX_PAGES = 10;

export interface SweepNotification {
  tenantId: string;
  userId: string;
  title: string;
  body: string;
  entityType: string;
  entityId: string;
  entityName: string;
  actionUrl: string;
}

interface AgentActionRow {
  id: string;
  tenantId: string;
  actionType: string;
  description: string;
  entityName: string;
  createdAt: Date;
}

/** The slice of a Prisma transaction client the sweep uses. */
export interface SweepTx extends ApprovalPolicyReader {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  /** Two shapes: the loader's per-tenant read, and the "which tenants escalate" read. */
  approvalPolicy: ApprovalPolicyReader['approvalPolicy'] & {
    findMany(args: {
      where: Record<string, unknown>;
      select: { tenantId: true };
      distinct: ['tenantId'];
    }): Promise<{ tenantId: string }[]>;
  };
  agentAction: {
    findMany(args: unknown): Promise<AgentActionRow[]>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  user: { findFirst(args: unknown): Promise<{ id: string } | null> };
}

export interface SweepPrisma {
  $transaction<T>(
    fn: (tx: SweepTx) => Promise<T>,
    options?: { timeout?: number; maxWait?: number }
  ): Promise<T>;
}

export interface ApprovalSweepDeps {
  prisma: SweepPrisma;
  draftRepository: (client: SweepTx) => Promise<AutoResponseDraftRepository>;
  /** Delivered after the sweep transaction commits, one at a time; failures are logged. */
  notify: (notification: SweepNotification) => Promise<void>;
  log?: Pick<Console, 'warn'>;
}

export interface ApprovalSweepReport {
  locked: boolean;
  agentActionsEscalated: number;
  draftsEscalated: number;
  skipped: number;
  expired: number;
}

interface TenantContext {
  tx: SweepTx;
  deps: ApprovalSweepDeps;
  tenantId: string;
  policies: ApprovalPolicyRecord[];
  now: Date;
  report: ApprovalSweepReport;
  targets: Map<string, boolean>;
  outbox: SweepNotification[];
}

/** The policies of a queue that escalate, with the (agent, action) pairs each one governs. */
interface EscalationGroup {
  rule: ApprovalRule;
  /** Tool names (agent queue) or trigger types (auto-response queue). */
  keys: string[];
}

function queuePairs(
  scope: ApprovalPolicyScope
): { agentKey: string; actionType: string; key: string }[] {
  if (scope === 'AUTO_RESPONSE') {
    return TRIGGER_TYPES.map((t) => ({ agentKey: AUTO_RESPONSE_AGENT_KEY, actionType: t, key: t }));
  }
  return APPROVAL_AGENT_TOOL_KEYS.map((tool) => ({
    agentKey: tool,
    actionType: APPROVAL_AGENT_TOOLS[tool],
    key: tool,
  }));
}

/**
 * Group a queue's pairs by the escalating policy they resolve to, so each group is
 * queried with its own delay and only for its own tools/triggers: a batch can never
 * be filled by items that are not due or whose policy does not escalate.
 */
function escalationGroups(
  policies: ApprovalPolicyRecord[],
  scope: ApprovalPolicyScope
): EscalationGroup[] {
  const groups = new Map<string, EscalationGroup>();
  for (const pair of queuePairs(scope)) {
    const resolved = resolveApprovalPolicy(policies, scope, pair.agentKey, pair.actionType);
    const { rule } = resolved;
    if (
      !rule.escalationEnabled ||
      rule.escalateAfterMinutes === null ||
      !rule.escalationTargetUserId
    ) {
      continue;
    }
    const id = String(resolved.policyId);
    const group = groups.get(id) ?? { rule, keys: [] };
    group.keys.push(pair.key);
    groups.set(id, group);
  }
  return [...groups.values()];
}

function cutoff(now: Date, minutes: number): Date {
  return new Date(now.getTime() - minutes * 60_000);
}

/** BR-9: the escalation target must still be a user of the tenant. */
async function targetIsValid(ctx: TenantContext, userId: string): Promise<boolean> {
  const cached = ctx.targets.get(userId);
  if (cached !== undefined) return cached;
  const user = await ctx.tx.user.findFirst({
    where: { id: userId, ...tenantUserWhere(ctx.tenantId) },
    select: { id: true },
  });
  const valid = user !== null;
  if (!valid) {
    ctx.deps.log?.warn(
      `[approval-sweep] tenant=${ctx.tenantId}: escalation target ${userId} is no longer a user of the workspace; skipping`
    );
  }
  ctx.targets.set(userId, valid);
  return valid;
}

/** The rule's target when it is due now and still valid; otherwise null. */
async function dueTarget(
  ctx: TenantContext,
  rule: ApprovalRule,
  startedAt: Date
): Promise<string | null> {
  if (!isEscalationDue(startedAt, ctx.now, rule, false)) return null;
  const target = rule.escalationTargetUserId as string;
  if (await targetIsValid(ctx, target)) return target;
  ctx.report.skipped += 1;
  return null;
}

/**
 * Queue a notification for delivery after the transaction commits: a failed
 * notification write must never abort (and roll back) the sweep's transaction.
 */
function queueNotification(ctx: TenantContext, notification: SweepNotification): void {
  ctx.outbox.push(notification);
}

async function escalateAgentActionGroup(ctx: TenantContext, group: EscalationGroup): Promise<void> {
  const { rule } = group;
  const rows = await ctx.tx.agentAction.findMany({
    where: {
      tenantId: ctx.tenantId,
      // The actionType column holds the tool name.
      actionType: { in: group.keys },
      status: 'PENDING_APPROVAL',
      escalatedAt: null,
      expiresAt: { gt: ctx.now },
      createdAt: { lte: cutoff(ctx.now, rule.escalateAfterMinutes as number) },
    },
    orderBy: { createdAt: 'asc' },
    take: APPROVAL_SWEEP_BATCH,
  });
  for (const row of rows) {
    const target = await dueTarget(ctx, rule, row.createdAt);
    if (!target) continue;
    const claimed = await ctx.tx.agentAction.updateMany({
      where: { id: row.id, tenantId: ctx.tenantId, status: 'PENDING_APPROVAL', escalatedAt: null },
      data: { escalatedAt: ctx.now, escalatedTo: target },
    });
    if (claimed.count !== 1) continue;
    ctx.report.agentActionsEscalated += 1;
    queueNotification(ctx, {
      tenantId: ctx.tenantId,
      userId: target,
      title: 'Agent Action Escalated for Your Review',
      body: `"${row.description}" has waited ${String(rule.escalateAfterMinutes)} minutes for approval.`,
      entityType: 'agent_action',
      entityId: row.id,
      entityName: row.entityName,
      actionUrl: `/agent-approvals/preview?actionId=${row.id}`,
    });
  }
}

/** A9: the SLA clock starts when the draft was submitted, not when it was drafted. */
function submittedAt(draft: AutoResponseDraft): Date {
  const submissions = draft.statusHistory.filter((h) => h.status === 'PENDING_APPROVAL');
  return submissions.at(-1)?.changedAt ?? draft.createdAt;
}

async function escalateDraft(
  ctx: TenantContext,
  repository: AutoResponseDraftRepository,
  rule: ApprovalRule,
  draft: AutoResponseDraft
): Promise<void> {
  const target = await dueTarget(ctx, rule, submittedAt(draft));
  if (!target) return;
  // Never beyond the draft's own expiry, so escalation.expiresAt stays truthful: the
  // aggregate adds the window to its own clock, so measure from the current time and
  // round down to whole minutes.
  const remainingMinutes = Math.floor((draft.expiresAt.getTime() - Date.now()) / 60_000);
  if (remainingMinutes <= 0) return;
  const windowHours = remainingMinutes / 60;
  const reason = `Approval SLA: no decision after ${String(rule.escalateAfterMinutes)} minutes`;
  if (draft.escalate(SYSTEM_APPROVAL_ACTOR, target, reason, windowHours).isFailure) {
    ctx.report.skipped += 1;
    return;
  }
  // Guarded write: decided or escalated meanwhile -> nothing is overwritten.
  if (!(await repository.saveEscalation(draft))) {
    ctx.deps.log?.warn(
      `[approval-sweep] draft ${draft.id.toString()} not escalated: decided or escalated meanwhile`
    );
    ctx.report.skipped += 1;
    return;
  }
  ctx.report.draftsEscalated += 1;
  queueNotification(ctx, {
    tenantId: ctx.tenantId,
    userId: target,
    title: 'AI Draft Escalated for Your Review',
    body: `An AI auto-response draft "${draft.content.subject}" has been escalated to you for review. Reason: ${reason}`,
    entityType: 'auto_response_draft',
    entityId: draft.id.toString(),
    entityName: draft.content.subject,
    actionUrl: '/agent-approvals?status=escalated',
  });
}

async function escalateDraftGroup(
  ctx: TenantContext,
  repository: AutoResponseDraftRepository,
  group: EscalationGroup
): Promise<void> {
  const base = {
    before: cutoff(ctx.now, group.rule.escalateAfterMinutes as number),
    notExpiredAt: ctx.now,
    triggerTypes: group.keys as TriggerType[],
  };
  // Candidates are ordered by creation, but the SLA runs from submission: page past
  // drafts submitted too recently, up to a bounded scan per tick. Keyset paging, so
  // drafts escalated on an earlier page cannot shift the next one.
  let after: { createdAt: Date; id: string } | undefined;
  for (let page = 0; page < APPROVAL_SWEEP_MAX_PAGES; page++) {
    const drafts = await repository.findPendingOlderThan(
      ctx.tenantId,
      { ...base, after },
      APPROVAL_SWEEP_BATCH
    );
    for (const draft of drafts) await escalateDraft(ctx, repository, group.rule, draft);
    if (drafts.length < APPROVAL_SWEEP_BATCH) return;
    const last = drafts[drafts.length - 1]!;
    after = { createdAt: last.createdAt, id: last.id.toString() };
  }
}

async function escalateTenant(ctx: TenantContext): Promise<void> {
  for (const group of escalationGroups(ctx.policies, 'AGENT_TOOL')) {
    await escalateAgentActionGroup(ctx, group);
  }
  const draftGroups = escalationGroups(ctx.policies, 'AUTO_RESPONSE');
  if (draftGroups.length === 0) return;
  const repository = await ctx.deps.draftRepository(ctx.tx);
  for (const group of draftGroups) await escalateDraftGroup(ctx, repository, group);
}

async function sweepInTransaction(
  tx: SweepTx,
  deps: ApprovalSweepDeps,
  now: Date,
  outbox: SweepNotification[]
): Promise<ApprovalSweepReport> {
  const report: ApprovalSweepReport = {
    locked: false,
    agentActionsEscalated: 0,
    draftsEscalated: 0,
    skipped: 0,
    expired: 0,
  };
  const rows = await tx.$queryRaw<
    { locked: boolean }[]
  >`SELECT pg_try_advisory_xact_lock(${APPROVAL_SWEEP_LOCK_KEY}) AS locked`;
  if (!rows[0]?.locked) return report;
  report.locked = true;

  const tenants = await tx.approvalPolicy.findMany({
    where: {
      escalationEnabled: true,
      escalateAfterMinutes: { not: null },
      escalationTargetUserId: { not: null },
    },
    select: { tenantId: true },
    distinct: ['tenantId'],
  });

  for (const { tenantId } of tenants) {
    const policies = await loadTenantApprovalPolicies(tx, tenantId, { fresh: true });
    const ctx: TenantContext = {
      tx,
      deps,
      tenantId,
      policies,
      now,
      report,
      targets: new Map(),
      outbox,
    };
    await escalateTenant(ctx);
  }

  const expired = await tx.agentAction.updateMany({
    where: { status: 'PENDING_APPROVAL', expiresAt: { lt: now } },
    data: { status: 'EXPIRED' },
  });
  report.expired = expired.count;
  return report;
}

/** Run one sweep tick. Returns `locked: false` (and does nothing) if another replica holds it. */
export async function runApprovalSweep(
  deps: ApprovalSweepDeps,
  now: Date = new Date()
): Promise<ApprovalSweepReport> {
  const outbox: SweepNotification[] = [];
  const report = await deps.prisma.$transaction((tx) => sweepInTransaction(tx, deps, now, outbox), {
    timeout: 60_000,
    maxWait: 10_000,
  });
  // Escalations are committed; now tell the targets. Non-blocking, as for manual escalation.
  for (const notification of outbox) {
    try {
      await deps.notify(notification);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      deps.log?.warn(`[approval-sweep] notification failed: ${message}`);
    }
  }
  return report;
}

/** Production wiring: shared Prisma client, the Prisma draft repository, in-app notifications. */
export async function createDefaultSweepDeps(): Promise<ApprovalSweepDeps> {
  const [{ prisma }, adapters, { createNotification }] = await Promise.all([
    import('@intelliflow/db'),
    import('@intelliflow/adapters'),
    import('../modules/notifications/notifications.router.js'),
  ]);
  const Repository = (
    adapters as unknown as {
      PrismaAutoResponseDraftRepository: new (client: unknown) => AutoResponseDraftRepository;
    }
  ).PrismaAutoResponseDraftRepository;
  return {
    prisma: prisma as unknown as SweepPrisma,
    draftRepository: async (client) => new Repository(client),
    notify: async (n) => {
      await createNotification(prisma as never, {
        ...n,
        type: 'ai_action_pending',
        priority: 'high',
        actionLabel: 'Review',
      });
    },
    log: console,
  };
}
