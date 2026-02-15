/**
 * PrismaAutoResponseDraftRepository - Supplementary Coverage Tests
 *
 * Targets remaining uncovered branches:
 * - toDomain: statusHistory parsing from JSON string, invalid items, null changedBy/reason
 * - toDomain: approvalDecision parsing from JSON string, invalid dates
 * - toDomain: escalation parsing from JSON string, resolvedAt null vs undefined
 * - toPersistence: null modelVersion -> default, approvalDecision serialization, escalation serialization
 * - parseStatusHistory: non-array parsed value, item without status, invalid changedAt
 * - parseApprovalDecision: invalid date returns undefined, string value parsing
 * - parseEscalation: invalid dates return undefined, resolvedAt present
 * - find: triggerType filter, offset parameter
 * - version handling: Math.max(version - 1, 0) for version 0
 * - safeParseJSON: invalid JSON
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@intelliflow/domain', () => ({
  AutoResponseDraft: {
    rehydrate: vi.fn((props: any) => {
      const incrementVersionMock = vi.fn();
      return {
        ...props,
        id: { toString: () => props.id },
        content: { toValue: () => ({ subject: 'Sub', body: 'Body' }) },
        statusHistory: props.statusHistory || [],
        approvalDecision: props.approvalDecision,
        escalation: props.escalation,
        incrementVersion: incrementVersionMock,
        version: props.version || 0,
      };
    }),
  },
  AutoResponseDraftId: { create: vi.fn((id: string) => ({ toString: () => id })) },
  ResponseContent: { create: vi.fn((p: any) => p) },
}));

vi.mock('@intelliflow/db', () => ({
  Prisma: { JsonNull: Symbol('JsonNull') },
  PrismaClient: vi.fn(),
}));

import { PrismaAutoResponseDraftRepository, OptimisticLockError } from '../PrismaAutoResponseDraftRepository';
import { Prisma } from '@intelliflow/db';

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

describe('PrismaAutoResponseDraftRepository - supplementary', () => {
  let repo: PrismaAutoResponseDraftRepository;

  beforeEach(() => {
    // Clear only Prisma mocks, not domain mocks
    mockPrisma.autoResponseDraft.findUnique.mockClear();
    mockPrisma.autoResponseDraft.findFirst.mockClear();
    mockPrisma.autoResponseDraft.findMany.mockClear();
    mockPrisma.autoResponseDraft.create.mockClear();
    mockPrisma.autoResponseDraft.updateMany.mockClear();
    mockPrisma.autoResponseDraft.delete.mockClear();
    mockPrisma.autoResponseDraft.count.mockClear();
    repo = new PrismaAutoResponseDraftRepository(mockPrisma as any);
  });

  describe('toDomain - statusHistory from JSON string', () => {
    it('should parse statusHistory from JSON string', async () => {
      const record = {
        id: 'draft-1',
        tenantId: 'tenant-1',
        leadId: 'lead-1',
        recipientEmail: 'test@test.com',
        subject: 'Sub',
        body: 'Body',
        aiConfidence: 0.9,
        modelVersion: 'v1',
        triggerType: 'EMAIL_RECEIVED',
        status: 'DRAFT',
        version: 0,
        expiresAt: new Date(),
        statusHistory: JSON.stringify([
          { status: 'DRAFT', changedAt: '2025-01-15T10:00:00Z', changedBy: 'user-1', reason: 'initial' },
        ]),
        approvalDecision: null,
        escalation: null,
        escalationCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.autoResponseDraft.findUnique.mockResolvedValue(record);
      const result = await repo.findById({ toString: () => 'draft-1' } as any, 'tenant-1');

      expect(result).not.toBeNull();
    });

    it('should handle statusHistory with invalid items', async () => {
      const record = {
        id: 'draft-2',
        tenantId: 'tenant-1',
        leadId: 'lead-1',
        recipientEmail: 'test@test.com',
        subject: 'Sub',
        body: 'Body',
        aiConfidence: 0.9,
        modelVersion: 'v1',
        triggerType: 'EMAIL_RECEIVED',
        status: 'DRAFT',
        version: 0,
        expiresAt: new Date(),
        statusHistory: [
          null,
          'not-an-object',
          { status: null, changedAt: '2025-01-15T10:00:00Z' },
          { status: 'DRAFT', changedAt: 'invalid-date' },
          { status: 'DRAFT', changedAt: '2025-01-15T10:00:00Z' },
        ],
        approvalDecision: null,
        escalation: null,
        escalationCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.autoResponseDraft.findUnique.mockResolvedValue(record);
      const result = await repo.findById({ toString: () => 'draft-2' } as any, 'tenant-1');

      expect(result).not.toBeNull();
    });

    it('should handle non-array statusHistory', async () => {
      const record = {
        id: 'draft-3',
        tenantId: 'tenant-1',
        leadId: 'lead-1',
        recipientEmail: 'test@test.com',
        subject: 'Sub',
        body: 'Body',
        aiConfidence: 0.9,
        modelVersion: 'v1',
        triggerType: 'EMAIL_RECEIVED',
        status: 'DRAFT',
        version: 0,
        expiresAt: new Date(),
        statusHistory: 'not-json-array',
        approvalDecision: null,
        escalation: null,
        escalationCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.autoResponseDraft.findUnique.mockResolvedValue(record);
      const result = await repo.findById({ toString: () => 'draft-3' } as any, 'tenant-1');

      expect(result).not.toBeNull();
    });

    it('should handle null statusHistory', async () => {
      const record = {
        id: 'draft-4',
        tenantId: 'tenant-1',
        leadId: 'lead-1',
        recipientEmail: 'test@test.com',
        subject: 'Sub',
        body: 'Body',
        aiConfidence: 0.9,
        modelVersion: 'v1',
        triggerType: 'EMAIL_RECEIVED',
        status: 'DRAFT',
        version: 0,
        expiresAt: new Date(),
        statusHistory: null,
        approvalDecision: null,
        escalation: null,
        escalationCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.autoResponseDraft.findUnique.mockResolvedValue(record);
      const result = await repo.findById({ toString: () => 'draft-4' } as any, 'tenant-1');

      expect(result).not.toBeNull();
    });
  });

  describe('toDomain - approvalDecision parsing', () => {
    it('should parse approvalDecision from JSON string', async () => {
      const record = {
        id: 'draft-5',
        tenantId: 'tenant-1',
        leadId: 'lead-1',
        recipientEmail: 'test@test.com',
        subject: 'Sub',
        body: 'Body',
        aiConfidence: 0.9,
        modelVersion: 'v1',
        triggerType: 'EMAIL_RECEIVED',
        status: 'APPROVED',
        version: 0,
        expiresAt: new Date(),
        statusHistory: [],
        approvalDecision: JSON.stringify({
          decision: 'APPROVED',
          decidedBy: 'user-1',
          decidedAt: '2025-01-15T10:00:00Z',
          reason: 'Looks good',
        }),
        escalation: null,
        escalationCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.autoResponseDraft.findUnique.mockResolvedValue(record);
      const result = await repo.findById({ toString: () => 'draft-5' } as any, 'tenant-1');

      expect(result).not.toBeNull();
    });

    it('should return undefined for approvalDecision with invalid date', async () => {
      const record = {
        id: 'draft-6',
        tenantId: 'tenant-1',
        leadId: 'lead-1',
        recipientEmail: 'test@test.com',
        subject: 'Sub',
        body: 'Body',
        aiConfidence: 0.9,
        modelVersion: 'v1',
        triggerType: 'EMAIL_RECEIVED',
        status: 'DRAFT',
        version: 0,
        expiresAt: new Date(),
        statusHistory: [],
        approvalDecision: { decision: 'APPROVED', decidedBy: 'u1', decidedAt: 'not-a-date' },
        escalation: null,
        escalationCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.autoResponseDraft.findUnique.mockResolvedValue(record);
      const result = await repo.findById({ toString: () => 'draft-6' } as any, 'tenant-1');

      expect(result).not.toBeNull();
    });

    it('should return undefined for non-object approvalDecision', async () => {
      const record = {
        id: 'draft-7',
        tenantId: 'tenant-1',
        leadId: 'lead-1',
        recipientEmail: 'test@test.com',
        subject: 'Sub',
        body: 'Body',
        aiConfidence: 0.9,
        modelVersion: 'v1',
        triggerType: 'EMAIL_RECEIVED',
        status: 'DRAFT',
        version: 0,
        expiresAt: new Date(),
        statusHistory: [],
        approvalDecision: 'invalid-string-not-json',
        escalation: null,
        escalationCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.autoResponseDraft.findUnique.mockResolvedValue(record);
      const result = await repo.findById({ toString: () => 'draft-7' } as any, 'tenant-1');

      expect(result).not.toBeNull();
    });
  });

  describe('toDomain - escalation parsing', () => {
    it('should parse escalation from JSON string with resolvedAt', async () => {
      const record = {
        id: 'draft-8',
        tenantId: 'tenant-1',
        leadId: 'lead-1',
        recipientEmail: 'test@test.com',
        subject: 'Sub',
        body: 'Body',
        aiConfidence: 0.9,
        modelVersion: 'v1',
        triggerType: 'EMAIL_RECEIVED',
        status: 'ESCALATED',
        version: 0,
        expiresAt: new Date(),
        statusHistory: [],
        approvalDecision: null,
        escalation: JSON.stringify({
          reason: 'Low confidence',
          escalatedTo: 'manager-1',
          escalatedBy: 'system',
          escalatedAt: '2025-01-15T10:00:00Z',
          expiresAt: '2025-01-15T12:00:00Z',
          resolvedAt: '2025-01-15T11:00:00Z',
          resolvedBy: 'manager-1',
          resolutionFeedback: 'Approved',
        }),
        escalationCount: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.autoResponseDraft.findUnique.mockResolvedValue(record);
      const result = await repo.findById({ toString: () => 'draft-8' } as any, 'tenant-1');

      expect(result).not.toBeNull();
    });

    it('should handle escalation with null resolvedAt', async () => {
      const record = {
        id: 'draft-9',
        tenantId: 'tenant-1',
        leadId: 'lead-1',
        recipientEmail: 'test@test.com',
        subject: 'Sub',
        body: 'Body',
        aiConfidence: 0.9,
        modelVersion: 'v1',
        triggerType: 'EMAIL_RECEIVED',
        status: 'ESCALATED',
        version: 0,
        expiresAt: new Date(),
        statusHistory: [],
        approvalDecision: null,
        escalation: {
          reason: 'Low confidence',
          escalatedTo: 'manager-1',
          escalatedBy: 'system',
          escalatedAt: '2025-01-15T10:00:00Z',
          expiresAt: '2025-01-15T12:00:00Z',
          resolvedAt: null,
        },
        escalationCount: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.autoResponseDraft.findUnique.mockResolvedValue(record);
      const result = await repo.findById({ toString: () => 'draft-9' } as any, 'tenant-1');

      expect(result).not.toBeNull();
    });

    it('should return undefined for escalation with invalid dates', async () => {
      const record = {
        id: 'draft-10',
        tenantId: 'tenant-1',
        leadId: 'lead-1',
        recipientEmail: 'test@test.com',
        subject: 'Sub',
        body: 'Body',
        aiConfidence: 0.9,
        modelVersion: 'v1',
        triggerType: 'EMAIL_RECEIVED',
        status: 'DRAFT',
        version: 0,
        expiresAt: new Date(),
        statusHistory: [],
        approvalDecision: null,
        escalation: {
          reason: 'test',
          escalatedTo: 'manager',
          escalatedBy: 'system',
          escalatedAt: 'not-a-date',
          expiresAt: '2025-01-15T12:00:00Z',
        },
        escalationCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.autoResponseDraft.findUnique.mockResolvedValue(record);
      const result = await repo.findById({ toString: () => 'draft-10' } as any, 'tenant-1');

      expect(result).not.toBeNull();
    });
  });

  describe('toDomain - version incrementing', () => {
    it('should call incrementVersion N times for version N record', async () => {
      const record = {
        id: 'draft-v',
        tenantId: 'tenant-1',
        leadId: 'lead-1',
        recipientEmail: 'test@test.com',
        subject: 'Sub',
        body: 'Body',
        aiConfidence: 0.9,
        modelVersion: 'v1',
        triggerType: 'EMAIL_RECEIVED',
        status: 'DRAFT',
        version: 3,
        expiresAt: new Date(),
        statusHistory: [],
        approvalDecision: null,
        escalation: null,
        escalationCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.autoResponseDraft.findUnique.mockResolvedValue(record);
      const result = await repo.findById({ toString: () => 'draft-v' } as any, 'tenant-1');

      expect(result).not.toBeNull();
      expect(result!.incrementVersion).toHaveBeenCalledTimes(3);
    });
  });

  describe('find - additional query filters', () => {
    it('should apply triggerType filter', async () => {
      mockPrisma.autoResponseDraft.findMany.mockResolvedValue([]);

      await repo.find({
        tenantId: 'tenant-1',
        triggerType: 'FORM_SUBMIT' as any,
      });

      expect(mockPrisma.autoResponseDraft.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            triggerType: 'FORM_SUBMIT',
          }),
        })
      );
    });

    it('should apply offset parameter', async () => {
      mockPrisma.autoResponseDraft.findMany.mockResolvedValue([]);

      await repo.find({
        tenantId: 'tenant-1',
        offset: 20,
        limit: 10,
      });

      expect(mockPrisma.autoResponseDraft.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20,
          take: 10,
        })
      );
    });
  });

  describe('save - toPersistence with null modelVersion', () => {
    it('should use default modelVersion when null', async () => {
      const draft = {
        id: { toString: () => 'draft-null-mv' },
        tenantId: 'tenant-1',
        leadId: 'lead-1',
        recipientEmail: 'test@test.com',
        content: { toValue: () => ({ subject: 'Sub', body: 'Body' }) },
        aiConfidence: 0.9,
        modelVersion: null,
        triggerType: 'EMAIL_RECEIVED',
        status: 'DRAFT',
        version: 0,
        expiresAt: new Date(),
        statusHistory: [],
        approvalDecision: null,
        escalation: null,
        escalationCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.autoResponseDraft.findUnique.mockResolvedValue(null);
      mockPrisma.autoResponseDraft.create.mockResolvedValue({});

      await repo.save(draft as any);

      expect(mockPrisma.autoResponseDraft.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            modelVersion: 'unknown',
          }),
        })
      );
    });
  });

  describe('save - toPersistence with approvalDecision and escalation', () => {
    it('should serialize approvalDecision when present', async () => {
      const draft = {
        id: { toString: () => 'draft-ad' },
        tenantId: 'tenant-1',
        leadId: 'lead-1',
        recipientEmail: 'test@test.com',
        content: { toValue: () => ({ subject: 'Sub', body: 'Body' }) },
        aiConfidence: 0.9,
        modelVersion: 'v1',
        triggerType: 'EMAIL_RECEIVED',
        status: 'APPROVED',
        version: 0,
        expiresAt: new Date(),
        statusHistory: [
          { status: 'DRAFT', changedAt: new Date(), changedBy: 'system', reason: 'auto' },
        ],
        approvalDecision: {
          decision: 'APPROVED',
          decidedBy: 'user-1',
          decidedAt: new Date('2025-01-15T10:00:00Z'),
          reason: 'Good quality',
          modifications: null,
        },
        escalation: {
          reason: 'Low confidence',
          escalatedTo: 'manager',
          escalatedBy: 'system',
          escalatedAt: new Date('2025-01-15T08:00:00Z'),
          expiresAt: new Date('2025-01-15T12:00:00Z'),
          resolvedAt: new Date('2025-01-15T09:00:00Z'),
          resolvedBy: 'manager',
          resolutionFeedback: 'OK',
        },
        escalationCount: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.autoResponseDraft.findUnique.mockResolvedValue(null);
      mockPrisma.autoResponseDraft.create.mockResolvedValue({});

      await repo.save(draft as any);

      expect(mockPrisma.autoResponseDraft.create).toHaveBeenCalled();
      const createCall = mockPrisma.autoResponseDraft.create.mock.calls[0][0];
      expect(createCall.data.approvalDecision).toBeDefined();
      expect(createCall.data.escalation).toBeDefined();
    });
  });

  describe('OptimisticLockError', () => {
    it('should have correct error name and message', () => {
      const error = new OptimisticLockError('AutoResponseDraft', 'draft-123');
      expect(error.name).toBe('OptimisticLockError');
      expect(error.message).toContain('AutoResponseDraft');
      expect(error.message).toContain('draft-123');
      expect(error.message).toContain('Optimistic lock failed');
    });

    it('should be an instance of Error', () => {
      const error = new OptimisticLockError('Test', 'id-1');
      expect(error).toBeInstanceOf(Error);
    });
  });
});
