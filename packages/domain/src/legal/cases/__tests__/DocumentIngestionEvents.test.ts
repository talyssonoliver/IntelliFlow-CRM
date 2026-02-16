/**
 * DocumentIngestionEvents Tests
 *
 * Tests for document ingestion domain events ensuring proper
 * construction, property access, and payload serialization.
 *
 * Coverage target: >95% for domain layer
 */

import { describe, it, expect } from 'vitest';
import {
  DocumentIngestionCreatedEvent,
  DocumentIngestionFailedEvent,
} from '../DocumentIngestionEvents';
import { DocumentClassification } from '../case-document';

describe('DocumentIngestionCreatedEvent', () => {
  const createEvent = (
    overrides?: Partial<{
      documentId: string;
      tenantId: string;
      filename: string;
      contentHash: string;
      classification: DocumentClassification;
      uploadedBy: string;
    }>
  ) => {
    return new DocumentIngestionCreatedEvent(
      overrides?.documentId ?? 'doc-001',
      overrides?.tenantId ?? 'tenant-123',
      overrides?.filename ?? 'contract.pdf',
      overrides?.contentHash ?? 'abc123def456',
      overrides?.classification ?? DocumentClassification.CONFIDENTIAL,
      overrides?.uploadedBy ?? 'user-789'
    );
  };

  it('should create event with correct eventType', () => {
    const event = createEvent();
    expect(event.eventType).toBe('document.ingestion.created');
  });

  it('should have unique eventId (UUID)', () => {
    const event1 = createEvent();
    const event2 = createEvent();
    expect(event1.eventId).toBeDefined();
    expect(event2.eventId).toBeDefined();
    expect(event1.eventId).not.toBe(event2.eventId);
  });

  it('should set occurredAt to a recent Date', () => {
    const before = new Date();
    const event = createEvent();
    const after = new Date();
    expect(event.occurredAt).toBeInstanceOf(Date);
    expect(event.occurredAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(event.occurredAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('should expose all constructor properties', () => {
    const event = createEvent();
    expect(event.documentId).toBe('doc-001');
    expect(event.tenantId).toBe('tenant-123');
    expect(event.filename).toBe('contract.pdf');
    expect(event.contentHash).toBe('abc123def456');
    expect(event.classification).toBe(DocumentClassification.CONFIDENTIAL);
    expect(event.uploadedBy).toBe('user-789');
  });

  it('should handle all DocumentClassification values', () => {
    for (const classification of [
      DocumentClassification.PUBLIC,
      DocumentClassification.INTERNAL,
      DocumentClassification.CONFIDENTIAL,
      DocumentClassification.PRIVILEGED,
    ]) {
      const event = createEvent({ classification });
      expect(event.classification).toBe(classification);
      expect(event.toPayload().classification).toBe(classification);
    }
  });

  it('should serialize to payload with all fields', () => {
    const event = createEvent();
    const payload = event.toPayload();

    expect(payload).toEqual({
      documentId: 'doc-001',
      tenantId: 'tenant-123',
      filename: 'contract.pdf',
      contentHash: 'abc123def456',
      classification: DocumentClassification.CONFIDENTIAL,
      uploadedBy: 'user-789',
    });
  });

  it('should handle empty string values', () => {
    const event = createEvent({
      documentId: '',
      filename: '',
      contentHash: '',
    });
    expect(event.documentId).toBe('');
    expect(event.filename).toBe('');
    expect(event.contentHash).toBe('');
  });

  it('should handle filenames with special characters', () => {
    const event = createEvent({ filename: 'legal doc (final) v2.1 [draft].pdf' });
    expect(event.filename).toBe('legal doc (final) v2.1 [draft].pdf');
    expect(event.toPayload().filename).toBe('legal doc (final) v2.1 [draft].pdf');
  });
});

describe('DocumentIngestionFailedEvent', () => {
  it('should create event with correct eventType', () => {
    const event = new DocumentIngestionFailedEvent(
      'tenant-123',
      'malware.exe',
      'user-456',
      'Virus detected'
    );
    expect(event.eventType).toBe('document.ingestion_failed');
  });

  it('should have unique eventId', () => {
    const event1 = new DocumentIngestionFailedEvent('t', 'f', 'u', 'err');
    const event2 = new DocumentIngestionFailedEvent('t', 'f', 'u', 'err');
    expect(event1.eventId).not.toBe(event2.eventId);
  });

  it('should set occurredAt to a recent Date', () => {
    const before = new Date();
    const event = new DocumentIngestionFailedEvent('t', 'f', 'u', 'err');
    const after = new Date();
    expect(event.occurredAt).toBeInstanceOf(Date);
    expect(event.occurredAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(event.occurredAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('should expose all constructor properties', () => {
    const event = new DocumentIngestionFailedEvent(
      'tenant-123',
      'bad-file.docx',
      'user-789',
      'File too large'
    );
    expect(event.tenantId).toBe('tenant-123');
    expect(event.filename).toBe('bad-file.docx');
    expect(event.uploadedBy).toBe('user-789');
    expect(event.error).toBe('File too large');
    expect(event.threatName).toBeUndefined();
  });

  it('should handle optional threatName when provided', () => {
    const event = new DocumentIngestionFailedEvent(
      'tenant-123',
      'malware.exe',
      'user-456',
      'AV scan failed',
      'Trojan.Generic'
    );
    expect(event.threatName).toBe('Trojan.Generic');
  });

  it('should handle optional threatName when omitted', () => {
    const event = new DocumentIngestionFailedEvent(
      'tenant-123',
      'oversized.zip',
      'user-456',
      'File size exceeds limit'
    );
    expect(event.threatName).toBeUndefined();
  });

  it('should serialize to payload with all fields including threatName', () => {
    const event = new DocumentIngestionFailedEvent(
      'tenant-123',
      'infected.exe',
      'user-456',
      'Virus found',
      'Win32.Trojan'
    );
    const payload = event.toPayload();

    expect(payload).toEqual({
      tenantId: 'tenant-123',
      filename: 'infected.exe',
      uploadedBy: 'user-456',
      error: 'Virus found',
      threatName: 'Win32.Trojan',
    });
  });

  it('should serialize to payload with undefined threatName', () => {
    const event = new DocumentIngestionFailedEvent(
      'tenant-123',
      'bad.pdf',
      'user-456',
      'Validation failed'
    );
    const payload = event.toPayload();

    expect(payload).toEqual({
      tenantId: 'tenant-123',
      filename: 'bad.pdf',
      uploadedBy: 'user-456',
      error: 'Validation failed',
      threatName: undefined,
    });
  });

  it('should handle various error messages', () => {
    const errorMessages = [
      'Virus detected during AV scan',
      'File type not allowed',
      'Storage quota exceeded',
      'Invalid file format',
      '',
    ];

    for (const error of errorMessages) {
      const event = new DocumentIngestionFailedEvent('t', 'f', 'u', error);
      expect(event.error).toBe(error);
      expect(event.toPayload().error).toBe(error);
    }
  });
});

describe('DocumentIngestionEvents - Common DomainEvent behavior', () => {
  it('all event types should extend DomainEvent', () => {
    const events = [
      new DocumentIngestionCreatedEvent('d', 't', 'f', 'h', DocumentClassification.PUBLIC, 'u'),
      new DocumentIngestionFailedEvent('t', 'f', 'u', 'err'),
    ];

    for (const event of events) {
      expect(event.eventId).toBeDefined();
      expect(typeof event.eventId).toBe('string');
      expect(event.occurredAt).toBeInstanceOf(Date);
      expect(typeof event.toPayload()).toBe('object');
      expect(event.toPayload()).not.toBeNull();
    }
  });
});
