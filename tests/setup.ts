/**
 * Global test setup file for Vitest
 *
 * This file is run once before all tests in the workspace.
 * Use it for global test configuration, environment setup, and shared test utilities.
 */

import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Reduce noise in test output

// Global test hooks
beforeAll(() => {
  // Setup code that runs once before all tests
  console.log('🧪 IntelliFlow CRM Test Suite Starting...');
});

afterAll(() => {
  // Cleanup code that runs once after all tests
  console.log('✅ IntelliFlow CRM Test Suite Complete');
});

beforeEach(() => {
  // Reset any global state before each test
  // This ensures test isolation
});

afterEach(() => {
  // Cleanup after each test
  // Clear timers, restore mocks, etc.
});

// Extend Vitest matchers if needed
// expect.extend({
//   customMatcher(received, expected) {
//     // Custom matcher implementation
//   },
// });
