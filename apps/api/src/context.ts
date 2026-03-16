/**
 * tRPC Context
 *
 * This defines the context available to all tRPC procedures.
 * The context includes:
 * - Prisma database client (for backward compatibility and direct queries)
 * - Application services (following hexagonal architecture)
 * - User authentication info (extracted from JWT token)
 * - Request metadata
 *
 * IFC-007: Fixed to extract and verify JWT tokens from Authorization header
 */

import type { PrismaClient } from '@intelliflow/db';
import { container, type Container, apiPrisma } from './container';
import { verifyToken } from './lib/supabase';

/**
 * User session interface (will be replaced with actual auth implementation)
 */
export interface UserSession {
  userId: string;
  email: string;
  name?: string;
  role: string;
  tenantId: string;
  stripeCustomerId?: string;
  timezone?: string;
}

/**
 * Services type from container
 * Note: Some services (experiment, feedback) are optional
 * as they are planned for future implementation
 */
export type Services = {
  lead: Container['leadService'];
  contact: Container['contactService'];
  account: Container['accountService'];
  opportunity: Container['opportunityService'];
  task: Container['taskService'];
  ticket: Container['ticketService'];
  ticketRouting: Container['ticketRoutingService'];
  leadRouting: Container['leadRoutingService'];
  analytics: Container['analyticsService'];
  chainVersion: Container['chainVersionService'];
  convertLeadToDeal: Container['convertLeadToDealUseCase'];
  closeDealWon: Container['closeDealWonUseCase'];
  closeDealLost: Container['closeDealLostUseCase'];
  feedbackSurvey: Container['feedbackSurveyService'];
  // IFC-025: Experiment Service
  experiment: Container['experimentService'];
  // IFC-157: Notification Orchestrator (unified service with preferences + audit)
  notificationOrchestrator: Container['notificationOrchestrator'];
  // IFC-297: AI Monitoring persistence service
  aiMonitoringService: Container['aiMonitoringService'];
  // Optional future services
  feedback?: unknown;
};

/**
 * Security services type from container
 * IFC-098: RBAC/ABAC & Audit Trail
 * IFC-113: Secrets Management & Encryption
 * IFC-127: Tenant Isolation
 */
export type SecurityServices = Container['security'];

/**
 * Adapters type from container
 */
export type Adapters = Container['adapters'];

/**
 * Base context interface for production use
 */
export interface BaseContext {
  prisma: PrismaClient;
  container: Container;
  services: Services;
  security: SecurityServices;
  adapters: Adapters;
  user: UserSession | null | undefined;
  req?: Request;
  res?: Response;
  [key: string]: unknown;
}

/**
 * Context type for routers - uses Partial to allow testing flexibility
 * In production, createContext always provides full context
 * In tests, services/adapters/security can be omitted for backward compatibility
 *
 * Note: When using services in routers, check for their existence first
 * or use the full BaseContext type when you need guaranteed access.
 */
export interface Context {
  prisma: PrismaClient;
  container?: Container;
  services?: Partial<Services>;
  security?: Partial<SecurityServices>;
  adapters?: Partial<Adapters>;
  user: UserSession | null | undefined;
  req?: Request;
  res?: Response;
  [key: string]: unknown;
}

/**
 * Extract Bearer token from Authorization header
 */
function extractBearerToken(req?: Request): string | null {
  if (!req) return null;

  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
  if (!authHeader) return null;

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') return null;

  return parts[1];
}

/**
 * Default fallback user for development when no valid token is provided
 * Uses Sarah Johnson from seed data
 */
const FALLBACK_USER: UserSession = {
  userId: '00000000-0000-4000-8000-000000000103', // Sarah Johnson from SEED_IDS.users.sarahJohnson
  email: 'sarah.johnson@intelliflow.dev',
  name: 'Sarah Johnson',
  role: 'SALES_REP',
  tenantId: '00000000-0000-4000-8000-000000000001', // Default tenant from database
};

/**
 * Dev-only escape hatch for local diagnostics.
 *
 * Disabled by default because it bypasses real authentication and can expose
 * tenant-scoped data in the UI when route guards are missing.
 */
function isDevAuthFallbackEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEV_AUTH_FALLBACK === 'true';
}

/**
 * Create context for tRPC requests
 *
 * IFC-007: Now properly extracts and verifies JWT tokens from Authorization header
 *
 * Flow:
 * 1. Extract Bearer token from Authorization header
 * 2. Verify token with Supabase Auth
 * 3. Look up user in database to get role and tenant
 * 4. Return authenticated user session
 *
 * Falls back to mock user only when explicitly enabled for development diagnostics
 */
/**
 * Build the shared services object from the container
 */
function buildServicesFromContainer(): Services {
  return {
    lead: container.leadService,
    contact: container.contactService,
    account: container.accountService,
    opportunity: container.opportunityService,
    task: container.taskService,
    ticket: container.ticketService,
    ticketRouting: container.ticketRoutingService,
    leadRouting: container.leadRoutingService,
    analytics: container.analyticsService,
    chainVersion: container.chainVersionService,
    convertLeadToDeal: container.convertLeadToDealUseCase,
    closeDealWon: container.closeDealWonUseCase,
    closeDealLost: container.closeDealLostUseCase,
    feedbackSurvey: container.feedbackSurveyService,
    experiment: container.experimentService,
    notificationOrchestrator: container.notificationOrchestrator,
    aiMonitoringService: container.aiMonitoringService,
  };
}

/**
 * Attempt to resolve a UserSession from a verified Supabase user ID.
 * Returns null when the DB user does not exist.
 */
async function resolveDbUser(supabaseId: string): Promise<UserSession | null> {
  const dbUser = await apiPrisma.user.findUnique({
    where: { id: supabaseId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      tenantId: true,
      stripeCustomerId: true,
      timezone: true,
    },
  });

  if (!dbUser) return null;

  return {
    userId: dbUser.id,
    email: dbUser.email,
    name: dbUser.name ?? undefined,
    role: dbUser.role,
    tenantId: dbUser.tenantId,
    stripeCustomerId: dbUser.stripeCustomerId ?? undefined,
    timezone: dbUser.timezone ?? 'UTC',
  };
}

/**
 * Auto-provision a new user (JIT — Just In Time user creation for OAuth).
 * Returns a minimal UserSession on failure.
 */
function extractUserName(
  meta: Record<string, unknown>,
  email: string | undefined
): string {
  return (
    (meta.name as string | undefined) ||
    (meta.full_name as string | undefined) ||
    email?.split('@')[0] ||
    'User'
  );
}

function extractAvatarUrl(meta: Record<string, unknown>): string | null {
  return (meta.avatar_url as string | undefined) || (meta.picture as string | undefined) || null;
}

async function provisionNewUser(supabaseUser: {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}): Promise<UserSession> {
  try {
    let defaultTenant = await apiPrisma.tenant.findUnique({ where: { slug: 'default' } });

    if (!defaultTenant) {
      console.log('[Auth] Creating default tenant...');
      defaultTenant = await apiPrisma.tenant.create({
        data: { name: 'Default Organization', slug: 'default', status: 'ACTIVE' },
      });
    }

    const meta = supabaseUser.user_metadata ?? {};
    const userName = extractUserName(meta, supabaseUser.email);
    const avatarUrl = extractAvatarUrl(meta);

    const newUser = await apiPrisma.user.create({
      data: {
        id: supabaseUser.id,
        email: supabaseUser.email || '',
        name: userName,
        avatarUrl,
        role: 'USER',
        tenantId: defaultTenant.id,
      },
    });

    console.log('[Auth] Auto-provisioned new user:', {
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
      tenantId: newUser.tenantId,
    });

    return {
      userId: newUser.id,
      email: newUser.email,
      name: newUser.name ?? undefined,
      role: newUser.role,
      tenantId: newUser.tenantId,
    };
  } catch (provisionError) {
    console.error('[Auth] Failed to auto-provision user:', provisionError);
    return {
      userId: supabaseUser.id,
      email: supabaseUser.email || '',
      role: 'USER',
      tenantId: '', // Will fail tenant isolation
    };
  }
}

/**
 * Resolve a UserSession from a raw JWT token.
 * Returns null when the token is invalid or the Supabase user cannot be verified.
 */
async function resolveUserFromToken(token: string): Promise<UserSession | null> {
  const { user: supabaseUser, error } = await verifyToken(token);

  if (error) {
    console.warn('[Auth] Token verification failed:', error.message);
    return null;
  }

  if (!supabaseUser) return null;

  const existing = await resolveDbUser(supabaseUser.id);
  if (existing) return existing;

  // User exists in Supabase Auth but not in DB — auto-provision (JIT for OAuth)
  console.log('[Auth] User not found in database, auto-provisioning:', supabaseUser.id);
  return provisionNewUser(supabaseUser);
}

/**
 * Extract a raw bearer token from an Authorization header string.
 * Returns null if the header is absent or not a valid Bearer scheme.
 */
function extractWsBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') return null;
  return parts[1] ?? null;
}

/**
 * Resolve a UserSession for a WebSocket connection from a raw JWT.
 * Returns null when the token is invalid or the DB user is absent.
 */
async function resolveWsUser(token: string): Promise<UserSession | null> {
  const { user: supabaseUser, error } = await verifyToken(token);
  if (error || !supabaseUser) return null;

  const dbUser = await apiPrisma.user.findUnique({
    where: { id: supabaseUser.id },
    select: { id: true, email: true, name: true, role: true, tenantId: true, timezone: true },
  });

  if (!dbUser) return null;

  return {
    userId: dbUser.id,
    email: dbUser.email,
    name: dbUser.name ?? undefined,
    role: dbUser.role,
    tenantId: dbUser.tenantId,
    timezone: dbUser.timezone ?? 'UTC',
  };
}

/**
 * Create context for WebSocket connections
 *
 * Simplified context creation that takes auth header directly,
 * avoiding the need to convert IncomingMessage to Request.
 */
export const createWSContext = async (authHeader?: string): Promise<BaseContext> => {
  let user: UserSession | null = null;
  const hadBearerToken = Boolean(authHeader?.startsWith('Bearer '));
  const token = extractWsBearerToken(authHeader);

  if (token) {
    try {
      user = await resolveWsUser(token);
    } catch (err) {
      console.error('[WS Auth] Error verifying token:', err);
    }
  }

  // Explicit opt-in only: never auto-authenticate by default in development.
  if (!user && !hadBearerToken && isDevAuthFallbackEnabled()) {
    user = FALLBACK_USER;
  }

  return {
    prisma: apiPrisma,
    container,
    services: buildServicesFromContainer(),
    security: container.security,
    adapters: container.adapters,
    user,
  };
};

export const createContext = async (opts?: {
  req?: Request;
  res?: Response;
}): Promise<BaseContext> => {
  let user: UserSession | null = null;
  const hadBearerToken = Boolean(opts?.req && extractBearerToken(opts?.req));

  // Extract and verify token from Authorization header
  const token = extractBearerToken(opts?.req);

  if (token) {
    try {
      user = await resolveUserFromToken(token);
    } catch (err) {
      console.error('[Auth] Error verifying token:', err);
    }
  }

  // Explicit opt-in only: never auto-authenticate by default in development.
  if (!user && !hadBearerToken && isDevAuthFallbackEnabled()) {
    user = FALLBACK_USER;
  }

  return {
    // Database client (for backward compatibility and complex queries)
    // Uses same fresh instance as container to avoid multiple connections
    prisma: apiPrisma,
    // Dependency injection container (for advanced use cases)
    container,
    // Application services (hexagonal architecture)
    services: buildServicesFromContainer(),
    // Security services (IFC-098, IFC-113, IFC-127)
    security: container.security,
    // Adapters for direct access when needed
    adapters: container.adapters,
    // User session (null in production if no valid token)
    user,
    req: opts?.req,
    res: opts?.res,
  };
};
