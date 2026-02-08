/**
 * Centralized Error Mapping Utility
 *
 * Maps domain and application layer errors to tRPC errors.
 * Provides consistent error handling across all routers.
 *
 * Usage:
 *   catch (error) {
 *     throw mapErrorToTRPCError(error);
 *   }
 */

import { TRPCError } from '@trpc/server';
import type { DomainError } from '@intelliflow/domain';
import {
  ExternalServiceError,
  NotificationDeliveryError,
  NotificationSchedulingError,
  DuplicateWebhookError,
} from '@intelliflow/application';

/**
 * Maps domain/application errors to tRPC error codes.
 * Handles all error types from @intelliflow/application and @intelliflow/domain.
 */
export function mapErrorToTRPCError(error: unknown): TRPCError {
  // Type-safe instanceof checks for known application error classes
  if (error instanceof DuplicateWebhookError) {
    return new TRPCError({ code: 'CONFLICT', message: error.message });
  }
  if (error instanceof NotificationDeliveryError) {
    return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
  if (error instanceof NotificationSchedulingError) {
    return new TRPCError({ code: 'BAD_REQUEST', message: error.message });
  }
  if (error instanceof ExternalServiceError) {
    return new TRPCError({ code: 'SERVICE_UNAVAILABLE', message: error.message });
  }

  // Handle DomainError instances with code property
  if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
    const domainError = error as DomainError & { code: string };
    const code = domainError.code;

    switch (code) {
      // Webhook errors
      case 'DUPLICATE_WEBHOOK':
        return new TRPCError({
          code: 'CONFLICT',
          message: domainError.message
        });
      case 'WEBHOOK_VERIFICATION_ERROR':
        return new TRPCError({
          code: 'UNAUTHORIZED',
          message: domainError.message
        });
      case 'WEBHOOK_PROCESSING_ERROR':
        return new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: domainError.message
        });
      case 'WEBHOOK_SOURCE_NOT_FOUND':
        return new TRPCError({
          code: 'NOT_FOUND',
          message: domainError.message
        });

      // Notification errors
      case 'NOTIFICATION_DELIVERY_ERROR':
        return new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: domainError.message
        });
      case 'NOTIFICATION_SCHEDULING_ERROR':
        return new TRPCError({
          code: 'BAD_REQUEST',
          message: domainError.message
        });

      // Application layer errors
      case 'EXTERNAL_SERVICE_ERROR':
        return new TRPCError({
          code: 'SERVICE_UNAVAILABLE',
          message: domainError.message
        });
      case 'AUTHORIZATION_ERROR':
        return new TRPCError({
          code: 'FORBIDDEN',
          message: domainError.message
        });
      case 'PERSISTENCE_ERROR':
        return new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: domainError.message
        });
      case 'VALIDATION_ERROR':
        return new TRPCError({
          code: 'BAD_REQUEST',
          message: domainError.message
        });
      case 'NOT_FOUND_ERROR':
        return new TRPCError({
          code: 'NOT_FOUND',
          message: domainError.message
        });

      // AI Review errors
      case 'REVIEW_NOT_FOUND':
        return new TRPCError({ code: 'NOT_FOUND', message: domainError.message });
      case 'REVIEW_ALREADY_CLAIMED':
        return new TRPCError({ code: 'CONFLICT', message: domainError.message });
      case 'INVALID_REVIEW_STATE':
        return new TRPCError({ code: 'BAD_REQUEST', message: domainError.message });
      case 'CONCURRENT_MODIFICATION':
        return new TRPCError({ code: 'CONFLICT', message: domainError.message });
      case 'INVALID_LOCK_TOKEN':
        return new TRPCError({ code: 'UNAUTHORIZED', message: domainError.message });
      case 'LOCK_EXPIRED':
        return new TRPCError({ code: 'UNAUTHORIZED', message: domainError.message });
      case 'NOT_LOCK_HOLDER':
        return new TRPCError({ code: 'FORBIDDEN', message: domainError.message });
      case 'MAX_ESCALATION_REACHED':
        return new TRPCError({ code: 'CONFLICT', message: domainError.message });
      case 'REJECTION_NOTES_REQUIRED':
        return new TRPCError({ code: 'BAD_REQUEST', message: domainError.message });
      case 'NO_ACTIVE_LOCK':
        return new TRPCError({ code: 'BAD_REQUEST', message: domainError.message });

      // Default for unknown domain error codes
      default:
        console.warn(`[ErrorMapper] Unmapped domain error code: ${code}`);
        return new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected error occurred'
        });
    }
  }

  // Handle standard Error instances
  if (error instanceof Error) {
    return new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: error.message,
    });
  }

  // Fallback for unknown error types
  return new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'An unknown error occurred',
  });
}

/**
 * Type guard to check if error is a domain error with a code property
 */
export function isDomainError(error: unknown): error is DomainError & { code: string } {
  return (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    'message' in error &&
    typeof (error as any).code === 'string'
  );
}

/**
 * Maps specific error codes to TRPC error codes
 * Used for checking what TRPC code an error would map to
 */
export function getErrorCodeMapping(errorCode: string): TRPCError['code'] {
  const mappings: Record<string, TRPCError['code']> = {
    DUPLICATE_WEBHOOK: 'CONFLICT',
    WEBHOOK_VERIFICATION_ERROR: 'UNAUTHORIZED',
    WEBHOOK_PROCESSING_ERROR: 'INTERNAL_SERVER_ERROR',
    WEBHOOK_SOURCE_NOT_FOUND: 'NOT_FOUND',
    NOTIFICATION_DELIVERY_ERROR: 'INTERNAL_SERVER_ERROR',
    NOTIFICATION_SCHEDULING_ERROR: 'BAD_REQUEST',
    EXTERNAL_SERVICE_ERROR: 'SERVICE_UNAVAILABLE',
    AUTHORIZATION_ERROR: 'FORBIDDEN',
    PERSISTENCE_ERROR: 'INTERNAL_SERVER_ERROR',
    VALIDATION_ERROR: 'BAD_REQUEST',
    NOT_FOUND_ERROR: 'NOT_FOUND',
  };

  return mappings[errorCode] || 'INTERNAL_SERVER_ERROR';
}
