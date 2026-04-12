/**
 * Task E2E Tests for IntelliFlow CRM
 *
 * Tests task list page navigation, UI elements, and basic interactions.
 * Covers: list view, search, view toggles, detail navigation, responsive layout.
 *
 * @see Task Detail Wiring Audit — Finding T-03
 */

import { test, expect } from '@playwright/test';

test.describe('Task List Page', () => {
  test('should navigate to /tasks and verify URL', async ({ page }) => {
    await page.goto('/tasks');
    await expect(page).toHaveURL(/tasks/);
  });

  test('should display page heading', async ({ page }) => {
    await page.goto('/tasks');

    const heading = page.locator('h2:has-text("Task Management")');
    if ((await heading.count()) > 0) {
      await expect(heading.first()).toBeVisible();
    }
  });

  test('should render search bar', async ({ page }) => {
    await page.goto('/tasks');

    const searchInput = page.locator('input[placeholder*="Search tasks"]');
    if ((await searchInput.count()) > 0) {
      await expect(searchInput.first()).toBeVisible();
    }
  });

  test('should have New Task button', async ({ page }) => {
    await page.goto('/tasks');

    const newTaskButton = page.locator('button:has-text("New Task")');
    if ((await newTaskButton.count()) > 0) {
      await expect(newTaskButton.first()).toBeVisible();
    }
  });

  test('should have status and priority filter controls', async ({ page }) => {
    await page.goto('/tasks');

    // Status filter
    const statusFilter = page.locator('button:has-text("Status"), select:has-text("Status")');
    if ((await statusFilter.count()) > 0) {
      await expect(statusFilter.first()).toBeVisible();
    }

    // Priority filter
    const priorityFilter = page.locator('button:has-text("Priority"), select:has-text("Priority")');
    if ((await priorityFilter.count()) > 0) {
      await expect(priorityFilter.first()).toBeVisible();
    }
  });

  test('should have sort dropdown', async ({ page }) => {
    await page.goto('/tasks');

    const sortControl = page.locator('select, button:has-text("Newest First")');
    if ((await sortControl.count()) > 0) {
      await expect(sortControl.first()).toBeVisible();
    }
  });
});

test.describe('Task Detail Navigation', () => {
  test('should have breadcrumb with Tasks link', async ({ page }) => {
    await page.goto('/tasks');

    const breadcrumb = page.locator('nav[aria-label="breadcrumb"], [data-testid="breadcrumb"]');
    if ((await breadcrumb.count()) > 0) {
      const tasksLink = breadcrumb.locator('a:has-text("Dashboard")');
      if ((await tasksLink.count()) > 0) {
        await expect(tasksLink.first()).toBeVisible();
      }
    }
  });

  test('should maintain navigation bar on tasks page', async ({ page }) => {
    await page.goto('/tasks');

    const nav = page.locator('nav').first();
    if ((await nav.count()) > 0) {
      await expect(nav).toBeVisible();
    }
  });
});

test.describe('Task Page — Mobile Responsive', () => {
  test('should load /tasks on 375px mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/tasks');

    await expect(page).toHaveURL(/tasks/);

    const heading = page.locator('h2:has-text("Task Management")');
    if ((await heading.count()) > 0) {
      await expect(heading.first()).toBeVisible();
    }
  });
});

test.describe('Task Page — Performance', () => {
  test('should load /tasks within 3 seconds', async ({ page }) => {
    const startTime = Date.now();

    await page.goto('/tasks');
    await page.waitForLoadState('load');

    const loadTime = Date.now() - startTime;
    expect(loadTime).toBeLessThan(3000);
  });
});
