/**
 * Centralized Error Mapper
 *
 * Maps application layer domain errors to tRPC error codes.
 * Imports all error classes from @intelliflow/application to satisfy Knip.
 */

import { TRPCError } from '@trpc/server';
import {
  ExternalServiceError,
  AuthorizationError,
  NotificationDeliveryError,
  NotificationSchedulingError,
  DuplicateWebhookError,
} from '@intelliflow/application';

/**
 * Maps domain errors to appropriate tRPC error codes
 *
 * @param error - The error to map (can be domain error, Error, or unknown)
 * @returns TRPCError with appropriate code and message
 */
export function mapErrorToTRPCError(error: unknown): TRPCError {
  // Handle application layer error classes with instanceof checks
  if (error instanceof DuplicateWebhookError) {
    return new TRPCError({
      code: 'CONFLICT',
      message: error.message,
    });
  }

  if (error instanceof NotificationDeliveryError) {
    return new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: error.message,
    });
  }

  if (error instanceof NotificationSchedulingError) {
    return new TRPCError({
      code: 'BAD_REQUEST',
      message: error.message,
    });
  }

  if (error instanceof ExternalServiceError) {
    return new TRPCError({
      code: 'SERVICE_UNAVAILABLE',
      message: error.message,
    });
  }

  if (error instanceof AuthorizationError) {
    return new TRPCError({
      code: 'FORBIDDEN',
      message: error.message,
    });
  }

  // Handle domain errors by code property (fallback for other error types)
  if (error && typeof error === 'object' && 'code' in error) {
    const domainError = error as { code: string; message: string };
    const code = domainError.code;

    // Map common domain error codes
    switch (code) {
      case 'VALIDATION_ERROR':
      case 'NOTIFICATION_SCHEDULING_ERROR':
      case 'INVALID_REVIEW_STATE':
      case 'REJECTION_NOTES_REQUIRED':
      case 'NO_ACTIVE_LOCK':
        return new TRPCError({
          code: 'BAD_REQUEST',
          message: domainError.message,
        });

      case 'NOT_FOUND_ERROR':
      case 'REVIEW_NOT_FOUND':
        return new TRPCError({
          code: 'NOT_FOUND',
          message: domainError.message,
        });

      case 'AUTHORIZATION_ERROR':
      case 'NOT_LOCK_HOLDER':
        return new TRPCError({
          code: 'FORBIDDEN',
          message: domainError.message,
        });

      case 'INVALID_LOCK_TOKEN':
      case 'LOCK_EXPIRED':
        return new TRPCError({
          code: 'UNAUTHORIZED',
          message: domainError.message,
        });

      case 'DUPLICATE_WEBHOOK':
      case 'REVIEW_ALREADY_CLAIMED':
      case 'CONCURRENT_MODIFICATION':
      case 'MAX_ESCALATION_REACHED':
        return new TRPCError({
          code: 'CONFLICT',
          message: domainError.message,
        });

      case 'EXTERNAL_SERVICE_ERROR':
        return new TRPCError({
          code: 'SERVICE_UNAVAILABLE',
          message: domainError.message,
        });

      case 'NOTIFICATION_DELIVERY_ERROR':
      case 'PERSISTENCE_ERROR':
        return new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: domainError.message,
        });

      default:
        return new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: domainError.message || 'An unexpected error occurred',
        });
    }
  }

  // Handle generic Error instances
  if (error instanceof Error) {
    return new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: error.message,
    });
  }

  // Fallback for unknown error types
  return new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred',
  });
}
