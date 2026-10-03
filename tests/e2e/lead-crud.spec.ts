/**
 * Lead CRUD route/reachability E2E smoke (IFC-249, finding T-6)
 *
 * SCOPE — read this before extending. Same pattern as tests/e2e/contact-crud.spec.ts
 * (IFC-266, T-10): a REACHABILITY SMOKE over the create → view → edit → delete route
 * surface, not a real authenticated data CRUD flow. There is no authenticated
 * session / storageState fixture (the repo's global-setup leaves login optional), so
 * each test navigates, asserts the route resolves (page OR login redirect), then only
 * conditionally interacts with elements (`if (count > 0)`) since data-backed UI may be
 * absent without auth. It deliberately does not fake a logged-in session or assert
 * end-to-end persistence.
 *
 * A full authenticated create->view->edit->delete data flow needs a Playwright auth
 * fixture + seeded tenant — same follow-up contact-crud.spec.ts already flags, not
 * covered here.
 *
 * @see docs/audit/contact-detail-wiring-audit.md (stale, for historical context only)
 * @see tests/e2e/contact-crud.spec.ts (the pattern this suite mirrors)
 */

import { test, expect } from '@playwright/test';

test.describe('Lead CRUD Flow (IFC-249)', () => {
  test.describe('Read — lead list', () => {
    test('the leads list route resolves (page or login)', async ({ page }) => {
      await page.goto('/leads');
      await expect(page).toHaveURL(/\/(leads|login)/);
    });

    test('exposes the New Lead action when the list renders', async ({ page }) => {
      await page.goto('/leads');
      await expect(page).toHaveURL(/\/(leads|login)/);
      if (/\/leads(\?|$|\/)/.test(page.url())) {
        const newLead = page.locator('a:has-text("New Lead"), button:has-text("New Lead")');
        if ((await newLead.count()) > 0) {
          await expect(newLead.first()).toBeVisible();
        }
      }
    });
  });

  test.describe('Create — new lead wizard', () => {
    test('the create wizard route resolves with step-1 fields', async ({ page }) => {
      await page.goto('/leads/new');
      await expect(page).toHaveURL(/\/(leads\/new|login)/);
      const firstName = page.locator('input#firstName');
      if ((await firstName.count()) > 0) {
        await expect(firstName).toBeVisible();
        await expect(page.locator('input#lastName')).toBeVisible();
        await expect(page.locator('input#email')).toBeVisible();
      }
    });

    test('step-1 fields are fillable and Next Step advances to Company Details', async ({
      page,
    }) => {
      await page.goto('/leads/new');
      await expect(page).toHaveURL(/\/(leads\/new|login)/);
      const firstName = page.locator('input#firstName');
      if ((await firstName.count()) > 0) {
        await firstName.fill('E2E');
        await page.locator('input#lastName').fill('Tester');
        await page.locator('input#email').fill('e2e.lead.tester@example.com');
        const next = page.locator('button:has-text("Next Step")');
        if ((await next.count()) > 0) {
          await next.click();
          await expect(page.locator('text=Company Details')).toBeVisible();
        }
      }
    });

    test('empty required fields keep the user on step 1 (validation)', async ({ page }) => {
      await page.goto('/leads/new');
      await expect(page).toHaveURL(/\/(leads\/new|login)/);
      const next = page.locator('button:has-text("Next Step")');
      if ((await next.count()) > 0) {
        await next.click();
        // Validation blocks navigation — step-1 first-name input stays present.
        await expect(page.locator('input#firstName')).toBeVisible();
      }
    });
  });

  test.describe('Update — edit route', () => {
    test('the lead edit route shell resolves', async ({ page }) => {
      // Without an auth/seed fixture there is no real lead id; verify the
      // dynamic edit route resolves (renders, redirects to login, or bounces
      // back to the list) rather than hard-erroring.
      await page.goto('/leads/00000000-0000-4000-8000-000000000000/edit');
      await expect(page).toHaveURL(/\/(leads\/.*\/edit|leads|login)/);
    });
  });

  test.describe('Delete — list surface', () => {
    test('the list renders a content surface where delete actions live', async ({ page }) => {
      await page.goto('/leads');
      await expect(page).toHaveURL(/\/(leads|login)/);
      if (/\/leads(\?|$|\/)/.test(page.url())) {
        // Delete is a per-row/bulk action gated on data + auth; assert the main
        // content region is present so the action host exists.
        await expect(page.locator('main, table').first()).toBeVisible();
      }
    });
  });

  test.describe('Protected route behavior', () => {
    test('unauthenticated access resolves without a hard error', async ({ page, context }) => {
      await context.clearCookies();
      await page.goto('/leads');
      await expect(page).toHaveURL(/\/(leads|login)/);
    });
  });
});
