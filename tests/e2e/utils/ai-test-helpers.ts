/**
 * AI Test Helpers for IntelliFlow CRM E2E Tests (IFC-026)
 *
 * Shared utilities for AI feature E2E testing:
 * - Navigation helpers
 * - Score verification
 * - Approval workflow helpers
 * - Accessibility testing
 * - Performance measurement
 *
 * @see IFC-026 - Playwright E2E Testing for AI Features
 */

import { Page, Locator, expect } from '@playwright/test';
import { CONFIDENCE_THRESHOLDS } from '../fixtures/ai-mock-data';

/**
 * Wait for element state change or short timeout (browser-safe)
 * Uses expect with timeout instead of fixed waitForTimeout
 */
export async function waitForElementOrTimeout(
  page: Page,
  locator: Locator | string,
  timeout = 1000
): Promise<void> {
  const element = typeof locator === 'string' ? page.locator(locator) : locator;
  try {
    await expect(element).toBeVisible({ timeout });
  } catch {
    // Element might not exist, which is acceptable for optional waits
  }
}

/**
 * Wait for content to stabilize after an action
 */
export async function waitForContentStable(page: Page, timeout = 2000): Promise<void> {
  await page.waitForLoadState('domcontentloaded', { timeout });
  // Brief pause for any animations - this is more reliable than fixed timeout
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

/**
 * Navigate to a page and wait for it to be ready
 */
export async function gotoAndWait(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForLoadState('networkidle');
}

/**
 * Get confidence level class based on score (0-100 scale)
 */
export function getConfidenceLevel(confidence: number): 'high' | 'medium' | 'low' {
  if (confidence >= CONFIDENCE_THRESHOLDS.HIGH) return 'high';
  if (confidence >= CONFIDENCE_THRESHOLDS.MEDIUM) return 'medium';
  return 'low';
}

/**
 * Verify a lead score is displayed correctly
 */
export async function expectLeadScore(
  page: Page,
  leadId: string,
  expectedScore: number
): Promise<void> {
  const scoreElement = page.locator(`[data-testid="lead-score-${leadId}"]`);
  await expect(scoreElement).toBeVisible();
  await expect(scoreElement).toContainText(String(expectedScore));
}

/**
 * Verify confidence indicator styling matches expected level
 */
export async function expectConfidenceIndicator(
  page: Page,
  selector: string,
  expectedLevel: 'high' | 'medium' | 'low'
): Promise<void> {
  const indicator = page.locator(selector);
  await expect(indicator).toBeVisible();

  const classMap = {
    high: /bg-green|text-green|confidence-high/,
    medium: /bg-amber|bg-yellow|text-amber|confidence-medium/,
    low: /bg-red|text-red|confidence-low/,
  };

  await expect(indicator).toHaveClass(classMap[expectedLevel]);
}

/**
 * Wait for agent action card to be visible
 */
export async function waitForAgentActionCard(page: Page, actionId: string): Promise<Locator> {
  const card = page.locator(`[data-testid="action-card-${actionId}"]`);
  await expect(card).toBeVisible();
  return card;
}

/**
 * Expand an agent action card if not already expanded
 */
export async function expandActionCard(card: Locator): Promise<void> {
  const isExpanded = await card.getAttribute('aria-expanded');
  if (isExpanded !== 'true') {
    await card.click();
    // Wait for expansion state to change instead of fixed timeout
    await expect(card).toHaveAttribute('aria-expanded', 'true', { timeout: 5000 });
  }
}

/**
 * Perform approval workflow action (approve, reject, or rollback)
 */
export async function performApprovalAction(
  page: Page,
  actionId: string,
  action: 'approve' | 'reject' | 'rollback',
  feedback?: string
): Promise<void> {
  const card = await waitForAgentActionCard(page, actionId);
  await expandActionCard(card);

  const buttonText = {
    approve: 'Approve',
    reject: 'Reject',
    rollback: 'Rollback',
  };

  await page.click(`button:has-text("${buttonText[action]}")`);

  if ((action === 'reject' || action === 'rollback') && feedback) {
    await page.fill('textarea', feedback);
    await page.click('button:has-text("Confirm")');
  }

  // Wait for action to complete by checking for status change or network idle
  await page.waitForLoadState('networkidle', { timeout: 10000 });
}

/**
 * Verify metrics card displays expected value
 */
export async function expectMetricValue(
  page: Page,
  metricName: string,
  expectedValue: string | number
): Promise<void> {
  const metricCard = page.locator(`[data-testid="metric-${metricName}"]`);
  await expect(metricCard).toContainText(String(expectedValue));
}

/**
 * Wait for page load and verify no critical errors in console
 */
export async function verifyPageLoadsWithoutErrors(page: Page): Promise<void> {
  const errors: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });

  await page.waitForLoadState('networkidle');

  const criticalErrors = errors.filter(
    (error) => !error.includes('DevTools') && !error.includes('Warning')
  );

  expect(criticalErrors).toHaveLength(0);
}

/**
 * Measure page load time in milliseconds
 */
export async function measureLoadTime(page: Page, url: string): Promise<number> {
  const startTime = Date.now();
  await page.goto(url);
  await page.waitForLoadState('load');
  return Date.now() - startTime;
}

/**
 * Capture screenshot with stable state (disabled animations)
 */
export async function captureStableScreenshot(locator: Locator, name: string): Promise<void> {
  const page = locator.page();

  // Wait for any animations to complete
  await page.waitForTimeout(500);
  await page.waitForLoadState('networkidle');

  await expect(locator).toHaveScreenshot(name, {
    animations: 'disabled',
    mask: [page.locator('[data-testid="timestamp"]'), page.locator('[data-testid="relative-time"]')],
  });
}

/**
 * Verify ARIA attributes for accessibility
 */
export async function verifyAriaAttributes(
  locator: Locator,
  expectedAttributes: Record<string, string>
): Promise<void> {
  for (const [attr, value] of Object.entries(expectedAttributes)) {
    await expect(locator).toHaveAttribute(`aria-${attr}`, value);
  }
}

/**
 * Test keyboard navigation through elements
 */
export async function testKeyboardNavigation(
  page: Page,
  startSelector: string,
  expectedFocusCount: number
): Promise<void> {
  await page.click(startSelector);

  for (let i = 0; i < expectedFocusCount; i++) {
    await page.keyboard.press('Tab');
    const focused = page.locator(':focus');
    await expect(focused).toBeVisible();
  }
}

/**
 * Wait for element to be stable (no layout changes)
 */
export async function waitForStableElement(locator: Locator): Promise<void> {
  await locator.waitFor({ state: 'visible' });
  await locator.page().waitForTimeout(100);
}

/**
 * Get all visible action cards on the page
 */
export async function getVisibleActionCards(page: Page): Promise<Locator[]> {
  const cards = page.locator('[role="button"][aria-expanded]');
  const count = await cards.count();
  const result: Locator[] = [];

  for (let i = 0; i < count; i++) {
    const card = cards.nth(i);
    if (await card.isVisible()) {
      result.push(card);
    }
  }

  return result;
}

/**
 * Filter actions by status and return count
 */
export async function countActionsByStatus(
  page: Page,
  status: 'pending' | 'approved' | 'rejected' | 'rolled_back' | 'expired'
): Promise<number> {
  const cards = page.locator(`[data-status="${status}"]`);
  return await cards.count();
}
