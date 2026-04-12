/**
 * Integration Test Setup
 *
 * Provides test utilities for integration tests that use real seeded database:
 * - Real Prisma client connected to test database
 * - Access to SEED_IDS for querying seed data
 * - Test context creation with real services
 * - Database reset utilities
 *
 * IMPORTANT: This module is designed to gracefully handle missing infrastructure:
 * - If @prisma/client is not generated, tests skip with clear warning
 * - If DATABASE_URL is not set, tests skip with clear warning
 * - Coverage is not affected by skipped infrastructure tests
 */

import { beforeAll, afterAll } from 'vitest';
import type { BaseContext } from '../context';
import type { TenantContext } from '../security/tenant-context';
import { TicketService } from '../services/TicketService';
import { AnalyticsAggregationService } from '@intelliflow/application';
import { PrismaAnalyticsRepository } from '@intelliflow/adapters';

/**
 * Infrastructure availability flag
 * Set to false if Prisma client cannot be loaded
 */
let _isInfrastructureAvailable = false;
export function isInfrastructureAvailable(): boolean {
  return _isInfrastructureAvailable;
}

/**
 * Reason for infrastructure unavailability (for alerts)
 */
let _infrastructureUnavailableReason = '';
export function getInfrastructureUnavailableReason(): string {
  return _infrastructureUnavailableReason;
}

/**
 * Real Prisma client for integration tests (may be null if unavailable)
 * Connected to test database
 */
let _testPrisma: any = null;
export function getTestPrisma(): any {
  return _testPrisma;
}

// Lazy-loaded services and adapters
let _testServices: any = null;
let _testAdapters: any;

/**
 * Alert banner for skipped infrastructure tests
 * Displayed once per test run
 */
let alertDisplayed = false;

function displayInfrastructureAlert(reason: string): void {
  if (alertDisplayed) return;
  alertDisplayed = true;

  console.log('\n' + '='.repeat(80));
  console.log('⚠️  INFRASTRUCTURE TESTS SKIPPED');
  console.log('='.repeat(80));
  console.log(`Reason: ${reason}`);
  console.log('');
  console.log('To run integration tests:');
  console.log('  1. Generate Prisma client: pnpm run db:generate');
  console.log('  2. Start PostgreSQL: docker-compose up -d postgres-test');
  console.log('  3. Set DATABASE_URL environment variable');
  console.log('');
  console.log('Coverage is NOT affected by skipped infrastructure tests.');
  console.log('='.repeat(80) + '\n');
}

// Try to initialize Prisma and related services
try {
  // Check if DATABASE_URL is set first
  if (process.env.DATABASE_URL) {
    // Dynamic require to catch module not found errors
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaClient } = require('@prisma/client'); // NOSONAR
    _testPrisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
    });

    // Try to load adapters and application services
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const application = require('@intelliflow/application'); // NOSONAR
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const adapters = require('@intelliflow/adapters'); // NOSONAR

    // Services are imported at the top of the file

    // Create adapters
    _testAdapters = {
      leadRepository: new adapters.PrismaLeadRepository(_testPrisma),
      contactRepository: new adapters.PrismaContactRepository(_testPrisma),
      accountRepository: new adapters.PrismaAccountRepository(_testPrisma),
      opportunityRepository: new adapters.PrismaOpportunityRepository(_testPrisma),
      taskRepository: new adapters.PrismaTaskRepository(_testPrisma),
      eventBus: new adapters.InMemoryEventBus(),
      aiService: new adapters.MockAIService(),
    };

    // Create services
    _testServices = {
      lead: new application.LeadService(
        _testAdapters.leadRepository,
        _testAdapters.contactRepository,
        _testAdapters.accountRepository,
        _testAdapters.aiService,
        _testAdapters.eventBus
      ),
      contact: new application.ContactService(
        _testAdapters.contactRepository,
        _testAdapters.accountRepository,
        _testAdapters.eventBus
      ),
      account: new application.AccountService(
        _testAdapters.accountRepository,
        _testAdapters.contactRepository,
        _testAdapters.opportunityRepository,
        _testAdapters.eventBus
      ),
      opportunity: new application.OpportunityService(
        _testAdapters.opportunityRepository,
        _testAdapters.accountRepository,
        _testAdapters.contactRepository,
        _testAdapters.eventBus
      ),
      task: new application.TaskService(
        _testAdapters.taskRepository,
        _testAdapters.leadRepository,
        _testAdapters.contactRepository,
        _testAdapters.opportunityRepository,
        _testAdapters.eventBus
      ),
      ticket: new TicketService(_testPrisma),
      analytics: new AnalyticsAggregationService(new PrismaAnalyticsRepository(_testPrisma)),
    };

    _isInfrastructureAvailable = true;
  } else {
    _infrastructureUnavailableReason = 'DATABASE_URL environment variable not set';
    displayInfrastructureAlert(_infrastructureUnavailableReason);
  }
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  if (errorMessage.includes('Cannot find module') && errorMessage.includes('@prisma/client')) {
    _infrastructureUnavailableReason = '@prisma/client not generated. Run: pnpm run db:generate';
  } else if (errorMessage.includes('Cannot find module')) {
    _infrastructureUnavailableReason = `Missing module: ${errorMessage}`;
  } else {
    _infrastructureUnavailableReason = `Infrastructure initialization failed: ${errorMessage}`;
  }
  displayInfrastructureAlert(_infrastructureUnavailableReason);
}

/**
 * SEED_IDS - Imported from single source of truth
 * @see packages/db/src/seed-ids.ts
 * These are always available regardless of infrastructure state
 */
import { SEED_IDS } from '@intelliflow/db/seed-ids'; // NOSONAR typescript:S7763 — re-export via import/export required here due to module ordering constraints
export { SEED_IDS };

/**
 * Real services for integration tests (lazy-loaded)
 * These use the real Prisma client and test against actual database
 * Returns null if infrastructure is not available
 */
export const testServices = _testServices;

/**
 * Get default tenant ID from seeded data
 * Throws if infrastructure not available
 */
export async function getDefaultTenantId(): Promise<string> {
  if (!_isInfrastructureAvailable || !_testPrisma) {
    throw new Error(`Infrastructure not available: ${_infrastructureUnavailableReason}`);
  }

  const tenant = await _testPrisma.tenant.findUnique({
    where: { slug: 'default' },
  });

  if (!tenant) {
    throw new Error('Default tenant not found in test database. Did you run seed?');
  }

  return tenant.id;
}

/**
 * Create integration test context with real database and services
 * Throws if infrastructure not available
 */
export async function createIntegrationTestContext(
  overrides?: Partial<BaseContext>
): Promise<BaseContext & { tenant: TenantContext; prismaWithTenant: any }> {
  if (!_isInfrastructureAvailable) {
    throw new Error(`Infrastructure not available: ${_infrastructureUnavailableReason}`);
  }

  const tenantId = await getDefaultTenantId();
  const userId = SEED_IDS.users.sarahJohnson;

  // Create TenantContext required by tenant-aware procedures
  const tenantContext: TenantContext = {
    tenantId,
    tenantType: 'user',
    userId,
    role: 'SALES_REP',
    canAccessAllTenantData: false,
  };

  const defaultContext: BaseContext & { tenant: TenantContext; prismaWithTenant: any } = {
    prisma: _testPrisma,
    prismaWithTenant: _testPrisma, // For integration tests, use the same client
    tenant: tenantContext, // Required by lead router and other tenant-aware procedures
    container: {} as any, // Mock container for integration tests
    services: testServices,
    security: {
      auditLogger: {} as any, // Mock security services for now
      rbacService: {} as any,
      encryptionService: {} as any,
      keyRotationService: {} as any,
      auditEventHandler: {} as any,
    },
    adapters: {} as any, // Mock adapters for now
    user: {
      userId,
      email: 'sarah.johnson@intelliflow.dev',
      role: 'SALES_REP',
      tenantId,
    },
    req: undefined,
    res: undefined,
  };

  return { ...defaultContext, ...overrides };
}

/**
 * Create admin context for testing admin procedures
 * Throws if infrastructure not available
 */
export async function createIntegrationAdminContext(
  overrides?: Partial<BaseContext>
): Promise<BaseContext & { tenant: TenantContext; prismaWithTenant: any }> {
  if (!_isInfrastructureAvailable) {
    throw new Error(`Infrastructure not available: ${_infrastructureUnavailableReason}`);
  }

  const tenantId = await getDefaultTenantId();
  const adminTenant: TenantContext = {
    tenantId,
    tenantType: 'user',
    userId: SEED_IDS.users.admin,
    role: 'ADMIN',
    canAccessAllTenantData: true,
  };

  return createIntegrationTestContext({
    tenant: adminTenant,
    user: {
      userId: SEED_IDS.users.admin,
      email: 'admin@intelliflow.dev',
      role: 'ADMIN',
      tenantId,
    },
    ...overrides,
  } as any);
}

/**
 * Track if database connection has been verified
 */
let isDatabaseConnectionVerified: boolean | null = null;

/**
 * Check database availability once (cached result)
 * Returns true if database is reachable, false otherwise
 */
async function checkDatabaseOnce(): Promise<boolean> {
  if (!_isInfrastructureAvailable || !_testPrisma) {
    return false;
  }

  if (isDatabaseConnectionVerified !== null) {
    return isDatabaseConnectionVerified;
  }

  try {
    await _testPrisma.$connect();
    isDatabaseConnectionVerified = true;
    return true;
  } catch (error) {
    isDatabaseConnectionVerified = false;
    displayInfrastructureAlert(
      `Database connection failed: ${error instanceof Error ? error.message : String(error)}`
    );
    return false;
  }
}

/**
 * Connect to database before all tests
 * If database is unavailable, logs warning but doesn't throw
 */
beforeAll(async () => {
  if (_isInfrastructureAvailable) {
    await checkDatabaseOnce();
  }
});

/**
 * Disconnect from database after all tests
 */
afterAll(async () => {
  if (isDatabaseConnectionVerified === true && _testPrisma) {
    await _testPrisma.$disconnect();
  }
});

/**
 * Check if database is available (sync version for describe.skipIf)
 * Returns false if infrastructure or database not available
 */
export function isDatabaseReady(): boolean {
  return _isInfrastructureAvailable && isDatabaseConnectionVerified === true;
}

/**
 * Check if database is available for integration tests
 * Use this in beforeAll to skip tests when DB is unavailable
 */
export async function requireDatabase(): Promise<void> {
  if (!_isInfrastructureAvailable) {
    throw new Error(`SKIP: ${_infrastructureUnavailableReason}`);
  }

  const available = await checkDatabaseOnce();
  if (!available) {
    throw new Error(
      'SKIP: Database not available for integration tests. ' +
        'Start the test database with: docker-compose up -d postgres-test'
    );
  }
}

/**
 * Helper to verify seed data exists
 * Call this in beforeAll of your test file to ensure seed ran
 * Throws if database is not available (to skip tests)
 */
export async function verifySeedData(): Promise<void> {
  // First check if infrastructure and database are available
  await requireDatabase();

  const leadCount = await _testPrisma.lead.count();
  const contactCount = await _testPrisma.contact.count();
  const accountCount = await _testPrisma.account.count();

  if (leadCount === 0 || contactCount === 0 || accountCount === 0) {
    throw new Error('No seed data found in test database. Run: pnpm --filter @intelliflow/db seed');
  }
}

/**
 * Helper to check infrastructure before query
 */
function requireInfra(): void {
  if (!_isInfrastructureAvailable || !_testPrisma) {
    throw new Error(`Infrastructure not available: ${_infrastructureUnavailableReason}`);
  }
}

/**
 * Helper functions to get seeded entities
 * All methods throw if infrastructure is not available
 */
export const getSeedData = {
  /**
   * Get a seeded lead by its seed ID
   */
  async lead(seedId: string) {
    requireInfra();
    const lead = await _testPrisma.lead.findUnique({
      where: { id: seedId },
      include: {
        owner: true,
        contact: true,
      },
    });

    if (!lead) {
      throw new Error(`Lead ${seedId} not found in seed data`);
    }

    return lead;
  },

  /**
   * Get a seeded contact by its seed ID
   */
  async contact(seedId: string) {
    requireInfra();
    const contact = await _testPrisma.contact.findUnique({
      where: { id: seedId },
      include: {
        owner: true,
        account: true,
      },
    });

    if (!contact) {
      throw new Error(`Contact ${seedId} not found in seed data`);
    }

    return contact;
  },

  /**
   * Get a seeded account by its seed ID
   */
  async account(seedId: string) {
    requireInfra();
    const account = await _testPrisma.account.findUnique({
      where: { id: seedId },
      include: {
        owner: true,
        _count: {
          select: {
            contacts: true,
            opportunities: true,
          },
        },
      },
    });

    if (!account) {
      throw new Error(`Account ${seedId} not found in seed data`);
    }

    return account;
  },

  /**
   * Get a seeded opportunity by its seed ID
   */
  async opportunity(seedId: string) {
    requireInfra();
    const opportunity = await _testPrisma.opportunity.findUnique({
      where: { id: seedId },
      include: {
        account: true,
        contact: true,
        owner: true,
      },
    });

    if (!opportunity) {
      throw new Error(`Opportunity ${seedId} not found in seed data`);
    }

    return opportunity;
  },

  /**
   * Get a seeded task by its seed ID
   */
  async task(seedId: string) {
    requireInfra();
    const task = await _testPrisma.task.findUnique({
      where: { id: seedId },
      include: {
        owner: true,
        lead: true,
        contact: true,
        opportunity: true,
      },
    });

    if (!task) {
      throw new Error(`Task ${seedId} not found in seed data`);
    }

    return task;
  },

  /**
   * Get seeded user by seed ID
   */
  async user(seedId: string) {
    requireInfra();
    const user = await _testPrisma.user.findUnique({
      where: { id: seedId },
    });

    if (!user) {
      throw new Error(`User ${seedId} not found in seed data`);
    }

    return user;
  },
};
