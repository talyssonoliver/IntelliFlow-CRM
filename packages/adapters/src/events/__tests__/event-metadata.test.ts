/**
 * Event Metadata Tests
 *
 * Tests for event metadata utility functions including
 * buildEventMetadata, generateIdempotencyKey, extractAggregateType,
 * extractAggregateId, isValidMetadata, and defaultContextAccessors.
 *
 * Coverage target: >90% for adapters layer
 */

import { describe, it, expect } from 'vitest';
import {
  buildEventMetadata,
  generateIdempotencyKey,
  extractAggregateType,
  extractAggregateId,
  isValidMetadata,
  defaultContextAccessors,
  type ContextAccessors,
  type EventMetadata,
} from '../event-metadata';

describe('defaultContextAccessors', () => {
  it('should return undefined for getCorrelationId', () => {
    expect(defaultContextAccessors.getCorrelationId()).toBeUndefined();
  });

  it('should return undefined for getCausationId', () => {
    expect(defaultContextAccessors.getCausationId()).toBeUndefined();
  });

  it('should return undefined for getUserId', () => {
    expect(defaultContextAccessors.getUserId()).toBeUndefined();
  });

  it('should return undefined for getTenantId', () => {
    expect(defaultContextAccessors.getTenantId()).toBeUndefined();
  });
});

describe('buildEventMetadata', () => {
  it('should use context correlationId when available', () => {
    const context: ContextAccessors = {
      getCorrelationId: () => 'ctx-corr-123',
      getCausationId: () => undefined,
      getUserId: () => undefined,
      getTenantId: () => undefined,
    };

    const metadata = buildEventMetadata(context, 'fallback-id');
    expect(metadata.correlationId).toBe('ctx-corr-123');
  });

  it('should use fallback correlationId when context returns undefined', () => {
    const metadata = buildEventMetadata(defaultContextAccessors, 'fallback-corr-456');
    expect(metadata.correlationId).toBe('fallback-corr-456');
  });

  it('should set causationId from context', () => {
    const context: ContextAccessors = {
      getCorrelationId: () => 'corr',
      getCausationId: () => 'cause-789',
      getUserId: () => undefined,
      getTenantId: () => undefined,
    };

    const metadata = buildEventMetadata(context, 'fb');
    expect(metadata.causationId).toBe('cause-789');
  });

  it('should set causationId to undefined when context returns undefined', () => {
    const metadata = buildEventMetadata(defaultContextAccessors, 'fb');
    expect(metadata.causationId).toBeUndefined();
  });

  it('should set userId from context', () => {
    const context: ContextAccessors = {
      getCorrelationId: () => undefined,
      getCausationId: () => undefined,
      getUserId: () => 'user-abc',
      getTenantId: () => undefined,
    };

    const metadata = buildEventMetadata(context, 'fb');
    expect(metadata.userId).toBe('user-abc');
  });

  it('should set tenantId from context', () => {
    const context: ContextAccessors = {
      getCorrelationId: () => undefined,
      getCausationId: () => undefined,
      getUserId: () => undefined,
      getTenantId: () => 'tenant-xyz',
    };

    const metadata = buildEventMetadata(context, 'fb');
    expect(metadata.tenantId).toBe('tenant-xyz');
  });

  it('should set timestamp as ISO string', () => {
    const before = new Date();
    const metadata = buildEventMetadata(defaultContextAccessors, 'fb');
    const after = new Date();

    expect(typeof metadata.timestamp).toBe('string');
    const ts = new Date(metadata.timestamp);
    expect(ts.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(ts.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('should default version to 1.0', () => {
    const metadata = buildEventMetadata(defaultContextAccessors, 'fb');
    expect(metadata.version).toBe('1.0');
  });

  it('should accept custom version', () => {
    const metadata = buildEventMetadata(defaultContextAccessors, 'fb', undefined, '2.0');
    expect(metadata.version).toBe('2.0');
  });

  it('should set idempotencyKey when provided', () => {
    const metadata = buildEventMetadata(defaultContextAccessors, 'fb', 'idem-key-123');
    expect(metadata.idempotencyKey).toBe('idem-key-123');
  });

  it('should leave idempotencyKey undefined when not provided', () => {
    const metadata = buildEventMetadata(defaultContextAccessors, 'fb');
    expect(metadata.idempotencyKey).toBeUndefined();
  });

  it('should include all fields from a fully populated context', () => {
    const context: ContextAccessors = {
      getCorrelationId: () => 'corr-1',
      getCausationId: () => 'cause-2',
      getUserId: () => 'user-3',
      getTenantId: () => 'tenant-4',
    };

    const metadata = buildEventMetadata(context, 'fb', 'idem-5', '3.0');
    expect(metadata.correlationId).toBe('corr-1');
    expect(metadata.causationId).toBe('cause-2');
    expect(metadata.userId).toBe('user-3');
    expect(metadata.tenantId).toBe('tenant-4');
    expect(metadata.idempotencyKey).toBe('idem-5');
    expect(metadata.version).toBe('3.0');
    expect(typeof metadata.timestamp).toBe('string');
  });
});

describe('generateIdempotencyKey', () => {
  it('should format as eventType:aggregateId:eventId', () => {
    const key = generateIdempotencyKey('lead.created', 'lead-123', 'evt-456');
    expect(key).toBe('lead.created:lead-123:evt-456');
  });

  it('should handle various event types', () => {
    expect(generateIdempotencyKey('contact.updated', 'c1', 'e1')).toBe('contact.updated:c1:e1');
    expect(generateIdempotencyKey('deal.closed', 'd1', 'e2')).toBe('deal.closed:d1:e2');
    expect(generateIdempotencyKey('ai.score_feedback.submitted', 'f1', 'e3')).toBe(
      'ai.score_feedback.submitted:f1:e3'
    );
  });

  it('should handle empty strings', () => {
    const key = generateIdempotencyKey('', '', '');
    expect(key).toBe('::');
  });

  it('should handle strings with colons (no escaping)', () => {
    const key = generateIdempotencyKey('type:sub', 'id:123', 'evt:456');
    expect(key).toBe('type:sub:id:123:evt:456');
  });
});

describe('extractAggregateType', () => {
  it('should extract and capitalize from simple event type', () => {
    expect(extractAggregateType('lead.created')).toBe('Lead');
  });

  it('should extract from multi-part event type', () => {
    expect(extractAggregateType('contact.status_changed')).toBe('Contact');
  });

  it('should handle single word event type (no dot)', () => {
    expect(extractAggregateType('lead')).toBe('Lead');
  });

  it('should handle deeply nested event types', () => {
    expect(extractAggregateType('ai.score_feedback.submitted')).toBe('Ai');
  });

  it('should capitalize first letter correctly', () => {
    expect(extractAggregateType('document.created')).toBe('Document');
    expect(extractAggregateType('case.closed')).toBe('Case');
  });

  it('should handle already capitalized type', () => {
    expect(extractAggregateType('Lead.created')).toBe('Lead');
  });

  it('should return Unknown for empty string', () => {
    expect(extractAggregateType('')).toBe('Unknown');
  });

  it('should handle single character types', () => {
    expect(extractAggregateType('a.created')).toBe('A');
  });

  it('should handle string starting with dot', () => {
    // '.created' splits into ['', 'created'] - first element is empty
    expect(extractAggregateType('.created')).toBe('Unknown');
  });
});

describe('extractAggregateId', () => {
  it('should find aggregate-specific ID field (e.g., leadId)', () => {
    const payload = { leadId: 'lead-123', name: 'Test' };
    expect(extractAggregateId(payload, 'Lead', 'fallback')).toBe('lead-123');
  });

  it('should match lowercase aggregateType to field name', () => {
    const payload = { contactId: 'contact-456' };
    expect(extractAggregateId(payload, 'Contact', 'fallback')).toBe('contact-456');
  });

  it('should fall back to id field', () => {
    const payload = { id: 'generic-789', name: 'Test' };
    expect(extractAggregateId(payload, 'Lead', 'fallback')).toBe('generic-789');
  });

  it('should fall back to aggregateId field', () => {
    const payload = { aggregateId: 'agg-012', name: 'Test' };
    expect(extractAggregateId(payload, 'Lead', 'fallback')).toBe('agg-012');
  });

  it('should use fallbackId when no matching field found', () => {
    const payload = { name: 'Test', status: 'active' };
    expect(extractAggregateId(payload, 'Lead', 'fallback-999')).toBe('fallback-999');
  });

  it('should prefer aggregate-specific ID over generic id', () => {
    const payload = { leadId: 'specific-123', id: 'generic-456' };
    expect(extractAggregateId(payload, 'Lead', 'fallback')).toBe('specific-123');
  });

  it('should prefer id over aggregateId', () => {
    const payload = { id: 'id-123', aggregateId: 'agg-456' };
    expect(extractAggregateId(payload, 'Unknown', 'fallback')).toBe('id-123');
  });

  it('should convert non-string values to string', () => {
    const payload = { leadId: 42 };
    expect(extractAggregateId(payload, 'Lead', 'fallback')).toBe('42');
  });

  it('should handle undefined value for aggregate ID field', () => {
    // leadId is explicitly undefined - but !== undefined is false for undefined
    // Actually, if the key exists but value is undefined, `payload[field] !== undefined` is false
    const payload: Record<string, unknown> = { leadId: undefined, id: 'id-1' };
    expect(extractAggregateId(payload, 'Lead', 'fallback')).toBe('id-1');
  });

  it('should handle null value (converts to string "null")', () => {
    const payload: Record<string, unknown> = { leadId: null };
    // null !== undefined is true, so String(null) = "null"
    expect(extractAggregateId(payload, 'Lead', 'fallback')).toBe('null');
  });

  it('should handle empty payload', () => {
    expect(extractAggregateId({}, 'Lead', 'fallback-empty')).toBe('fallback-empty');
  });
});

describe('isValidMetadata', () => {
  it('should return true for valid metadata', () => {
    const metadata: EventMetadata = {
      correlationId: 'corr-123',
      timestamp: new Date().toISOString(),
      version: '1.0',
    };
    expect(isValidMetadata(metadata)).toBe(true);
  });

  it('should return true for fully populated metadata', () => {
    const metadata: EventMetadata = {
      correlationId: 'corr-123',
      causationId: 'cause-456',
      userId: 'user-789',
      tenantId: 'tenant-012',
      timestamp: new Date().toISOString(),
      version: '2.0',
      idempotencyKey: 'idem-345',
    };
    expect(isValidMetadata(metadata)).toBe(true);
  });

  it('should return false when correlationId is missing', () => {
    const metadata: Partial<EventMetadata> = {
      timestamp: new Date().toISOString(),
      version: '1.0',
    };
    expect(isValidMetadata(metadata)).toBe(false);
  });

  it('should return false when correlationId is empty string', () => {
    const metadata: Partial<EventMetadata> = {
      correlationId: '',
      timestamp: new Date().toISOString(),
      version: '1.0',
    };
    expect(isValidMetadata(metadata)).toBe(false);
  });

  it('should return false when timestamp is missing', () => {
    const metadata: Partial<EventMetadata> = {
      correlationId: 'corr-123',
      version: '1.0',
    };
    expect(isValidMetadata(metadata)).toBe(false);
  });

  it('should return false when version is missing', () => {
    const metadata: Partial<EventMetadata> = {
      correlationId: 'corr-123',
      timestamp: new Date().toISOString(),
    };
    expect(isValidMetadata(metadata)).toBe(false);
  });

  it('should return false for empty object', () => {
    expect(isValidMetadata({})).toBe(false);
  });

  it('should return false when correlationId is not a string', () => {
    const metadata = {
      correlationId: 123 as any,
      timestamp: new Date().toISOString(),
      version: '1.0',
    };
    expect(isValidMetadata(metadata)).toBe(false);
  });

  it('should return false when timestamp is not a string', () => {
    const metadata = {
      correlationId: 'corr',
      timestamp: 12345 as any,
      version: '1.0',
    };
    expect(isValidMetadata(metadata)).toBe(false);
  });

  it('should return false when version is not a string', () => {
    const metadata = {
      correlationId: 'corr',
      timestamp: new Date().toISOString(),
      version: 1.0 as any,
    };
    expect(isValidMetadata(metadata)).toBe(false);
  });

  it('should accept non-ISO timestamp strings (no format validation)', () => {
    const metadata: Partial<EventMetadata> = {
      correlationId: 'corr',
      timestamp: 'not-a-date',
      version: '1.0',
    };
    // isValidMetadata only checks typeof string, not format
    expect(isValidMetadata(metadata)).toBe(true);
  });
});
