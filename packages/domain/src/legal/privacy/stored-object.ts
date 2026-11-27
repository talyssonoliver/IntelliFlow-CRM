/**
 * IFC-316 — where an erased person's stored files live, and which of them the CRM may delete.
 *
 * Lead files, email attachments, chat attachments and ticket attachments keep a "locator" (a
 * storage path or a URL). After an erasure each locator is sorted into one of three classes, so
 * the storage delete is tenant-scoped by construction:
 *   OBJECT    a path under `<tenantId>/` in a bucket this app owns: the CRM deletes it;
 *   NONE      not a stored object (blank, an inline data: URL, this app's own download route):
 *             nothing to delete, the locator is simply cleared;
 *   UNMANAGED looks like a stored file the CRM cannot delete (another host, another bucket,
 *             another tenant's path): it stays on the admin's checklist.
 * Pure: no storage client, no environment.
 */
import { isAttachmentPathInTenant } from '../../email/attachment-path';

export const STORED_OBJECT_SOURCES = [
  'LEAD_FILE',
  'EMAIL_ATTACHMENT',
  'CHAT_ATTACHMENT',
  'TICKET_ATTACHMENT',
] as const;
export type StoredObjectSource = (typeof STORED_OBJECT_SOURCES)[number];

/**
 * How long, after an erasure completes, the location of a file kept outside the CRM's storage
 * (reason UNMANAGED) is shown to administrators. After that it is cleared from the database:
 * exactly 30 days after the request's completion, by a daily job in the combined worker (the
 * privacy requests page clears a firm's own as a fallback), and it is never shown once the 30
 * days have passed.
 */
export const UNMANAGED_LOCATION_DAYS = 30;

/** The most kept-file locations one request lists. */
export const KEPT_FILES_LIST_LIMIT = 500;

/** The admin checklist key each source is counted under. */
export const STORED_OBJECT_CHECKLIST_KEYS: Record<StoredObjectSource, string> = {
  LEAD_FILE: 'storedLeadFiles',
  EMAIL_ATTACHMENT: 'storedEmailAttachments',
  CHAT_ATTACHMENT: 'storedChatAttachments',
  TICKET_ATTACHMENT: 'storedTicketAttachments',
};

/**
 * Why a stored file is kept, not deleted by the CRM. SHARED_KEPT: another retained record still
 * uses the object (other people's data is not erased; the erased person's link to it is removed).
 * UNMANAGED: it is outside the CRM's own storage (another host, bucket or firm's prefix), so the
 * CRM never touches it. Both count as resolved and are shown read-only.
 */
export const STORED_OBJECT_REASONS = ['UNMANAGED', 'SHARED_KEPT'] as const;
export type StoredObjectReason = (typeof STORED_OBJECT_REASONS)[number];

export interface StoredObjectRef {
  bucket: string;
  path: string;
}

export type StoredLocatorClass =
  | { kind: 'OBJECT'; ref: StoredObjectRef }
  | { kind: 'NONE' }
  | { kind: 'UNMANAGED' };

export interface StoredObjectConfig {
  /** Host of this app's storage (the Supabase project); a URL on any other host is unmanaged. */
  storageHost: string | null;
  /**
   * Bucket of compose and inbound email attachments: the only bucket the CRM writes files to
   * today. A bucket is added here only when a CRM upload path for it exists.
   */
  emailBucket: string;
}

/** The only buckets the CRM deletes from. */
export function managedBuckets(config: StoredObjectConfig): string[] {
  return [config.emailBucket];
}

/** Whether a ref is a tenant's own object in a bucket the CRM owns (the delete guard). */
export function isManagedRef(ref: StoredObjectRef, tenantId: string, config: StoredObjectConfig) {
  return (
    managedBuckets(config).includes(ref.bucket) && isAttachmentPathInTenant(ref.path, tenantId)
  );
}

/**
 * A path step that means something to the URL parser (`.`, `..`, in any `%2e` spelling) or a
 * backslash. Checked on the raw locator, BEFORE `new URL` collapses it into a different path.
 */
const PATH_TRICK = /\\|(?:^|\/)(?:\.|%2e){1,2}(?=[/?#]|$)/i;

const STORAGE_URL_PATH = /^\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/;

/**
 * The bucket a bare path (no URL) names. Only an email attachment's bare path is a CRM object:
 * nothing uploads lead, chat or ticket files to storage, so a bare path from those is not ours.
 */
function defaultBucket(source: StoredObjectSource, config: StoredObjectConfig): string | null {
  return source === 'EMAIL_ATTACHMENT' ? config.emailBucket : null;
}

/** Sorts one locator. Never throws. */
export function classifyStoredLocator(
  source: StoredObjectSource,
  locator: string | null | undefined,
  tenantId: string,
  config: StoredObjectConfig
): StoredLocatorClass {
  const value = (locator ?? '').trim();
  if (value === '' || /^data:/i.test(value)) return { kind: 'NONE' };
  // This app's own download route (`/api/email/attachments/...`): no object behind it.
  if (value.startsWith('/')) return { kind: 'NONE' };
  if (PATH_TRICK.test(value)) return { kind: 'UNMANAGED' };

  let ref: StoredObjectRef;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return { kind: 'UNMANAGED' };
    }
    const sameHost = config.storageHost !== null && url.host === config.storageHost;
    const match = sameHost ? STORAGE_URL_PATH.exec(url.pathname) : null;
    if (!match) return { kind: 'UNMANAGED' };
    // A percent escape could become a path step later: refused (isAttachmentPathInTenant).
    ref = { bucket: match[1], path: match[2] };
  } else {
    const bucket = defaultBucket(source, config);
    if (bucket === null) return { kind: 'UNMANAGED' };
    ref = { bucket, path: value };
  }
  return isManagedRef(ref, tenantId, config) ? { kind: 'OBJECT', ref } : { kind: 'UNMANAGED' };
}

/** The locators inside a chat message's attachments JSON: any string a producer put in a locator field. */
const LOCATOR_FIELDS = ['url', 'fileUrl', 'storagePath', 'path', 'key'] as const;

export function chatAttachmentLocators(attachments: unknown): string[] {
  const found: string[] = [];
  const visit = (item: unknown) => {
    if (typeof item === 'string') {
      // A bare file name is not a locator: it needs a path or a scheme.
      if (/[/:]/.test(item)) found.push(item);
    } else if (item && typeof item === 'object' && !Array.isArray(item)) {
      for (const field of LOCATOR_FIELDS) {
        const v = (item as Record<string, unknown>)[field];
        if (typeof v === 'string') found.push(v);
      }
    }
  };
  if (Array.isArray(attachments)) attachments.forEach(visit);
  else visit(attachments);
  return found;
}
