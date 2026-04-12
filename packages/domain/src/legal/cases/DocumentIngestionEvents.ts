import { DomainEvent } from '../../shared/DomainEvent';
import { DocumentClassification } from './case-document';

/**
 * Event: Document was successfully created through ingestion pipeline
 * Note: Named differently from case-document.ts DocumentCreatedEvent to avoid conflict
 */
export class DocumentIngestionCreatedEvent extends DomainEvent {
  readonly eventType = 'document.ingestion.created';

  constructor(
    public readonly documentId: string,
    public readonly tenantId: string,
    public readonly filename: string,
    public readonly contentHash: string,
    public readonly classification: DocumentClassification,
    public readonly uploadedBy: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      documentId: this.documentId,
      tenantId: this.tenantId,
      filename: this.filename,
      contentHash: this.contentHash,
      classification: this.classification,
      uploadedBy: this.uploadedBy,
    };
  }
}

/**
 * Event: Document ingestion failed (validation, AV scan, storage, etc.)
 */
export class DocumentIngestionFailedEvent extends DomainEvent {
  readonly eventType = 'document.ingestion_failed';

  constructor(
    public readonly tenantId: string,
    public readonly filename: string,
    public readonly uploadedBy: string,
    public readonly error: string,
    public readonly threatName?: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      tenantId: this.tenantId,
      filename: this.filename,
      uploadedBy: this.uploadedBy,
      error: this.error,
      threatName: this.threatName,
    };
  }
}
