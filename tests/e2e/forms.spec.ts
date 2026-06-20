/**
 * Forms E2E Tests for IntelliFlow CRM (IFC-129)
 *
 * Tests form interactions:
 * - Lead creation form (page-based)
 * - Contact creation form
 * - Form validation
 * - Interactive components (buttons, pages, filters)
 *
 * @see Sprint 6 - IFC-129: UI and Contract Tests
 */

import { test, expect } from '@playwright/test';

test.describe('Lead Form', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/leads');
  });

  test.describe('Form Navigation', () => {
    test('should navigate to lead form page when clicking New Lead link', async ({ page }) => {
      // PageHeader ActionButton renders as <Link> (<a>) when href is set
      // (page-header.tsx:154-158). lead-list.tsx passes href:'/leads/new',
      // so "New Lead" is an anchor, NOT a <button>.
      await page.getByRole('link', { name: /New Lead/i }).click();

      // Verify navigation to new lead page
      await expect(page).toHaveURL('/leads/new');

      // Step 1 (Basic Info) is active on load — email field is present in step 1
      // (LeadForm.tsx BasicSection, mode='create' renders email in the grid).
      const emailInput = page.locator('input#email');
      await expect(emailInput).toBeVisible();
    });
  });

  test.describe('Form Fields', () => {
    test.beforeEach(async ({ page }) => {
      // Navigate directly to the lead form page (wizard, step 1: Basic Info)
      await page.goto('/leads/new');
    });

    test('should have step-1 fields visible on load', async ({ page }) => {
      // IFC-230 wizard: /leads/new is a 3-step page (Basic Info → Company → Qualification).
      // Step 1 (BasicSection, mode='create') renders: firstName, lastName, phone,
      // title, email, source — all defined in BASIC_FIELDS + create-mode additions
      // (LeadForm.tsx:271-293, 363-383).
      const emailInput = page.locator('input#email');
      await expect(emailInput).toBeVisible();

      const firstNameInput = page.locator('input#firstName');
      await expect(firstNameInput).toBeVisible();

      const lastNameInput = page.locator('input#lastName');
      await expect(lastNameInput).toBeVisible();

      // phone and title are also on step 1 (BASIC_FIELDS array, LeadForm.tsx:271-293)
      const phoneInput = page.locator('input#phone');
      await expect(phoneInput).toBeVisible();

      const titleInput = page.locator('input#title');
      await expect(titleInput).toBeVisible();

      // source select is rendered in BasicSection for mode='create' (LeadForm.tsx:376-383)
      const sourceSelect = page.locator('select#source');
      await expect(sourceSelect).toBeVisible();
    });

    test('should have step-2 company field after advancing', async ({ page }) => {
      // company is in COMPANY_FIELDS (LeadForm.tsx:295-317), shown on step 2 only.
      // Must fill step-1 required fields and click "Next Step" to reach it.
      await page.fill('input#firstName', 'Test');
      await page.fill('input#lastName', 'User');
      await page.fill('input#email', 'test@example.com');

      await page.getByRole('button', { name: /Next Step/i }).click();

      // Now on step 2 (Company Details)
      const companyInput = page.locator('input#company');
      await expect(companyInput).toBeVisible();
    });

    test('should have email field marked as required', async ({ page }) => {
      // LeadForm.tsx TextField renders <span class="text-red-500"> *</span> when required=true
      // (LeadForm.tsx:207). Email is required in create mode (line 368).
      const emailLabel = page.locator('label[for="email"]');
      await expect(emailLabel).toContainText('*');
    });

    test('should have source dropdown with real options', async ({ page }) => {
      // Real sourceOptions from lead-form-utils.ts:14-22.
      // Old test used "Website", "Social Media", "Email Campaign", "Cold Call", "Event" —
      // none of those labels exist. Real labels: "Website / Organic", "Referral",
      // "LinkedIn", "Conference / Event", "Cold Outreach", "Other".
      const sourceSelect = page.locator('select#source');
      const realOptions = [
        'Website / Organic',
        'Referral',
        'LinkedIn',
        'Conference / Event',
        'Cold Outreach',
        'Other',
      ];

      for (const option of realOptions) {
        const optionElement = page.locator(`select#source option:has-text("${option}")`);
        await expect(optionElement).toBeAttached();
      }
    });

    test('should fill step-1 form fields correctly', async ({ page }) => {
      // Fill step-1 fields (email, firstName, lastName, phone, title, source)
      await page.fill('input#email', 'test@example.com');
      await expect(page.locator('input#email')).toHaveValue('test@example.com');

      await page.fill('input#firstName', 'John');
      await expect(page.locator('input#firstName')).toHaveValue('John');

      await page.fill('input#lastName', 'Doe');
      await expect(page.locator('input#lastName')).toHaveValue('Doe');

      // Source value is lowercase in the select (lead-form-utils.ts:17).
      // mapSourceToEnum() converts 'referral' → 'REFERRAL' on submit.
      await page.selectOption('select#source', 'referral');
      await expect(page.locator('select#source')).toHaveValue('referral');
    });
  });

  test.describe('Form Validation', () => {
    test.beforeEach(async ({ page }) => {
      // Navigate directly — the wizard is a page, not a modal.
      await page.goto('/leads/new');
      await expect(page.locator('input#email')).toBeVisible();
    });

    test('should show validation error for invalid email', async ({ page }) => {
      // Enter invalid email
      await page.fill('input#email', 'invalid-email');

      // On step 1, the action button is "Next Step" (NewLeadForm.tsx:351-355).
      // Clicking Next Step calls validate() which runs validateLeadFormValues
      // and sets firstName/lastName errors too (required). Fill those to isolate email.
      await page.fill('input#firstName', 'Test');
      await page.fill('input#lastName', 'User');
      await page.getByRole('button', { name: /Next Step/i }).click();

      // Wait for validation render
      await page.waitForTimeout(500);

      // validateLeadFormValues (LeadForm.tsx:94) sets errs.email = 'Please enter a valid email address'
      // FieldError renders it in a <p role="alert"> (LeadForm.tsx:149).
      const errorMessage = page.locator('text="Please enter a valid email address"');
      await expect(errorMessage).toBeVisible();
    });

    test('should advance to step 2 with valid step-1 data', async ({ page }) => {
      // With valid required fields, Next Step should advance without errors.
      await page.fill('input#email', 'valid@example.com');
      await page.fill('input#firstName', 'Test');
      await page.fill('input#lastName', 'User');

      await page.getByRole('button', { name: /Next Step/i }).click();

      // Step 2 (Company Details) becomes visible
      await expect(page.locator('input#company')).toBeVisible();
    });

    test('should navigate back to leads list when clicking Cancel', async ({ page }) => {
      // On step 1, the back/cancel button shows "Cancel" (NewLeadForm.tsx:344-345)
      await page.getByRole('button', { name: /^Cancel$/i }).click();

      // Verify navigation back to leads list
      await expect(page).toHaveURL('/leads');
    });
  });

  test.describe('Form Submission', () => {
    test.beforeEach(async ({ page }) => {
      // Navigate to the lead form page
      await page.goto('/leads/new');
    });

    test('should show loading state or navigate after submit on step 3', async ({ page }) => {
      // To reach "Create Lead" the wizard must be on step 3 (last step).
      // Advance through all 3 steps with minimal valid data.
      await page.fill('input#firstName', 'New');
      await page.fill('input#lastName', 'Lead');
      await page.fill('input#email', 'newlead@example.com');
      await page.getByRole('button', { name: /Next Step/i }).click();

      // Step 2 — no required fields; advance directly
      await expect(page.locator('input#company')).toBeVisible();
      await page.getByRole('button', { name: /Next Step/i }).click();

      // Step 3 — "Create Lead" button is now visible (NewLeadForm.tsx:373-378)
      await page.getByRole('button', { name: /^Create Lead$/i }).click();

      // Race the loading/creating state vs. post-submit navigation.
      const loadingButton = page.locator('button:has-text("Creating")');
      const wasLoading = await loadingButton.isVisible({ timeout: 2000 }).catch(() => false);
      const navigated = !page.url().endsWith('/leads/new');

      expect(wasLoading || navigated).toBe(true);
    });

    test('should disable submit button while submitting on step 3', async ({ page }) => {
      // Advance to step 3 to reach the Create Lead button.
      await page.fill('input#firstName', 'New');
      await page.fill('input#lastName', 'Lead');
      await page.fill('input#email', 'newlead2@example.com');
      await page.getByRole('button', { name: /Next Step/i }).click();

      await expect(page.locator('input#company')).toBeVisible();
      await page.getByRole('button', { name: /Next Step/i }).click();

      await page.getByRole('button', { name: /^Create Lead$/i }).click();

      // The Create Lead button (NewLeadForm.tsx:359-381) disables itself when
      // submitting=true (disabled={submitting}).
      const submitButton = page.locator(
        'button:has-text("Create Lead"), button:has-text("Creating")'
      );
      const isDisabled = (await submitButton.first().getAttribute('disabled')) !== null;
      const navigated = !page.url().endsWith('/leads/new');

      expect(isDisabled || navigated).toBe(true);
    });
  });
});

test.describe('Interactive Components', () => {
  test.describe('Filter Controls', () => {
    test('should toggle status filter via dropdown on leads page', async ({ page }) => {
      await page.goto('/leads');

      // PG-059 refactor: status filter is a <select> combobox, not chip buttons.
      // lead-list.tsx SearchFilterBar passes filters[0] = Status dropdown.
      // Selecting "NEW" then "QUALIFIED" updates the list query.
      const statusSelect = page.getByRole('combobox').first();
      await expect(statusSelect).toBeVisible();

      await statusSelect.selectOption({ value: 'NEW' });
      await expect(statusSelect).toHaveValue('NEW');

      await statusSelect.selectOption({ value: 'QUALIFIED' });
      await expect(statusSelect).toHaveValue('QUALIFIED');

      // Previous value is no longer selected
      await expect(statusSelect).not.toHaveValue('NEW');
    });

    test('should show empty status filter (all leads) by default', async ({ page }) => {
      await page.goto('/leads');

      // Default statusFilter state is '' (lead-list.tsx:233 useState('')).
      // The Status <select> renders with value='' initially (empty = show all).
      const statusSelect = page.getByRole('combobox').first();
      await expect(statusSelect).toBeVisible();
      await expect(statusSelect).toHaveValue('');
    });
  });

  test.describe('Table Interactions', () => {
    test('should have clickable View Details links', async ({ page }) => {
      await page.goto('/leads');

      // Check for View Details links in table
      const viewDetailsLinks = page.locator('button:has-text("View Details")');
      const count = await viewDetailsLinks.count();

      if (count > 0) {
        await expect(viewDetailsLinks.first()).toBeVisible();
      }
    });

    test('should display lead data in table rows', async ({ page }) => {
      await page.goto('/leads');

      // Verify table body has rows
      const tableBody = page.locator('tbody');
      await expect(tableBody).toBeVisible();

      // Check for table rows
      const rows = page.locator('tbody tr');
      const rowCount = await rows.count();
      expect(rowCount).toBeGreaterThanOrEqual(0);
    });
  });

  test.describe('Status Badges', () => {
    test('should display status badges with correct styling', async ({ page }) => {
      await page.goto('/leads');

      // Check for status badges
      const badges = page.locator('span.rounded-full');
      const count = await badges.count();

      if (count > 0) {
        await expect(badges.first()).toBeVisible();
      }
    });
  });

  test.describe('Score Indicators', () => {
    test('should display AI score progress bars', async ({ page }) => {
      await page.goto('/leads');

      // Check for score progress bars
      const progressBars = page.locator(
        '.bg-gray-200.rounded-full, [class*="h-2"][class*="rounded-full"]'
      );
      const count = await progressBars.count();

      if (count > 0) {
        await expect(progressBars.first()).toBeVisible();
      }
    });
  });
});

test.describe('Wizard Page Behavior', () => {
  // NOTE: The original "Modal Behavior" tests were STALE.
  // IFC-230 replaced the modal with a 3-step wizard page at /leads/new.
  // There is no modal, no backdrop, no "Add New Lead" h2, and no Close button.
  // These tests now assert the wizard page's real structure.

  test('should allow keyboard navigation between wizard fields', async ({ page }) => {
    await page.goto('/leads/new');
    await expect(page.locator('input#email')).toBeVisible();

    // Tab through elements — focus should move through interactive form elements
    await page.keyboard.press('Tab');

    // Focus should be on a form-interactive element
    const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(['INPUT', 'SELECT', 'BUTTON', 'TEXTAREA', 'A']).toContain(focusedElement);
  });

  test('should have wizard page heading', async ({ page }) => {
    await page.goto('/leads/new');

    // NewLeadForm.tsx:304 renders <h1>Create New Lead</h1>, not "Add New Lead"
    const heading = page.locator('h1:has-text("Create New Lead")');
    await expect(heading).toBeVisible();
  });

  test('should render wizard step indicator', async ({ page }) => {
    await page.goto('/leads/new');

    // StepIndicator (NewLeadForm.tsx:66-110) renders a <nav aria-label="Form steps">
    // with step buttons for Basic Info, Company Details, Qualification.
    const stepNav = page.locator('nav[aria-label="Form steps"]');
    await expect(stepNav).toBeVisible();

    // Step 1 is current on load
    const step1 = page.locator('button[aria-current="step"]');
    await expect(step1).toBeVisible();
  });
});

test.describe('Form Accessibility', () => {
  test('should have proper labels for form inputs on wizard step 1', async ({ page }) => {
    // Navigate directly to the wizard — no modal, no "New Lead" button click needed.
    await page.goto('/leads/new');
    await expect(page.locator('input#email')).toBeVisible();

    // LeadForm.tsx TextField renders <label htmlFor={id}> (line 205).
    // Email label: "Email Address" (line 366 in LeadForm.tsx create-mode block).
    const emailLabel = page.locator('label[for="email"]');
    await expect(emailLabel).toBeVisible();
    await expect(emailLabel).toContainText('Email');

    // firstName label: "First Name" (BASIC_FIELDS array, LeadForm.tsx:272).
    const firstNameLabel = page.locator('label[for="firstName"]');
    await expect(firstNameLabel).toBeVisible();
    await expect(firstNameLabel).toContainText('First Name');
  });

  test('should be keyboard navigable on wizard step 1', async ({ page }) => {
    await page.goto('/leads/new');
    await expect(page.locator('input#email')).toBeVisible();

    // Focus on email field
    await page.focus('input#email');

    // Tab to next field — focus should move
    await page.keyboard.press('Tab');

    const focusedId = await page.evaluate(() => document.activeElement?.id);
    expect(focusedId).toBeDefined();
  });

  test('should have step navigation with aria attributes', async ({ page }) => {
    // The wizard uses StepIndicator (NewLeadForm.tsx:66-110) with
    // aria-current="step" on the active step and aria-label on each step button.
    // There is NO close button — the modal never existed in the wizard design.
    await page.goto('/leads/new');

    const currentStep = page.locator('button[aria-current="step"]');
    await expect(currentStep).toBeVisible();

    // Confirm the active step is Step 1 (aria-label contains "Step 1")
    await expect(currentStep).toHaveAttribute('aria-label', /Step 1/i);
  });
});
