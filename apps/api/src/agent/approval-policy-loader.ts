/**
 * Approval policy loader (PG-198, ADR-079).
 *
 * Reads a tenant's approval policies and resolves the effective rule for one
 * (queue, agent, action) through the domain resolver.
 *
 * - Cached path (default): 60 s per tenant, for timeouts. A DB error falls
 *   back to the built-in rules (30 min / 24 h, no auto-approval) and logs.
 * - Decision path (`fresh: true`): always reads the DB and lets errors
 *   propagate, so reviewer-role and auto-approval decisions fail closed.
 *
 * Every query carries an explicit tenantId (RLS is defence in depth only).
 */

import {
  APPROVAL_POLICY_DEFAULTS,
  APPROVAL_POLICY_SCOPES,
  APPROVER_ROLES,
  resolveApprovalPolicy,
  type ApprovalPolicyRecord,
  type ApprovalPolicyScope,
  type ApproverRole,
  type ResolvedApprovalPolicy,
} from '@intelliflow/domain';

const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  records: ApprovalPolicyRecord[];
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

export interface ApprovalPolicyRow {
  id: string;
  name: string;
  scope: string;
  isDefault: boolean;
  timeoutMinutes: number;
  minReviewerRole: string;
  autoApproveEnabled: boolean;
  autoApproveMinConfidence: number | null;
  escalationEnabled: boolean;
  escalateAfterMinutes: number | null;
  escalationTargetUserId: string | null;
  assignments: { agentKey: string; actionType: string }[];
}

/** The slice of Prisma the loader needs (a tenant-scoped client or a transaction). */
export interface ApprovalPolicyReader {
  approvalPolicy: {
    findMany(args: {
      where: { tenantId: string };
      include: { assignments: { select: { agentKey: true; actionType: true } } };
    }): Promise<ApprovalPolicyRow[]>;
  };
}

export interface LoadOptions {
  /** Bypass the cache and fail closed on errors (reviewer-role and auto-approval decisions). */
  fresh?: boolean;
}

function toScope(value: string): ApprovalPolicyScope {
  return (APPROVAL_POLICY_SCOPES as readonly string[]).includes(value)
    ? (value as ApprovalPolicyScope)
    : 'AGENT_TOOL';
}

/** A stored role the code does not know is treated as the strictest requirement. */
function toApproverRole(value: string): ApproverRole {
  return (APPROVER_ROLES as readonly string[]).includes(value) ? (value as ApproverRole) : 'ADMIN';
}

export function toApprovalPolicyRecord(row: ApprovalPolicyRow): ApprovalPolicyRecord {
  return {
    id: row.id,
    name: row.name,
    scope: toScope(row.scope),
    isDefault: row.isDefault,
    timeoutMinutes: row.timeoutMinutes,
    minReviewerRole: toApproverRole(row.minReviewerRole),
    autoApproveEnabled: row.autoApproveEnabled,
    autoApproveMinConfidence: row.autoApproveMinConfidence,
    escalationEnabled: row.escalationEnabled,
    escalateAfterMinutes: row.escalateAfterMinutes,
    escalationTargetUserId: row.escalationTargetUserId,
    assignments: row.assignments.map((a) => ({ agentKey: a.agentKey, actionType: a.actionType })),
  };
}

async function readPolicies(
  prisma: ApprovalPolicyReader,
  tenantId: string
): Promise<ApprovalPolicyRecord[]> {
  const rows = await prisma.approvalPolicy.findMany({
    where: { tenantId },
    include: { assignments: { select: { agentKey: true, actionType: true } } },
  });
  return rows.map(toApprovalPolicyRecord);
}

export async function loadTenantApprovalPolicies(
  prisma: ApprovalPolicyReader,
  tenantId: string,
  options: LoadOptions = {}
): Promise<ApprovalPolicyRecord[]> {
  if (options.fresh) return readPolicies(prisma, tenantId);

  const now = Date.now();
  const cached = cache.get(tenantId);
  if (cached && cached.expiresAt > now) return cached.records;

  try {
    const records = await readPolicies(prisma, tenantId);
    cache.set(tenantId, { records, expiresAt: now + CACHE_TTL_MS });
    return records;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[approval-policy] policy read failed for tenant=${tenantId}; using built-in rules. ${message}`
    );
    return [];
  }
}

export async function loadApprovalPolicy(
  prisma: ApprovalPolicyReader,
  tenantId: string,
  scope: ApprovalPolicyScope,
  agentKey: string,
  actionType: string,
  options: LoadOptions = {}
): Promise<ResolvedApprovalPolicy> {
  const policies = await loadTenantApprovalPolicies(prisma, tenantId, options);
  return resolveApprovalPolicy(policies, scope, agentKey, actionType);
}

/** Call after any approval-policy write. No tenant → flush everything. */
export function invalidateApprovalPolicyCache(tenantId?: string): void {
  if (tenantId === undefined) {
    cache.clear();
    return;
  }
  cache.delete(tenantId);
}

/**
 * Expiry for a new agent-tool approval (AC-008): now + the effective policy's
 * timeout. Without a tenant or a client (background callers) the built-in
 * 30 minutes apply, exactly as before policies existed.
 */
export async function resolveAgentToolExpiry(
  prisma: ApprovalPolicyReader | undefined,
  tenantId: string | undefined,
  toolName: string,
  actionType: string,
  now: Date = new Date()
): Promise<Date> {
  const timeoutMinutes =
    prisma && tenantId
      ? (await loadApprovalPolicy(prisma, tenantId, 'AGENT_TOOL', toolName, actionType)).rule
          .timeoutMinutes
      : APPROVAL_POLICY_DEFAULTS.AGENT_TOOL.timeoutMinutes;
  return new Date(now.getTime() + timeoutMinutes * 60_000);
}
