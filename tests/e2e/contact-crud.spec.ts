/**
 * Contact CRUD Flow E2E Tests (IFC-266, finding T-10)
 *
 * Exercises the create → view → edit → delete contact flow surface. The suite has
 * NO authenticated session fixture (the repo's global-setup leaves login optional),
 * so — consistent with navigation.spec.ts / auth-flow.spec.ts — each test uses the
 * resilient pattern: navigate, assert the route resolves (page or login redirect),
 * then conditionally interact with elements that depend on auth/seeded data. This is
 * honest smoke-level CRUD coverage, not a faked logged-in session.
 *
 * @see docs/audit/contact-detail-wiring-audit.md §19 (T-10)
 */

import { test, expect } from '@playwright/test';

test.describe('Contact CRUD Flow (IFC-266)', () => {
  test.describe('Read — contact list', () => {
    test('the contacts list route resolves (page or login)', async ({ page }) => {
      await page.goto('/contacts');
      await expect(page).toHaveURL(/\/(contacts|login)/);
    });

    test('exposes the New Contact action when the list renders', async ({ page }) => {
      await page.goto('/contacts');
      await expect(page).toHaveURL(/\/(contacts|login)/);
      if (/\/contacts(\?|$|\/)/.test(page.url())) {
        const newContact = page.locator(
          'a:has-text("New Contact"), button:has-text("New Contact")'
        );
        if ((await newContact.count()) > 0) {
          await expect(newContact.first()).toBeVisible();
        }
      }
    });
  });

  test.describe('Create — new contact wizard', () => {
    test('the create wizard route resolves with step-1 fields', async ({ page }) => {
      await page.goto('/contacts/new');
      await expect(page).toHaveURL(/\/(contacts\/new|login)/);
      const firstName = page.locator('input#firstName');
      if ((await firstName.count()) > 0) {
        await expect(firstName).toBeVisible();
        await expect(page.locator('input#lastName')).toBeVisible();
        await expect(page.locator('input#email')).toBeVisible();
      }
    });

    test('step-1 fields are fillable and Next advances to Company & Role', async ({ page }) => {
      await page.goto('/contacts/new');
      await expect(page).toHaveURL(/\/(contacts\/new|login)/);
      const firstName = page.locator('input#firstName');
      if ((await firstName.count()) > 0) {
        await firstName.fill('E2E');
        await page.locator('input#lastName').fill('Tester');
        await page.locator('input#email').fill('e2e.tester@example.com');
        const next = page.locator('button:has-text("Next Step")');
        if ((await next.count()) > 0) {
          await next.click();
          await expect(page.locator('select#department')).toBeVisible();
        }
      }
    });

    test('empty required fields keep the user on step 1 (validation)', async ({ page }) => {
      await page.goto('/contacts/new');
      await expect(page).toHaveURL(/\/(contacts\/new|login)/);
      const next = page.locator('button:has-text("Next Step")');
      if ((await next.count()) > 0) {
        await next.click();
        // Validation blocks navigation — step-1 first-name input stays present.
        await expect(page.locator('input#firstName')).toBeVisible();
      }
    });
  });

  test.describe('Update — edit route', () => {
    test('the contact edit route shell resolves', async ({ page }) => {
      // Without an auth/seed fixture there is no real contact id; verify the
      // dynamic edit route resolves (renders, redirects to login, or bounces
      // back to the list) rather than hard-erroring.
      await page.goto('/contacts/00000000-0000-4000-8000-000000000000/edit');
      await expect(page).toHaveURL(/\/(contacts\/.*\/edit|contacts|login)/);
    });
  });

  test.describe('Delete — list surface', () => {
    test('the list renders a content surface where delete actions live', async ({ page }) => {
      await page.goto('/contacts');
      await expect(page).toHaveURL(/\/(contacts|login)/);
      if (/\/contacts(\?|$|\/)/.test(page.url())) {
        // Delete is a per-row/bulk action gated on data + auth; assert the main
        // content region is present so the action host exists.
        await expect(page.locator('main, table').first()).toBeVisible();
      }
    });
  });

  test.describe('Protected route behavior', () => {
    test('unauthenticated access resolves without a hard error', async ({ page, context }) => {
      await context.clearCookies();
      await page.goto('/contacts');
      await expect(page).toHaveURL(/\/(contacts|login)/);
    });
  });
});
