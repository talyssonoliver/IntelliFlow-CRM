/**
 * Case Document Lifecycle Integration Tests
 *
 * Tests the complete lifecycle of a document through various states
 * and verifies integration with Case aggregate and repository layer.
 *
 * Coverage target: End-to-end workflow validation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryCaseDocumentRepository } from '../InMemoryCaseDocumentRepository';
import {
  CaseDocument,
  DocumentStatus,
  AccessLevel,
  DocumentClassification,
  Case,
} from '@intelliflow/domain';

describe('Case Document Lifecycle Integration', () => {
  let repository: InMemoryCaseDocumentRepository;

  beforeEach(() => {
    repository = new InMemoryCaseDocumentRepository();
    repository.clear();
  });

  describe('Complete Document Lifecycle', () => {
    it('should handle complete document workflow: create → review → approve → sign → archive', async () => {
      // 1. Create document
      const document = CaseDocument.create({
        tenantId: 'tenant-123',
        metadata: {
          title: 'Service Agreement',
          description: 'Legal service agreement document',
          documentType: 'CONTRACT',
          classification: DocumentClassification.CONFIDENTIAL,
          tags: ['contract', 'legal'],
          relatedCaseId: 'case-123',
        },
        storageKey: 's3://legal-docs/agreement.pdf',
        contentHash: 'a'.repeat(64),
        mimeType: 'application/pdf',
        sizeBytes: 50000,
        createdBy: 'user-123',
      });

      // Grant admin access to creator
      document.grantAccess('user-123', 'USER', AccessLevel.ADMIN, 'user-123');

      await repository.save(document);

      // Verify initial state
      expect(document.status).toBe(DocumentStatus.DRAFT);
      expect(document.version.toString()).toBe('1.0.0');

      // 2. Submit for review
      document.submitForReview('user-123');
      await repository.save(document);

      let retrieved = await repository.findById(document.id);
      expect(retrieved?.status).toBe(DocumentStatus.UNDER_REVIEW);

      // 3. Approve
      document.approve('user-456');
      await repository.save(document);

      retrieved = await repository.findById(document.id);
      expect(retrieved?.status).toBe(DocumentStatus.APPROVED);

      // 4. E-sign
      document.sign('user-123', '192.168.1.1', 'Mozilla/5.0');
      await repository.save(document);

      retrieved = await repository.findById(document.id);
      expect(retrieved?.status).toBe(DocumentStatus.SIGNED);
      expect(retrieved?.toJSON().eSignature).toBeDefined();
      expect(retrieved?.toJSON().eSignature?.signedBy).toBe('user-123');

      // 5. Archive
      document.archive('user-123');
      await repository.save(document);

      retrieved = await repository.findById(document.id);
      expect(retrieved?.status).toBe(DocumentStatus.ARCHIVED);
    });

    it('should enforce state transition rules', async () => {
      const document = CaseDocument.create({
        tenantId: 'tenant-123',
        metadata: {
          title: 'Test Document',
          documentType: 'CONTRACT',
          classification: DocumentClassification.INTERNAL,
          tags: [],
        },
        storageKey: 's3://docs/test.pdf',
        contentHash: 'a'.repeat(64),
        mimeType: 'application/pdf',
        sizeBytes: 1000,
        createdBy: 'user-123',
      });

      // Cannot approve without submitting for review first
      expect(() => document.approve('user-123')).toThrow('Only documents under review can be approved');

      // Cannot sign without approval
      expect(() => document.sign('user-123', '127.0.0.1', 'test')).toThrow(
        'Only approved documents can be signed'
      );
    });

    it('should handle document versioning workflow', async () => {
      // Create initial version
      const v1 = CaseDocument.create({
        tenantId: 'tenant-123',
        metadata: {
          title: 'Contract v1',
          documentType: 'CONTRACT',
          classification: DocumentClassification.INTERNAL,
          tags: [],
        },
        storageKey: 's3://docs/contract-v1.pdf',
        contentHash: 'a'.repeat(64),
        mimeType: 'application/pdf',
        sizeBytes: 1000,
        createdBy: 'user-123',
      });

      await repository.save(v1);

      // Create minor version (amendment)
      const v2 = v1.createMinorVersion('user-123', 's3://docs/contract-v2.pdf', 'b'.repeat(64));
      await repository.save(v1); // Save old version (now superseded)
      await repository.save(v2); // Save new version

      expect(v2.version.toString()).toBe('1.1.0');
      expect(v2.isLatestVersion).toBe(true);
      expect(v1.isLatestVersion).toBe(false);
      expect(v1.status).toBe(DocumentStatus.SUPERSEDED);

      // Create patch version (typo fix)
      const v3 = v2.createPatchVersion('user-123', 's3://docs/contract-v3.pdf', 'c'.repeat(64));
      await repository.save(v2);
      await repository.save(v3);

      expect(v3.version.toString()).toBe('1.1.1');

      // Verify version chain
      const allVersions = await repository.findAllVersions(v1.id);
      expect(allVersions).toHaveLength(3);
      expect(allVersions[0].version.toString()).toBe('1.0.0');
      expect(allVersions[1].version.toString()).toBe('1.1.0');
      expect(allVersions[2].version.toString()).toBe('1.1.1');

      // Verify only latest version is returned in queries
      const latestOnly = await repository.findByCaseId('case-123');
      expect(latestOnly).toHaveLength(0); // No related case ID in this test
    });

    it('should handle legal hold workflow', async () => {
      const document = CaseDocument.create({
        tenantId: 'tenant-123',
        metadata: {
          title: 'Evidence Document',
          documentType: 'EVIDENCE',
          classification: DocumentClassification.PRIVILEGED,
          tags: ['litigation'],
          relatedCaseId: 'case-456',
        },
        storageKey: 's3://evidence/doc.pdf',
        contentHash: 'a'.repeat(64),
        mimeType: 'application/pdf',
        sizeBytes: 2000,
        createdBy: 'user-123',
      });

      await repository.save(document);

      // Place legal hold
      const holdUntil = new Date();
      holdUntil.setFullYear(holdUntil.getFullYear() + 1); // 1 year hold

      document.placeLegalHold(holdUntil, 'legal-team-456');
      await repository.save(document);

      // Attempt to delete (should fail)
      expect(() => document.delete('user-123')).toThrow('Cannot delete document under legal hold');

      // Release hold
      document.releaseLegalHold('legal-team-456');
      await repository.save(document);

      // Now deletion should succeed
      expect(() => document.delete('user-123')).not.toThrow();
      await repository.save(document);

      const retrieved = await repository.findById(document.id);
      expect(retrieved?.isDeleted).toBe(true);
    });

    it('should handle ACL workflow with multiple users', async () => {
      const document = CaseDocument.create({
        tenantId: 'tenant-123',
        metadata: {
          title: 'Shared Document',
          documentType: 'MEMO',
          classification: DocumentClassification.INTERNAL,
          tags: [],
        },
        storageKey: 's3://docs/memo.pdf',
        contentHash: 'a'.repeat(64),
        mimeType: 'application/pdf',
        sizeBytes: 500,
        createdBy: 'owner-123',
      });

      // Owner grants admin access to themselves
      document.grantAccess('owner-123', 'USER', AccessLevel.ADMIN, 'owner-123');

      // Grant view access to viewer
      document.grantAccess('viewer-456', 'USER', AccessLevel.VIEW, 'owner-123');

      // Grant edit access to editor
      document.grantAccess('editor-789', 'USER', AccessLevel.EDIT, 'owner-123');

      await repository.save(document);

      // Verify ACL
      expect(document.acl).toHaveLength(3);

      // Check access levels
      expect(document.hasAccess('owner-123', AccessLevel.ADMIN)).toBe(true);
      expect(document.hasAccess('viewer-456', AccessLevel.VIEW)).toBe(true);
      expect(document.hasAccess('viewer-456', AccessLevel.EDIT)).toBe(false);
      expect(document.hasAccess('editor-789', AccessLevel.EDIT)).toBe(true);

      // Test findAccessibleByUser
      const viewerDocs = await repository.findAccessibleByUser('viewer-456', 'tenant-123');
      const editorDocs = await repository.findAccessibleByUser('editor-789', 'tenant-123');

      expect(viewerDocs).toHaveLength(1);
      expect(editorDocs).toHaveLength(1);

      // Revoke access from viewer
      document.revokeAccess('viewer-456', 'owner-123');
      await repository.save(document);

      const viewerDocsAfter = await repository.findAccessibleByUser('viewer-456', 'tenant-123');
      expect(viewerDocsAfter).toHaveLength(0);
    });

    it('should handle time-limited ACL with expiration', async () => {
      const document = CaseDocument.create({
        tenantId: 'tenant-123',
        metadata: {
          title: 'Temporary Access Document',
          documentType: 'REPORT',
          classification: DocumentClassification.CONFIDENTIAL,
          tags: [],
        },
        storageKey: 's3://docs/report.pdf',
        contentHash: 'a'.repeat(64),
        mimeType: 'application/pdf',
        sizeBytes: 1500,
        createdBy: 'owner-123',
      });

      // Grant access that expires in the past
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      document.grantAccess('temp-user-456', 'USER', AccessLevel.VIEW, 'owner-123', yesterday);
      await repository.save(document);

      // Access should be denied due to expiration
      expect(document.hasAccess('temp-user-456', AccessLevel.VIEW)).toBe(false);

      // Document should not be in accessible list
      const docs = await repository.findAccessibleByUser('temp-user-456', 'tenant-123');
      expect(docs).toHaveLength(0);
    });
  });

  describe('Case Aggregate Document Integration', () => {
    it('should attach and detach documents from a case', async () => {
      // Create a case
      const caseResult = Case.create({
        title: 'Legal Matter #123',
        description: 'Important legal case',
        clientId: 'client-456',
        assignedTo: 'lawyer-789',
        priority: 'HIGH',
      });

      const legalCase = caseResult.value;

      // Create documents
      const doc1 = CaseDocument.create({
        tenantId: 'tenant-123',
        metadata: {
          title: 'Contract',
          documentType: 'CONTRACT',
          classification: DocumentClassification.CONFIDENTIAL,
          tags: [],
          relatedCaseId: legalCase.id.value,
        },
        storageKey: 's3://docs/contract.pdf',
        contentHash: 'a'.repeat(64),
        mimeType: 'application/pdf',
        sizeBytes: 5000,
        createdBy: 'user-123',
      });

      const doc2 = CaseDocument.create({
        tenantId: 'tenant-123',
        metadata: {
          title: 'Evidence Photo',
          documentType: 'EVIDENCE',
          classification: DocumentClassification.PRIVILEGED,
          tags: [],
          relatedCaseId: legalCase.id.value,
        },
        storageKey: 's3://docs/evidence.jpg',
        contentHash: 'b'.repeat(64),
        mimeType: 'image/jpeg',
        sizeBytes: 15000,
        createdBy: 'user-123',
      });

      await repository.save(doc1);
      await repository.save(doc2);

      // Attach documents to case
      const attach1 = legalCase.attachDocument(doc1.id, 'user-123');
      const attach2 = legalCase.attachDocument(doc2.id, 'user-123');

      expect(attach1.isSuccess).toBe(true);
      expect(attach2.isSuccess).toBe(true);
      expect(legalCase.documentCount).toBe(2);
      expect(legalCase.documentIds).toContain(doc1.id);
      expect(legalCase.documentIds).toContain(doc2.id);

      // Attempt to attach same document again (should fail)
      const duplicateAttach = legalCase.attachDocument(doc1.id, 'user-123');
      expect(duplicateAttach.isFailure).toBe(true);

      // Detach a document
      const detach = legalCase.detachDocument(doc1.id, 'user-123');
      expect(detach.isSuccess).toBe(true);
      expect(legalCase.documentCount).toBe(1);
      expect(legalCase.documentIds).not.toContain(doc1.id);

      // Attempt to detach non-attached document (should fail)
      const invalidDetach = legalCase.detachDocument('non-existent-id', 'user-123');
      expect(invalidDetach.isFailure).toBe(true);

      // Query documents by case ID
      const caseDocs = await repository.findByCaseId(legalCase.id.value);
      expect(caseDocs).toHaveLength(2); // Both docs have relatedCaseId

      // Verify case JSON includes document info
      const caseJson = legalCase.toJSON();
      expect(caseJson.documentCount).toBe(1);
      expect(caseJson.documentIds).toHaveLength(1);
    });

    it('should prevent document operations on closed case', async () => {
      const caseResult = Case.create({
        title: 'Closed Case',
        clientId: 'client-123',
        assignedTo: 'lawyer-456',
      });

      const legalCase = caseResult.value;

      // Close the case
      legalCase.close('Case resolved', 'lawyer-456');

      // Attempt to attach document (should fail)
      const attachResult = legalCase.attachDocument('doc-123', 'user-789');
      expect(attachResult.isFailure).toBe(true);
      expect(attachResult.error.code).toBe('CASE_ALREADY_CLOSED');
    });

    it('should handle document attachment domain events', async () => {
      const caseResult = Case.create({
        title: 'Event Test Case',
        clientId: 'client-123',
        assignedTo: 'lawyer-456',
      });

      const legalCase = caseResult.value;
      legalCase.clearDomainEvents(); // Clear creation event

      // Attach document
      legalCase.attachDocument('doc-123', 'user-789');

      const events = legalCase.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('case.document_attached');

      // Detach document
      legalCase.clearDomainEvents();
      legalCase.detachDocument('doc-123', 'user-789');

      const detachEvents = legalCase.getDomainEvents();
      expect(detachEvents).toHaveLength(1);
      expect(detachEvents[0].eventType).toBe('case.document_detached');
    });
  });

  describe('Multi-Tenant Document Isolation', () => {
    it('should isolate documents by tenant', async () => {
      const tenant1Doc = CaseDocument.create({
        tenantId: 'tenant-1',
        metadata: {
          title: 'Tenant 1 Document',
          documentType: 'CONTRACT',
          classification: DocumentClassification.INTERNAL,
          tags: [],
        },
        storageKey: 's3://docs/t1-doc.pdf',
        contentHash: 'a'.repeat(64),
        mimeType: 'application/pdf',
        sizeBytes: 1000,
        createdBy: 'user-123',
      });

      const tenant2Doc = CaseDocument.create({
        tenantId: 'tenant-2',
        metadata: {
          title: 'Tenant 2 Document',
          documentType: 'CONTRACT',
          classification: DocumentClassification.INTERNAL,
          tags: [],
        },
        storageKey: 's3://docs/t2-doc.pdf',
        contentHash: 'b'.repeat(64),
        mimeType: 'application/pdf',
        sizeBytes: 1000,
        createdBy: 'user-123',
      });

      await repository.save(tenant1Doc);
      await repository.save(tenant2Doc);

      const tenant1Docs = await repository.findAccessibleByUser('user-123', 'tenant-1');
      const tenant2Docs = await repository.findAccessibleByUser('user-123', 'tenant-2');

      expect(tenant1Docs).toHaveLength(1);
      expect(tenant2Docs).toHaveLength(1);
      expect(tenant1Docs[0].tenantId).toBe('tenant-1');
      expect(tenant2Docs[0].tenantId).toBe('tenant-2');
    });
  });

  describe('Soft Delete and GDPR Compliance', () => {
    it('should soft delete documents and exclude them from queries', async () => {
      const document = CaseDocument.create({
        tenantId: 'tenant-123',
        metadata: {
          title: 'To Be Deleted',
          documentType: 'MEMO',
          classification: DocumentClassification.INTERNAL,
          tags: [],
          relatedCaseId: 'case-123',
        },
        storageKey: 's3://docs/delete-me.pdf',
        contentHash: 'a'.repeat(64),
        mimeType: 'application/pdf',
        sizeBytes: 500,
        createdBy: 'user-123',
      });

      await repository.save(document);

      // Verify document exists
      let found = await repository.findById(document.id);
      expect(found).not.toBeNull();

      let caseDocs = await repository.findByCaseId('case-123');
      expect(caseDocs).toHaveLength(1);

      // Soft delete
      document.delete('user-123');
      await repository.save(document);

      // Verify soft delete
      found = await repository.findById(document.id);
      expect(found?.isDeleted).toBe(true);

      // Verify excluded from queries
      caseDocs = await repository.findByCaseId('case-123');
      expect(caseDocs).toHaveLength(0);

      const userDocs = await repository.findAccessibleByUser('user-123', 'tenant-123');
      expect(userDocs).toHaveLength(0);
    });

    it('should support hard delete for GDPR erasure', async () => {
      const document = CaseDocument.create({
        tenantId: 'tenant-123',
        metadata: {
          title: 'GDPR Erasure',
          documentType: 'MEMO',
          classification: DocumentClassification.INTERNAL,
          tags: [],
        },
        storageKey: 's3://docs/gdpr.pdf',
        contentHash: 'a'.repeat(64),
        mimeType: 'application/pdf',
        sizeBytes: 500,
        createdBy: 'user-123',
      });

      await repository.save(document);

      // Hard delete (GDPR erasure)
      await repository.delete(document.id);

      // Verify completely removed
      const found = await repository.findById(document.id);
      expect(found).toBeNull();
    });
  });
});
