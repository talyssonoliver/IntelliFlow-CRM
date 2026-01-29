/**
 * Documents Router Caller Tests
 *
 * Tests that actually invoke the router procedures through createCaller
 * to achieve real code coverage for case documents.
 *
 * Note: This router uses domain models and repository pattern,
 * so we mock both the repository and domain model.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { documentsRouter } from '../documents.router';
import { prismaMock, createTestContext, createAdminContext, TEST_UUIDS } from '../../../test/setup';

// Use vi.hoisted to ensure mocks are defined before hoisting
const { mockRepo, mockDocumentInstance, mockDocumentJson } = vi.hoisted(() => {
  const mockDocumentJson = {
    id: '00000000-0000-4000-8000-000000000001',
    tenantId: '00000000-0000-4000-8000-000000000002',
    metadata: {
      title: 'Test Document',
      description: 'Test Description',
      documentType: 'CONTRACT',
      classification: 'INTERNAL',
      tags: ['test'],
    },
    storageKey: 'docs/test.pdf',
    contentHash: 'a'.repeat(64),
    mimeType: 'application/pdf',
    sizeBytes: 1024,
    status: 'DRAFT',
    isDeleted: false,
    createdBy: '00000000-0000-4000-8000-000000000002',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockDocumentInstance = {
    toJSON: vi.fn(() => mockDocumentJson),
    grantAccess: vi.fn(),
    revokeAccess: vi.fn(),
    hasAccess: vi.fn(() => true),
    submitForReview: vi.fn(),
    approve: vi.fn(),
    sign: vi.fn(),
    archive: vi.fn(),
    placeLegalHold: vi.fn(),
    releaseLegalHold: vi.fn(),
    delete: vi.fn(),
    createMajorVersion: vi.fn(),
    createMinorVersion: vi.fn(),
    createPatchVersion: vi.fn(),
    isDeleted: false,
    status: 'DRAFT',
    metadata: mockDocumentJson.metadata,
  };

  const mockRepo = {
    save: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn().mockResolvedValue(mockDocumentInstance),
    findByCaseId: vi.fn().mockResolvedValue([mockDocumentInstance]),
    findAccessibleByUser: vi.fn().mockResolvedValue([mockDocumentInstance]),
  };

  return { mockRepo, mockDocumentInstance, mockDocumentJson };
});

// Mock the domain and adapter modules
vi.mock('@intelliflow/domain', () => ({
  CaseDocument: {
    create: vi.fn(() => mockDocumentInstance),
  },
  AccessLevel: {
    NONE: 'NONE',
    VIEW: 'VIEW',
    COMMENT: 'COMMENT',
    EDIT: 'EDIT',
    ADMIN: 'ADMIN',
  },
  DocumentClassification: {
    PUBLIC: 'PUBLIC',
    INTERNAL: 'INTERNAL',
    CONFIDENTIAL: 'CONFIDENTIAL',
    PRIVILEGED: 'PRIVILEGED',
  },
}));

vi.mock('@intelliflow/adapters', () => ({
  // Use a proper function constructor (not arrow function) so it works with 'new'
  PrismaCaseDocumentRepository: function MockPrismaCaseDocumentRepository() {
    return mockRepo;
  },
}));

describe('Documents Router - Caller Tests', () => {
  const now = new Date();
  const futureDate = new Date(now.getTime() + 86400000 * 365);

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock functions to default states
    mockDocumentInstance.toJSON.mockReturnValue(mockDocumentJson);
    mockDocumentInstance.hasAccess.mockReturnValue(true);
    mockDocumentInstance.isDeleted = false;
    mockDocumentInstance.status = 'DRAFT';
    mockRepo.save.mockResolvedValue(undefined);
    mockRepo.findById.mockResolvedValue(mockDocumentInstance);
    mockRepo.findByCaseId.mockResolvedValue([mockDocumentInstance]);
    mockRepo.findAccessibleByUser.mockResolvedValue([mockDocumentInstance]);
  });

  describe('create', () => {
    it('should create a document successfully', async () => {
      const ctx = createTestContext();
      const caller = documentsRouter.createCaller(ctx);

      const result = await caller.create({
        title: 'Test Document',
        documentType: 'CONTRACT',
        classification: 'INTERNAL',
        storageKey: 'docs/test.pdf',
        contentHash: 'a'.repeat(64),
        mimeType: 'application/pdf',
        sizeBytes: 1024,
      });

      expect(result).toBeDefined();
      expect(result.id).toBe(mockDocumentJson.id);
      expect(mockRepo.save).toHaveBeenCalled();
    });

    it('should create document with optional fields', async () => {
      const ctx = createTestContext();
      const caller = documentsRouter.createCaller(ctx);

      const result = await caller.create({
        title: 'Test Document',
        description: 'A test document',
        documentType: 'EVIDENCE',
        classification: 'CONFIDENTIAL',
        tags: ['tag1', 'tag2'],
        relatedCaseId: TEST_UUIDS.account1,
        storageKey: 'docs/evidence.pdf',
        contentHash: 'b'.repeat(64),
        mimeType: 'application/pdf',
        sizeBytes: 2048,
      });

      expect(result).toBeDefined();
    });
  });

  describe('createVersion', () => {
    it('should create a major version', async () => {
      const ctx = createTestContext();
      const caller = documentsRouter.createCaller(ctx);

      const newVersionDoc = { ...mockDocumentInstance };
      mockDocumentInstance.createMajorVersion.mockReturnValue(newVersionDoc);

      const result = await caller.createVersion({
        documentId: TEST_UUIDS.task1,
        versionType: 'major',
        storageKey: 'docs/test-v2.pdf',
        contentHash: 'c'.repeat(64),
      });

      expect(result).toBeDefined();
      expect(mockDocumentInstance.createMajorVersion).toHaveBeenCalled();
    });

    it('should create a minor version', async () => {
      const ctx = createTestContext();
      const caller = documentsRouter.createCaller(ctx);

      const newVersionDoc = { ...mockDocumentInstance };
      mockDocumentInstance.createMinorVersion.mockReturnValue(newVersionDoc);

      const result = await caller.createVersion({
        documentId: TEST_UUIDS.task1,
        versionType: 'minor',
        storageKey: 'docs/test-v2.pdf',
        contentHash: 'c'.repeat(64),
      });

      expect(result).toBeDefined();
      expect(mockDocumentInstance.createMinorVersion).toHaveBeenCalled();
    });

    it('should create a patch version', async () => {
      const ctx = createTestContext();
      const caller = documentsRouter.createCaller(ctx);

      const newVersionDoc = { ...mockDocumentInstance };
      mockDocumentInstance.createPatchVersion.mockReturnValue(newVersionDoc);

      const result = await caller.createVersion({
        documentId: TEST_UUIDS.task1,
        versionType: 'patch',
        storageKey: 'docs/test-v2.pdf',
        contentHash: 'c'.repeat(64),
      });

      expect(result).toBeDefined();
      expect(mockDocumentInstance.createPatchVersion).toHaveBeenCalled();
    });

    it('should throw NOT_FOUND when document does not exist', async () => {
      const ctx = createTestContext();
      const caller = documentsRouter.createCaller(ctx);

      mockRepo.findById.mockResolvedValue(null);

      await expect(
        caller.createVersion({
          documentId: TEST_UUIDS.task1,
          versionType: 'major',
          storageKey: 'docs/test.pdf',
          contentHash: 'c'.repeat(64),
        }),
      ).rejects.toThrow(TRPCError);
    });

    it('should throw FORBIDDEN when user lacks edit access', async () => {
      const ctx = createTestContext();
      const caller = documentsRouter.createCaller(ctx);

      mockDocumentInstance.hasAccess.mockReturnValue(false);
      // Make sure toJSON also returns a different createdBy
      mockDocumentInstance.toJSON.mockReturnValue({
        ...mockDocumentJson,
        createdBy: 'different-user',
      });

      await expect(
        caller.createVersion({
          documentId: TEST_UUIDS.task1,
          versionType: 'major',
          storageKey: 'docs/test.pdf',
          contentHash: 'c'.repeat(64),
        }),
      ).rejects.toThrow(TRPCError);
    });
  });

  describe('getById', () => {
    it('should return a document by ID', async () => {
      const ctx = createTestContext();
      const caller = documentsRouter.createCaller(ctx);

      const result = await caller.getById({ id: TEST_UUIDS.task1 });

      expect(result).toBeDefined();
      expect(result.id).toBe(mockDocumentJson.id);
    });

    it('should throw NOT_FOUND for non-existent document', async () => {
      const ctx = createTestContext();
      const caller = documentsRouter.createCaller(ctx);

      mockRepo.findById.mockResolvedValue(null);

      await expect(caller.getById({ id: TEST_UUIDS.task1 })).rejects.toThrow(TRPCError);
    });

    it('should throw NOT_FOUND for deleted document', async () => {
      const ctx = createTestContext();
      const caller = documentsRouter.createCaller(ctx);

      mockDocumentInstance.isDeleted = true;

      await expect(caller.getById({ id: TEST_UUIDS.task1 })).rejects.toThrow(TRPCError);
    });

    it('should throw FORBIDDEN when user lacks access', async () => {
      const ctx = createTestContext();
      const caller = documentsRouter.createCaller(ctx);

      mockDocumentInstance.hasAccess.mockReturnValue(false);
      mockDocumentInstance.toJSON.mockReturnValue({
        ...mockDocumentJson,
        createdBy: 'different-user',
      });

      await expect(caller.getById({ id: TEST_UUIDS.task1 })).rejects.toThrow(TRPCError);
    });
  });

  describe('list', () => {
    it('should list documents accessible by user', async () => {
      const ctx = createTestContext();
      const caller = documentsRouter.createCaller(ctx);

      const result = await caller.list();

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should filter by case ID', async () => {
      const ctx = createTestContext();
      const caller = documentsRouter.createCaller(ctx);

      const result = await caller.list({ caseId: TEST_UUIDS.account1 });

      expect(mockRepo.findByCaseId).toHaveBeenCalledWith(TEST_UUIDS.account1);
      expect(result.data).toBeDefined();
    });

    it('should filter by status', async () => {
      const ctx = createTestContext();
      const caller = documentsRouter.createCaller(ctx);

      const result = await caller.list({ status: 'DRAFT' });

      expect(result.data).toBeDefined();
    });

    it('should filter by classification', async () => {
      const ctx = createTestContext();
      const caller = documentsRouter.createCaller(ctx);

      const result = await caller.list({ classification: 'INTERNAL' });

      expect(result.data).toBeDefined();
    });

    it('should handle pagination', async () => {
      const ctx = createTestContext();
      const caller = documentsRouter.createCaller(ctx);

      const result = await caller.list({ limit: 10, offset: 5 });

      expect(result.limit).toBe(10);
      expect(result.offset).toBe(5);
    });
  });

  describe('grantAccess', () => {
    it('should grant access to a user', async () => {
      const ctx = createTestContext();
      const caller = documentsRouter.createCaller(ctx);

      const result = await caller.grantAccess({
        documentId: TEST_UUIDS.task1,
        principalId: TEST_UUIDS.user2,
        principalType: 'USER',
        accessLevel: 'VIEW',
      });

      expect(result.success).toBe(true);
      expect(mockDocumentInstance.grantAccess).toHaveBeenCalled();
    });

    it('should grant access with expiry', async () => {
      const ctx = createTestContext();
      const caller = documentsRouter.createCaller(ctx);

      const result = await caller.grantAccess({
        documentId: TEST_UUIDS.task1,
        principalId: TEST_UUIDS.user2,
        principalType: 'USER',
        accessLevel: 'EDIT',
        expiresAt: futureDate,
      });

      expect(result.success).toBe(true);
    });

    it('should throw NOT_FOUND when document does not exist', async () => {
      const ctx = createTestContext();
      const caller = documentsRouter.createCaller(ctx);

      mockRepo.findById.mockResolvedValue(null);

      await expect(
        caller.grantAccess({
          documentId: TEST_UUIDS.task1,
          principalId: TEST_UUIDS.user2,
          principalType: 'USER',
          accessLevel: 'VIEW',
        }),
      ).rejects.toThrow(TRPCError);
    });

    it('should throw FORBIDDEN when user lacks admin access', async () => {
      const ctx = createTestContext();
      const caller = documentsRouter.createCaller(ctx);

      mockDocumentInstance.hasAccess.mockReturnValue(false);
      mockDocumentInstance.toJSON.mockReturnValue({
        ...mockDocumentJson,
        createdBy: 'different-user',
      });

      await expect(
        caller.grantAccess({
          documentId: TEST_UUIDS.task1,
          principalId: TEST_UUIDS.user2,
          principalType: 'USER',
          accessLevel: 'VIEW',
        }),
      ).rejects.toThrow(TRPCError);
    });
  });

  describe('revokeAccess', () => {
    it('should revoke access from a user', async () => {
      const ctx = createTestContext();
      const caller = documentsRouter.createCaller(ctx);

      const result = await caller.revokeAccess({
        documentId: TEST_UUIDS.task1,
        principalId: TEST_UUIDS.user2,
      });

      expect(result.success).toBe(true);
      expect(mockDocumentInstance.revokeAccess).toHaveBeenCalled();
    });

    it('should throw NOT_FOUND when document does not exist', async () => {
      const ctx = createTestContext();
      const caller = documentsRouter.createCaller(ctx);

      mockRepo.findById.mockResolvedValue(null);

      await expect(
        caller.revokeAccess({
          documentId: TEST_UUIDS.task1,
          principalId: TEST_UUIDS.user2,
        }),
      ).rejects.toThrow(TRPCError);
    });
  });

  describe('submitForReview', () => {
    it('should submit document for review', async () => {
      const ctx = createTestContext();
      const caller = documentsRouter.createCaller(ctx);

      const result = await caller.submitForReview({ documentId: TEST_UUIDS.task1 });

      expect(result.success).toBe(true);
      expect(mockDocumentInstance.submitForReview).toHaveBeenCalled();
    });

    it('should throw NOT_FOUND when document does not exist', async () => {
      const ctx = createTestContext();
      const caller = documentsRouter.createCaller(ctx);

      mockRepo.findById.mockResolvedValue(null);

      await expect(caller.submitForReview({ documentId: TEST_UUIDS.task1 })).rejects.toThrow(
        TRPCError,
      );
    });

    it('should throw BAD_REQUEST when domain throws error', async () => {
      const ctx = createTestContext();
      const caller = documentsRouter.createCaller(ctx);

      mockDocumentInstance.submitForReview.mockImplementation(() => {
        throw new Error('Document is not in DRAFT status');
      });

      await expect(caller.submitForReview({ documentId: TEST_UUIDS.task1 })).rejects.toThrow(
        TRPCError,
      );
    });
  });

  describe('approve', () => {
    it('should approve a document', async () => {
      const ctx = createTestContext();
      const caller = documentsRouter.createCaller(ctx);

      const result = await caller.approve({ documentId: TEST_UUIDS.task1 });

      expect(result.success).toBe(true);
      expect(mockDocumentInstance.approve).toHaveBeenCalled();
    });

    it('should throw NOT_FOUND when document does not exist', async () => {
      const ctx = createTestContext();
      const caller = documentsRouter.createCaller(ctx);

      mockRepo.findById.mockResolvedValue(null);

      await expect(caller.approve({ documentId: TEST_UUIDS.task1 })).rejects.toThrow(TRPCError);
    });

    it('should throw BAD_REQUEST when domain throws error', async () => {
      const ctx = createTestContext();
      const caller = documentsRouter.createCaller(ctx);

      mockDocumentInstance.approve.mockImplementation(() => {
        throw new Error('Document is not under review');
      });

      await expect(caller.approve({ documentId: TEST_UUIDS.task1 })).rejects.toThrow(TRPCError);
    });
  });

  describe('sign', () => {
    it('should sign a document', async () => {
      const ctx = createTestContext();
      const caller = documentsRouter.createCaller(ctx);

      mockDocumentInstance.toJSON.mockReturnValue({
        ...mockDocumentJson,
        eSignature: { signatureHash: 'hash123' },
      });

      const result = await caller.sign({
        documentId: TEST_UUIDS.task1,
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      });

      expect(result.success).toBe(true);
      expect(result.signatureHash).toBe('hash123');
      expect(mockDocumentInstance.sign).toHaveBeenCalled();
    });

    it('should throw NOT_FOUND when document does not exist', async () => {
      const ctx = createTestContext();
      const caller = documentsRouter.createCaller(ctx);

      mockRepo.findById.mockResolvedValue(null);

      await expect(
        caller.sign({
          documentId: TEST_UUIDS.task1,
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
        }),
      ).rejects.toThrow(TRPCError);
    });

    it('should throw BAD_REQUEST when domain throws error', async () => {
      const ctx = createTestContext();
      const caller = documentsRouter.createCaller(ctx);

      mockDocumentInstance.sign.mockImplementation(() => {
        throw new Error('Document is not approved');
      });

      await expect(
        caller.sign({
          documentId: TEST_UUIDS.task1,
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
        }),
      ).rejects.toThrow(TRPCError);
    });
  });

  describe('archive', () => {
    it('should archive a document', async () => {
      const ctx = createTestContext();
      const caller = documentsRouter.createCaller(ctx);

      const result = await caller.archive({ documentId: TEST_UUIDS.task1 });

      expect(result.success).toBe(true);
      expect(mockDocumentInstance.archive).toHaveBeenCalled();
    });

    it('should throw NOT_FOUND when document does not exist', async () => {
      const ctx = createTestContext();
      const caller = documentsRouter.createCaller(ctx);

      mockRepo.findById.mockResolvedValue(null);

      await expect(caller.archive({ documentId: TEST_UUIDS.task1 })).rejects.toThrow(TRPCError);
    });

    it('should throw BAD_REQUEST when domain throws error', async () => {
      const ctx = createTestContext();
      const caller = documentsRouter.createCaller(ctx);

      mockDocumentInstance.archive.mockImplementation(() => {
        throw new Error('Cannot archive');
      });

      await expect(caller.archive({ documentId: TEST_UUIDS.task1 })).rejects.toThrow(TRPCError);
    });
  });

  describe('placeLegalHold', () => {
    it('should place legal hold on document', async () => {
      const ctx = createAdminContext();
      const caller = documentsRouter.createCaller(ctx);

      const result = await caller.placeLegalHold({
        documentId: TEST_UUIDS.task1,
        retentionUntil: futureDate,
      });

      expect(result.success).toBe(true);
      expect(mockDocumentInstance.placeLegalHold).toHaveBeenCalled();
    });

    it('should throw FORBIDDEN when non-admin tries to place legal hold', async () => {
      const ctx = createTestContext();
      const caller = documentsRouter.createCaller(ctx);

      await expect(
        caller.placeLegalHold({
          documentId: TEST_UUIDS.task1,
          retentionUntil: futureDate,
        }),
      ).rejects.toThrow(TRPCError);
    });

    it('should throw NOT_FOUND when document does not exist', async () => {
      const ctx = createAdminContext();
      const caller = documentsRouter.createCaller(ctx);

      mockRepo.findById.mockResolvedValue(null);

      await expect(
        caller.placeLegalHold({
          documentId: TEST_UUIDS.task1,
          retentionUntil: futureDate,
        }),
      ).rejects.toThrow(TRPCError);
    });
  });

  describe('releaseLegalHold', () => {
    it('should release legal hold from document', async () => {
      const ctx = createAdminContext();
      const caller = documentsRouter.createCaller(ctx);

      const result = await caller.releaseLegalHold({ documentId: TEST_UUIDS.task1 });

      expect(result.success).toBe(true);
      expect(mockDocumentInstance.releaseLegalHold).toHaveBeenCalled();
    });

    it('should throw FORBIDDEN when non-admin tries to release legal hold', async () => {
      const ctx = createTestContext();
      const caller = documentsRouter.createCaller(ctx);

      await expect(caller.releaseLegalHold({ documentId: TEST_UUIDS.task1 })).rejects.toThrow(
        TRPCError,
      );
    });

    it('should throw NOT_FOUND when document does not exist', async () => {
      const ctx = createAdminContext();
      const caller = documentsRouter.createCaller(ctx);

      mockRepo.findById.mockResolvedValue(null);

      await expect(caller.releaseLegalHold({ documentId: TEST_UUIDS.task1 })).rejects.toThrow(
        TRPCError,
      );
    });
  });

  describe('delete', () => {
    it('should delete a document', async () => {
      const ctx = createTestContext();
      const caller = documentsRouter.createCaller(ctx);

      const result = await caller.delete({ documentId: TEST_UUIDS.task1 });

      expect(result.success).toBe(true);
      expect(mockDocumentInstance.delete).toHaveBeenCalled();
    });

    it('should throw NOT_FOUND when document does not exist', async () => {
      const ctx = createTestContext();
      const caller = documentsRouter.createCaller(ctx);

      mockRepo.findById.mockResolvedValue(null);

      await expect(caller.delete({ documentId: TEST_UUIDS.task1 })).rejects.toThrow(TRPCError);
    });

    it('should throw FORBIDDEN when document has legal hold', async () => {
      const ctx = createTestContext();
      const caller = documentsRouter.createCaller(ctx);

      mockDocumentInstance.delete.mockImplementation(() => {
        throw new Error('Cannot delete document with legal hold');
      });

      await expect(caller.delete({ documentId: TEST_UUIDS.task1 })).rejects.toThrow(TRPCError);
    });
  });

  describe('getAuditTrail', () => {
    it('should return audit trail for document', async () => {
      const ctx = createTestContext();
      const caller = documentsRouter.createCaller(ctx);

      const auditLogs = [
        {
          id: 'audit-1',
          document_id: TEST_UUIDS.task1,
          action: 'CREATED',
          user_id: TEST_UUIDS.user1,
          created_at: now,
        },
      ];

      prismaMock.caseDocumentAudit.findMany.mockResolvedValue(auditLogs as any);

      const result = await caller.getAuditTrail({ documentId: TEST_UUIDS.task1 });

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);
    });

    it('should return empty array when no audit logs', async () => {
      const ctx = createTestContext();
      const caller = documentsRouter.createCaller(ctx);

      prismaMock.caseDocumentAudit.findMany.mockResolvedValue([]);

      const result = await caller.getAuditTrail({ documentId: TEST_UUIDS.task1 });

      expect(result).toEqual([]);
    });
  });
});
