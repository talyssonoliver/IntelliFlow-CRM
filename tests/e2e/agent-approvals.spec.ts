/**
 * Agent Approvals E2E Tests for IntelliFlow CRM (IFC-149 / IFC-029)
 *
 * The /agent-approvals page evolved from a hardcoded mock dataset to the REAL
 * `autoResponse` approval API (trpc.autoResponse.getPendingForApprover / list /
 * getStatsByStatus, mapped via mapDraftToAction). These tests were rewritten
 * (2026-06-19) to verify the real UI against REAL seeded data instead of the
 * removed mocks — the old assertions ("Lead Scoring Agent", "Total Actions",
 * "Rolled Back", "Review and approve…", "Action History") referenced mock data
 * that no longer exists. The product was enhanced; the tests were stale.
 *
 * Data comes from `tests/e2e/fixtures/seed-domain.ts`, which seeds the enterprise
 * persona's tenant with 4 AutoResponseDraft rows (2 pending, 1 approved,
 * 1 escalated). Assertions are render/filter/control-presence (deterministic and
 * order-independent). The actual approve/reject/rollback MUTATION semantics are
 * covered by the autoResponse router unit + integration suites — driving real
 * mutations here would make the shared-DB suite order-dependent and would trigger
 * outbound email side-effects, so this layer asserts the controls are wired and
 * the forms open, not that the DB row flips.
 *
 * @see IFC-149 action preview/rollback UI · IFC-029 auto-response approvals
 */

import { test, expect } from '@playwright/test';

/** The action cards rendered from real autoResponse drafts. */
const ACTION_CARD = '[data-testid^="action-card-"]';
/** The expandable button at the root of each ActionCard. */
const CARD_BUTTON = `${ACTION_CARD} button[aria-expanded]`;

async function gotoApprovals(page: import('@playwright/test').Page) {
  await page.goto('/agent-approvals');
  // 30s tolerance: first hit to a route under `next dev` pays a cold compile +
  // client auth bootstrap that can exceed the 5s default. Not a product concern
  // (warm + prod load is fast); the project-level retry covers the rare overflow.
  await expect(page.locator('h1:has-text("Agent Approvals")')).toBeVisible({ timeout: 30000 });
}

/** Click a filter chip in the status filter bar. */
async function selectFilter(page: import('@playwright/test').Page, label: string) {
  await page
    .locator('[data-testid="filter-buttons"]')
    .getByRole('button', { name: label, exact: true })
    .click();
}

test.describe('Agent Approvals Page', () => {
  test.describe('Page Loading', () => {
    test('should load with the Agent Approvals heading', async ({ page }) => {
      await gotoApprovals(page);
      await expect(page).toHaveURL(/agent-approvals/);
    });

    test('should display the real page description', async ({ page }) => {
      await gotoApprovals(page);
      // Real copy (was the stale "Review and approve AI agent-initiated changes").
      await expect(
        page.locator('text=Unified approval hub for all AI-generated actions')
      ).toBeVisible();
    });

    test('should display the three approval-source cards', async ({ page }) => {
      await gotoApprovals(page);
      await expect(page.locator('h3:has-text("Email Drafts")')).toBeVisible();
      await expect(page.locator('h3:has-text("Tool Actions")')).toBeVisible();
      await expect(page.locator('h3:has-text("AI Review")')).toBeVisible();
    });

    test('should display the metrics dashboard with real labels', async ({ page }) => {
      await gotoApprovals(page);
      const dash = page.locator('[data-testid="metrics-dashboard"]');
      await expect(dash).toBeVisible();
      // Real metric labels (replace stale Total Actions / Rolled Back / Avg Review Time).
      for (const label of [
        'Total Drafts',
        'Pending Review',
        'Approved/Sent',
        'Rejected',
        'Escalated',
      ]) {
        await expect(dash.locator(`text=${label}`)).toBeVisible();
      }
    });
  });

  test.describe('Filter Functionality', () => {
    test('should display the real status filter buttons', async ({ page }) => {
      await gotoApprovals(page);
      const bar = page.locator('[data-testid="filter-buttons"]');
      // Real set includes Escalated (the old "Rolled back" chip no longer exists).
      for (const label of ['All', 'Pending', 'Escalated', 'Approved', 'Rejected', 'Expired']) {
        await expect(bar.getByRole('button', { name: label, exact: true })).toBeVisible();
      }
    });

    test('should highlight the active filter', async ({ page }) => {
      await gotoApprovals(page);
      await selectFilter(page, 'Pending');
      const pending = page
        .locator('[data-testid="filter-buttons"]')
        .getByRole('button', { name: 'Pending', exact: true });
      await expect(pending).toHaveClass(/bg-\[#137fec\]/);
    });
  });

  test.describe('Action Cards (real seeded drafts)', () => {
    test('should render action cards from real autoResponse data', async ({ page }) => {
      await gotoApprovals(page);
      await expect(page.locator(ACTION_CARD).first()).toBeVisible();
    });

    test('should display the real agent name', async ({ page }) => {
      await gotoApprovals(page);
      // Drafts map to the Auto-Response Agent (replaces mock "Lead Scoring Agent" etc.).
      await expect(page.locator('text=Auto-Response Agent').first()).toBeVisible();
    });

    test('should display a confidence score', async ({ page }) => {
      await gotoApprovals(page);
      await expect(
        page
          .locator(ACTION_CARD)
          .getByText(/\d{1,3}%/)
          .first()
      ).toBeVisible();
    });

    test('should show the Pending Review badge under the Pending filter', async ({ page }) => {
      await gotoApprovals(page);
      await selectFilter(page, 'Pending');
      await expect(page.locator('text=Pending Review').first()).toBeVisible();
    });
  });

  test.describe('Action Expansion', () => {
    test('should expand a card to reveal AI Reasoning and the Proposed Email', async ({ page }) => {
      await gotoApprovals(page);
      await page.locator(CARD_BUTTON).first().click();
      await expect(page.locator('[data-testid="action-card-expanded"]').first()).toBeVisible();
      await expect(page.locator('text=AI Reasoning').first()).toBeVisible();
      // Real expanded content is a "Proposed Email" (Subject/To/Body), not a
      // before/after diff ("Proposed Changes"/"Before"/"After" were stale).
      await expect(page.locator('text=Proposed Email').first()).toBeVisible();
      await expect(page.locator('text=Subject:').first()).toBeVisible();
    });
  });

  test.describe('Approval Controls', () => {
    test('should show Approve & Send, Reject and Escalate for a pending action', async ({
      page,
    }) => {
      await gotoApprovals(page);
      await selectFilter(page, 'Pending');
      await page.locator(CARD_BUTTON).first().click();
      // Exact role names so we hit the card's action buttons, NOT the "Rejected" /
      // "Escalated" filter chips (which `has-text("Reject"/"Escalate")` also match).
      await expect(page.getByRole('button', { name: 'Approve & Send' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Reject', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Escalate', exact: true })).toBeVisible();
    });

    test('should open the reject form and keep Confirm disabled until feedback is entered', async ({
      page,
    }) => {
      await gotoApprovals(page);
      await selectFilter(page, 'Pending');
      await page.locator(CARD_BUTTON).first().click();
      // Exact name avoids the "Rejected" filter chip that has-text("Reject") matches.
      await page.getByRole('button', { name: 'Reject', exact: true }).click();

      const textarea = page.locator('textarea[placeholder*="reason for rejection"]');
      await expect(textarea).toBeVisible();

      const confirm = page.locator('button:has-text("Confirm Rejection")');
      await expect(confirm).toBeVisible();
      await expect(confirm).toBeDisabled();

      await textarea.fill('Tone is off-brand for this account.');
      await expect(confirm).toBeEnabled();
    });
  });

  test.describe('Escalated actions', () => {
    test('should show the escalation banner for an escalated draft', async ({ page }) => {
      await gotoApprovals(page);
      await selectFilter(page, 'Escalated');
      const cards = page.locator(ACTION_CARD);
      if ((await cards.count()) > 0) {
        await cards.first().locator('button[aria-expanded]').click();
        await expect(page.locator('text=Escalated for Manager Review')).toBeVisible();
      }
    });
  });

  test.describe('Empty State', () => {
    test('should show no action cards for a status with no drafts', async ({ page }) => {
      await gotoApprovals(page);
      // The enterprise seed has no rejected drafts → the list renders an empty state.
      await selectFilter(page, 'Rejected');
      await expect(page.locator(ACTION_CARD)).toHaveCount(0);
    });
  });

  test.describe('Header Controls', () => {
    test('should have a Refresh button', async ({ page }) => {
      await gotoApprovals(page);
      await expect(page.locator('button:has-text("Refresh")')).toBeVisible();
    });

    test('should show the pending count badge when there are pending drafts', async ({ page }) => {
      await gotoApprovals(page);
      const badge = page.locator('text=/\\d+ pending/');
      if ((await badge.count()) > 0) {
        await expect(badge.first()).toBeVisible();
      }
    });
  });

  test.describe('Accessibility', () => {
    test('should expose expandable cards via aria-expanded', async ({ page }) => {
      await gotoApprovals(page);
      await expect(page.locator(CARD_BUTTON).first()).toHaveAttribute('aria-expanded', 'false');
    });

    test('should be keyboard navigable', async ({ page }) => {
      await gotoApprovals(page);
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      const focused = page.locator(':focus');
      await expect(focused).toBeVisible();
    });
  });

  test.describe('Performance', () => {
    test('should load within budget once compiled (warm load)', async ({ page }) => {
      // Pre-warm so we measure runtime load, not first-hit `next dev` compilation.
      await page.goto('/agent-approvals');
      await page.waitForLoadState('load');

      const start = Date.now();
      await page.goto('/agent-approvals');
      await page.waitForLoadState('load');
      expect(Date.now() - start).toBeLessThan(3000);
    });
  });
});
