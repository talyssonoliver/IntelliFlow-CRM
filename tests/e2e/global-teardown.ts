/**
 * Playwright Global Teardown
 *
 * This file runs once after all E2E tests.
 * Use it for:
 * - Database cleanup
 * - Resource cleanup
 * - Test artifact archiving
 */

import { FullConfig } from '@playwright/test';

async function globalTeardown(config: FullConfig) {
  console.log('🧹 Starting Playwright Global Teardown...');

  try {
    // Optional: Clean up test data
    // await cleanupTestData();

    // Optional: Archive test artifacts
    // await archiveTestResults();

    console.log('✅ Global teardown completed');
  } catch (error) {
    console.error('❌ Global teardown failed:', error);
    // Don't throw - teardown failures shouldn't fail the test run
  }
}

export default globalTeardown;
