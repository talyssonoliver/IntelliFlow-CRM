# Error Handling Documentation

This document describes the centralized error handling system for the IntelliFlow CRM API.

## Overview

All domain and application layer errors are mapped to tRPC errors through a centralized error mapper. This ensures consistent error responses across all API endpoints.

## Centralized Error Mapper

**Location**: `apps/api/src/shared/error-mapper.ts`

The error mapper provides three main functions:

1. `mapErrorToTRPCError(error)` - Maps any error to a TRPCError
2. `isDomainError(error)` - Type guard for domain errors
3. `getErrorCodeMapping(errorCode)` - Returns the TRPC code for a given error code

## Wired Error Classes

All previously unused error classes from `@intelliflow/application` are now properly wired:

### 1. DuplicateWebhookError

- **Source**: `packages/application/src/ports/external/WebhookServicePort.ts`
- **Maps to**: `CONFLICT` (409)
- **Usage**: Thrown when a webhook event with the same ID is received multiple times
- **Handled in**: `apps/api/src/modules/webhooks/webhooks.router.ts`
- **Example**:
  ```typescript
  // Idempotency check in webhook handler
  if (eventAlreadyProcessed(eventId)) {
    throw new DuplicateWebhookError(eventId);
  }
  ```

### 2. NotificationDeliveryError

- **Source**: `packages/application/src/ports/external/NotificationServicePort.ts`
- **Maps to**: `INTERNAL_SERVER_ERROR` (500)
- **Usage**: Thrown when email, SMS, or push notification delivery fails
- **Handled in**: `apps/api/src/modules/notifications/notifications.router.ts`
- **Example**:
  ```typescript
  // Email sending fails due to SMTP error
  const result = await notificationService.sendEmail(options);
  if (result.isFailure) {
    // NotificationDeliveryError is mapped to INTERNAL_SERVER_ERROR
    throw mapErrorToTRPCError(result.error);
  }
  ```

### 3. NotificationSchedulingError

- **Source**: `packages/application/src/ports/external/NotificationServicePort.ts`
- **Maps to**: `BAD_REQUEST` (400)
- **Usage**: Thrown when notification scheduling fails (invalid date, past date, etc.)
- **Handled in**: `apps/api/src/modules/notifications/notifications.router.ts`
- **Example**:
  ```typescript
  // Scheduling with invalid date
  const result = await notificationService.schedule(
    'email',
    invalidDate,
    options
  );
  if (result.isFailure) {
    // NotificationSchedulingError is mapped to BAD_REQUEST
    throw mapErrorToTRPCError(result.error);
  }
  ```

### 4. ExternalServiceError

- **Source**: `packages/application/src/errors/ApplicationErrors.ts`
- **Maps to**: `SERVICE_UNAVAILABLE` (503)
- **Usage**: Thrown when external API calls fail (Stripe, OpenAI, SendGrid, etc.)
- **Handled in**:
  - `apps/api/src/shared/external-service-wrapper.ts` (utility functions)
  - `apps/api/src/modules/billing/billing.router.ts` (Stripe calls)
- **Example**:
  ```typescript
  // Stripe API call with error handling
  const result = await callStripeAPI(() =>
    stripe.createSubscription(customerId, priceId)
  );
  // ExternalServiceError is mapped to SERVICE_UNAVAILABLE
  ```

### 5. AuthorizationError

- **Source**: `packages/application/src/errors/ApplicationErrors.ts`
- **Maps to**: `FORBIDDEN` (403)
- **Usage**: Thrown when user lacks required permissions
- **Handled in**: `apps/api/src/middleware/auth.ts`
- **Example**:
  ```typescript
  // Admin middleware check
  export function createAdminMiddleware() {
    return async ({ ctx, next }) => {
      if (ctx.user.role !== 'ADMIN') {
        throw new AuthorizationError('Admin access required');
      }
      return next();
    };
  }
  ```

## Error Code Mappings

| Domain Error Code | TRPC Code | HTTP Status | Use Case |
|------------------|-----------|-------------|----------|
| `DUPLICATE_WEBHOOK` | `CONFLICT` | 409 | Duplicate webhook event |
| `WEBHOOK_VERIFICATION_ERROR` | `UNAUTHORIZED` | 401 | Invalid webhook signature |
| `WEBHOOK_PROCESSING_ERROR` | `INTERNAL_SERVER_ERROR` | 500 | Webhook handler failed |
| `WEBHOOK_SOURCE_NOT_FOUND` | `NOT_FOUND` | 404 | Unknown webhook source |
| `NOTIFICATION_DELIVERY_ERROR` | `INTERNAL_SERVER_ERROR` | 500 | Email/SMS delivery failed |
| `NOTIFICATION_SCHEDULING_ERROR` | `BAD_REQUEST` | 400 | Invalid schedule date |
| `EXTERNAL_SERVICE_ERROR` | `SERVICE_UNAVAILABLE` | 503 | External API failure |
| `AUTHORIZATION_ERROR` | `FORBIDDEN` | 403 | Insufficient permissions |
| `PERSISTENCE_ERROR` | `INTERNAL_SERVER_ERROR` | 500 | Database error |
| `VALIDATION_ERROR` | `BAD_REQUEST` | 400 | Invalid input |
| `NOT_FOUND_ERROR` | `NOT_FOUND` | 404 | Resource not found |

## Usage Patterns

### 1. In tRPC Routers

```typescript
import { mapErrorToTRPCError } from '../../shared/error-mapper';

export const exampleRouter = createTRPCRouter({
  doSomething: protectedProcedure
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await service.performAction(input);

        if (result.isFailure) {
          // Maps domain error to appropriate TRPC error
          throw mapErrorToTRPCError(result.error);
        }

        return result.value;
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw mapErrorToTRPCError(error);
      }
    }),
});
```

### 2. In Middleware

```typescript
import { mapErrorToTRPCError } from '../shared/error-mapper';
import { AuthorizationError } from '@intelliflow/application';

export function createAuthMiddleware() {
  return async ({ ctx, next }) => {
    try {
      // Perform auth checks
      if (!hasPermission(ctx.user)) {
        throw new AuthorizationError('Permission denied');
      }
      return next();
    } catch (error) {
      throw mapErrorToTRPCError(error);
    }
  };
}
```

### 3. External Service Calls

```typescript
import { callStripeAPI } from '../../shared/external-service-wrapper';

// Automatic error handling for Stripe
const subscription = await callStripeAPI(() =>
  stripe.createSubscription(customerId, priceId)
);

// Automatic error handling for OpenAI
const completion = await callOpenAI(() =>
  openai.chat.completions.create(params)
);
```

## Files Modified

1. **Created**:
   - `apps/api/src/shared/error-mapper.ts` - Centralized error mapping
   - `apps/api/src/shared/external-service-wrapper.ts` - External service utilities
   - `apps/api/src/modules/webhooks/webhooks.router.ts` - Webhook management router
   - `apps/api/src/shared/__tests__/error-mapper.test.ts` - Comprehensive tests

2. **Modified**:
   - `apps/api/src/middleware/auth.ts` - Added AuthorizationError handling
   - `apps/api/src/modules/notifications/notifications.router.ts` - Added notification service endpoints
   - `apps/api/src/modules/billing/billing.router.ts` - Added ExternalServiceError handling
   - `apps/api/src/modules/ai-review/ai-review.router.ts` - Delegated to centralized mapper
   - `apps/api/src/router.ts` - Registered webhooks router

## Testing

All error mappings are covered by tests:

```bash
# Run error mapper tests
pnpm --filter @intelliflow/api test src/shared/__tests__/error-mapper.test.ts
```

**Test Coverage**: 23 tests covering:
- Webhook error mappings (4 tests)
- Notification error mappings (2 tests)
- Application error mappings (5 tests)
- AI Review error mappings (2 tests)
- Edge cases (5 tests)
- Type guards and utilities (5 tests)

## Benefits

1. **Consistency**: All errors mapped through a single function
2. **Type Safety**: Full TypeScript support for error codes
3. **Maintainability**: Single source of truth for error mappings
4. **Testability**: Comprehensive test coverage
5. **Discoverability**: All error codes documented in one place
6. **No Unused Exports**: All application error classes are now properly wired

## Future Enhancements

1. Add structured error logging with correlation IDs
2. Implement error analytics/monitoring integration
3. Add client-side error handling utilities
4. Create error recovery strategies for specific error types
5. Add internationalization (i18n) support for error messages
