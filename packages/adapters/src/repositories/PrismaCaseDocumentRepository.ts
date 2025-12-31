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
        tenant_id: data.tenantId,
        version_major: data.version.major,
        version_minor: data.version.minor,
        version_patch: data.version.patch,
        status: data.status as any,
        title: data.metadata.title,
        description: data.metadata.description || null,
        document_type: data.metadata.documentType as any,
        classification: data.metadata.classification as any,
        tags: data.metadata.tags,
        related_case_id: data.metadata.relatedCaseId || null,
        related_contact_id: data.metadata.relatedContactId || null,
        storage_key: data.storageKey,
        content_hash: data.contentHash,
        mime_type: data.mimeType,
        size_bytes: data.sizeBytes,
        created_by: data.createdBy,
        updated_by: data.updatedBy,
        created_at: data.createdAt,
        updated_at: data.updatedAt,
        parent_version_id: data.parentVersionId || null,
        is_latest_version: data.isLatestVersion,
        retention_until: data.retentionUntil || null,
        deleted_at: data.deletedAt || null,
        signed_by: data.eSignature?.signedBy || null,
        signed_at: data.eSignature?.signedAt || null,
        signature_hash: data.eSignature?.signatureHash || null,
        signature_ip_address: data.eSignature?.ipAddress || null,
        signature_user_agent: data.eSignature?.userAgent || null,
      },
      update: {
        version_major: data.version.major,
        version_minor: data.version.minor,
        version_patch: data.version.patch,
        status: data.status as any,
        title: data.metadata.title,
        description: data.metadata.description || null,
        document_type: data.metadata.documentType as any,
        classification: data.metadata.classification as any,
        tags: data.metadata.tags,
        related_case_id: data.metadata.relatedCaseId || null,
        related_contact_id: data.metadata.relatedContactId || null,
        storage_key: data.storageKey,
        content_hash: data.contentHash,
        updated_by: data.updatedBy,
        updated_at: data.updatedAt,
        is_latest_version: data.isLatestVersion,
        retention_until: data.retentionUntil || null,
        deleted_at: data.deletedAt || null,
        signed_by: data.eSignature?.signedBy || null,
        signed_at: data.eSignature?.signedAt || null,
        signature_hash: data.eSignature?.signatureHash || null,
        signature_ip_address: data.eSignature?.ipAddress || null,
        signature_user_agent: data.eSignature?.userAgent || null,
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
          { id: documentId, is_latest_version: true },
          { parent_version_id: documentId, is_latest_version: true },
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
    while (current && current.parent_version_id) {
      rootId = current.parent_version_id;
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
        related_case_id: caseId,
        deleted_at: null,
        is_latest_version: true,
      },
      include: { acl: true },
      orderBy: { created_at: 'desc' },
    });

    return records.map((r) => this.toDomain(r));
  }

  async findAccessibleByUser(userId: string, tenantId: string): Promise<CaseDocument[]> {
    const now = new Date();

    const records = await this.prisma.caseDocument.findMany({
      where: {
        tenant_id: tenantId,
        deleted_at: null,
        is_latest_version: true,
        OR: [
          // User is creator
          { created_by: userId },
          // User has ACL access
          {
            acl: {
              some: {
                principal_id: userId,
                access_level: { not: 'NONE' },
                OR: [
                  { expires_at: null },
                  { expires_at: { gt: now } },
                ],
              },
            },
          },
        ],
      },
      include: { acl: true },
      orderBy: { created_at: 'desc' },
    });

    return records.map((r) => this.toDomain(r));
  }

  async delete(id: string): Promise<void> {
    // Hard delete (for GDPR compliance after retention period)
    await this.prisma.caseDocumentACL.deleteMany({
      where: { document_id: id },
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
        where: { parent_version_id: currentId },
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
      where: { document_id: documentId },
    });

    // Insert new ACL entries
    if (acl.length > 0) {
      await this.prisma.caseDocumentACL.createMany({
        data: acl.map((ace) => ({
          document_id: documentId,
          tenant_id: tenantId,
          principal_id: ace.principalId,
          principal_type: ace.principalType as any,
          access_level: ace.accessLevel as any,
          granted_by: ace.grantedBy,
          granted_at: ace.grantedAt,
          expires_at: ace.expiresAt || null,
        })),
      });
    }
  }

  /**
   * Convert Prisma record to domain model
   */
  private toDomain(record: any): CaseDocument {
    const acl: AccessControlEntry[] = (record.acl || []).map((ace: any) => ({
      principalId: ace.principal_id,
      principalType: ace.principal_type as 'USER' | 'ROLE' | 'TENANT',
      accessLevel: ace.access_level as AccessLevel,
      grantedBy: ace.granted_by,
      grantedAt: ace.granted_at,
      expiresAt: ace.expires_at || undefined,
    }));

    const data: CaseDocumentData = {
      id: record.id,
      tenantId: record.tenant_id,
      version: {
        major: record.version_major,
        minor: record.version_minor,
        patch: record.version_patch,
      },
      status: record.status as DocumentStatus,
      metadata: {
        title: record.title,
        description: record.description || undefined,
        documentType: record.document_type as any,
        classification: record.classification as DocumentClassification,
        tags: record.tags || [],
        relatedCaseId: record.related_case_id || undefined,
        relatedContactId: record.related_contact_id || undefined,
      },
      storageKey: record.storage_key,
      contentHash: record.content_hash,
      mimeType: record.mime_type,
      sizeBytes: record.size_bytes,
      acl,
      createdBy: record.created_by,
      createdAt: record.created_at,
      updatedBy: record.updated_by,
      updatedAt: record.updated_at,
      parentVersionId: record.parent_version_id || undefined,
      isLatestVersion: record.is_latest_version,
      retentionUntil: record.retention_until || undefined,
      deletedAt: record.deleted_at || undefined,
      eSignature: record.signed_by
        ? {
            signedBy: record.signed_by,
            signedAt: record.signed_at,
            signatureHash: record.signature_hash,
            ipAddress: record.signature_ip_address,
            userAgent: record.signature_user_agent,
          }
        : undefined,
    };

    return CaseDocument.fromPersistence(data);
  }
}
