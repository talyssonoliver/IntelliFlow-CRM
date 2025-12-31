/**
 * Test Setup and Utilities
 *
 * Provides common test utilities for tRPC router tests:
 * - Mock Prisma client
 * - Test context creation
 * - Test caller factory
 * - Mock data generators
 */

import { beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import type { DeepMockProxy } from 'vitest-mock-extended';
import { mockDeep, mockReset } from 'vitest-mock-extended';
import type { BaseContext } from '../context';

/**
 * Mock Prisma client
 * Use mockDeep to create a deep mock of PrismaClient
 */
export const prismaMock = mockDeep<PrismaClient>() as DeepMockProxy<PrismaClient>;

/**
 * Reset all mocks before each test
 */
beforeEach(() => {
  mockReset(prismaMock);
});

/**
 * Mock services for testing
 * These mocks can be overridden in individual tests
 */
export const mockServices = {
  lead: mockDeep<any>(),
  contact: mockDeep<any>(),
  account: mockDeep<any>(),
  opportunity: mockDeep<any>(),
  task: mockDeep<any>(),
  ticket: mockDeep<any>(),
  analytics: mockDeep<any>(),
};

/**
 * Mock security services for testing
 * IFC-098, IFC-113, IFC-127
 */
export const mockSecurityServices = {
  auditLogger: mockDeep<any>(),
  rbacService: mockDeep<any>(),
  encryptionService: mockDeep<any>(),
  keyRotationService: mockDeep<any>(),
  auditEventHandler: mockDeep<any>(),
};

/**
 * Mock adapters for testing
 */
export const mockAdapters = {
  leadRepository: mockDeep<any>(),
  contactRepository: mockDeep<any>(),
  accountRepository: mockDeep<any>(),
  opportunityRepository: mockDeep<any>(),
  taskRepository: mockDeep<any>(),
  eventBus: mockDeep<any>(),
  aiService: mockDeep<any>(),
  cache: mockDeep<any>(),
};

/**
 * Default context properties for spreading into test contexts
 * Use this when creating inline context objects in tests
 */
export const defaultContextProps = {
  services: mockServices,
  security: mockSecurityServices,
  adapters: mockAdapters,
};

/**
 * Create a test context with optional overrides
 */
export function createTestContext(overrides?: Partial<BaseContext>): BaseContext {
  const defaultContext: BaseContext = {
    prisma: prismaMock as unknown as PrismaClient,
    container: mockDeep<any>(), // Mock container for testing
    services: mockServices,
    security: mockSecurityServices,
    adapters: mockAdapters,
    user: {
      userId: TEST_UUIDS.user1,
      email: 'test@example.com',
      role: 'USER',
      tenantId: 'test-tenant-id',
    },
    req: undefined,
    res: undefined,
  };

  return { ...defaultContext, ...overrides };
}

/**
 * Create admin context for testing admin-only procedures
 */
export function createAdminContext(overrides?: Partial<BaseContext>): BaseContext {
  return createTestContext({
    user: {
      userId: TEST_UUIDS.admin1,
      email: 'admin@example.com',
      role: 'ADMIN',
      tenantId: 'test-tenant-id',
    },
    ...overrides,
  });
}

/**
 * Create unauthenticated context for testing public procedures
 */
export function createPublicContext(overrides?: Partial<BaseContext>): BaseContext {
  return createTestContext({
    user: undefined,
    ...overrides,
  });
}

/**
 * UUID generator for tests
 * Generates valid UUIDs for test data
 */
export function generateTestUUID(name: string): string {
  // Generate a valid UUID v4 based on the name for deterministic test data
  const hash = name.split('').reduce((acc, char) => {
    return ((acc << 5) - acc + char.charCodeAt(0)) | 0;
  }, 0);

  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  return `${hex.slice(0, 8)}-0000-4000-8000-${hex.padEnd(12, '0')}`;
}

/**
 * Common test UUIDs - use these for consistent test data
 */
export const TEST_UUIDS = {
  tenant: generateTestUUID('tenant'),
  lead1: generateTestUUID('lead-1'),
  lead2: generateTestUUID('lead-2'),
  contact1: generateTestUUID('contact-1'),
  contact2: generateTestUUID('contact-2'),
  account1: generateTestUUID('account-1'),
  account2: generateTestUUID('account-2'),
  opportunity1: generateTestUUID('opportunity-1'),
  opportunity2: generateTestUUID('opportunity-2'),
  task1: generateTestUUID('task-1'),
  task2: generateTestUUID('task-2'),
  user1: generateTestUUID('test-user'),
  admin1: generateTestUUID('admin-user'),
  nonExistent: generateTestUUID('non-existent'),
  score1: generateTestUUID('score-1'),
};

/**
 * Mock data generators
 */

export const mockLead = {
  id: TEST_UUIDS.lead1,
  tenantId: TEST_UUIDS.tenant,
  email: 'lead@example.com',
  firstName: 'John',
  lastName: 'Doe',
  company: 'ACME Corp',
  title: 'CEO',
  phone: '+1234567890',
  source: 'WEBSITE' as const,
  status: 'NEW' as const,
  score: 75,
  ownerId: TEST_UUIDS.user1,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

export const mockContact = {
  id: TEST_UUIDS.contact1,
  tenantId: TEST_UUIDS.tenant,
  email: 'contact@example.com',
  firstName: 'Jane',
  lastName: 'Smith',
  title: 'CTO',
  phone: '+1234567891',
  department: 'Engineering',
  accountId: TEST_UUIDS.account1,
  leadId: null,
  ownerId: TEST_UUIDS.user1,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

export const mockAccount = {
  id: TEST_UUIDS.account1,
  tenantId: TEST_UUIDS.tenant,
  name: 'TechCorp Inc',
  website: 'https://techcorp.example.com',
  industry: 'Technology',
  description: 'A leading tech company',
  revenue: new Prisma.Decimal(1000000),
  employees: 50,
  ownerId: TEST_UUIDS.user1,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

export const mockOpportunity = {
  id: TEST_UUIDS.opportunity1,
  tenantId: TEST_UUIDS.tenant,
  name: 'Enterprise Deal',
  value: new Prisma.Decimal(50000),
  stage: 'PROPOSAL' as const,
  probability: 60,
  expectedCloseDate: new Date('2024-12-31'),
  closedAt: null,
  description: 'Large enterprise opportunity',
  accountId: TEST_UUIDS.account1,
  contactId: TEST_UUIDS.contact1,
  ownerId: TEST_UUIDS.user1,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

export const mockTask = {
  id: TEST_UUIDS.task1,
  tenantId: TEST_UUIDS.tenant,
  title: 'Follow up call',
  description: 'Call the lead to discuss requirements',
  status: 'PENDING' as const,
  priority: 'HIGH' as const,
  dueDate: new Date('2024-12-25'),
  completedAt: null,
  leadId: TEST_UUIDS.lead1,
  contactId: null,
  opportunityId: null,
  ownerId: TEST_UUIDS.user1,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

export const mockUser = {
  id: TEST_UUIDS.user1,
  email: 'test@example.com',
  name: 'Test User',
  avatarUrl: 'https://example.com/avatar.jpg',
};

export const mockAIScore = {
  id: TEST_UUIDS.score1,
  leadId: TEST_UUIDS.lead1,
  score: 80,
  confidence: 0.85,
  factors: {
    engagement: 0.7,
    company_fit: 0.8,
    timing: 0.6,
  },
  modelVersion: 'v1.0.0',
  scoredById: TEST_UUIDS.user1,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};
