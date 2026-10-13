/**
 * Approval Policies Router Tests - PG-198
 *
 * Callback-form $transaction mocked with mockImplementationOnce(fn => fn(txMock))
 * (playbook §12). Every mutation has a cross-tenant negative case (AC-006).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { APPROVAL_POLICY_DEFAULTS } from '@intelliflow/domain';
import { approvalPoliciesRouter } from '../approval-policies.router';
import * as loader from '../../../agent/approval-policy-loader';
import {
  prismaMock,
  createTestContext,
  createAdminContext,
  createManagerContext,
  createPublicContext,
  generateTestUUID,
  TEST_UUIDS,
} from '../../../test/setup';

const tenantId = TEST_UUIDS.tenant;
const P1 = generateTestUUID('policy-1');
const FOREIGN = generateTestUUID('policy-foreign');
const TARGET = generateTestUUID('escalation-target');

const created = new Date('2026-10-13T00:00:00Z');

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: P1,
    tenantId,
    name: 'Strict updates',
    description: null,
    colorToken: 'amber',
    scope: 'AGENT_TOOL',
    isDefault: false,
    timeoutMinutes: 60,
    minReviewerRole: 'MANAGER',
    autoApproveEnabled: false,
    autoApproveMinConfidence: null,
    escalationEnabled: false,
    escalateAfterMinutes: null,
    escalationTargetUserId: null,
    escalationTarget: null,
    assignments: [{ agentKey: 'update_case', actionType: 'UPDATE' }],
    createdAt: created,
    updatedAt: created,
    ...overrides,
  };
}

const input = {
  name: 'Strict updates',
  scope: 'AGENT_TOOL' as const,
  timeoutMinutes: 60,
  minReviewerRole: 'MANAGER' as const,
  colorToken: 'amber' as const,
  assignments: [{ agentKey: 'update_case', actionType: 'UPDATE' }],
};

function txMock() {
  return {
    approvalPolicy: {
      create: vi.fn().mockResolvedValue({ id: P1 }),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 3 }),
      findFirstOrThrow: vi.fn().mockResolvedValue(row()),
    },
    approvalPolicyAssignment: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

function useTx() {
  const tx = txMock();
  (prismaMock.$transaction as any).mockImplementationOnce(async (fn: any) => fn(tx));
  return tx;
}

function failTx(error: unknown) {
  (prismaMock.$transaction as any).mockImplementationOnce(async () => {
    throw error;
  });
}

function ownPolicy(overrides: Record<string, unknown> = {}) {
  (prismaMock.approvalPolicy.findFirst as any).mockResolvedValueOnce({
    id: P1,
    scope: 'AGENT_TOOL',
    isDefault: false,
    ...overrides,
  });
}

async function expectCode(promise: Promise<unknown>, code: TRPCError['code']) {
  await expect(promise).rejects.toMatchObject({ code });
}

describe('approvalPoliciesRouter', () => {
  let admin: ReturnType<typeof approvalPoliciesRouter.createCaller>;
  let user: ReturnType<typeof approvalPoliciesRouter.createCaller>;
  let invalidate: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    admin = approvalPoliciesRouter.createCaller(createAdminContext());
    user = approvalPoliciesRouter.createCaller(createTestContext());
    invalidate = vi.spyOn(loader, 'invalidateApprovalPolicyCache');
  });

  it('rejects an unauthenticated caller', async () => {
    const anon = approvalPoliciesRouter.createCaller(createPublicContext());
    await expect(anon.list()).rejects.toBeInstanceOf(TRPCError);
  });

  describe('list', () => {
    it('returns the tenant policies, built-in defaults and whether the caller can manage', async () => {
      (prismaMock.approvalPolicy.findMany as any).mockResolvedValueOnce([
        row({ escalationTarget: { id: TARGET, name: null, email: 't@example.invalid' } }),
      ]);
      const result = await user.list();

      expect(prismaMock.approvalPolicy.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId } })
      );
      expect(result.canManage).toBe(false);
      expect(result.defaults).toEqual(APPROVAL_POLICY_DEFAULTS);
      expect(result.policies[0]).toMatchObject({
        id: P1,
        scope: 'AGENT_TOOL',
        minReviewerRole: 'MANAGER',
        escalationTarget: { id: TARGET, name: 't@example.invalid' },
        assignments: [{ agentKey: 'update_case', actionType: 'UPDATE' }],
      });
    });

    it('reports canManage for admins', async () => {
      (prismaMock.approvalPolicy.findMany as any).mockResolvedValueOnce([]);
      expect((await admin.list()).canManage).toBe(true);
    });
  });

  describe('admin gate (AC-002)', () => {
    it.each([
      ['create', (c: any) => c.create(input)],
      ['update', (c: any) => c.update({ ...input, id: P1 })],
      ['delete', (c: any) => c.delete({ id: P1 })],
      ['setDefault', (c: any) => c.setDefault({ id: P1 })],
      ['resetToDefaults', (c: any) => c.resetToDefaults()],
    ])('%s is FORBIDDEN for a USER and touches nothing', async (_name, call) => {
      await expectCode(call(user), 'FORBIDDEN');
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('managers may manage policies', async () => {
      const manager = approvalPoliciesRouter.createCaller(createManagerContext());
      useTx();
      await expect(manager.create(input)).resolves.toMatchObject({ id: P1 });
    });
  });

  describe('create', () => {
    it('creates the policy and its assignments in one transaction, without skipDuplicates', async () => {
      const tx = useTx();
      const result = await admin.create(input);

      expect(tx.approvalPolicy.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId,
          name: 'Strict updates',
          scope: 'AGENT_TOOL',
          autoApproveEnabled: false,
          escalationTargetUserId: null,
        }),
        select: { id: true },
      });
      const createMany = tx.approvalPolicyAssignment.createMany.mock.calls[0]![0];
      expect(createMany).toEqual({
        data: [
          {
            tenantId,
            policyId: P1,
            scope: 'AGENT_TOOL',
            agentKey: 'update_case',
            actionType: 'UPDATE',
          },
        ],
      });
      expect(createMany).not.toHaveProperty('skipDuplicates');
      expect(tx.approvalPolicy.updateMany).not.toHaveBeenCalled();
      expect(result).toMatchObject({ id: P1, name: 'Strict updates' });
      expect(invalidate).toHaveBeenCalledWith(tenantId);
    });

    it('a new default clears the previous default of the same queue first (BR-2)', async () => {
      const tx = useTx();
      await admin.create({ ...input, isDefault: true });
      expect(tx.approvalPolicy.updateMany).toHaveBeenCalledWith({
        where: { tenantId, scope: 'AGENT_TOOL', isDefault: true },
        data: { isDefault: false },
      });
    });

    it('skips createMany when there are no assignments', async () => {
      const tx = useTx();
      await admin.create({ ...input, assignments: [] });
      expect(tx.approvalPolicyAssignment.createMany).not.toHaveBeenCalled();
    });

    it('checks the escalation target belongs to the tenant', async () => {
      (prismaMock.user.findFirst as any).mockResolvedValueOnce(null);
      await expectCode(
        admin.create({
          ...input,
          escalationEnabled: true,
          escalateAfterMinutes: 30,
          escalationTargetUserId: TARGET,
        }),
        'BAD_REQUEST'
      );
      expect(prismaMock.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: TARGET }) })
      );
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('refuses a target who cannot review under the policy minimum role', async () => {
      (prismaMock.user.findFirst as any).mockResolvedValueOnce({ id: TARGET, role: 'USER' });
      await expect(
        admin.create({
          ...input,
          minReviewerRole: 'MANAGER',
          escalationEnabled: true,
          escalateAfterMinutes: 30,
          escalationTargetUserId: TARGET,
        })
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Escalations must go to someone who can review them (MANAGER or above).',
      });
      expect(prismaMock.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ select: { id: true, role: true } })
      );
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('accepts a manager target on a MANAGER policy', async () => {
      (prismaMock.user.findFirst as any).mockResolvedValueOnce({ id: TARGET, role: 'MANAGER' });
      const tx = useTx();
      await admin.create({
        ...input,
        minReviewerRole: 'MANAGER',
        escalationEnabled: true,
        escalateAfterMinutes: 30,
        escalationTargetUserId: TARGET,
      });
      expect(tx.approvalPolicy.create).toHaveBeenCalled();
    });

    it('accepts an escalation target of the tenant', async () => {
      (prismaMock.user.findFirst as any).mockResolvedValueOnce({ id: TARGET, role: 'ADMIN' });
      const tx = useTx();
      await admin.create({
        ...input,
        escalationEnabled: true,
        escalateAfterMinutes: 30,
        escalationTargetUserId: TARGET,
      });
      expect(tx.approvalPolicy.create.mock.calls[0]![0].data.escalationTargetUserId).toBe(TARGET);
    });

    it('maps a duplicate name to CONFLICT', async () => {
      failTx({ code: 'P2002', meta: { target: 'approval_policies_tenant_scope_lower_name_key' } });
      await expect(admin.create(input)).rejects.toMatchObject({
        code: 'CONFLICT',
        message: expect.stringMatching(/Strict updates/),
      });
    });

    it('maps a pair already routed elsewhere to CONFLICT naming assignments', async () => {
      failTx({
        code: 'P2002',
        meta: { target: 'approval_policy_assignments_tenantId_scope_agentKey_actionT_key' },
      });
      await expect(admin.create(input)).rejects.toMatchObject({
        code: 'CONFLICT',
        message: expect.stringMatching(/already routed/),
      });
    });

    it('rethrows other errors', async () => {
      failTx(new Error('db down'));
      await expect(admin.create(input)).rejects.toThrow('db down');
      expect(invalidate).not.toHaveBeenCalled();
    });

    it('rejects duplicate pairs at the validator (AC-004)', async () => {
      await expectCode(
        admin.create({ ...input, assignments: [input.assignments[0]!, input.assignments[0]!] }),
        'BAD_REQUEST'
      );
    });
  });

  describe('update', () => {
    it('updates the policy and replaces its assignments in one transaction', async () => {
      ownPolicy();
      const tx = useTx();
      await admin.update({ ...input, id: P1, name: 'Renamed' });

      expect(prismaMock.approvalPolicy.findFirst).toHaveBeenCalledWith({
        where: { id: P1, tenantId },
        select: { id: true, scope: true, isDefault: true },
      });
      expect(tx.approvalPolicy.update).toHaveBeenCalledWith({
        where: { tenantId_id: { tenantId, id: P1 } },
        data: expect.objectContaining({ name: 'Renamed' }),
      });
      expect(tx.approvalPolicyAssignment.deleteMany).toHaveBeenCalledWith({
        where: { tenantId, policyId: P1 },
      });
      expect(tx.approvalPolicyAssignment.createMany).toHaveBeenCalled();
      expect(invalidate).toHaveBeenCalledWith(tenantId);
    });

    it('becoming the default clears the other default of the new scope', async () => {
      ownPolicy();
      const tx = useTx();
      await admin.update({ ...input, id: P1, isDefault: true, scope: 'AGENT_TOOL' });
      expect(tx.approvalPolicy.updateMany).toHaveBeenCalledWith({
        where: { tenantId, scope: 'AGENT_TOOL', isDefault: true, NOT: { id: P1 } },
        data: { isDefault: false },
      });
    });

    it('a foreign-tenant id is NOT_FOUND with zero writes (AC-006)', async () => {
      (prismaMock.approvalPolicy.findFirst as any).mockResolvedValueOnce(null);
      await expectCode(admin.update({ ...input, id: FOREIGN }), 'NOT_FOUND');
      expect(prismaMock.approvalPolicy.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: FOREIGN, tenantId } })
      );
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('maps P2002 to CONFLICT', async () => {
      ownPolicy();
      failTx({ code: 'P2002' });
      await expectCode(admin.update({ ...input, id: P1 }), 'CONFLICT');
    });
  });

  describe('delete', () => {
    it('deletes inside a transaction scoped to the tenant', async () => {
      ownPolicy();
      const tx = useTx();
      await expect(admin.delete({ id: P1 })).resolves.toEqual({ success: true });
      expect(tx.approvalPolicy.deleteMany).toHaveBeenCalledWith({ where: { id: P1, tenantId } });
      expect(invalidate).toHaveBeenCalledWith(tenantId);
    });

    it('a foreign-tenant id is NOT_FOUND (AC-006)', async () => {
      (prismaMock.approvalPolicy.findFirst as any).mockResolvedValueOnce(null);
      await expectCode(admin.delete({ id: FOREIGN }), 'NOT_FOUND');
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('setDefault', () => {
    it('clears then sets the default of that queue in one transaction', async () => {
      ownPolicy({ scope: 'AUTO_RESPONSE' });
      const tx = useTx();
      await admin.setDefault({ id: P1 });
      expect(tx.approvalPolicy.updateMany).toHaveBeenNthCalledWith(1, {
        where: { tenantId, scope: 'AUTO_RESPONSE', isDefault: true },
        data: { isDefault: false },
      });
      expect(tx.approvalPolicy.updateMany).toHaveBeenNthCalledWith(2, {
        where: { id: P1, tenantId, scope: 'AUTO_RESPONSE' },
        data: { isDefault: true },
      });
      expect(invalidate).toHaveBeenCalledWith(tenantId);
    });

    it('a foreign-tenant id is NOT_FOUND (AC-006)', async () => {
      (prismaMock.approvalPolicy.findFirst as any).mockResolvedValueOnce(null);
      await expectCode(admin.setDefault({ id: FOREIGN }), 'NOT_FOUND');
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('rolls back when the target was deleted or moved after the ownership check', async () => {
      ownPolicy();
      const tx = useTx();
      tx.approvalPolicy.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });
      await expectCode(admin.setDefault({ id: P1 }), 'NOT_FOUND');
      expect(invalidate).not.toHaveBeenCalled();
    });
  });

  describe('resetToDefaults', () => {
    it('deletes only this tenant policies inside a transaction and never touches queued items', async () => {
      const tx = useTx();
      await expect(admin.resetToDefaults()).resolves.toEqual({ deleted: 3 });
      expect(tx.approvalPolicy.deleteMany).toHaveBeenCalledWith({ where: { tenantId } });
      expect(prismaMock.agentAction.updateMany).not.toHaveBeenCalled();
      expect(prismaMock.autoResponseDraft.updateMany).not.toHaveBeenCalled();
      expect(invalidate).toHaveBeenCalledWith(tenantId);
    });
  });

  describe('preview', () => {
    it('resolves every approval tool for the agent queue', async () => {
      (prismaMock.approvalPolicy.findMany as any).mockResolvedValueOnce([row()]);
      const result = await user.preview({ scope: 'AGENT_TOOL' });

      expect(result.map((r) => `${r.agentKey}:${r.actionType}`)).toEqual([
        'create_case:CREATE',
        'create_appointment:CREATE',
        'update_case:UPDATE',
        'update_appointment:UPDATE',
        'draft_message:DRAFT',
      ]);
      expect(result.find((r) => r.agentKey === 'update_case')).toMatchObject({
        policyId: P1,
        policyName: 'Strict updates',
        colorToken: 'amber',
        source: 'ASSIGNMENT_EXACT',
      });
      expect(result.find((r) => r.agentKey === 'create_case')).toMatchObject({
        policyId: null,
        colorToken: null,
        source: 'BUILT_IN',
        rule: APPROVAL_POLICY_DEFAULTS.AGENT_TOOL,
      });
    });

    it('resolves every trigger for the auto-response queue', async () => {
      (prismaMock.approvalPolicy.findMany as any).mockResolvedValueOnce([]);
      const result = await user.preview({ scope: 'AUTO_RESPONSE' });
      expect(result.map((r) => r.actionType)).toEqual([
        'EMAIL_RECEIVED',
        'FORM_SUBMIT',
        'CHAT_MESSAGE',
        'MANUAL',
      ]);
      expect(result.every((r) => r.agentKey === 'auto_response')).toBe(true);
    });
  });
});
