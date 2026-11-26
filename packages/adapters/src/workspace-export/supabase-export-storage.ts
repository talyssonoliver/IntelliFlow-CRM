/**
 * Supabase Storage for the workspace export: reads a tenant's files, keeps the finished ZIP in a
 * private bucket and issues signed download links.
 *
 * Reads are streamed (a short-lived signed URL fetched as a web stream) so a large file is never
 * held in memory; the archive is uploaded by streaming the local temp file the same way. The
 * bucket is private; the only way in is a signed link.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import type { ExportFileStorage } from './export-workspace';

export const WORKSPACE_EXPORT_BUCKET = 'workspace-exports';
/** Time allowed for a storage download to start answering. */
const OPEN_FILE_HEADERS_TIMEOUT_MS = 60_000;
/** The link and the archive live for 14 days (agreement clause 5). */
export const EXPORT_LINK_TTL_SECONDS = 14 * 24 * 60 * 60;

export interface ExportArchiveStorage {
  /** Create the private bucket on first use. */
  ensureBucket(): Promise<void>;
  /** Upload the local file to `path` (replacing a half-finished earlier attempt). */
  uploadArchive(path: string, localPath: string): Promise<void>;
  /** A link that works for `expiresInSeconds` and then stops. */
  signedDownloadUrl(path: string, expiresInSeconds: number, downloadName: string): Promise<string>;
  /** Remove the archive (after its 14 days). */
  removeArchive(path: string): Promise<void>;
}

export class SupabaseExportStorage implements ExportFileStorage, ExportArchiveStorage {
  private readonly client: SupabaseClient;
  private bucketReady: Promise<void> | null = null;

  constructor(
    private readonly supabaseUrl: string,
    private readonly serviceKey: string,
    private readonly exportBucket: string = WORKSPACE_EXPORT_BUCKET
  ) {
    this.client = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  }

  // ---- reading the tenant's files ----------------------------------------------------------

  async *listFiles(
    bucket: string,
    tenantId: string
  ): AsyncGenerator<{ path: string; size: number | null }> {
    yield* this.walk(bucket, tenantId);
  }

  /** One page of a folder; a bucket the tenant never used may not exist: nothing to copy. */
  private async listPage(
    bucket: string,
    folder: string,
    offset: number,
    limit: number
  ): Promise<Array<{ name: string; id: string | null; metadata: unknown }>> {
    const { data, error } = await this.client.storage.from(bucket).list(folder, {
      limit,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) {
      if (/not.?found|does not exist/i.test(error.message)) return [];
      throw new Error(`Listing ${bucket}/${folder} failed: ${error.message}`);
    }
    return data ?? [];
  }

  private async *walk(
    bucket: string,
    folder: string
  ): AsyncGenerator<{ path: string; size: number | null }> {
    const limit = 100;
    for (let offset = 0; ; offset += limit) {
      const page = await this.listPage(bucket, folder, offset, limit);
      for (const item of page) {
        const path = `${folder}/${item.name}`;
        // Folders have no id; objects do.
        if (item.id === null || item.id === undefined) yield* this.walk(bucket, path);
        else yield { path, size: (item.metadata as { size?: number } | null)?.size ?? null };
      }
      if (page.length < limit) return;
    }
  }

  async openFile(bucket: string, path: string): Promise<Readable> {
    const { data, error } = await this.client.storage.from(bucket).createSignedUrl(path, 300);
    if (error || !data) throw new Error(`Link for ${bucket}/${path} failed`);
    // A hung connection must not stall the job: the timeout covers the response headers only, so
    // a large file is still allowed to stream for as long as it needs.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OPEN_FILE_HEADERS_TIMEOUT_MS);
    try {
      const res = await fetch(data.signedUrl, { signal: controller.signal });
      if (!res.ok || !res.body) {
        throw new Error(`Download of ${bucket}/${path} failed (${res.status})`);
      }
      return Readable.fromWeb(res.body as never);
    } finally {
      clearTimeout(timer);
    }
  }

  // ---- the finished archive ----------------------------------------------------------------

  ensureBucket(): Promise<void> {
    this.bucketReady ??= (async () => {
      // The archives hold a customer's whole workspace: the bucket must be private, or a public
      // URL would bypass the 14-day signed link. A bucket that already exists is checked, and
      // made private when it is not.
      let { data } = await this.client.storage.getBucket(this.exportBucket);
      if (!data) {
        const { error } = await this.client.storage.createBucket(this.exportBucket, {
          public: false,
        });
        if (error && !/already exists/i.test(error.message)) {
          this.bucketReady = null;
          throw new Error(`Export bucket unavailable: ${error.message}`);
        }
        // Someone else may have created it first (with any visibility): read it back.
        data = (await this.client.storage.getBucket(this.exportBucket)).data;
      }
      if (data?.public !== false) {
        const { error } = await this.client.storage.updateBucket(this.exportBucket, {
          public: false,
        });
        if (error) {
          this.bucketReady = null;
          throw new Error(`Export bucket is not private and could not be fixed: ${error.message}`);
        }
      }
    })();
    return this.bucketReady;
  }

  async uploadArchive(path: string, localPath: string): Promise<void> {
    await this.ensureBucket();
    const { size } = await stat(localPath);
    const url = `${this.supabaseUrl.endsWith('/') ? this.supabaseUrl.slice(0, -1) : this.supabaseUrl}/storage/v1/object/${this.exportBucket}/${path
      .split('/')
      .map(encodeURIComponent)
      .join('/')}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.serviceKey}`,
        apikey: this.serviceKey,
        'Content-Type': 'application/zip',
        'Content-Length': String(size),
        'x-upsert': 'true',
      },
      body: Readable.toWeb(createReadStream(localPath)) as never,
      // Node's fetch needs this to send a streamed body.
      duplex: 'half',
    } as RequestInit);
    if (!res.ok) {
      const hint = res.status === 413 ? ' (raise the Supabase Storage file size limit)' : '';
      throw new Error(`Archive upload failed (${res.status})${hint}`);
    }
  }

  async signedDownloadUrl(
    path: string,
    expiresInSeconds: number,
    downloadName: string
  ): Promise<string> {
    const { data, error } = await this.client.storage
      .from(this.exportBucket)
      .createSignedUrl(path, expiresInSeconds, { download: downloadName });
    if (error || !data) throw new Error('Export link could not be created');
    return data.signedUrl;
  }

  async removeArchive(path: string): Promise<void> {
    const { error } = await this.client.storage.from(this.exportBucket).remove([path]);
    if (error) throw new Error(`Export archive could not be removed: ${error.message}`);
  }
}
