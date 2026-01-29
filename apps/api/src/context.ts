/**
 * tRPC Context
 *
 * This defines the context available to all tRPC procedures.
 * The context includes:
 * - Prisma database client (for backward compatibility and direct queries)
 * - Application services (following hexagonal architecture)
 * - User authentication info (placeholder for now)
 * - Request metadata
 */

import type { PrismaClient } from '@intelliflow/db';
import { container, type Container, apiPrisma } from './container';

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
 */
export type Services = {
  lead: Container['leadService'];
  contact: Container['contactService'];
  account: Container['accountService'];
  opportunity: Container['opportunityService'];
  task: Container['taskService'];
  ticket: Container['ticketService'];
  analytics: Container['analyticsService'];
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
 * Create context for tRPC requests
 *
 * In a real app, this would:
 * - Extract auth token from headers
 * - Validate JWT/session
 * - Fetch user from database
 * - Handle rate limiting
 *
 * For now, we use a mock user for development
 */
export const createContext = async (opts?: { req?: Request; res?: Response }): Promise<BaseContext> => {
  // TODO: Extract user from auth token/session
  // For development, we'll use a mock user matching the seeded data
  // Note: These IDs match the actual database (Supabase cloud)
  // Using sarahJohnson because she owns leads in the seed data
  const mockUser: UserSession = {
    userId: '00000000-0000-4000-8000-000000000013',  // Sarah Johnson from database
    email: 'sarah.johnson@intelliflow.dev',
    role: 'SALES_REP',
    tenantId: '00000000-0000-4000-8000-000000000001',  // Default tenant from database
  };

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
    },
    // Security services (IFC-098, IFC-113, IFC-127)
    security: container.security,
    // Adapters for direct access when needed
    adapters: container.adapters,
    // User session
    user: mockUser,
    req: opts?.req,
    res: opts?.res,
  };
};
