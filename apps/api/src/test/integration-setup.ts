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
import { AnalyticsService } from '../services/AnalyticsService';

/**
 * Infrastructure availability flag
 * Set to false if Prisma client cannot be loaded
 */
export let isInfrastructureAvailable = false;

/**
 * Reason for infrastructure unavailability (for alerts)
 */
export let infrastructureUnavailableReason = '';

/**
 * Real Prisma client for integration tests (may be null if unavailable)
 * Connected to test database
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export let testPrisma: any = null;

// Lazy-loaded services and adapters
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _testServices: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _testAdapters: any = null;

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
  if (!process.env.DATABASE_URL) {
    infrastructureUnavailableReason = 'DATABASE_URL environment variable not set';
    displayInfrastructureAlert(infrastructureUnavailableReason);
  } else {
    // Dynamic require to catch module not found errors
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaClient } = require('@prisma/client');
    testPrisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
    });

    // Try to load adapters and application services
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const application = require('@intelliflow/application');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const adapters = require('@intelliflow/adapters');

    // Services are imported at the top of the file

    // Create adapters
    _testAdapters = {
      leadRepository: new adapters.PrismaLeadRepository(testPrisma),
      contactRepository: new adapters.PrismaContactRepository(testPrisma),
      accountRepository: new adapters.PrismaAccountRepository(testPrisma),
      opportunityRepository: new adapters.PrismaOpportunityRepository(testPrisma),
      taskRepository: new adapters.PrismaTaskRepository(testPrisma),
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
      ticket: new TicketService(testPrisma),
      analytics: new AnalyticsService(testPrisma),
    };

    isInfrastructureAvailable = true;
  }
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  if (errorMessage.includes('Cannot find module') && errorMessage.includes('@prisma/client')) {
    infrastructureUnavailableReason = '@prisma/client not generated. Run: pnpm run db:generate';
  } else if (errorMessage.includes('Cannot find module')) {
    infrastructureUnavailableReason = `Missing module: ${errorMessage}`;
  } else {
    infrastructureUnavailableReason = `Infrastructure initialization failed: ${errorMessage}`;
  }
  displayInfrastructureAlert(infrastructureUnavailableReason);
}

/**
 * SEED_IDS for easy access in tests
 * Copied from packages/db/prisma/seed.ts - should be kept in sync
 * These are always available regardless of infrastructure state
 * Using UUID format for API compatibility
 */
export const SEED_IDS = {
  users: {
    admin: '00000000-0000-4000-8000-000000000011',
    manager: '00000000-0000-4000-8000-000000000012',
    sarahJohnson: '00000000-0000-4000-8000-000000000013',
    mikeDavis: '00000000-0000-4000-8000-000000000014',
    emilyDavis: '00000000-0000-4000-8000-000000000015',
    jamesWilson: '00000000-0000-4000-8000-000000000016',
    alexMorgan: '00000000-0000-4000-8000-000000000017',
  },
  leads: {
    sarahMiller: '00000000-0000-4000-8000-000000000021',
    davidChen: '00000000-0000-4000-8000-000000000022',
    amandaSmith: '00000000-0000-4000-8000-000000000023',
    jamesWilson: '00000000-0000-4000-8000-000000000024',
    elenaRodriguez: '00000000-0000-4000-8000-000000000025',
  },
  contacts: {
    sarahMiller: '00000000-0000-4000-8000-000000000031',
    davidChen: '00000000-0000-4000-8000-000000000032',
    amandaSmith: '00000000-0000-4000-8000-000000000033',
    jamesWilson: '00000000-0000-4000-8000-000000000034',
    elenaRodriguez: '00000000-0000-4000-8000-000000000035',
    johnSmith: '00000000-0000-4000-8000-000000000036',
  },
  accounts: {
    techCorp: '00000000-0000-4000-8000-000000000041',
    designCo: '00000000-0000-4000-8000-000000000042',
    smithConsulting: '00000000-0000-4000-8000-000000000043',
    globalSoft: '00000000-0000-4000-8000-000000000044',
    finTech: '00000000-0000-4000-8000-000000000045',
    acmeCorp: '00000000-0000-4000-8000-000000000046',
  },
  opportunities: {
    enterpriseLicenseAcme: '00000000-0000-4000-8000-000000000051',
    annualSubscriptionTechStart: '00000000-0000-4000-8000-000000000052',
    customIntegrationGlobalTech: '00000000-0000-4000-8000-000000000053',
    platformMigrationDataCorp: '00000000-0000-4000-8000-000000000054',
  },
  tasks: {
    callSarah: '00000000-0000-4000-8000-000000000091',
    followUpTechCorp: '00000000-0000-4000-8000-000000000092',
    prepareQ3Report: '00000000-0000-4000-8000-000000000093',
    callAcmeCorp: '00000000-0000-4000-8000-000000000094',
  },
};

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
  if (!isInfrastructureAvailable || !testPrisma) {
    throw new Error(`Infrastructure not available: ${infrastructureUnavailableReason}`);
  }

  const tenant = await testPrisma.tenant.findUnique({
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
  if (!isInfrastructureAvailable) {
    throw new Error(`Infrastructure not available: ${infrastructureUnavailableReason}`);
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
    prisma: testPrisma,
    prismaWithTenant: testPrisma, // For integration tests, use the same client
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
  if (!isInfrastructureAvailable) {
    throw new Error(`Infrastructure not available: ${infrastructureUnavailableReason}`);
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
  if (!isInfrastructureAvailable || !testPrisma) {
    return false;
  }

  if (isDatabaseConnectionVerified !== null) {
    return isDatabaseConnectionVerified;
  }

  try {
    await testPrisma.$connect();
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
  if (isInfrastructureAvailable) {
    await checkDatabaseOnce();
  }
});

/**
 * Disconnect from database after all tests
 */
afterAll(async () => {
  if (isDatabaseConnectionVerified === true && testPrisma) {
    await testPrisma.$disconnect();
  }
});

/**
 * Check if database is available (sync version for describe.skipIf)
 * Returns false if infrastructure or database not available
 */
export function isDatabaseReady(): boolean {
  return isInfrastructureAvailable && isDatabaseConnectionVerified === true;
}

/**
 * Check if database is available for integration tests
 * Use this in beforeAll to skip tests when DB is unavailable
 */
export async function requireDatabase(): Promise<void> {
  if (!isInfrastructureAvailable) {
    throw new Error(`SKIP: ${infrastructureUnavailableReason}`);
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

  const leadCount = await testPrisma.lead.count();
  const contactCount = await testPrisma.contact.count();
  const accountCount = await testPrisma.account.count();

  if (leadCount === 0 || contactCount === 0 || accountCount === 0) {
    throw new Error(
      'No seed data found in test database. Run: pnpm --filter @intelliflow/db seed'
    );
  }
}

/**
 * Helper to check infrastructure before query
 */
function requireInfra(): void {
  if (!isInfrastructureAvailable || !testPrisma) {
    throw new Error(`Infrastructure not available: ${infrastructureUnavailableReason}`);
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
    const lead = await testPrisma.lead.findUnique({
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
    const contact = await testPrisma.contact.findUnique({
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
    const account = await testPrisma.account.findUnique({
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
    const opportunity = await testPrisma.opportunity.findUnique({
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
    const task = await testPrisma.task.findUnique({
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
    const user = await testPrisma.user.findUnique({
      where: { id: seedId },
    });

    if (!user) {
      throw new Error(`User ${seedId} not found in seed data`);
    }

    return user;
  },
};
