/**
 * Case Document Domain Model - IFC-152
 *
 * Implements document versioning, access control, and audit trails for legal case management.
 * Supports e-signature workflows, retention policies, and GDPR compliance.
 */

import { z } from 'zod';

// ============================================================================
// Value Objects
// ============================================================================

/**
 * Document version number with semantic versioning
 */
export class DocumentVersion {
  private constructor(
    public readonly major: number,
    public readonly minor: number,
    public readonly patch: number
  ) {
    if (major < 1) throw new Error('Major version must be >= 1');
    if (minor < 0 || patch < 0) throw new Error('Minor and patch must be >= 0');
  }

  static initial(): DocumentVersion {
    return new DocumentVersion(1, 0, 0);
  }

  static fromString(version: string): DocumentVersion {
    const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
    if (!match) throw new Error(`Invalid version format: ${version}`);
    return new DocumentVersion(
      parseInt(match[1], 10),
      parseInt(match[2], 10),
      parseInt(match[3], 10)
    );
  }

  toString(): string {
    return `${this.major}.${this.minor}.${this.patch}`;
  }

  incrementMajor(): DocumentVersion {
    return new DocumentVersion(this.major + 1, 0, 0);
  }

  incrementMinor(): DocumentVersion {
    return new DocumentVersion(this.major, this.minor + 1, 0);
  }

  incrementPatch(): DocumentVersion {
    return new DocumentVersion(this.major, this.minor, this.patch + 1);
  }

  isNewerThan(other: DocumentVersion): boolean {
    if (this.major !== other.major) return this.major > other.major;
    if (this.minor !== other.minor) return this.minor > other.minor;
    return this.patch > other.patch;
  }
}

/**
 * Access control level for document permissions
 */
export enum AccessLevel {
  NONE = 'NONE',
  VIEW = 'VIEW',
  COMMENT = 'COMMENT',
  EDIT = 'EDIT',
  ADMIN = 'ADMIN',
}

/**
 * Document classification for retention and security
 */
export enum DocumentClassification {
  PUBLIC = 'PUBLIC',
  INTERNAL = 'INTERNAL',
  CONFIDENTIAL = 'CONFIDENTIAL',
  PRIVILEGED = 'PRIVILEGED', // Attorney-client privilege
}

/**
 * Document status in lifecycle
 */
export enum DocumentStatus {
  DRAFT = 'DRAFT',
  UNDER_REVIEW = 'UNDER_REVIEW',
  APPROVED = 'APPROVED',
  SIGNED = 'SIGNED',
  ARCHIVED = 'ARCHIVED',
  SUPERSEDED = 'SUPERSEDED',
}

/**
 * Access control entry mapping user/role to permission level
 */
export interface AccessControlEntry {
  principalId: string; // User ID or Role ID
  principalType: 'USER' | 'ROLE' | 'TENANT';
  accessLevel: AccessLevel;
  grantedBy: string; // User ID who granted access
  grantedAt: Date;
  expiresAt?: Date; // Optional time-limited access
}

// ============================================================================
// Zod Schemas
// ============================================================================

export const documentVersionSchema = z.object({
  major: z.number().int().min(1),
  minor: z.number().int().min(0),
  patch: z.number().int().min(0),
});

export const accessControlEntrySchema = z.object({
  principalId: z.string().uuid(),
  principalType: z.enum(['USER', 'ROLE', 'TENANT']),
  accessLevel: z.nativeEnum(AccessLevel),
  grantedBy: z.string().uuid(),
  grantedAt: z.date(),
  expiresAt: z.date().optional(),
});

export const caseDocumentMetadataSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  documentType: z.enum([
    'CONTRACT',
    'AGREEMENT',
    'EVIDENCE',
    'CORRESPONDENCE',
    'COURT_FILING',
    'MEMO',
    'REPORT',
    'OTHER',
  ]),
  classification: z.nativeEnum(DocumentClassification),
  tags: z.array(z.string().max(50)).max(20).default([]),
  relatedCaseId: z.string().uuid().optional(),
  relatedContactId: z.string().uuid().optional(),
});

export const caseDocumentSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  version: documentVersionSchema,
  status: z.nativeEnum(DocumentStatus),
  metadata: caseDocumentMetadataSchema,
  storageKey: z.string().min(1), // S3 key or file path
  contentHash: z.string().regex(/^[a-f0-9]{64}$/), // SHA-256 hash
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  acl: z.array(accessControlEntrySchema).default([]),
  createdBy: z.string().uuid(),
  createdAt: z.date(),
  updatedBy: z.string().uuid(),
  updatedAt: z.date(),
  parentVersionId: z.string().uuid().optional(), // For version history
  isLatestVersion: z.boolean().default(true),
  retentionUntil: z.date().optional(), // Legal hold or retention policy
  deletedAt: z.date().optional(), // Soft delete
  eSignature: z
    .object({
      signedBy: z.string().uuid(),
      signedAt: z.date(),
      signatureHash: z.string().regex(/^[a-f0-9]{64}$/),
      ipAddress: z.string().min(1),
      userAgent: z.string(),
    })
    .optional(),
});

export type CaseDocumentMetadata = z.infer<typeof caseDocumentMetadataSchema>;
export type CaseDocumentData = z.infer<typeof caseDocumentSchema>;

// ============================================================================
// Domain Entity
// ============================================================================

/**
 * Case Document aggregate root
 *
 * Handles document lifecycle, versioning, and access control with GDPR compliance.
 */
export class CaseDocument {
  private constructor(private data: CaseDocumentData) {}

  // ========== Factory Methods ==========

  static create(params: {
    tenantId: string;
    metadata: CaseDocumentMetadata;
    storageKey: string;
    contentHash: string;
    mimeType: string;
    sizeBytes: number;
    createdBy: string;
  }): CaseDocument {
    const id = crypto.randomUUID();
    const now = new Date();

    const data: CaseDocumentData = {
      id,
      tenantId: params.tenantId,
      version: { major: 1, minor: 0, patch: 0 },
      status: DocumentStatus.DRAFT,
      metadata: params.metadata,
      storageKey: params.storageKey,
      contentHash: params.contentHash,
      mimeType: params.mimeType,
      sizeBytes: params.sizeBytes,
      acl: [],
      createdBy: params.createdBy,
      createdAt: now,
      updatedBy: params.createdBy,
      updatedAt: now,
      isLatestVersion: true,
    };

    const validated = caseDocumentSchema.parse(data);
    return new CaseDocument(validated);
  }

  static fromPersistence(data: CaseDocumentData): CaseDocument {
    const validated = caseDocumentSchema.parse(data);
    return new CaseDocument(validated);
  }

  // ========== Getters ==========

  get id(): string {
    return this.data.id;
  }

  get tenantId(): string {
    return this.data.tenantId;
  }

  get version(): DocumentVersion {
    return DocumentVersion.fromString(
      `${this.data.version.major}.${this.data.version.minor}.${this.data.version.patch}`
    );
  }

  get status(): DocumentStatus {
    return this.data.status;
  }

  get metadata(): CaseDocumentMetadata {
    return this.data.metadata;
  }

  get storageKey(): string {
    return this.data.storageKey;
  }

  get contentHash(): string {
    return this.data.contentHash;
  }

  get acl(): AccessControlEntry[] {
    return this.data.acl;
  }

  get isLatestVersion(): boolean {
    return this.data.isLatestVersion;
  }

  get isDeleted(): boolean {
    return this.data.deletedAt !== undefined;
  }

  toJSON(): CaseDocumentData {
    return { ...this.data };
  }

  // ========== Access Control ==========

  /**
   * Grant access to a user or role
   */
  grantAccess(
    principalId: string,
    principalType: 'USER' | 'ROLE' | 'TENANT',
    accessLevel: AccessLevel,
    grantedBy: string,
    expiresAt?: Date
  ): void {
    // Remove existing ACL for this principal
    this.data.acl = this.data.acl.filter((ace) => ace.principalId !== principalId);

    // Add new ACL entry
    this.data.acl.push({
      principalId,
      principalType,
      accessLevel,
      grantedBy,
      grantedAt: new Date(),
      expiresAt,
    });

    this.data.updatedBy = grantedBy;
    this.data.updatedAt = new Date();
  }

  /**
   * Revoke access from a user or role
   */
  revokeAccess(principalId: string, revokedBy: string): void {
    this.data.acl = this.data.acl.filter((ace) => ace.principalId !== principalId);
    this.data.updatedBy = revokedBy;
    this.data.updatedAt = new Date();
  }

  /**
   * Check if a principal has at least the specified access level
   */
  hasAccess(principalId: string, requiredLevel: AccessLevel): boolean {
    const ace = this.data.acl.find((a) => a.principalId === principalId);
    if (!ace) return false;

    // Check expiration
    if (ace.expiresAt && ace.expiresAt < new Date()) return false;

    // Check access level hierarchy
    const levels = [AccessLevel.NONE, AccessLevel.VIEW, AccessLevel.COMMENT, AccessLevel.EDIT, AccessLevel.ADMIN];
    const userLevel = levels.indexOf(ace.accessLevel);
    const required = levels.indexOf(requiredLevel);

    return userLevel >= required;
  }

  // ========== Versioning ==========

  /**
   * Create a new major version (breaking changes)
   */
  createMajorVersion(updatedBy: string, newStorageKey: string, newContentHash: string): CaseDocument {
    return this.createNewVersion(updatedBy, newStorageKey, newContentHash, 'major');
  }

  /**
   * Create a new minor version (new features)
   */
  createMinorVersion(updatedBy: string, newStorageKey: string, newContentHash: string): CaseDocument {
    return this.createNewVersion(updatedBy, newStorageKey, newContentHash, 'minor');
  }

  /**
   * Create a new patch version (bug fixes)
   */
  createPatchVersion(updatedBy: string, newStorageKey: string, newContentHash: string): CaseDocument {
    return this.createNewVersion(updatedBy, newStorageKey, newContentHash, 'patch');
  }

  private createNewVersion(
    updatedBy: string,
    newStorageKey: string,
    newContentHash: string,
    versionType: 'major' | 'minor' | 'patch'
  ): CaseDocument {
    // Mark current version as superseded and not latest
    this.data.isLatestVersion = false;
    this.data.status = DocumentStatus.SUPERSEDED;

    // Create new version
    const currentVersion = this.version;
    let newVersion: DocumentVersion;
    switch (versionType) {
      case 'major':
        newVersion = currentVersion.incrementMajor();
        break;
      case 'minor':
        newVersion = currentVersion.incrementMinor();
        break;
      case 'patch':
        newVersion = currentVersion.incrementPatch();
        break;
    }

    const newData: CaseDocumentData = {
      ...this.data,
      id: crypto.randomUUID(),
      version: {
        major: newVersion.major,
        minor: newVersion.minor,
        patch: newVersion.patch,
      },
      storageKey: newStorageKey,
      contentHash: newContentHash,
      status: DocumentStatus.DRAFT,
      parentVersionId: this.data.id,
      isLatestVersion: true,
      updatedBy,
      updatedAt: new Date(),
    };

    return new CaseDocument(newData);
  }

  // ========== Lifecycle Methods ==========

  /**
   * Submit document for review
   */
  submitForReview(submittedBy: string): void {
    if (this.data.status !== DocumentStatus.DRAFT) {
      throw new Error('Only draft documents can be submitted for review');
    }

    this.data.status = DocumentStatus.UNDER_REVIEW;
    this.data.updatedBy = submittedBy;
    this.data.updatedAt = new Date();
  }

  /**
   * Approve document
   */
  approve(approvedBy: string): void {
    if (this.data.status !== DocumentStatus.UNDER_REVIEW) {
      throw new Error('Only documents under review can be approved');
    }

    this.data.status = DocumentStatus.APPROVED;
    this.data.updatedBy = approvedBy;
    this.data.updatedAt = new Date();
  }

  /**
   * Reject document back to draft
   */
  reject(rejectedBy: string, reason: string): void {
    if (this.data.status !== DocumentStatus.UNDER_REVIEW) {
      throw new Error('Only documents under review can be rejected');
    }

    this.data.status = DocumentStatus.DRAFT;
    this.data.updatedBy = rejectedBy;
    this.data.updatedAt = new Date();
  }

  /**
   * Sign document with e-signature
   */
  sign(signedBy: string, ipAddress: string, userAgent: string): void {
    if (this.data.status !== DocumentStatus.APPROVED) {
      throw new Error('Only approved documents can be signed');
    }

    // Generate signature hash (document hash + timestamp + signer)
    const signatureData = `${this.data.contentHash}:${new Date().toISOString()}:${signedBy}`;
    const signatureHash = this.hashString(signatureData);

    this.data.eSignature = {
      signedBy,
      signedAt: new Date(),
      signatureHash,
      ipAddress,
      userAgent,
    };

    this.data.status = DocumentStatus.SIGNED;
    this.data.updatedBy = signedBy;
    this.data.updatedAt = new Date();
  }

  /**
   * Archive document (final state)
   */
  archive(archivedBy: string): void {
    if (this.data.status === DocumentStatus.ARCHIVED) {
      throw new Error('Document is already archived');
    }

    this.data.status = DocumentStatus.ARCHIVED;
    this.data.updatedBy = archivedBy;
    this.data.updatedAt = new Date();
  }

  /**
   * Soft delete document (GDPR compliant)
   */
  delete(deletedBy: string): void {
    if (this.data.deletedAt) {
      throw new Error('Document is already deleted');
    }

    // Check for legal hold
    if (this.data.retentionUntil && this.data.retentionUntil > new Date()) {
      throw new Error('Cannot delete document under legal hold');
    }

    this.data.deletedAt = new Date();
    this.data.updatedBy = deletedBy;
    this.data.updatedAt = new Date();
  }

  /**
   * Place legal hold on document
   */
  placeLegalHold(retentionUntil: Date, placedBy: string): void {
    this.data.retentionUntil = retentionUntil;
    this.data.updatedBy = placedBy;
    this.data.updatedAt = new Date();
  }

  /**
   * Release legal hold
   */
  releaseLegalHold(releasedBy: string): void {
    this.data.retentionUntil = undefined;
    this.data.updatedBy = releasedBy;
    this.data.updatedAt = new Date();
  }

  // ========== Helper Methods ==========

  private hashString(input: string): string {
    // Simple hash for demo (in production, use crypto.subtle.digest)
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(64, '0').slice(0, 64);
  }
}

// ============================================================================
// Repository Interface (Port)
// ============================================================================

export interface CaseDocumentRepository {
  /**
   * Save a document (create or update)
   */
  save(document: CaseDocument): Promise<void>;

  /**
   * Find document by ID
   */
  findById(id: string): Promise<CaseDocument | null>;

  /**
   * Find latest version of a document
   */
  findLatestVersion(documentId: string): Promise<CaseDocument | null>;

  /**
   * Find all versions of a document
   */
  findAllVersions(documentId: string): Promise<CaseDocument[]>;

  /**
   * Find documents by case ID
   */
  findByCaseId(caseId: string): Promise<CaseDocument[]>;

  /**
   * Find documents accessible by user
   */
  findAccessibleByUser(userId: string, tenantId: string): Promise<CaseDocument[]>;

  /**
   * Delete document (hard delete for GDPR compliance)
   */
  delete(id: string): Promise<void>;
}

// ============================================================================
// Domain Events
// ============================================================================

export interface DocumentEvent {
  documentId: string;
  tenantId: string;
  userId: string;
  timestamp: Date;
}

export interface DocumentCreatedEvent extends DocumentEvent {
  type: 'DOCUMENT_CREATED';
  metadata: CaseDocumentMetadata;
}

export interface DocumentVersionedEvent extends DocumentEvent {
  type: 'DOCUMENT_VERSIONED';
  previousVersionId: string;
  newVersion: string;
  versionType: 'major' | 'minor' | 'patch';
}

export interface DocumentAccessGrantedEvent extends DocumentEvent {
  type: 'DOCUMENT_ACCESS_GRANTED';
  principalId: string;
  accessLevel: AccessLevel;
}

export interface DocumentSignedEvent extends DocumentEvent {
  type: 'DOCUMENT_SIGNED';
  signatureHash: string;
  ipAddress: string;
}

export interface DocumentArchivedEvent extends DocumentEvent {
  type: 'DOCUMENT_ARCHIVED';
}

export interface DocumentDeletedEvent extends DocumentEvent {
  type: 'DOCUMENT_DELETED';
  reason: 'USER_REQUEST' | 'RETENTION_POLICY' | 'GDPR_ERASURE';
}

export type CaseDocumentEvent =
  | DocumentCreatedEvent
  | DocumentVersionedEvent
  | DocumentAccessGrantedEvent
  | DocumentSignedEvent
  | DocumentArchivedEvent
  | DocumentDeletedEvent;
