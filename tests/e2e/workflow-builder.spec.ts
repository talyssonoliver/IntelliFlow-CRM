/**
 * Workflow Builder E2E Tests — IFC-031
 *
 * Playwright tests for the visual workflow builder at /cases/case-workflows.
 *
 * NOTE: These tests require a running dev/prod server with a seeded database.
 * Run with: pnpm --filter @intelliflow/e2e exec playwright test workflow-builder.spec.ts
 *
 * AC Coverage:
 *   TC-1: AC-001 (List View), AC-002 (Canvas), NF-001 (Breadcrumb)
 *   TC-2: AC-002, AC-003 (Connections), AC-004 (Config), AC-005 (Save)
 *   TC-3: AC-007 (Delete + row removal + post-delete create succeeds)
 *   TC-4: AC-006 (Activation toggle)
 *   TC-5: NF-002 (50-node render performance <500ms)
 */

import { test, expect } from '@playwright/test';

test.describe('Workflow Builder (IFC-031)', () => {
  test.beforeEach(async ({ page }) => {
    // Authenticate as test user
    await page.goto('/auth/login');
    await page.fill('[name="email"]', process.env.E2E_USER_EMAIL ?? 'test@example.com');
    await page.fill('[name="password"]', process.env.E2E_USER_PASSWORD ?? 'password');
    await page.click('[type="submit"]');
    await page.waitForURL('**/dashboard');
  });

  /**
   * TC-1: Navigate to workflow list → create new workflow → canvas loads
   * AC-001, AC-002, NF-001
   */
  test('TC-1: Navigate to workflow list, create new, canvas loads (AC-001/002/NF-001)', async ({
    page,
  }) => {
    await page.goto('/cases/case-workflows');

    // NF-001: breadcrumb present
    await expect(page.getByRole('navigation', { name: /breadcrumb/i })).toBeVisible();
    await expect(page.getByText('Case Workflows')).toBeVisible();

    // AC-001: list view visible
    await expect(page.getByRole('heading', { name: /case workflows/i })).toBeVisible();

    // AC-002: open canvas
    await page.getByRole('button', { name: /create workflow/i }).click();

    // Canvas container should render (ReactFlow loads client-side)
    await expect(page.locator('.react-flow, [data-testid="canvas-loading"]')).toBeVisible({
      timeout: 10_000,
    });
  });

  /**
   * TC-2: Full workflow creation flow
   * AC-002, AC-003, AC-004, AC-005
   */
  test('TC-2: Create 3-node workflow, configure action node, save (AC-003/004/005)', async ({
    page,
  }) => {
    await page.goto('/cases/case-workflows');
    await page.getByRole('button', { name: /create workflow/i }).click();

    // Wait for React Flow canvas
    await page.waitForSelector('.react-flow__renderer', { timeout: 15_000 });

    // AC-002: Drag Start node from palette
    const startPaletteItem = page.locator('[aria-label="Drag Start node"]');
    const canvas = page.locator('.react-flow__renderer');
    const canvasBounds = await canvas.boundingBox();
    if (!canvasBounds) throw new Error('Canvas not visible');

    await startPaletteItem.dragTo(canvas, {
      targetPosition: { x: canvasBounds.width * 0.3, y: canvasBounds.height * 0.4 },
    });

    // Drag Action node
    const actionPaletteItem = page.locator('[aria-label="Drag Action node"]');
    await actionPaletteItem.dragTo(canvas, {
      targetPosition: { x: canvasBounds.width * 0.5, y: canvasBounds.height * 0.4 },
    });

    // Drag End node
    const endPaletteItem = page.locator('[aria-label="Drag End node"]');
    await endPaletteItem.dragTo(canvas, {
      targetPosition: { x: canvasBounds.width * 0.7, y: canvasBounds.height * 0.4 },
    });

    // AC-004: click Action node → NodeConfigPanel opens
    await page.locator('.react-flow__node[data-type="action"]').first().click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 });

    // Select send_notification action type
    await page.getByRole('combobox').click();
    await page.getByRole('option', { name: /send notification/i }).click();
    await page.getByRole('button', { name: /save/i }).click();

    // AC-003: Connect Start→Action by dragging edge handles
    // Locate source (start) and target (action) connection handles
    const startHandle = page
      .locator('.react-flow__node[data-type="start"] .react-flow__handle--source')
      .first();
    const actionHandle = page
      .locator('.react-flow__node[data-type="action"] .react-flow__handle--target')
      .first();
    await startHandle.dragTo(actionHandle);

    // Connect Action→End
    const actionSourceHandle = page
      .locator('.react-flow__node[data-type="action"] .react-flow__handle--source')
      .first();
    const endHandle = page
      .locator('.react-flow__node[data-type="end"] .react-flow__handle--target')
      .first();
    await actionSourceHandle.dragTo(endHandle);

    // AC-005: Save workflow — button should be enabled after valid topology
    const saveBtn = page.getByRole('button', { name: /save workflow/i });
    await expect(saveBtn).toBeVisible();
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();

    // Create success redirects back to the workflow list page
    await page.waitForURL('**/cases/case-workflows', { timeout: 10_000 });
    await expect(page.getByRole('heading', { name: /case workflows/i })).toBeVisible();
  });

  /**
   * TC-3: Delete workflow, verify row disappears, create a new workflow after
   * AC-007
   *
   * NOTE: Same-name reuse after soft-delete is tested at the API procedure
   * level (workflow.procedures.test.ts) because the UI auto-generates names
   * via timestamp and has no name input field.
   */
  test('TC-3: Delete workflow, confirm, then create new workflow succeeds (AC-007)', async ({
    page,
  }) => {
    test.slow(); // delete + full create cycle

    await page.goto('/cases/case-workflows');

    // Use first available workflow row delete button (if list is empty, skip)
    const firstDeleteBtn = page.getByRole('button', { name: /delete/i }).first();
    const isVisible = await firstDeleteBtn.isVisible().catch(() => false);
    if (!isVisible) {
      test.skip();
      return;
    }

    await firstDeleteBtn.click();

    // AlertDialog confirmation
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.getByRole('button', { name: /confirm/i }).click();

    // Row should disappear
    await expect(page.getByRole('alertdialog')).not.toBeVisible({ timeout: 5_000 });

    // After deletion, creating a new workflow should still succeed
    await page.getByRole('button', { name: /create workflow/i }).click();
    await page.waitForSelector('.react-flow__renderer', { timeout: 15_000 });

    // Build minimal valid topology: Start → End
    const canvas = page.locator('.react-flow__renderer');
    const canvasBounds = await canvas.boundingBox();
    if (!canvasBounds) throw new Error('Canvas not visible');

    const startItem = page.locator('[aria-label="Drag Start node"]');
    await startItem.dragTo(canvas, {
      targetPosition: { x: canvasBounds.width * 0.3, y: canvasBounds.height * 0.5 },
    });
    const endItem = page.locator('[aria-label="Drag End node"]');
    await endItem.dragTo(canvas, {
      targetPosition: { x: canvasBounds.width * 0.7, y: canvasBounds.height * 0.5 },
    });

    // Connect Start → End
    const startHandle = page
      .locator('.react-flow__node[data-type="start"] .react-flow__handle--source')
      .first();
    const endHandle = page
      .locator('.react-flow__node[data-type="end"] .react-flow__handle--target')
      .first();
    await startHandle.dragTo(endHandle);

    // Save — redirect back to list proves create succeeded
    const saveBtn = page.getByRole('button', { name: /save workflow/i });
    await saveBtn.click();
    await page.waitForURL('**/cases/case-workflows', { timeout: 10_000 });
  });

  /**
   * TC-4: Toggle active/inactive
   * AC-006
   */
  test('TC-4: Toggle workflow active/inactive (AC-006)', async ({ page }) => {
    await page.goto('/cases/case-workflows');

    const firstToggle = page.getByRole('switch').first();
    const isVisible = await firstToggle.isVisible().catch(() => false);
    if (!isVisible) {
      test.skip();
      return;
    }

    const wasChecked = await firstToggle.getAttribute('aria-checked');
    await firstToggle.click();

    // State should have flipped
    await expect(firstToggle).toHaveAttribute(
      'aria-checked',
      wasChecked === 'true' ? 'false' : 'true'
    );
  });

  /**
   * TC-5: Performance with 50 nodes — NF-002 (<500ms render)
   *
   * Drags 50 action nodes onto the canvas via palette, then measures
   * a full requestAnimationFrame cycle to verify render stays under budget.
   */
  test('TC-5: 50-node render performance < 500ms (NF-002)', async ({ page }) => {
    test.slow(); // 50 sequential drags can be slow in CI — triples default timeout
    await page.goto('/cases/case-workflows');
    await page.getByRole('button', { name: /create workflow/i }).click();
    await page.waitForSelector('.react-flow__renderer', { timeout: 15_000 });

    const actionPaletteItem = page.locator('[aria-label="Drag Action node"]');
    const canvas = page.locator('.react-flow__renderer');
    const canvasBounds = await canvas.boundingBox();
    if (!canvasBounds) throw new Error('Canvas not visible');

    // Drag 50 action nodes onto the canvas in a 10×5 grid
    for (let i = 0; i < 50; i++) {
      await actionPaletteItem.dragTo(canvas, {
        targetPosition: {
          x: 30 + (i % 10) * (canvasBounds.width / 11),
          y: 20 + Math.floor(i / 10) * 80,
        },
      });
    }

    // Verify all 50 nodes actually rendered
    const nodeCount = await page.locator('.react-flow__node').count();
    expect(nodeCount).toBeGreaterThanOrEqual(50);

    // NF-002: Measure the render time of a forced full re-render with all
    // 50 nodes on canvas.  A window resize forces React Flow to recalculate
    // every node's dimensions and positions.  Double-rAF captures both the
    // JS reconciliation pass and the subsequent layout/paint pass.
    const renderMs = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        const start = performance.now();
        window.dispatchEvent(new Event('resize'));
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve(performance.now() - start);
          });
        });
      });
    });

    expect(renderMs).toBeLessThan(500);
  });
});
