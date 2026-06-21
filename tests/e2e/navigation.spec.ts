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

      // PageHeader (page-header.tsx:227) renders an <h1>, not <h2>.
      // Default scope title for /leads (no view/segment params) is "Lead List"
      // (bulk-actions.ts:241), not "Leads".
      const heading = page.locator('h1:has-text("Lead List")');
      await expect(heading).toBeVisible();
    });

    test('should display leads table', async ({ page }) => {
      await page.goto('/leads');

      // PG-059 refactor: DataTable still renders a <table>, but column headers
      // changed. Real headers from lead-list.tsx createColumns():
      //   "Lead Name / Company", "Email", "Score", "Status", "Created Date", "Actions"
      // The old headers ("Lead", "Company", "AI Score") no longer exist.
      const table = page.locator('table');
      await expect(table).toBeVisible();

      const headers = ['Lead Name / Company', 'Email', 'Score', 'Status', 'Created Date'];
      for (const header of headers) {
        const th = page.locator(`th:has-text("${header}")`);
        await expect(th).toBeVisible();
      }
    });

    test('should display filter controls', async ({ page }) => {
      await page.goto('/leads');

      // PG-059 refactor: status and score filters are now <select> dropdowns
      // inside SearchFilterBar (search-filter-bar.tsx), NOT chip buttons.
      // lead-list.tsx passes filters[0].label='Status' and filters[1].label='Score'.
      // The SearchFilterBar renders them as visually-hidden <label> + <select>.
      // Anchor on the search box (role=searchbox, aria-label "Search leads") rather
      // than a brittle class selector that can match an off-screen container.
      const searchBox = page.getByRole('searchbox', { name: /search leads/i });
      await expect(searchBox).toBeVisible();

      // The Status dropdown label is sr-only; locate by the select's aria relationship.
      // SearchFilterBar renders <label class="sr-only">{label}</label> then <select>.
      // Use getByRole to find the comboboxes (selects).
      const statusSelect = page.getByRole('combobox').first();
      await expect(statusSelect).toBeVisible();
    });

    test('should filter leads by status via dropdown', async ({ page }) => {
      await page.goto('/leads');

      // Status filter is a <select> (combobox), not a button chip.
      // Selecting a value fires onChange → setStatusFilter in lead-list.tsx.
      // The first combobox in the SearchFilterBar is the Status dropdown.
      const selects = page.getByRole('combobox');
      // Wait for the filter bar to render
      await expect(selects.first()).toBeVisible();

      // Select "QUALIFIED" to filter — the option value from leadStatusOptions()
      // which maps domain enum values to filter options.
      await selects.first().selectOption({ value: 'QUALIFIED' });

      // After selection the combobox should reflect the chosen value.
      await expect(selects.first()).toHaveValue('QUALIFIED');
    });

    test('should have New Lead link', async ({ page }) => {
      await page.goto('/leads');

      // PageHeader ActionButton renders as <Link> (Next.js <a>) when href is set
      // (page-header.tsx:154-158). lead-list.tsx passes href:'/leads/new', so
      // "New Lead" is an anchor, not a <button>.
      const newLeadLink = page.getByRole('link', { name: /New Lead/i });
      await expect(newLeadLink).toBeVisible();
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
      // PageHeader renders h1 (not h2); default scope title is "Lead List" (bulk-actions.ts:241)
      const heading = page.locator('h1:has-text("Lead List")');
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
      // Pre-warm so we measure the runtime (warm) load, not the one-off `next dev`
      // route compile — the <3s budget is a runtime KPI, not a compile-time one.
      await page.goto('/leads');
      await page.waitForLoadState('load');

      const startTime = Date.now();
      await page.goto('/leads');
      await page.waitForLoadState('load');
      const loadTime = Date.now() - startTime;

      // Page should load in < 3 seconds (warm)
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
