/**
 * Middleware Index
 *
 * Exports all tRPC middleware factories for easy importing.
 * These should be used with t.middleware() in server.ts
 */

export {
  createAuthMiddleware,
  createAdminMiddleware,
  createManagerMiddleware,
  verifyToken,
  extractTokenFromHeader,
} from './auth';

export {
  createLoggingMiddleware,
  createPerformanceMiddleware,
  createErrorTrackingMiddleware,
} from './logging';

export {
  createRateLimitMiddleware,
  createStrictRateLimitMiddleware,
  createLenientRateLimitMiddleware,
  RedisRateLimiter,
} from './rate-limit';
