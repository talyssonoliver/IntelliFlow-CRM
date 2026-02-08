/**
 * Error Mapper Tests
 *
 * Verifies that all domain and application errors are properly mapped to TRPC errors.
 * Ensures that unused error classes from @intelliflow/application are wired correctly.
 */

import { describe, it, expect } from 'vitest';
import { TRPCError } from '@trpc/server';
import { mapErrorToTRPCError, isDomainError, getErrorCodeMapping } from '../error-mapper';

describe('Error Mapper', () => {
  describe('mapErrorToTRPCError', () => {
    // Webhook errors
    describe('Webhook errors', () => {
      it('should map DUPLICATE_WEBHOOK to CONFLICT', () => {
        const error = {
          code: 'DUPLICATE_WEBHOOK',
          message: 'Duplicate webhook event: evt-123',
        };

        const trpcError = mapErrorToTRPCError(error);

        expect(trpcError).toBeInstanceOf(TRPCError);
        expect(trpcError.code).toBe('CONFLICT');
        expect(trpcError.message).toBe('Duplicate webhook event: evt-123');
      });

      it('should map WEBHOOK_VERIFICATION_ERROR to UNAUTHORIZED', () => {
        const error = {
          code: 'WEBHOOK_VERIFICATION_ERROR',
          message: 'Webhook signature verification failed for source: stripe',
        };

        const trpcError = mapErrorToTRPCError(error);

        expect(trpcError).toBeInstanceOf(TRPCError);
        expect(trpcError.code).toBe('UNAUTHORIZED');
      });

      it('should map WEBHOOK_PROCESSING_ERROR to INTERNAL_SERVER_ERROR', () => {
        const error = {
          code: 'WEBHOOK_PROCESSING_ERROR',
          message: 'Webhook processing failed: handler threw error',
        };

        const trpcError = mapErrorToTRPCError(error);

        expect(trpcError).toBeInstanceOf(TRPCError);
        expect(trpcError.code).toBe('INTERNAL_SERVER_ERROR');
      });

      it('should map WEBHOOK_SOURCE_NOT_FOUND to NOT_FOUND', () => {
        const error = {
          code: 'WEBHOOK_SOURCE_NOT_FOUND',
          message: 'Webhook source not found: unknown-source',
        };

        const trpcError = mapErrorToTRPCError(error);

        expect(trpcError).toBeInstanceOf(TRPCError);
        expect(trpcError.code).toBe('NOT_FOUND');
      });
    });

    // Notification errors
    describe('Notification errors', () => {
      it('should map NOTIFICATION_DELIVERY_ERROR to INTERNAL_SERVER_ERROR', () => {
        const error = {
          code: 'NOTIFICATION_DELIVERY_ERROR',
          message: 'email notification delivery failed: SMTP connection timeout',
        };

        const trpcError = mapErrorToTRPCError(error);

        expect(trpcError).toBeInstanceOf(TRPCError);
        expect(trpcError.code).toBe('INTERNAL_SERVER_ERROR');
        expect(trpcError.message).toContain('email notification delivery failed');
      });

      it('should map NOTIFICATION_SCHEDULING_ERROR to BAD_REQUEST', () => {
        const error = {
          code: 'NOTIFICATION_SCHEDULING_ERROR',
          message: 'Notification scheduling failed: invalid date',
        };

        const trpcError = mapErrorToTRPCError(error);

        expect(trpcError).toBeInstanceOf(TRPCError);
        expect(trpcError.code).toBe('BAD_REQUEST');
      });
    });

    // Application layer errors
    describe('Application layer errors', () => {
      it('should map EXTERNAL_SERVICE_ERROR to SERVICE_UNAVAILABLE', () => {
        const error = {
          code: 'EXTERNAL_SERVICE_ERROR',
          message: 'Stripe service failed: API timeout',
        };

        const trpcError = mapErrorToTRPCError(error);

        expect(trpcError).toBeInstanceOf(TRPCError);
        expect(trpcError.code).toBe('SERVICE_UNAVAILABLE');
      });

      it('should map AUTHORIZATION_ERROR to FORBIDDEN', () => {
        const error = {
          code: 'AUTHORIZATION_ERROR',
          message: 'Admin access required',
        };

        const trpcError = mapErrorToTRPCError(error);

        expect(trpcError).toBeInstanceOf(TRPCError);
        expect(trpcError.code).toBe('FORBIDDEN');
      });

      it('should map PERSISTENCE_ERROR to INTERNAL_SERVER_ERROR', () => {
        const error = {
          code: 'PERSISTENCE_ERROR',
          message: 'Database connection failed',
        };

        const trpcError = mapErrorToTRPCError(error);

        expect(trpcError).toBeInstanceOf(TRPCError);
        expect(trpcError.code).toBe('INTERNAL_SERVER_ERROR');
      });

      it('should map VALIDATION_ERROR to BAD_REQUEST', () => {
        const error = {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input data',
        };

        const trpcError = mapErrorToTRPCError(error);

        expect(trpcError).toBeInstanceOf(TRPCError);
        expect(trpcError.code).toBe('BAD_REQUEST');
      });

      it('should map NOT_FOUND_ERROR to NOT_FOUND', () => {
        const error = {
          code: 'NOT_FOUND_ERROR',
          message: 'Resource not found',
        };

        const trpcError = mapErrorToTRPCError(error);

        expect(trpcError).toBeInstanceOf(TRPCError);
        expect(trpcError.code).toBe('NOT_FOUND');
      });
    });

    // AI Review errors (existing coverage)
    describe('AI Review errors', () => {
      it('should map REVIEW_NOT_FOUND to NOT_FOUND', () => {
        const error = {
          code: 'REVIEW_NOT_FOUND',
          message: 'Review not found',
        };

        const trpcError = mapErrorToTRPCError(error);

        expect(trpcError).toBeInstanceOf(TRPCError);
        expect(trpcError.code).toBe('NOT_FOUND');
      });

      it('should map INVALID_LOCK_TOKEN to UNAUTHORIZED', () => {
        const error = {
          code: 'INVALID_LOCK_TOKEN',
          message: 'Invalid lock token',
        };

        const trpcError = mapErrorToTRPCError(error);

        expect(trpcError).toBeInstanceOf(TRPCError);
        expect(trpcError.code).toBe('UNAUTHORIZED');
      });
    });

    // Edge cases
    describe('Edge cases', () => {
      it('should handle unknown error codes', () => {
        const error = {
          code: 'UNKNOWN_ERROR_CODE',
          message: 'Some unknown error',
        };

        const trpcError = mapErrorToTRPCError(error);

        expect(trpcError).toBeInstanceOf(TRPCError);
        expect(trpcError.code).toBe('INTERNAL_SERVER_ERROR');
        expect(trpcError.message).toBe('An unexpected error occurred');
      });

      it('should handle standard Error instances', () => {
        const error = new Error('Standard error message');

        const trpcError = mapErrorToTRPCError(error);

        expect(trpcError).toBeInstanceOf(TRPCError);
        expect(trpcError.code).toBe('INTERNAL_SERVER_ERROR');
        expect(trpcError.message).toBe('Standard error message');
      });

      it('should handle non-error objects', () => {
        const error = 'string error';

        const trpcError = mapErrorToTRPCError(error);

        expect(trpcError).toBeInstanceOf(TRPCError);
        expect(trpcError.code).toBe('INTERNAL_SERVER_ERROR');
        expect(trpcError.message).toBe('An unknown error occurred');
      });

      it('should handle null/undefined', () => {
        const trpcError = mapErrorToTRPCError(null);

        expect(trpcError).toBeInstanceOf(TRPCError);
        expect(trpcError.code).toBe('INTERNAL_SERVER_ERROR');
      });
    });
  });

  describe('isDomainError', () => {
    it('should return true for valid domain errors', () => {
      const error = {
        code: 'DUPLICATE_WEBHOOK',
        message: 'Duplicate webhook',
      };

      expect(isDomainError(error)).toBe(true);
    });

    it('should return false for standard errors', () => {
      const error = new Error('Standard error');

      expect(isDomainError(error)).toBe(false);
    });

    it('should return false for objects without code', () => {
      const error = {
        message: 'Some message',
      };

      expect(isDomainError(error)).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(isDomainError(null)).toBe(false);
      expect(isDomainError(undefined)).toBe(false);
    });
  });

  describe('getErrorCodeMapping', () => {
    it('should return correct TRPC codes for known errors', () => {
      expect(getErrorCodeMapping('DUPLICATE_WEBHOOK')).toBe('CONFLICT');
      expect(getErrorCodeMapping('WEBHOOK_VERIFICATION_ERROR')).toBe('UNAUTHORIZED');
      expect(getErrorCodeMapping('NOTIFICATION_DELIVERY_ERROR')).toBe('INTERNAL_SERVER_ERROR');
      expect(getErrorCodeMapping('NOTIFICATION_SCHEDULING_ERROR')).toBe('BAD_REQUEST');
      expect(getErrorCodeMapping('EXTERNAL_SERVICE_ERROR')).toBe('SERVICE_UNAVAILABLE');
      expect(getErrorCodeMapping('AUTHORIZATION_ERROR')).toBe('FORBIDDEN');
    });

    it('should return INTERNAL_SERVER_ERROR for unknown codes', () => {
      expect(getErrorCodeMapping('UNKNOWN_CODE')).toBe('INTERNAL_SERVER_ERROR');
    });
  });
});
