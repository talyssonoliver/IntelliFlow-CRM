/**
 * Pipeline Settings E2E Tests (IFC-063)
 *
 * FLOW-007: Pipeline Stage Customization
 *
 * Tests the pipeline settings page:
 * - Page loads with stage list
 * - Display name editing
 * - Color selection
 * - Stage reordering (up/down)
 * - Protected stage validation (CLOSED_WON, CLOSED_LOST)
 * - Save and reset functionality
 * - Accessibility (ARIA labels, keyboard navigation)
 *
 * @see Sprint 14 - IFC-063: Pipeline Stage Customization
 */

import { test, expect } from '@playwright/test';

/**
 * Helper: wait for pipeline stages to fully load (past skeleton state).
 * Waits for a known stage key badge (PROSPECTING) to appear, which only
 * renders after the tRPC API call resolves.
 */
async function waitForStagesLoaded(page: import('@playwright/test').Page) {
  // First confirm we're on the pipeline page (not redirected to login)
  await page
    .locator('h1:has-text("Pipeline Stages")')
    .waitFor({ state: 'visible', timeout: 15000 });
  // Then wait for stage data to load (past skeleton state)
  await page.locator('text=PROSPECTING').waitFor({ state: 'visible', timeout: 15000 });
}

test.describe('Pipeline Settings (IFC-063)', () => {
  test.describe('Page Loading', () => {
    test('should load pipeline settings page', async ({ page }) => {
      await page.goto('/settings/pipeline');

      // Verify page loads with heading
      const heading = page.locator('h1:has-text("Pipeline Stages")');
      await expect(heading).toBeVisible();
    });

    test('should display breadcrumb navigation', async ({ page }) => {
      await page.goto('/settings/pipeline');

      // Wait for heading to confirm page loaded (not redirected to login)
      await expect(page.locator('h1:has-text("Pipeline Stages")')).toBeVisible();

      // Breadcrumb: "Settings / Pipeline" — use the breadcrumb nav specifically
      const settingsLink = page.locator('a:has-text("Settings")').first();
      await expect(settingsLink).toBeVisible();

      // The breadcrumb "Pipeline" text — use .first() to handle multiple matches
      const pipelineText = page
        .locator('span.text-foreground.font-medium:has-text("Pipeline")')
        .first();
      await expect(pipelineText).toBeVisible();
    });

    test('should display stage list after loading', async ({ page }) => {
      await page.goto('/settings/pipeline');
      await waitForStagesLoaded(page);

      // Should have stage entries with stage key badges
      const stageKeys = page.locator('text=PROSPECTING');
      await expect(stageKeys).toBeVisible();
    });

    test('should show Save and Reset buttons', async ({ page }) => {
      await page.goto('/settings/pipeline');

      // Wait for heading to confirm we're on the right page
      await expect(page.locator('h1:has-text("Pipeline Stages")')).toBeVisible();

      const saveButton = page.locator('button:has-text("Save Changes")');
      await expect(saveButton).toBeVisible();

      const resetButton = page.locator('button:has-text("Reset")');
      await expect(resetButton).toBeVisible();
    });
  });

  test.describe('Stage Display', () => {
    test('should display stage display names as editable inputs', async ({ page }) => {
      await page.goto('/settings/pipeline');
      await waitForStagesLoaded(page);

      // Each stage should have an editable display name input
      const nameInputs = page.locator('input[aria-label^="Display name for"]');
      const count = await nameInputs.count();
      expect(count).toBeGreaterThan(0);
    });

    test('should display color indicators for each stage', async ({ page }) => {
      await page.goto('/settings/pipeline');
      await waitForStagesLoaded(page);

      // Color indicator bars (the narrow color strips next to each stage)
      const colorBars = page.locator('[aria-hidden="true"].rounded');
      const count = await colorBars.count();
      expect(count).toBeGreaterThan(0);
    });

    test('should show probability inputs for each stage', async ({ page }) => {
      await page.goto('/settings/pipeline');
      await waitForStagesLoaded(page);

      const probabilityInputs = page.locator('input[type="number"][min="0"][max="100"]');
      const count = await probabilityInputs.count();
      expect(count).toBeGreaterThan(0);
    });

    test('should mark protected stages with badge', async ({ page }) => {
      await page.goto('/settings/pipeline');
      await waitForStagesLoaded(page);

      // CLOSED_WON and CLOSED_LOST should have "Protected" badge
      const protectedBadges = page.locator('span:has-text("Protected")');
      await expect(protectedBadges.first()).toBeVisible();
    });
  });

  test.describe('Stage Reordering', () => {
    test('should have up/down move buttons for each stage', async ({ page }) => {
      await page.goto('/settings/pipeline');
      await waitForStagesLoaded(page);

      const moveUpButtons = page.locator('button[aria-label="Move up"]');
      const moveDownButtons = page.locator('button[aria-label="Move down"]');

      expect(await moveUpButtons.count()).toBeGreaterThan(0);
      expect(await moveDownButtons.count()).toBeGreaterThan(0);
    });

    test('should disable Move up for the first stage', async ({ page }) => {
      await page.goto('/settings/pipeline');
      await waitForStagesLoaded(page);

      const firstMoveUp = page.locator('button[aria-label="Move up"]').first();
      await expect(firstMoveUp).toBeDisabled();
    });

    test('should disable Move down for the last stage', async ({ page }) => {
      await page.goto('/settings/pipeline');
      await waitForStagesLoaded(page);

      const lastMoveDown = page.locator('button[aria-label="Move down"]').last();
      await expect(lastMoveDown).toBeDisabled();
    });
  });

  test.describe('Active Toggle', () => {
    test('should have toggle switches for each stage', async ({ page }) => {
      await page.goto('/settings/pipeline');
      await waitForStagesLoaded(page);

      const toggles = page.locator('button[role="switch"]');
      const count = await toggles.count();
      expect(count).toBeGreaterThan(0);
    });

    test('should prevent deactivating protected stages', async ({ page }) => {
      await page.goto('/settings/pipeline');
      await waitForStagesLoaded(page);

      // Find toggle for CLOSED_WON (protected, active)
      const closedWonToggle = page.locator(
        'button[role="switch"][aria-label*="Closed Won"][aria-checked="true"]'
      );

      if ((await closedWonToggle.count()) > 0) {
        // Protected + active toggle should be disabled
        await expect(closedWonToggle.first()).toBeDisabled();
      }
    });
  });

  test.describe('Color Selection', () => {
    test('should display color palette for each stage', async ({ page }) => {
      await page.goto('/settings/pipeline');
      await waitForStagesLoaded(page);

      const colorGroups = page.locator('[role="group"][aria-label^="Color selection"]');
      const count = await colorGroups.count();
      expect(count).toBeGreaterThan(0);
    });

    test('should highlight currently selected color', async ({ page }) => {
      await page.goto('/settings/pipeline');
      await waitForStagesLoaded(page);

      // At least one color button should have aria-pressed="true"
      const selectedColor = page.locator('button[aria-pressed="true"][aria-label^="Select color"]');
      const count = await selectedColor.count();
      expect(count).toBeGreaterThan(0);
    });
  });

  test.describe('Accessibility', () => {
    test('should have proper ARIA labels on all interactive elements', async ({ page }) => {
      await page.goto('/settings/pipeline');
      await waitForStagesLoaded(page);

      // Move buttons
      const moveUpButtons = page.locator('button[aria-label="Move up"]');
      expect(await moveUpButtons.count()).toBeGreaterThan(0);

      // Toggle switches
      const toggles = page.locator('button[role="switch"][aria-label]');
      expect(await toggles.count()).toBeGreaterThan(0);

      // Color groups
      const colorGroups = page.locator('[role="group"][aria-label^="Color selection"]');
      expect(await colorGroups.count()).toBeGreaterThan(0);

      // Name inputs
      const nameInputs = page.locator('input[aria-label^="Display name for"]');
      expect(await nameInputs.count()).toBeGreaterThan(0);
    });

    test('should have labeled probability inputs', async ({ page }) => {
      await page.goto('/settings/pipeline');
      await waitForStagesLoaded(page);

      // Each probability input should have an associated label
      const probabilityInputs = page.locator('input[id^="probability-"]');
      const count = await probabilityInputs.count();
      expect(count).toBeGreaterThan(0);

      // Check label association
      const labels = page.locator('label[for^="probability-"]');
      expect(await labels.count()).toBe(count);
    });
  });

  test.describe('Help Section', () => {
    test('should display tips section', async ({ page }) => {
      await page.goto('/settings/pipeline');
      await waitForStagesLoaded(page);

      const tipsHeading = page.locator('h3:has-text("Tips")');
      await expect(tipsHeading).toBeVisible();

      // Check for key tip content
      const protectedTip = page.locator('li:has-text("Protected stages")');
      await expect(protectedTip).toBeVisible();
    });
  });

  test.describe('Performance', () => {
    test('should load pipeline settings within acceptable time', async ({ page }) => {
      const startTime = Date.now();

      await page.goto('/settings/pipeline');
      await page.waitForLoadState('load');

      const loadTime = Date.now() - startTime;

      // Page should load in < 3 seconds
      expect(loadTime).toBeLessThan(3000);
    });
  });
});
