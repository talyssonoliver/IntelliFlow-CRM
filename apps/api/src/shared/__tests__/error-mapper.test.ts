/**
 * Error Mapper Tests
 *
 * Verifies that domain errors are correctly mapped to tRPC error codes
 */

import { describe, it, expect } from 'vitest';
import { TRPCError } from '@trpc/server';
import {
  ExternalServiceError,
  AuthorizationError,
  NotificationDeliveryError,
  NotificationSchedulingError,
  DuplicateWebhookError,
} from '@intelliflow/application';
import { mapErrorToTRPCError } from '../error-mapper';

describe('mapErrorToTRPCError', () => {
  it('should map DuplicateWebhookError to CONFLICT', () => {
    const error = new DuplicateWebhookError('webhook-123');
    const trpcError = mapErrorToTRPCError(error);

    expect(trpcError).toBeInstanceOf(TRPCError);
    expect(trpcError.code).toBe('CONFLICT');
    expect(trpcError.message).toContain('webhook-123');
  });

  it('should map NotificationDeliveryError to INTERNAL_SERVER_ERROR', () => {
    const error = new NotificationDeliveryError('email', 'SMTP timeout');
    const trpcError = mapErrorToTRPCError(error);

    expect(trpcError).toBeInstanceOf(TRPCError);
    expect(trpcError.code).toBe('INTERNAL_SERVER_ERROR');
    expect(trpcError.message).toContain('email');
    expect(trpcError.message).toContain('SMTP timeout');
  });

  it('should map NotificationSchedulingError to BAD_REQUEST', () => {
    const error = new NotificationSchedulingError('Invalid schedule time');
    const trpcError = mapErrorToTRPCError(error);

    expect(trpcError).toBeInstanceOf(TRPCError);
    expect(trpcError.code).toBe('BAD_REQUEST');
    expect(trpcError.message).toContain('Invalid schedule time');
  });

  it('should map ExternalServiceError to SERVICE_UNAVAILABLE', () => {
    const error = new ExternalServiceError('Payment gateway unreachable');
    const trpcError = mapErrorToTRPCError(error);

    expect(trpcError).toBeInstanceOf(TRPCError);
    expect(trpcError.code).toBe('SERVICE_UNAVAILABLE');
    expect(trpcError.message).toContain('Payment gateway unreachable');
  });

  it('should map AuthorizationError to FORBIDDEN', () => {
    const error = new AuthorizationError('Insufficient permissions');
    const trpcError = mapErrorToTRPCError(error);

    expect(trpcError).toBeInstanceOf(TRPCError);
    expect(trpcError.code).toBe('FORBIDDEN');
    expect(trpcError.message).toContain('Insufficient permissions');
  });

  it('should map domain error by code property (VALIDATION_ERROR)', () => {
    const error = {
      code: 'VALIDATION_ERROR',
      message: 'Invalid email format',
    };
    const trpcError = mapErrorToTRPCError(error);

    expect(trpcError).toBeInstanceOf(TRPCError);
    expect(trpcError.code).toBe('BAD_REQUEST');
    expect(trpcError.message).toBe('Invalid email format');
  });

  it('should map domain error by code property (NOT_FOUND_ERROR)', () => {
    const error = {
      code: 'NOT_FOUND_ERROR',
      message: 'User not found',
    };
    const trpcError = mapErrorToTRPCError(error);

    expect(trpcError).toBeInstanceOf(TRPCError);
    expect(trpcError.code).toBe('NOT_FOUND');
    expect(trpcError.message).toBe('User not found');
  });

  it('should handle generic Error instances', () => {
    const error = new Error('Something went wrong');
    const trpcError = mapErrorToTRPCError(error);

    expect(trpcError).toBeInstanceOf(TRPCError);
    expect(trpcError.code).toBe('INTERNAL_SERVER_ERROR');
    expect(trpcError.message).toBe('Something went wrong');
  });

  it('should handle unknown error types', () => {
    const error = 'String error';
    const trpcError = mapErrorToTRPCError(error);

    expect(trpcError).toBeInstanceOf(TRPCError);
    expect(trpcError.code).toBe('INTERNAL_SERVER_ERROR');
    expect(trpcError.message).toBe('An unexpected error occurred');
  });

  it('should handle null/undefined errors', () => {
    const trpcError1 = mapErrorToTRPCError(null);
    expect(trpcError1).toBeInstanceOf(TRPCError);
    expect(trpcError1.code).toBe('INTERNAL_SERVER_ERROR');

    const trpcError2 = mapErrorToTRPCError(undefined);
    expect(trpcError2).toBeInstanceOf(TRPCError);
    expect(trpcError2.code).toBe('INTERNAL_SERVER_ERROR');
  });

  it('should map REVIEW_NOT_FOUND to NOT_FOUND', () => {
    const error = {
      code: 'REVIEW_NOT_FOUND',
      message: 'Review not found',
    };
    const trpcError = mapErrorToTRPCError(error);

    expect(trpcError).toBeInstanceOf(TRPCError);
    expect(trpcError.code).toBe('NOT_FOUND');
  });

  it('should map DUPLICATE_WEBHOOK to CONFLICT', () => {
    const error = {
      code: 'DUPLICATE_WEBHOOK',
      message: 'Webhook already processed',
    };
    const trpcError = mapErrorToTRPCError(error);

    expect(trpcError).toBeInstanceOf(TRPCError);
    expect(trpcError.code).toBe('CONFLICT');
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
});
