/**
 * Email Attachment Handler
 *
 * Handles processing, validation, and storage of email attachments:
 * - Size validation
 * - MIME type verification
 * - Virus scanning integration
 * - Secure storage
 * - Content extraction for indexing
 */

import { z } from 'zod';
import { createHash } from 'crypto';

// Attachment metadata schema
export const AttachmentMetadataSchema = z.object({
  id: z.string(),
  filename: z.string(),
  originalFilename: z.string(),
  contentType: z.string(),
  size: z.number(),
  checksum: z.string(),
  emailId: z.string(),
  uploadedAt: z.date(),
  storagePath: z.string().optional(),
  extractedText: z.string().optional(),
  scanStatus: z.enum(['pending', 'clean', 'infected', 'error']).default('pending'),
  scanResult: z.string().optional(),
});

export type AttachmentMetadata = z.infer<typeof AttachmentMetadataSchema>;

// Attachment validation rules
export interface AttachmentValidationRules {
  maxSizeBytes: number;
  allowedMimeTypes: string[];
  blockedExtensions: string[];
  requireVirusScan: boolean;
}

// Default validation rules
export const DEFAULT_ATTACHMENT_RULES: AttachmentValidationRules = {
  maxSizeBytes: 25 * 1024 * 1024, // 25 MB
  allowedMimeTypes: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'text/html',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'application/zip',
    'application/x-zip-compressed',
    'application/json',
    'application/xml',
    'text/xml',
  ],
  blockedExtensions: [
    '.exe', '.bat', '.cmd', '.com', '.msi', '.scr', '.pif',
    '.vbs', '.vbe', '.js', '.jse', '.ws', '.wsf', '.wsc', '.wsh',
    '.ps1', '.psm1', '.psd1', '.dll', '.sys', '.drv',
    '.hta', '.cpl', '.reg', '.inf', '.lnk', '.url',
  ],
  requireVirusScan: true,
};

// Validation result
export interface AttachmentValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  metadata: {
    detectedMimeType?: string;
    extension?: string;
    magic?: string;
  };
}

// Storage interface
export interface AttachmentStorage {
  save(id: string, content: Buffer, metadata: Partial<AttachmentMetadata>): Promise<string>;
  get(id: string): Promise<{ content: Buffer; metadata: AttachmentMetadata } | null>;
  delete(id: string): Promise<boolean>;
  exists(id: string): Promise<boolean>;
  getUrl(id: string, expiresInSeconds?: number): Promise<string | null>;
}

// Virus scanner interface
export interface VirusScanner {
  scan(content: Buffer): Promise<{
    clean: boolean;
    threatName?: string;
    scanDuration: number;
  }>;
  isAvailable(): Promise<boolean>;
}

// Content extractor interface
export interface ContentExtractor {
  extract(content: Buffer, mimeType: string): Promise<string | null>;
  canExtract(mimeType: string): boolean;
}

/**
 * File magic number signatures for MIME type detection
 */
const MAGIC_SIGNATURES: Array<{ bytes: number[]; mimeType: string }> = [
  { bytes: [0xFF, 0xD8, 0xFF], mimeType: 'image/jpeg' },
  { bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], mimeType: 'image/png' },
  { bytes: [0x47, 0x49, 0x46, 0x38], mimeType: 'image/gif' },
  { bytes: [0x50, 0x4B, 0x03, 0x04], mimeType: 'application/zip' },
  { bytes: [0x25, 0x50, 0x44, 0x46], mimeType: 'application/pdf' },
  { bytes: [0x52, 0x49, 0x46, 0x46], mimeType: 'audio/wav' },
  { bytes: [0x00, 0x00, 0x00, 0x14, 0x66, 0x74, 0x79, 0x70], mimeType: 'video/mp4' },
  { bytes: [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70], mimeType: 'video/mp4' },
  { bytes: [0x00, 0x00, 0x00, 0x1C, 0x66, 0x74, 0x79, 0x70], mimeType: 'video/mp4' },
];

/**
 * Detect MIME type from file content using magic numbers
 */
export function detectMimeType(content: Buffer): string | undefined {
  for (const sig of MAGIC_SIGNATURES) {
    if (content.length >= sig.bytes.length) {
      const match = sig.bytes.every((byte, index) => content[index] === byte);
      if (match) {
        return sig.mimeType;
      }
    }
  }

  // Check for text content
  if (isTextContent(content)) {
    return 'text/plain';
  }

  return undefined;
}

/**
 * Check if content appears to be text
 */
function isTextContent(content: Buffer, sampleSize = 1024): boolean {
  const sample = content.subarray(0, Math.min(sampleSize, content.length));
  let textChars = 0;
  let binaryChars = 0;

  for (const byte of sample) {
    if (byte === 0) {
      return false; // Null byte indicates binary
    } else if (
      (byte >= 32 && byte <= 126) || // Printable ASCII
      byte === 9 || // Tab
      byte === 10 || // LF
      byte === 13 // CR
    ) {
      textChars++;
    } else if (byte < 32 || (byte >= 127 && byte <= 159)) {
      binaryChars++;
    }
  }

  return binaryChars / sample.length < 0.1; // Less than 10% binary chars
}

/**
 * Get file extension from filename
 */
export function getExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1 || lastDot === filename.length - 1) {
    return '';
  }
  return filename.slice(lastDot).toLowerCase();
}

/**
 * Sanitize filename for safe storage
 */
export function sanitizeFilename(filename: string): string {
  // Remove path separators and dangerous characters
  return filename
    .replace(/[/\\:*?"<>|]/g, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.+/, '')
    .slice(0, 255);
}

/**
 * Generate unique attachment ID
 */
export function generateAttachmentId(content: Buffer, emailId: string): string {
  const hash = createHash('sha256')
    .update(emailId)
    .update(content)
    .digest('hex')
    .slice(0, 16);
  return `att_${Date.now().toString(36)}_${hash}`;
}

/**
 * In-memory attachment storage for development
 */
export class InMemoryAttachmentStorage implements AttachmentStorage {
  private store = new Map<string, { content: Buffer; metadata: AttachmentMetadata }>();

  async save(id: string, content: Buffer, metadata: Partial<AttachmentMetadata>): Promise<string> {
    const fullMetadata: AttachmentMetadata = {
      id,
      filename: metadata.filename || id,
      originalFilename: metadata.originalFilename || metadata.filename || id,
      contentType: metadata.contentType || 'application/octet-stream',
      size: content.length,
      checksum: createHash('sha256').update(content).digest('hex'),
      emailId: metadata.emailId || 'unknown',
      uploadedAt: new Date(),
      storagePath: `memory://${id}`,
      scanStatus: metadata.scanStatus || 'pending',
      ...metadata,
    };

    this.store.set(id, { content, metadata: fullMetadata });
    return fullMetadata.storagePath!;
  }

  async get(id: string): Promise<{ content: Buffer; metadata: AttachmentMetadata } | null> {
    return this.store.get(id) || null;
  }

  async delete(id: string): Promise<boolean> {
    return this.store.delete(id);
  }

  async exists(id: string): Promise<boolean> {
    return this.store.has(id);
  }

  async getUrl(id: string, _expiresInSeconds?: number): Promise<string | null> {
    if (this.store.has(id)) {
      return `data:application/octet-stream;base64,${this.store.get(id)!.content.toString('base64')}`;
    }
    return null;
  }

  clear(): void {
    this.store.clear();
  }
}

/**
 * Mock virus scanner for development
 */
export class MockVirusScanner implements VirusScanner {
  private simulateInfected: boolean;

  constructor(options?: { simulateInfected?: boolean }) {
    this.simulateInfected = options?.simulateInfected || false;
  }

  async scan(content: Buffer): Promise<{
    clean: boolean;
    threatName?: string;
    scanDuration: number;
  }> {
    const startTime = Date.now();

    // Simulate scan time
    await new Promise(resolve => setTimeout(resolve, 50));

    // Check for EICAR test virus signature
    const contentStr = content.toString();
    if (contentStr.includes('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*')) {
      return {
        clean: false,
        threatName: 'EICAR-Test-File',
        scanDuration: Date.now() - startTime,
      };
    }

    if (this.simulateInfected) {
      return {
        clean: false,
        threatName: 'Simulated.Threat.A',
        scanDuration: Date.now() - startTime,
      };
    }

    return {
      clean: true,
      scanDuration: Date.now() - startTime,
    };
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}

/**
 * Basic content extractor for text extraction
 */
export class BasicContentExtractor implements ContentExtractor {
  private supportedTypes = [
    'text/plain',
    'text/html',
    'text/csv',
    'text/xml',
    'application/json',
    'application/xml',
  ];

  canExtract(mimeType: string): boolean {
    return this.supportedTypes.includes(mimeType);
  }

  async extract(content: Buffer, mimeType: string): Promise<string | null> {
    if (!this.canExtract(mimeType)) {
      return null;
    }

    const text = content.toString('utf-8');

    if (mimeType === 'text/html') {
      // Strip HTML tags for plain text extraction
      return text
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    return text;
  }
}

/**
 * Main attachment handler
 */
export class AttachmentHandler {
  private rules: AttachmentValidationRules;
  private storage: AttachmentStorage;
  private virusScanner?: VirusScanner;
  private contentExtractor?: ContentExtractor;

  constructor(options: {
    rules?: Partial<AttachmentValidationRules>;
    storage?: AttachmentStorage;
    virusScanner?: VirusScanner;
    contentExtractor?: ContentExtractor;
  } = {}) {
    this.rules = { ...DEFAULT_ATTACHMENT_RULES, ...options.rules };
    this.storage = options.storage || new InMemoryAttachmentStorage();
    this.virusScanner = options.virusScanner;
    this.contentExtractor = options.contentExtractor;
  }

  /**
   * Validate an attachment before processing
   */
  validate(
    content: Buffer,
    filename: string,
    declaredMimeType?: string
  ): AttachmentValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const extension = getExtension(filename);

    // Size check
    if (content.length > this.rules.maxSizeBytes) {
      errors.push(
        `File size (${(content.length / 1024 / 1024).toFixed(2)} MB) exceeds maximum allowed (${
          this.rules.maxSizeBytes / 1024 / 1024
        } MB)`
      );
    }

    // Extension check
    if (this.rules.blockedExtensions.includes(extension)) {
      errors.push(`File extension "${extension}" is not allowed`);
    }

    // MIME type detection and validation
    const detectedMimeType = detectMimeType(content);
    const effectiveMimeType = declaredMimeType || detectedMimeType || 'application/octet-stream';

    if (this.rules.allowedMimeTypes.length > 0) {
      const isAllowed = this.rules.allowedMimeTypes.some(
        allowed => effectiveMimeType === allowed || effectiveMimeType.startsWith(allowed.replace('*', ''))
      );

      if (!isAllowed) {
        errors.push(`MIME type "${effectiveMimeType}" is not allowed`);
      }
    }

    // Check for MIME type mismatch
    if (declaredMimeType && detectedMimeType && declaredMimeType !== detectedMimeType) {
      warnings.push(
        `Declared MIME type (${declaredMimeType}) differs from detected (${detectedMimeType})`
      );
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      metadata: {
        detectedMimeType,
        extension,
      },
    };
  }

  /**
   * Process and store an attachment
   */
  async process(
    content: Buffer,
    filename: string,
    emailId: string,
    options?: {
      contentType?: string;
      skipValidation?: boolean;
      skipVirusScan?: boolean;
    }
  ): Promise<{
    success: boolean;
    metadata?: AttachmentMetadata;
    errors?: string[];
  }> {
    const errors: string[] = [];

    // Validate unless skipped
    if (!options?.skipValidation) {
      const validation = this.validate(content, filename, options?.contentType);
      if (!validation.valid) {
        return { success: false, errors: validation.errors };
      }
    }

    // Virus scan
    let scanStatus: 'pending' | 'clean' | 'infected' | 'error' = 'pending';
    let scanResult: string | undefined;

    if (this.virusScanner && this.rules.requireVirusScan && !options?.skipVirusScan) {
      try {
        const scanResponse = await this.virusScanner.scan(content);
        scanStatus = scanResponse.clean ? 'clean' : 'infected';
        if (!scanResponse.clean) {
          scanResult = scanResponse.threatName;
          errors.push(`Virus detected: ${scanResponse.threatName}`);
          return { success: false, errors };
        }
      } catch (error) {
        scanStatus = 'error';
        scanResult = error instanceof Error ? error.message : 'Scan failed';
        console.warn('Virus scan failed:', scanResult);
      }
    }

    // Generate ID and sanitize filename
    const id = generateAttachmentId(content, emailId);
    const sanitizedFilename = sanitizeFilename(filename);

    // Extract text content if possible
    let extractedText: string | undefined;
    const mimeType = options?.contentType || detectMimeType(content) || 'application/octet-stream';

    if (this.contentExtractor && this.contentExtractor.canExtract(mimeType)) {
      try {
        extractedText = (await this.contentExtractor.extract(content, mimeType)) || undefined;
      } catch (error) {
        console.warn('Content extraction failed:', error);
      }
    }

    // Store attachment
    const storagePath = await this.storage.save(id, content, {
      filename: sanitizedFilename,
      originalFilename: filename,
      contentType: mimeType,
      emailId,
      scanStatus,
      scanResult,
      extractedText,
    });

    const stored = await this.storage.get(id);
    if (!stored) {
      return { success: false, errors: ['Failed to verify stored attachment'] };
    }

    return {
      success: true,
      metadata: stored.metadata,
    };
  }

  /**
   * Get attachment by ID
   */
  async get(id: string): Promise<{ content: Buffer; metadata: AttachmentMetadata } | null> {
    return this.storage.get(id);
  }

  /**
   * Delete attachment
   */
  async delete(id: string): Promise<boolean> {
    return this.storage.delete(id);
  }

  /**
   * Get temporary URL for attachment download
   */
  async getDownloadUrl(id: string, expiresInSeconds = 3600): Promise<string | null> {
    return this.storage.getUrl(id, expiresInSeconds);
  }

  /**
   * Process multiple attachments from an email
   */
  async processEmailAttachments(
    attachments: Array<{ filename: string; content: Buffer; contentType?: string }>,
    emailId: string
  ): Promise<{
    successful: AttachmentMetadata[];
    failed: Array<{ filename: string; errors: string[] }>;
  }> {
    const successful: AttachmentMetadata[] = [];
    const failed: Array<{ filename: string; errors: string[] }> = [];

    for (const attachment of attachments) {
      const result = await this.process(
        attachment.content,
        attachment.filename,
        emailId,
        { contentType: attachment.contentType }
      );

      if (result.success && result.metadata) {
        successful.push(result.metadata);
      } else {
        failed.push({
          filename: attachment.filename,
          errors: result.errors || ['Unknown error'],
        });
      }
    }

    return { successful, failed };
  }
}

// Export factory function
export function createAttachmentHandler(options?: {
  rules?: Partial<AttachmentValidationRules>;
  storage?: AttachmentStorage;
  virusScanner?: VirusScanner;
  contentExtractor?: ContentExtractor;
}): AttachmentHandler {
  return new AttachmentHandler({
    ...options,
    virusScanner: options?.virusScanner || new MockVirusScanner(),
    contentExtractor: options?.contentExtractor || new BasicContentExtractor(),
  });
}
