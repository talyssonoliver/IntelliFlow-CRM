/**
 * The erased person's stored files that still have to be deleted from storage (IFC-316).
 * The erasure transaction queues them; the cleanup settles them. Rows still PENDING or MANUAL
 * are the admin's checklist for stored files; kept rows are resolved and read-only. Every call is scoped to one tenant and one request.
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
  /** Queued for deletion and not deleted yet: the only thing left on the checklist. */
  queued: number;
  /** Kept, resolved, read-only: another retained record still uses the object. */
  keptShared: number;
  /** Kept, resolved, read-only: outside the CRM's own storage, so the CRM never deletes it. */
  keptUnmanaged: number;
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
   * What is still left for each of these requests, the objects still to delete (queued) and the
   * files kept, with the reason (shared with a retained record, or outside the CRM's storage). A request that never queued anything (an erasure from
   * before this queue existed, or one with no stored files) is ABSENT: no claim is made for it.
   */
  leftFor(tenantId: string, requestIds: string[]): Promise<Record<string, StoredObjectsLeft>>;

  /** What is still left, counted per checklist key (storedLeadFiles ...): PENDING rows only. */
  remaining(tenantId: string, requestId: string): Promise<Record<string, number>>;
}
