import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PrismaClient } from '@intelliflow/db';
import {
  PrismaAutoResponseDraftRepository,
  OptimisticLockError,
} from '../PrismaAutoResponseDraftRepository';
import { AutoResponseDraft, AutoResponseDraftId, ResponseContent } from '@intelliflow/domain';
import { randomUUID } from 'crypto';

// Generate valid UUIDs for tests
const DRAFT_ID_1 = randomUUID();
const DRAFT_ID_2 = randomUUID();
const NON_EXISTENT_ID = randomUUID();

// Mock Prisma client
const mockPrisma = {
  autoResponseDraft: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
} as PrismaClient;

describe('PrismaAutoResponseDraftRepository', () => {
  let repository: PrismaAutoResponseDraftRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = new PrismaAutoResponseDraftRepository(mockPrisma);
  });

  const createMockDraftData = (overrides: Record<string, unknown> = {}) => ({
    id: DRAFT_ID_1,
    tenantId: 'tenant-1',
    leadId: 'lead-123',
    recipientEmail: 'test@example.com',
    subject: 'Test Subject',
    body: 'Test body content',
    aiConfidence: 0.85,
    modelVersion: 'openai:gpt-4:v1',
    triggerType: 'EMAIL_RECEIVED',
    status: 'DRAFT',
    version: 0,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    statusHistory: '[]',
    approvalDecision: null,
    escalation: null,
    escalationCount: 0,
    sentAt: null,
    sendError: null,
    messageId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  const createMockDraft = (overrides: Record<string, unknown> = {}) => {
    const data = createMockDraftData(overrides);
    const responseContent = ResponseContent.create({
      subject: data.subject as string,
      body: data.body as string,
    });

    return AutoResponseDraft.rehydrate({
      id: data.id as string,
      tenantId: data.tenantId as string,
      leadId: data.leadId as string,
      recipientEmail: data.recipientEmail as string,
      content: responseContent,
      aiConfidence: data.aiConfidence as number,
      modelVersion: data.modelVersion as string,
      triggerType: data.triggerType as 'EMAIL_RECEIVED' | 'FORM_SUBMIT' | 'CHAT_MESSAGE' | 'MANUAL',
      status: data.status as
        | 'DRAFT'
        | 'PENDING_APPROVAL'
        | 'APPROVED'
        | 'REJECTED'
        | 'ESCALATED'
        | 'SENT'
        | 'FAILED'
        | 'INVALIDATED',
      expiresAt: data.expiresAt as Date,
      statusHistory: [],
      createdAt: data.createdAt as Date,
      updatedAt: data.updatedAt as Date,
      escalationCount: data.escalationCount as number,
    });
  };

  describe('findById', () => {
    it('should return draft when found', async () => {
      const mockData = createMockDraftData();
      vi.mocked(mockPrisma.autoResponseDraft.findUnique).mockResolvedValue(mockData as never);

      const result = await repository.findById(AutoResponseDraftId.create(DRAFT_ID_1), 'tenant-1');

      expect(result).not.toBeNull();
      expect(result!.id.toString()).toBe(DRAFT_ID_1);
      expect(result!.tenantId).toBe('tenant-1');
      expect(mockPrisma.autoResponseDraft.findUnique).toHaveBeenCalledWith({
        where: {
          id: DRAFT_ID_1,
          tenantId: 'tenant-1',
        },
      });
    });

    it('should return null when not found', async () => {
      vi.mocked(mockPrisma.autoResponseDraft.findUnique).mockResolvedValue(null);

      const result = await repository.findById(
        AutoResponseDraftId.create(NON_EXISTENT_ID),
        'tenant-1'
      );

      expect(result).toBeNull();
    });

    it('should rehydrate domain aggregate correctly', async () => {
      const mockData = createMockDraftData({
        status: 'PENDING_APPROVAL',
        statusHistory: JSON.stringify([
          { status: 'DRAFT', changedAt: new Date().toISOString() },
          { status: 'PENDING_APPROVAL', changedAt: new Date().toISOString(), changedBy: 'user-1' },
        ]),
      });
      vi.mocked(mockPrisma.autoResponseDraft.findUnique).mockResolvedValue(mockData as never);

      const result = await repository.findById(AutoResponseDraftId.create(DRAFT_ID_1), 'tenant-1');

      expect(result!.status).toBe('PENDING_APPROVAL');
      expect(result!.statusHistory).toHaveLength(2);
    });
  });

  describe('find', () => {
    it('should filter by status and tenantId', async () => {
      const mockData = [createMockDraftData({ status: 'PENDING_APPROVAL' })];
      vi.mocked(mockPrisma.autoResponseDraft.findMany).mockResolvedValue(mockData as never);

      const result = await repository.find({
        tenantId: 'tenant-1',
        status: 'PENDING_APPROVAL',
      });

      expect(result).toHaveLength(1);
      expect(mockPrisma.autoResponseDraft.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 'tenant-1',
            status: 'PENDING_APPROVAL',
          }),
        })
      );
    });

    it('should return empty array when no matches', async () => {
      vi.mocked(mockPrisma.autoResponseDraft.findMany).mockResolvedValue([]);

      const result = await repository.find({
        tenantId: 'tenant-1',
        status: 'SENT',
      });

      expect(result).toHaveLength(0);
    });

    it('should support multiple statuses', async () => {
      const mockData = [
        createMockDraftData({ status: 'PENDING_APPROVAL' }),
        createMockDraftData({ id: DRAFT_ID_2, status: 'ESCALATED' }),
      ];
      vi.mocked(mockPrisma.autoResponseDraft.findMany).mockResolvedValue(mockData as never);

      const result = await repository.find({
        tenantId: 'tenant-1',
        status: ['PENDING_APPROVAL', 'ESCALATED'],
      });

      expect(result).toHaveLength(2);
    });
  });

  describe('findPendingForApprover', () => {
    it('should return drafts with PENDING_APPROVAL status', async () => {
      const mockData = [createMockDraftData({ status: 'PENDING_APPROVAL' })];
      vi.mocked(mockPrisma.autoResponseDraft.findMany).mockResolvedValue(mockData as never);

      const result = await repository.findPendingForApprover('approver-1', 'tenant-1');

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('PENDING_APPROVAL');
    });

    it('should filter by tenantId for isolation', async () => {
      vi.mocked(mockPrisma.autoResponseDraft.findMany).mockResolvedValue([]);

      await repository.findPendingForApprover('approver-1', 'tenant-1');

      expect(mockPrisma.autoResponseDraft.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 'tenant-1',
            status: 'PENDING_APPROVAL',
          }),
        })
      );
    });
  });

  describe('save', () => {
    it('should persist new draft', async () => {
      const draft = createMockDraft();
      vi.mocked(mockPrisma.autoResponseDraft.findUnique).mockResolvedValue(null);
      vi.mocked(mockPrisma.autoResponseDraft.create).mockResolvedValue(
        createMockDraftData() as never
      );

      await repository.save(draft);

      expect(mockPrisma.autoResponseDraft.create).toHaveBeenCalled();
    });

    it('should update existing draft', async () => {
      const draft = createMockDraft();
      // Increment version to simulate an update
      draft.incrementVersion();

      vi.mocked(mockPrisma.autoResponseDraft.findUnique).mockResolvedValue(
        createMockDraftData({ version: 0 }) as never
      );
      vi.mocked(mockPrisma.autoResponseDraft.updateMany).mockResolvedValue({ count: 1 } as never);

      await repository.save(draft);

      expect(mockPrisma.autoResponseDraft.updateMany).toHaveBeenCalled();
    });

    it('should increment version on update', async () => {
      const draft = createMockDraft();
      draft.incrementVersion();

      vi.mocked(mockPrisma.autoResponseDraft.findUnique).mockResolvedValue(
        createMockDraftData({ version: 0 }) as never
      );
      vi.mocked(mockPrisma.autoResponseDraft.updateMany).mockResolvedValue({ count: 1 } as never);

      await repository.save(draft);

      expect(mockPrisma.autoResponseDraft.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            version: 0, // Previous version in WHERE clause
          }),
          data: expect.objectContaining({
            version: 1, // New version in data
          }),
        })
      );
    });

    it('should throw OptimisticLockError on version conflict', async () => {
      const draft = createMockDraft();
      draft.incrementVersion();

      vi.mocked(mockPrisma.autoResponseDraft.findUnique).mockResolvedValue(
        createMockDraftData({ version: 0 }) as never
      );
      vi.mocked(mockPrisma.autoResponseDraft.updateMany).mockResolvedValue({ count: 0 } as never);

      await expect(repository.save(draft)).rejects.toThrow(OptimisticLockError);
    });
  });

  describe('optimistic locking', () => {
    it('should detect concurrent modifications', async () => {
      const draft = createMockDraft();
      draft.incrementVersion();
      draft.incrementVersion();

      vi.mocked(mockPrisma.autoResponseDraft.findUnique).mockResolvedValue(
        createMockDraftData({ version: 1 }) as never
      );
      vi.mocked(mockPrisma.autoResponseDraft.updateMany).mockResolvedValue({ count: 0 } as never);

      await expect(repository.save(draft)).rejects.toThrow(OptimisticLockError);
    });

    it('should include version in WHERE clause', async () => {
      const draft = createMockDraft();
      draft.incrementVersion();
      draft.incrementVersion();
      draft.incrementVersion();

      vi.mocked(mockPrisma.autoResponseDraft.findUnique).mockResolvedValue(
        createMockDraftData({ version: 2 }) as never
      );
      vi.mocked(mockPrisma.autoResponseDraft.updateMany).mockResolvedValue({ count: 1 } as never);

      await repository.save(draft);

      expect(mockPrisma.autoResponseDraft.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: draft.id.toString(),
            version: 2,
          }),
        })
      );
    });
  });

  describe('findActiveByLeadAndTrigger', () => {
    it('should find active draft for lead and trigger type', async () => {
      const mockData = createMockDraftData({ status: 'PENDING_APPROVAL' });
      vi.mocked(mockPrisma.autoResponseDraft.findFirst).mockResolvedValue(mockData as never);

      const result = await repository.findActiveByLeadAndTrigger(
        'lead-123',
        'EMAIL_RECEIVED',
        'tenant-1'
      );

      expect(result).not.toBeNull();
      expect(mockPrisma.autoResponseDraft.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            leadId: 'lead-123',
            triggerType: 'EMAIL_RECEIVED',
            tenantId: 'tenant-1',
            status: {
              in: ['DRAFT', 'PENDING_APPROVAL', 'ESCALATED'],
            },
          }),
        })
      );
    });

    it('should return null when no active draft exists', async () => {
      vi.mocked(mockPrisma.autoResponseDraft.findFirst).mockResolvedValue(null);

      const result = await repository.findActiveByLeadAndTrigger(
        'lead-123',
        'FORM_SUBMIT',
        'tenant-1'
      );

      expect(result).toBeNull();
    });
  });

  describe('findPendingByLeadId', () => {
    it('should find all pending drafts for a lead', async () => {
      const mockData = [
        createMockDraftData({ status: 'DRAFT' }),
        createMockDraftData({ id: DRAFT_ID_2, status: 'PENDING_APPROVAL' }),
      ];
      vi.mocked(mockPrisma.autoResponseDraft.findMany).mockResolvedValue(mockData as never);

      const result = await repository.findPendingByLeadId('lead-123', 'tenant-1');

      expect(result).toHaveLength(2);
      expect(mockPrisma.autoResponseDraft.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            leadId: 'lead-123',
            tenantId: 'tenant-1',
            status: {
              in: ['DRAFT', 'PENDING_APPROVAL', 'ESCALATED'],
            },
          }),
        })
      );
    });
  });

  describe('findExpired', () => {
    it('should find expired drafts', async () => {
      const expiredData = createMockDraftData({
        expiresAt: new Date(Date.now() - 1000),
        status: 'PENDING_APPROVAL',
      });
      vi.mocked(mockPrisma.autoResponseDraft.findMany).mockResolvedValue([expiredData] as never);

      const result = await repository.findExpired('tenant-1');

      expect(result).toHaveLength(1);
      expect(mockPrisma.autoResponseDraft.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 'tenant-1',
            expiresAt: {
              lt: expect.any(Date),
            },
            status: {
              notIn: ['SENT', 'FAILED', 'INVALIDATED'],
            },
          }),
        })
      );
    });
  });

  describe('delete', () => {
    it('should delete draft by id and tenantId', async () => {
      vi.mocked(mockPrisma.autoResponseDraft.delete).mockResolvedValue(
        createMockDraftData() as never
      );

      await repository.delete(AutoResponseDraftId.create(DRAFT_ID_1), 'tenant-1');

      expect(mockPrisma.autoResponseDraft.delete).toHaveBeenCalledWith({
        where: {
          id: DRAFT_ID_1,
          tenantId: 'tenant-1',
        },
      });
    });
  });

  describe('countByStatus', () => {
    it('should count drafts by status and tenantId', async () => {
      vi.mocked(mockPrisma.autoResponseDraft.count).mockResolvedValue(5);

      const result = await repository.countByStatus('tenant-1', 'PENDING_APPROVAL');

      expect(result).toBe(5);
      expect(mockPrisma.autoResponseDraft.count).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-1',
          status: 'PENDING_APPROVAL',
        },
      });
    });
  });
});
