import { PrismaClient, Prisma } from '@intelliflow/db';
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
        documentTypeLabel: data.metadata.documentTypeLabel || null,
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
        documentTypeLabel: data.metadata.documentTypeLabel || null,
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

  async findByIds(ids: string[]): Promise<CaseDocument[]> {
    if (ids.length === 0) return [];

    // Deduplicate ids to avoid redundant rows in the IN clause
    const uniqueIds = [...new Set(ids)];

    const records = await this.prisma.caseDocument.findMany({
      where: { id: { in: uniqueIds }, deletedAt: null },
      include: { acl: true },
    });

    return records.map((r) => this.toDomain(r));
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
    // Use a single recursive CTE to find the root of the version chain
    // (walking UP via parent_version_id), then collect every node in the
    // entire tree that is reachable from that root (walking DOWN).
    //
    // The CTE has two phases joined by UNION ALL:
    //   1. ancestors — traverse from documentId upward to the root
    //   2. descendants — starting from the discovered root, traverse downward
    //
    // We then load the full records in one findMany call.
    //
    // @no-enum-union: both UNION ALL legs project only (id, parent_version_id),
    // which are text/uuid columns — no Postgres enum types are unioned here, so
    // no ::text cast is required. (pattern-conformance Team 4 opt-out)
    type IdRow = { id: string };

    const ancestorRows = await this.prisma.$queryRaw<IdRow[]>(Prisma.sql`
      WITH RECURSIVE ancestors AS (
        SELECT id, "parent_version_id" AS "parentVersionId"
        FROM case_documents
        WHERE id = ${documentId}
        UNION ALL
        SELECT d.id, d."parent_version_id"
        FROM case_documents d
        JOIN ancestors a ON d.id = a."parentVersionId"
      )
      SELECT id FROM ancestors
    `);

    if (ancestorRows.length === 0) return [];

    // The root is the ancestor with no parent — pick the last row produced
    // by the upward traversal, which is the one without a parent_version_id
    // pointer in the traversal.  We materialise all ancestor IDs first, then
    // re-query for the root (the one whose parentVersionId is not in the set).
    const ancestorIdSet = new Set(ancestorRows.map((r) => r.id));

    // Find root: fetch the ancestor records (light query, no ACL needed) and
    // pick the one whose parent is absent from the ancestor set.
    const ancestorDocs = await this.prisma.caseDocument.findMany({
      where: { id: { in: [...ancestorIdSet] } },
      select: { id: true, parentVersionId: true },
    });

    const rootDoc = ancestorDocs.find(
      (d) => !d.parentVersionId || !ancestorIdSet.has(d.parentVersionId)
    );

    const rootId = rootDoc?.id ?? documentId;

    // Now collect all descendants from the root in one CTE
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
   * Find all versions in the document tree rooted at rootId using a single
   * recursive CTE query (replaces the per-hop while-loop, NP-021 fix).
   *
   * The CTE walks DOWNWARD through the tree by joining on parent_version_id,
   * collecting all descendant IDs.  A single subsequent findMany loads the
   * full records (with ACL includes) in one round-trip.
   */
  private async findVersionChain(rootId: string): Promise<CaseDocument[]> {
    type IdRow = { id: string };

    // Collect all node IDs in the subtree rooted at rootId
    const chainRows = await this.prisma.$queryRaw<IdRow[]>(Prisma.sql`
      WITH RECURSIVE chain AS (
        SELECT id, "parent_version_id" AS "parentVersionId"
        FROM case_documents
        WHERE id = ${rootId}
        UNION ALL
        SELECT d.id, d."parent_version_id"
        FROM case_documents d
        JOIN chain c ON d."parent_version_id" = c.id
      )
      SELECT id FROM chain
    `);

    if (chainRows.length === 0) return [];

    const chainIds = chainRows.map((r) => r.id);

    const records = await this.prisma.caseDocument.findMany({
      where: { id: { in: chainIds } },
      include: { acl: true },
    });

    const versions = records.map((r) => this.toDomain(r));

    // Sort by version (ascending)
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
        major: record.versionMajor || 1,
        minor: record.versionMinor,
        patch: record.versionPatch,
      },
      status: record.status as DocumentStatus,
      metadata: {
        title: record.title,
        description: record.description || undefined,
        documentType: record.documentType as any,
        documentTypeLabel: record.documentTypeLabel || undefined,
        classification: record.classification as DocumentClassification,
        tags: record.tags || [],
        relatedCaseId: record.relatedCaseId || undefined,
        relatedContactId: record.relatedContactId || undefined,
      },
      storageKey: record.storageKey,
      contentHash: record.contentHash,
      mimeType: record.mimeType,
      sizeBytes: Number(record.sizeBytes),
      acl,
      createdBy: record.createdBy,
      createdAt: record.createdAt,
      updatedBy: record.updatedBy,
      updatedAt: record.updatedAt,
      parentVersionId: record.parentVersionId || undefined,
      isLatestVersion: record.isLatestVersion,
      retentionUntil: record.retentionUntil || undefined,
      deletedAt: record.deletedAt || undefined,
      eSignature:
        record.signedBy && record.signatureHash && /^[a-f0-9]{64}$/.test(record.signatureHash)
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
