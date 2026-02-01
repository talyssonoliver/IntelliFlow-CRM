/**
 * AISecurityEventTypes Tests
 *
 * Tests for AI-specific security event types used in guardrails audit logging.
 *
 * IMPLEMENTS: IFC-125 (AI Guardrails Audit Logger Integration)
 */

import { describe, it, expect } from 'vitest';
import {
  AI_SECURITY_EVENT_TYPES,
  AISecurityEventType,
  AI_EVENT_SEVERITY_MAP,
  isAISecurityEventType,
  SecuritySeverity,
} from '../AISecurityEventTypes';

describe('AISecurityEventTypes', () => {
  describe('AI_SECURITY_EVENT_TYPES constant', () => {
    it('exports 18 AI security event type constants', () => {
      expect(AI_SECURITY_EVENT_TYPES).toHaveLength(18);
    });

    it('includes guardrail events', () => {
      expect(AI_SECURITY_EVENT_TYPES).toContain('AI_GUARDRAIL_TRIGGERED');
      expect(AI_SECURITY_EVENT_TYPES).toContain('AI_GUARDRAIL_BYPASSED');
      expect(AI_SECURITY_EVENT_TYPES).toContain('AI_GUARDRAIL_TIMEOUT');
    });

    it('includes content safety events', () => {
      expect(AI_SECURITY_EVENT_TYPES).toContain('AI_PROMPT_INJECTION_DETECTED');
      expect(AI_SECURITY_EVENT_TYPES).toContain('AI_PII_EXPOSURE_BLOCKED');
      expect(AI_SECURITY_EVENT_TYPES).toContain('AI_TOXIC_CONTENT_BLOCKED');
      expect(AI_SECURITY_EVENT_TYPES).toContain('AI_HALLUCINATION_DETECTED');
    });

    it('includes resource limit events', () => {
      expect(AI_SECURITY_EVENT_TYPES).toContain('AI_TOKEN_LIMIT_EXCEEDED');
      expect(AI_SECURITY_EVENT_TYPES).toContain('AI_COST_THRESHOLD_BREACH');
      expect(AI_SECURITY_EVENT_TYPES).toContain('AI_RATE_LIMIT_TRIGGERED');
    });

    it('includes confidence and quality events', () => {
      expect(AI_SECURITY_EVENT_TYPES).toContain('AI_LOW_CONFIDENCE_OVERRIDE');
      expect(AI_SECURITY_EVENT_TYPES).toContain('AI_CHAIN_FAILURE');
      expect(AI_SECURITY_EVENT_TYPES).toContain('AI_OUTPUT_VALIDATION_FAILED');
      expect(AI_SECURITY_EVENT_TYPES).toContain('AI_MODEL_VERSION_MISMATCH');
    });

    it('includes compliance events', () => {
      expect(AI_SECURITY_EVENT_TYPES).toContain('AI_CONSENT_VALIDATION_FAILED');
      expect(AI_SECURITY_EVENT_TYPES).toContain('AI_DATA_RETENTION_VIOLATION');
      expect(AI_SECURITY_EVENT_TYPES).toContain('AI_CROSS_TENANT_ACCESS_ATTEMPT');
      expect(AI_SECURITY_EVENT_TYPES).toContain('AI_BIAS_THRESHOLD_EXCEEDED');
    });

    it('is readonly and cannot be modified', () => {
      // TypeScript enforces this at compile time with `as const`
      // Runtime check that the array reference is frozen-like behavior
      const originalLength = AI_SECURITY_EVENT_TYPES.length;
      expect(() => {
        // @ts-expect-error - Testing readonly behavior
        AI_SECURITY_EVENT_TYPES.push('FAKE_EVENT');
      }).toThrow();
      expect(AI_SECURITY_EVENT_TYPES.length).toBe(originalLength);
    });
  });

  describe('isAISecurityEventType type guard', () => {
    it('returns true for valid AI security event types', () => {
      expect(isAISecurityEventType('AI_GUARDRAIL_TRIGGERED')).toBe(true);
      expect(isAISecurityEventType('AI_PROMPT_INJECTION_DETECTED')).toBe(true);
      expect(isAISecurityEventType('AI_BIAS_THRESHOLD_EXCEEDED')).toBe(true);
    });

    it('returns false for invalid event types', () => {
      expect(isAISecurityEventType('INVALID_EVENT')).toBe(false);
      expect(isAISecurityEventType('LOGIN_SUCCESS')).toBe(false);
      expect(isAISecurityEventType('')).toBe(false);
    });

    it('returns false for non-string values', () => {
      expect(isAISecurityEventType(null)).toBe(false);
      expect(isAISecurityEventType(undefined)).toBe(false);
      expect(isAISecurityEventType(123)).toBe(false);
      expect(isAISecurityEventType({})).toBe(false);
    });

    it('validates all event types in the constant array', () => {
      for (const eventType of AI_SECURITY_EVENT_TYPES) {
        expect(isAISecurityEventType(eventType)).toBe(true);
      }
    });
  });

  describe('AI_EVENT_SEVERITY_MAP', () => {
    it('covers all event types', () => {
      for (const eventType of AI_SECURITY_EVENT_TYPES) {
        expect(AI_EVENT_SEVERITY_MAP).toHaveProperty(eventType);
      }
    });

    it('returns CRITICAL for prompt injection', () => {
      expect(AI_EVENT_SEVERITY_MAP['AI_PROMPT_INJECTION_DETECTED']).toBe('CRITICAL');
    });

    it('returns CRITICAL for cross-tenant access attempt', () => {
      expect(AI_EVENT_SEVERITY_MAP['AI_CROSS_TENANT_ACCESS_ATTEMPT']).toBe('CRITICAL');
    });

    it('returns HIGH for PII exposure blocked', () => {
      expect(AI_EVENT_SEVERITY_MAP['AI_PII_EXPOSURE_BLOCKED']).toBe('HIGH');
    });

    it('returns HIGH for bias threshold exceeded', () => {
      expect(AI_EVENT_SEVERITY_MAP['AI_BIAS_THRESHOLD_EXCEEDED']).toBe('HIGH');
    });

    it('returns MEDIUM for hallucination detected', () => {
      expect(AI_EVENT_SEVERITY_MAP['AI_HALLUCINATION_DETECTED']).toBe('MEDIUM');
    });

    it('returns LOW for token limit exceeded', () => {
      expect(AI_EVENT_SEVERITY_MAP['AI_TOKEN_LIMIT_EXCEEDED']).toBe('LOW');
    });

    it('returns valid SecuritySeverity values', () => {
      const validSeverities: SecuritySeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
      for (const eventType of AI_SECURITY_EVENT_TYPES) {
        expect(validSeverities).toContain(AI_EVENT_SEVERITY_MAP[eventType]);
      }
    });
  });

  describe('AISecurityEventType type', () => {
    it('allows valid event type assignment', () => {
      const eventType: AISecurityEventType = 'AI_GUARDRAIL_TRIGGERED';
      expect(eventType).toBe('AI_GUARDRAIL_TRIGGERED');
    });

    it('union type includes all 18 event types', () => {
      // This is a compile-time check, but we verify at runtime too
      const allTypes: AISecurityEventType[] = [...AI_SECURITY_EVENT_TYPES];
      expect(allTypes).toHaveLength(18);
    });
  });
});
