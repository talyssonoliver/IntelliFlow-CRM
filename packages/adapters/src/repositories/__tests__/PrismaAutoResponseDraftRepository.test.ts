import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PrismaClient } from '@intelliflow/db';
import {
  PrismaAutoResponseDraftRepository,
  OptimisticLockError,
} from '../PrismaAutoResponseDraftRepository';
import { AutoResponseDraft, AutoResponseDraftId, ResponseContent } from '@intelliflow/domain';
import { randomUUID } from 'node:crypto';

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
    groupBy: vi.fn(),
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

  describe('findPendingOlderThan (PG-198)', () => {
    it('returns un-escalated, unexpired pending drafts of the given triggers, oldest first', async () => {
      const before = new Date('2026-10-13T10:00:00Z');
      const now = new Date('2026-10-13T12:00:00Z');
      vi.mocked(mockPrisma.autoResponseDraft.findMany).mockResolvedValue([
        createMockDraftData({ status: 'PENDING_APPROVAL' }),
      ] as never);

      const result = await repository.findPendingOlderThan(
        'tenant-1',
        { before, notExpiredAt: now, triggerTypes: ['EMAIL_RECEIVED', 'MANUAL'] },
        25
      );

      expect(mockPrisma.autoResponseDraft.findMany).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-1',
          status: 'PENDING_APPROVAL',
          escalationCount: 0,
          triggerType: { in: ['EMAIL_RECEIVED', 'MANUAL'] },
          expiresAt: { gt: now },
          createdAt: { lt: before },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 25,
      });
      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('PENDING_APPROVAL');
    });

    it('pages with a (createdAt, id) keyset cursor', async () => {
      vi.mocked(mockPrisma.autoResponseDraft.findMany).mockResolvedValue([]);
      const cursorAt = new Date('2026-10-13T09:00:00Z');
      await repository.findPendingOlderThan(
        'tenant-1',
        {
          before: new Date(),
          notExpiredAt: new Date(),
          triggerTypes: ['MANUAL'],
          after: { createdAt: cursorAt, id: 'draft-9' },
        },
        100
      );
      const call = vi.mocked(mockPrisma.autoResponseDraft.findMany).mock.calls[0]![0] as any;
      expect(call.where.OR).toEqual([
        { createdAt: { gt: cursorAt } },
        { createdAt: cursorAt, id: { gt: 'draft-9' } },
      ]);
      expect(call.take).toBe(100);
      expect(call).not.toHaveProperty('skip');
    });
  });

  describe('saveEscalation (PG-198)', () => {
    function escalatedDraft() {
      const draft = AutoResponseDraft.create({
        tenantId: 'tenant-1',
        leadId: 'lead-123',
        leadTenantId: 'tenant-1',
        leadStatus: 'NEW',
        triggerType: 'EMAIL_RECEIVED',
        content: ResponseContent.create({ subject: 'Hi', body: 'Body' }),
        aiConfidence: 0.5,
        modelVersion: 'm',
        recipientEmail: 'test@example.com',
      }).value;
      draft.submitForApproval('approver-1');
      draft.escalate('system:approval-policy', 'manager-1', 'SLA', 1);
      return draft;
    }

    it('writes only while the stored draft is still pending and never escalated', async () => {
      vi.mocked(mockPrisma.autoResponseDraft.updateMany).mockResolvedValue({ count: 1 } as never);
      const draft = escalatedDraft();

      await expect(repository.saveEscalation(draft)).resolves.toBe(true);

      const call = vi.mocked(mockPrisma.autoResponseDraft.updateMany).mock.calls[0]![0] as any;
      expect(call.where).toEqual({
        id: draft.id.toString(),
        tenantId: 'tenant-1',
        status: 'PENDING_APPROVAL',
        escalationCount: 0,
        version: 0,
      });
      expect(call.data).toMatchObject({ status: 'ESCALATED', escalationCount: 1, version: 1 });
      expect(Object.keys(call.data).sort()).toEqual(
        ['escalation', 'escalationCount', 'status', 'statusHistory', 'updatedAt', 'version'].sort()
      );
      // A reviewer still holding the version-0 copy is now rejected by save().
      expect(draft.version).toBe(1);
    });

    it('reports false (nothing written) when a decision landed meanwhile', async () => {
      vi.mocked(mockPrisma.autoResponseDraft.updateMany).mockResolvedValue({ count: 0 } as never);
      await expect(repository.saveEscalation(escalatedDraft())).resolves.toBe(false);
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

  describe('findPendingForApprover (#857)', () => {
    const submittedTo = (approverId: string | undefined, id: string) =>
      createMockDraftData({
        id,
        status: 'PENDING_APPROVAL',
        statusHistory: JSON.stringify([
          { status: 'DRAFT', changedAt: new Date().toISOString() },
          {
            status: 'PENDING_APPROVAL',
            changedAt: new Date().toISOString(),
            ...(approverId ? { changedBy: approverId } : {}),
          },
        ]),
      });

    it('does not return a draft assigned to another approver', async () => {
      vi.mocked(mockPrisma.autoResponseDraft.findMany).mockResolvedValue([
        submittedTo('approver-a', DRAFT_ID_1),
      ] as never);

      const forB = await repository.findPendingForApprover('approver-b', 'tenant-1');
      const forA = await repository.findPendingForApprover('approver-a', 'tenant-1');

      expect(forB).toHaveLength(0);
      expect(forA).toHaveLength(1);
    });

    it('returns only the own drafts of the approver from a mixed queue', async () => {
      vi.mocked(mockPrisma.autoResponseDraft.findMany).mockResolvedValue([
        submittedTo('approver-a', DRAFT_ID_1),
        submittedTo('approver-b', DRAFT_ID_2),
      ] as never);

      const forB = await repository.findPendingForApprover('approver-b', 'tenant-1');

      expect(forB.map((d) => d.id.toString())).toEqual([DRAFT_ID_2]);
    });

    it('keeps a draft that names no approver visible to everyone', async () => {
      vi.mocked(mockPrisma.autoResponseDraft.findMany).mockResolvedValue([
        submittedTo(undefined, DRAFT_ID_1),
      ] as never);

      const result = await repository.findPendingForApprover('approver-b', 'tenant-1');

      expect(result).toHaveLength(1);
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

    it('should increment version on update (#874)', async () => {
      // Loaded at version 0 (as rehydrated by toDomain); nothing pre-increments.
      const draft = createMockDraft();

      vi.mocked(mockPrisma.autoResponseDraft.findUnique).mockResolvedValue(
        createMockDraftData({ version: 0 }) as never
      );
      vi.mocked(mockPrisma.autoResponseDraft.updateMany).mockResolvedValue({ count: 1 } as never);

      await repository.save(draft);

      expect(mockPrisma.autoResponseDraft.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            version: 0, // The version this copy was loaded at
          }),
          data: expect.objectContaining({
            version: 1, // Advanced
          }),
        })
      );
      // The in-memory aggregate follows, so a second save in the same request works.
      expect(draft.version).toBe(1);
    });

    it('rejects a stale copy after another writer advanced the version (#874)', async () => {
      const mine = createMockDraft();
      vi.mocked(mockPrisma.autoResponseDraft.findUnique).mockResolvedValue(
        createMockDraftData({ version: 1 }) as never
      );
      // Stored is now at version 1; this copy was loaded at 0 -> no row matches.
      vi.mocked(mockPrisma.autoResponseDraft.updateMany).mockResolvedValue({ count: 0 } as never);

      await expect(repository.save(mine)).rejects.toThrow(OptimisticLockError);
      expect(mine.version).toBe(0);
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
            version: 3,
          }),
          data: expect.objectContaining({ version: 4 }),
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

  describe('expireDraftsBeforeDate', () => {
    it('should update non-terminal drafts before the cutoff date', async () => {
      vi.mocked(mockPrisma.autoResponseDraft.updateMany).mockResolvedValue({ count: 3 } as never);

      const before = new Date('2025-01-02T00:00:00Z');
      const terminalStatuses = ['SENT', 'FAILED', 'INVALIDATED'] as const;

      const result = await repository.expireDraftsBeforeDate('tenant-1', before, [
        ...terminalStatuses,
      ]);

      expect(result).toBe(3);
      expect(mockPrisma.autoResponseDraft.updateMany).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-1',
          expiresAt: { lt: before },
          status: { notIn: terminalStatuses },
        },
        data: { status: 'INVALIDATED' },
      });
    });

    it('should return 0 when no drafts match', async () => {
      vi.mocked(mockPrisma.autoResponseDraft.updateMany).mockResolvedValue({ count: 0 } as never);

      const result = await repository.expireDraftsBeforeDate('tenant-1', new Date(), [
        'SENT',
        'FAILED',
        'INVALIDATED',
      ]);

      expect(result).toBe(0);
    });
  });

  describe('countByStatusAll', () => {
    it('should return counts for all statuses from a single groupBy call', async () => {
      vi.mocked((mockPrisma.autoResponseDraft as any).groupBy).mockResolvedValue([
        { status: 'DRAFT', _count: 5 },
        { status: 'PENDING_APPROVAL', _count: 3 },
        { status: 'APPROVED', _count: 10 },
      ] as never);

      const result = await repository.countByStatusAll('tenant-1');

      expect(result.DRAFT).toBe(5);
      expect(result.PENDING_APPROVAL).toBe(3);
      expect(result.APPROVED).toBe(10);
      // Statuses not in groupBy result should default to 0
      expect(result.REJECTED).toBe(0);
      expect(result.ESCALATED).toBe(0);
      expect(result.SENT).toBe(0);
      expect(result.FAILED).toBe(0);
      expect(result.INVALIDATED).toBe(0);
    });

    it('should issue exactly one groupBy query', async () => {
      vi.mocked((mockPrisma.autoResponseDraft as any).groupBy).mockResolvedValue([] as never);

      await repository.countByStatusAll('tenant-1');

      expect((mockPrisma.autoResponseDraft as any).groupBy).toHaveBeenCalledTimes(1);
      expect((mockPrisma.autoResponseDraft as any).groupBy).toHaveBeenCalledWith({
        by: ['status'],
        where: { tenantId: 'tenant-1' },
        _count: true,
      });
      // Must NOT call count() — that would be the N+1 pattern
      expect(mockPrisma.autoResponseDraft.count).not.toHaveBeenCalled();
    });

    it('should return all 8 statuses defaulting to 0 when no data', async () => {
      vi.mocked((mockPrisma.autoResponseDraft as any).groupBy).mockResolvedValue([] as never);

      const result = await repository.countByStatusAll('tenant-1');

      const expected = [
        'DRAFT',
        'PENDING_APPROVAL',
        'APPROVED',
        'REJECTED',
        'INVALIDATED',
        'SENT',
        'FAILED',
        'ESCALATED',
      ];
      for (const status of expected) {
        expect(result[status as keyof typeof result]).toBe(0);
      }
    });
  });
});
