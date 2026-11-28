import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import type {
  EmailAttachmentStoragePort,
  StorageServicePort,
  StoredObjectDeleteFailure,
  StoredObjectDeletionPort,
} from '@intelliflow/application';
import { isAttachmentPathInTenant, isManagedRef } from '@intelliflow/domain';
import { storedObjectConfigFromEnv } from './stored-object-config';

/**
 * Supabase Storage Adapter
 *
 * Implements file storage using Supabase Storage (S3-compatible).
 * Follows the quarantine-then-promote pattern for antivirus scanning.
 */
export class SupabaseStorageAdapter
  implements StorageServicePort, EmailAttachmentStoragePort, StoredObjectDeletionPort
{
  private readonly client: SupabaseClient;
  private readonly quarantineBucket = 'case-documents-quarantine';
  private readonly primaryBucket = 'case-documents';
  /** PG-207: private bucket for compose attachments, never the legal case-documents bucket. */
  private readonly emailAttachmentsBucket =
    process.env.EMAIL_ATTACHMENTS_BUCKET || 'email-attachments';
  private emailBucketReady: Promise<void> | null = null;

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.client = createClient(supabaseUrl, supabaseKey);
  }

  async uploadToQuarantine(file: Buffer, filename: string, tenantId: string): Promise<string> {
    const timestamp = Date.now();
    const safeName = this.sanitizeFilename(filename);
    const path = `${tenantId}/${timestamp}-${safeName}`;

    const { data, error } = await this.client.storage
      .from(this.quarantineBucket)
      .upload(path, file, {
        contentType: this.inferContentType(filename),
        upsert: false,
      });

    if (error) {
      throw new Error(`Failed to upload to quarantine: ${error.message}`);
    }

    return data.path;
  }

  async moveToPrimary(quarantineKey: string, primaryKey: string): Promise<string> {
    // Download from quarantine
    const { data: fileData, error: downloadError } = await this.client.storage
      .from(this.quarantineBucket)
      .download(quarantineKey);

    if (downloadError) {
      throw new Error(`Failed to download from quarantine: ${downloadError.message}`);
    }

    // Upload to primary
    const fileBuffer = Buffer.from(await fileData.arrayBuffer());
    const { data: uploadData, error: uploadError } = await this.client.storage
      .from(this.primaryBucket)
      .upload(primaryKey, fileBuffer, {
        upsert: true, // Allow overwrite in case of retry
      });

    if (uploadError) {
      throw new Error(`Failed to upload to primary storage: ${uploadError.message}`);
    }

    // Delete from quarantine
    await this.deleteFromQuarantine(quarantineKey);

    return uploadData.path;
  }

  async deleteFromQuarantine(quarantineKey: string): Promise<void> {
    const { error } = await this.client.storage.from(this.quarantineBucket).remove([quarantineKey]);

    if (error) {
      // Log warning but don't throw - cleanup failures shouldn't block ingestion
      console.warn(`Failed to delete from quarantine: ${error.message}`);
    }
  }

  async download(storageKey: string): Promise<Buffer> {
    const { data, error } = await this.client.storage.from(this.primaryBucket).download(storageKey);

    if (error) {
      throw new Error(`Failed to download file: ${error.message}`);
    }

    return Buffer.from(await data.arrayBuffer());
  }

  async getSignedUrl(storageKey: string, expiresIn: number): Promise<string> {
    const { data, error } = await this.client.storage
      .from(this.primaryBucket)
      .createSignedUrl(storageKey, expiresIn);

    if (error) {
      throw new Error(`Failed to create signed URL: ${error.message}`);
    }

    return data.signedUrl;
  }

  /** Creates the private email-attachments bucket on first use (idempotent, once per process). */
  private ensureEmailBucket(): Promise<void> {
    this.emailBucketReady ??= (async () => {
      const { data } = await this.client.storage.getBucket(this.emailAttachmentsBucket);
      if (data) return;
      const { error } = await this.client.storage.createBucket(this.emailAttachmentsBucket, {
        public: false,
      });
      if (error) {
        this.emailBucketReady = null;
        throw new Error('Email attachment storage is unavailable');
      }
    })();
    return this.emailBucketReady;
  }

  async uploadEmailAttachment(
    tenantId: string,
    file: Buffer,
    fileName: string,
    contentType: string
  ): Promise<string> {
    await this.ensureEmailBucket();
    const path = `${tenantId}/${randomUUID()}-${this.sanitizeFilename(fileName)}`;
    const { data, error } = await this.client.storage
      .from(this.emailAttachmentsBucket)
      .upload(path, file, { contentType, upsert: false });
    if (error || !data) throw new Error('Email attachment upload failed');
    return data.path;
  }

  async downloadEmailAttachment(tenantId: string, storagePath: string): Promise<Buffer> {
    this.assertTenantPath(tenantId, storagePath);
    const { data, error } = await this.client.storage
      .from(this.emailAttachmentsBucket)
      .download(storagePath);
    if (error || !data) throw new Error('Email attachment download failed');
    return Buffer.from(await data.arrayBuffer());
  }

  async emailAttachmentDownloadUrl(
    tenantId: string,
    storagePath: string,
    expiresInSeconds: number
  ): Promise<string> {
    this.assertTenantPath(tenantId, storagePath);
    const { data, error } = await this.client.storage
      .from(this.emailAttachmentsBucket)
      .createSignedUrl(storagePath, expiresInSeconds);
    if (error || !data) throw new Error('Email attachment link failed');
    return data.signedUrl;
  }

  /**
   * IFC-316: deletes an erased person's stored objects, per bucket. An object is deleted only if
   * it is under `<tenantId>/` (no traversal) in a bucket the CRM owns; anything else is
   * refused and never sent to storage. A path already gone is not an error. A storage failure is
   * returned, not thrown, so the caller can keep the object queued.
   */
  async deleteStoredObjects(
    tenantId: string,
    objects: ReadonlyArray<{ id: string; bucket: string; path: string }>
  ): Promise<{ failed: Array<{ id: string; code: StoredObjectDeleteFailure }> }> {
    const config = storedObjectConfigFromEnv();
    const failed: Array<{ id: string; code: StoredObjectDeleteFailure }> = [];
    const byBucket = new Map<string, Array<{ id: string; path: string }>>();
    for (const object of objects) {
      if (!isManagedRef({ bucket: object.bucket, path: object.path }, tenantId, config)) {
        failed.push({ id: object.id, code: 'REFUSED' });
        continue;
      }
      const group = byBucket.get(object.bucket) ?? [];
      group.push({ id: object.id, path: object.path });
      byBucket.set(object.bucket, group);
    }
    for (const [bucket, group] of byBucket) {
      const ok = await this.client.storage
        .from(bucket)
        .remove(group.map((g) => g.path))
        .then(({ error }) => !error)
        .catch(() => false);
      if (!ok) failed.push(...group.map((g) => ({ id: g.id, code: 'STORAGE_ERROR' as const })));
    }
    return { failed };
  }

  /**
   * Refuses any attachment path not under `<tenantId>/`, including encoded or
   * backslash traversal: the storage URL built from it is normalised later.
   */
  private assertTenantPath(tenantId: string, storagePath: string): void {
    if (!isAttachmentPathInTenant(storagePath, tenantId)) {
      throw new Error('Refusing an attachment path outside the tenant');
    }
  }

  /**
   * Sanitize filename to prevent path traversal attacks
   */
  private sanitizeFilename(filename: string): string {
    return filename.replaceAll(/[^a-zA-Z0-9.-]/g, '_');
  }

  /**
   * Infer content type from filename extension
   */
  private inferContentType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();
    const types: Record<string, string> = {
      pdf: 'application/pdf',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      doc: 'application/msword',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      txt: 'text/plain',
    };
    return types[ext || ''] || 'application/octet-stream';
  }
}
