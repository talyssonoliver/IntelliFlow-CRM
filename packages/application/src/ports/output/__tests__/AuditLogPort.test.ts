/**
 * AuditLogPort Contract Tests
 *
 * Tests for the AuditLogPort interface contract used for AI security audit logging.
 *
 * IMPLEMENTS: IFC-125 (AI Guardrails Audit Logger Integration)
 */

import { describe, it, expect, vi } from 'vitest';
import type {
  AuditLogPort,
  AISecurityEventInput,
  AISecurityMetadata,
  AuditLogResult,
  TenantContext,
  BatchAuditResult,
  IntegrityVerification,
} from '../AuditLogPort';

describe('AuditLogPort contract', () => {
  // Mock implementation for contract testing
  const createMockAuditLogPort = (): AuditLogPort => ({
    logSecurityEvent: vi.fn(),
    logBatchEvents: vi.fn(),
    verifyLogIntegrity: vi.fn(),
  });

  const createValidEvent = (): AISecurityEventInput => ({
    eventType: 'AI_GUARDRAIL_TRIGGERED',
    severity: 'HIGH',
    tenantId: 'tenant-123',
    userId: 'user-456',
    resourceType: 'AI_GUARDRAIL',
    resourceId: 'guardrail-789',
    description: 'Guardrail triggered during lead scoring',
    metadata: {
      modelId: 'gpt-4o',
      modelVersion: '2024-01',
      guardrailId: 'prompt-injection-detector',
      guardrailVersion: '1.0.0',
      processingPurpose: 'AI_GUARDRAIL_ENFORCEMENT',
      legalBasis: 'LEGITIMATE_INTEREST',
    },
  });

  const createValidTenantContext = (): TenantContext => ({
    tenantId: 'tenant-123',
    userId: 'user-456',
    sessionId: 'session-789',
    jurisdiction: 'EU',
  });

  describe('AISecurityEventInput interface', () => {
    it('requires eventType field', () => {
      const event = createValidEvent();
      expect(event.eventType).toBeDefined();
      expect(typeof event.eventType).toBe('string');
    });

    it('requires severity field with valid values', () => {
      const validSeverities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
      for (const severity of validSeverities) {
        const event = { ...createValidEvent(), severity };
        expect(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).toContain(event.severity);
      }
    });

    it('requires tenantId field', () => {
      const event = createValidEvent();
      expect(event.tenantId).toBeDefined();
      expect(typeof event.tenantId).toBe('string');
    });

    it('requires description field', () => {
      const event = createValidEvent();
      expect(event.description).toBeDefined();
      expect(typeof event.description).toBe('string');
    });

    it('requires metadata field', () => {
      const event = createValidEvent();
      expect(event.metadata).toBeDefined();
      expect(typeof event.metadata).toBe('object');
    });

    it('allows optional userId field', () => {
      const event = createValidEvent();
      expect(event.userId).toBeDefined();

      const eventWithoutUser = { ...createValidEvent(), userId: undefined };
      expect(eventWithoutUser.userId).toBeUndefined();
    });

    it('allows optional resourceType and resourceId fields', () => {
      const event = createValidEvent();
      expect(event.resourceType).toBeDefined();
      expect(event.resourceId).toBeDefined();

      const eventWithoutResource = {
        ...createValidEvent(),
        resourceType: undefined,
        resourceId: undefined,
      };
      expect(eventWithoutResource.resourceType).toBeUndefined();
    });
  });

  describe('AISecurityMetadata interface', () => {
    it('requires modelId for ISO 42001 traceability', () => {
      const event = createValidEvent();
      expect(event.metadata.modelId).toBeDefined();
      expect(typeof event.metadata.modelId).toBe('string');
    });

    it('requires modelVersion for ISO 42001 traceability', () => {
      const event = createValidEvent();
      expect(event.metadata.modelVersion).toBeDefined();
      expect(typeof event.metadata.modelVersion).toBe('string');
    });

    it('requires guardrailId', () => {
      const event = createValidEvent();
      expect(event.metadata.guardrailId).toBeDefined();
      expect(typeof event.metadata.guardrailId).toBe('string');
    });

    it('requires guardrailVersion', () => {
      const event = createValidEvent();
      expect(event.metadata.guardrailVersion).toBeDefined();
      expect(typeof event.metadata.guardrailVersion).toBe('string');
    });

    it('requires processingPurpose for GDPR compliance', () => {
      const event = createValidEvent();
      expect(event.metadata.processingPurpose).toBeDefined();
      expect(typeof event.metadata.processingPurpose).toBe('string');
    });

    it('requires legalBasis for GDPR compliance', () => {
      const event = createValidEvent();
      expect(event.metadata.legalBasis).toBeDefined();
      expect(typeof event.metadata.legalBasis).toBe('string');
    });

    it('allows optional chainId', () => {
      const metadata: AISecurityMetadata = {
        ...createValidEvent().metadata,
        chainId: 'chain-123',
      };
      expect(metadata.chainId).toBe('chain-123');
    });

    it('allows optional inputHash and outputHash', () => {
      const metadata: AISecurityMetadata = {
        ...createValidEvent().metadata,
        inputHash: 'sha256:abc123',
        outputHash: 'sha256:def456',
      };
      expect(metadata.inputHash).toBe('sha256:abc123');
      expect(metadata.outputHash).toBe('sha256:def456');
    });

    it('allows optional detectionConfidence and riskScore', () => {
      const metadata: AISecurityMetadata = {
        ...createValidEvent().metadata,
        detectionConfidence: 0.95,
        riskScore: 0.8,
      };
      expect(metadata.detectionConfidence).toBe(0.95);
      expect(metadata.riskScore).toBe(0.8);
    });

    it('allows optional dataSubjectId for DSAR queries', () => {
      const metadata: AISecurityMetadata = {
        ...createValidEvent().metadata,
        dataSubjectId: 'subject-123',
      };
      expect(metadata.dataSubjectId).toBe('subject-123');
    });
  });

  describe('TenantContext interface', () => {
    it('requires tenantId', () => {
      const context = createValidTenantContext();
      expect(context.tenantId).toBeDefined();
      expect(typeof context.tenantId).toBe('string');
    });

    it('allows optional userId', () => {
      const context = createValidTenantContext();
      expect(context.userId).toBeDefined();

      const contextWithoutUser = { ...context, userId: undefined };
      expect(contextWithoutUser.userId).toBeUndefined();
    });

    it('allows optional sessionId', () => {
      const context = createValidTenantContext();
      expect(context.sessionId).toBeDefined();

      const contextWithoutSession = { ...context, sessionId: undefined };
      expect(contextWithoutSession.sessionId).toBeUndefined();
    });

    it('supports EU/UK/US/GLOBAL jurisdictions', () => {
      const validJurisdictions = ['EU', 'UK', 'US', 'GLOBAL'] as const;
      for (const jurisdiction of validJurisdictions) {
        const context: TenantContext = { ...createValidTenantContext(), jurisdiction };
        expect(['EU', 'UK', 'US', 'GLOBAL']).toContain(context.jurisdiction);
      }
    });
  });

  describe('AuditLogResult interface', () => {
    it('has eventId field', () => {
      const result: AuditLogResult = {
        eventId: 'event-123',
        persistedAt: new Date(),
        status: 'PERSISTED',
        integrityHash: 'hash-abc',
      };
      expect(result.eventId).toBe('event-123');
    });

    it('has persistedAt timestamp', () => {
      const result: AuditLogResult = {
        eventId: 'event-123',
        persistedAt: new Date(),
        status: 'PERSISTED',
      };
      expect(result.persistedAt).toBeInstanceOf(Date);
    });

    it('has status field with valid values', () => {
      const validStatuses = ['PERSISTED', 'PERSISTED_PENDING_PROCESSING', 'FAILED'] as const;
      for (const status of validStatuses) {
        const result: AuditLogResult = {
          eventId: 'event-123',
          persistedAt: new Date(),
          status,
        };
        expect(['PERSISTED', 'PERSISTED_PENDING_PROCESSING', 'FAILED']).toContain(result.status);
      }
    });

    it('allows optional integrityHash', () => {
      const result: AuditLogResult = {
        eventId: 'event-123',
        persistedAt: new Date(),
        status: 'PERSISTED',
        integrityHash: 'hmac-sha256:abc123def456',
      };
      expect(result.integrityHash).toBe('hmac-sha256:abc123def456');
    });
  });

  describe('IntegrityVerification interface', () => {
    it('has valid field', () => {
      const verification: IntegrityVerification = {
        valid: true,
        computedHash: 'hash-123',
        storedHash: 'hash-123',
        signatureValid: true,
        verifiedAt: new Date(),
      };
      expect(verification.valid).toBe(true);
    });

    it('has reason field when invalid', () => {
      const verification: IntegrityVerification = {
        valid: false,
        reason: 'HASH_MISMATCH',
        computedHash: 'hash-123',
        storedHash: 'hash-456',
        signatureValid: false,
        verifiedAt: new Date(),
      };
      expect(verification.reason).toBe('HASH_MISMATCH');
    });
  });

  describe('AuditLogPort methods', () => {
    it('logSecurityEvent requires AISecurityEventInput and TenantContext', async () => {
      const port = createMockAuditLogPort();
      const event = createValidEvent();
      const context = createValidTenantContext();

      const mockResult: AuditLogResult = {
        eventId: 'event-123',
        persistedAt: new Date(),
        status: 'PERSISTED',
        integrityHash: 'hash-abc',
      };

      vi.mocked(port.logSecurityEvent).mockResolvedValue(mockResult);

      const result = await port.logSecurityEvent(event, context);

      expect(port.logSecurityEvent).toHaveBeenCalledWith(event, context);
      expect(result.eventId).toBe('event-123');
    });

    it('logSecurityEvent returns AuditLogResult with eventId', async () => {
      const port = createMockAuditLogPort();

      const mockResult: AuditLogResult = {
        eventId: 'generated-uuid-123',
        persistedAt: new Date(),
        status: 'PERSISTED',
        integrityHash: 'hmac-sha256:computed-hash',
      };

      vi.mocked(port.logSecurityEvent).mockResolvedValue(mockResult);

      const result = await port.logSecurityEvent(createValidEvent(), createValidTenantContext());

      expect(result.eventId).toBeDefined();
      expect(typeof result.eventId).toBe('string');
      expect(result.eventId.length).toBeGreaterThan(0);
    });

    it('logBatchEvents handles multiple events transactionally', async () => {
      const port = createMockAuditLogPort();
      const events = [createValidEvent(), createValidEvent(), createValidEvent()];
      const context = createValidTenantContext();

      const mockResult: BatchAuditResult = {
        totalEvents: 3,
        successCount: 3,
        failureCount: 0,
        results: events.map((_, i) => ({
          eventId: `event-${i}`,
          persistedAt: new Date(),
          status: 'PERSISTED' as const,
        })),
      };

      vi.mocked(port.logBatchEvents).mockResolvedValue(mockResult);

      const result = await port.logBatchEvents(events, context);

      expect(port.logBatchEvents).toHaveBeenCalledWith(events, context);
      expect(result.totalEvents).toBe(3);
      expect(result.successCount).toBe(3);
      expect(result.results).toHaveLength(3);
    });

    it('verifyLogIntegrity returns IntegrityVerification', async () => {
      const port = createMockAuditLogPort();
      const eventId = 'event-123';

      const mockVerification: IntegrityVerification = {
        valid: true,
        computedHash: 'hash-abc',
        storedHash: 'hash-abc',
        signatureValid: true,
        verifiedAt: new Date(),
      };

      vi.mocked(port.verifyLogIntegrity).mockResolvedValue(mockVerification);

      const result = await port.verifyLogIntegrity(eventId);

      expect(port.verifyLogIntegrity).toHaveBeenCalledWith(eventId);
      expect(result.valid).toBe(true);
      expect(result.verifiedAt).toBeInstanceOf(Date);
    });
  });
});
