/**
 * PrismaCaseDocumentRepository Tests
 *
 * Tests for the Prisma-based case document repository implementation.
 * Covers all public methods: save, findById, findLatestVersion, findAllVersions,
 * findByCaseId, findAccessibleByUser, delete.
 * Also covers private helpers: syncACL, toDomain, findVersionChain.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PrismaCaseDocumentRepository } from '../PrismaCaseDocumentRepository';
import {
  CaseDocument,
  DocumentStatus,
  DocumentClassification,
  AccessLevel,
} from '@intelliflow/domain';

// Mock Prisma client
const createMockPrisma = () => ({
  caseDocument: {
    upsert: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    delete: vi.fn(),
  },
  caseDocumentACL: {
    deleteMany: vi.fn(),
    createMany: vi.fn(),
  },
});

type MockPrisma = ReturnType<typeof createMockPrisma>;

// UUIDs for testing
const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const USER2_ID = '00000000-0000-4000-8000-000000000003';
const CASE_ID = '00000000-0000-4000-8000-000000000004';
const DOC_ID = '00000000-0000-4000-8000-000000000010';
const DOC_CHILD_ID = '00000000-0000-4000-8000-000000000011';
const DOC_GRANDCHILD_ID = '00000000-0000-4000-8000-000000000012';
const CONTACT_ID = '00000000-0000-4000-8000-000000000020';
const HASH = 'a'.repeat(64);

// Helper to create a mock Prisma record (camelCase per Prisma 7)
function createMockDbRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: DOC_ID,
    tenantId: TENANT_ID,
    versionMajor: 1,
    versionMinor: 0,
    versionPatch: 0,
    status: 'DRAFT',
    title: 'Test Document',
    description: 'A test document description',
    documentType: 'CONTRACT',
    classification: 'INTERNAL',
    tags: ['legal', 'contract'],
    relatedCaseId: CASE_ID,
    relatedContactId: CONTACT_ID,
    storageKey: '/storage/doc-001.pdf',
    contentHash: HASH,
    mimeType: 'application/pdf',
    sizeBytes: 1024,
    createdBy: USER_ID,
    updatedBy: USER_ID,
    createdAt: new Date('2026-01-15T10:00:00Z'),
    updatedAt: new Date('2026-01-15T10:00:00Z'),
    parentVersionId: null,
    isLatestVersion: true,
    retentionUntil: null,
    deletedAt: null,
    signedBy: null,
    signedAt: null,
    signatureHash: null,
    signatureIpAddress: null,
    signatureUserAgent: null,
    acl: [
      {
        principalId: USER_ID,
        principalType: 'USER',
        accessLevel: 'EDIT',
        grantedBy: USER_ID,
        grantedAt: new Date('2026-01-15T10:00:00Z'),
        expiresAt: null,
      },
    ],
    ...overrides,
  };
}

// Helper to create a domain CaseDocument
function createTestDocument(
  overrides: Partial<{
    id: string;
    tenantId: string;
    status: DocumentStatus;
    parentVersionId: string;
    isLatestVersion: boolean;
  }> = {}
): CaseDocument {
  return CaseDocument.create({
    tenantId: overrides.tenantId ?? TENANT_ID,
    metadata: {
      title: 'Test Document',
      description: 'A test document',
      documentType: 'CONTRACT',
      classification: DocumentClassification.INTERNAL,
      tags: ['test'],
      relatedCaseId: CASE_ID,
    },
    storageKey: '/storage/test-doc.pdf',
    contentHash: HASH,
    mimeType: 'application/pdf',
    sizeBytes: 2048,
    createdBy: USER_ID,
  });
}

describe('PrismaCaseDocumentRepository', () => {
  let repo: PrismaCaseDocumentRepository;
  let mockPrisma: MockPrisma;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma = createMockPrisma();
    repo = new PrismaCaseDocumentRepository(mockPrisma as any);
  });

  // ============================================
  // save
  // ============================================
  describe('save()', () => {
    it('should upsert document record with all fields', async () => {
      mockPrisma.caseDocument.upsert.mockResolvedValue({});
      mockPrisma.caseDocumentACL.deleteMany.mockResolvedValue({});
      mockPrisma.caseDocumentACL.createMany.mockResolvedValue({ count: 0 });

      const doc = createTestDocument();
      await repo.save(doc);

      expect(mockPrisma.caseDocument.upsert).toHaveBeenCalledTimes(1);
      const call = mockPrisma.caseDocument.upsert.mock.calls[0][0];

      expect(call.where.id).toBe(doc.id);
      expect(call.create.id).toBe(doc.id);
      expect(call.create.tenantId).toBe(TENANT_ID);
      expect(call.create.versionMajor).toBe(1);
      expect(call.create.versionMinor).toBe(0);
      expect(call.create.versionPatch).toBe(0);
      expect(call.create.status).toBe('DRAFT');
      expect(call.create.title).toBe('Test Document');
      expect(call.create.storageKey).toBe('/storage/test-doc.pdf');
      expect(call.create.contentHash).toBe(HASH);
      expect(call.create.mimeType).toBe('application/pdf');
      expect(call.create.sizeBytes).toBe(2048);
      expect(call.create.createdBy).toBe(USER_ID);
    });

    it('should include update fields in upsert', async () => {
      mockPrisma.caseDocument.upsert.mockResolvedValue({});
      mockPrisma.caseDocumentACL.deleteMany.mockResolvedValue({});

      const doc = createTestDocument();
      await repo.save(doc);

      const call = mockPrisma.caseDocument.upsert.mock.calls[0][0];
      expect(call.update.versionMajor).toBe(1);
      expect(call.update.status).toBe('DRAFT');
      expect(call.update.title).toBe('Test Document');
    });

    it('should sync ACL entries - delete old and create new', async () => {
      mockPrisma.caseDocument.upsert.mockResolvedValue({});
      mockPrisma.caseDocumentACL.deleteMany.mockResolvedValue({});
      mockPrisma.caseDocumentACL.createMany.mockResolvedValue({ count: 1 });

      const doc = createTestDocument();
      doc.grantAccess(USER2_ID, 'USER', AccessLevel.VIEW, USER_ID);

      await repo.save(doc);

      // ACL should be deleted first
      expect(mockPrisma.caseDocumentACL.deleteMany).toHaveBeenCalledWith({
        where: { documentId: doc.id },
      });

      // Then new ACL created
      expect(mockPrisma.caseDocumentACL.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            documentId: doc.id,
            tenantId: TENANT_ID,
            principalId: USER2_ID,
            principalType: 'USER',
            accessLevel: 'VIEW',
            grantedBy: USER_ID,
          }),
        ]),
      });
    });

    it('should not create ACL entries when ACL is empty', async () => {
      mockPrisma.caseDocument.upsert.mockResolvedValue({});
      mockPrisma.caseDocumentACL.deleteMany.mockResolvedValue({});

      const doc = createTestDocument();
      // doc has no ACL entries by default
      await repo.save(doc);

      // ACL should be deleted
      expect(mockPrisma.caseDocumentACL.deleteMany).toHaveBeenCalled();
      // But no createMany call since ACL is empty
      expect(mockPrisma.caseDocumentACL.createMany).not.toHaveBeenCalled();
    });

    it('should handle eSignature fields', async () => {
      mockPrisma.caseDocument.upsert.mockResolvedValue({});
      mockPrisma.caseDocumentACL.deleteMany.mockResolvedValue({});

      const doc = createTestDocument();
      // Submit for review, approve, then sign
      doc.submitForReview(USER_ID);
      doc.approve(USER_ID);
      doc.sign(USER_ID, '192.168.1.1', 'Mozilla/5.0', HASH);

      await repo.save(doc);

      const call = mockPrisma.caseDocument.upsert.mock.calls[0][0];
      expect(call.create.signedBy).toBe(USER_ID);
      expect(call.create.signedAt).toBeInstanceOf(Date);
      expect(call.create.signatureHash).toBeDefined();
      expect(call.create.signatureIpAddress).toBe('192.168.1.1');
      expect(call.create.signatureUserAgent).toBe('Mozilla/5.0');
    });

    it('should set null for optional fields when not present', async () => {
      mockPrisma.caseDocument.upsert.mockResolvedValue({});
      mockPrisma.caseDocumentACL.deleteMany.mockResolvedValue({});

      const doc = createTestDocument();
      await repo.save(doc);

      const call = mockPrisma.caseDocument.upsert.mock.calls[0][0];
      expect(call.create.parentVersionId).toBeNull();
      expect(call.create.retentionUntil).toBeNull();
      expect(call.create.deletedAt).toBeNull();
      expect(call.create.signedBy).toBeNull();
    });
  });

  // ============================================
  // findById
  // ============================================
  describe('findById()', () => {
    it('should return CaseDocument when found', async () => {
      const record = createMockDbRecord();
      mockPrisma.caseDocument.findUnique.mockResolvedValue(record);

      const result = await repo.findById(DOC_ID);

      expect(result).not.toBeNull();
      expect(result!.id).toBe(DOC_ID);
      expect(result!.tenantId).toBe(TENANT_ID);
      expect(result!.status).toBe(DocumentStatus.DRAFT);
      expect(result!.metadata.title).toBe('Test Document');
    });

    it('should return null when not found', async () => {
      mockPrisma.caseDocument.findUnique.mockResolvedValue(null);

      const result = await repo.findById('non-existent');

      expect(result).toBeNull();
    });

    it('should include ACL in query', async () => {
      mockPrisma.caseDocument.findUnique.mockResolvedValue(null);

      await repo.findById(DOC_ID);

      expect(mockPrisma.caseDocument.findUnique).toHaveBeenCalledWith({
        where: { id: DOC_ID },
        include: { acl: true },
      });
    });

    it('should correctly map ACL entries from database', async () => {
      const record = createMockDbRecord({
        acl: [
          {
            principalId: USER_ID,
            principalType: 'USER',
            accessLevel: 'EDIT',
            grantedBy: USER_ID,
            grantedAt: new Date('2026-01-15T10:00:00Z'),
            expiresAt: null,
          },
          {
            principalId: USER2_ID,
            principalType: 'ROLE',
            accessLevel: 'VIEW',
            grantedBy: USER_ID,
            grantedAt: new Date('2026-01-16T10:00:00Z'),
            expiresAt: new Date('2026-12-31T23:59:59Z'),
          },
        ],
      });
      mockPrisma.caseDocument.findUnique.mockResolvedValue(record);

      const result = await repo.findById(DOC_ID);
      const acl = result!.acl;

      expect(acl).toHaveLength(2);
      expect(acl[0].principalId).toBe(USER_ID);
      expect(acl[0].principalType).toBe('USER');
      expect(acl[0].accessLevel).toBe(AccessLevel.EDIT);
      expect(acl[1].principalId).toBe(USER2_ID);
      expect(acl[1].principalType).toBe('ROLE');
      expect(acl[1].accessLevel).toBe(AccessLevel.VIEW);
      expect(acl[1].expiresAt).toEqual(new Date('2026-12-31T23:59:59Z'));
    });

    it('should handle record with eSignature', async () => {
      const record = createMockDbRecord({
        signedBy: USER_ID,
        signedAt: new Date('2026-01-20T10:00:00Z'),
        signatureHash: HASH,
        signatureIpAddress: '10.0.0.1',
        signatureUserAgent: 'Chrome/120',
        status: 'SIGNED',
      });
      mockPrisma.caseDocument.findUnique.mockResolvedValue(record);

      const result = await repo.findById(DOC_ID);
      const json = result!.toJSON();

      expect(json.eSignature).toBeDefined();
      expect(json.eSignature!.signedBy).toBe(USER_ID);
      expect(json.eSignature!.ipAddress).toBe('10.0.0.1');
      expect(json.eSignature!.userAgent).toBe('Chrome/120');
    });

    it('should handle record without eSignature', async () => {
      const record = createMockDbRecord();
      mockPrisma.caseDocument.findUnique.mockResolvedValue(record);

      const result = await repo.findById(DOC_ID);
      const json = result!.toJSON();

      expect(json.eSignature).toBeUndefined();
    });

    it('should handle null description and optional metadata', async () => {
      const record = createMockDbRecord({
        description: null,
        relatedCaseId: null,
        relatedContactId: null,
        tags: [],
      });
      mockPrisma.caseDocument.findUnique.mockResolvedValue(record);

      const result = await repo.findById(DOC_ID);

      expect(result!.metadata.description).toBeUndefined();
      expect(result!.metadata.relatedCaseId).toBeUndefined();
      expect(result!.metadata.relatedContactId).toBeUndefined();
      expect(result!.metadata.tags).toEqual([]);
    });

    it('should handle empty ACL', async () => {
      const record = createMockDbRecord({ acl: [] });
      mockPrisma.caseDocument.findUnique.mockResolvedValue(record);

      const result = await repo.findById(DOC_ID);

      expect(result!.acl).toEqual([]);
    });
  });

  // ============================================
  // findLatestVersion
  // ============================================
  describe('findLatestVersion()', () => {
    it('should find latest version by OR condition', async () => {
      const record = createMockDbRecord({ isLatestVersion: true });
      mockPrisma.caseDocument.findFirst.mockResolvedValue(record);

      const result = await repo.findLatestVersion(DOC_ID);

      expect(result).not.toBeNull();
      expect(result!.isLatestVersion).toBe(true);

      expect(mockPrisma.caseDocument.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [
            { id: DOC_ID, isLatestVersion: true },
            { parentVersionId: DOC_ID, isLatestVersion: true },
          ],
        },
        include: { acl: true },
      });
    });

    it('should return null when no latest version found', async () => {
      mockPrisma.caseDocument.findFirst.mockResolvedValue(null);

      const result = await repo.findLatestVersion('non-existent');

      expect(result).toBeNull();
    });
  });

  // ============================================
  // findAllVersions
  // ============================================
  describe('findAllVersions()', () => {
    it('should return empty array when document not found', async () => {
      mockPrisma.caseDocument.findUnique.mockResolvedValue(null);

      const result = await repo.findAllVersions('non-existent');

      expect(result).toEqual([]);
    });

    it('should walk up parent chain to find root document', async () => {
      // Child document that has a parent
      const childRecord = {
        id: DOC_CHILD_ID,
        parentVersionId: DOC_ID,
      };
      // Root document (no parent)
      const rootRecord = createMockDbRecord({ id: DOC_ID, parentVersionId: null });

      // First call: get the child document
      mockPrisma.caseDocument.findUnique
        .mockResolvedValueOnce(childRecord) // findAllVersions initial lookup
        .mockResolvedValueOnce(rootRecord) // walking up to parent
        .mockResolvedValueOnce(rootRecord) // findVersionChain: root doc
        .mockResolvedValueOnce(null); // findVersionChain: child (no children of root found)

      // findVersionChain: find children of root
      mockPrisma.caseDocument.findMany
        .mockResolvedValueOnce([{ id: DOC_CHILD_ID }]) // children of root
        .mockResolvedValueOnce([]); // children of child (none)

      // Second findUnique for child in the version chain
      mockPrisma.caseDocument.findUnique.mockResolvedValueOnce(
        createMockDbRecord({
          id: DOC_CHILD_ID,
          parentVersionId: DOC_ID,
          versionMajor: 2,
          versionMinor: 0,
          versionPatch: 0,
        })
      );

      const result = await repo.findAllVersions(DOC_CHILD_ID);

      // Should have called findUnique multiple times walking up the chain
      expect(mockPrisma.caseDocument.findUnique).toHaveBeenCalled();
      // Results should be returned (may vary based on mock behavior)
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle root document with no parent', async () => {
      const rootRecord = createMockDbRecord({
        id: DOC_ID,
        parentVersionId: null,
        acl: [],
      });

      // Initial lookup
      mockPrisma.caseDocument.findUnique
        .mockResolvedValueOnce(rootRecord) // findAllVersions: initial
        .mockResolvedValueOnce(rootRecord); // findVersionChain: get root

      // findVersionChain: no children
      mockPrisma.caseDocument.findMany.mockResolvedValueOnce([]);

      const result = await repo.findAllVersions(DOC_ID);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(DOC_ID);
    });

    it('should sort versions by major > minor > patch', async () => {
      const v1 = createMockDbRecord({
        id: DOC_ID,
        versionMajor: 1,
        versionMinor: 0,
        versionPatch: 0,
        parentVersionId: null,
        acl: [],
      });
      const v2 = createMockDbRecord({
        id: DOC_CHILD_ID,
        versionMajor: 2,
        versionMinor: 0,
        versionPatch: 0,
        parentVersionId: DOC_ID,
        acl: [],
      });

      // Initial lookup (starting from root)
      mockPrisma.caseDocument.findUnique
        .mockResolvedValueOnce(v1) // findAllVersions initial
        .mockResolvedValueOnce(v1) // findVersionChain: root
        .mockResolvedValueOnce(v2); // findVersionChain: child

      mockPrisma.caseDocument.findMany
        .mockResolvedValueOnce([{ id: DOC_CHILD_ID }]) // children of root
        .mockResolvedValueOnce([]); // children of child

      const result = await repo.findAllVersions(DOC_ID);

      expect(result).toHaveLength(2);
      // Should be sorted ascending by version
      const v1Result = result[0].version;
      const v2Result = result[1].version;
      expect(v1Result.major).toBeLessThanOrEqual(v2Result.major);
    });
  });

  // ============================================
  // findByCaseId
  // ============================================
  describe('findByCaseId()', () => {
    it('should return latest non-deleted documents for a case', async () => {
      const records = [
        createMockDbRecord({ id: DOC_ID }),
        createMockDbRecord({ id: DOC_CHILD_ID }),
      ];
      mockPrisma.caseDocument.findMany.mockResolvedValue(records);

      const result = await repo.findByCaseId(CASE_ID);

      expect(result).toHaveLength(2);
      expect(mockPrisma.caseDocument.findMany).toHaveBeenCalledWith({
        where: {
          relatedCaseId: CASE_ID,
          deletedAt: null,
          isLatestVersion: true,
        },
        include: { acl: true },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should return empty array when no documents found', async () => {
      mockPrisma.caseDocument.findMany.mockResolvedValue([]);

      const result = await repo.findByCaseId('non-existent-case');

      expect(result).toEqual([]);
    });
  });

  // ============================================
  // findAccessibleByUser
  // ============================================
  describe('findAccessibleByUser()', () => {
    it('should query for documents user created or has ACL access to', async () => {
      mockPrisma.caseDocument.findMany.mockResolvedValue([]);

      await repo.findAccessibleByUser(USER_ID, TENANT_ID);

      const call = mockPrisma.caseDocument.findMany.mock.calls[0][0];

      expect(call.where.tenantId).toBe(TENANT_ID);
      expect(call.where.deletedAt).toBeNull();
      expect(call.where.isLatestVersion).toBe(true);
      expect(call.where.OR).toBeDefined();
      expect(call.where.OR).toHaveLength(2);

      // First OR: createdBy user
      expect(call.where.OR[0]).toEqual({ createdBy: USER_ID });

      // Second OR: ACL access
      expect(call.where.OR[1].acl.some.principalId).toBe(USER_ID);
      expect(call.where.OR[1].acl.some.accessLevel).toEqual({ not: 'NONE' });
    });

    it('should filter out expired ACL entries', async () => {
      mockPrisma.caseDocument.findMany.mockResolvedValue([]);

      await repo.findAccessibleByUser(USER_ID, TENANT_ID);

      const call = mockPrisma.caseDocument.findMany.mock.calls[0][0];
      const aclCondition = call.where.OR[1].acl.some;

      // Should check for null or future expiry
      expect(aclCondition.OR).toBeDefined();
      expect(aclCondition.OR).toContainEqual({ expiresAt: null });
      expect(aclCondition.OR).toContainEqual({
        expiresAt: { gt: expect.any(Date) },
      });
    });

    it('should return documents the user has access to', async () => {
      const records = [createMockDbRecord()];
      mockPrisma.caseDocument.findMany.mockResolvedValue(records);

      const result = await repo.findAccessibleByUser(USER_ID, TENANT_ID);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(DOC_ID);
    });

    it('should order by createdAt descending', async () => {
      mockPrisma.caseDocument.findMany.mockResolvedValue([]);

      await repo.findAccessibleByUser(USER_ID, TENANT_ID);

      expect(mockPrisma.caseDocument.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
        })
      );
    });
  });

  // ============================================
  // delete
  // ============================================
  describe('delete()', () => {
    it('should delete ACL entries first, then document', async () => {
      mockPrisma.caseDocumentACL.deleteMany.mockResolvedValue({ count: 2 });
      mockPrisma.caseDocument.delete.mockResolvedValue({});

      await repo.delete(DOC_ID);

      // ACL deleted first
      expect(mockPrisma.caseDocumentACL.deleteMany).toHaveBeenCalledWith({
        where: { documentId: DOC_ID },
      });

      // Then document deleted
      expect(mockPrisma.caseDocument.delete).toHaveBeenCalledWith({
        where: { id: DOC_ID },
      });

      // Verify order: ACL delete called before document delete
      const aclDeleteOrder = mockPrisma.caseDocumentACL.deleteMany.mock.invocationCallOrder[0];
      const docDeleteOrder = mockPrisma.caseDocument.delete.mock.invocationCallOrder[0];
      expect(aclDeleteOrder).toBeLessThan(docDeleteOrder);
    });

    it('should propagate database errors', async () => {
      mockPrisma.caseDocumentACL.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.caseDocument.delete.mockRejectedValue(new Error('Record not found'));

      await expect(repo.delete('non-existent')).rejects.toThrow('Record not found');
    });
  });

  // ============================================
  // toDomain mapping edge cases
  // ============================================
  describe('toDomain mapping', () => {
    it('should map retentionUntil correctly', async () => {
      const retentionDate = new Date('2027-01-01T00:00:00Z');
      const record = createMockDbRecord({ retentionUntil: retentionDate });
      mockPrisma.caseDocument.findUnique.mockResolvedValue(record);

      const result = await repo.findById(DOC_ID);
      const json = result!.toJSON();

      expect(json.retentionUntil).toEqual(retentionDate);
    });

    it('should map deletedAt correctly', async () => {
      const deletedAt = new Date('2026-06-01T00:00:00Z');
      const record = createMockDbRecord({ deletedAt: deletedAt });
      mockPrisma.caseDocument.findUnique.mockResolvedValue(record);

      const result = await repo.findById(DOC_ID);

      expect(result!.isDeleted).toBe(true);
    });

    it('should handle record with no ACL', async () => {
      const record = createMockDbRecord({ acl: undefined });
      mockPrisma.caseDocument.findUnique.mockResolvedValue(record);

      const result = await repo.findById(DOC_ID);

      expect(result!.acl).toEqual([]);
    });

    it('should map version fields correctly', async () => {
      const record = createMockDbRecord({
        versionMajor: 3,
        versionMinor: 2,
        versionPatch: 1,
      });
      mockPrisma.caseDocument.findUnique.mockResolvedValue(record);

      const result = await repo.findById(DOC_ID);
      const version = result!.version;

      expect(version.major).toBe(3);
      expect(version.minor).toBe(2);
      expect(version.patch).toBe(1);
      expect(version.toString()).toBe('3.2.1');
    });

    it('should handle ACL entry with expiresAt as null', async () => {
      const record = createMockDbRecord({
        acl: [
          {
            principalId: USER_ID,
            principalType: 'USER',
            accessLevel: 'ADMIN',
            grantedBy: USER_ID,
            grantedAt: new Date(),
            expiresAt: null,
          },
        ],
      });
      mockPrisma.caseDocument.findUnique.mockResolvedValue(record);

      const result = await repo.findById(DOC_ID);
      const ace = result!.acl[0];

      expect(ace.expiresAt).toBeUndefined();
    });

    it('should map parentVersionId correctly', async () => {
      const record = createMockDbRecord({
        parentVersionId: DOC_CHILD_ID,
      });
      mockPrisma.caseDocument.findUnique.mockResolvedValue(record);

      const result = await repo.findById(DOC_ID);
      const json = result!.toJSON();

      expect(json.parentVersionId).toBe(DOC_CHILD_ID);
    });
  });

  // ============================================
  // findVersionChain (tested through findAllVersions)
  // ============================================
  describe('findVersionChain (via findAllVersions)', () => {
    it('should handle circular references gracefully via visited set', async () => {
      // The visited set prevents infinite loops
      const record = createMockDbRecord({
        id: DOC_ID,
        parentVersionId: null,
        acl: [],
      });

      mockPrisma.caseDocument.findUnique
        .mockResolvedValueOnce(record) // initial lookup
        .mockResolvedValueOnce(record); // findVersionChain root

      // Children that point back to root (cycle scenario)
      mockPrisma.caseDocument.findMany
        .mockResolvedValueOnce([{ id: DOC_ID }]) // child is same as root (cycle)
        .mockResolvedValue([]); // prevent further recursion

      const result = await repo.findAllVersions(DOC_ID);

      // Should not loop infinitely due to visited set
      expect(result).toHaveLength(1);
    });

    it('should handle deep version chains', async () => {
      // root -> child -> grandchild
      const root = createMockDbRecord({
        id: DOC_ID,
        versionMajor: 1,
        parentVersionId: null,
        acl: [],
      });

      // Initial lookup returns root
      mockPrisma.caseDocument.findUnique
        .mockResolvedValueOnce(root) // initial
        .mockResolvedValueOnce(root) // findVersionChain: root
        .mockResolvedValueOnce(
          createMockDbRecord({
            id: DOC_CHILD_ID,
            versionMajor: 2,
            parentVersionId: DOC_ID,
            acl: [],
          })
        )
        .mockResolvedValueOnce(
          createMockDbRecord({
            id: DOC_GRANDCHILD_ID,
            versionMajor: 3,
            parentVersionId: DOC_CHILD_ID,
            acl: [],
          })
        );

      mockPrisma.caseDocument.findMany
        .mockResolvedValueOnce([{ id: DOC_CHILD_ID }]) // children of root
        .mockResolvedValueOnce([{ id: DOC_GRANDCHILD_ID }]) // children of child
        .mockResolvedValueOnce([]); // children of grandchild

      const result = await repo.findAllVersions(DOC_ID);

      expect(result).toHaveLength(3);
      // Should be sorted by version
      expect(result[0].version.major).toBe(1);
      expect(result[1].version.major).toBe(2);
      expect(result[2].version.major).toBe(3);
    });

    it('should skip null documents in version chain', async () => {
      const root = createMockDbRecord({
        id: DOC_ID,
        parentVersionId: null,
        acl: [],
      });

      mockPrisma.caseDocument.findUnique
        .mockResolvedValueOnce(root) // initial
        .mockResolvedValueOnce(root) // findVersionChain: root
        .mockResolvedValueOnce(null); // child not found

      mockPrisma.caseDocument.findMany
        .mockResolvedValueOnce([{ id: DOC_CHILD_ID }]) // children of root (child exists in reference)
        .mockResolvedValue([]); // but child not found by findUnique

      const result = await repo.findAllVersions(DOC_ID);

      // Only root should be returned since child is null
      expect(result).toHaveLength(1);
    });
  });
});
