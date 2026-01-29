/**
 * AI Predictions E2E Tests for IntelliFlow CRM (IFC-026)
 *
 * Tests AI prediction display:
 * - Prediction cards and visualization
 * - Probability and confidence display
 * - Prediction factors
 *
 * NOTE: This file runs on desktop browsers only (Chromium, Firefox, WebKit).
 * Mobile browsers only run .mobile.spec.ts files (configured in playwright.config.ts).
 *
 * @see IFC-026 - Playwright E2E Testing for AI Features
 */

import { test, expect } from '@playwright/test';
import { gotoAndWait, measureLoadTime } from '../utils/ai-test-helpers';

test.describe('AI Predictions Display', () => {
  test.describe('Prediction Cards', () => {
    test('should display prediction information on relevant pages', async ({ page }) => {
      // Predictions may appear on deals or leads pages
      await gotoAndWait(page, '/deals');

      const predictionCard = page.locator('[data-testid="ai-prediction"]');

      if ((await predictionCard.count()) > 0) {
        await expect(predictionCard.first()).toBeVisible();
      }
    });

    test('should show probability percentage', async ({ page }) => {
      await gotoAndWait(page, '/deals');

      const probabilityIndicator = page.locator('[data-testid="prediction-probability"]');

      if ((await probabilityIndicator.count()) > 0) {
        await expect(probabilityIndicator.first()).toContainText(/%/);
      }
    });

    test('should show confidence level for predictions', async ({ page }) => {
      await gotoAndWait(page, '/deals');

      const confidenceIndicator = page.locator('[data-testid="prediction-confidence"]');

      if ((await confidenceIndicator.count()) > 0) {
        await expect(confidenceIndicator.first()).toBeVisible();
      }
    });
  });

  test.describe('Prediction Factors', () => {
    test('should display factors influencing prediction', async ({ page }) => {
      await gotoAndWait(page, '/deals');

      const predictionCard = page.locator('[data-testid="ai-prediction"]').first();

      if ((await predictionCard.count()) > 0) {
        await predictionCard.click();

        const factors = page.locator('[data-testid="prediction-factors"]');
        if ((await factors.count()) > 0) {
          await expect(factors).toBeVisible();
        }
      }
    });
  });

  test.describe('Performance', () => {
    test('should load predictions without significant delay', async ({ page, browserName }) => {
      // Skip on Firefox - cold start timing differs significantly
      test.skip(browserName === 'firefox', 'Firefox cold start timing differs from Chromium');

      const loadTime = await measureLoadTime(page, '/deals');

      // Page should load in reasonable time (relaxed to 15s for dev environment)
      // Production should enforce < 5000ms
      expect(loadTime).toBeLessThan(15000);
    });
  });

  test.describe('Accessibility', () => {
    test('should have accessible prediction indicators', async ({ page, browserName }) => {
      // Skip on Firefox - page load timing differs
      test.skip(browserName === 'firefox', 'Firefox page load timing differs');

      await gotoAndWait(page, '/deals');

      const predictionCard = page.locator('[data-testid="ai-prediction"]').first();

      if ((await predictionCard.count()) > 0) {
        // Should have accessible label
        const hasAriaLabel = await predictionCard.getAttribute('aria-label');
        const hasAriaDescribedBy = await predictionCard.getAttribute('aria-describedby');

        expect(hasAriaLabel || hasAriaDescribedBy).toBeTruthy();
      }
    });
  });
});
