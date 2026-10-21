import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import type { EmailAttachmentStoragePort, StorageServicePort } from '@intelliflow/application';

/**
 * Supabase Storage Adapter
 *
 * Implements file storage using Supabase Storage (S3-compatible).
 * Follows the quarantine-then-promote pattern for antivirus scanning.
 */
export class SupabaseStorageAdapter implements StorageServicePort, EmailAttachmentStoragePort {
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
    const segments = storagePath.split('/');
    if (segments[0] !== tenantId || segments.some((s) => s === '..' || s === '.' || s === '')) {
      throw new Error('Refusing an attachment path outside the tenant');
    }
    const { data, error } = await this.client.storage
      .from(this.emailAttachmentsBucket)
      .download(storagePath);
    if (error || !data) throw new Error('Email attachment download failed');
    return Buffer.from(await data.arrayBuffer());
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
