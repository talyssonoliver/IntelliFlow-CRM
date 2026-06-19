import { test, expect } from '@playwright/test';

/**
 * AI Agent Approvals — RENDER SMOKE (trimmed).
 *
 * Same surface as agent-approvals.spec.ts (`/agent-approvals`). The approval
 * workflow (approve/reject/rollback, diff, reasoning, RBAC) is covered at the
 * unit/integration layer (agent approval-workflow + agent.router tests); the
 * extended UI assertions here were redundant E2E duplication. Reduced to a single
 * authenticated render smoke per docs/operations/e2e-pyramid-rationalization.md.
 */
test.describe('AI Agent Approvals — render smoke', () => {
  test('approvals surface renders authenticated', async ({ page }) => {
    await page.goto('/agent-approvals');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('h1:has-text("Agent Approvals")')).toBeVisible({ timeout: 15000 });
  });
});
