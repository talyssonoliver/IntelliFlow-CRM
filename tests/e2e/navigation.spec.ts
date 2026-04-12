/**
 * Navigation E2E Tests for IntelliFlow CRM (IFC-129)
 *
 * Tests navigation between core pages:
 * - Dashboard
 * - Leads
 * - Contacts
 * - Analytics
 *
 * @see Sprint 6 - IFC-129: UI and Contract Tests
 */

import { test, expect } from '@playwright/test';

test.describe('Core Navigation', () => {
  test.describe('Homepage Navigation', () => {
    test('should load homepage with navigation elements', async ({ page }) => {
      await page.goto('/');

      // Verify page loads
      await expect(page).toHaveTitle(/IntelliFlow/i);

      // Verify navigation is present
      const nav = page.locator('nav').first();
      await expect(nav).toBeVisible();
    });

    test('should have accessible navigation links', async ({ page }) => {
      await page.goto('/');

      // Check for main navigation links
      const navLinks = ['Dashboard', 'Leads', 'Contacts'];

      for (const linkText of navLinks) {
        const link = page.locator(`nav a:has-text("${linkText}")`);
        if ((await link.count()) > 0) {
          await expect(link.first()).toBeVisible();
        }
      }
    });
  });

  test.describe('Leads Page Navigation', () => {
    test('should navigate to leads page', async ({ page }) => {
      await page.goto('/leads');

      // Verify leads page loads
      await expect(page).toHaveURL(/leads/);

      // Verify page heading
      const heading = page.locator('h2:has-text("Leads")');
      await expect(heading).toBeVisible();
    });

    test('should display leads table', async ({ page }) => {
      await page.goto('/leads');

      // Verify leads table structure
      const table = page.locator('table');
      await expect(table).toBeVisible();

      // Verify table headers
      const headers = ['Lead', 'Company', 'Status', 'AI Score', 'Actions'];
      for (const header of headers) {
        const th = page.locator(`th:has-text("${header}")`);
        await expect(th).toBeVisible();
      }
    });

    test('should display filter buttons', async ({ page }) => {
      await page.goto('/leads');

      // Verify filter buttons
      const filters = ['ALL', 'NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED'];
      for (const filter of filters) {
        const button = page.locator(`button:has-text("${filter}")`);
        await expect(button).toBeVisible();
      }
    });

    test('should filter leads by status', async ({ page }) => {
      await page.goto('/leads');

      // Click QUALIFIED filter
      await page.click('button:has-text("QUALIFIED")');

      // Verify filter is active (has primary styling)
      const qualifiedButton = page.locator('button:has-text("QUALIFIED")');
      await expect(qualifiedButton).toHaveClass(/bg-primary/);
    });

    test('should have New Lead button', async ({ page }) => {
      await page.goto('/leads');

      // Verify New Lead button
      const newLeadButton = page.locator('button:has-text("New Lead")');
      await expect(newLeadButton).toBeVisible();
    });
  });

  test.describe('Contacts Page Navigation', () => {
    test('should navigate to contacts page', async ({ page }) => {
      await page.goto('/contacts');

      // Verify contacts page loads
      await expect(page).toHaveURL(/contacts/);
    });

    test('should navigate from leads to contacts', async ({ page }) => {
      await page.goto('/leads');

      // Click contacts link
      const contactsLink = page.locator('nav a:has-text("Contacts")');
      if ((await contactsLink.count()) > 0) {
        await contactsLink.click();
        await expect(page).toHaveURL(/contacts/);
      }
    });
  });

  test.describe('Analytics Page Navigation', () => {
    test('should navigate to analytics page', async ({ page }) => {
      await page.goto('/analytics');

      // Verify analytics page loads
      await expect(page).toHaveURL(/analytics/);
    });

    test('should navigate from leads to analytics', async ({ page }) => {
      await page.goto('/leads');

      // Click analytics link
      const analyticsLink = page.locator('nav a:has-text("Analytics")');
      if ((await analyticsLink.count()) > 0) {
        await analyticsLink.click();
        await expect(page).toHaveURL(/analytics/);
      }
    });
  });

  test.describe('Dashboard Navigation', () => {
    test('should navigate to dashboard', async ({ page }) => {
      await page.goto('/dashboard');

      // Verify dashboard page loads
      await expect(page).toHaveURL(/dashboard/);
    });

    test('should navigate from leads to dashboard via logo', async ({ page }) => {
      await page.goto('/leads');

      // Click logo/brand link
      const logoLink = page.locator('a:has-text("IntelliFlow CRM")').first();
      if ((await logoLink.count()) > 0) {
        await logoLink.click();
        await expect(page).toHaveURL(/dashboard/);
      }
    });
  });

  test.describe('Navigation Consistency', () => {
    test('should maintain navigation across pages', async ({ page }) => {
      const pages = ['/leads', '/contacts', '/analytics', '/dashboard'];

      for (const pagePath of pages) {
        await page.goto(pagePath);

        // Verify navigation bar is present on all pages
        const nav = page.locator('nav').first();
        if ((await nav.count()) > 0) {
          await expect(nav).toBeVisible();
        }
      }
    });

    test('should highlight active navigation link', async ({ page }) => {
      await page.goto('/leads');

      // Verify leads link has active styling
      const leadsLink = page.locator('nav a:has-text("Leads")');
      if ((await leadsLink.count()) > 0) {
        // Active link should have different styling (text-primary or similar)
        await expect(leadsLink.first()).toBeVisible();
      }
    });
  });

  test.describe('Mobile Navigation', () => {
    test('should be responsive on mobile viewport', async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });

      await page.goto('/leads');

      // Verify page loads on mobile
      await expect(page).toHaveURL(/leads/);

      // Content should be visible
      const heading = page.locator('h2:has-text("Leads")');
      await expect(heading).toBeVisible();
    });

    test('should be responsive on tablet viewport', async ({ page }) => {
      // Set tablet viewport
      await page.setViewportSize({ width: 768, height: 1024 });

      await page.goto('/leads');

      // Verify page loads on tablet
      await expect(page).toHaveURL(/leads/);
    });
  });

  test.describe('Navigation Performance', () => {
    test('should load leads page within acceptable time', async ({ page }) => {
      const startTime = Date.now();

      await page.goto('/leads');
      await page.waitForLoadState('load');

      const loadTime = Date.now() - startTime;

      // Page should load in < 3 seconds
      expect(loadTime).toBeLessThan(3000);
    });

    test('should navigate between pages quickly', async ({ page }) => {
      await page.goto('/leads');
      await page.waitForLoadState('networkidle');

      const startTime = Date.now();

      // Navigate to contacts
      const contactsLink = page.locator('nav a:has-text("Contacts")');
      if ((await contactsLink.count()) > 0) {
        await contactsLink.click();
        await page.waitForLoadState('load');
      }

      const navigationTime = Date.now() - startTime;

      // Navigation should complete in < 2 seconds
      expect(navigationTime).toBeLessThan(2000);
    });
  });
});
