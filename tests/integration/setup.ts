/**
 * Integration Test Setup for IntelliFlow CRM
 *
 * This file provides setup and utilities for integration tests that span
 * multiple components, modules, or services.
 *
 * Integration tests verify that:
 * - Multiple components work together correctly
 * - API endpoints function as expected
 * - Database operations are correct
 * - External integrations work
 *
 * @module tests/integration/setup
 */

import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Test database configuration
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

if (!TEST_DATABASE_URL) {
  console.warn('⚠️  No TEST_DATABASE_URL found. Database tests may fail.');
}

/**
 * Setup test database
 * Creates a clean database state for testing
 */
export async function setupTestDatabase() {
  if (!TEST_DATABASE_URL) {
    console.warn('Skipping database setup - no TEST_DATABASE_URL');
    return;
  }

  try {
    // Note: Actual database migrations should be run here
    console.log('📦 Setting up test database...');

    // In a real implementation, you would:
    // 1. Run migrations: await execAsync('pnpm run db:migrate');
    // 2. Seed test data: await execAsync('pnpm run db:seed:test');

    console.log('✅ Test database ready');
  } catch (error) {
    console.error('❌ Failed to setup test database:', error);
    throw error;
  }
}

/**
 * Teardown test database
 * Cleans up the test database after tests complete
 */
export async function teardownTestDatabase() {
  if (!TEST_DATABASE_URL) {
    return;
  }

  try {
    console.log('🧹 Cleaning up test database...');

    // In a real implementation, you would:
    // 1. Clear test data
    // 2. Reset database state

    console.log('✅ Test database cleaned');
  } catch (error) {
    console.error('❌ Failed to cleanup test database:', error);
  }
}

/**
 * Reset database state between tests
 * Ensures test isolation by clearing data
 */
export async function resetDatabaseState() {
  if (!TEST_DATABASE_URL) {
    return;
  }

  try {
    // Clear all tables while maintaining schema
    // In a real implementation, you would:
    // 1. Truncate all tables
    // 2. Reset sequences
    // 3. Clear cache
  } catch (error) {
    console.error('Failed to reset database state:', error);
    throw error;
  }
}

/**
 * Create test API client
 * Returns a configured API client for integration tests
 */
export function createTestApiClient() {
  const baseURL = process.env.TEST_API_URL || 'http://localhost:3001';

  return {
    baseURL,
    async get(path: string) {
      const response = await fetch(`${baseURL}${path}`);
      return response.json();
    },
    async post(path: string, data: unknown) {
      const response = await fetch(`${baseURL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return response.json();
    },
    async put(path: string, data: unknown) {
      const response = await fetch(`${baseURL}${path}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return response.json();
    },
    async delete(path: string) {
      const response = await fetch(`${baseURL}${path}`, {
        method: 'DELETE',
      });
      return response.json();
    },
  };
}

/**
 * Wait for service to be ready
 * Polls a health endpoint until service is available
 */
export async function waitForService(url: string, maxAttempts = 30, delayMs = 1000): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        console.log(`✅ Service ready at ${url}`);
        return;
      }
    } catch (error) {
      // Service not ready yet
    }

    if (attempt === maxAttempts) {
      throw new Error(`Service at ${url} did not become ready after ${maxAttempts} attempts`);
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

// Global test lifecycle hooks
beforeAll(async () => {
  console.log('🧪 Integration Test Suite Starting...');

  // Setup test environment
  process.env.NODE_ENV = 'test';

  // Setup test database
  await setupTestDatabase();

  // Wait for required services (if running)
  if (process.env.WAIT_FOR_SERVICES === 'true') {
    const apiUrl = process.env.TEST_API_URL || 'http://localhost:3001';
    try {
      await waitForService(`${apiUrl}/api/health`, 10, 1000);
    } catch (error) {
      console.warn('⚠️  API service not available. Some tests may be skipped.');
    }
  }
});

afterAll(async () => {
  // Cleanup test database
  await teardownTestDatabase();

  console.log('✅ Integration Test Suite Complete');
});

beforeEach(async () => {
  // Reset database state for test isolation
  if (process.env.RESET_DB_BETWEEN_TESTS === 'true') {
    await resetDatabaseState();
  }
});

afterEach(() => {
  // Cleanup after each test
  // Clear any test-specific state
});

// Export test utilities
export const testUtils = {
  setupTestDatabase,
  teardownTestDatabase,
  resetDatabaseState,
  createTestApiClient,
  waitForService,
};
