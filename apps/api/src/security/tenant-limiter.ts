/**
 * Tenant Resource Limiter
 *
 * Implements resource limit enforcement per tenant.
 * Prevents any single tenant from consuming excessive resources.
 *
 * IMPLEMENTS: IFC-127 (Tenant Isolation)
 *
 * Features:
 * - Rate limiting per tenant
 * - Resource quota enforcement (leads, contacts, etc.)
 * - Storage limits
 * - API request quotas
 * - Concurrent request limiting
 */

import { TRPCError } from '@trpc/server';
import { PrismaClient } from '@prisma/client';
import { TenantContext, TenantAwareContext } from './tenant-context';
import { Context } from '../context';

/**
 * Resource types that can be limited
 */
export type ResourceType =
  | 'leads'
  | 'contacts'
  | 'accounts'
  | 'opportunities'
  | 'tasks'
  | 'ai_scores'
  | 'storage_mb'
  | 'api_requests_per_minute'
  | 'api_requests_per_day'
  | 'concurrent_requests';

/**
 * Tenant resource limits configuration
 */
export interface TenantLimits {
  /** Maximum number of leads */
  maxLeads: number;
  /** Maximum number of contacts */
  maxContacts: number;
  /** Maximum number of accounts */
  maxAccounts: number;
  /** Maximum number of opportunities */
  maxOpportunities: number;
  /** Maximum number of tasks */
  maxTasks: number;
  /** Maximum AI scoring requests per day */
  maxAiScoresPerDay: number;
  /** Maximum storage in MB */
  maxStorageMb: number;
  /** API rate limit (requests per minute) */
  apiRateLimit: number;
  /** Daily API request limit */
  apiDailyLimit: number;
  /** Maximum concurrent requests */
  maxConcurrentRequests: number;
}

/**
 * Default limits by role/tier
 */
export const DEFAULT_LIMITS: Record<string, TenantLimits> = {
  FREE: {
    maxLeads: 100,
    maxContacts: 100,
    maxAccounts: 25,
    maxOpportunities: 25,
    maxTasks: 100,
    maxAiScoresPerDay: 10,
    maxStorageMb: 100,
    apiRateLimit: 60,
    apiDailyLimit: 1000,
    maxConcurrentRequests: 3,
  },
  STARTER: {
    maxLeads: 1000,
    maxContacts: 1000,
    maxAccounts: 100,
    maxOpportunities: 100,
    maxTasks: 500,
    maxAiScoresPerDay: 100,
    maxStorageMb: 1024,
    apiRateLimit: 120,
    apiDailyLimit: 10000,
    maxConcurrentRequests: 5,
  },
  PROFESSIONAL: {
    maxLeads: 10000,
    maxContacts: 10000,
    maxAccounts: 500,
    maxOpportunities: 500,
    maxTasks: 2000,
    maxAiScoresPerDay: 500,
    maxStorageMb: 5120,
    apiRateLimit: 300,
    apiDailyLimit: 50000,
    maxConcurrentRequests: 10,
  },
  ENTERPRISE: {
    maxLeads: 100000,
    maxContacts: 100000,
    maxAccounts: 5000,
    maxOpportunities: 5000,
    maxTasks: 20000,
    maxAiScoresPerDay: 5000,
    maxStorageMb: 51200,
    apiRateLimit: 1000,
    apiDailyLimit: 500000,
    maxConcurrentRequests: 25,
  },
  UNLIMITED: {
    maxLeads: Number.MAX_SAFE_INTEGER,
    maxContacts: Number.MAX_SAFE_INTEGER,
    maxAccounts: Number.MAX_SAFE_INTEGER,
    maxOpportunities: Number.MAX_SAFE_INTEGER,
    maxTasks: Number.MAX_SAFE_INTEGER,
    maxAiScoresPerDay: Number.MAX_SAFE_INTEGER,
    maxStorageMb: Number.MAX_SAFE_INTEGER,
    apiRateLimit: Number.MAX_SAFE_INTEGER,
    apiDailyLimit: Number.MAX_SAFE_INTEGER,
    maxConcurrentRequests: Number.MAX_SAFE_INTEGER,
  },
};

/**
 * In-memory rate limiter state
 * In production, use Redis for distributed rate limiting
 */
interface RateLimitState {
  count: number;
  windowStart: number;
}

const rateLimitStore = new Map<string, RateLimitState>();
const dailyRequestStore = new Map<string, { count: number; date: string }>();
const concurrentRequestStore = new Map<string, number>();

/**
 * Resource usage tracking result
 */
export interface ResourceUsage {
  type: ResourceType;
  current: number;
  limit: number;
  percentUsed: number;
  isAtLimit: boolean;
}

/**
 * Get tenant limits based on their tier/plan
 * In production, this would read from a subscription/billing table
 */
export async function getTenantLimits(
  prisma: PrismaClient,
  tenantId: string
): Promise<TenantLimits> {
  // Future: Read from tenant subscription table
  // For now, use STARTER limits for all tenants
  // In production, this would be:
  // const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  // return DEFAULT_LIMITS[tenant?.plan ?? 'FREE'];

  // Admin users get unlimited
  const user = await prisma.user.findUnique({
    where: { id: tenantId },
    select: { role: true },
  });

  if (user?.role === 'ADMIN') {
    return DEFAULT_LIMITS.UNLIMITED;
  }

  return DEFAULT_LIMITS.STARTER;
}

/**
 * Check resource usage for a tenant
 */
export async function checkResourceUsage(
  prisma: PrismaClient,
  tenantId: string,
  resourceType: ResourceType
): Promise<ResourceUsage> {
  const limits = await getTenantLimits(prisma, tenantId);
  let current = 0;
  let limit = 0;

  switch (resourceType) {
    case 'leads':
      current = await prisma.lead.count({ where: { ownerId: tenantId } });
      limit = limits.maxLeads;
      break;
    case 'contacts':
      current = await prisma.contact.count({ where: { ownerId: tenantId } });
      limit = limits.maxContacts;
      break;
    case 'accounts':
      current = await prisma.account.count({ where: { ownerId: tenantId } });
      limit = limits.maxAccounts;
      break;
    case 'opportunities':
      current = await prisma.opportunity.count({ where: { ownerId: tenantId } });
      limit = limits.maxOpportunities;
      break;
    case 'tasks':
      current = await prisma.task.count({ where: { ownerId: tenantId } });
      limit = limits.maxTasks;
      break;
    case 'ai_scores':
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      current = await prisma.aIScore.count({
        where: {
          scoredById: tenantId,
          createdAt: { gte: today },
        },
      });
      limit = limits.maxAiScoresPerDay;
      break;
    case 'api_requests_per_minute':
      current = getRateLimitCount(tenantId);
      limit = limits.apiRateLimit;
      break;
    case 'api_requests_per_day':
      current = getDailyRequestCount(tenantId);
      limit = limits.apiDailyLimit;
      break;
    case 'concurrent_requests':
      current = getConcurrentRequestCount(tenantId);
      limit = limits.maxConcurrentRequests;
      break;
    default:
      throw new Error(`Unknown resource type: ${resourceType}`);
  }

  const percentUsed = limit > 0 ? (current / limit) * 100 : 0;

  return {
    type: resourceType,
    current,
    limit,
    percentUsed,
    isAtLimit: current >= limit,
  };
}

/**
 * Enforce resource limit before creation
 */
export async function enforceResourceLimit(
  prisma: PrismaClient,
  tenantId: string,
  resourceType: ResourceType
): Promise<void> {
  const usage = await checkResourceUsage(prisma, tenantId, resourceType);

  if (usage.isAtLimit) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: `Resource limit reached for ${resourceType}. Current: ${usage.current}, Limit: ${usage.limit}`,
    });
  }
}

/**
 * Get rate limit count from in-memory store
 */
function getRateLimitCount(tenantId: string): number {
  const key = `rate:${tenantId}`;
  const state = rateLimitStore.get(key);
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute window

  if (!state || now - state.windowStart > windowMs) {
    return 0;
  }

  return state.count;
}

/**
 * Get daily request count
 */
function getDailyRequestCount(tenantId: string): number {
  const key = `daily:${tenantId}`;
  const today = new Date().toISOString().split('T')[0];
  const state = dailyRequestStore.get(key);

  if (!state || state.date !== today) {
    return 0;
  }

  return state.count;
}

/**
 * Get concurrent request count
 */
function getConcurrentRequestCount(tenantId: string): number {
  return concurrentRequestStore.get(tenantId) ?? 0;
}

/**
 * Increment rate limit counter
 */
export function incrementRateLimit(tenantId: string): void {
  const key = `rate:${tenantId}`;
  const now = Date.now();
  const windowMs = 60 * 1000;
  const state = rateLimitStore.get(key);

  if (!state || now - state.windowStart > windowMs) {
    rateLimitStore.set(key, { count: 1, windowStart: now });
  } else {
    state.count++;
  }
}

/**
 * Increment daily request counter
 */
export function incrementDailyRequests(tenantId: string): void {
  const key = `daily:${tenantId}`;
  const today = new Date().toISOString().split('T')[0];
  const state = dailyRequestStore.get(key);

  if (!state || state.date !== today) {
    dailyRequestStore.set(key, { count: 1, date: today });
  } else {
    state.count++;
  }
}

/**
 * Track concurrent request start
 */
export function trackConcurrentRequestStart(tenantId: string): void {
  const current = concurrentRequestStore.get(tenantId) ?? 0;
  concurrentRequestStore.set(tenantId, current + 1);
}

/**
 * Track concurrent request end
 */
export function trackConcurrentRequestEnd(tenantId: string): void {
  const current = concurrentRequestStore.get(tenantId) ?? 0;
  concurrentRequestStore.set(tenantId, Math.max(0, current - 1));
}

/**
 * Middleware options type for tRPC
 */
interface MiddlewareOpts<TContext> {
  ctx: TContext;
  input?: unknown;
  path: string;
  type: 'query' | 'mutation' | 'subscription';
  next: (opts?: { ctx: unknown }) => Promise<unknown>;
}

/**
 * Rate limiting middleware options
 */
interface RateLimitOptions {
  /** Skip rate limiting for admins */
  skipForAdmin?: boolean;
  /** Custom error message */
  errorMessage?: string;
}

/**
 * Create rate limiting middleware
 */
export function rateLimitMiddleware(options: RateLimitOptions = {}) {
  const { skipForAdmin = true, errorMessage } = options;

  return async ({ ctx, next }: MiddlewareOpts<TenantAwareContext>) => {
    if (!ctx.tenant) {
      return next();
    }

    // Skip for admin if configured
    if (skipForAdmin && ctx.tenant.role === 'ADMIN') {
      return next();
    }

    const tenantId = ctx.tenant.tenantId;

    // Check rate limits
    const minuteUsage = await checkResourceUsage(ctx.prisma, tenantId, 'api_requests_per_minute');
    if (minuteUsage.isAtLimit) {
      throw new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: errorMessage ?? 'Rate limit exceeded. Please try again later.',
      });
    }

    const dailyUsage = await checkResourceUsage(ctx.prisma, tenantId, 'api_requests_per_day');
    if (dailyUsage.isAtLimit) {
      throw new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: errorMessage ?? 'Daily request limit exceeded. Please try again tomorrow.',
      });
    }

    // Increment counters
    incrementRateLimit(tenantId);
    incrementDailyRequests(tenantId);

    return next();
  };
}

/**
 * Create concurrent request limiting middleware
 */
export function concurrentRequestMiddleware(options: RateLimitOptions = {}) {
  const { skipForAdmin = true, errorMessage } = options;

  return async ({ ctx, next }: MiddlewareOpts<TenantAwareContext>) => {
    if (!ctx.tenant) {
      return next();
    }

    // Skip for admin if configured
    if (skipForAdmin && ctx.tenant.role === 'ADMIN') {
      return next();
    }

    const tenantId = ctx.tenant.tenantId;

    // Check concurrent request limit
    const usage = await checkResourceUsage(ctx.prisma, tenantId, 'concurrent_requests');
    if (usage.isAtLimit) {
      throw new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: errorMessage ?? 'Too many concurrent requests. Please wait for pending requests to complete.',
      });
    }

    // Track request start
    trackConcurrentRequestStart(tenantId);

    try {
      return await next();
    } finally {
      // Always track request end
      trackConcurrentRequestEnd(tenantId);
    }
  };
}

/**
 * Resource limit enforcement middleware for create operations
 */
export function resourceLimitMiddleware(resourceType: ResourceType) {
  return async ({ ctx, next }: MiddlewareOpts<TenantAwareContext>) => {
    if (!ctx.tenant) {
      return next();
    }

    // Skip for admin
    if (ctx.tenant.role === 'ADMIN') {
      return next();
    }

    // Enforce limit
    await enforceResourceLimit(ctx.prisma, ctx.tenant.tenantId, resourceType);

    return next();
  };
}

/**
 * Get all resource usage for a tenant (for dashboard/admin view)
 */
export async function getAllResourceUsage(
  prisma: PrismaClient,
  tenantId: string
): Promise<ResourceUsage[]> {
  const resourceTypes: ResourceType[] = [
    'leads',
    'contacts',
    'accounts',
    'opportunities',
    'tasks',
    'ai_scores',
    'api_requests_per_minute',
    'api_requests_per_day',
    'concurrent_requests',
  ];

  const usages = await Promise.all(
    resourceTypes.map((type) => checkResourceUsage(prisma, tenantId, type))
  );

  return usages;
}

/**
 * Check if tenant is approaching any limits (for warnings)
 */
export async function checkApproachingLimits(
  prisma: PrismaClient,
  tenantId: string,
  warningThreshold: number = 80
): Promise<ResourceUsage[]> {
  const allUsage = await getAllResourceUsage(prisma, tenantId);
  return allUsage.filter((usage) => usage.percentUsed >= warningThreshold);
}

/**
 * Clear rate limit state (for testing)
 */
export function clearRateLimitState(): void {
  rateLimitStore.clear();
  dailyRequestStore.clear();
  concurrentRequestStore.clear();
}
