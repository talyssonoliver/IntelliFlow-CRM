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
  analytics: Container['analyticsService'];
  chainVersion: Container['chainVersionService'];
  convertLeadToDeal: Container['convertLeadToDealUseCase'];
  closeDealWon: Container['closeDealWonUseCase'];
  feedbackSurvey: Container['feedbackSurveyService'];
  // Optional future services - not yet implemented in container
  experiment?: unknown;
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
  if (!req) {
    console.log('[Auth] No request object provided');
    return null;
  }

  // Debug: Log all headers to see what we're receiving
  if (process.env.NODE_ENV !== 'production') {
    const headersList: string[] = [];
    req.headers.forEach((value, key) => {
      // Don't log sensitive header values, just the key
      if (key.toLowerCase() === 'authorization') {
        headersList.push(`${key}: Bearer ***`);
      } else {
        headersList.push(`${key}: ${value.substring(0, 50)}...`);
      }
    });
    console.log('[Auth] Request headers:', headersList.join(', '));
  }

  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
  if (!authHeader) {
    console.log('[Auth] No Authorization header found');
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    console.log('[Auth] Invalid Authorization header format');
    return null;
  }

  console.log('[Auth] Token extracted successfully');
  return parts[1];
}

/**
 * Default fallback user for development when no valid token is provided
 * Uses Sarah Johnson from seed data
 */
const FALLBACK_USER: UserSession = {
  userId: '00000000-0000-4000-8000-000000000103', // Sarah Johnson from SEED_IDS.users.sarahJohnson
  email: 'sarah.johnson@intelliflow.dev',
  role: 'SALES_REP',
  tenantId: '00000000-0000-4000-8000-000000000001', // Default tenant from database
};

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
 * Falls back to mock user in development if no valid token is provided
 */
/**
 * Create context for WebSocket connections
 *
 * Simplified context creation that takes auth header directly,
 * avoiding the need to convert IncomingMessage to Request.
 */
export const createWSContext = async (authHeader?: string): Promise<BaseContext> => {
  let user: UserSession | null = null;
  const hadBearerToken = Boolean(authHeader?.startsWith('Bearer '));

  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      const token = parts[1];
      try {
        const { user: supabaseUser, error } = await verifyToken(token);

        if (!error && supabaseUser) {
          const dbUser = await apiPrisma.user.findUnique({
            where: { id: supabaseUser.id },
            select: { id: true, email: true, name: true, role: true, tenantId: true },
          });

          if (dbUser) {
            user = {
              userId: dbUser.id,
              email: dbUser.email,
              name: dbUser.name ?? undefined,
              role: dbUser.role,
              tenantId: dbUser.tenantId,
            };
          }
        }
      } catch (err) {
        console.error('[WS Auth] Error verifying token:', err);
      }
    }
  }

  // Fall back to mock user in development
  if (!user && !hadBearerToken && process.env.NODE_ENV !== 'production') {
    user = FALLBACK_USER;
  }

  return {
    prisma: apiPrisma,
    container,
    services: {
      lead: container.leadService,
      contact: container.contactService,
      account: container.accountService,
      opportunity: container.opportunityService,
      task: container.taskService,
      ticket: container.ticketService,
      analytics: container.analyticsService,
      chainVersion: container.chainVersionService,
      convertLeadToDeal: container.convertLeadToDealUseCase,
      closeDealWon: container.closeDealWonUseCase,
      feedbackSurvey: container.feedbackSurveyService,
    },
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

  // Extract token from Authorization header
  const token = extractBearerToken(opts?.req);

  if (token) {
    try {
      // Verify token with Supabase
      const { user: supabaseUser, error } = await verifyToken(token);

      if (error) {
        console.warn('[Auth] Token verification failed:', error.message);
      } else if (supabaseUser) {
        // Look up user in database to get role and tenant
        const dbUser = await apiPrisma.user.findUnique({
          where: { id: supabaseUser.id },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            tenantId: true,
            stripeCustomerId: true,
          },
        });

        if (dbUser) {
          user = {
            userId: dbUser.id,
            email: dbUser.email,
            name: dbUser.name ?? undefined,
            role: dbUser.role,
            tenantId: dbUser.tenantId,
            stripeCustomerId: dbUser.stripeCustomerId ?? undefined,
          };
        } else {
          // User exists in Supabase Auth but not in database
          // Auto-provision the user (JIT - Just In Time user creation for OAuth)
          console.log('[Auth] User not found in database, auto-provisioning:', supabaseUser.id);

          try {
            // Get or create the default tenant
            let defaultTenant = await apiPrisma.tenant.findUnique({
              where: { slug: 'default' },
            });

            if (!defaultTenant) {
              console.log('[Auth] Creating default tenant...');
              defaultTenant = await apiPrisma.tenant.create({
                data: {
                  name: 'Default Organization',
                  slug: 'default',
                  status: 'ACTIVE',
                },
              });
            }

            // Extract name from user metadata
            const userName =
              supabaseUser.user_metadata?.name ||
              supabaseUser.user_metadata?.full_name ||
              supabaseUser.email?.split('@')[0] ||
              'User';

            // Extract avatar URL
            const avatarUrl =
              supabaseUser.user_metadata?.avatar_url || supabaseUser.user_metadata?.picture || null;

            // Create the user in the database
            const newUser = await apiPrisma.user.create({
              data: {
                id: supabaseUser.id, // Use Supabase Auth ID
                email: supabaseUser.email || '',
                name: userName,
                avatarUrl: avatarUrl,
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

            user = {
              userId: newUser.id,
              email: newUser.email,
              name: newUser.name ?? undefined,
              role: newUser.role,
              tenantId: newUser.tenantId,
            };
          } catch (provisionError) {
            console.error('[Auth] Failed to auto-provision user:', provisionError);
            // Fall back to minimal session
            user = {
              userId: supabaseUser.id,
              email: supabaseUser.email || '',
              role: 'USER',
              tenantId: '', // Will fail tenant isolation
            };
          }
        }
      }
    } catch (err) {
      console.error('[Auth] Error verifying token:', err);
    }
  }

  // Fall back to mock user only when no bearer was provided (dev convenience)
  if (!user && !hadBearerToken && process.env.NODE_ENV !== 'production') {
    user = FALLBACK_USER;
  }

  return {
    // Database client (for backward compatibility and complex queries)
    // Uses same fresh instance as container to avoid multiple connections
    prisma: apiPrisma,
    // Dependency injection container (for advanced use cases)
    container,
    // Application services (hexagonal architecture)
    services: {
      lead: container.leadService,
      contact: container.contactService,
      account: container.accountService,
      opportunity: container.opportunityService,
      task: container.taskService,
      ticket: container.ticketService,
      analytics: container.analyticsService,
      chainVersion: container.chainVersionService,
      convertLeadToDeal: container.convertLeadToDealUseCase,
      closeDealWon: container.closeDealWonUseCase,
      feedbackSurvey: container.feedbackSurveyService,
    },
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
