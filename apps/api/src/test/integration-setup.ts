/**
 * Integration Test Setup
 *
 * Provides test utilities for integration tests that use real seeded database:
 * - Real Prisma client connected to test database
 * - Access to SEED_IDS for querying seed data
 * - Test context creation with real services
 * - Database reset utilities
 */

import { beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import type { BaseContext } from '../context';
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
  PrismaLeadRepository,
  PrismaContactRepository,
  PrismaAccountRepository,
  PrismaOpportunityRepository,
  PrismaTaskRepository,
  InMemoryEventBus,
  MockAIService,
} from '@intelliflow/adapters';

/**
 * Real Prisma client for integration tests
 * Connected to test database
 */
export const testPrisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

/**
 * SEED_IDS for easy access in tests
 * Copied from packages/db/prisma/seed.ts - should be kept in sync
 */
export const SEED_IDS = {
  users: {
    admin: 'seed-user-admin-001',
    manager: 'seed-user-manager-001',
    sarahJohnson: 'seed-user-sarah-johnson',
    mikeDavis: 'seed-user-mike-davis',
    emilyDavis: 'seed-user-emily-davis',
    jamesWilson: 'seed-user-james-wilson',
    alexMorgan: 'seed-user-alex-morgan',
  },
  leads: {
    sarahMiller: 'seed-lead-sarah-miller',
    davidChen: 'seed-lead-david-chen',
    amandaSmith: 'seed-lead-amanda-smith',
    jamesWilson: 'seed-lead-james-wilson',
    elenaRodriguez: 'seed-lead-elena-rodriguez',
  },
  contacts: {
    sarahMiller: 'seed-contact-sarah-miller',
    davidChen: 'seed-contact-david-chen',
    amandaSmith: 'seed-contact-amanda-smith',
    jamesWilson: 'seed-contact-james-wilson',
    elenaRodriguez: 'seed-contact-elena-rodriguez',
    johnSmith: 'seed-contact-john-smith',
  },
  accounts: {
    techCorp: 'seed-account-techcorp',
    designCo: 'seed-account-designco',
    smithConsulting: 'seed-account-smith-consulting',
    globalSoft: 'seed-account-globalsoft',
    finTech: 'seed-account-fintech',
    acmeCorp: 'seed-account-acme',
  },
  opportunities: {
    enterpriseLicenseAcme: 'seed-opp-enterprise-acme',
    annualSubscriptionTechStart: 'seed-opp-annual-techstart',
    customIntegrationGlobalTech: 'seed-opp-custom-globaltech',
    platformMigrationDataCorp: 'seed-opp-platform-datacorp',
  },
  tasks: {
    callSarah: 'seed-task-call-sarah',
    followUpTechCorp: 'seed-task-followup-techcorp',
    prepareQ3Report: 'seed-task-q3-report',
    callAcmeCorp: 'seed-task-call-acme',
  },
};

/**
 * Create test adapters
 */
const createTestAdapters = () => {
  const leadRepository = new PrismaLeadRepository(testPrisma);
  const contactRepository = new PrismaContactRepository(testPrisma);
  const accountRepository = new PrismaAccountRepository(testPrisma);
  const opportunityRepository = new PrismaOpportunityRepository(testPrisma);
  const taskRepository = new PrismaTaskRepository(testPrisma);
  const eventBus = new InMemoryEventBus();
  const aiService = new MockAIService();

  return {
    leadRepository,
    contactRepository,
    accountRepository,
    opportunityRepository,
    taskRepository,
    eventBus,
    aiService,
  };
};

const testAdapters = createTestAdapters();

/**
 * Real services for integration tests
 * These use the real Prisma client and test against actual database
 */
export const testServices = {
  lead: new LeadService(
    testAdapters.leadRepository,
    testAdapters.contactRepository,
    testAdapters.accountRepository,
    testAdapters.aiService,
    testAdapters.eventBus
  ),
  contact: new ContactService(
    testAdapters.contactRepository,
    testAdapters.accountRepository,
    testAdapters.eventBus
  ),
  account: new AccountService(
    testAdapters.accountRepository,
    testAdapters.contactRepository,
    testAdapters.opportunityRepository,
    testAdapters.eventBus
  ),
  opportunity: new OpportunityService(
    testAdapters.opportunityRepository,
    testAdapters.accountRepository,
    testAdapters.contactRepository,
    testAdapters.eventBus
  ),
  task: new TaskService(
    testAdapters.taskRepository,
    testAdapters.leadRepository,
    testAdapters.contactRepository,
    testAdapters.opportunityRepository,
    testAdapters.eventBus
  ),
  ticket: new TicketService(testPrisma),
  analytics: new AnalyticsService(testPrisma),
};

/**
 * Get default tenant ID from seeded data
 */
export async function getDefaultTenantId(): Promise<string> {
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
 */
export async function createIntegrationTestContext(
  overrides?: Partial<BaseContext>
): Promise<BaseContext> {
  const tenantId = await getDefaultTenantId();

  const defaultContext: BaseContext = {
    prisma: testPrisma,
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
      userId: SEED_IDS.users.sarahJohnson,
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
 */
export async function createIntegrationAdminContext(
  overrides?: Partial<BaseContext>
): Promise<BaseContext> {
  const tenantId = await getDefaultTenantId();

  return createIntegrationTestContext({
    user: {
      userId: SEED_IDS.users.admin,
      email: 'admin@intelliflow.dev',
      role: 'ADMIN',
      tenantId,
    },
    ...overrides,
  });
}

/**
 * Connect to database before all tests
 */
beforeAll(async () => {
  await testPrisma.$connect();
});

/**
 * Disconnect from database after all tests
 */
afterAll(async () => {
  await testPrisma.$disconnect();
});

/**
 * Helper to verify seed data exists
 * Call this in beforeAll of your test file to ensure seed ran
 */
export async function verifySeedData(): Promise<void> {
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
 * Helper functions to get seeded entities
 */
export const getSeedData = {
  /**
   * Get a seeded lead by its seed ID
   */
  async lead(seedId: string) {
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
    const user = await testPrisma.user.findUnique({
      where: { id: seedId },
    });

    if (!user) {
      throw new Error(`User ${seedId} not found in seed data`);
    }

    return user;
  },
};
