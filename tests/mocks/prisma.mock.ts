/**
 * Prisma Client Mock for Testing
 *
 * This module provides a comprehensive mock of the Prisma client for use in tests.
 * It uses Vitest's mock functionality to create realistic database interactions
 * without requiring a real database connection.
 *
 * Usage:
 * ```typescript
 * import { mockPrisma, resetPrismaMock } from '@test-mocks/prisma.mock';
 *
 * beforeEach(() => {
 *   resetPrismaMock();
 * });
 *
 * test('creates a lead', async () => {
 *   mockPrisma.lead.create.mockResolvedValue({ id: '123', ... });
 *   // Your test code here
 * });
 * ```
 */

import { vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';

/**
 * Type-safe Prisma mock
 */
export type MockPrismaClient = {
  [K in keyof PrismaClient]: PrismaClient[K] extends object
    ? {
        [M in keyof PrismaClient[K]]: PrismaClient[K][M] extends Function
          ? ReturnType<typeof vi.fn>
          : PrismaClient[K][M];
      }
    : PrismaClient[K];
};

/**
 * Create a mock Prisma model with common CRUD operations
 */
function createMockModel() {
  return {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
    aggregate: vi.fn(),
    groupBy: vi.fn(),
  };
}

/**
 * Mock Prisma Client instance
 *
 * This mock includes all common Prisma models used in IntelliFlow CRM.
 * Add additional models as they are created in your schema.
 */
export const mockPrisma = {
  // CRM Models
  lead: createMockModel(),
  contact: createMockModel(),
  account: createMockModel(),
  opportunity: createMockModel(),
  activity: createMockModel(),
  task: createMockModel(),
  note: createMockModel(),

  // User & Auth Models
  user: createMockModel(),
  session: createMockModel(),
  apiKey: createMockModel(),

  // AI Models
  leadScore: createMockModel(),
  aiInteraction: createMockModel(),
  emailTemplate: createMockModel(),

  // System Models
  auditLog: createMockModel(),
  webhook: createMockModel(),
  integration: createMockModel(),

  // Transaction support
  $transaction: vi.fn((callback) => {
    if (typeof callback === 'function') {
      return callback(mockPrisma);
    }
    return Promise.resolve(callback);
  }),

  // Connection management
  $connect: vi.fn().mockResolvedValue(undefined),
  $disconnect: vi.fn().mockResolvedValue(undefined),

  // Query execution
  $executeRaw: vi.fn(),
  $executeRawUnsafe: vi.fn(),
  $queryRaw: vi.fn(),
  $queryRawUnsafe: vi.fn(),

  // Middleware
  $use: vi.fn(),
  $on: vi.fn(),
} as unknown as MockPrismaClient;

/**
 * Reset all Prisma mocks
 *
 * Call this in beforeEach() to ensure test isolation
 */
export function resetPrismaMock(): void {
  Object.values(mockPrisma).forEach((model) => {
    if (typeof model === 'object' && model !== null) {
      Object.values(model).forEach((method) => {
        if (typeof method === 'function' && 'mockReset' in method) {
          method.mockReset();
        }
      });
    }
  });
}

/**
 * Clear all Prisma mock call history
 *
 * Similar to resetPrismaMock but preserves mock implementations
 */
export function clearPrismaMock(): void {
  Object.values(mockPrisma).forEach((model) => {
    if (typeof model === 'object' && model !== null) {
      Object.values(model).forEach((method) => {
        if (typeof method === 'function' && 'mockClear' in method) {
          method.mockClear();
        }
      });
    }
  });
}

/**
 * Mock Prisma Client Factory
 *
 * Use this when you need a fresh Prisma client instance in your tests
 */
export function createMockPrismaClient(): MockPrismaClient {
  return { ...mockPrisma };
}

/**
 * Test Data Builder for Prisma entities
 *
 * Provides utilities for creating realistic test data
 */
export class PrismaTestDataBuilder {
  /**
   * Build a Lead entity
   */
  static buildLead(overrides: Partial<any> = {}) {
    return {
      id: `lead-${Date.now()}`,
      email: `test-${Date.now()}@example.com`,
      firstName: 'Test',
      lastName: 'Lead',
      company: 'Test Company',
      phone: '+1-555-0100',
      status: 'NEW',
      score: 0,
      source: 'MANUAL',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  /**
   * Build a Contact entity
   */
  static buildContact(overrides: Partial<any> = {}) {
    return {
      id: `contact-${Date.now()}`,
      email: `contact-${Date.now()}@example.com`,
      firstName: 'Test',
      lastName: 'Contact',
      company: 'Test Company',
      phone: '+1-555-0200',
      jobTitle: 'Manager',
      accountId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  /**
   * Build an Account entity
   */
  static buildAccount(overrides: Partial<any> = {}) {
    return {
      id: `account-${Date.now()}`,
      name: 'Test Account',
      domain: 'testaccount.com',
      industry: 'Technology',
      size: 'MEDIUM',
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  /**
   * Build a User entity
   */
  static buildUser(overrides: Partial<any> = {}) {
    return {
      id: `user-${Date.now()}`,
      email: `user-${Date.now()}@intelliflow.com`,
      firstName: 'Test',
      lastName: 'User',
      role: 'USER',
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  /**
   * Build an Opportunity entity
   */
  static buildOpportunity(overrides: Partial<any> = {}) {
    return {
      id: `opp-${Date.now()}`,
      title: 'Test Opportunity',
      accountId: `account-${Date.now()}`,
      value: 50000,
      probability: 50,
      stage: 'QUALIFICATION',
      expectedCloseDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      ownerId: `user-${Date.now()}`,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  /**
   * Build a Lead Score entity
   */
  static buildLeadScore(overrides: Partial<any> = {}) {
    return {
      id: `score-${Date.now()}`,
      leadId: `lead-${Date.now()}`,
      score: 75,
      confidence: 0.85,
      factors: {
        engagement: 80,
        fit: 70,
        intent: 75,
      },
      modelVersion: 'v1.0.0',
      scoredAt: new Date(),
      createdAt: new Date(),
      ...overrides,
    };
  }
}

/**
 * Mock transaction helper
 *
 * Simulates Prisma transaction behavior in tests
 */
export async function mockTransaction<T>(
  callback: (tx: MockPrismaClient) => Promise<T>
): Promise<T> {
  const txClient = createMockPrismaClient();
  return callback(txClient);
}

/**
 * Export default mock for convenience
 */
export default mockPrisma;
