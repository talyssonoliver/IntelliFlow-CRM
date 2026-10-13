/**
 * Approval Policies Router - PG-198 (Module Settings: Approval Policies, ADR-077)
 *
 * Tenant policies that govern both approval queues: agent tool actions and AI
 * auto-response drafts. Reads are open to the tenant; every mutation needs an
 * AI-settings admin. `prismaWithTenant` does not inject `tenantId`, so every
 * read and write passes it explicitly, and every multi-row write runs in one
 * `$transaction` (playbook §5) without `skipDuplicates`.
 */

import { TRPCError } from '@trpc/server';
import { tenantUserWhere } from '@intelliflow/db';
import {
  APPROVAL_AGENT_TOOL_KEYS,
  APPROVAL_AGENT_TOOLS,
  APPROVAL_POLICY_DEFAULTS,
  APPROVAL_POLICY_LIMITS,
  AUTO_RESPONSE_AGENT_KEY,
  TRIGGER_TYPES,
  canReview,
  resolveApprovalPolicy,
  type ApprovalPolicyScope,
  type ApproverRole,
} from '@intelliflow/domain';
import {
  createApprovalPolicySchema,
  updateApprovalPolicySchema,
  deleteApprovalPolicySchema,
  setDefaultApprovalPolicySchema,
  approvalPolicyPreviewSchema,
  type CreateApprovalPolicyInput,
} from '@intelliflow/validators';
import { createTRPCRouter, tenantProcedure } from '../../trpc';
import type { TenantAwareContext } from '../../security/tenant-context';
import {
  invalidateApprovalPolicyCache,
  toApprovalPolicyRecord,
} from '../../agent/approval-policy-loader';
import { assertAgentSettingsAdmin, isAgentSettingsAdmin, rethrowConflict } from './settings-shared';

// ─── Helpers ────────────────────────────────────────────────────────────────

type PolicyCtx = Pick<TenantAwareContext, 'tenant' | 'prismaWithTenant' | 'user'>;
type PolicyTx = Parameters<Parameters<PolicyCtx['prismaWithTenant']['$transaction']>[0]>[0];

const SETTINGS_NAME = 'approval policies';

function assertPolicyAdmin(ctx: Pick<PolicyCtx, 'user'>): void {
  assertAgentSettingsAdmin(ctx, SETTINGS_NAME);
}

const policyInclude = {
  assignments: {
    orderBy: [{ agentKey: 'asc' as const }, { actionType: 'asc' as const }],
    select: { agentKey: true, actionType: true },
  },
  escalationTarget: { select: { id: true, name: true, email: true } },
};

interface PolicyRow {
  id: string;
  name: string;
  description: string | null;
  colorToken: string;
  scope: string;
  isDefault: boolean;
  timeoutMinutes: number;
  minReviewerRole: string;
  autoApproveEnabled: boolean;
  autoApproveMinConfidence: number | null;
  escalationEnabled: boolean;
  escalateAfterMinutes: number | null;
  escalationTargetUserId: string | null;
  escalationTarget: { id: string; name: string | null; email: string } | null;
  assignments: { agentKey: string; actionType: string }[];
  createdAt: Date;
  updatedAt: Date;
}

function toPolicyDto(row: PolicyRow) {
  const record = toApprovalPolicyRecord(row);
  return {
    ...record,
    description: row.description,
    colorToken: row.colorToken,
    escalationTarget: row.escalationTarget
      ? {
          id: row.escalationTarget.id,
          name: row.escalationTarget.name ?? row.escalationTarget.email,
        }
      : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export type ApprovalPolicyDto = ReturnType<typeof toPolicyDto>;

function conflictMessage(err: unknown, name: string): string {
  const detail = JSON.stringify(err) ?? '';
  if (/approval_policy_assignments|agentKey/.test(detail)) {
    return 'One of these agent/action pairs is already routed to another policy. Remove it there first.';
  }
  return `A policy named "${name}" already exists for this queue. Choose a different name.`;
}

async function findOwnedPolicy(ctx: PolicyCtx, id: string) {
  const existing = await ctx.prismaWithTenant.approvalPolicy.findFirst({
    where: { id, tenantId: ctx.tenant.tenantId },
    select: { id: true, scope: true, isDefault: true },
  });
  if (!existing) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Approval policy not found' });
  }
  return existing;
}

/**
 * BR-9: an escalation target must be a user of this workspace who can decide the
 * items it receives, i.e. holds the policy's minimum reviewer role.
 */
async function assertTargetInTenant(
  ctx: PolicyCtx,
  userId: string | null,
  minReviewerRole: ApproverRole
): Promise<void> {
  if (userId === null) return;
  const user = await ctx.prismaWithTenant.user.findFirst({
    where: { id: userId, ...tenantUserWhere(ctx.tenant.tenantId) },
    select: { id: true, role: true },
  });
  if (!user) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Escalations must go to a user of this workspace.',
    });
  }
  if (!canReview(user.role, { ...APPROVAL_POLICY_DEFAULTS.AGENT_TOOL, minReviewerRole })) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Escalations must go to someone who can review them (${minReviewerRole} or above).`,
    });
  }
}

function policyData(input: CreateApprovalPolicyInput) {
  return {
    name: input.name,
    description: input.description ?? null,
    colorToken: input.colorToken,
    scope: input.scope,
    isDefault: input.isDefault,
    timeoutMinutes: input.timeoutMinutes,
    minReviewerRole: input.minReviewerRole,
    autoApproveEnabled: input.autoApproveEnabled,
    autoApproveMinConfidence: input.autoApproveMinConfidence,
    escalationEnabled: input.escalationEnabled,
    escalateAfterMinutes: input.escalateAfterMinutes,
    escalationTargetUserId: input.escalationTargetUserId,
  };
}

/** Replace a policy's assignments inside the caller's transaction. */
async function writeAssignments(
  tx: PolicyTx,
  tenantId: string,
  policyId: string,
  input: Pick<CreateApprovalPolicyInput, 'scope' | 'assignments'>
): Promise<void> {
  await tx.approvalPolicyAssignment.deleteMany({ where: { tenantId, policyId } });
  if (input.assignments.length === 0) return;
  await tx.approvalPolicyAssignment.createMany({
    data: input.assignments.map((a) => ({
      tenantId,
      policyId,
      scope: input.scope,
      agentKey: a.agentKey,
      actionType: a.actionType,
    })),
  });
}

/** Every (agent, action) pair a queue can produce, in display order. */
function queuePairs(scope: ApprovalPolicyScope): { agentKey: string; actionType: string }[] {
  if (scope === 'AUTO_RESPONSE') {
    return TRIGGER_TYPES.map((trigger) => ({
      agentKey: AUTO_RESPONSE_AGENT_KEY,
      actionType: trigger,
    }));
  }
  return APPROVAL_AGENT_TOOL_KEYS.map((tool) => ({
    agentKey: tool,
    actionType: APPROVAL_AGENT_TOOLS[tool],
  }));
}

// ─── Router ─────────────────────────────────────────────────────────────────

export const approvalPoliciesRouter = createTRPCRouter({
  list: tenantProcedure.query(async ({ ctx }) => {
    const rows = await ctx.prismaWithTenant.approvalPolicy.findMany({
      where: { tenantId: ctx.tenant.tenantId },
      include: policyInclude,
      orderBy: [{ scope: 'asc' }, { isDefault: 'desc' }, { name: 'asc' }],
    });
    return {
      policies: rows.map(toPolicyDto),
      defaults: APPROVAL_POLICY_DEFAULTS,
      limits: APPROVAL_POLICY_LIMITS,
      canManage: isAgentSettingsAdmin(ctx.user?.role),
    };
  }),

  create: tenantProcedure.input(createApprovalPolicySchema).mutation(async ({ ctx, input }) => {
    assertPolicyAdmin(ctx);
    const tenantId = ctx.tenant.tenantId;
    await assertTargetInTenant(ctx, input.escalationTargetUserId, input.minReviewerRole);

    try {
      const row = await ctx.prismaWithTenant.$transaction(async (tx) => {
        if (input.isDefault) {
          await tx.approvalPolicy.updateMany({
            where: { tenantId, scope: input.scope, isDefault: true },
            data: { isDefault: false },
          });
        }
        const created = await tx.approvalPolicy.create({
          data: { tenantId, ...policyData(input) },
          select: { id: true },
        });
        await writeAssignments(tx, tenantId, created.id, input);
        return tx.approvalPolicy.findFirstOrThrow({
          where: { id: created.id, tenantId },
          include: policyInclude,
        });
      });
      invalidateApprovalPolicyCache(tenantId);
      return toPolicyDto(row);
    } catch (err) {
      rethrowConflict(err, conflictMessage(err, input.name));
    }
  }),

  update: tenantProcedure.input(updateApprovalPolicySchema).mutation(async ({ ctx, input }) => {
    assertPolicyAdmin(ctx);
    const tenantId = ctx.tenant.tenantId;
    await findOwnedPolicy(ctx, input.id);
    await assertTargetInTenant(ctx, input.escalationTargetUserId, input.minReviewerRole);

    try {
      const row = await ctx.prismaWithTenant.$transaction(async (tx) => {
        if (input.isDefault) {
          await tx.approvalPolicy.updateMany({
            where: { tenantId, scope: input.scope, isDefault: true, NOT: { id: input.id } },
            data: { isDefault: false },
          });
        }
        await tx.approvalPolicy.update({
          where: { tenantId_id: { tenantId, id: input.id } },
          data: policyData(input),
        });
        await writeAssignments(tx, tenantId, input.id, input);
        return tx.approvalPolicy.findFirstOrThrow({
          where: { id: input.id, tenantId },
          include: policyInclude,
        });
      });
      invalidateApprovalPolicyCache(tenantId);
      return toPolicyDto(row);
    } catch (err) {
      rethrowConflict(err, conflictMessage(err, input.name));
    }
  }),

  /** Assignments cascade. Items already queued keep the expiry they were given (BR-5). */
  delete: tenantProcedure.input(deleteApprovalPolicySchema).mutation(async ({ ctx, input }) => {
    assertPolicyAdmin(ctx);
    const tenantId = ctx.tenant.tenantId;
    await findOwnedPolicy(ctx, input.id);
    await ctx.prismaWithTenant.$transaction(async (tx) => {
      await tx.approvalPolicy.deleteMany({ where: { id: input.id, tenantId } });
    });
    invalidateApprovalPolicyCache(tenantId);
    return { success: true as const };
  }),

  /** Clear then set inside one transaction (partial unique index: one default per queue). */
  setDefault: tenantProcedure
    .input(setDefaultApprovalPolicySchema)
    .mutation(async ({ ctx, input }) => {
      assertPolicyAdmin(ctx);
      const tenantId = ctx.tenant.tenantId;
      const target = await findOwnedPolicy(ctx, input.id);
      await ctx.prismaWithTenant.$transaction(async (tx) => {
        await tx.approvalPolicy.updateMany({
          where: { tenantId, scope: target.scope, isDefault: true },
          data: { isDefault: false },
        });
        const set = await tx.approvalPolicy.updateMany({
          where: { id: input.id, tenantId, scope: target.scope },
          data: { isDefault: true },
        });
        // Deleted or moved to another queue since the ownership check: roll back the
        // clear instead of leaving a queue without its default.
        if (set.count !== 1) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Approval policy not found' });
        }
      });
      invalidateApprovalPolicyCache(tenantId);
      return { success: true as const };
    }),

  /** Delete every policy (assignments cascade); queued items and their history are untouched. */
  resetToDefaults: tenantProcedure.mutation(async ({ ctx }) => {
    assertPolicyAdmin(ctx);
    const tenantId = ctx.tenant.tenantId;
    const result = await ctx.prismaWithTenant.$transaction(async (tx) =>
      tx.approvalPolicy.deleteMany({ where: { tenantId } })
    );
    invalidateApprovalPolicyCache(tenantId);
    return { deleted: result.count };
  }),

  /** Which policy each agent/action of a queue resolves to right now (read-only). */
  preview: tenantProcedure.input(approvalPolicyPreviewSchema).query(async ({ ctx, input }) => {
    const rows = await ctx.prismaWithTenant.approvalPolicy.findMany({
      where: { tenantId: ctx.tenant.tenantId },
      include: { assignments: { select: { agentKey: true, actionType: true } } },
    });
    const policies = rows.map(toApprovalPolicyRecord);
    const colours = new Map(rows.map((row) => [row.id, row.colorToken]));

    return queuePairs(input.scope).map((pair) => {
      const resolved = resolveApprovalPolicy(policies, input.scope, pair.agentKey, pair.actionType);
      return {
        ...pair,
        ...resolved,
        colorToken: resolved.policyId ? (colours.get(resolved.policyId) ?? null) : null,
      };
    });
  }),
});
