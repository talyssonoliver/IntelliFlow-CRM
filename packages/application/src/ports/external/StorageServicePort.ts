/**
 * Storage Service Port
 *
 * Interface for file storage operations following the quarantine-then-promote pattern.
 * Implementations can use Supabase Storage, AWS S3, or other object storage.
 */
export interface StorageServicePort {
  /**
   * Upload file to quarantine bucket for AV scanning
   * @param file File buffer
   * @param filename Original filename
   * @param tenantId Tenant ID for isolation
   * @returns Storage key in quarantine bucket
   */
  uploadToQuarantine(file: Buffer, filename: string, tenantId: string): Promise<string>;

  /**
   * Move file from quarantine to primary storage after successful AV scan
   * @param quarantineKey Key in quarantine bucket
   * @param primaryKey Destination key in primary bucket
   * @returns Final storage key
   */
  moveToPrimary(quarantineKey: string, primaryKey: string): Promise<string>;

  /**
   * Delete file from quarantine (rejected or failed)
   * @param quarantineKey Key in quarantine bucket
   */
  deleteFromQuarantine(quarantineKey: string): Promise<void>;

  /**
   * Download file from storage (for AV scanning)
   * @param storageKey Storage key
   * @returns File buffer
   */
  download(storageKey: string): Promise<Buffer>;

  /**
   * Generate a signed URL for temporary file access
   * @param storageKey Storage key
   * @param expiresIn Expiration in seconds
   * @returns Signed URL
   */
  getSignedUrl(storageKey: string, expiresIn: number): Promise<string>;
}
