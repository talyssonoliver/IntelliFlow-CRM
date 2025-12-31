import {
  CaseDocument,
  CaseDocumentRepository,
  AccessLevel,
} from '@intelliflow/domain';

/**
 * In-Memory Case Document Repository
 *
 * Used for testing without database dependencies.
 * Stores documents in memory and supports all repository operations.
 */
export class InMemoryCaseDocumentRepository implements CaseDocumentRepository {
  private documents = new Map<string, CaseDocument>();

  async save(document: CaseDocument): Promise<void> {
    this.documents.set(document.id, document);
  }

  async findById(id: string): Promise<CaseDocument | null> {
    return this.documents.get(id) || null;
  }

  async findLatestVersion(documentId: string): Promise<CaseDocument | null> {
    // Find all documents with the same base ID or parent chain
    const allVersions = Array.from(this.documents.values()).filter((doc) => {
      // Check if this is the documentId or has it in its version chain
      return doc.id === documentId || this.isInVersionChain(doc, documentId);
    });

    if (allVersions.length === 0) return null;

    // Find the one marked as latest
    const latest = allVersions.find((doc) => doc.isLatestVersion);
    return latest || null;
  }

  async findAllVersions(documentId: string): Promise<CaseDocument[]> {
    const versions: CaseDocument[] = [];
    const visited = new Set<string>();

    // Start with the given document
    const startDoc = this.documents.get(documentId);
    if (!startDoc) return [];

    // Build version chain
    const collectVersions = (doc: CaseDocument) => {
      if (visited.has(doc.id)) return;
      visited.add(doc.id);
      versions.push(doc);

      // Find documents that have this document as parent
      for (const d of this.documents.values()) {
        if (d.toJSON().parentVersionId === doc.id) {
          collectVersions(d);
        }
      }
    };

    // Find root of version chain
    let current = startDoc;
    while (true) {
      const parentId = current.toJSON().parentVersionId;
      if (!parentId) break;
      const parent = this.documents.get(parentId);
      if (!parent) break;
      current = parent;
    }

    collectVersions(current);

    // Sort by version number
    return versions.sort((a, b) => {
      const aVer = a.version;
      const bVer = b.version;
      if (aVer.major !== bVer.major) return aVer.major - bVer.major;
      if (aVer.minor !== bVer.minor) return aVer.minor - bVer.minor;
      return aVer.patch - bVer.patch;
    });
  }

  async findByCaseId(caseId: string): Promise<CaseDocument[]> {
    return Array.from(this.documents.values()).filter((doc) => {
      const data = doc.toJSON();
      return (
        data.metadata.relatedCaseId === caseId &&
        !data.deletedAt &&
        data.isLatestVersion
      );
    });
  }

  async findAccessibleByUser(userId: string, tenantId: string): Promise<CaseDocument[]> {
    const now = new Date();

    return Array.from(this.documents.values()).filter((doc) => {
      const data = doc.toJSON();

      // Filter by tenant
      if (data.tenantId !== tenantId) return false;

      // Exclude deleted
      if (data.deletedAt) return false;

      // Only latest versions
      if (!data.isLatestVersion) return false;

      // Check if user is creator
      if (data.createdBy === userId) return true;

      // Check ACL
      const hasAccess = doc.acl.some((ace) => {
        if (ace.principalId !== userId) return false;
        if (ace.accessLevel === AccessLevel.NONE) return false;
        if (ace.expiresAt && ace.expiresAt < now) return false;
        return true;
      });

      return hasAccess;
    });
  }

  async delete(id: string): Promise<void> {
    this.documents.delete(id);
  }

  /**
   * Helper to check if a document is in the version chain
   */
  private isInVersionChain(doc: CaseDocument, targetId: string): boolean {
    const data = doc.toJSON();
    if (doc.id === targetId) return true;
    if (data.parentVersionId === targetId) return true;

    // Check parent chain
    if (data.parentVersionId) {
      const parent = this.documents.get(data.parentVersionId);
      if (parent) {
        return this.isInVersionChain(parent, targetId);
      }
    }

    return false;
  }

  /**
   * Clear all documents (for testing)
   */
  clear(): void {
    this.documents.clear();
  }

  /**
   * Get all documents (for testing)
   */
  getAll(): CaseDocument[] {
    return Array.from(this.documents.values());
  }
}
