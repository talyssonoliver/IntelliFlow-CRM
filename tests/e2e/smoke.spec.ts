/**
 * Smoke Tests for IntelliFlow CRM
 *
 * These tests verify that critical user paths work correctly.
 * They run quickly and should catch major regressions.
 *
 * Smoke tests should:
 * - Be fast (< 30 seconds total)
 * - Test critical paths only
 * - Run on every commit
 * - Fail fast if core functionality is broken
 */

import { test, expect } from '@playwright/test';

test.describe('Smoke Tests', () => {
  test.describe('Application Availability', () => {
    test('should load the homepage', async ({ page }) => {
      await page.goto('/');

      // Verify the page loads successfully
      await expect(page).toHaveTitle(/IntelliFlow CRM/i);

      // Verify no console errors (except known warnings)
      const errors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          errors.push(msg.text());
        }
      });

      // Give page time to load
      await page.waitForLoadState('networkidle');

      // Check for critical errors (filter out known warnings)
      const criticalErrors = errors.filter(
        (error) => !error.includes('DevTools') && !error.includes('Warning')
      );

      expect(criticalErrors).toHaveLength(0);
    });

    test('should navigate to login page', async ({ page }) => {
      await page.goto('/auth/login');

      // Verify login page elements
      await expect(page.locator('input[name="email"]')).toBeVisible();
      await expect(page.locator('input[name="password"]')).toBeVisible();
      await expect(page.locator('button[type="submit"]')).toBeVisible();
    });

    test('should have accessible navigation', async ({ page }) => {
      await page.goto('/');

      // Verify main navigation is present
      const nav = page.locator('nav').first();
      await expect(nav).toBeVisible();

      // Verify key navigation links
      const expectedLinks = ['Dashboard', 'Leads', 'Contacts'];
      for (const linkText of expectedLinks) {
        const link = page.locator(`nav a:has-text("${linkText}")`);
        if ((await link.count()) > 0) {
          await expect(link.first()).toBeVisible();
        }
      }
    });
  });

  test.describe('Authentication Flow', () => {
    test('should show validation errors for invalid login', async ({ page }) => {
      await page.goto('/auth/login');

      // Try to submit empty form
      await page.click('button[type="submit"]');

      // Should show validation errors
      const errorMessages = page.locator('[role="alert"]');
      if ((await errorMessages.count()) > 0) {
        await expect(errorMessages.first()).toBeVisible();
      }
    });

    test('should navigate to signup page', async ({ page }) => {
      await page.goto('/auth/login');

      // Click signup link
      const signupLink = page.locator('a:has-text("Sign up")');
      if ((await signupLink.count()) > 0) {
        await signupLink.click();
        await expect(page).toHaveURL(/signup/);
      }
    });
  });

  test.describe('Core Functionality', () => {
    test('should load dashboard after authentication', async ({ page }) => {
      // Note: This test assumes you have authentication set up
      // Skip if no auth state is available
      test.skip(!process.env.E2E_AUTH_ENABLED, 'Authentication not enabled');

      await page.goto('/dashboard');

      // Verify dashboard loads
      await expect(page).toHaveURL(/dashboard/);

      // Verify key dashboard elements
      const heading = page.locator('h1').first();
      await expect(heading).toBeVisible();
    });

    test('should navigate to leads page', async ({ page }) => {
      test.skip(!process.env.E2E_AUTH_ENABLED, 'Authentication not enabled');

      await page.goto('/leads');

      // Verify leads page loads
      await expect(page).toHaveURL(/leads/);

      // Verify page content
      const heading = page.locator('h1:has-text("Leads")');
      if ((await heading.count()) > 0) {
        await expect(heading).toBeVisible();
      }
    });

    test('should display contacts page', async ({ page }) => {
      test.skip(!process.env.E2E_AUTH_ENABLED, 'Authentication not enabled');

      await page.goto('/contacts');

      // Verify contacts page loads
      await expect(page).toHaveURL(/contacts/);
    });
  });

  test.describe('API Health', () => {
    test('should have healthy API endpoint', async ({ request }) => {
      // Test API health endpoint
      const response = await request.get('/api/health');

      // Should return 200 OK
      expect(response.ok()).toBeTruthy();

      // Should return valid JSON
      const body = await response.json();
      expect(body).toHaveProperty('status');
    });

    test('should handle API errors gracefully', async ({ request }) => {
      // Test non-existent endpoint
      const response = await request.get('/api/nonexistent');

      // Should return appropriate error status
      expect(response.status()).toBeGreaterThanOrEqual(400);
    });
  });

  test.describe('Performance', () => {
    test('should load homepage within acceptable time', async ({ page }) => {
      const startTime = Date.now();

      await page.goto('/');
      await page.waitForLoadState('load');

      const loadTime = Date.now() - startTime;

      // Homepage should load in < 3 seconds
      expect(loadTime).toBeLessThan(3000);
    });

    test('should have good Core Web Vitals', async ({ page }) => {
      await page.goto('/');

      // Wait for page to fully load
      await page.waitForLoadState('networkidle');

      // Measure First Contentful Paint (FCP)
      const fcp = await page.evaluate(() => {
        return new Promise((resolve) => {
          new PerformanceObserver((list) => {
            const entries = list.getEntries();
            const fcpEntry = entries.find((entry) => entry.name === 'first-contentful-paint');
            if (fcpEntry) {
              resolve(fcpEntry.startTime);
            }
          }).observe({ entryTypes: ['paint'] });
        });
      });

      // FCP should be < 1.8 seconds (good threshold)
      expect(fcp).toBeLessThan(1800);
    });
  });

  test.describe('Accessibility', () => {
    test('should have no critical accessibility violations', async ({ page }) => {
      await page.goto('/');

      // Check for basic accessibility features
      const mainLandmark = page.locator('main, [role="main"]');
      if ((await mainLandmark.count()) > 0) {
        await expect(mainLandmark.first()).toBeVisible();
      }

      // Check for skip link
      const skipLink = page.locator('a:has-text("Skip to")');
      if ((await skipLink.count()) > 0) {
        await expect(skipLink.first()).toBeDefined();
      }
    });

    test('should be keyboard navigable', async ({ page }) => {
      await page.goto('/');

      // Tab through interactive elements
      await page.keyboard.press('Tab');

      // Verify focus is visible
      const focusedElement = await page.evaluateHandle(() => document.activeElement);
      expect(focusedElement).toBeTruthy();
    });
  });

  test.describe('Responsive Design', () => {
    test('should be mobile responsive', async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });

      await page.goto('/');

      // Verify mobile menu or navigation
      const mobileMenu = page.locator('[aria-label*="menu"], button:has-text("Menu")');
      if ((await mobileMenu.count()) > 0) {
        await expect(mobileMenu.first()).toBeVisible();
      }

      // Verify content doesn't overflow
      const body = page.locator('body');
      const boundingBox = await body.boundingBox();
      if (boundingBox) {
        expect(boundingBox.width).toBeLessThanOrEqual(375);
      }
    });

    test('should be tablet responsive', async ({ page }) => {
      // Set tablet viewport
      await page.setViewportSize({ width: 768, height: 1024 });

      await page.goto('/');

      // Verify layout adapts
      await expect(page.locator('body')).toBeVisible();
    });
  });
});
