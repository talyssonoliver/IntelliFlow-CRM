/**
 * Events Validators Tests
 *
 * Tests the Zod validation schemas for domain event payloads and metadata.
 * Source: packages/validators/src/events.ts
 *
 * Coverage target: >90% for validator layer
 */

import { describe, it, expect } from 'vitest';

import {
  eventMetadataSchema,
  baseDomainEventSchema,
  outboxEventSchema,
  leadCreatedPayloadSchema,
  leadScoredPayloadSchema,
  leadQualifiedPayloadSchema,
  leadConvertedPayloadSchema,
  contactCreatedPayloadSchema,
  eventPayloadSchemas,
  validateEventMetadata,
  validateEventPayload,
  validateOutboxEvent,
  isRegisteredEventType,
} from '../events';

// ============================================================================
// Test Data Factories
// ============================================================================

const validMetadata = {
  correlationId: 'corr-123-abc',
  timestamp: '2025-12-27T10:00:00.000Z',
};

const fullMetadata = {
  ...validMetadata,
  causationId: 'cause-456',
  userId: 'user-789',
  tenantId: 'tenant-001',
  version: '2.0',
  idempotencyKey: 'idem-key-001',
};

const validBaseEvent = {
  eventType: 'lead.created',
  aggregateType: 'lead',
  aggregateId: 'lead-001',
  payload: { leadId: 'lead-001', email: 'test@example.com' },
  metadata: validMetadata,
  occurredAt: '2025-12-27T10:00:00.000Z',
};

describe('Events Validators', () => {
  // =========================================================================
  // eventMetadataSchema
  // =========================================================================
  describe('eventMetadataSchema', () => {
    it('should accept valid metadata with required fields', () => {
      const result = eventMetadataSchema.safeParse(validMetadata);
      expect(result.success).toBe(true);
    });

    it('should accept full metadata with all optional fields', () => {
      const result = eventMetadataSchema.safeParse(fullMetadata);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.causationId).toBe('cause-456');
        expect(result.data.userId).toBe('user-789');
        expect(result.data.tenantId).toBe('tenant-001');
        expect(result.data.version).toBe('2.0');
        expect(result.data.idempotencyKey).toBe('idem-key-001');
      }
    });

    it('should default version to "1.0"', () => {
      const result = eventMetadataSchema.safeParse(validMetadata);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.version).toBe('1.0');
      }
    });

    it('should reject empty correlationId', () => {
      const result = eventMetadataSchema.safeParse({
        ...validMetadata,
        correlationId: '',
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing correlationId', () => {
      const { correlationId: _, ...meta } = validMetadata;
      const result = eventMetadataSchema.safeParse(meta);
      expect(result.success).toBe(false);
    });

    it('should reject invalid timestamp (non ISO 8601)', () => {
      const result = eventMetadataSchema.safeParse({
        ...validMetadata,
        timestamp: 'not-a-date',
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing timestamp', () => {
      const { timestamp: _, ...meta } = validMetadata;
      const result = eventMetadataSchema.safeParse(meta);
      expect(result.success).toBe(false);
    });

    it('should reject timestamp with non-Z timezone offset', () => {
      // Zod datetime() only accepts UTC "Z" suffix by default
      const result = eventMetadataSchema.safeParse({
        ...validMetadata,
        timestamp: '2025-12-27T10:00:00+05:30',
      });
      expect(result.success).toBe(false);
    });
  });

  // =========================================================================
  // baseDomainEventSchema
  // =========================================================================
  describe('baseDomainEventSchema', () => {
    it('should accept valid base event', () => {
      const result = baseDomainEventSchema.safeParse(validBaseEvent);
      expect(result.success).toBe(true);
    });

    it('should default status to PENDING', () => {
      const result = baseDomainEventSchema.safeParse(validBaseEvent);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('PENDING');
      }
    });

    it('should accept all valid status values', () => {
      const statuses = ['PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'DEAD_LETTER'];
      statuses.forEach((status) => {
        const result = baseDomainEventSchema.safeParse({ ...validBaseEvent, status });
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid status', () => {
      const result = baseDomainEventSchema.safeParse({
        ...validBaseEvent,
        status: 'UNKNOWN',
      });
      expect(result.success).toBe(false);
    });

    it('should accept optional id as cuid2', () => {
      // id is optional, so omitting it is fine
      const result = baseDomainEventSchema.safeParse(validBaseEvent);
      expect(result.success).toBe(true);
    });

    it('should reject eventType without aggregate.action pattern', () => {
      const result = baseDomainEventSchema.safeParse({
        ...validBaseEvent,
        eventType: 'InvalidFormat',
      });
      expect(result.success).toBe(false);
    });

    it('should reject eventType with uppercase letters', () => {
      const result = baseDomainEventSchema.safeParse({
        ...validBaseEvent,
        eventType: 'Lead.Created',
      });
      expect(result.success).toBe(false);
    });

    it('should accept eventType with underscores in action', () => {
      const result = baseDomainEventSchema.safeParse({
        ...validBaseEvent,
        eventType: 'lead.status_changed',
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty eventType', () => {
      const result = baseDomainEventSchema.safeParse({
        ...validBaseEvent,
        eventType: '',
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty aggregateType', () => {
      const result = baseDomainEventSchema.safeParse({
        ...validBaseEvent,
        aggregateType: '',
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty aggregateId', () => {
      const result = baseDomainEventSchema.safeParse({
        ...validBaseEvent,
        aggregateId: '',
      });
      expect(result.success).toBe(false);
    });

    it('should accept payload as record of unknown values', () => {
      const result = baseDomainEventSchema.safeParse({
        ...validBaseEvent,
        payload: { nested: { deep: true }, count: 42, tags: ['a', 'b'] },
      });
      expect(result.success).toBe(true);
    });

    it('should coerce occurredAt from string to Date', () => {
      const result = baseDomainEventSchema.safeParse(validBaseEvent);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.occurredAt).toBeInstanceOf(Date);
      }
    });

    it('should reject missing required fields', () => {
      const result = baseDomainEventSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  // =========================================================================
  // outboxEventSchema
  // =========================================================================
  describe('outboxEventSchema', () => {
    const validOutboxEvent = {
      ...validBaseEvent,
      createdAt: '2025-12-27T10:00:00.000Z',
    };

    it('should accept valid outbox event with defaults', () => {
      const result = outboxEventSchema.safeParse(validOutboxEvent);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.retryCount).toBe(0);
      }
    });

    it('should default retryCount to 0', () => {
      const result = outboxEventSchema.safeParse(validOutboxEvent);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.retryCount).toBe(0);
      }
    });

    it('should accept outbox event with all optional fields', () => {
      const result = outboxEventSchema.safeParse({
        ...validOutboxEvent,
        retryCount: 3,
        nextRetryAt: '2025-12-27T11:00:00.000Z',
        lastError: 'Connection timeout',
        publishedAt: '2025-12-27T10:05:00.000Z',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.retryCount).toBe(3);
        expect(result.data.lastError).toBe('Connection timeout');
        expect(result.data.publishedAt).toBeInstanceOf(Date);
        expect(result.data.nextRetryAt).toBeInstanceOf(Date);
      }
    });

    it('should reject negative retryCount', () => {
      const result = outboxEventSchema.safeParse({
        ...validOutboxEvent,
        retryCount: -1,
      });
      expect(result.success).toBe(false);
    });

    it('should require createdAt', () => {
      const result = outboxEventSchema.safeParse(validBaseEvent);
      // createdAt is required, missing it should fail
      expect(result.success).toBe(false);
    });

    it('should coerce createdAt from string to Date', () => {
      const result = outboxEventSchema.safeParse(validOutboxEvent);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.createdAt).toBeInstanceOf(Date);
      }
    });
  });

  // =========================================================================
  // Lead Event Payloads
  // =========================================================================
  describe('leadCreatedPayloadSchema', () => {
    it('should accept valid lead created payload', () => {
      const result = leadCreatedPayloadSchema.safeParse({
        leadId: 'lead-001',
        email: 'lead@example.com',
        tenantId: 'tenant-001',
      });
      expect(result.success).toBe(true);
    });

    it('should accept optional source and createdAt', () => {
      const result = leadCreatedPayloadSchema.safeParse({
        leadId: 'lead-001',
        email: 'lead@example.com',
        tenantId: 'tenant-001',
        source: 'website',
        createdAt: '2025-12-27T10:00:00.000Z',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid email', () => {
      const result = leadCreatedPayloadSchema.safeParse({
        leadId: 'lead-001',
        email: 'not-an-email',
        tenantId: 'tenant-001',
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty leadId', () => {
      const result = leadCreatedPayloadSchema.safeParse({
        leadId: '',
        email: 'lead@example.com',
        tenantId: 'tenant-001',
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty tenantId', () => {
      const result = leadCreatedPayloadSchema.safeParse({
        leadId: 'lead-001',
        email: 'lead@example.com',
        tenantId: '',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('leadScoredPayloadSchema', () => {
    it('should accept valid lead scored payload', () => {
      const result = leadScoredPayloadSchema.safeParse({
        leadId: 'lead-001',
        score: 85,
      });
      expect(result.success).toBe(true);
    });

    it('should accept score at boundary 0', () => {
      const result = leadScoredPayloadSchema.safeParse({
        leadId: 'lead-001',
        score: 0,
      });
      expect(result.success).toBe(true);
    });

    it('should accept score at boundary 100', () => {
      const result = leadScoredPayloadSchema.safeParse({
        leadId: 'lead-001',
        score: 100,
      });
      expect(result.success).toBe(true);
    });

    it('should reject score above 100', () => {
      const result = leadScoredPayloadSchema.safeParse({
        leadId: 'lead-001',
        score: 101,
      });
      expect(result.success).toBe(false);
    });

    it('should reject negative score', () => {
      const result = leadScoredPayloadSchema.safeParse({
        leadId: 'lead-001',
        score: -1,
      });
      expect(result.success).toBe(false);
    });

    it('should accept optional confidence between 0 and 1', () => {
      const result = leadScoredPayloadSchema.safeParse({
        leadId: 'lead-001',
        score: 75,
        confidence: 0.95,
      });
      expect(result.success).toBe(true);
    });

    it('should reject confidence above 1', () => {
      const result = leadScoredPayloadSchema.safeParse({
        leadId: 'lead-001',
        score: 75,
        confidence: 1.5,
      });
      expect(result.success).toBe(false);
    });

    it('should reject confidence below 0', () => {
      const result = leadScoredPayloadSchema.safeParse({
        leadId: 'lead-001',
        score: 75,
        confidence: -0.1,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('leadQualifiedPayloadSchema', () => {
    it('should accept valid lead qualified payload', () => {
      const result = leadQualifiedPayloadSchema.safeParse({
        leadId: 'lead-001',
      });
      expect(result.success).toBe(true);
    });

    it('should accept all optional fields', () => {
      const result = leadQualifiedPayloadSchema.safeParse({
        leadId: 'lead-001',
        qualifiedBy: 'user-001',
        qualifiedAt: '2025-12-27T10:00:00.000Z',
        previousStatus: 'NEW',
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty leadId', () => {
      const result = leadQualifiedPayloadSchema.safeParse({
        leadId: '',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('leadConvertedPayloadSchema', () => {
    it('should accept valid lead converted payload', () => {
      const result = leadConvertedPayloadSchema.safeParse({
        leadId: 'lead-001',
      });
      expect(result.success).toBe(true);
    });

    it('should accept all optional fields', () => {
      const result = leadConvertedPayloadSchema.safeParse({
        leadId: 'lead-001',
        contactId: 'contact-001',
        opportunityId: 'opp-001',
        convertedBy: 'user-001',
        convertedAt: '2025-12-27T10:00:00.000Z',
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty leadId', () => {
      const result = leadConvertedPayloadSchema.safeParse({
        leadId: '',
      });
      expect(result.success).toBe(false);
    });
  });

  // =========================================================================
  // Contact Event Payload
  // =========================================================================
  describe('contactCreatedPayloadSchema', () => {
    it('should accept valid contact created payload', () => {
      const result = contactCreatedPayloadSchema.safeParse({
        contactId: 'contact-001',
        email: 'contact@example.com',
        tenantId: 'tenant-001',
      });
      expect(result.success).toBe(true);
    });

    it('should accept optional firstName and lastName', () => {
      const result = contactCreatedPayloadSchema.safeParse({
        contactId: 'contact-001',
        email: 'contact@example.com',
        tenantId: 'tenant-001',
        firstName: 'John',
        lastName: 'Doe',
        createdAt: '2025-12-27T10:00:00.000Z',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid email', () => {
      const result = contactCreatedPayloadSchema.safeParse({
        contactId: 'contact-001',
        email: 'invalid',
        tenantId: 'tenant-001',
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty contactId', () => {
      const result = contactCreatedPayloadSchema.safeParse({
        contactId: '',
        email: 'contact@example.com',
        tenantId: 'tenant-001',
      });
      expect(result.success).toBe(false);
    });
  });

  // =========================================================================
  // eventPayloadSchemas registry
  // =========================================================================
  describe('eventPayloadSchemas', () => {
    it('should contain all registered event types', () => {
      expect(eventPayloadSchemas).toHaveProperty('lead.created');
      expect(eventPayloadSchemas).toHaveProperty('lead.scored');
      expect(eventPayloadSchemas).toHaveProperty('lead.qualified');
      expect(eventPayloadSchemas).toHaveProperty('lead.converted');
      expect(eventPayloadSchemas).toHaveProperty('contact.created');
    });

    it('should have exactly 5 registered event types', () => {
      expect(Object.keys(eventPayloadSchemas)).toHaveLength(5);
    });
  });

  // =========================================================================
  // Validation Functions
  // =========================================================================
  describe('validateEventMetadata', () => {
    it('should return success for valid metadata', () => {
      const result = validateEventMetadata(validMetadata);
      expect(result.success).toBe(true);
    });

    it('should return failure for invalid metadata', () => {
      const result = validateEventMetadata({ correlationId: '' });
      expect(result.success).toBe(false);
    });

    it('should return failure for null', () => {
      const result = validateEventMetadata(null);
      expect(result.success).toBe(false);
    });
  });

  describe('validateEventPayload', () => {
    it('should validate registered event type payload', () => {
      const result = validateEventPayload('lead.created', {
        leadId: 'lead-001',
        email: 'test@example.com',
        tenantId: 'tenant-001',
      });
      expect(result.success).toBe(true);
    });

    it('should fail for invalid registered event type payload', () => {
      const result = validateEventPayload('lead.created', {
        leadId: '',
        email: 'not-an-email',
      });
      expect(result.success).toBe(false);
    });

    it('should validate unknown event type as generic record', () => {
      const result = validateEventPayload('custom.event', {
        someKey: 'someValue',
      });
      expect(result.success).toBe(true);
    });

    it('should fail for non-object payload with unknown event type', () => {
      const result = validateEventPayload('custom.event', 'not-an-object');
      expect(result.success).toBe(false);
    });
  });

  describe('validateOutboxEvent', () => {
    it('should return success for valid outbox event', () => {
      const result = validateOutboxEvent({
        ...validBaseEvent,
        createdAt: '2025-12-27T10:00:00.000Z',
      });
      expect(result.success).toBe(true);
    });

    it('should return failure for invalid outbox event', () => {
      const result = validateOutboxEvent({});
      expect(result.success).toBe(false);
    });
  });

  describe('isRegisteredEventType', () => {
    it('should return true for registered event types', () => {
      expect(isRegisteredEventType('lead.created')).toBe(true);
      expect(isRegisteredEventType('lead.scored')).toBe(true);
      expect(isRegisteredEventType('lead.qualified')).toBe(true);
      expect(isRegisteredEventType('lead.converted')).toBe(true);
      expect(isRegisteredEventType('contact.created')).toBe(true);
    });

    it('should return false for unregistered event types', () => {
      expect(isRegisteredEventType('custom.event')).toBe(false);
      expect(isRegisteredEventType('deal.created')).toBe(false);
      expect(isRegisteredEventType('')).toBe(false);
    });
  });
});
