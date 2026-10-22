import { randomUUID } from 'node:crypto';
import type { StorageServicePort } from '@intelliflow/application';

/**
 * In-memory StorageServicePort (test double).
 *
 * Implements the same quarantine-then-promote contract as SupabaseStorageAdapter
 * with two Maps instead of two Supabase buckets, so orchestration, persistence
 * and domain-contract assertions can run on every PR without a reachable
 * Supabase storage API (#665). The true storage round-trip stays in the nightly.
 *
 * Contract parity with SupabaseStorageAdapter that tests may rely on:
 *  - `uploadToQuarantine` keys are `<tenantId>/<timestamp>-<sanitized filename>`
 *  - `moveToPrimary` reads the quarantine object, writes primary (overwrite
 *    allowed, for retries) and removes the quarantine object; it throws when the
 *    quarantine key does not exist
 *  - `deleteFromQuarantine` never throws for a missing key
 *  - `download` and `getSignedUrl` read the primary bucket only
 *
 * NOT for production wiring. Fault injection (`failNext`) exists so retry and
 * failure paths can be driven deterministically.
 */
export type InMemoryStorageOperation =
  | 'uploadToQuarantine'
  | 'moveToPrimary'
  | 'deleteFromQuarantine'
  | 'download'
  | 'getSignedUrl';

export class InMemoryStorageAdapter implements StorageServicePort {
  private readonly quarantine = new Map<string, Buffer>();
  private readonly primary = new Map<string, Buffer>();
  private readonly pendingFailures = new Map<InMemoryStorageOperation, Error[]>();
  private readonly calls: Record<InMemoryStorageOperation, number> = {
    uploadToQuarantine: 0,
    moveToPrimary: 0,
    deleteFromQuarantine: 0,
    download: 0,
    getSignedUrl: 0,
  };
  private sequence = 0;

  async uploadToQuarantine(file: Buffer, filename: string, tenantId: string): Promise<string> {
    this.enter('uploadToQuarantine');
    // The sequence suffix keeps keys unique when two uploads share a millisecond.
    const key = `${tenantId}/${Date.now()}-${this.sequence++}-${this.sanitizeFilename(filename)}`;
    this.quarantine.set(key, Buffer.from(file));
    return key;
  }

  async moveToPrimary(quarantineKey: string, primaryKey: string): Promise<string> {
    this.enter('moveToPrimary');
    const data = this.quarantine.get(quarantineKey);
    if (!data) {
      throw new Error(`Failed to download from quarantine: ${quarantineKey} not found`);
    }
    this.primary.set(primaryKey, data);
    this.quarantine.delete(quarantineKey);
    return primaryKey;
  }

  async deleteFromQuarantine(quarantineKey: string): Promise<void> {
    this.enter('deleteFromQuarantine');
    this.quarantine.delete(quarantineKey);
  }

  async download(storageKey: string): Promise<Buffer> {
    this.enter('download');
    const data = this.primary.get(storageKey);
    if (!data) {
      throw new Error(`Failed to download file: ${storageKey} not found`);
    }
    return Buffer.from(data);
  }

  async getSignedUrl(storageKey: string, expiresIn: number): Promise<string> {
    this.enter('getSignedUrl');
    if (!this.primary.has(storageKey)) {
      throw new Error(`Failed to create signed URL: ${storageKey} not found`);
    }
    // Reserved .invalid TLD: can never resolve, so it cannot be mistaken for a real link.
    return `https://storage.example.invalid/${encodeURI(storageKey)}?expiresIn=${expiresIn}&token=${randomUUID()}`;
  }

  // ---- test controls (not part of StorageServicePort) ----

  /** Make the next `times` calls to `operation` reject with `error`, then recover. */
  failNext(
    operation: InMemoryStorageOperation,
    times = 1,
    error: Error = new Error(`Injected ${operation} failure`)
  ): void {
    const queue = this.pendingFailures.get(operation) ?? [];
    for (let i = 0; i < times; i++) queue.push(error);
    this.pendingFailures.set(operation, queue);
  }

  /** Calls made to `operation`, including ones that were failed by `failNext`. */
  callCount(operation: InMemoryStorageOperation): number {
    return this.calls[operation];
  }

  quarantineKeys(): string[] {
    return [...this.quarantine.keys()];
  }

  primaryKeys(): string[] {
    return [...this.primary.keys()];
  }

  /** Drop all objects, pending failures and call counters. */
  reset(): void {
    this.quarantine.clear();
    this.primary.clear();
    this.pendingFailures.clear();
    for (const op of Object.keys(this.calls) as InMemoryStorageOperation[]) this.calls[op] = 0;
  }

  private enter(operation: InMemoryStorageOperation): void {
    this.calls[operation]++;
    const failure = this.pendingFailures.get(operation)?.shift();
    if (failure) throw failure;
  }

  private sanitizeFilename(filename: string): string {
    return filename.replaceAll(/[^a-zA-Z0-9.-]/g, '_');
  }
}
