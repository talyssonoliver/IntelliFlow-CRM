import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { StorageServicePort } from '@intelliflow/application';

/**
 * Supabase Storage Adapter
 *
 * Implements file storage using Supabase Storage (S3-compatible).
 * Follows the quarantine-then-promote pattern for antivirus scanning.
 */
export class SupabaseStorageAdapter implements StorageServicePort {
  private readonly client: SupabaseClient;
  private readonly quarantineBucket = 'case-documents-quarantine';
  private readonly primaryBucket = 'case-documents';

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

  /**
   * Sanitize filename to prevent path traversal attacks
   */
  private sanitizeFilename(filename: string): string {
    return filename.replace(/[^a-zA-Z0-9.-]/g, '_');
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
