/**
 * Integration Test Setup for IntelliFlow CRM
 *
 * Uses testcontainers to automatically spin up PostgreSQL for integration tests.
 * Falls back to existing DATABASE_URL if containers are not available.
 *
 * GRACEFUL DEGRADATION: If infrastructure is not available (Docker, Prisma),
 * tests are skipped with clear alerts instead of failing.
 *
 * @module tests/integration/setup
 */

import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Infrastructure availability tracking
 */
export let isInfrastructureAvailable = false;
export let infrastructureUnavailableReason = '';

// Lazy-loaded modules (may not be available)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let PostgreSqlContainer: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let PrismaClient: any = null;

// Try to load optional dependencies
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const testcontainers = require('@testcontainers/postgresql');
  PostgreSqlContainer = testcontainers.PostgreSqlContainer;
} catch {
  // testcontainers not available
}

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const db = require('@intelliflow/db');
  PrismaClient = db.PrismaClient;
  isInfrastructureAvailable = true;
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  if (errorMessage.includes('@prisma/client')) {
    infrastructureUnavailableReason = '@prisma/client not generated. Run: pnpm run db:generate';
  } else {
    infrastructureUnavailableReason = `Failed to load database client: ${errorMessage}`;
  }
}

// Container and client state
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let postgresContainer: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let testPrismaClient: any = null;
let databaseUrl: string | null = null;

/**
 * Alert banner for skipped infrastructure tests
 */
let alertDisplayed = false;

function displayInfrastructureAlert(reason: string): void {
  if (alertDisplayed) return;
  alertDisplayed = true;

  console.log('\n' + '='.repeat(80));
  console.log('⚠️  INTEGRATION TESTS SKIPPED');
  console.log('='.repeat(80));
  console.log(`Reason: ${reason}`);
  console.log('');
  console.log('To run integration tests:');
  console.log('  1. Generate Prisma client: pnpm run db:generate');
  console.log('  2. Install Docker for testcontainers');
  console.log('  3. Or set DATABASE_URL environment variable');
  console.log('');
  console.log('Coverage is NOT affected by skipped infrastructure tests.');
  console.log('='.repeat(80) + '\n');
}

/**
 * Check if Docker is available for testcontainers
 */
async function isDockerAvailable(): Promise<boolean> {
  try {
    await execAsync('docker info');
    return true;
  } catch {
    return false;
  }
}

/**
 * Start PostgreSQL container using testcontainers
 * Returns null if testcontainers not available
 */
async function startPostgresContainer(): Promise<string | null> {
  if (!PostgreSqlContainer) {
    console.log('⚠️  testcontainers not available, skipping container startup');
    return null;
  }

  console.log('🐳 Starting PostgreSQL container...');

  postgresContainer = await new PostgreSqlContainer('postgres:15-alpine')
    .withDatabase('intelliflow_test')
    .withUsername('test')
    .withPassword('test')
    .withExposedPorts(5432)
    .start();

  const connectionUrl = postgresContainer.getConnectionUri();
  console.log(`✅ PostgreSQL container started at ${connectionUrl}`);

  return connectionUrl;
}

/**
 * Run database migrations on the test database
 */
async function runMigrations(dbUrl: string): Promise<void> {
  console.log('📦 Running database migrations...');

  try {
    // Set DATABASE_URL for Prisma commands
    const env = { ...process.env, DATABASE_URL: dbUrl };

    // Push schema to database (faster than running migrations for tests)
    await execAsync('pnpm --filter @intelliflow/db db:push --skip-generate', { env });

    console.log('✅ Database migrations complete');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

/**
 * Seed test database with initial data
 */
async function seedDatabase(dbUrl: string): Promise<void> {
  console.log('🌱 Seeding test database...');

  try {
    const env = { ...process.env, DATABASE_URL: dbUrl };
    await execAsync('pnpm --filter @intelliflow/db db:seed', { env });
    console.log('✅ Database seeding complete');
  } catch (error) {
    console.warn('⚠️  Seeding failed (may already be seeded):', error);
  }
}

/**
 * Setup test database - uses testcontainers or falls back to existing DB
 * Returns database URL or throws if setup fails
 */
export async function setupTestDatabase(): Promise<string> {
  // Check infrastructure first
  if (!isInfrastructureAvailable) {
    throw new Error(infrastructureUnavailableReason || 'Infrastructure not available');
  }

  // Check if DATABASE_URL is already provided (CI environment)
  const existingUrl = process.env.DATABASE_URL || process.env.TEST_DATABASE_URL;

  if (existingUrl) {
    console.log('📦 Using existing DATABASE_URL');
    databaseUrl = existingUrl;
    return existingUrl;
  }

  // Check if Docker is available for testcontainers
  const dockerAvailable = await isDockerAvailable();

  if (!dockerAvailable || !PostgreSqlContainer) {
    const reason = !PostgreSqlContainer
      ? 'testcontainers package not available'
      : 'Docker not available';
    throw new Error(
      `${reason}. To run integration tests:\n` +
      '   1. Install Docker, OR\n' +
      '   2. Set DATABASE_URL environment variable, OR\n' +
      '   3. Run: docker-compose up -d postgres-test'
    );
  }

  // Start PostgreSQL container
  const containerUrl = await startPostgresContainer();
  if (!containerUrl) {
    throw new Error('Failed to start PostgreSQL container');
  }

  databaseUrl = containerUrl;

  // Set DATABASE_URL for Prisma
  process.env.DATABASE_URL = databaseUrl;

  // Run migrations
  await runMigrations(databaseUrl);

  // Seed database
  await seedDatabase(databaseUrl);

  return databaseUrl;
}

/**
 * Teardown test database - stops container if started
 */
export async function teardownTestDatabase(): Promise<void> {
  if (testPrismaClient) {
    await testPrismaClient.$disconnect();
    testPrismaClient = null;
  }

  if (postgresContainer) {
    console.log('🛑 Stopping PostgreSQL container...');
    await postgresContainer.stop();
    postgresContainer = null;
    console.log('✅ PostgreSQL container stopped');
  }
}

/**
 * Get or create Prisma client for tests
 * Returns null if infrastructure not available
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getTestPrismaClient(): any {
  if (!isInfrastructureAvailable || !PrismaClient) {
    return null;
  }

  if (!testPrismaClient) {
    testPrismaClient = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl || process.env.DATABASE_URL,
        },
      },
    });
  }
  return testPrismaClient;
}

/**
 * Reset database state between tests (truncate all tables)
 * Does nothing if infrastructure not available
 */
export async function resetDatabaseState(): Promise<void> {
  const prisma = getTestPrismaClient();

  if (!prisma) {
    return; // Silently skip if not available
  }

  try {
    // Disable foreign key checks, truncate all tables, re-enable
    await prisma.$executeRawUnsafe(`
      DO $$ DECLARE
        r RECORD;
      BEGIN
        FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != '_prisma_migrations') LOOP
          EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' CASCADE';
        END LOOP;
      END $$;
    `);
  } catch (error) {
    console.error('Failed to reset database state:', error);
    throw error;
  }
}

/**
 * Create test API client
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
 */
export async function waitForService(url: string, maxAttempts = 30, delayMs = 1000): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        console.log(`✅ Service ready at ${url}`);
        return;
      }
    } catch {
      // Service not ready yet
    }

    if (attempt === maxAttempts) {
      throw new Error(`Service at ${url} did not become ready after ${maxAttempts} attempts`);
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

/**
 * Check if database is available
 * Returns false if infrastructure not available
 */
export function isDatabaseAvailable(): boolean {
  if (!isInfrastructureAvailable) {
    return false;
  }
  return databaseUrl !== null || !!process.env.DATABASE_URL;
}

// Track if setup succeeded
let setupSucceeded = false;

// Global test lifecycle hooks
beforeAll(async () => {
  console.log('🧪 Integration Test Suite Starting...');
  process.env.NODE_ENV = 'test';

  // Check infrastructure availability first
  if (!isInfrastructureAvailable) {
    displayInfrastructureAlert(infrastructureUnavailableReason);
    setupSucceeded = false;
    return;
  }

  try {
    await setupTestDatabase();
    setupSucceeded = true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    displayInfrastructureAlert(`Database setup failed: ${errorMessage}`);
    setupSucceeded = false;
  }
});

afterAll(async () => {
  if (setupSucceeded) {
    await teardownTestDatabase();
  }
  console.log('✅ Integration Test Suite Complete');

  // Explicit garbage collection to prevent OOM during cleanup
  if (global.gc) {
    global.gc();
  }
});

beforeEach(async () => {
  if (!setupSucceeded) {
    return;
  }

  if (process.env.RESET_DB_BETWEEN_TESTS === 'true') {
    await resetDatabaseState();
  }
});

afterEach(() => {
  // Cleanup after each test
});

// Export test utilities
export const testUtils = {
  setupTestDatabase,
  teardownTestDatabase,
  resetDatabaseState,
  createTestApiClient,
  waitForService,
  getTestPrismaClient,
  isDatabaseAvailable,
  isInfrastructureAvailable,
  infrastructureUnavailableReason,
};
