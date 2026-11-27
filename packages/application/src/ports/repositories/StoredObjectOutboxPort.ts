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

  /** How many objects are still left (queued or manual) for each of these requests. */
  leftFor(tenantId: string, requestIds: string[]): Promise<Record<string, number>>;

  /** What is still left, counted per checklist key (storedLeadFiles ...): PENDING and MANUAL rows. */
  remaining(tenantId: string, requestId: string): Promise<Record<string, number>>;
}
