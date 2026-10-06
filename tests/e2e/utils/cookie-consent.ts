import { expect, type Page } from '@playwright/test';

/**
 * Answer the first-visit cookie-consent dialog ("Accept All").
 *
 * The dialog is fixed to the bottom of the viewport and, until answered, sits
 * over whatever is there — the public feedback FAB on any viewport, and the
 * login submit button on phone-sized ones. A real first-time visitor answers it
 * first; a fresh Playwright context is always a first-time visitor.
 */
export async function acceptCookieConsent(page: Page): Promise<void> {
  const accept = page.getByTestId('accept-all-btn');
  await accept.click();
  await expect(accept).toBeHidden();
}
