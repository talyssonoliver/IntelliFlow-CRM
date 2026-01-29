import { createHash } from 'crypto';
import {
  CaseDocument,
  CaseDocumentRepository,
  DocumentClassification,
  DocumentStatus,
  AccessLevel,
  DocumentIngestionCreatedEvent,
  DocumentIngestionFailedEvent,
} from '@intelliflow/domain';
import { EventBusPort, StorageServicePort, AVScannerPort } from '../ports/external';

/**
 * File Ingestion Metadata
 */
export interface FileMetadata {
  tenantId: string;
  filename: string;
  mimeType: string;
  uploadedBy: string;
  relatedCaseId?: string;
  relatedContactId?: string;
}

/**
 * Ingestion Options
 */
export interface IngestionOptions {
  maxRetries?: number;
  retryDelayMs?: number;
}

/**
 * Ingestion Result
 */
export interface IngestionResult {
  success: boolean;
  documentId?: string;
  duplicate?: boolean;
  error?: string;
  threatName?: string;
}

/**
 * Extracted File Metadata
 */
interface ExtractedMetadata {
  contentHash: string;
  mimeType: string;
  sizeBytes: number;
  classification: DocumentClassification;
}

/**
 * Ingestion Orchestrator
 *
 * Orchestrates the file ingestion pipeline:
 * 1. Validation (size, MIME type)
 * 2. Hash calculation and duplicate detection
 * 3. Upload to quarantine
 * 4. AV scanning
 * 5. Metadata extraction
 * 6. Move to primary storage
 * 7. Create CaseDocument entity
 * 8. Emit events
 */
export class IngestionOrchestrator {
  private readonly MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
  private readonly ALLOWED_MIME_TYPES = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
    'application/msword', // DOC
    'image/jpeg',
    'image/png',
    'image/gif',
    'text/plain',
  ];

  private readonly CLASSIFICATION_RULES: Array<{
    pattern: RegExp;
    classification: DocumentClassification;
  }> = [
    { pattern: /privilege|attorney|legal/i, classification: 'PRIVILEGED' as DocumentClassification },
    { pattern: /confidential|private/i, classification: 'CONFIDENTIAL' as DocumentClassification },
    { pattern: /internal/i, classification: 'INTERNAL' as DocumentClassification },
  ];

  constructor(
    private readonly repository: CaseDocumentRepository,
    private readonly eventBus: EventBusPort,
    private readonly storageService: StorageServicePort,
    private readonly avScanner: AVScannerPort
  ) {}

  /**
   * Ingest a file through the complete pipeline
   */
  async ingestFile(
    file: Buffer,
    metadata: FileMetadata,
    options: IngestionOptions = {}
  ): Promise<IngestionResult> {
    const { maxRetries = 3, retryDelayMs = 1000 } = options;

    try {
      // Step 1: Validate file
      const validationError = this.validateFile(file, metadata.mimeType);
      if (validationError) {
        await this.emitFailureEvent(metadata, validationError);
        return { success: false, error: validationError };
      }

      // Step 2: Extract metadata and calculate hash
      const extractedMetadata = await this.extractMetadata(file, metadata.filename, metadata.mimeType);

      // Step 3: Check for duplicates (idempotency)
      const duplicate = await this.checkDuplicate(extractedMetadata.contentHash, metadata.tenantId);
      if (duplicate) {
        return {
          success: true,
          documentId: duplicate.id,
          duplicate: true,
        };
      }

      // Step 4: Upload to quarantine with retries
      const quarantineKey = await this.retryOperation(
        () => this.storageService.uploadToQuarantine(file, metadata.filename, metadata.tenantId),
        maxRetries,
        retryDelayMs
      );

      // Step 5: AV Scan
      const scanResult = await this.avScanner.scan(file);
      if (!scanResult.clean) {
        await this.storageService.deleteFromQuarantine(quarantineKey);
        await this.emitFailureEvent(metadata, 'Virus detected', scanResult.threatName);
        return {
          success: false,
          error: `File rejected: virus detected (${scanResult.threatName})`,
          threatName: scanResult.threatName || undefined,
        };
      }

      // Step 6: Move to primary storage
      const primaryKey = `${metadata.tenantId}/${extractedMetadata.contentHash}`;
      const storageKey = await this.storageService.moveToPrimary(quarantineKey, primaryKey);

      // Step 7: Create CaseDocument entity
      const document = CaseDocument.create({
        tenantId: metadata.tenantId,
        metadata: {
          title: metadata.filename,
          documentType: this.inferDocumentType(metadata.mimeType),
          classification: extractedMetadata.classification,
          tags: [],
          relatedCaseId: metadata.relatedCaseId,
          relatedContactId: metadata.relatedContactId,
        },
        storageKey,
        contentHash: extractedMetadata.contentHash,
        mimeType: extractedMetadata.mimeType,
        sizeBytes: extractedMetadata.sizeBytes,
        createdBy: metadata.uploadedBy,
      });

      // Grant creator full access
      document.grantAccess(metadata.uploadedBy, 'USER', AccessLevel.ADMIN, metadata.uploadedBy);

      // Step 8: Save to repository
      await this.repository.save(document);

      // Step 9: Emit success event
      await this.eventBus.publish(
        new DocumentIngestionCreatedEvent(
          document.id,
          metadata.tenantId,
          metadata.filename,
          extractedMetadata.contentHash,
          extractedMetadata.classification,
          metadata.uploadedBy
        )
      );

      return {
        success: true,
        documentId: document.id,
        duplicate: false,
      };
    } catch (error: any) {
      // Final failure after retries exhausted
      await this.emitFailureEvent(metadata, error.message);
      return {
        success: false,
        error: error.message || 'Unknown error during ingestion',
      };
    }
  }

  /**
   * Validate file size and MIME type
   */
  private validateFile(file: Buffer, mimeType: string): string | null {
    if (file.length > this.MAX_FILE_SIZE) {
      return `File size ${file.length} bytes exceeds maximum size of ${this.MAX_FILE_SIZE} bytes`;
    }

    if (!this.ALLOWED_MIME_TYPES.includes(mimeType)) {
      return `MIME type ${mimeType} is not allowed`;
    }

    return null;
  }

  /**
   * Extract metadata from file
   */
  private async extractMetadata(
    file: Buffer,
    filename: string,
    mimeType: string
  ): Promise<ExtractedMetadata> {
    const contentHash = createHash('sha256').update(file).digest('hex');
    const classification = this.classifyDocument(filename);

    return {
      contentHash,
      mimeType,
      sizeBytes: file.length,
      classification,
    };
  }

  /**
   * Classify document based on filename patterns
   */
  private classifyDocument(filename: string): DocumentClassification {
    for (const rule of this.CLASSIFICATION_RULES) {
      if (rule.pattern.test(filename)) {
        return rule.classification;
      }
    }
    return 'PUBLIC' as DocumentClassification; // Default
  }

  /**
   * Check if file already exists (duplicate detection)
   */
  private async checkDuplicate(
    contentHash: string,
    tenantId: string
  ): Promise<{ id: string } | null> {
    // In a real implementation, this would query a hash index
    // For now, we'll skip this optimization
    return null;
  }

  /**
   * Infer document type from MIME type
   */
  private inferDocumentType(
    mimeType: string
  ): 'CONTRACT' | 'AGREEMENT' | 'EVIDENCE' | 'CORRESPONDENCE' | 'COURT_FILING' | 'MEMO' | 'REPORT' | 'OTHER' {
    // Infer based on MIME type - more sophisticated logic can be added
    if (mimeType === 'application/pdf') return 'REPORT';
    if (mimeType.includes('word')) return 'MEMO';
    if (mimeType.startsWith('image/')) return 'EVIDENCE';
    return 'OTHER';
  }

  /**
   * Emit failure event
   */
  private async emitFailureEvent(
    metadata: FileMetadata,
    error: string,
    threatName?: string | null
  ): Promise<void> {
    await this.eventBus.publish(
      new DocumentIngestionFailedEvent(
        metadata.tenantId,
        metadata.filename,
        metadata.uploadedBy,
        error,
        threatName || undefined
      )
    );
  }

  /**
   * Retry operation with exponential backoff
   */
  private async retryOperation<T>(
    operation: () => Promise<T>,
    maxRetries: number,
    initialDelayMs: number
  ): Promise<T> {
    let lastError: Error | undefined;
    let delay = initialDelayMs;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay *= 2; // Exponential backoff
        }
      }
    }

    throw lastError || new Error('Operation failed after retries');
  }
}
