/**
 * Case Document Domain Model Tests
 *
 * Comprehensive tests for case-document.ts covering:
 * - DocumentVersion value object (creation, parsing, comparison, incrementing)
 * - CaseDocument entity (creation, persistence, getters)
 * - Access control (grant, revoke, check, expiration)
 * - Document lifecycle (submit, approve, reject, sign, archive, delete)
 * - Versioning (major, minor, patch)
 * - Legal hold (place, release, delete prevention)
 * - Zod schemas validation
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  DocumentVersion,
  AccessLevel,
  DocumentClassification,
  DocumentStatus,
  CaseDocument,
  DOCUMENT_TYPES,
  documentVersionSchema,
  accessControlEntrySchema,
  caseDocumentMetadataSchema,
  caseDocumentSchema,
  type CaseDocumentMetadata,
  type CaseDocumentData,
  type AccessControlEntry,
} from '../case-document';

// ============================================================================
// Helpers
// ============================================================================

const VALID_UUID = '00000000-0000-4000-8000-000000000001';
const VALID_UUID_2 = '00000000-0000-4000-8000-000000000002';
const VALID_UUID_3 = '00000000-0000-4000-8000-000000000003';
const VALID_CONTENT_HASH = 'a'.repeat(64);
const VALID_CONTENT_HASH_2 = 'b'.repeat(64);
const VALID_SIGNATURE_HASH = 'cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce';

function makeMetadata(overrides?: Partial<CaseDocumentMetadata>): CaseDocumentMetadata {
  return {
    title: 'Test Document',
    documentType: 'CONTRACT',
    classification: DocumentClassification.INTERNAL,
    tags: [],
    ...overrides,
  };
}

function createDoc(overrides?: Record<string, unknown>): CaseDocument {
  return CaseDocument.create({
    tenantId: VALID_UUID,
    metadata: makeMetadata(),
    storageKey: 'documents/test-doc.pdf',
    contentHash: VALID_CONTENT_HASH,
    mimeType: 'application/pdf',
    sizeBytes: 1024,
    createdBy: VALID_UUID_2,
    ...(overrides as any),
  });
}

// ============================================================================
// DocumentVersion value object
// ============================================================================

describe('DocumentVersion', () => {
  describe('initial', () => {
    it('should create version 1.0.0', () => {
      const v = DocumentVersion.initial();
      expect(v.major).toBe(1);
      expect(v.minor).toBe(0);
      expect(v.patch).toBe(0);
      expect(v.toString()).toBe('1.0.0');
    });
  });

  describe('fromString', () => {
    it('should parse valid version string', () => {
      const v = DocumentVersion.fromString('3.2.1');
      expect(v.major).toBe(3);
      expect(v.minor).toBe(2);
      expect(v.patch).toBe(1);
    });

    it('should throw on invalid format', () => {
      expect(() => DocumentVersion.fromString('1.0')).toThrow('Invalid version format');
      expect(() => DocumentVersion.fromString('abc')).toThrow('Invalid version format');
      expect(() => DocumentVersion.fromString('')).toThrow('Invalid version format');
      expect(() => DocumentVersion.fromString('1.0.0.0')).toThrow('Invalid version format');
    });

    it('should throw when major is 0', () => {
      expect(() => DocumentVersion.fromString('0.1.0')).toThrow('Major version must be >= 1');
    });

    it('should throw when minor is negative (cannot parse negative from regex)', () => {
      // The regex won't match negative numbers, so it throws invalid format
      expect(() => DocumentVersion.fromString('1.-1.0')).toThrow('Invalid version format');
    });
  });

  describe('toString', () => {
    it('should format version as semantic string', () => {
      const v = DocumentVersion.fromString('2.5.3');
      expect(v.toString()).toBe('2.5.3');
    });
  });

  describe('incrementMajor', () => {
    it('should increment major and reset minor and patch', () => {
      const v = DocumentVersion.fromString('2.3.4');
      const next = v.incrementMajor();
      expect(next.toString()).toBe('3.0.0');
    });
  });

  describe('incrementMinor', () => {
    it('should increment minor and reset patch', () => {
      const v = DocumentVersion.fromString('2.3.4');
      const next = v.incrementMinor();
      expect(next.toString()).toBe('2.4.0');
    });
  });

  describe('incrementPatch', () => {
    it('should increment patch only', () => {
      const v = DocumentVersion.fromString('2.3.4');
      const next = v.incrementPatch();
      expect(next.toString()).toBe('2.3.5');
    });
  });

  describe('isNewerThan', () => {
    it('should compare major versions', () => {
      const v1 = DocumentVersion.fromString('2.0.0');
      const v2 = DocumentVersion.fromString('1.9.9');
      expect(v1.isNewerThan(v2)).toBe(true);
      expect(v2.isNewerThan(v1)).toBe(false);
    });

    it('should compare minor versions when major is equal', () => {
      const v1 = DocumentVersion.fromString('2.3.0');
      const v2 = DocumentVersion.fromString('2.2.9');
      expect(v1.isNewerThan(v2)).toBe(true);
      expect(v2.isNewerThan(v1)).toBe(false);
    });

    it('should compare patch versions when major and minor are equal', () => {
      const v1 = DocumentVersion.fromString('2.3.5');
      const v2 = DocumentVersion.fromString('2.3.4');
      expect(v1.isNewerThan(v2)).toBe(true);
      expect(v2.isNewerThan(v1)).toBe(false);
    });

    it('should return false for equal versions', () => {
      const v1 = DocumentVersion.fromString('2.3.4');
      const v2 = DocumentVersion.fromString('2.3.4');
      expect(v1.isNewerThan(v2)).toBe(false);
    });
  });
});

// ============================================================================
// Enums & Constants
// ============================================================================

describe('DOCUMENT_TYPES', () => {
  it('should include all expected types', () => {
    expect(DOCUMENT_TYPES).toEqual([
      'CONTRACT',
      'AGREEMENT',
      'EVIDENCE',
      'CORRESPONDENCE',
      'COURT_FILING',
      'MEMO',
      'REPORT',
      'OTHER',
    ]);
  });
});

describe('AccessLevel', () => {
  it('should have all expected levels', () => {
    expect(AccessLevel.NONE).toBe('NONE');
    expect(AccessLevel.VIEW).toBe('VIEW');
    expect(AccessLevel.COMMENT).toBe('COMMENT');
    expect(AccessLevel.EDIT).toBe('EDIT');
    expect(AccessLevel.ADMIN).toBe('ADMIN');
  });
});

describe('DocumentClassification', () => {
  it('should have all expected classifications', () => {
    expect(DocumentClassification.PUBLIC).toBe('PUBLIC');
    expect(DocumentClassification.INTERNAL).toBe('INTERNAL');
    expect(DocumentClassification.CONFIDENTIAL).toBe('CONFIDENTIAL');
    expect(DocumentClassification.PRIVILEGED).toBe('PRIVILEGED');
  });
});

describe('DocumentStatus', () => {
  it('should have all expected statuses', () => {
    expect(DocumentStatus.DRAFT).toBe('DRAFT');
    expect(DocumentStatus.UNDER_REVIEW).toBe('UNDER_REVIEW');
    expect(DocumentStatus.APPROVED).toBe('APPROVED');
    expect(DocumentStatus.SIGNED).toBe('SIGNED');
    expect(DocumentStatus.ARCHIVED).toBe('ARCHIVED');
    expect(DocumentStatus.SUPERSEDED).toBe('SUPERSEDED');
  });
});

// ============================================================================
// Zod Schemas
// ============================================================================

describe('Zod Schemas', () => {
  describe('documentVersionSchema', () => {
    it('should accept valid version', () => {
      expect(documentVersionSchema.safeParse({ major: 1, minor: 0, patch: 0 }).success).toBe(true);
    });

    it('should reject major < 1', () => {
      expect(documentVersionSchema.safeParse({ major: 0, minor: 0, patch: 0 }).success).toBe(false);
    });

    it('should reject negative minor', () => {
      expect(documentVersionSchema.safeParse({ major: 1, minor: -1, patch: 0 }).success).toBe(
        false
      );
    });

    it('should reject negative patch', () => {
      expect(documentVersionSchema.safeParse({ major: 1, minor: 0, patch: -1 }).success).toBe(
        false
      );
    });
  });

  describe('accessControlEntrySchema', () => {
    it('should accept valid ACE', () => {
      const ace = {
        principalId: VALID_UUID,
        principalType: 'USER',
        accessLevel: AccessLevel.VIEW,
        grantedBy: VALID_UUID_2,
        grantedAt: new Date(),
      };
      expect(accessControlEntrySchema.safeParse(ace).success).toBe(true);
    });

    it('should accept ACE with expiresAt', () => {
      const ace = {
        principalId: VALID_UUID,
        principalType: 'ROLE',
        accessLevel: AccessLevel.EDIT,
        grantedBy: VALID_UUID_2,
        grantedAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
      };
      expect(accessControlEntrySchema.safeParse(ace).success).toBe(true);
    });

    it('should accept TENANT principal type', () => {
      const ace = {
        principalId: VALID_UUID,
        principalType: 'TENANT',
        accessLevel: AccessLevel.ADMIN,
        grantedBy: VALID_UUID_2,
        grantedAt: new Date(),
      };
      expect(accessControlEntrySchema.safeParse(ace).success).toBe(true);
    });

    it('should reject invalid principal type', () => {
      const ace = {
        principalId: VALID_UUID,
        principalType: 'INVALID',
        accessLevel: AccessLevel.VIEW,
        grantedBy: VALID_UUID_2,
        grantedAt: new Date(),
      };
      expect(accessControlEntrySchema.safeParse(ace).success).toBe(false);
    });

    it('should reject non-UUID principalId', () => {
      const ace = {
        principalId: 'not-a-uuid',
        principalType: 'USER',
        accessLevel: AccessLevel.VIEW,
        grantedBy: VALID_UUID_2,
        grantedAt: new Date(),
      };
      expect(accessControlEntrySchema.safeParse(ace).success).toBe(false);
    });
  });

  describe('caseDocumentMetadataSchema', () => {
    it('should accept valid metadata', () => {
      const result = caseDocumentMetadataSchema.safeParse(makeMetadata());
      expect(result.success).toBe(true);
    });

    it('should accept all document types', () => {
      for (const dt of DOCUMENT_TYPES) {
        const result = caseDocumentMetadataSchema.safeParse(makeMetadata({ documentType: dt }));
        expect(result.success).toBe(true);
      }
    });

    it('should accept metadata with optional fields', () => {
      const result = caseDocumentMetadataSchema.safeParse(
        makeMetadata({
          description: 'A test document',
          relatedCaseId: VALID_UUID,
          relatedContactId: VALID_UUID_2,
          tags: ['important', 'legal'],
        })
      );
      expect(result.success).toBe(true);
    });

    it('should reject empty title', () => {
      const result = caseDocumentMetadataSchema.safeParse(makeMetadata({ title: '' }));
      expect(result.success).toBe(false);
    });

    it('should reject title over 255 chars', () => {
      const result = caseDocumentMetadataSchema.safeParse(makeMetadata({ title: 'x'.repeat(256) }));
      expect(result.success).toBe(false);
    });

    it('should reject description over 2000 chars', () => {
      const result = caseDocumentMetadataSchema.safeParse(
        makeMetadata({ description: 'x'.repeat(2001) })
      );
      expect(result.success).toBe(false);
    });

    it('should reject tags array exceeding max 20', () => {
      const tags = Array.from({ length: 21 }, (_, i) => `tag-${i}`);
      const result = caseDocumentMetadataSchema.safeParse(makeMetadata({ tags }));
      expect(result.success).toBe(false);
    });

    it('should reject individual tag over 50 chars', () => {
      const result = caseDocumentMetadataSchema.safeParse(makeMetadata({ tags: ['x'.repeat(51)] }));
      expect(result.success).toBe(false);
    });

    it('should reject invalid document type', () => {
      const result = caseDocumentMetadataSchema.safeParse(
        makeMetadata({ documentType: 'INVALID' as any })
      );
      expect(result.success).toBe(false);
    });
  });
});

// ============================================================================
// CaseDocument Entity
// ============================================================================

describe('CaseDocument', () => {
  describe('create', () => {
    it('should create a new document in DRAFT status', () => {
      const doc = createDoc();

      expect(doc.id).toBeTruthy();
      expect(doc.tenantId).toBe(VALID_UUID);
      expect(doc.status).toBe(DocumentStatus.DRAFT);
      expect(doc.version.toString()).toBe('1.0.0');
      expect(doc.metadata.title).toBe('Test Document');
      expect(doc.storageKey).toBe('documents/test-doc.pdf');
      expect(doc.contentHash).toBe(VALID_CONTENT_HASH);
      expect(doc.acl).toEqual([]);
      expect(doc.isLatestVersion).toBe(true);
      expect(doc.isDeleted).toBe(false);
    });

    it('should create a document with all metadata fields', () => {
      const doc = CaseDocument.create({
        tenantId: VALID_UUID,
        metadata: makeMetadata({
          description: 'Detailed description',
          relatedCaseId: VALID_UUID_3,
          relatedContactId: VALID_UUID_2,
          tags: ['urgent', 'review'],
        }),
        storageKey: 'docs/contract.pdf',
        contentHash: VALID_CONTENT_HASH,
        mimeType: 'application/pdf',
        sizeBytes: 2048,
        createdBy: VALID_UUID_2,
      });

      expect(doc.metadata.description).toBe('Detailed description');
      expect(doc.metadata.tags).toEqual(['urgent', 'review']);
    });
  });

  describe('fromPersistence', () => {
    it('should reconstruct from persistence data', () => {
      const doc = createDoc();
      const json = doc.toJSON();
      const restored = CaseDocument.fromPersistence(json);

      expect(restored.id).toBe(doc.id);
      expect(restored.tenantId).toBe(doc.tenantId);
      expect(restored.status).toBe(doc.status);
      expect(restored.version.toString()).toBe('1.0.0');
    });
  });

  describe('toJSON', () => {
    it('should serialize to plain data object', () => {
      const doc = createDoc();
      const json = doc.toJSON();

      expect(json.id).toBe(doc.id);
      expect(json.tenantId).toBe(VALID_UUID);
      expect(json.status).toBe(DocumentStatus.DRAFT);
      expect(json.version).toEqual({ major: 1, minor: 0, patch: 0 });
    });
  });

  // ========== Access Control ==========

  describe('grantAccess', () => {
    it('should add an ACL entry', () => {
      const doc = createDoc();
      doc.grantAccess(VALID_UUID_3, 'USER', AccessLevel.VIEW, VALID_UUID_2);

      expect(doc.acl).toHaveLength(1);
      expect(doc.acl[0].principalId).toBe(VALID_UUID_3);
      expect(doc.acl[0].principalType).toBe('USER');
      expect(doc.acl[0].accessLevel).toBe(AccessLevel.VIEW);
      expect(doc.acl[0].grantedBy).toBe(VALID_UUID_2);
    });

    it('should replace existing ACL entry for same principal', () => {
      const doc = createDoc();
      doc.grantAccess(VALID_UUID_3, 'USER', AccessLevel.VIEW, VALID_UUID_2);
      doc.grantAccess(VALID_UUID_3, 'USER', AccessLevel.EDIT, VALID_UUID_2);

      expect(doc.acl).toHaveLength(1);
      expect(doc.acl[0].accessLevel).toBe(AccessLevel.EDIT);
    });

    it('should support time-limited access with expiresAt', () => {
      const doc = createDoc();
      const expiry = new Date(Date.now() + 86400000);
      doc.grantAccess(VALID_UUID_3, 'USER', AccessLevel.VIEW, VALID_UUID_2, expiry);

      expect(doc.acl[0].expiresAt).toEqual(expiry);
    });

    it('should support ROLE and TENANT principal types', () => {
      const doc = createDoc();
      doc.grantAccess(VALID_UUID_3, 'ROLE', AccessLevel.COMMENT, VALID_UUID_2);
      doc.grantAccess(VALID_UUID, 'TENANT', AccessLevel.ADMIN, VALID_UUID_2);

      expect(doc.acl).toHaveLength(2);
      expect(doc.acl[0].principalType).toBe('ROLE');
      expect(doc.acl[1].principalType).toBe('TENANT');
    });
  });

  describe('revokeAccess', () => {
    it('should remove ACL entry for the principal', () => {
      const doc = createDoc();
      doc.grantAccess(VALID_UUID_3, 'USER', AccessLevel.VIEW, VALID_UUID_2);
      expect(doc.acl).toHaveLength(1);

      doc.revokeAccess(VALID_UUID_3, VALID_UUID_2);
      expect(doc.acl).toHaveLength(0);
    });

    it('should only remove the targeted principal', () => {
      const doc = createDoc();
      doc.grantAccess(VALID_UUID_2, 'USER', AccessLevel.VIEW, VALID_UUID);
      doc.grantAccess(VALID_UUID_3, 'USER', AccessLevel.EDIT, VALID_UUID);

      doc.revokeAccess(VALID_UUID_2, VALID_UUID);

      expect(doc.acl).toHaveLength(1);
      expect(doc.acl[0].principalId).toBe(VALID_UUID_3);
    });
  });

  describe('hasAccess', () => {
    it('should return false if principal has no ACL entry', () => {
      const doc = createDoc();
      expect(doc.hasAccess('unknown-id', AccessLevel.VIEW)).toBe(false);
    });

    it('should return true for exact level match', () => {
      const doc = createDoc();
      doc.grantAccess(VALID_UUID_3, 'USER', AccessLevel.VIEW, VALID_UUID_2);
      expect(doc.hasAccess(VALID_UUID_3, AccessLevel.VIEW)).toBe(true);
    });

    it('should return true for higher level than required', () => {
      const doc = createDoc();
      doc.grantAccess(VALID_UUID_3, 'USER', AccessLevel.ADMIN, VALID_UUID_2);
      expect(doc.hasAccess(VALID_UUID_3, AccessLevel.VIEW)).toBe(true);
      expect(doc.hasAccess(VALID_UUID_3, AccessLevel.COMMENT)).toBe(true);
      expect(doc.hasAccess(VALID_UUID_3, AccessLevel.EDIT)).toBe(true);
    });

    it('should return false for lower level than required', () => {
      const doc = createDoc();
      doc.grantAccess(VALID_UUID_3, 'USER', AccessLevel.VIEW, VALID_UUID_2);
      expect(doc.hasAccess(VALID_UUID_3, AccessLevel.EDIT)).toBe(false);
      expect(doc.hasAccess(VALID_UUID_3, AccessLevel.ADMIN)).toBe(false);
    });

    it('should return false for expired access', () => {
      const doc = createDoc();
      const pastDate = new Date(Date.now() - 86400000);
      doc.grantAccess(VALID_UUID_3, 'USER', AccessLevel.VIEW, VALID_UUID_2, pastDate);

      expect(doc.hasAccess(VALID_UUID_3, AccessLevel.VIEW)).toBe(false);
    });

    it('should return true for non-expired access', () => {
      const doc = createDoc();
      const futureDate = new Date(Date.now() + 86400000);
      doc.grantAccess(VALID_UUID_3, 'USER', AccessLevel.VIEW, VALID_UUID_2, futureDate);

      expect(doc.hasAccess(VALID_UUID_3, AccessLevel.VIEW)).toBe(true);
    });

    it('should handle NONE access level', () => {
      const doc = createDoc();
      doc.grantAccess(VALID_UUID_3, 'USER', AccessLevel.NONE, VALID_UUID_2);

      expect(doc.hasAccess(VALID_UUID_3, AccessLevel.NONE)).toBe(true);
      expect(doc.hasAccess(VALID_UUID_3, AccessLevel.VIEW)).toBe(false);
    });
  });

  // ========== Versioning ==========

  describe('createMajorVersion', () => {
    it('should create new document with incremented major version', () => {
      const doc = createDoc();
      const newDoc = doc.createMajorVersion(VALID_UUID_2, 'new-key', VALID_CONTENT_HASH_2);

      expect(newDoc.version.toString()).toBe('2.0.0');
      expect(newDoc.status).toBe(DocumentStatus.DRAFT);
      expect(newDoc.isLatestVersion).toBe(true);

      // Original should be superseded
      expect(doc.status).toBe(DocumentStatus.SUPERSEDED);
      expect(doc.isLatestVersion).toBe(false);
    });

    it('should set parentVersionId to original document id', () => {
      const doc = createDoc();
      const originalId = doc.id;
      const newDoc = doc.createMajorVersion(VALID_UUID_2, 'new-key', VALID_CONTENT_HASH_2);

      const json = newDoc.toJSON();
      expect(json.parentVersionId).toBe(originalId);
    });
  });

  describe('createMinorVersion', () => {
    it('should create new document with incremented minor version', () => {
      const doc = createDoc();
      const newDoc = doc.createMinorVersion(VALID_UUID_2, 'new-key', VALID_CONTENT_HASH_2);

      expect(newDoc.version.toString()).toBe('1.1.0');
      expect(newDoc.status).toBe(DocumentStatus.DRAFT);
    });
  });

  describe('createPatchVersion', () => {
    it('should create new document with incremented patch version', () => {
      const doc = createDoc();
      const newDoc = doc.createPatchVersion(VALID_UUID_2, 'new-key', VALID_CONTENT_HASH_2);

      expect(newDoc.version.toString()).toBe('1.0.1');
      expect(newDoc.status).toBe(DocumentStatus.DRAFT);
    });
  });

  // ========== Lifecycle Methods ==========

  describe('submitForReview', () => {
    it('should transition from DRAFT to UNDER_REVIEW', () => {
      const doc = createDoc();
      doc.submitForReview(VALID_UUID_2);
      expect(doc.status).toBe(DocumentStatus.UNDER_REVIEW);
    });

    it('should throw if not in DRAFT status', () => {
      const doc = createDoc();
      doc.submitForReview(VALID_UUID_2);
      expect(() => doc.submitForReview(VALID_UUID_2)).toThrow(
        'Only draft documents can be submitted for review'
      );
    });
  });

  describe('approve', () => {
    it('should transition from UNDER_REVIEW to APPROVED', () => {
      const doc = createDoc();
      doc.submitForReview(VALID_UUID_2);
      doc.approve(VALID_UUID_3);
      expect(doc.status).toBe(DocumentStatus.APPROVED);
    });

    it('should throw if not UNDER_REVIEW', () => {
      const doc = createDoc();
      expect(() => doc.approve(VALID_UUID_2)).toThrow(
        'Only documents under review can be approved'
      );
    });
  });

  describe('reject', () => {
    it('should transition from UNDER_REVIEW back to DRAFT', () => {
      const doc = createDoc();
      doc.submitForReview(VALID_UUID_2);
      doc.reject(VALID_UUID_3, 'Needs revisions');
      expect(doc.status).toBe(DocumentStatus.DRAFT);
    });

    it('should throw if not UNDER_REVIEW', () => {
      const doc = createDoc();
      expect(() => doc.reject(VALID_UUID_2, 'reason')).toThrow(
        'Only documents under review can be rejected'
      );
    });
  });

  describe('sign', () => {
    it('should accept signatureHash as 4th parameter and store it as-is', () => {
      const doc = createDoc();
      doc.submitForReview(VALID_UUID_2);
      doc.approve(VALID_UUID_3);
      doc.sign(VALID_UUID_3, '192.168.1.1', 'Mozilla/5.0', VALID_SIGNATURE_HASH);

      expect(doc.status).toBe(DocumentStatus.SIGNED);
      const json = doc.toJSON();
      expect(json.eSignature).toBeDefined();
      expect(json.eSignature!.signedBy).toBe(VALID_UUID_3);
      expect(json.eSignature!.ipAddress).toBe('192.168.1.1');
      expect(json.eSignature!.userAgent).toBe('Mozilla/5.0');
      expect(json.eSignature!.signatureHash).toBe(VALID_SIGNATURE_HASH);
    });

    it('should transition status from APPROVED to SIGNED', () => {
      const doc = createDoc();
      doc.submitForReview(VALID_UUID_2);
      doc.approve(VALID_UUID_3);
      expect(doc.status).toBe(DocumentStatus.APPROVED);

      doc.sign(VALID_UUID_3, '10.0.0.1', 'Chrome/120', VALID_SIGNATURE_HASH);
      expect(doc.status).toBe(DocumentStatus.SIGNED);
    });

    it('should throw if not APPROVED', () => {
      const doc = createDoc();
      expect(() => doc.sign(VALID_UUID_2, '127.0.0.1', 'Test', VALID_SIGNATURE_HASH)).toThrow(
        'Only approved documents can be signed'
      );
    });

    it('should reject signatureHash that does not match ^[a-f0-9]{64}$ format', () => {
      const doc = createDoc();
      doc.submitForReview(VALID_UUID_2);
      doc.approve(VALID_UUID_3);

      // Too short
      expect(() => doc.sign(VALID_UUID_3, '127.0.0.1', 'UA', 'abc123')).toThrow(
        'signatureHash must be a valid 64-character lowercase hex string'
      );

      // Uppercase hex
      expect(() =>
        doc.sign(VALID_UUID_3, '127.0.0.1', 'UA', 'CF83E1357EEFB8BDF1542850D66D8007D620E4050B5715DC83F4A921D36CE9CE')
      ).toThrow('signatureHash must be a valid 64-character lowercase hex string');

      // Non-hex chars
      expect(() =>
        doc.sign(VALID_UUID_3, '127.0.0.1', 'UA', 'zz83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce')
      ).toThrow('signatureHash must be a valid 64-character lowercase hex string');
    });

    it('should store the provided hash in eSignature.signatureHash as-is', () => {
      const doc = createDoc();
      doc.submitForReview(VALID_UUID_2);
      doc.approve(VALID_UUID_3);
      const specificHash = 'ab'.repeat(32);
      doc.sign(VALID_UUID_3, '10.0.0.1', 'Firefox/120', specificHash);

      const json = doc.toJSON();
      expect(json.eSignature!.signatureHash).toBe(specificHash);
    });
  });

  describe('archive', () => {
    it('should transition to ARCHIVED', () => {
      const doc = createDoc();
      doc.archive(VALID_UUID_2);
      expect(doc.status).toBe(DocumentStatus.ARCHIVED);
    });

    it('should throw if already ARCHIVED', () => {
      const doc = createDoc();
      doc.archive(VALID_UUID_2);
      expect(() => doc.archive(VALID_UUID_2)).toThrow('Document is already archived');
    });

    it('should allow archiving from any non-archived status', () => {
      // DRAFT -> ARCHIVED
      const doc1 = createDoc();
      doc1.archive(VALID_UUID_2);
      expect(doc1.status).toBe(DocumentStatus.ARCHIVED);

      // SIGNED -> ARCHIVED
      const doc2 = createDoc();
      doc2.submitForReview(VALID_UUID_2);
      doc2.approve(VALID_UUID_3);
      doc2.sign(VALID_UUID_3, '127.0.0.1', 'UA', VALID_SIGNATURE_HASH);
      doc2.archive(VALID_UUID_2);
      expect(doc2.status).toBe(DocumentStatus.ARCHIVED);
    });
  });

  describe('delete (soft)', () => {
    it('should set deletedAt on document', () => {
      const doc = createDoc();
      doc.delete(VALID_UUID_2);
      expect(doc.isDeleted).toBe(true);
    });

    it('should throw if already deleted', () => {
      const doc = createDoc();
      doc.delete(VALID_UUID_2);
      expect(() => doc.delete(VALID_UUID_2)).toThrow('Document is already deleted');
    });

    it('should throw if under legal hold', () => {
      const doc = createDoc();
      const futureDate = new Date(Date.now() + 86400000);
      doc.placeLegalHold(futureDate, VALID_UUID_2);

      expect(() => doc.delete(VALID_UUID_2)).toThrow('Cannot delete document under legal hold');
    });

    it('should allow delete if legal hold has expired', () => {
      const doc = createDoc();
      const pastDate = new Date(Date.now() - 86400000);
      doc.placeLegalHold(pastDate, VALID_UUID_2);

      doc.delete(VALID_UUID_2);
      expect(doc.isDeleted).toBe(true);
    });
  });

  describe('placeLegalHold', () => {
    it('should set retentionUntil date', () => {
      const doc = createDoc();
      const retainUntil = new Date(Date.now() + 365 * 86400000);
      doc.placeLegalHold(retainUntil, VALID_UUID_2);

      const json = doc.toJSON();
      expect(json.retentionUntil).toEqual(retainUntil);
    });
  });

  describe('releaseLegalHold', () => {
    it('should clear retentionUntil', () => {
      const doc = createDoc();
      const retainUntil = new Date(Date.now() + 365 * 86400000);
      doc.placeLegalHold(retainUntil, VALID_UUID_2);
      doc.releaseLegalHold(VALID_UUID_3);

      const json = doc.toJSON();
      expect(json.retentionUntil).toBeUndefined();
    });
  });

  // ========== Full Lifecycle Flow ==========

  describe('full lifecycle flow', () => {
    it('should support DRAFT -> UNDER_REVIEW -> APPROVED -> SIGNED -> ARCHIVED', () => {
      const doc = createDoc();
      expect(doc.status).toBe(DocumentStatus.DRAFT);

      doc.submitForReview(VALID_UUID_2);
      expect(doc.status).toBe(DocumentStatus.UNDER_REVIEW);

      doc.approve(VALID_UUID_3);
      expect(doc.status).toBe(DocumentStatus.APPROVED);

      doc.sign(VALID_UUID_3, '10.0.0.1', 'Chrome/120', VALID_SIGNATURE_HASH);
      expect(doc.status).toBe(DocumentStatus.SIGNED);

      doc.archive(VALID_UUID_2);
      expect(doc.status).toBe(DocumentStatus.ARCHIVED);
    });

    it('should support DRAFT -> UNDER_REVIEW -> reject -> DRAFT -> resubmit cycle', () => {
      const doc = createDoc();
      doc.submitForReview(VALID_UUID_2);
      doc.reject(VALID_UUID_3, 'Needs changes');
      expect(doc.status).toBe(DocumentStatus.DRAFT);

      doc.submitForReview(VALID_UUID_2);
      expect(doc.status).toBe(DocumentStatus.UNDER_REVIEW);

      doc.approve(VALID_UUID_3);
      expect(doc.status).toBe(DocumentStatus.APPROVED);
    });
  });

  // ========== Version chaining ==========

  describe('version chaining', () => {
    it('should support multiple version increments across types', () => {
      const doc = createDoc();
      const v1_1 = doc.createMinorVersion(VALID_UUID_2, 'k1', VALID_CONTENT_HASH_2);
      expect(v1_1.version.toString()).toBe('1.1.0');

      const v1_1_1 = v1_1.createPatchVersion(VALID_UUID_2, 'k2', VALID_CONTENT_HASH);
      expect(v1_1_1.version.toString()).toBe('1.1.1');

      const v2 = v1_1_1.createMajorVersion(VALID_UUID_2, 'k3', VALID_CONTENT_HASH_2);
      expect(v2.version.toString()).toBe('2.0.0');

      // All prior versions should be superseded
      expect(doc.status).toBe(DocumentStatus.SUPERSEDED);
      expect(v1_1.status).toBe(DocumentStatus.SUPERSEDED);
      expect(v1_1_1.status).toBe(DocumentStatus.SUPERSEDED);
    });
  });
});
