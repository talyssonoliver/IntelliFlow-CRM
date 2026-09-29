/**
 * Aurora landing preview (/preview/aurora) — the WebGL background's pause control.
 *
 * The pause button (WCAG 2.2.2) sits in the background layer, and the feature
 * section that follows it in the DOM once covered it on phones and tablets:
 * the button was visible and focusable but a tap landed on the section. Only a
 * real layout can show that, so this checks what is actually under the button.
 */

import { test, expect } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

for (const width of [390, 1024, 1440]) {
  test(`pause control is on top and works at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/preview/aurora');

    const background = page.getByTestId('aurora-background');
    // The control only exists while WebGL is animating; runners without WebGL keep the stills.
    const live = await expect(background)
      .toHaveAttribute('data-state', 'animated', { timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!live, 'WebGL unavailable on this runner; the still images are shown instead');

    const pause = page.getByRole('button', { name: 'Pause background animation' });
    await pause.scrollIntoViewIfNeeded();
    const onTop = await pause.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return hit !== null && (hit === el || el.contains(hit));
    });
    expect(onTop).toBe(true);

    await pause.click();
    await expect(background).toHaveAttribute('data-state', 'paused');
    await page.getByRole('button', { name: 'Play background animation' }).click();
    await expect(background).toHaveAttribute('data-state', 'animated');
  });
}

test('stays out of search indexes', async ({ page }) => {
  await page.goto('/preview/aurora');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
});
