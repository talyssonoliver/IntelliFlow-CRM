/**
 * The erased person's stored files that still have to be deleted from storage (IFC-316).
 * The erasure transaction queues them; the cleanup settles them. Rows still PENDING or MANUAL
 * are the admin's checklist for stored files. Every call is scoped to one tenant and one request.
 */
import type { StoredObjectSource } from '@intelliflow/domain';

export interface PendingStoredObject {
  id: string;
  source: StoredObjectSource;
  bucket: string;
  path: string;
  attempts: number;
}

export interface StoredObjectSettlement {
  id: string;
  deleted: boolean;
  /** A code, never a message: it could carry a name. */
  error?: string;
}

export interface StoredObjectsLeft {
  queued: number;
  /** Only the admin can delete these (reason UNMANAGED). */
  manual: number;
  /** Kept because another retained record uses them: resolved, never listed or deleted. */
  kept: number;
}

export interface ManualStoredObject {
  id: string;
  source: StoredObjectSource;
  locator: string;
  /** Only files the CRM cannot delete are ever listed; a kept (shared) file never is. */
  reason: 'UNMANAGED';
}

export interface StoredObjectOutboxPort {
  /** PENDING objects of the request, oldest first, at most `limit`. */
  pending(tenantId: string, requestId: string, limit: number): Promise<PendingStoredObject[]>;

  /**
   * Records an attempt per object: a deleted one becomes DELETED and loses its locator; a failed
   * one stays PENDING with its attempt count raised. Only touches rows still PENDING, so a
   * repeated or concurrent cleanup settles each object once.
   */
  settle(
    tenantId: string,
    requestId: string,
    results: StoredObjectSettlement[],
    now: Date
  ): Promise<void>;

  /**
   * What is still left for each of these requests, split into objects the CRM will delete (queued)
   * and files only the admin can (manual). A request that never queued anything (an erasure from
   * before this queue existed, or one with no stored files) is ABSENT: no claim is made for it.
   */
  leftFor(tenantId: string, requestIds: string[]): Promise<Record<string, StoredObjectsLeft>>;

  /**
   * The files the admin must delete by hand (source and locator), oldest first: one page of at
   * most MANUAL_FILES_PAGE, because a confirmation takes at most that many ids. The next page
   * follows once these are marked.
   */
  manual(tenantId: string, requestId: string): Promise<ManualStoredObject[]>;

  /**
   * The admin deleted these manual files: they become DELETED and lose their locator. Returns
   * how many changed; ids that are not this request's manual files are ignored.
   */
  markHandled(tenantId: string, requestId: string, ids: string[], now: Date): Promise<number>;

  /** What is still left, counted per checklist key (storedLeadFiles ...): PENDING and MANUAL rows. */
  remaining(tenantId: string, requestId: string): Promise<Record<string, number>>;
}
