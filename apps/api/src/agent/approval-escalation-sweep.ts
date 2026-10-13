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
  APPROVAL_AGENT_TOOLS,
  AUTO_RESPONSE_AGENT_KEY,
  SYSTEM_APPROVAL_ACTOR,
  isEscalationDue,
  resolveApprovalPolicy,
  type ApprovalPolicyRecord,
  type ApprovalPolicyScope,
  type ApprovalRule,
  type AutoResponseDraft,
  type AutoResponseDraftRepository,
} from '@intelliflow/domain';
import { tenantUserWhere } from '@intelliflow/db';
import { loadTenantApprovalPolicies, type ApprovalPolicyReader } from './approval-policy-loader';

/** Advisory-lock key for the sweep (any constant unique to this job). */
export const APPROVAL_SWEEP_LOCK_KEY = 1_980_001;
/** NF-002: at most this many items per tenant and queue per tick. */
export const APPROVAL_SWEEP_BATCH = 100;

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
  notify: (client: SweepTx, notification: SweepNotification) => Promise<void>;
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
}

/** Shortest escalation delay among a queue's escalating policies, or null if none escalate. */
function shortestDelay(
  policies: ApprovalPolicyRecord[],
  scope: ApprovalPolicyScope
): number | null {
  const delays = policies
    .filter((p) => p.scope === scope && p.escalationEnabled && p.escalationTargetUserId)
    .map((p) => p.escalateAfterMinutes)
    .filter((m): m is number => m !== null);
  return delays.length > 0 ? Math.min(...delays) : null;
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

async function notifySafely(ctx: TenantContext, notification: SweepNotification): Promise<void> {
  try {
    await ctx.deps.notify(ctx.tx, notification);
  } catch (error) {
    // Non-blocking, as for manual escalation: the escalation itself is recorded.
    const message = error instanceof Error ? error.message : String(error);
    ctx.deps.log?.warn(`[approval-sweep] notification failed: ${message}`);
  }
}

async function escalateAgentActions(ctx: TenantContext): Promise<void> {
  const delay = shortestDelay(ctx.policies, 'AGENT_TOOL');
  if (delay === null) return;
  const rows = await ctx.tx.agentAction.findMany({
    where: {
      tenantId: ctx.tenantId,
      status: 'PENDING_APPROVAL',
      escalatedAt: null,
      expiresAt: { gt: ctx.now },
      createdAt: { lte: cutoff(ctx.now, delay) },
    },
    orderBy: { createdAt: 'asc' },
    take: APPROVAL_SWEEP_BATCH,
  });
  for (const row of rows) {
    const actionType =
      APPROVAL_AGENT_TOOLS[row.actionType as keyof typeof APPROVAL_AGENT_TOOLS] ?? '*';
    const { rule } = resolveApprovalPolicy(ctx.policies, 'AGENT_TOOL', row.actionType, actionType);
    const target = await dueTarget(ctx, rule, row.createdAt);
    if (!target) continue;
    const claimed = await ctx.tx.agentAction.updateMany({
      where: { id: row.id, tenantId: ctx.tenantId, status: 'PENDING_APPROVAL', escalatedAt: null },
      data: { escalatedAt: ctx.now, escalatedTo: target },
    });
    if (claimed.count !== 1) continue;
    ctx.report.agentActionsEscalated += 1;
    await notifySafely(ctx, {
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
  draft: AutoResponseDraft
): Promise<void> {
  const { rule } = resolveApprovalPolicy(
    ctx.policies,
    'AUTO_RESPONSE',
    AUTO_RESPONSE_AGENT_KEY,
    draft.triggerType
  );
  const target = await dueTarget(ctx, rule, submittedAt(draft));
  if (!target) return;
  // Never beyond the draft's own expiry, so escalation.expiresAt stays truthful.
  const windowHours = (draft.expiresAt.getTime() - ctx.now.getTime()) / 3_600_000;
  if (windowHours <= 0) return;
  const reason = `Approval SLA: no decision after ${String(rule.escalateAfterMinutes)} minutes`;
  if (draft.escalate(SYSTEM_APPROVAL_ACTOR, target, reason, windowHours).isFailure) {
    ctx.report.skipped += 1;
    return;
  }
  try {
    await repository.save(draft);
  } catch (error) {
    // Optimistic-lock conflict: someone decided it meanwhile. Leave it alone.
    const message = error instanceof Error ? error.message : String(error);
    ctx.deps.log?.warn(`[approval-sweep] draft ${draft.id.toString()} not escalated: ${message}`);
    ctx.report.skipped += 1;
    return;
  }
  ctx.report.draftsEscalated += 1;
  await notifySafely(ctx, {
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

async function escalateDrafts(ctx: TenantContext): Promise<void> {
  const delay = shortestDelay(ctx.policies, 'AUTO_RESPONSE');
  if (delay === null) return;
  const repository = await ctx.deps.draftRepository(ctx.tx);
  const drafts = await repository.findPendingOlderThan(
    ctx.tenantId,
    cutoff(ctx.now, delay),
    APPROVAL_SWEEP_BATCH
  );
  for (const draft of drafts) await escalateDraft(ctx, repository, draft);
}

async function sweepInTransaction(
  tx: SweepTx,
  deps: ApprovalSweepDeps,
  now: Date
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
    const ctx: TenantContext = { tx, deps, tenantId, policies, now, report, targets: new Map() };
    await escalateAgentActions(ctx);
    await escalateDrafts(ctx);
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
  return deps.prisma.$transaction((tx) => sweepInTransaction(tx, deps, now), {
    timeout: 60_000,
    maxWait: 10_000,
  });
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
    notify: async (client, n) => {
      await createNotification(client as never, {
        ...n,
        type: 'ai_action_pending',
        priority: 'high',
        actionLabel: 'Review',
      });
    },
    log: console,
  };
}
