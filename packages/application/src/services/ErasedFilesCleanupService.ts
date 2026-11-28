/**
 * IFC-316 — deletes the stored objects an erasure queued (lead files, email, chat and ticket
 * attachments), after the erasure transaction has committed.
 *
 * A storage delete cannot join the database transaction, so the erasure queues one outbox row per
 * object and this service works through them: bounded retries (`attempts` passes over what still
 * failed, with a pause between), then it stops and leaves the rest queued. What is left is the
 * checklist, persisted per request, so it survives a restart and can be run again: only PENDING
 * rows are touched, a delete of an object already gone is a success, and a second run with
 * nothing pending does nothing. It never throws: a failure here must not undo an erasure.
 */
import { KEPT_FILES_LIST_LIMIT } from '@intelliflow/domain';
import type {
  KeptStoredObject,
  PendingStoredObject,
  StoredObjectOutboxPort,
  StoredObjectSettlement,
  StoredObjectsLeft,
} from '../ports/repositories/StoredObjectOutboxPort';
import type {
  StoredObjectDeleteFailure,
  StoredObjectDeletionPort,
} from '../ports/external/StorageServicePort';

export interface ErasedFilesPurger {
  /** Deletes what is queued for the request and returns what remains, per checklist key. */
  purge(tenantId: string, requestId: string, now: Date): Promise<ErasedFilesPurgeResult>;
  /** The locations of the files kept outside the CRM's storage (read-only). */
  keptFiles(tenantId: string, requestId: string): Promise<KeptStoredObject[]>;
  /** Clears the kept locations whose erasure completed before `before`. */
  expireLocators(tenantId: string, before: Date): Promise<number>;
  /** What is left, and what was kept, per request; a request that never queued a file is absent. */
  leftFor(tenantId: string, requestIds: string[]): Promise<Record<string, StoredObjectsLeft>>;
}

export interface ErasedFilesPurgeResult {
  /** Objects deleted by this run. */
  deleted: number;
  /** Objects still left (queued or for the admin), per checklist key: storedLeadFiles ... */
  remaining: Record<string, number>;
}

export interface ErasedFilesCleanupOptions {
  /** Passes over the objects that failed, within one run. */
  attempts?: number;
  /** Pause before pass n (1-based after the first), in ms. */
  backoffMs?: (pass: number) => number;
  /** Objects sent to storage per call. */
  batchSize?: number;
  /** Most objects one run takes on; the rest wait for the next run. */
  maxObjects?: number;
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULTS = { attempts: 3, batchSize: 100, maxObjects: 1000 };

export class ErasedFilesCleanupService implements ErasedFilesPurger {
  private readonly attempts: number;
  private readonly batchSize: number;
  private readonly maxObjects: number;
  private readonly backoffMs: (pass: number) => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly outbox: StoredObjectOutboxPort,
    /** Null when storage is not configured: nothing is deleted and everything stays queued. */
    private readonly storage: StoredObjectDeletionPort | null,
    options: ErasedFilesCleanupOptions = {}
  ) {
    this.attempts = Math.max(1, options.attempts ?? DEFAULTS.attempts);
    this.batchSize = Math.max(1, options.batchSize ?? DEFAULTS.batchSize);
    this.maxObjects = Math.max(1, options.maxObjects ?? DEFAULTS.maxObjects);
    this.backoffMs = options.backoffMs ?? ((pass) => 250 * 4 ** (pass - 2));
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  leftFor(tenantId: string, requestIds: string[]) {
    return this.outbox.leftFor(tenantId, requestIds);
  }

  keptFiles(tenantId: string, requestId: string) {
    return this.outbox.unmanaged(tenantId, requestId, KEPT_FILES_LIST_LIMIT);
  }

  expireLocators(tenantId: string, before: Date) {
    return this.outbox.expireLocators(tenantId, before);
  }

  async purge(tenantId: string, requestId: string, now: Date): Promise<ErasedFilesPurgeResult> {
    // The running total lives here, so what earlier passes deleted and recorded is still counted
    // if a later step throws.
    const progress = { deleted: 0 };
    try {
      if (this.storage) await this.deleteQueued(this.storage, tenantId, requestId, now, progress);
    } catch (error) {
      // No personal data in the log: ids and the error class only.
      console.error('[privacy] Stored file cleanup stopped', {
        requestId,
        tenantId,
        error: error instanceof Error ? error.name : 'unknown',
      });
    }
    return {
      deleted: progress.deleted,
      remaining: await this.outbox.remaining(tenantId, requestId),
    };
  }

  private async deleteQueued(
    storage: StoredObjectDeletionPort,
    tenantId: string,
    requestId: string,
    now: Date,
    progress: { deleted: number }
  ): Promise<void> {
    let todo: PendingStoredObject[] = await this.outbox.pending(
      tenantId,
      requestId,
      this.maxObjects
    );
    for (let pass = 1; pass <= this.attempts && todo.length > 0; pass += 1) {
      if (pass > 1) await this.sleep(this.backoffMs(pass));
      const { settled, retry } = await this.deletePass(storage, tenantId, todo);
      await this.outbox.settle(tenantId, requestId, settled, now);
      progress.deleted += settled.filter((s) => s.deleted).length;
      todo = retry;
    }
  }

  /**
   * One pass over `todo`, in batches: what to record for each object, and what is worth another
   * pass. A refused object (outside the tenant or the CRM's buckets) is never retried.
   */
  private async deletePass(
    storage: StoredObjectDeletionPort,
    tenantId: string,
    todo: PendingStoredObject[]
  ): Promise<{ settled: StoredObjectSettlement[]; retry: PendingStoredObject[] }> {
    const settled: StoredObjectSettlement[] = [];
    const retry: PendingStoredObject[] = [];
    for (let i = 0; i < todo.length; i += this.batchSize) {
      const batch = todo.slice(i, i + this.batchSize);
      const failures = await this.deleteBatch(storage, tenantId, batch);
      for (const object of batch) {
        const code = failures.get(object.id);
        settled.push(
          code === undefined
            ? { id: object.id, deleted: true }
            : { id: object.id, deleted: false, error: code }
        );
        if (code !== undefined && code !== 'REFUSED') {
          retry.push({ ...object, attempts: object.attempts + 1 });
        }
      }
    }
    return { settled, retry };
  }

  /** The ids that failed, with why. A storage call that throws fails its whole batch. */
  private async deleteBatch(
    storage: StoredObjectDeletionPort,
    tenantId: string,
    batch: PendingStoredObject[]
  ): Promise<Map<string, StoredObjectDeleteFailure>> {
    try {
      const { failed } = await storage.deleteStoredObjects(
        tenantId,
        batch.map((o) => ({ id: o.id, bucket: o.bucket, path: o.path }))
      );
      return new Map(failed.map((f) => [f.id, f.code]));
    } catch {
      return new Map(batch.map((o) => [o.id, 'STORAGE_ERROR' as const]));
    }
  }
}
