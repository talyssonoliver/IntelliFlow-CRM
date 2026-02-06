import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrismaAutoResponseDraftRepository, OptimisticLockError } from '../PrismaAutoResponseDraftRepository';

vi.mock('@intelliflow/domain', () => ({
  AutoResponseDraft: {
    rehydrate: vi.fn().mockImplementation((props: any) => ({
      ...props,
      id: { toString: () => props.id },
      content: { toValue: () => ({ subject: 'Sub', body: 'Body' }) },
      statusHistory: [],
      incrementVersion: vi.fn(),
      version: props.version || 0,
    })),
  },
  AutoResponseDraftId: { create: vi.fn((id: string) => ({ toString: () => id })) },
  ResponseContent: { create: vi.fn((p: any) => p) },
}));

const mockPrisma = {
  autoResponseDraft: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
};

describe('PrismaAutoResponseDraftRepository', () => {
  let repo: PrismaAutoResponseDraftRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new PrismaAutoResponseDraftRepository(mockPrisma as any);
  });

  describe('save', () => {
    it('should create new draft when not existing', async () => {
      mockPrisma.autoResponseDraft.findUnique.mockResolvedValue(null);
      mockPrisma.autoResponseDraft.create.mockResolvedValue({});

      const draft = {
        id: { toString: () => 'draft_1' },
        tenantId: 'tenant_1', leadId: 'lead_1', recipientEmail: 'a@b.com',
        content: { toValue: () => ({ subject: 'Sub', body: 'Body' }) },
        aiConfidence: 0.9, modelVersion: '1.0', triggerType: 'NEW_LEAD',
        status: 'DRAFT', version: 0, expiresAt: new Date(),
        statusHistory: [], approvalDecision: null, escalation: null,
        escalationCount: 0, createdAt: new Date(), updatedAt: new Date(),
      };

      await repo.save(draft as any);
      expect(mockPrisma.autoResponseDraft.create).toHaveBeenCalled();
    });

    it('should update existing draft with optimistic locking', async () => {
      mockPrisma.autoResponseDraft.findUnique.mockResolvedValue({ version: 0 });
      mockPrisma.autoResponseDraft.updateMany.mockResolvedValue({ count: 1 });

      const draft = {
        id: { toString: () => 'draft_1' },
        tenantId: 'tenant_1', leadId: 'lead_1', recipientEmail: 'a@b.com',
        content: { toValue: () => ({ subject: 'Sub', body: 'Body' }) },
        aiConfidence: 0.9, modelVersion: '1.0', triggerType: 'NEW_LEAD',
        status: 'DRAFT', version: 1, expiresAt: new Date(),
        statusHistory: [], approvalDecision: null, escalation: null,
        escalationCount: 0, createdAt: new Date(), updatedAt: new Date(),
      };

      await repo.save(draft as any);
      expect(mockPrisma.autoResponseDraft.updateMany).toHaveBeenCalled();
    });

    it('should throw OptimisticLockError on concurrent modification', async () => {
      mockPrisma.autoResponseDraft.findUnique.mockResolvedValue({ version: 2 });
      mockPrisma.autoResponseDraft.updateMany.mockResolvedValue({ count: 0 });

      const draft = {
        id: { toString: () => 'draft_1' },
        tenantId: 'tenant_1', leadId: 'lead_1', recipientEmail: 'a@b.com',
        content: { toValue: () => ({ subject: 'Sub', body: 'Body' }) },
        aiConfidence: 0.9, modelVersion: '1.0', triggerType: 'NEW_LEAD',
        status: 'DRAFT', version: 1, expiresAt: new Date(),
        statusHistory: [], approvalDecision: null, escalation: null,
        escalationCount: 0, createdAt: new Date(), updatedAt: new Date(),
      };

      await expect(repo.save(draft as any)).rejects.toThrow(OptimisticLockError);
    });
  });

  describe('findById', () => {
    it('should return null when not found', async () => {
      mockPrisma.autoResponseDraft.findUnique.mockResolvedValue(null);
      const result = await repo.findById({ toString: () => 'draft_x' } as any, 'tenant_1');
      expect(result).toBeNull();
    });

    it('should return domain entity when found', async () => {
      mockPrisma.autoResponseDraft.findUnique.mockResolvedValue({
        id: 'draft_1', tenantId: 'tenant_1', leadId: 'lead_1', recipientEmail: 'a@b.com',
        subject: 'Sub', body: 'Body', aiConfidence: 0.9, modelVersion: '1.0',
        triggerType: 'NEW_LEAD', status: 'DRAFT', version: 0, expiresAt: new Date(),
        statusHistory: [], approvalDecision: null, escalation: null,
        escalationCount: 0, createdAt: new Date(), updatedAt: new Date(),
      });
      const result = await repo.findById({ toString: () => 'draft_1' } as any, 'tenant_1');
      expect(result).not.toBeNull();
    });
  });

  describe('find', () => {
    it('should find with query filters', async () => {
      mockPrisma.autoResponseDraft.findMany.mockResolvedValue([]);
      const result = await repo.find({ tenantId: 'tenant_1', leadId: 'lead_1', status: 'DRAFT', limit: 10 });
      expect(result).toEqual([]);
      expect(mockPrisma.autoResponseDraft.findMany).toHaveBeenCalled();
    });

    it('should handle status array filter', async () => {
      mockPrisma.autoResponseDraft.findMany.mockResolvedValue([]);
      await repo.find({ tenantId: 'tenant_1', status: ['DRAFT', 'PENDING_APPROVAL'] as any });
      expect(mockPrisma.autoResponseDraft.findMany).toHaveBeenCalled();
    });

    it('should handle expiredOnly filter', async () => {
      mockPrisma.autoResponseDraft.findMany.mockResolvedValue([]);
      await repo.find({ tenantId: 'tenant_1', expiredOnly: true });
      expect(mockPrisma.autoResponseDraft.findMany).toHaveBeenCalled();
    });
  });

  describe('findActiveByLeadAndTrigger', () => {
    it('should return null when not found', async () => {
      mockPrisma.autoResponseDraft.findFirst.mockResolvedValue(null);
      const result = await repo.findActiveByLeadAndTrigger('lead_1', 'NEW_LEAD' as any, 'tenant_1');
      expect(result).toBeNull();
    });
  });

  describe('findPendingForApprover', () => {
    it('should find pending drafts', async () => {
      mockPrisma.autoResponseDraft.findMany.mockResolvedValue([]);
      const result = await repo.findPendingForApprover('approver_1', 'tenant_1');
      expect(result).toEqual([]);
    });
  });

  describe('findExpired', () => {
    it('should find expired drafts', async () => {
      mockPrisma.autoResponseDraft.findMany.mockResolvedValue([]);
      const result = await repo.findExpired('tenant_1');
      expect(result).toEqual([]);
    });
  });

  describe('delete', () => {
    it('should delete by id and tenantId', async () => {
      mockPrisma.autoResponseDraft.delete.mockResolvedValue({});
      await repo.delete({ toString: () => 'draft_1' } as any, 'tenant_1');
      expect(mockPrisma.autoResponseDraft.delete).toHaveBeenCalledWith({
        where: { id: 'draft_1', tenantId: 'tenant_1' },
      });
    });
  });

  describe('countByStatus', () => {
    it('should count by tenant and status', async () => {
      mockPrisma.autoResponseDraft.count.mockResolvedValue(5);
      const result = await repo.countByStatus('tenant_1', 'DRAFT' as any);
      expect(result).toBe(5);
    });
  });
});
