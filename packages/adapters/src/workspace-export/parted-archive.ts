/**
 * A workspace archive written as one or more ZIP parts, so that no single upload passes the
 * storage provider's 5 GB limit for a standard upload.
 *
 * Entries go to the current part; when it has reached `maxPartBytes` (or the next stored file
 * would take it over) a new part is opened. Part 1 is deliberately kept open until the end: the
 * README and manifest.json are added to it last, once every other part is closed and its sha256
 * is known. A single entry is never split, so one stored file larger than the limit still
 * fails at upload, loudly.
 */
import { readdir, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import type { Readable } from 'node:stream';
import { ArchiveWriter, type ArchiveEntryInfo } from './archive-writer';

/** About 4 GB: well under the 5 GB standard-upload limit, leaving room for the end-of-part files. */
export const DEFAULT_MAX_PART_BYTES = 4 * 1024 * 1024 * 1024;

export interface PartInfo {
  part: number;
  /** Local file of the part. */
  path: string;
  bytes: number;
  sha256: string;
}

export interface PartedEntryInfo extends ArchiveEntryInfo {
  part: number;
}

export class PartedArchive {
  private readonly writers: ArchiveWriter[];
  /** Raw size of the last entry of each part: it may not be fully counted by the archiver yet. */
  private readonly lastRaw: number[] = [0];

  constructor(
    private readonly basePath: string,
    private readonly maxPartBytes: number
  ) {
    this.writers = [new ArchiveWriter(basePath)];
  }

  partPath(part: number): string {
    return part === 1 ? this.basePath : `${this.basePath}.part${part}`;
  }

  get partCount(): number {
    return this.writers.length;
  }

  private current(): ArchiveWriter {
    return this.writers[this.writers.length - 1]!;
  }

  /** Opens the next part when the current one is full. A part is never left empty. */
  private rollIfFull(sizeHint?: number | null): void {
    const cur = this.current();
    if (cur.entryCount === 0) return;
    // Conservative: what the archiver has written plus the whole last entry, as if uncompressed.
    const size = cur.bytesWritten + (this.lastRaw[this.writers.length - 1] ?? 0);
    const full =
      size >= this.maxPartBytes ||
      (typeof sizeHint === 'number' && size + sizeHint > this.maxPartBytes);
    if (full) {
      this.writers.push(new ArchiveWriter(this.partPath(this.writers.length + 1)));
      this.lastRaw.push(0);
    }
  }

  async addGenerated(
    name: string,
    produce: (write: (chunk: string) => Promise<void>) => Promise<void>
  ): Promise<PartedEntryInfo> {
    this.rollIfFull();
    const part = this.writers.length;
    const info = await this.current().addGenerated(name, produce);
    this.lastRaw[part - 1] = info.bytes;
    return { ...info, part };
  }

  async addStream(
    name: string,
    source: Readable,
    sizeHint?: number | null
  ): Promise<PartedEntryInfo> {
    this.rollIfFull(sizeHint);
    const part = this.writers.length;
    const info = await this.current().addStream(name, source);
    this.lastRaw[part - 1] = info.bytes;
    return { ...info, part };
  }

  /** An entry for part 1, which stays open for the README and manifest. */
  async addToFirstPart(
    name: string,
    produce: (write: (chunk: string) => Promise<void>) => Promise<void>
  ): Promise<PartedEntryInfo> {
    return { ...(await this.writers[0]!.addGenerated(name, produce)), part: 1 };
  }

  /** Closes every part after the first (their size and sha256 go in the manifest). */
  async finalizeLaterParts(): Promise<PartInfo[]> {
    const out: PartInfo[] = [];
    for (let i = 1; i < this.writers.length; i += 1) {
      const { bytes, sha256 } = await this.writers[i]!.finalize();
      out.push({ part: i + 1, path: this.partPath(i + 1), bytes, sha256 });
    }
    return out;
  }

  async finalizeFirstPart(): Promise<PartInfo> {
    const { bytes, sha256 } = await this.writers[0]!.finalize();
    return { part: 1, path: this.partPath(1), bytes, sha256 };
  }

  abort(): void {
    for (const w of this.writers) {
      try {
        w.abort();
      } catch {
        // already closed
      }
    }
  }
}

/** Removes the archive file, its parts, its manifest and any spool file next to it. */
export async function removeExportFiles(outputPath: string): Promise<void> {
  const dir = dirname(outputPath);
  const name = basename(outputPath);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return;
  }
  await Promise.all(
    entries
      .filter((e) => e === name || e.startsWith(`${name}.`))
      .map((e) => rm(join(dir, e), { force: true }).catch(() => undefined))
  );
}
