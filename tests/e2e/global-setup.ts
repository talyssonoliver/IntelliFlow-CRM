/**
 * Playwright Global Setup
 *
 * This file runs once before all E2E tests.
 * Use it for:
 * - Database seeding
 * - Environment validation
 * - Authentication setup
 */

import { chromium, FullConfig } from '@playwright/test';

async function globalSetup(config: FullConfig) {
  console.log('🚀 Starting Playwright Global Setup...');

  // Validate required environment variables
  const requiredEnvVars = ['DATABASE_URL'];
  const missingEnvVars = requiredEnvVars.filter((varName) => !process.env[varName]);

  if (missingEnvVars.length > 0) {
    console.warn(`⚠️  Warning: Missing environment variables: ${missingEnvVars.join(', ')}`);
  }

  // Optional: Create test users or seed data
  // await seedTestData();

  // Optional: Pre-authenticate and save auth state
  // This speeds up tests by avoiding repeated login
  const baseURL = config.use.baseURL || 'http://localhost:3000';
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Example: Navigate to login and save auth state
    // await page.goto(`${baseURL}/auth/login`);
    // await page.fill('input[name="email"]', 'test@example.com');
    // await page.fill('input[name="password"]', 'testpassword');
    // await page.click('button[type="submit"]');
    // await page.waitForURL(`${baseURL}/dashboard`);
    // await context.storageState({ path: 'artifacts/auth-state.json' });

    console.log('✅ Global setup completed');
  } catch (error) {
    console.error('❌ Global setup failed:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

export default globalSetup;
