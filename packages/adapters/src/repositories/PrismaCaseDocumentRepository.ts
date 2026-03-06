import { PrismaClient } from '@intelliflow/db';
import {
  CaseDocument,
  CaseDocumentRepository,
  CaseDocumentData,
  AccessLevel,
  DocumentStatus,
  DocumentClassification,
  AccessControlEntry,
} from '@intelliflow/domain';

/**
 * Prisma Case Document Repository
 *
 * Maps between domain CaseDocument model and Prisma database schema.
 * Handles ACL persistence, version tracking, and soft deletes.
 */
export class PrismaCaseDocumentRepository implements CaseDocumentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(document: CaseDocument): Promise<void> {
    const data = document.toJSON();

    // Upsert main document record
    await this.prisma.caseDocument.upsert({
      where: { id: data.id },
      create: {
        id: data.id,
        tenantId: data.tenantId,
        versionMajor: data.version.major,
        versionMinor: data.version.minor,
        versionPatch: data.version.patch,
        status: data.status as any,
        title: data.metadata.title,
        description: data.metadata.description || null,
        documentType: data.metadata.documentType as any,
        classification: data.metadata.classification as any,
        tags: data.metadata.tags,
        relatedCaseId: data.metadata.relatedCaseId || null,
        relatedContactId: data.metadata.relatedContactId || null,
        storageKey: data.storageKey,
        contentHash: data.contentHash,
        mimeType: data.mimeType,
        sizeBytes: data.sizeBytes,
        createdBy: data.createdBy,
        updatedBy: data.updatedBy,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        parentVersionId: data.parentVersionId || null,
        isLatestVersion: data.isLatestVersion,
        retentionUntil: data.retentionUntil || null,
        deletedAt: data.deletedAt || null,
        signedBy: data.eSignature?.signedBy || null,
        signedAt: data.eSignature?.signedAt || null,
        signatureHash: data.eSignature?.signatureHash || null,
        signatureIpAddress: data.eSignature?.ipAddress || null,
        signatureUserAgent: data.eSignature?.userAgent || null,
      },
      update: {
        versionMajor: data.version.major,
        versionMinor: data.version.minor,
        versionPatch: data.version.patch,
        status: data.status as any,
        title: data.metadata.title,
        description: data.metadata.description || null,
        documentType: data.metadata.documentType as any,
        classification: data.metadata.classification as any,
        tags: data.metadata.tags,
        relatedCaseId: data.metadata.relatedCaseId || null,
        relatedContactId: data.metadata.relatedContactId || null,
        storageKey: data.storageKey,
        contentHash: data.contentHash,
        updatedBy: data.updatedBy,
        updatedAt: data.updatedAt,
        isLatestVersion: data.isLatestVersion,
        retentionUntil: data.retentionUntil || null,
        deletedAt: data.deletedAt || null,
        signedBy: data.eSignature?.signedBy || null,
        signedAt: data.eSignature?.signedAt || null,
        signatureHash: data.eSignature?.signatureHash || null,
        signatureIpAddress: data.eSignature?.ipAddress || null,
        signatureUserAgent: data.eSignature?.userAgent || null,
      },
    });

    // Update ACL entries
    await this.syncACL(data.id, data.tenantId, data.acl);
  }

  async findById(id: string): Promise<CaseDocument | null> {
    const record = await this.prisma.caseDocument.findUnique({
      where: { id },
      include: { acl: true },
    });

    if (!record) return null;

    return this.toDomain(record);
  }

  async findLatestVersion(documentId: string): Promise<CaseDocument | null> {
    // Find the document marked as latest version in the version chain
    const record = await this.prisma.caseDocument.findFirst({
      where: {
        OR: [
          { id: documentId, isLatestVersion: true },
          { parentVersionId: documentId, isLatestVersion: true },
        ],
      },
      include: { acl: true },
    });

    if (!record) return null;

    return this.toDomain(record);
  }

  async findAllVersions(documentId: string): Promise<CaseDocument[]> {
    // First, find the root document (one with no parent)
    let rootId = documentId;
    let current = await this.prisma.caseDocument.findUnique({
      where: { id: documentId },
    });

    if (!current) return [];

    // Walk up the parent chain to find root
    while (current && current.parentVersionId) {
      rootId = current.parentVersionId;
      const nextDoc = await this.prisma.caseDocument.findUnique({
        where: { id: rootId },
      });
      if (!nextDoc) break;
      current = nextDoc;
    }

    // Now get all versions in the chain
    const versions = await this.findVersionChain(rootId);

    return versions;
  }

  async findByCaseId(caseId: string): Promise<CaseDocument[]> {
    const records = await this.prisma.caseDocument.findMany({
      where: {
        relatedCaseId: caseId,
        deletedAt: null,
        isLatestVersion: true,
      },
      include: { acl: true },
      orderBy: { createdAt: 'desc' },
    });

    return records.map((r) => this.toDomain(r));
  }

  async findAccessibleByUser(userId: string, tenantId: string): Promise<CaseDocument[]> {
    const now = new Date();

    const records = await this.prisma.caseDocument.findMany({
      where: {
        tenantId: tenantId,
        deletedAt: null,
        isLatestVersion: true,
        OR: [
          // User is creator
          { createdBy: userId },
          // User has ACL access
          {
            acl: {
              some: {
                principalId: userId,
                accessLevel: { not: 'NONE' },
                OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
              },
            },
          },
        ],
      },
      include: { acl: true },
      orderBy: { createdAt: 'desc' },
    });

    return records.map((r) => this.toDomain(r));
  }

  async delete(id: string): Promise<void> {
    // Hard delete (for GDPR compliance after retention period)
    await this.prisma.caseDocumentACL.deleteMany({
      where: { documentId: id },
    });

    await this.prisma.caseDocument.delete({
      where: { id },
    });
  }

  /**
   * Recursively find all versions in a document chain
   */
  private async findVersionChain(rootId: string): Promise<CaseDocument[]> {
    const versions: CaseDocument[] = [];
    const toProcess = [rootId];
    const visited = new Set<string>();

    while (toProcess.length > 0) {
      const currentId = toProcess.shift()!;
      if (visited.has(currentId)) continue;
      visited.add(currentId);

      const doc = await this.prisma.caseDocument.findUnique({
        where: { id: currentId },
        include: { acl: true },
      });

      if (!doc) continue;

      versions.push(this.toDomain(doc));

      // Find children (documents with this as parent)
      const children = await this.prisma.caseDocument.findMany({
        where: { parentVersionId: currentId },
        select: { id: true },
      });

      toProcess.push(...children.map((c) => c.id));
    }

    // Sort by version
    versions.sort((a, b) => {
      const aVer = a.version;
      const bVer = b.version;
      if (aVer.major !== bVer.major) return aVer.major - bVer.major;
      if (aVer.minor !== bVer.minor) return aVer.minor - bVer.minor;
      return aVer.patch - bVer.patch;
    });

    return versions;
  }

  /**
   * Sync ACL entries for a document
   */
  private async syncACL(
    documentId: string,
    tenantId: string,
    acl: AccessControlEntry[]
  ): Promise<void> {
    // Delete existing ACL entries
    await this.prisma.caseDocumentACL.deleteMany({
      where: { documentId: documentId },
    });

    // Insert new ACL entries
    if (acl.length > 0) {
      await this.prisma.caseDocumentACL.createMany({
        data: acl.map((ace) => ({
          documentId: documentId,
          tenantId: tenantId,
          principalId: ace.principalId,
          principalType: ace.principalType as any,
          accessLevel: ace.accessLevel as any,
          grantedBy: ace.grantedBy,
          grantedAt: ace.grantedAt,
          expiresAt: ace.expiresAt || null,
        })),
      });
    }
  }

  /**
   * Convert Prisma record to domain model
   */
  private toDomain(record: any): CaseDocument {
    const acl: AccessControlEntry[] = (record.acl || []).map((ace: any) => ({
      principalId: ace.principalId,
      principalType: ace.principalType as 'USER' | 'ROLE' | 'TENANT',
      accessLevel: ace.accessLevel as AccessLevel,
      grantedBy: ace.grantedBy,
      grantedAt: ace.grantedAt,
      expiresAt: ace.expiresAt || undefined,
    }));

    const data: CaseDocumentData = {
      id: record.id,
      tenantId: record.tenantId,
      version: {
        major: record.versionMajor,
        minor: record.versionMinor,
        patch: record.versionPatch,
      },
      status: record.status as DocumentStatus,
      metadata: {
        title: record.title,
        description: record.description || undefined,
        documentType: record.documentType as any,
        classification: record.classification as DocumentClassification,
        tags: record.tags || [],
        relatedCaseId: record.relatedCaseId || undefined,
        relatedContactId: record.relatedContactId || undefined,
      },
      storageKey: record.storageKey,
      contentHash: record.contentHash,
      mimeType: record.mimeType,
      sizeBytes: record.sizeBytes,
      acl,
      createdBy: record.createdBy,
      createdAt: record.createdAt,
      updatedBy: record.updatedBy,
      updatedAt: record.updatedAt,
      parentVersionId: record.parentVersionId || undefined,
      isLatestVersion: record.isLatestVersion,
      retentionUntil: record.retentionUntil || undefined,
      deletedAt: record.deletedAt || undefined,
      eSignature: record.signedBy
        ? {
            signedBy: record.signedBy,
            signedAt: record.signedAt,
            signatureHash: record.signatureHash,
            ipAddress: record.signatureIpAddress,
            userAgent: record.signatureUserAgent,
          }
        : undefined,
    };

    return CaseDocument.fromPersistence(data);
  }
}
