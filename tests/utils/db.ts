/**
 * Database Test Utilities for IntelliFlow CRM
 *
 * This module provides utilities for database testing, including:
 * - Test database setup and teardown
 * - Transaction management for test isolation
 * - Database seeding and cleanup helpers
 */

import { beforeEach, afterEach, beforeAll, afterAll } from 'vitest';

/**
 * Test Database Configuration
 */
export interface TestDbConfig {
  /**
   * Whether to use transactions for test isolation
   * When enabled, each test runs in a transaction that is rolled back
   */
  useTransactions?: boolean;

  /**
   * Whether to reset the database before each test
   */
  resetBeforeEach?: boolean;

  /**
   * Whether to seed the database with test data
   */
  seed?: boolean;
}

/**
 * Database Test Helper Class
 *
 * Provides utilities for managing test databases with proper isolation
 */
export class DatabaseTestHelper {
  private static instance: DatabaseTestHelper;
  private config: TestDbConfig;
  private isSetup = false;

  private constructor(config: TestDbConfig = {}) {
    this.config = {
      useTransactions: true,
      resetBeforeEach: false,
      seed: false,
      ...config,
    };
  }

  /**
   * Get singleton instance of DatabaseTestHelper
   */
  static getInstance(config?: TestDbConfig): DatabaseTestHelper {
    if (!DatabaseTestHelper.instance) {
      DatabaseTestHelper.instance = new DatabaseTestHelper(config);
    }
    return DatabaseTestHelper.instance;
  }

  /**
   * Setup test database
   * Call this in beforeAll() hook
   */
  async setup(): Promise<void> {
    if (this.isSetup) {
      return;
    }

    console.log('Setting up test database...');

    // TODO: Initialize database connection
    // When Prisma is configured, this will:
    // 1. Connect to test database
    // 2. Run migrations
    // 3. Optionally seed initial data

    this.isSetup = true;
    console.log('Test database setup complete');
  }

  /**
   * Teardown test database
   * Call this in afterAll() hook
   */
  async teardown(): Promise<void> {
    if (!this.isSetup) {
      return;
    }

    console.log('Tearing down test database...');

    // TODO: Cleanup database connection
    // When Prisma is configured, this will:
    // 1. Clear all test data
    // 2. Disconnect from database

    this.isSetup = false;
    console.log('Test database teardown complete');
  }

  /**
   * Reset database to initial state
   * Useful for ensuring test isolation
   */
  async reset(): Promise<void> {
    console.log('Resetting test database...');

    // TODO: Reset database state
    // When Prisma is configured, this will:
    // 1. Truncate all tables
    // 2. Reset sequences
    // 3. Optionally re-seed data

    console.log('Test database reset complete');
  }

  /**
   * Begin a transaction for test isolation
   * Returns a transaction client to use in tests
   */
  async beginTransaction(): Promise<void> {
    // TODO: Start database transaction
    // When Prisma is configured, this will return a transaction client
    console.log('Beginning database transaction...');
  }

  /**
   * Rollback transaction after test
   */
  async rollbackTransaction(): Promise<void> {
    // TODO: Rollback database transaction
    console.log('Rolling back database transaction...');
  }

  /**
   * Seed the database with test data
   */
  async seed(): Promise<void> {
    console.log('Seeding test database...');

    // TODO: Seed test data
    // When Prisma is configured, this will seed common test data

    console.log('Test database seeding complete');
  }

  /**
   * Clear all data from the database
   */
  async clear(): Promise<void> {
    console.log('Clearing test database...');

    // TODO: Clear all data
    // When Prisma is configured, this will clear all tables

    console.log('Test database cleared');
  }

  /**
   * Execute a query and return results
   * Useful for direct database assertions in tests
   */
  async executeQuery<T = any>(query: string, params?: any[]): Promise<T[]> {
    // TODO: Execute raw query
    // When Prisma is configured, this will use $queryRaw
    console.log('Executing query:', query);
    return [];
  }

  /**
   * Count records in a table
   */
  async count(tableName: string, where?: Record<string, any>): Promise<number> {
    // TODO: Count records
    // When Prisma is configured, this will use the appropriate model's count
    console.log('Counting records in', tableName);
    return 0;
  }

  /**
   * Check if a record exists
   */
  async exists(tableName: string, where: Record<string, any>): Promise<boolean> {
    const count = await this.count(tableName, where);
    return count > 0;
  }
}

/**
 * Helper function to setup database for tests
 * Use this in your test files with beforeAll/afterAll hooks
 *
 * @example
 * ```typescript
 * import { setupTestDatabase } from '@test-utils/db';
 *
 * const db = setupTestDatabase();
 *
 * describe('My tests', () => {
 *   // Tests will have proper database isolation
 * });
 * ```
 */
export function setupTestDatabase(config?: TestDbConfig): DatabaseTestHelper {
  const db = DatabaseTestHelper.getInstance(config);

  beforeAll(async () => {
    await db.setup();
  });

  afterAll(async () => {
    await db.teardown();
  });

  if (config?.useTransactions) {
    beforeEach(async () => {
      await db.beginTransaction();
    });

    afterEach(async () => {
      await db.rollbackTransaction();
    });
  } else if (config?.resetBeforeEach) {
    beforeEach(async () => {
      await db.reset();
    });
  }

  if (config?.seed) {
    beforeAll(async () => {
      await db.seed();
    });
  }

  return db;
}

/**
 * Create a test database transaction wrapper
 * Use this for integration tests that need database access
 *
 * @example
 * ```typescript
 * import { withTestTransaction } from '@test-utils/db';
 *
 * it('should create a lead', async () => {
 *   await withTestTransaction(async (tx) => {
 *     // Use tx for database operations
 *     // Transaction will be rolled back after test
 *   });
 * });
 * ```
 */
export async function withTestTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
  const db = DatabaseTestHelper.getInstance();

  await db.beginTransaction();
  try {
    // TODO: Pass actual transaction client when Prisma is configured
    const result = await fn({});
    return result;
  } finally {
    await db.rollbackTransaction();
  }
}

/**
 * Wait for database to be ready
 * Useful in CI environments where database might not be immediately available
 */
export async function waitForDatabase(
  maxAttempts: number = 30,
  delayMs: number = 1000
): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // TODO: Check database connection
      // When Prisma is configured, this will use $queryRaw('SELECT 1')
      console.log(`Database connection attempt ${attempt}/${maxAttempts}...`);
      return;
    } catch (error) {
      if (attempt === maxAttempts) {
        throw new Error('Database is not ready after maximum attempts');
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

/**
 * Create a test database connection string
 * Ensures tests use a separate database from development
 */
export function getTestDatabaseUrl(): string {
  return (
    process.env.TEST_DATABASE_URL ||
    process.env.DATABASE_URL?.replace(/\/([^/]+)$/, '/test_$1') ||
    'postgresql://postgres:postgres@localhost:5432/intelliflow_test'
  );
}
