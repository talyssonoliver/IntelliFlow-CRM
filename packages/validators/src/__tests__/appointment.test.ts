/**
 * Appointment Validators Tests
 *
 * Tests the Zod validation schemas for appointment status and type enums.
 * These schemas derive from domain constants (single source of truth pattern).
 *
 * Coverage target: >90% for validator layer
 */

import { describe, it, expect } from 'vitest';

import {
  appointmentStatusSchema,
  appointmentTypeSchema,
  type AppointmentStatus,
  type AppointmentType,
} from '../appointment';

import { APPOINTMENT_STATUSES, APPOINTMENT_TYPES } from '@intelliflow/domain';

describe('Appointment Validators', () => {
  // =============================================================================
  // appointmentStatusSchema
  // =============================================================================

  describe('appointmentStatusSchema', () => {
    it('should accept all valid appointment statuses', () => {
      const validStatuses: AppointmentStatus[] = [
        'SCHEDULED',
        'CONFIRMED',
        'IN_PROGRESS',
        'COMPLETED',
        'CANCELLED',
        'NO_SHOW',
      ];

      validStatuses.forEach((status) => {
        const result = appointmentStatusSchema.safeParse(status);
        expect(result.success).toBe(true);
      });
    });

    it('should accept every value from domain APPOINTMENT_STATUSES', () => {
      APPOINTMENT_STATUSES.forEach((status) => {
        const result = appointmentStatusSchema.safeParse(status);
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid status value', () => {
      const result = appointmentStatusSchema.safeParse('PENDING');
      expect(result.success).toBe(false);
    });

    it('should reject lowercase variant', () => {
      const result = appointmentStatusSchema.safeParse('scheduled');
      expect(result.success).toBe(false);
    });

    it('should reject empty string', () => {
      const result = appointmentStatusSchema.safeParse('');
      expect(result.success).toBe(false);
    });

    it('should reject number input', () => {
      const result = appointmentStatusSchema.safeParse(1);
      expect(result.success).toBe(false);
    });

    it('should reject null', () => {
      const result = appointmentStatusSchema.safeParse(null);
      expect(result.success).toBe(false);
    });

    it('should reject undefined', () => {
      const result = appointmentStatusSchema.safeParse(undefined);
      expect(result.success).toBe(false);
    });

    it('should reject boolean', () => {
      const result = appointmentStatusSchema.safeParse(true);
      expect(result.success).toBe(false);
    });

    it('should reject object', () => {
      const result = appointmentStatusSchema.safeParse({ status: 'SCHEDULED' });
      expect(result.success).toBe(false);
    });

    it('should return the exact valid value on success', () => {
      const result = appointmentStatusSchema.safeParse('CONFIRMED');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('CONFIRMED');
      }
    });

    it('should have the same number of values as domain constant', () => {
      // Ensures the schema stays in sync with domain
      let validCount = 0;
      APPOINTMENT_STATUSES.forEach((s) => {
        if (appointmentStatusSchema.safeParse(s).success) validCount++;
      });
      expect(validCount).toBe(APPOINTMENT_STATUSES.length);
    });
  });

  // =============================================================================
  // appointmentTypeSchema
  // =============================================================================

  describe('appointmentTypeSchema', () => {
    it('should accept all valid appointment types', () => {
      const validTypes: AppointmentType[] = [
        'MEETING',
        'CALL',
        'HEARING',
        'CONSULTATION',
        'DEPOSITION',
        'OTHER',
      ];

      validTypes.forEach((type) => {
        const result = appointmentTypeSchema.safeParse(type);
        expect(result.success).toBe(true);
      });
    });

    it('should accept every value from domain APPOINTMENT_TYPES', () => {
      APPOINTMENT_TYPES.forEach((type) => {
        const result = appointmentTypeSchema.safeParse(type);
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid type value', () => {
      const result = appointmentTypeSchema.safeParse('WEBINAR');
      expect(result.success).toBe(false);
    });

    it('should reject lowercase variant', () => {
      const result = appointmentTypeSchema.safeParse('meeting');
      expect(result.success).toBe(false);
    });

    it('should reject empty string', () => {
      const result = appointmentTypeSchema.safeParse('');
      expect(result.success).toBe(false);
    });

    it('should reject number input', () => {
      const result = appointmentTypeSchema.safeParse(42);
      expect(result.success).toBe(false);
    });

    it('should reject null', () => {
      const result = appointmentTypeSchema.safeParse(null);
      expect(result.success).toBe(false);
    });

    it('should reject undefined', () => {
      const result = appointmentTypeSchema.safeParse(undefined);
      expect(result.success).toBe(false);
    });

    it('should return the exact valid value on success', () => {
      const result = appointmentTypeSchema.safeParse('HEARING');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('HEARING');
      }
    });

    it('should have the same number of values as domain constant', () => {
      let validCount = 0;
      APPOINTMENT_TYPES.forEach((t) => {
        if (appointmentTypeSchema.safeParse(t).success) validCount++;
      });
      expect(validCount).toBe(APPOINTMENT_TYPES.length);
    });
  });

  // =============================================================================
  // Export Verification
  // =============================================================================

  describe('exports', () => {
    it('should export appointmentStatusSchema', () => {
      expect(appointmentStatusSchema).toBeDefined();
      expect(typeof appointmentStatusSchema.safeParse).toBe('function');
    });

    it('should export appointmentTypeSchema', () => {
      expect(appointmentTypeSchema).toBeDefined();
      expect(typeof appointmentTypeSchema.safeParse).toBe('function');
    });
  });
});
