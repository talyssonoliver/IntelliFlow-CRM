/**
 * Auto-response router × approval policies (PG-198).
 *
 * Real AutoResponseDraft aggregates; the repository and the policy loader are
 * mocked. Covers AC-009 (expiry from policy), AC-010 (minimum reviewer role),
 * AC-013 (auto-approval) and RF-3 (#855: the actor is the signed-in user).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  APPROVAL_POLICY_DEFAULTS,
  AutoResponseDraft,
  ResponseContent,
  SYSTEM_APPROVAL_ACTOR,
} from '@intelliflow/domain';

const repo = vi.hoisted(() => ({
  findById: vi.fn(),
  findActiveByLeadAndTrigger: vi.fn(),
  save: vi.fn(),
}));

vi.mock('@intelliflow/adapters', () => {
  function MockPrismaAutoResponseDraftRepository() {
    return repo;
  }
  return { PrismaAutoResponseDraftRepository: MockPrismaAutoResponseDraftRepository };
});

const loadApprovalPolicy = vi.hoisted(() => vi.fn());
vi.mock('../../../agent/approval-policy-loader', () => ({ loadApprovalPolicy }));

import { autoResponseRouter, sessionActor } from '../autoresponse.router';

const TENANT = '00000000-0000-4000-8000-000000000001';
const USER = '00000000-0000-4000-8000-000000000103';
const OTHER_USER = '00000000-0000-4000-8000-000000000104';
const LEAD = '00000000-0000-4000-8000-000000000201';

function ctx(role = 'SALES_REP', userId: string | undefined = USER) {
  return {
    prisma: {} as any,
    user: userId ? { userId, email: 'u@example.invalid', role, tenantId: TENANT } : undefined,
    tenant: { tenantId: TENANT, tenantType: 'user', userId, role, canAccessAllTenantData: false },
    prismaWithTenant: { marker: 'tenant-client' } as any,
  } as any;
}

function policy(rule: Record<string, unknown> = {}) {
  return {
    rule: { ...APPROVAL_POLICY_DEFAULTS.AUTO_RESPONSE, ...rule },
    policyId: 'policy-9',
    policyName: 'Email drafts',
    source: 'SCOPE_DEFAULT',
  };
}

function draft(aiConfidence = 0.95) {
  const result = AutoResponseDraft.create({
    tenantId: TENANT,
    leadId: LEAD,
    leadTenantId: TENANT,
    leadStatus: 'NEW',
    triggerType: 'EMAIL_RECEIVED',
    content: ResponseContent.create({ subject: 'Thanks', body: 'We will be in touch.' }),
    aiConfidence,
    modelVersion: 'test:model:v1',
    recipientEmail: 'lead@example.invalid',
  });
  if (result.isFailure) throw result.error;
  return result.value;
}

function pendingDraft(aiConfidence = 0.95) {
  const d = draft(aiConfidence);
  d.submitForApproval(USER);
  return d;
}

beforeEach(() => {
  vi.clearAllMocks();
  repo.findActiveByLeadAndTrigger.mockResolvedValue(null);
  repo.save.mockResolvedValue(undefined);
  loadApprovalPolicy.mockResolvedValue(policy());
});

describe('create / regenerate — expiry from the policy (AC-009)', () => {
  const createInput = {
    tenantId: TENANT,
    leadId: LEAD,
    leadTenantId: TENANT,
    leadStatus: 'NEW',
    triggerType: 'FORM_SUBMIT' as const,
    subject: 'Hello',
    body: 'Body',
    aiConfidence: 0.8,
    recipientEmail: 'lead@example.invalid',
    expiryHours: 168,
  };

  it('uses the policy timeout, not the client expiryHours', async () => {
    loadApprovalPolicy.mockResolvedValue(policy({ timeoutMinutes: 90 }));
    const before = Date.now();

    const result = await autoResponseRouter.createCaller(ctx()).create(createInput);

    const hours = (result.expiresAt.getTime() - before) / 3_600_000;
    expect(hours).toBeGreaterThan(1.49);
    expect(hours).toBeLessThan(1.51);
    expect(loadApprovalPolicy).toHaveBeenCalledWith(
      expect.anything(),
      TENANT,
      'AUTO_RESPONSE',
      'auto_response',
      'FORM_SUBMIT',
      undefined
    );
  });

  it('a regenerated draft gets the policy timeout too', async () => {
    const original = draft();
    original.submitForApproval(USER);
    original.reject(USER, 'Wrong tone');
    repo.findById.mockResolvedValue(original);
    loadApprovalPolicy.mockResolvedValue(policy({ timeoutMinutes: 120 }));
    const before = Date.now();

    const result = await autoResponseRouter
      .createCaller(ctx())
      .regenerate({ draftId: original.id.toString() });

    const hours = (result.expiresAt.getTime() - before) / 3_600_000;
    expect(hours).toBeGreaterThan(1.99);
    expect(hours).toBeLessThan(2.01);
  });
});

describe('approve / reject / resolveEscalation — actor and reviewer role', () => {
  it('records the signed-in user as the decider (RF-3)', async () => {
    const d = pendingDraft();
    repo.findById.mockResolvedValue(d);

    await autoResponseRouter
      .createCaller(ctx())
      .approve({ draftId: d.id.toString(), decision: 'APPROVED', decidedBy: USER });

    expect(d.status).toBe('APPROVED');
    expect(d.approvalDecision?.decidedBy).toBe(USER);
  });

  it.each([
    [
      'approve',
      (c: any, id: string) =>
        c.approve({ draftId: id, decision: 'APPROVED', decidedBy: OTHER_USER }),
    ],
    [
      'reject',
      (c: any, id: string) => c.reject({ draftId: id, decidedBy: OTHER_USER, reason: 'x' }),
    ],
    [
      'escalate',
      (c: any, id: string) =>
        c.escalate({ draftId: id, escalatedBy: OTHER_USER, escalatedTo: USER, reason: 'x' }),
    ],
    [
      'resolveEscalation',
      (c: any, id: string) => c.resolveEscalation({ draftId: id, resolvedBy: OTHER_USER }),
    ],
  ])('%s refuses a client actor that is not the signed-in user (RF-3)', async (_n, call) => {
    const d = pendingDraft();
    repo.findById.mockResolvedValue(d);

    await expect(
      call(autoResponseRouter.createCaller(ctx()), d.id.toString())
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('sessionActor: the signed-in user, refusing someone else or no session', () => {
    expect(sessionActor({ user: { userId: USER } } as any, USER, 'decidedBy')).toBe(USER);
    expect(sessionActor({ user: { userId: USER } } as any, undefined, 'decidedBy')).toBe(USER);
    expect(() => sessionActor({ user: { userId: USER } } as any, OTHER_USER, 'decidedBy')).toThrow(
      'decidedBy must be the signed-in user.'
    );
    expect(() => sessionActor({ user: undefined } as any, USER, 'decidedBy')).toThrow(
      expect.objectContaining({ code: 'UNAUTHORIZED' })
    );
  });

  it.each([
    [
      'approve',
      (c: any, id: string) => c.approve({ draftId: id, decision: 'APPROVED', decidedBy: USER }),
    ],
    ['reject', (c: any, id: string) => c.reject({ draftId: id, decidedBy: USER, reason: 'x' })],
    [
      'resolveEscalation',
      (c: any, id: string) => c.resolveEscalation({ draftId: id, resolvedBy: USER }),
    ],
  ])('%s requires the policy minimum role (AC-010)', async (_n, call) => {
    loadApprovalPolicy.mockResolvedValue(policy({ minReviewerRole: 'MANAGER' }));
    const d = pendingDraft();
    repo.findById.mockResolvedValue(d);

    await expect(
      call(autoResponseRouter.createCaller(ctx('SALES_REP')), d.id.toString())
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'This draft needs a reviewer with the MANAGER role or above.',
    });
    expect(repo.save).not.toHaveBeenCalled();
    expect(loadApprovalPolicy.mock.calls.at(-1)![5]).toEqual({ fresh: true });
  });

  it('a manager may decide under a MANAGER policy', async () => {
    loadApprovalPolicy.mockResolvedValue(policy({ minReviewerRole: 'MANAGER' }));
    const d = pendingDraft();
    repo.findById.mockResolvedValue(d);

    await autoResponseRouter
      .createCaller(ctx('MANAGER'))
      .reject({ draftId: d.id.toString(), decidedBy: USER, reason: 'Not now' });

    expect(d.status).toBe('REJECTED');
  });

  it('fails closed when the policy cannot be read for a decision', async () => {
    loadApprovalPolicy.mockRejectedValue(new Error('db down'));
    const d = pendingDraft();
    repo.findById.mockResolvedValue(d);

    await expect(
      autoResponseRouter
        .createCaller(ctx('ADMIN'))
        .approve({ draftId: d.id.toString(), decision: 'APPROVED', decidedBy: USER })
    ).rejects.toBeDefined();
    expect(d.status).toBe('PENDING_APPROVAL');
  });
});

describe('submitForApproval — auto-approval (AC-013)', () => {
  const enabled = { autoApproveEnabled: true, autoApproveMinConfidence: 90 };

  it('auto-approves as the system actor with an auditable reason', async () => {
    loadApprovalPolicy.mockResolvedValue(policy(enabled));
    const d = draft(0.95);
    repo.findById.mockResolvedValue(d);

    const result = await autoResponseRouter
      .createCaller(ctx('SALES_REP'))
      .submitForApproval({ draftId: d.id.toString(), approverId: OTHER_USER });

    expect(result).toEqual({ success: true, status: 'APPROVED', autoApproved: true });
    expect(d.approvalDecision?.decidedBy).toBe(SYSTEM_APPROVAL_ACTOR);
    expect(d.approvalDecision?.reason).toMatch(
      /Auto-approved by policy "Email drafts" \(policy-9\): confidence 95\.0% > 90%; requested by /
    );
    expect(d.approvalDecision?.reason).toContain(USER);
    // Still goes through PENDING_APPROVAL (invariant 4) before APPROVED.
    expect(d.statusHistory.map((h) => h.status)).toEqual(['DRAFT', 'PENDING_APPROVAL', 'APPROVED']);
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('a client-supplied confidence of 1 from a requester below the minimum role stays pending (A3)', async () => {
    loadApprovalPolicy.mockResolvedValue(policy({ ...enabled, minReviewerRole: 'MANAGER' }));
    const d = draft(1);
    repo.findById.mockResolvedValue(d);

    const result = await autoResponseRouter
      .createCaller(ctx('SALES_REP'))
      // approverId names a manager, but the requester is the signed-in SALES_REP.
      .submitForApproval({ draftId: d.id.toString(), approverId: OTHER_USER });

    expect(result).toEqual({ success: true, status: 'PENDING_APPROVAL', autoApproved: false });
  });

  it.each([
    ['confidence equal to the threshold', enabled, 0.9],
    ['the policy off', {}, 0.99],
  ])('stays pending with %s', async (_label, rule, confidence) => {
    loadApprovalPolicy.mockResolvedValue(policy(rule));
    const d = draft(confidence);
    repo.findById.mockResolvedValue(d);

    const result = await autoResponseRouter
      .createCaller(ctx('ADMIN'))
      .submitForApproval({ draftId: d.id.toString(), approverId: USER });

    expect(result.autoApproved).toBe(false);
    expect(d.status).toBe('PENDING_APPROVAL');
  });

  it('stays pending when the policy cannot be read (fail closed)', async () => {
    loadApprovalPolicy.mockRejectedValue(new Error('db down'));
    const d = draft(0.99);
    repo.findById.mockResolvedValue(d);

    const result = await autoResponseRouter
      .createCaller(ctx('ADMIN'))
      .submitForApproval({ draftId: d.id.toString(), approverId: USER });

    expect(result.autoApproved).toBe(false);
  });
});
