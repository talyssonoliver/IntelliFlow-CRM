/**
 * Dependency Injection Container
 *
 * Creates and wires up all services with their dependencies following
 * hexagonal architecture. Services depend on ports (interfaces), and
 * this container provides concrete adapter implementations.
 */

import { PrismaClient } from '@intelliflow/db';
import {
  PrismaLeadRepository,
  PrismaContactRepository,
  PrismaAccountRepository,
  PrismaOpportunityRepository,
  PrismaTaskRepository,
  InMemoryEventBus,
  MockAIService,
  InMemoryCache,
} from '@intelliflow/adapters';
import {
  LeadService,
  ContactService,
  AccountService,
  OpportunityService,
  TaskService,
  TicketService,
  AnalyticsService,
} from '@intelliflow/application';
import {
  getAuditLogger,
  getRBACService,
  getEncryptionService,
  getKeyRotationService,
  getAuditEventHandler,
} from './security';

/**
 * Create a fresh Prisma client for the API
 * This bypasses the global singleton to avoid caching issues during development
 * (especially when RLS settings change)
 */
const createFreshPrismaClient = () => {
  const client = new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
    log:
      process.env.NODE_ENV === 'development'
        ? [
            { emit: 'event', level: 'query' },
            { emit: 'stdout', level: 'error' },
            { emit: 'stdout', level: 'warn' },
          ]
        : [{ emit: 'stdout', level: 'error' }],
  });
  return client;
};

/**
 * Lazy-initialized Prisma client
 * Created on first access to avoid blocking module initialization
 */
let _apiPrisma: PrismaClient | null = null;

/**
 * Get the API Prisma client (creates on first access)
 */
export const getApiPrisma = (): PrismaClient => {
  if (!_apiPrisma) {
    _apiPrisma = createFreshPrismaClient();
  }
  return _apiPrisma;
};

/**
 * Direct export for backward compatibility
 * Note: This triggers lazy initialization on first import
 */
export const apiPrisma = getApiPrisma();

/**
 * Create singleton instances of adapters
 * @param prismaClient - Prisma client instance to use for repositories
 */
const createAdapters = (prismaClient: PrismaClient) => {
  // Repositories (Prisma implementations)
  const leadRepository = new PrismaLeadRepository(prismaClient);
  const contactRepository = new PrismaContactRepository(prismaClient);
  const accountRepository = new PrismaAccountRepository(prismaClient);
  const opportunityRepository = new PrismaOpportunityRepository(prismaClient);
  const taskRepository = new PrismaTaskRepository(prismaClient);

  // External services
  const eventBus = new InMemoryEventBus();
  const aiService = new MockAIService();
  const cache = new InMemoryCache();

  return {
    leadRepository,
    contactRepository,
    accountRepository,
    opportunityRepository,
    taskRepository,
    eventBus,
    aiService,
    cache,
  };
};

/**
 * Create singleton instances of security services
 * IFC-098: RBAC/ABAC & Audit Trail
 * IFC-113: Secrets Management & Encryption
 * IFC-127: Tenant Isolation
 * @param prismaClient - Prisma client instance to use for security services
 */
const createSecurityServices = (prismaClient: PrismaClient) => {
  // IFC-098: Audit logger and RBAC
  const auditLogger = getAuditLogger(prismaClient);
  const rbacService = getRBACService(prismaClient);

  // IFC-113: Encryption and key rotation
  const encryptionService = getEncryptionService();
  const keyRotationService = getKeyRotationService();

  // IFC-098: Audit event handler (connects domain events to audit logs)
  const auditEventHandler = getAuditEventHandler(prismaClient);

  return {
    auditLogger,
    rbacService,
    encryptionService,
    keyRotationService,
    auditEventHandler,
  };
};

/**
 * Create application services with injected dependencies
 * @param prismaClient - Prisma client instance to use for all services
 */
const createServices = (prismaClient: PrismaClient) => {
  const adapters = createAdapters(prismaClient);
  const security = createSecurityServices(prismaClient);

  const leadService = new LeadService(
    adapters.leadRepository,
    adapters.contactRepository,
    adapters.accountRepository,
    adapters.aiService,
    adapters.eventBus
  );

  const contactService = new ContactService(
    adapters.contactRepository,
    adapters.accountRepository,
    adapters.eventBus
  );

  const accountService = new AccountService(
    adapters.accountRepository,
    adapters.contactRepository,
    adapters.opportunityRepository,
    adapters.eventBus
  );

  const opportunityService = new OpportunityService(
    adapters.opportunityRepository,
    adapters.accountRepository,
    adapters.contactRepository,
    adapters.eventBus
  );

  const taskService = new TaskService(
    adapters.taskRepository,
    adapters.leadRepository,
    adapters.contactRepository,
    adapters.opportunityRepository,
    adapters.eventBus
  );

  const ticketService = new TicketService(prismaClient);

  const analyticsService = new AnalyticsService(prismaClient);

  return {
    leadService,
    contactService,
    accountService,
    opportunityService,
    taskService,
    ticketService,
    analyticsService,
    // Security services (IFC-098, IFC-113, IFC-127)
    security,
    // Also expose adapters for direct access when needed
    adapters,
  };
};

/**
 * Singleton container instance
 * Services are created once with a fresh Prisma client and reused across all requests
 */
const containerBase = createServices(apiPrisma);

/**
 * Container with get() method for dynamic service lookup
 */
export const container = {
  ...containerBase,
  /**
   * Get a service by name (for services not yet in the container)
   * @param serviceName - Name of the service to retrieve
   * @returns The service instance or throws if not found
   */
  get<T = any>(serviceName: string): T {
    // Check if service exists in container
    const service = (containerBase as any)[serviceName];
    if (service) {
      return service as T;
    }

    // Service not found - throw error with helpful message
    throw new Error(
      `Service '${serviceName}' not found in container. ` +
      `Available services: ${Object.keys(containerBase).join(', ')}`
    );
  },
};

/**
 * Type for the container
 */
export type Container = typeof container;
