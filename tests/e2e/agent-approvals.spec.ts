import { test, expect } from '@playwright/test';

/**
 * Agent Approvals — RENDER SMOKE (trimmed).
 *
 * The agent approval-workflow logic (pending actions, approve/reject, RBAC,
 * tool gating, rollback) is covered deterministically at the unit/integration
 * layer — `apps/api/src/agent/__tests__/approval-workflow.test.ts` (+
 * `.supplementary`), `apps/api/src/modules/agent/__tests__/agent.router.test.ts`.
 * The previous 30+ UI assertions here duplicated that at the slow/flaky E2E
 * layer; per docs/operations/e2e-pyramid-rationalization.md this is reduced to a
 * single authenticated render smoke.
 */
test.describe('Agent Approvals — render smoke', () => {
  test('loads for an authenticated user without bouncing to login', async ({ page }) => {
    await page.goto('/agent-approvals');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('h1:has-text("Agent Approvals")')).toBeVisible({ timeout: 15000 });
  });
});
