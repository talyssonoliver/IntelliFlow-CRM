import { test, expect, type Page } from '@playwright/test';

/**
 * Tap proof for the public landing page (MVP-012 / UI-010): on a phone and on a desktop, the
 * browser must hand a tap at the centre of each control to the control itself. At 390px the pinned
 * stack canvas used to sit over the hero, so "Get started" and "Book a demo" did nothing.
 * `document.elementFromPoint` at the centre is what a finger hits; the control, or something inside
 * it, must be what comes back.
 */
const VIEWPORTS = [
  { name: 'phone 390', width: 390, height: 844, touch: true },
  { name: 'desktop 1440', width: 1440, height: 900, touch: false },
];

async function answerCookieBanner(page: Page) {
  await page
    .getByRole('button', { name: /accept all|reject all|reject non|only necessary|accept/i })
    .first()
    .click({ timeout: 3000 })
    .catch(() => {});
}

/** The controls a finger could meet in the page's own content: links and buttons that show. */
async function coveredControls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const covered: string[] = [];
    const controls = [...document.querySelectorAll<HTMLElement>('main a[href], main button')];
    for (const el of controls) {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      if (el.closest('[aria-hidden="true"], [hidden], [inert]')) continue;
      el.scrollIntoView({ block: 'center' });
      const box = el.getBoundingClientRect();
      if (box.width < 2 || box.height < 2) continue;
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
      const top = document.elementFromPoint(x, y);
      if (top && (top === el || el.contains(top))) continue;
      const label = (el.textContent ?? el.getAttribute('aria-label') ?? '').trim().slice(0, 30);
      covered.push(`${label} (${el.getAttribute('href') ?? 'button'}) under ${top?.tagName}`);
    }
    return covered;
  });
}

for (const vp of VIEWPORTS) {
  test.describe(`landing taps, ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.touch });

    test('no control on the page is covered by another element', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      await answerCookieBanner(page);
      expect(await coveredControls(page)).toEqual([]);
    });

    test('the hero buttons are the element under their own centre, and tapping them navigates', async ({
      page,
    }) => {
      for (const [text, path] of [
        ['Get started', '/signup'],
        ['Book a demo', '/contact'],
      ] as const) {
        await page.goto('/');
        await page.waitForLoadState('networkidle');
        await answerCookieBanner(page);
        const link = page.locator('main').getByRole('link', { name: text, exact: true }).first();
        await link.scrollIntoViewIfNeeded();
        const box = (await link.boundingBox())!;
        const hit = await page.evaluate(
          ([x, y]) => document.elementFromPoint(x, y)?.closest('a')?.getAttribute('href') ?? null,
          [box.x + box.width / 2, box.y + box.height / 2]
        );
        expect(hit).toBe(path);
        await (vp.touch ? link.tap() : link.click());
        await expect(page).toHaveURL(new RegExp(`${path}$`));
      }
    });
  });
}
