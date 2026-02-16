/**
 * Auto-Response Router Caller Tests - IFC-029
 *
 * Supplementary tests that use createCaller to test router procedures
 * directly through the tRPC layer. Covers procedures that interact
 * with the repository through the router's getRepository helper.
 *
 * These tests supplement the existing autoresponse.router.test.ts
 * which tests domain logic via mock objects.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';

// Mock the dynamic import of adapters before importing the router.
// The router does: new RepositoryClass(ctx.prisma) via lazy-loaded getRepositoryClass().
// We use a regular function (not arrow function) so it can be called with `new`.
const mockRepository = {
  save: vi.fn().mockResolvedValue(undefined),
  findById: vi.fn(),
  find: vi.fn(),
  findActiveByLeadAndTrigger: vi.fn(),
  findPendingForApprover: vi.fn(),
  countByStatus: vi.fn(),
};

vi.mock('@intelliflow/adapters', () => {
  // Must use function declaration (not arrow) so `new` works
  function MockPrismaAutoResponseDraftRepository() {
    return mockRepository;
  }
  return {
    PrismaAutoResponseDraftRepository: MockPrismaAutoResponseDraftRepository,
  };
});

const mockDraftInstance = {
  id: { toString: () => '00000000-0000-4000-8000-000000000301' },
  status: 'DRAFT',
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  aiConfidence: 0.85,
  leadId: '00000000-0000-4000-8000-000000000201',
  content: { subject: 'Test Subject', body: 'Test Body' },
  modelVersion: 'openai:gpt-4:v1',
  triggerType: 'EMAIL_RECEIVED',
  recipientEmail: 'test@example.com',
  createdAt: new Date(),
  updatedAt: new Date(),
  statusHistory: [{ status: 'DRAFT', changedAt: new Date() }],
  approvalDecision: undefined,
  escalation: undefined,
  escalationCount: 0,
  isExpired: false,
  isPendingApproval: false,
  canBeSent: false,
  getDomainEvents: () => [],
  clearDomainEvents: vi.fn(),
  submitForApproval: vi.fn().mockReturnValue({ isFailure: false }),
  approve: vi.fn().mockReturnValue({ isFailure: false }),
  reject: vi.fn().mockReturnValue({ isFailure: false }),
  escalate: vi.fn().mockReturnValue({ isFailure: false }),
  resolveEscalation: vi.fn().mockReturnValue({ isFailure: false }),
  markSent: vi.fn().mockReturnValue({ isFailure: false }),
  markSendFailed: vi.fn().mockReturnValue({ isFailure: false }),
  invalidate: vi.fn(),
};

import { autoResponseRouter } from '../autoresponse.router';

const TEST_TENANT_ID = '00000000-0000-4000-8000-000000000001';
const TEST_USER_ID = '00000000-0000-4000-8000-000000000103';
const TEST_DRAFT_ID = '00000000-0000-4000-8000-000000000301';
const TEST_LEAD_ID = '00000000-0000-4000-8000-000000000201';

function createCallerContext() {
  return {
    prisma: {} as any,
    user: {
      userId: TEST_USER_ID,
      email: 'test@example.com',
      role: 'SALES_REP',
      tenantId: TEST_TENANT_ID,
    },
    tenant: {
      tenantId: TEST_TENANT_ID,
      tenantType: 'user' as const,
      userId: TEST_USER_ID,
      role: 'SALES_REP',
      canAccessAllTenantData: false,
    },
    prismaWithTenant: {} as any,
  } as any;
}

describe('autoResponseRouter (caller tests)', () => {
  let caller: ReturnType<typeof autoResponseRouter.createCaller>;

  beforeEach(() => {
    vi.clearAllMocks();
    caller = autoResponseRouter.createCaller(createCallerContext());
    // Reset all mock defaults
    mockRepository.findById.mockResolvedValue(null);
    mockRepository.find.mockResolvedValue([]);
    mockRepository.findActiveByLeadAndTrigger.mockResolvedValue(null);
    mockRepository.findPendingForApprover.mockResolvedValue([]);
    mockRepository.countByStatus.mockResolvedValue(0);
    mockRepository.save.mockResolvedValue(undefined);

    // Reset domain mock method defaults
    mockDraftInstance.submitForApproval.mockReturnValue({ isFailure: false });
    mockDraftInstance.approve.mockReturnValue({ isFailure: false });
    mockDraftInstance.reject.mockReturnValue({ isFailure: false });
    mockDraftInstance.escalate.mockReturnValue({ isFailure: false });
    mockDraftInstance.resolveEscalation.mockReturnValue({ isFailure: false });
    mockDraftInstance.markSent.mockReturnValue({ isFailure: false });
    mockDraftInstance.markSendFailed.mockReturnValue({ isFailure: false });
  });

  describe('getById', () => {
    it('should return draft details when found', async () => {
      mockRepository.findById.mockResolvedValue(mockDraftInstance);

      const result = await caller.getById({ draftId: TEST_DRAFT_ID });

      expect(result.id).toBe(TEST_DRAFT_ID);
      expect(result.status).toBe('DRAFT');
      expect(result.aiConfidence).toBe(0.85);
      expect(result.subject).toBe('Test Subject');
      expect(result.body).toBe('Test Body');
      expect(result.triggerType).toBe('EMAIL_RECEIVED');
      expect(result.recipientEmail).toBe('test@example.com');
      expect(result.isExpired).toBe(false);
      expect(result.isPendingApproval).toBe(false);
      expect(result.canBeSent).toBe(false);
      expect(result.escalationCount).toBe(0);
    });

    it('should throw NOT_FOUND when draft does not exist', async () => {
      mockRepository.findById.mockResolvedValue(null);

      await expect(caller.getById({ draftId: TEST_DRAFT_ID })).rejects.toThrow(TRPCError);

      try {
        await caller.getById({ draftId: TEST_DRAFT_ID });
      } catch (err) {
        expect((err as TRPCError).code).toBe('NOT_FOUND');
        expect((err as TRPCError).message).toContain(TEST_DRAFT_ID);
      }
    });

    it('should return status history', async () => {
      mockRepository.findById.mockResolvedValue(mockDraftInstance);

      const result = await caller.getById({ draftId: TEST_DRAFT_ID });

      expect(result.statusHistory).toBeDefined();
      expect(result.statusHistory).toHaveLength(1);
      expect(result.statusHistory[0].status).toBe('DRAFT');
    });

    it('should call repository.findById with parsed ID and tenantId', async () => {
      mockRepository.findById.mockResolvedValue(mockDraftInstance);

      await caller.getById({ draftId: TEST_DRAFT_ID });

      expect(mockRepository.findById).toHaveBeenCalledWith(expect.anything(), TEST_TENANT_ID);
    });
  });

  describe('list', () => {
    it('should return paginated list of drafts', async () => {
      mockRepository.find.mockResolvedValue([mockDraftInstance]);

      const result = await caller.list({});

      expect(result.drafts).toHaveLength(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.total).toBe(1);
      expect(result.hasMore).toBe(false);
    });

    it('should pass filter options to repository', async () => {
      mockRepository.find.mockResolvedValue([]);

      await caller.list({
        leadId: TEST_LEAD_ID,
        status: ['PENDING_APPROVAL'],
        page: 2,
        limit: 10,
      });

      expect(mockRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TEST_TENANT_ID,
          leadId: TEST_LEAD_ID,
          status: ['PENDING_APPROVAL'],
          limit: 10,
          offset: 10, // (page-1) * limit
        })
      );
    });

    it('should return hasMore=true when results equal limit', async () => {
      const drafts = Array.from({ length: 20 }, () => mockDraftInstance);
      mockRepository.find.mockResolvedValue(drafts);

      const result = await caller.list({ limit: 20 });

      expect(result.hasMore).toBe(true);
    });

    it('should map draft fields to response format', async () => {
      mockRepository.find.mockResolvedValue([mockDraftInstance]);

      const result = await caller.list({});

      const draft = result.drafts[0];
      expect(draft.id).toBe(TEST_DRAFT_ID);
      expect(draft.leadId).toBe(TEST_LEAD_ID);
      expect(draft.subject).toBe('Test Subject');
      expect(draft.status).toBe('DRAFT');
      expect(draft.aiConfidence).toBe(0.85);
      expect(draft.triggerType).toBe('EMAIL_RECEIVED');
      expect(draft.recipientEmail).toBe('test@example.com');
    });
  });

  describe('submitForApproval', () => {
    it('should submit draft for approval', async () => {
      mockRepository.findById.mockResolvedValue(mockDraftInstance);

      const result = await caller.submitForApproval({
        draftId: TEST_DRAFT_ID,
        approverId: TEST_USER_ID,
      });

      expect(result.success).toBe(true);
      expect(mockDraftInstance.submitForApproval).toHaveBeenCalledWith(TEST_USER_ID);
      expect(mockRepository.save).toHaveBeenCalledWith(mockDraftInstance);
    });

    it('should throw NOT_FOUND when draft does not exist', async () => {
      mockRepository.findById.mockResolvedValue(null);

      await expect(
        caller.submitForApproval({
          draftId: TEST_DRAFT_ID,
          approverId: TEST_USER_ID,
        })
      ).rejects.toThrow(TRPCError);
    });

    it('should throw BAD_REQUEST when domain operation fails', async () => {
      const draftWithFailure = {
        ...mockDraftInstance,
        submitForApproval: vi.fn().mockReturnValue({
          isFailure: true,
          error: { message: 'Cannot submit from current state' },
        }),
      };
      mockRepository.findById.mockResolvedValue(draftWithFailure);

      try {
        await caller.submitForApproval({
          draftId: TEST_DRAFT_ID,
          approverId: TEST_USER_ID,
        });
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(TRPCError);
        expect((err as TRPCError).code).toBe('BAD_REQUEST');
      }
    });

    it('should throw INTERNAL_SERVER_ERROR when save fails', async () => {
      mockRepository.findById.mockResolvedValue(mockDraftInstance);
      mockRepository.save.mockRejectedValue(new Error('DB error'));

      try {
        await caller.submitForApproval({
          draftId: TEST_DRAFT_ID,
          approverId: TEST_USER_ID,
        });
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(TRPCError);
        expect((err as TRPCError).code).toBe('INTERNAL_SERVER_ERROR');
      }
    });

    it('should publish domain events after save', async () => {
      const events = [{ constructor: { name: 'DraftSubmittedEvent' } }];
      const draftWithEvents = {
        ...mockDraftInstance,
        getDomainEvents: () => events,
        clearDomainEvents: vi.fn(),
      };
      mockRepository.findById.mockResolvedValue(draftWithEvents);

      await caller.submitForApproval({
        draftId: TEST_DRAFT_ID,
        approverId: TEST_USER_ID,
      });

      expect(draftWithEvents.clearDomainEvents).toHaveBeenCalled();
    });
  });

  describe('reject', () => {
    it('should reject a draft with reason', async () => {
      mockRepository.findById.mockResolvedValue(mockDraftInstance);

      const result = await caller.reject({
        draftId: TEST_DRAFT_ID,
        decidedBy: TEST_USER_ID,
        reason: 'Not appropriate for this lead',
      });

      expect(result.success).toBe(true);
      expect(mockDraftInstance.reject).toHaveBeenCalledWith(
        TEST_USER_ID,
        'Not appropriate for this lead'
      );
    });

    it('should throw NOT_FOUND when draft does not exist', async () => {
      mockRepository.findById.mockResolvedValue(null);

      await expect(
        caller.reject({
          draftId: TEST_DRAFT_ID,
          decidedBy: TEST_USER_ID,
          reason: 'Not needed',
        })
      ).rejects.toThrow(TRPCError);
    });

    it('should require a non-empty reason', async () => {
      await expect(
        caller.reject({
          draftId: TEST_DRAFT_ID,
          decidedBy: TEST_USER_ID,
          reason: '',
        })
      ).rejects.toThrow();
    });

    it('should save and publish events after rejection', async () => {
      mockRepository.findById.mockResolvedValue(mockDraftInstance);

      await caller.reject({
        draftId: TEST_DRAFT_ID,
        decidedBy: TEST_USER_ID,
        reason: 'Inappropriate tone',
      });

      expect(mockRepository.save).toHaveBeenCalledWith(mockDraftInstance);
      expect(mockDraftInstance.clearDomainEvents).toHaveBeenCalled();
    });
  });

  describe('escalate', () => {
    it('should escalate a draft', async () => {
      mockRepository.findById.mockResolvedValue(mockDraftInstance);

      const result = await caller.escalate({
        draftId: TEST_DRAFT_ID,
        escalatedBy: TEST_USER_ID,
        escalatedTo: '00000000-0000-4000-8000-000000000999',
        reason: 'Need senior review',
      });

      expect(result.success).toBe(true);
      expect(mockDraftInstance.escalate).toHaveBeenCalled();
    });

    it('should throw NOT_FOUND when draft does not exist', async () => {
      mockRepository.findById.mockResolvedValue(null);

      await expect(
        caller.escalate({
          draftId: TEST_DRAFT_ID,
          escalatedBy: TEST_USER_ID,
          escalatedTo: '00000000-0000-4000-8000-000000000999',
          reason: 'Need senior review',
        })
      ).rejects.toThrow(TRPCError);
    });

    it('should throw BAD_REQUEST when domain escalation fails', async () => {
      const draftWithFailure = {
        ...mockDraftInstance,
        escalate: vi.fn().mockReturnValue({
          isFailure: true,
          error: { message: 'Cannot escalate from current state' },
        }),
      };
      mockRepository.findById.mockResolvedValue(draftWithFailure);

      try {
        await caller.escalate({
          draftId: TEST_DRAFT_ID,
          escalatedBy: TEST_USER_ID,
          escalatedTo: '00000000-0000-4000-8000-000000000999',
          reason: 'Need senior review',
        });
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(TRPCError);
        expect((err as TRPCError).code).toBe('BAD_REQUEST');
      }
    });
  });

  describe('resolveEscalation', () => {
    it('should resolve an escalation', async () => {
      mockRepository.findById.mockResolvedValue(mockDraftInstance);

      const result = await caller.resolveEscalation({
        draftId: TEST_DRAFT_ID,
        resolvedBy: TEST_USER_ID,
        feedback: 'Looks good after review',
      });

      expect(result.success).toBe(true);
      expect(mockDraftInstance.resolveEscalation).toHaveBeenCalledWith(
        TEST_USER_ID,
        'Looks good after review'
      );
    });

    it('should throw NOT_FOUND when draft does not exist', async () => {
      mockRepository.findById.mockResolvedValue(null);

      await expect(
        caller.resolveEscalation({
          draftId: TEST_DRAFT_ID,
          resolvedBy: TEST_USER_ID,
        })
      ).rejects.toThrow(TRPCError);
    });

    it('should allow resolving without feedback', async () => {
      mockRepository.findById.mockResolvedValue(mockDraftInstance);

      const result = await caller.resolveEscalation({
        draftId: TEST_DRAFT_ID,
        resolvedBy: TEST_USER_ID,
      });

      expect(result.success).toBe(true);
      expect(mockDraftInstance.resolveEscalation).toHaveBeenCalledWith(TEST_USER_ID, undefined);
    });
  });

  describe('markSent', () => {
    it('should mark a draft as sent', async () => {
      mockRepository.findById.mockResolvedValue(mockDraftInstance);

      const result = await caller.markSent({
        draftId: TEST_DRAFT_ID,
        notificationId: '00000000-0000-4000-8000-000000000888',
      });

      expect(result.success).toBe(true);
      expect(mockDraftInstance.markSent).toHaveBeenCalledWith(
        '00000000-0000-4000-8000-000000000888'
      );
    });

    it('should throw NOT_FOUND when draft does not exist', async () => {
      mockRepository.findById.mockResolvedValue(null);

      await expect(
        caller.markSent({
          draftId: TEST_DRAFT_ID,
          notificationId: '00000000-0000-4000-8000-000000000888',
        })
      ).rejects.toThrow(TRPCError);
    });

    it('should throw BAD_REQUEST when domain markSent fails', async () => {
      const draftWithFailure = {
        ...mockDraftInstance,
        markSent: vi.fn().mockReturnValue({
          isFailure: true,
          error: { message: 'Cannot mark as sent from current state' },
        }),
      };
      mockRepository.findById.mockResolvedValue(draftWithFailure);

      await expect(
        caller.markSent({
          draftId: TEST_DRAFT_ID,
          notificationId: '00000000-0000-4000-8000-000000000888',
        })
      ).rejects.toThrow(TRPCError);
    });
  });

  describe('markFailed', () => {
    it('should mark a draft as failed', async () => {
      mockRepository.findById.mockResolvedValue(mockDraftInstance);

      const result = await caller.markFailed({
        draftId: TEST_DRAFT_ID,
        error: 'Email delivery failed',
      });

      expect(result.success).toBe(true);
      expect(mockDraftInstance.markSendFailed).toHaveBeenCalledWith('Email delivery failed');
    });

    it('should throw NOT_FOUND when draft does not exist', async () => {
      mockRepository.findById.mockResolvedValue(null);

      await expect(
        caller.markFailed({
          draftId: TEST_DRAFT_ID,
          error: 'Email delivery failed',
        })
      ).rejects.toThrow(TRPCError);
    });

    it('should throw BAD_REQUEST when domain markSendFailed fails', async () => {
      const draftWithFailure = {
        ...mockDraftInstance,
        markSendFailed: vi.fn().mockReturnValue({
          isFailure: true,
          error: { message: 'Cannot mark as failed from current state' },
        }),
      };
      mockRepository.findById.mockResolvedValue(draftWithFailure);

      await expect(
        caller.markFailed({
          draftId: TEST_DRAFT_ID,
          error: 'Email delivery failed',
        })
      ).rejects.toThrow(TRPCError);
    });
  });

  describe('getPendingForApprover', () => {
    it('should return drafts pending for specific approver', async () => {
      mockRepository.findPendingForApprover.mockResolvedValue([mockDraftInstance]);

      const result = await caller.getPendingForApprover({
        approverId: TEST_USER_ID,
      });

      expect(result.drafts).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.drafts[0].id).toBe(TEST_DRAFT_ID);
    });

    it('should return empty list when no pending drafts', async () => {
      mockRepository.findPendingForApprover.mockResolvedValue([]);

      const result = await caller.getPendingForApprover({
        approverId: TEST_USER_ID,
      });

      expect(result.drafts).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should pass tenantId for isolation', async () => {
      mockRepository.findPendingForApprover.mockResolvedValue([]);

      await caller.getPendingForApprover({ approverId: TEST_USER_ID });

      expect(mockRepository.findPendingForApprover).toHaveBeenCalledWith(
        TEST_USER_ID,
        TEST_TENANT_ID
      );
    });

    it('should map draft fields correctly in response', async () => {
      mockRepository.findPendingForApprover.mockResolvedValue([mockDraftInstance]);

      const result = await caller.getPendingForApprover({
        approverId: TEST_USER_ID,
      });

      const draft = result.drafts[0];
      expect(draft.leadId).toBe(TEST_LEAD_ID);
      expect(draft.subject).toBe('Test Subject');
      expect(draft.status).toBe('DRAFT');
      expect(draft.aiConfidence).toBe(0.85);
      expect(draft.triggerType).toBe('EMAIL_RECEIVED');
    });
  });

  describe('rollback', () => {
    it('should rollback an APPROVED draft', async () => {
      const approvedDraft = {
        ...mockDraftInstance,
        status: 'APPROVED',
        invalidate: vi.fn(),
        getDomainEvents: () => [],
        clearDomainEvents: vi.fn(),
      };
      mockRepository.findById.mockResolvedValue(approvedDraft);

      const result = await caller.rollback({
        draftId: TEST_DRAFT_ID,
        rolledBackBy: TEST_USER_ID,
        reason: 'Client changed their mind',
      });

      expect(result.success).toBe(true);
      expect(approvedDraft.invalidate).toHaveBeenCalled();
    });

    it('should throw NOT_FOUND when draft does not exist', async () => {
      mockRepository.findById.mockResolvedValue(null);

      await expect(
        caller.rollback({
          draftId: TEST_DRAFT_ID,
          rolledBackBy: TEST_USER_ID,
          reason: 'Need to rollback',
        })
      ).rejects.toThrow(TRPCError);
    });

    it('should throw BAD_REQUEST when draft is not APPROVED', async () => {
      const draftInWrongState = {
        ...mockDraftInstance,
        status: 'DRAFT',
      };
      mockRepository.findById.mockResolvedValue(draftInWrongState);

      try {
        await caller.rollback({
          draftId: TEST_DRAFT_ID,
          rolledBackBy: TEST_USER_ID,
          reason: 'Rollback needed',
        });
        expect.fail('Expected TRPCError to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(TRPCError);
        expect((err as TRPCError).code).toBe('BAD_REQUEST');
        expect((err as TRPCError).message).toContain('DRAFT');
      }
    });

    it('should require a non-empty reason', async () => {
      await expect(
        caller.rollback({
          draftId: TEST_DRAFT_ID,
          rolledBackBy: TEST_USER_ID,
          reason: '',
        })
      ).rejects.toThrow();
    });

    it('should include rollback metadata in invalidate call', async () => {
      const approvedDraft = {
        ...mockDraftInstance,
        status: 'APPROVED',
        invalidate: vi.fn(),
        getDomainEvents: () => [],
        clearDomainEvents: vi.fn(),
      };
      mockRepository.findById.mockResolvedValue(approvedDraft);

      await caller.rollback({
        draftId: TEST_DRAFT_ID,
        rolledBackBy: TEST_USER_ID,
        reason: 'Client changed their mind',
      });

      expect(approvedDraft.invalidate).toHaveBeenCalledWith(expect.stringContaining(TEST_USER_ID));
      expect(approvedDraft.invalidate).toHaveBeenCalledWith(
        expect.stringContaining('Client changed their mind')
      );
    });
  });

  describe('getStatsByStatus', () => {
    it('should return counts for each status', async () => {
      // The getStatsByStatus uses protectedProcedure (not tenantProcedure)
      const protectedCtx = {
        prisma: {} as any,
        user: {
          userId: TEST_USER_ID,
          email: 'test@example.com',
          role: 'ADMIN',
          tenantId: TEST_TENANT_ID,
        },
      } as any;
      const adminCaller = autoResponseRouter.createCaller(protectedCtx);

      mockRepository.countByStatus
        .mockResolvedValueOnce(5) // DRAFT
        .mockResolvedValueOnce(3) // PENDING_APPROVAL
        .mockResolvedValueOnce(10) // APPROVED
        .mockResolvedValueOnce(2) // REJECTED
        .mockResolvedValueOnce(1) // ESCALATED
        .mockResolvedValueOnce(8) // SENT
        .mockResolvedValueOnce(1) // FAILED
        .mockResolvedValueOnce(0); // INVALIDATED

      const result = await adminCaller.getStatsByStatus({
        tenantId: TEST_TENANT_ID,
      });

      expect(result.DRAFT).toBe(5);
      expect(result.PENDING_APPROVAL).toBe(3);
      expect(result.APPROVED).toBe(10);
      expect(result.REJECTED).toBe(2);
      expect(result.ESCALATED).toBe(1);
      expect(result.SENT).toBe(8);
      expect(result.FAILED).toBe(1);
      expect(result.INVALIDATED).toBe(0);
    });

    it('should call countByStatus for all 8 statuses', async () => {
      const protectedCtx = {
        prisma: {} as any,
        user: {
          userId: TEST_USER_ID,
          email: 'test@example.com',
          role: 'ADMIN',
          tenantId: TEST_TENANT_ID,
        },
      } as any;
      const adminCaller = autoResponseRouter.createCaller(protectedCtx);
      mockRepository.countByStatus.mockResolvedValue(0);

      await adminCaller.getStatsByStatus({ tenantId: TEST_TENANT_ID });

      expect(mockRepository.countByStatus).toHaveBeenCalledTimes(8);
    });

    it('should pass tenantId to each countByStatus call', async () => {
      const protectedCtx = {
        prisma: {} as any,
        user: {
          userId: TEST_USER_ID,
          email: 'test@example.com',
          role: 'ADMIN',
          tenantId: TEST_TENANT_ID,
        },
      } as any;
      const adminCaller = autoResponseRouter.createCaller(protectedCtx);
      mockRepository.countByStatus.mockResolvedValue(0);

      await adminCaller.getStatsByStatus({ tenantId: TEST_TENANT_ID });

      for (const call of mockRepository.countByStatus.mock.calls) {
        expect(call[0]).toBe(TEST_TENANT_ID);
      }
    });
  });
});
