/**
 * Streaming ZIP writer with a sha256 and byte count for every entry.
 *
 * Nothing is buffered whole: generated entries are written chunk by chunk with back-pressure,
 * stored files are piped through, and the archive itself goes to disk through a hashing
 * transform, so a workspace of any size needs memory for one chunk, not for the data.
 */
import archiver from 'archiver';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { once } from 'node:events';
import { Readable, Transform, pipeline } from 'node:stream';
import { finished } from 'node:stream/promises';

export interface ArchiveEntryInfo {
  path: string;
  bytes: number;
  sha256: string;
}

/** Hashes and counts everything that passes through. */
class DigestTransform extends Transform {
  private readonly hash = createHash('sha256');
  bytes = 0;
  override _transform(
    chunk: Buffer,
    _enc: BufferEncoding,
    cb: (error?: Error | null, data?: Buffer) => void
  ): void {
    this.hash.update(chunk);
    this.bytes += chunk.length;
    cb(null, chunk);
  }
  digest(): string {
    return this.hash.digest('hex');
  }
}

/** Entry names are written by us, but a stored file's path comes from the bucket: be strict. */
export function assertSafeEntryName(name: string): void {
  const segments = name.split('/');
  if (
    name.length === 0 ||
    name.startsWith('/') ||
    name.includes('\\') ||
    segments.some((s) => s === '' || s === '.' || s === '..')
  ) {
    throw new Error(`Unsafe archive entry name: ${JSON.stringify(name)}`);
  }
}

export class ArchiveWriter {
  private readonly archive = archiver('zip', { zlib: { level: 6 } });
  private readonly archiveDigest = new DigestTransform();
  private readonly out;
  private readonly outClosed: Promise<void>;
  private failure: Error | null = null;
  private readonly failed: Promise<never>;
  private rejectFailed!: (err: Error) => void;
  private current: Transform | null = null;
  private readonly names = new Set<string>();

  constructor(outputPath: string) {
    this.out = createWriteStream(outputPath);
    this.outClosed = new Promise<void>((resolve, reject) => {
      this.out.once('close', resolve);
      this.out.once('error', reject);
    });
    // A disk error (ENOSPC, EIO) rejects this promise before finalize() awaits it. Left
    // unhandled it would be an unhandledRejection, which ends the whole worker process.
    this.outClosed.catch(() => undefined);
    this.failed = new Promise<never>((_, reject) => {
      this.rejectFailed = reject;
    });
    this.failed.catch(() => undefined);
    this.archive.on('error', (err: Error) => this.fail(err));
    this.archive.on('warning', (err: Error) => this.fail(err));
    pipeline(this.archive, this.archiveDigest, this.out, (err) => {
      if (err) this.fail(err);
    });
  }

  /** Bytes the archiver has produced so far (the entry being compressed is only partly in). */
  get bytesWritten(): number {
    return this.archive.pointer();
  }

  get entryCount(): number {
    return this.names.size;
  }

  private fail(err: Error): void {
    this.failure ??= err;
    this.rejectFailed(this.failure);
    this.current?.destroy(err);
  }

  /**
   * Resolves when archiver has finished the entry `name` (its 'entry' event), rejects when the
   * archive fails. Waiting for this, not only for the source, keeps what is queued behind a slow
   * disk down to one entry: archiver wraps a stream in its own buffer, so a small file can finish
   * on our side long before it is written.
   */
  private entryDone(name: string): Promise<void> {
    const done = new Promise<void>((resolve, reject) => {
      const onEntry = (entry: { name: string }) => {
        if (entry.name !== name) return;
        this.archive.off('entry', onEntry);
        resolve();
      };
      this.archive.on('entry', onEntry);
      this.failed.catch((err: Error) => {
        this.archive.off('entry', onEntry);
        reject(err);
      });
    });
    done.catch(() => undefined);
    return done;
  }

  private begin(name: string): { tee: DigestTransform; entry: Promise<void> } {
    assertSafeEntryName(name);
    if (this.failure) throw this.failure;
    if (this.names.has(name)) throw new Error(`Duplicate archive entry: ${name}`);
    this.names.add(name);
    const tee = new DigestTransform();
    this.current = tee;
    const entry = this.entryDone(name);
    this.archive.append(tee, { name });
    return { tee, entry };
  }

  /** Write one entry from a producer that calls `write` with text chunks (back-pressured). */
  async addGenerated(
    name: string,
    produce: (write: (chunk: string) => Promise<void>) => Promise<void>
  ): Promise<ArchiveEntryInfo> {
    const { tee, entry } = this.begin(name);
    const settled = Promise.all([finished(tee), entry])
      .then(() => undefined)
      .catch((err: Error) => {
        throw this.failure ?? err;
      });
    // fail() can reject this while the producer is still writing: the producer's own error path
    // reports it, so it must never surface as an unhandled rejection.
    settled.catch(() => undefined);
    try {
      await produce(async (chunk) => {
        if (this.failure) throw this.failure;
        if (!tee.write(chunk, 'utf8')) await once(tee, 'drain');
      });
      tee.end();
      await settled;
    } catch (err) {
      tee.destroy(err instanceof Error ? err : new Error(String(err)));
      settled.catch(() => undefined);
      throw this.failure ?? err;
    } finally {
      this.current = null;
    }
    return { path: name, bytes: tee.bytes, sha256: tee.digest() };
  }

  /** Write one entry by piping a readable (a stored file). */
  async addStream(name: string, source: Readable): Promise<ArchiveEntryInfo> {
    const { tee, entry } = this.begin(name);
    // The entry is done only when archiver has written it, not when the source has been handed
    // over: otherwise small files queue up in memory behind a slow disk.
    const settled = Promise.all([finished(tee), entry])
      .then(() => undefined)
      .catch((err: Error) => {
        throw this.failure ?? err;
      });
    settled.catch(() => undefined);
    try {
      await new Promise<void>((resolve, reject) => {
        pipeline(source, tee, (err) => (err ? reject(err) : resolve()));
      });
      await settled;
    } catch (err) {
      tee.destroy(err instanceof Error ? err : new Error(String(err)));
      settled.catch(() => undefined);
      throw this.failure ?? err;
    } finally {
      this.current = null;
    }
    return { path: name, bytes: tee.bytes, sha256: tee.digest() };
  }

  /** Close the archive and report the whole file's size and sha256. */
  async finalize(): Promise<{ bytes: number; sha256: string }> {
    if (this.failure) throw this.failure;
    // Raced against fail(): a disk error during finalization can leave archiver's own promise
    // pending, which would hang the job instead of letting it fail and retry.
    await Promise.race([
      (async () => {
        await this.archive.finalize();
        await this.outClosed;
      })(),
      this.failed,
    ]).catch((err) => {
      this.abort();
      throw this.failure ?? err;
    });
    if (this.failure) throw this.failure;
    return { bytes: this.archiveDigest.bytes, sha256: this.archiveDigest.digest() };
  }

  /** Abandon a half-written archive (the caller deletes the file). */
  abort(): void {
    this.archive.abort();
    this.out.destroy();
  }
}
