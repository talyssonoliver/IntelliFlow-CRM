import { test, expect, type Locator, type Page } from '@playwright/test';

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

/**
 * What the browser hands a tap at the centre of `locator`: true when it is the control itself or
 * something inside it. `elementFromPoint` is what a finger hits.
 */
async function isUnderFinger(page: Page, locator: Locator): Promise<boolean> {
  await locator.scrollIntoViewIfNeeded();
  const box = (await locator.boundingBox())!;
  return locator.evaluate(
    (el, [x, y]) => {
      const top = document.elementFromPoint(x, y);
      return !!top && (top === el || el.contains(top));
    },
    [box.x + box.width / 2, box.y + box.height / 2] as [number, number]
  );
}
for (const vp of VIEWPORTS) {
  test.describe(`landing taps, ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.touch });

    test('the hero buttons, the header Log in and the pause control are under the finger', async ({
      page,
    }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      await answerCookieBanner(page);
      const main = page.locator('main');
      const controls = [
        main.getByRole('link', { name: 'Get started', exact: true }).first(),
        main.getByRole('link', { name: 'Book a demo', exact: true }).first(),
        page.getByRole('button', { name: /pause background animation/i }),
      ];
      for (const control of controls) {
        // The pause control only exists once the live background has started (not on reduced motion).
        if ((await control.count()) === 0) continue;
        expect(await isUnderFinger(page, control)).toBe(true);
      }
      // "Log in" is in the header on desktop and in the menu sheet on a phone.
      if (vp.touch) await page.getByLabel('Menu').click();
      const login = page.getByRole('link', { name: 'Log in', exact: true }).first();
      expect(await isUnderFinger(page, login)).toBe(true);
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
