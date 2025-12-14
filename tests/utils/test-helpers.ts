/**
 * Test Utilities for IntelliFlow CRM
 *
 * This module provides shared test utilities, factories, and helpers
 * used across the monorepo test suite.
 */

import { vi } from 'vitest';

/**
 * Test Data Factories
 *
 * Use these factories to create consistent test data across tests
 */
export class TestDataFactory {
  /**
   * Generate a unique test ID
   */
  static generateId(): string {
    return `test-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Generate a test email
   */
  static generateEmail(prefix: string = 'test'): string {
    return `${prefix}-${this.generateId()}@example.com`;
  }

  /**
   * Generate a test phone number
   */
  static generatePhone(): string {
    return `+1-555-${Math.floor(1000 + Math.random() * 9000)}`;
  }

  /**
   * Create a test lead object
   */
  static createLead(overrides: Partial<TestLead> = {}): TestLead {
    return {
      id: this.generateId(),
      email: this.generateEmail('lead'),
      firstName: 'Test',
      lastName: 'Lead',
      company: 'Test Company Inc.',
      phone: this.generatePhone(),
      status: 'new',
      score: 0,
      source: 'test',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  /**
   * Create a test contact object
   */
  static createContact(overrides: Partial<TestContact> = {}): TestContact {
    return {
      id: this.generateId(),
      email: this.generateEmail('contact'),
      firstName: 'Test',
      lastName: 'Contact',
      company: 'Test Company Inc.',
      phone: this.generatePhone(),
      jobTitle: 'Test Manager',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  /**
   * Create a test user object
   */
  static createUser(overrides: Partial<TestUser> = {}): TestUser {
    return {
      id: this.generateId(),
      email: this.generateEmail('user'),
      firstName: 'Test',
      lastName: 'User',
      role: 'user',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }
}

/**
 * Test Async Utilities
 */
export class AsyncTestUtils {
  /**
   * Wait for a condition to be true
   */
  static async waitFor(
    condition: () => boolean | Promise<boolean>,
    options: { timeout?: number; interval?: number } = {}
  ): Promise<void> {
    const { timeout = 5000, interval = 100 } = options;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (await condition()) {
        return;
      }
      await this.sleep(interval);
    }

    throw new Error(`Timeout waiting for condition after ${timeout}ms`);
  }

  /**
   * Sleep for a specified duration
   */
  static sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Flush all pending promises
   */
  static async flushPromises(): Promise<void> {
    return new Promise((resolve) => setImmediate(resolve));
  }
}

/**
 * Mock Utilities
 */
export class MockUtils {
  /**
   * Create a mock function with type safety
   */
  static mockFn<T extends (...args: any[]) => any>(): MockFn<T> {
    return vi.fn() as MockFn<T>;
  }

  /**
   * Create a partial mock of an object
   */
  static mockPartial<T>(partial: Partial<T>): T {
    return partial as T;
  }

  /**
   * Create a spy on an object method
   */
  static spyOn<T, K extends keyof T>(
    object: T,
    method: K
  ): ReturnType<typeof vi.spyOn> {
    return vi.spyOn(object, method as any);
  }
}

/**
 * Date/Time Test Utilities
 */
export class DateTestUtils {
  /**
   * Create a fixed date for testing
   */
  static fixedDate(dateString: string = '2024-01-01T00:00:00.000Z'): Date {
    return new Date(dateString);
  }

  /**
   * Mock Date.now() to return a fixed timestamp
   */
  static mockNow(timestamp: number = Date.now()): void {
    vi.spyOn(Date, 'now').mockReturnValue(timestamp);
  }

  /**
   * Restore original Date.now()
   */
  static restoreNow(): void {
    vi.restoreAllMocks();
  }

  /**
   * Add days to a date
   */
  static addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  /**
   * Check if two dates are the same day
   */
  static isSameDay(date1: Date, date2: Date): boolean {
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    );
  }
}

/**
 * Error Testing Utilities
 */
export class ErrorTestUtils {
  /**
   * Assert that a function throws a specific error
   */
  static async assertThrows<T extends Error>(
    fn: () => Promise<void> | void,
    ErrorClass: new (...args: any[]) => T,
    message?: string | RegExp
  ): Promise<void> {
    let error: Error | undefined;

    try {
      await fn();
    } catch (e) {
      error = e as Error;
    }

    if (!error) {
      throw new Error('Expected function to throw an error, but it did not');
    }

    if (!(error instanceof ErrorClass)) {
      throw new Error(
        `Expected error to be instance of ${ErrorClass.name}, but got ${error.constructor.name}`
      );
    }

    if (message) {
      const messageMatches =
        typeof message === 'string'
          ? error.message === message
          : message.test(error.message);

      if (!messageMatches) {
        throw new Error(
          `Expected error message to match "${message}", but got "${error.message}"`
        );
      }
    }
  }
}

/**
 * Environment Utilities
 */
export class EnvTestUtils {
  private static originalEnv: NodeJS.ProcessEnv = {};

  /**
   * Set environment variables for testing
   */
  static setEnv(env: Record<string, string>): void {
    this.originalEnv = { ...process.env };
    Object.assign(process.env, env);
  }

  /**
   * Restore original environment variables
   */
  static restoreEnv(): void {
    process.env = this.originalEnv;
    this.originalEnv = {};
  }

  /**
   * Run a test with specific environment variables
   */
  static async withEnv<T>(
    env: Record<string, string>,
    fn: () => T | Promise<T>
  ): Promise<T> {
    this.setEnv(env);
    try {
      return await fn();
    } finally {
      this.restoreEnv();
    }
  }
}

/**
 * Type Definitions
 */
export interface TestLead {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  company: string;
  phone: string;
  status: 'new' | 'contacted' | 'qualified' | 'converted' | 'lost';
  score: number;
  source: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TestContact {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  company: string;
  phone: string;
  jobTitle: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TestUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'user' | 'viewer';
  createdAt: Date;
  updatedAt: Date;
}

export type MockFn<T extends (...args: any[]) => any> = ReturnType<typeof vi.fn> &
  T;

/**
 * Re-export commonly used vitest utilities
 */
export {
  describe,
  it,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  vi,
} from 'vitest';
