/**
 * InMemoryCaseDocumentRepository Unit Tests
 *
 * Tests the in-memory implementation of the CaseDocumentRepository interface.
 * These tests verify repository operations work correctly with domain entities.
 *
 * Coverage target: >95% for repository layer
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import { InMemoryCaseDocumentRepository } from '../InMemoryCaseDocumentRepository';
import {
  CaseDocument,
  DocumentStatus,
  AccessLevel,
  DocumentClassification,
} from '@intelliflow/domain';

describe('InMemoryCaseDocumentRepository', () => {
  let repository: InMemoryCaseDocumentRepository;
  let testTenantId: string;
  let testTenant2Id: string;
  let testUserId: string;
  let testUser2Id: string;
  let testUser3Id: string;
  let testCaseId: string;
  let testCase2Id: string;

  beforeEach(() => {
    repository = new InMemoryCaseDocumentRepository();
    repository.clear();
    testTenantId = randomUUID();
    testTenant2Id = randomUUID();
    testUserId = randomUUID();
    testUser2Id = randomUUID();
    testUser3Id = randomUUID();
    testCaseId = randomUUID();
    testCase2Id = randomUUID();
  });

  const createTestDocument = (overrides: Partial<any> = {}) => {
    return CaseDocument.create({
      tenantId: overrides.tenantId || testTenantId,
      metadata: {
        title: overrides.title || 'Test Document',
        description: overrides.description || 'Test description',
        documentType: overrides.documentType || 'CONTRACT',
        classification: overrides.classification || DocumentClassification.INTERNAL,
        tags: overrides.tags || ['test'],
        relatedCaseId: overrides.relatedCaseId,
        relatedContactId: overrides.relatedContactId,
      },
      storageKey: overrides.storageKey || 's3://bucket/document.pdf',
      contentHash: overrides.contentHash || 'a'.repeat(64),
      mimeType: overrides.mimeType || 'application/pdf',
      sizeBytes: overrides.sizeBytes || 12345,
      createdBy: overrides.createdBy || testUserId,
    });
  };

  describe('save()', () => {
    it('should save a new document', async () => {
      const document = createTestDocument();

      await repository.save(document);

      const retrieved = await repository.findById(document.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(document.id);
    });

    it('should update an existing document', async () => {
      const document = createTestDocument();
      await repository.save(document);

      // Grant access and save again
      document.grantAccess(testUser2Id, 'USER', AccessLevel.VIEW, testUserId);
      await repository.save(document);

      const retrieved = await repository.findById(document.id);
      expect(retrieved?.acl).toHaveLength(1);
      expect(retrieved?.acl[0].principalId).toBe(testUser2Id);
    });

    it('should persist multiple documents', async () => {
      const doc1 = createTestDocument({ title: 'Doc 1' });
      const doc2 = createTestDocument({ title: 'Doc 2' });
      const doc3 = createTestDocument({ title: 'Doc 3' });

      await repository.save(doc1);
      await repository.save(doc2);
      await repository.save(doc3);

      const all = repository.getAll();
      expect(all).toHaveLength(3);
    });
  });

  describe('findById()', () => {
    it('should find a document by ID', async () => {
      const document = createTestDocument();
      await repository.save(document);

      const found = await repository.findById(document.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(document.id);
      expect(found?.metadata.title).toBe('Test Document');
    });

    it('should return null for non-existent ID', async () => {
      const found = await repository.findById('non-existent-id');
      expect(found).toBeNull();
    });
  });

  describe('findLatestVersion()', () => {
    it('should find the latest version of a document', async () => {
      const document = createTestDocument();
      await repository.save(document);

      const found = await repository.findLatestVersion(document.id);

      expect(found).not.toBeNull();
      expect(found?.isLatestVersion).toBe(true);
      expect(found?.version.toString()).toBe('1.0.0');
    });

    it('should return the latest version when multiple versions exist', async () => {
      const document = createTestDocument();
      await repository.save(document);

      // Create a new version
      const newVersion = document.createMinorVersion(testUserId, 's3://new-key', 'b'.repeat(64));
      await repository.save(document); // Save old (now superseded)
      await repository.save(newVersion); // Save new (latest)

      const found = await repository.findLatestVersion(document.id);

      expect(found).not.toBeNull();
      expect(found?.isLatestVersion).toBe(true);
      expect(found?.version.toString()).toBe('1.1.0');
    });

    it('should return null for non-existent document', async () => {
      const found = await repository.findLatestVersion('non-existent-id');
      expect(found).toBeNull();
    });
  });

  describe('findAllVersions()', () => {
    it('should return empty array for non-existent document', async () => {
      const versions = await repository.findAllVersions('non-existent-id');
      expect(versions).toHaveLength(0);
    });

    it('should return single version for document without versions', async () => {
      const document = createTestDocument();
      await repository.save(document);

      const versions = await repository.findAllVersions(document.id);

      expect(versions).toHaveLength(1);
      expect(versions[0].version.toString()).toBe('1.0.0');
    });

    it('should return all versions sorted by version number', async () => {
      const document = createTestDocument();
      await repository.save(document);

      // Create multiple versions
      const v2 = document.createMinorVersion(testUserId, 's3://v2', 'b'.repeat(64));
      await repository.save(document);
      await repository.save(v2);

      const v3 = v2.createPatchVersion(testUserId, 's3://v3', 'c'.repeat(64));
      await repository.save(v2);
      await repository.save(v3);

      const versions = await repository.findAllVersions(document.id);

      expect(versions).toHaveLength(3);
      expect(versions[0].version.toString()).toBe('1.0.0');
      expect(versions[1].version.toString()).toBe('1.1.0');
      expect(versions[2].version.toString()).toBe('1.1.1');
    });

    it('should include all versions in chain regardless of start point', async () => {
      const document = createTestDocument();
      await repository.save(document);

      const v2 = document.createMinorVersion(testUserId, 's3://v2', 'b'.repeat(64));
      await repository.save(document);
      await repository.save(v2);

      // Query from v2 should still return all versions
      const versions = await repository.findAllVersions(v2.id);

      expect(versions).toHaveLength(2);
      expect(versions[0].version.toString()).toBe('1.0.0');
      expect(versions[1].version.toString()).toBe('1.1.0');
    });
  });

  describe('findByCaseId()', () => {
    it('should find all documents for a case', async () => {
      const doc1 = createTestDocument({ relatedCaseId: testCaseId });
      const doc2 = createTestDocument({ relatedCaseId: testCaseId });
      const doc3 = createTestDocument({ relatedCaseId: testCase2Id });

      await repository.save(doc1);
      await repository.save(doc2);
      await repository.save(doc3);

      const case1Docs = await repository.findByCaseId(testCaseId);
      const case2Docs = await repository.findByCaseId(testCase2Id);

      expect(case1Docs).toHaveLength(2);
      expect(case2Docs).toHaveLength(1);
    });

    it('should only return latest versions', async () => {
      const document = createTestDocument({ relatedCaseId: testCaseId });
      await repository.save(document);

      const newVersion = document.createMinorVersion(testUserId, 's3://new', 'b'.repeat(64));
      await repository.save(document);
      await repository.save(newVersion);

      const caseDocs = await repository.findByCaseId(testCaseId);

      expect(caseDocs).toHaveLength(1);
      expect(caseDocs[0].isLatestVersion).toBe(true);
    });

    it('should exclude deleted documents', async () => {
      const document = createTestDocument({ relatedCaseId: testCaseId });
      await repository.save(document);

      document.delete(testUserId);
      await repository.save(document);

      const caseDocs = await repository.findByCaseId(testCaseId);

      expect(caseDocs).toHaveLength(0);
    });

    it('should return empty array for case with no documents', async () => {
      const docs = await repository.findByCaseId('case-999');
      expect(docs).toHaveLength(0);
    });
  });

  describe('findAccessibleByUser()', () => {
    it('should find documents created by the user', async () => {
      const document = createTestDocument({ createdBy: testUserId });
      await repository.save(document);

      const docs = await repository.findAccessibleByUser(testUserId, testTenantId);

      expect(docs).toHaveLength(1);
      expect(docs[0].id).toBe(document.id);
    });

    it('should find documents with ACL access', async () => {
      const document = createTestDocument({ createdBy: testUser2Id });
      document.grantAccess(testUserId, 'USER', AccessLevel.VIEW, testUser2Id);
      await repository.save(document);

      const docs = await repository.findAccessibleByUser(testUserId, testTenantId);

      expect(docs).toHaveLength(1);
      expect(docs[0].id).toBe(document.id);
    });

    it('should exclude documents with NONE access level', async () => {
      const document = createTestDocument({ createdBy: testUser2Id });
      document.grantAccess(testUserId, 'USER', AccessLevel.NONE, testUser2Id);
      await repository.save(document);

      const docs = await repository.findAccessibleByUser(testUserId, testTenantId);

      expect(docs).toHaveLength(0);
    });

    it('should exclude documents with expired ACL', async () => {
      const document = createTestDocument({ createdBy: testUser2Id });
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      document.grantAccess(testUserId, 'USER', AccessLevel.VIEW, testUser2Id, yesterday);
      await repository.save(document);

      const docs = await repository.findAccessibleByUser(testUserId, testTenantId);

      expect(docs).toHaveLength(0);
    });

    it('should filter by tenant', async () => {
      const doc1 = createTestDocument({ tenantId: testTenantId, createdBy: testUserId });
      const doc2 = createTestDocument({ tenantId: testTenant2Id, createdBy: testUserId });

      await repository.save(doc1);
      await repository.save(doc2);

      const tenant1Docs = await repository.findAccessibleByUser(testUserId, testTenantId);
      const tenant2Docs = await repository.findAccessibleByUser(testUserId, testTenant2Id);

      expect(tenant1Docs).toHaveLength(1);
      expect(tenant2Docs).toHaveLength(1);
    });

    it('should exclude deleted documents', async () => {
      const document = createTestDocument({ createdBy: testUserId });
      await repository.save(document);

      document.delete(testUserId);
      await repository.save(document);

      const docs = await repository.findAccessibleByUser(testUserId, testTenantId);

      expect(docs).toHaveLength(0);
    });

    it('should only return latest versions', async () => {
      const document = createTestDocument({ createdBy: testUserId });
      await repository.save(document);

      const newVersion = document.createMinorVersion(testUserId, 's3://new', 'b'.repeat(64));
      await repository.save(document);
      await repository.save(newVersion);

      const docs = await repository.findAccessibleByUser(testUserId, testTenantId);

      expect(docs).toHaveLength(1);
      expect(docs[0].isLatestVersion).toBe(true);
    });

    it('should return empty array for user with no access', async () => {
      const docs = await repository.findAccessibleByUser(randomUUID(), testTenantId);
      expect(docs).toHaveLength(0);
    });
  });

  describe('delete()', () => {
    it('should delete a document by ID', async () => {
      const document = createTestDocument();
      await repository.save(document);

      expect(await repository.findById(document.id)).not.toBeNull();

      await repository.delete(document.id);

      expect(await repository.findById(document.id)).toBeNull();
    });

    it('should not throw when deleting non-existent document', async () => {
      await expect(repository.delete('non-existent-id')).resolves.not.toThrow();
    });

    it('should delete document and allow findByCaseId to succeed', async () => {
      const document = createTestDocument({ relatedCaseId: testCaseId });
      await repository.save(document);

      await repository.delete(document.id);

      const caseDocs = await repository.findByCaseId(testCaseId);
      expect(caseDocs).toHaveLength(0);
    });
  });

  describe('ACL Operations', () => {
    it('should persist ACL entries when saving document', async () => {
      const document = createTestDocument();
      document.grantAccess(testUser2Id, 'USER', AccessLevel.EDIT, testUserId);
      document.grantAccess(testUser3Id, 'USER', AccessLevel.VIEW, testUserId);

      await repository.save(document);

      const retrieved = await repository.findById(document.id);
      expect(retrieved?.acl).toHaveLength(2);
    });

    it('should update ACL when document is saved again', async () => {
      const document = createTestDocument();
      await repository.save(document);

      document.grantAccess(testUser2Id, 'USER', AccessLevel.VIEW, testUserId);
      await repository.save(document);

      const retrieved = await repository.findById(document.id);
      expect(retrieved?.acl).toHaveLength(1);
      expect(retrieved?.acl[0].accessLevel).toBe(AccessLevel.VIEW);
    });

    it('should support ACL expiration', async () => {
      const document = createTestDocument();
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      document.grantAccess(testUser2Id, 'USER', AccessLevel.VIEW, testUserId, tomorrow);
      await repository.save(document);

      const retrieved = await repository.findById(document.id);
      expect(retrieved?.acl[0].expiresAt).toBeDefined();
    });
  });

  describe('Version Chain Operations', () => {
    it('should maintain parent-child relationships in version chain', async () => {
      const v1 = createTestDocument();
      await repository.save(v1);

      const v2 = v1.createMinorVersion(testUserId, 's3://v2', 'b'.repeat(64));
      await repository.save(v1);
      await repository.save(v2);

      const v2Data = v2.toJSON();
      expect(v2Data.parentVersionId).toBe(v1.id);
    });

    it('should mark old version as superseded', async () => {
      const v1 = createTestDocument();
      await repository.save(v1);

      const v2 = v1.createMinorVersion(testUserId, 's3://v2', 'b'.repeat(64));
      await repository.save(v1);
      await repository.save(v2);

      const oldVersion = await repository.findById(v1.id);
      expect(oldVersion?.isLatestVersion).toBe(false);
      expect(oldVersion?.status).toBe(DocumentStatus.SUPERSEDED);
    });
  });

  describe('Soft Delete Operations', () => {
    it('should persist soft delete', async () => {
      const document = createTestDocument();
      await repository.save(document);

      document.delete(testUserId);
      await repository.save(document);

      const retrieved = await repository.findById(document.id);
      expect(retrieved?.isDeleted).toBe(true);
    });

    it('should exclude soft deleted documents from queries', async () => {
      const document = createTestDocument({ relatedCaseId: testCaseId, createdBy: testUserId });
      await repository.save(document);

      document.delete(testUserId);
      await repository.save(document);

      const byCaseId = await repository.findByCaseId(testCaseId);
      const byUser = await repository.findAccessibleByUser(testUserId, testTenantId);

      expect(byCaseId).toHaveLength(0);
      expect(byUser).toHaveLength(0);
    });
  });

  describe('Test Helper Methods', () => {
    it('clear() should remove all documents', async () => {
      await repository.save(createTestDocument({ title: 'Doc 1' }));
      await repository.save(createTestDocument({ title: 'Doc 2' }));

      expect(repository.getAll()).toHaveLength(2);

      repository.clear();

      expect(repository.getAll()).toHaveLength(0);
    });

    it('getAll() should return all documents', async () => {
      const doc1 = createTestDocument({ title: 'Doc 1' });
      const doc2 = createTestDocument({ title: 'Doc 2' });

      await repository.save(doc1);
      await repository.save(doc2);

      const all = repository.getAll();

      expect(all).toHaveLength(2);
      expect(all.map((d) => d.metadata.title)).toContain('Doc 1');
      expect(all.map((d) => d.metadata.title)).toContain('Doc 2');
    });
  });
});
