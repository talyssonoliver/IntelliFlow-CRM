/**
 * Approval policy loader (PG-198): reads a tenant's policies, resolves the
 * effective rule through the domain resolver, caches for timeouts only.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { APPROVAL_POLICY_DEFAULTS } from '@intelliflow/domain';
import {
  loadApprovalPolicy,
  loadTenantApprovalPolicies,
  invalidateApprovalPolicyCache,
  toApprovalPolicyRecord,
} from '../approval-policy-loader';

const TENANT = 'tenant-a';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    tenantId: TENANT,
    name: 'Strict',
    scope: 'AGENT_TOOL',
    isDefault: false,
    timeoutMinutes: 15,
    minReviewerRole: 'MANAGER',
    autoApproveEnabled: false,
    autoApproveMinConfidence: null,
    escalationEnabled: false,
    escalateAfterMinutes: null,
    escalationTargetUserId: null,
    assignments: [{ agentKey: 'create_case', actionType: 'CREATE' }],
    ...overrides,
  };
}

function fakePrisma(rows: unknown[] | Error) {
  const findMany = vi.fn(async () => {
    if (rows instanceof Error) throw rows;
    return rows;
  });
  return { prisma: { approvalPolicy: { findMany } } as any, findMany };
}

describe('approval-policy-loader', () => {
  beforeEach(() => {
    invalidateApprovalPolicyCache();
    vi.restoreAllMocks();
  });

  it('queries only the tenant, with assignments, and maps to domain records', async () => {
    const { prisma, findMany } = fakePrisma([row()]);
    const records = await loadTenantApprovalPolicies(prisma, TENANT);
    expect(findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT },
      include: { assignments: { select: { agentKey: true, actionType: true } } },
    });
    expect(records).toEqual([toApprovalPolicyRecord(row() as any)]);
    expect(records[0]!.assignments).toEqual([{ agentKey: 'create_case', actionType: 'CREATE' }]);
  });

  it('narrows unknown stored scope/role strings to safe values', () => {
    const record = toApprovalPolicyRecord(
      row({ scope: 'AUTO_RESPONSE', minReviewerRole: 'SOMETHING' }) as any
    );
    expect(record.scope).toBe('AUTO_RESPONSE');
    // An unknown stored role is treated as the strictest reviewer requirement.
    expect(record.minReviewerRole).toBe('ADMIN');
    expect(toApprovalPolicyRecord(row({ scope: 'X' }) as any).scope).toBe('AGENT_TOOL');
  });

  it('resolves the effective rule through the domain resolver', async () => {
    const { prisma } = fakePrisma([row()]);
    const resolved = await loadApprovalPolicy(
      prisma,
      TENANT,
      'AGENT_TOOL',
      'create_case',
      'CREATE'
    );
    expect(resolved).toMatchObject({ policyId: 'p1', source: 'ASSIGNMENT_EXACT' });
    expect(resolved.rule.timeoutMinutes).toBe(15);
  });

  it('falls back to the built-in rule when the tenant has no policies (AC-007)', async () => {
    const { prisma } = fakePrisma([]);
    const resolved = await loadApprovalPolicy(
      prisma,
      TENANT,
      'AUTO_RESPONSE',
      'auto_response',
      'MANUAL'
    );
    expect(resolved).toEqual({
      rule: APPROVAL_POLICY_DEFAULTS.AUTO_RESPONSE,
      policyId: null,
      policyName: null,
      source: 'BUILT_IN',
    });
  });

  it('caches per tenant for the cached path and re-reads after invalidation', async () => {
    const { prisma, findMany } = fakePrisma([row()]);
    await loadTenantApprovalPolicies(prisma, TENANT);
    await loadTenantApprovalPolicies(prisma, TENANT);
    expect(findMany).toHaveBeenCalledTimes(1);

    invalidateApprovalPolicyCache(TENANT);
    await loadTenantApprovalPolicies(prisma, TENANT);
    expect(findMany).toHaveBeenCalledTimes(2);
  });

  it('expires the cache after 60 seconds', async () => {
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(1_000_000);
    const { prisma, findMany } = fakePrisma([row()]);
    await loadTenantApprovalPolicies(prisma, TENANT);
    now.mockReturnValue(1_000_000 + 60_001);
    await loadTenantApprovalPolicies(prisma, TENANT);
    expect(findMany).toHaveBeenCalledTimes(2);
  });

  it('bypasses the cache for decisions (fresh)', async () => {
    const { prisma, findMany } = fakePrisma([row()]);
    await loadTenantApprovalPolicies(prisma, TENANT);
    await loadTenantApprovalPolicies(prisma, TENANT, { fresh: true });
    expect(findMany).toHaveBeenCalledTimes(2);
  });

  it('invalidating one tenant keeps the others cached', async () => {
    const { prisma, findMany } = fakePrisma([row()]);
    await loadTenantApprovalPolicies(prisma, TENANT);
    await loadTenantApprovalPolicies(prisma, 'tenant-b');
    invalidateApprovalPolicyCache('tenant-b');
    await loadTenantApprovalPolicies(prisma, TENANT);
    expect(findMany).toHaveBeenCalledTimes(2);
  });

  it('on a DB error the cached path falls back to built-in rules (auto-approve off)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { prisma } = fakePrisma(new Error('db down'));
    const resolved = await loadApprovalPolicy(
      prisma,
      TENANT,
      'AGENT_TOOL',
      'create_case',
      'CREATE'
    );
    expect(resolved.source).toBe('BUILT_IN');
    expect(resolved.rule.autoApproveEnabled).toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it('on a DB error the decision path fails closed by throwing', async () => {
    const { prisma } = fakePrisma(new Error('db down'));
    await expect(
      loadApprovalPolicy(prisma, TENANT, 'AGENT_TOOL', 'create_case', 'CREATE', { fresh: true })
    ).rejects.toThrow('db down');
  });
});
