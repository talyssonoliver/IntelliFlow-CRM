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

// TODO: IFC-114 - Rate limiting implementation not yet complete
// Uncomment when rate-limit.ts has actual implementation
// export {
//   createRateLimitMiddleware,
//   createStrictRateLimitMiddleware,
//   createLenientRateLimitMiddleware,
//   createTieredRateLimitMiddleware,
//   createPublicRateLimitMiddleware,
//   createAuthenticatedRateLimitMiddleware,
//   createAIRateLimitMiddleware,
//   createAuthEndpointRateLimitMiddleware,
//   RedisRateLimiter,
//   getRateLimiter,
//   rateLimitConfig,
//   RATE_LIMIT_TIERS,
//   DDOS_CONFIG,
// } from './rate-limit';
//
// export type { RateLimitResult } from './rate-limit';
