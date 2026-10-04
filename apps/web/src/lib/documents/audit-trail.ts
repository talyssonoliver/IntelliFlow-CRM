/**
 * Document audit trail → version-history rows for the document detail page.
 *
 * Reads the documents.getAuditTrail contract (camelCase; see
 * DocumentAuditEntryDto in apps/api/src/modules/legal/documents.router.ts).
 * The page used to cast the query result to a snake_case shape the API never
 * returned, which crashed the audit trail at runtime.
 */

/** The fields of a getAuditTrail row this mapping reads (dates arrive as strings over the wire). */
export interface AuditTrailRow {
  id: string;
  eventType: string;
  userId: string;
  changes?: unknown;
  metadata?: unknown;
  createdAt: string | Date;
}

export interface AuditEntry {
  id: string;
  versionMajor: number;
  versionMinor: number;
  versionPatch: number;
  action: string;
  timestamp: string;
  performedBy: string;
  changes: string | null;
  metadata: { sizeBytes?: number } | null;
}

interface AuditMetadata {
  version?: { major?: number; minor?: number; patch?: number };
  sizeBytes?: number;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const numberOrUndefined = (v: unknown): number | undefined =>
  typeof v === 'number' ? v : undefined;

/** Read the metadata Json defensively: it is free-form, so check every field. */
export function readAuditMetadata(value: unknown): AuditMetadata | null {
  if (!isRecord(value)) return null;
  const v = value.version;
  return {
    version: isRecord(v)
      ? {
          major: numberOrUndefined(v.major),
          minor: numberOrUndefined(v.minor),
          patch: numberOrUndefined(v.patch),
        }
      : undefined,
    sizeBytes: numberOrUndefined(value.sizeBytes),
  };
}

export function mapAuditEntry(entry: AuditTrailRow, index: number, total: number): AuditEntry {
  const metadata = readAuditMetadata(entry.metadata);
  const version = metadata?.version;
  const createdAt =
    typeof entry.createdAt === 'string' ? entry.createdAt : entry.createdAt.toISOString();
  const changesStr = entry.changes == null ? null : JSON.stringify(entry.changes);
  return {
    id: entry.id,
    versionMajor: version?.major ?? 1,
    versionMinor: version?.minor ?? 0,
    versionPatch: version?.patch ?? total - index - 1,
    action: entry.eventType
      .replaceAll('_', ' ')
      .toLowerCase()
      .replace(/^\w/, (c) => c.toUpperCase()),
    timestamp: createdAt,
    performedBy: entry.userId,
    changes: changesStr,
    metadata: metadata ? { sizeBytes: metadata.sizeBytes } : null,
  };
}
