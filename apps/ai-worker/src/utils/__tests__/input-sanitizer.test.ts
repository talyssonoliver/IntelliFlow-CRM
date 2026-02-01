/**
 * Input Sanitizer Tests (IFC-095 P2)
 *
 * Tests for validation and sanitization of prediction job inputs.
 * Ensures tenant isolation, validates UUIDs, and prevents injection attacks.
 *
 * @see IFC-095: Churn Risk & Next Best Action
 */

import { describe, it, expect } from 'vitest';
import {
  sanitizePredictionInput,
  validateEntityId,
  validateTenantContext,
  sanitizeStringField,
  clampNumericField,
} from '../input-sanitizer';

describe('Input Sanitizer (IFC-095 P2)', () => {
  const validUUID = '550e8400-e29b-41d4-a716-446655440000';
  const validTenantId = '550e8400-e29b-41d4-a716-446655440001';
  const validUserId = '550e8400-e29b-41d4-a716-446655440002';

  describe('sanitizePredictionInput', () => {
    it('should pass valid prediction input', () => {
      const input = {
        entityType: 'lead',
        entityId: validUUID,
        predictionType: 'CHURN_RISK',
        context: {
          tenantId: validTenantId,
          userId: validUserId,
        },
      };
      expect(() => sanitizePredictionInput(input)).not.toThrow();
    });

    it('should reject invalid entityId format', () => {
      const input = {
        entityType: 'lead',
        entityId: 'not-a-uuid',
        predictionType: 'CHURN_RISK',
        context: {
          tenantId: validTenantId,
          userId: validUserId,
        },
      };
      expect(() => sanitizePredictionInput(input)).toThrow(/Invalid entity ID/);
    });

    it('should reject invalid entityType', () => {
      const input = {
        entityType: 'invalid',
        entityId: validUUID,
        predictionType: 'CHURN_RISK',
        context: {
          tenantId: validTenantId,
          userId: validUserId,
        },
      };
      expect(() => sanitizePredictionInput(input)).toThrow(/Invalid entity type/);
    });

    it('should reject missing tenantId in context', () => {
      const input = {
        entityType: 'lead',
        entityId: validUUID,
        predictionType: 'CHURN_RISK',
        context: { userId: validUserId },
      };
      expect(() => sanitizePredictionInput(input)).toThrow(/tenantId/);
    });

    it('should reject missing userId in context', () => {
      const input = {
        entityType: 'lead',
        entityId: validUUID,
        predictionType: 'CHURN_RISK',
        context: { tenantId: validTenantId },
      };
      expect(() => sanitizePredictionInput(input)).toThrow(/userId/);
    });

    it('should accept all valid entity types', () => {
      const entityTypes = ['lead', 'contact', 'opportunity', 'account'] as const;
      for (const entityType of entityTypes) {
        const input = {
          entityType,
          entityId: validUUID,
          predictionType: 'CHURN_RISK',
          context: {
            tenantId: validTenantId,
            userId: validUserId,
          },
        };
        expect(() => sanitizePredictionInput(input)).not.toThrow();
      }
    });

    it('should accept all valid prediction types', () => {
      const predictionTypes = ['CHURN_RISK', 'NEXT_BEST_ACTION', 'QUALIFICATION'] as const;
      for (const predictionType of predictionTypes) {
        const input = {
          entityType: 'lead',
          entityId: validUUID,
          predictionType,
          context: {
            tenantId: validTenantId,
            userId: validUserId,
          },
        };
        expect(() => sanitizePredictionInput(input)).not.toThrow();
      }
    });
  });

  describe('sanitizeStringField', () => {
    it('should trim whitespace', () => {
      expect(sanitizeStringField('  hello  ')).toBe('hello');
    });

    it('should truncate long strings', () => {
      const long = 'a'.repeat(1000);
      expect(sanitizeStringField(long, 100).length).toBe(100);
    });

    it('should remove control characters', () => {
      expect(sanitizeStringField('hello\x00world')).toBe('helloworld');
    });

    it('should handle empty strings', () => {
      expect(sanitizeStringField('')).toBe('');
    });

    it('should handle strings with only whitespace', () => {
      expect(sanitizeStringField('   ')).toBe('');
    });

    it('should use default max length of 500', () => {
      const long = 'a'.repeat(600);
      expect(sanitizeStringField(long).length).toBe(500);
    });
  });

  describe('clampNumericField', () => {
    it('should clamp to max', () => {
      expect(clampNumericField(150, 0, 100)).toBe(100);
    });

    it('should clamp to min', () => {
      expect(clampNumericField(-10, 0, 100)).toBe(0);
    });

    it('should keep value in range', () => {
      expect(clampNumericField(50, 0, 100)).toBe(50);
    });

    it('should handle boundary values', () => {
      expect(clampNumericField(0, 0, 100)).toBe(0);
      expect(clampNumericField(100, 0, 100)).toBe(100);
    });

    it('should handle negative ranges', () => {
      expect(clampNumericField(-50, -100, -10)).toBe(-50);
      expect(clampNumericField(-150, -100, -10)).toBe(-100);
      expect(clampNumericField(0, -100, -10)).toBe(-10);
    });
  });

  describe('validateEntityId', () => {
    it('should return true for valid UUID v4', () => {
      expect(validateEntityId('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    });

    it('should return true for valid UUID v1', () => {
      expect(validateEntityId('6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(true);
    });

    it('should return false for invalid UUID', () => {
      expect(validateEntityId('not-a-uuid')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(validateEntityId('')).toBe(false);
    });

    it('should return false for UUID with wrong length', () => {
      expect(validateEntityId('550e8400-e29b-41d4-a716-44665544000')).toBe(false);
      expect(validateEntityId('550e8400-e29b-41d4-a716-4466554400000')).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(validateEntityId('550E8400-E29B-41D4-A716-446655440000')).toBe(true);
      expect(validateEntityId('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    });
  });

  describe('validateTenantContext', () => {
    it('should return validated context for valid input', () => {
      const context = { tenantId: validTenantId, userId: validUserId };
      const result = validateTenantContext(context);
      expect(result.tenantId).toBe(validTenantId);
      expect(result.userId).toBe(validUserId);
    });

    it('should throw for missing tenantId', () => {
      const context = { userId: validUserId };
      expect(() => validateTenantContext(context)).toThrow('tenantId is required');
    });

    it('should throw for missing userId', () => {
      const context = { tenantId: validTenantId };
      expect(() => validateTenantContext(context)).toThrow('userId is required');
    });

    it('should throw for invalid tenantId format', () => {
      const context = { tenantId: 'not-a-uuid', userId: validUserId };
      expect(() => validateTenantContext(context)).toThrow('tenantId must be a valid UUID');
    });

    it('should throw for invalid userId format', () => {
      const context = { tenantId: validTenantId, userId: 'not-a-uuid' };
      expect(() => validateTenantContext(context)).toThrow('userId must be a valid UUID');
    });

    it('should throw for undefined context', () => {
      expect(() => validateTenantContext(undefined)).toThrow('tenantId is required');
    });
  });
});
