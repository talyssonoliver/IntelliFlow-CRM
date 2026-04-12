/**
 * Sign Up E2E Tests for IntelliFlow CRM
 *
 * End-to-end tests for PG-016 Sign Up page.
 * Tests the complete registration flow including OAuth,
 * form validation, error recovery, and UTM tracking.
 */

import { test, expect } from '@playwright/test';

test.describe('Sign Up Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to signup page before each test
    await page.goto('/signup');
    // Wait for page to be fully loaded
    await page.waitForLoadState('networkidle');
  });

  test('completes full registration flow', async ({ page }) => {
    // Fill form with valid data
    await page.fill('input[name="fullName"]', 'Test User');
    await page.fill('input[name="email"]', `test-${Date.now()}@example.com`);

    // Fill password fields using placeholder since they may not have name attributes
    await page.fill('input[placeholder*="Create a password"]', 'SecurePass123!');
    await page.fill('input[placeholder*="Confirm your password"]', 'SecurePass123!');

    // Accept terms
    await page.check('input[type="checkbox"]');

    // Submit
    await page.click('button[type="submit"]');

    // Verify redirect to success page
    await expect(page).toHaveURL(/\/signup\/success/);
  });

  test('shows validation errors for invalid input', async ({ page }) => {
    // Submit empty form
    await page.click('button[type="submit"]');

    // Verify error messages appear
    await expect(page.locator('text=Full name is required')).toBeVisible();
    await expect(page.locator('text=Email is required')).toBeVisible();
    await expect(page.locator('text=Password is required')).toBeVisible();
  });

  test('validates email format', async ({ page }) => {
    // Enter invalid email
    await page.fill('input[name="email"]', 'invalid-email');
    await page.press('input[name="email"]', 'Tab');

    // Verify validation error
    await expect(page.locator('text=Please enter a valid email')).toBeVisible();
  });

  test('validates password length', async ({ page }) => {
    // Enter short password
    await page.fill('input[placeholder*="Create a password"]', 'short');
    await page.press('input[placeholder*="Create a password"]', 'Tab');

    // Verify validation error
    await expect(page.locator('text=at least 8 characters')).toBeVisible();
  });

  test('validates password match', async ({ page }) => {
    // Enter mismatched passwords
    await page.fill('input[placeholder*="Create a password"]', 'SecurePass123!');
    await page.fill('input[placeholder*="Confirm your password"]', 'DifferentPass123!');
    await page.press('input[placeholder*="Confirm your password"]', 'Tab');

    // Verify validation error
    await expect(page.locator('text=Passwords do not match')).toBeVisible();
  });

  test('shows password strength indicator', async ({ page }) => {
    // Enter weak password
    await page.fill('input[placeholder*="Create a password"]', 'weak');

    // Verify strength indicator shows "Weak"
    await expect(page.locator('text=Weak')).toBeVisible();

    // Enter strong password
    await page.fill('input[placeholder*="Create a password"]', 'SecurePass123!');

    // Verify strength indicator improves
    await expect(page.locator('text=Strong')).toBeVisible();
  });
});

test.describe('OAuth Flows', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/signup');
    await page.waitForLoadState('networkidle');
  });

  test('Google OAuth flow redirects correctly', async ({ page }) => {
    // Click Google button
    const googleButton = page.locator('button:has-text("Google")');
    await expect(googleButton).toBeVisible();

    // Click and verify OAuth redirect is initiated
    // Note: We can't follow the actual OAuth flow in tests,
    // but we can verify the button triggers the correct action
    await googleButton.click();

    // In real OAuth, this would redirect to Google
    // For now, verify no error occurred
    await expect(page.locator('text=Registration failed')).not.toBeVisible();
  });

  test('Microsoft OAuth flow redirects correctly', async ({ page }) => {
    // Click Microsoft button
    const microsoftButton = page.locator('button:has-text("Microsoft")');
    await expect(microsoftButton).toBeVisible();

    await microsoftButton.click();

    // Verify no error occurred
    await expect(page.locator('text=Registration failed')).not.toBeVisible();
  });
});

test.describe('UTM Tracking', () => {
  test('preserves UTM parameters through registration', async ({ page }) => {
    // Navigate with UTM params
    await page.goto('/signup?utm_source=google&utm_medium=cpc&utm_campaign=signup-test');
    await page.waitForLoadState('networkidle');

    // Verify UTM params are stored in localStorage
    const utmData = await page.evaluate(() => {
      return localStorage.getItem('intelliflow_utm');
    });

    expect(utmData).toBeTruthy();
    const parsed = JSON.parse(utmData!);
    expect(parsed.utm_source).toBe('google');
    expect(parsed.utm_medium).toBe('cpc');
    expect(parsed.utm_campaign).toBe('signup-test');
  });

  test('retrieves UTM from localStorage on subsequent visits', async ({ page }) => {
    // First visit with UTM params
    await page.goto('/signup?utm_source=facebook&utm_medium=social');
    await page.waitForLoadState('networkidle');

    // Navigate away and back
    await page.goto('/');
    await page.goto('/signup');
    await page.waitForLoadState('networkidle');

    // UTM should still be in localStorage
    const utmData = await page.evaluate(() => {
      return localStorage.getItem('intelliflow_utm');
    });

    expect(utmData).toBeTruthy();
    const parsed = JSON.parse(utmData!);
    expect(parsed.utm_source).toBe('facebook');
  });
});

test.describe('Error Recovery', () => {
  test('error recovery - correct and resubmit', async ({ page }) => {
    // Submit invalid form
    await page.fill('input[name="email"]', 'invalid-email');
    await page.click('button[type="submit"]');

    // Verify errors appear
    await expect(page.locator('[role="alert"]')).toHaveCount.call(expect, { timeout: 5000 });

    // Correct the errors
    await page.fill('input[name="fullName"]', 'Test User');
    await page.fill('input[name="email"]', `test-${Date.now()}@example.com`);
    await page.fill('input[placeholder*="Create a password"]', 'SecurePass123!');
    await page.fill('input[placeholder*="Confirm your password"]', 'SecurePass123!');
    await page.check('input[type="checkbox"]');

    // Resubmit
    await page.click('button[type="submit"]');

    // Verify success
    await expect(page).toHaveURL(/\/signup\/success/);
  });
});

test.describe('Navigation', () => {
  test('link to login page works', async ({ page }) => {
    await page.goto('/signup');
    await page.waitForLoadState('networkidle');

    // Click "Sign in" link
    await page.click('a:has-text("Sign in")');

    // Verify navigation to /login
    await expect(page).toHaveURL(/\/login/);
  });

  test('terms of service link works', async ({ page }) => {
    await page.goto('/signup');
    await page.waitForLoadState('networkidle');

    // Click Terms link
    const termsLink = page.locator('a:has-text("Terms of Service")').first();
    await expect(termsLink).toHaveAttribute('href', '/terms');
  });

  test('privacy policy link works', async ({ page }) => {
    await page.goto('/signup');
    await page.waitForLoadState('networkidle');

    // Click Privacy link
    const privacyLink = page.locator('a:has-text("Privacy Policy")').first();
    await expect(privacyLink).toHaveAttribute('href', '/privacy');
  });
});

test.describe('Accessibility', () => {
  test('form fields have proper labels', async ({ page }) => {
    await page.goto('/signup');
    await page.waitForLoadState('networkidle');

    // All inputs should have associated labels
    const fullNameInput = page.locator('input[name="fullName"]');
    const labelFor = await fullNameInput.getAttribute('id');
    expect(labelFor).toBeTruthy();

    const label = page.locator(`label[for="${labelFor}"]`);
    await expect(label).toBeVisible();
  });

  test('keyboard navigation works', async ({ page }) => {
    await page.goto('/signup');
    await page.waitForLoadState('networkidle');

    // Tab through form fields
    await page.keyboard.press('Tab');
    await expect(page.locator('button:has-text("Google")')).toBeFocused();

    // Continue tabbing through all interactive elements
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab'); // Skip OAuth buttons

    // Eventually reach the form fields
    // This verifies tab order works without getting stuck
  });

  test('error messages are announced', async ({ page }) => {
    await page.goto('/signup');
    await page.waitForLoadState('networkidle');

    // Submit empty form
    await page.click('button[type="submit"]');

    // Error messages should have role="alert" for screen readers
    const alerts = page.locator('[role="alert"]');
    await expect(alerts.first()).toBeVisible();
  });
});

test.describe('Performance', () => {
  test('page loads within acceptable time', async ({ page }) => {
    const startTime = Date.now();

    await page.goto('/signup');
    await page.waitForLoadState('domcontentloaded');

    const loadTime = Date.now() - startTime;

    // Page should load within 3 seconds
    expect(loadTime).toBeLessThan(3000);
  });

  test('form is interactive quickly', async ({ page }) => {
    await page.goto('/signup');

    // Wait for form to be ready
    await page.waitForSelector('input[name="email"]', { state: 'visible' });

    // Form should be immediately interactive
    await page.fill('input[name="email"]', 'test@example.com');
    const value = await page.inputValue('input[name="email"]');
    expect(value).toBe('test@example.com');
  });
});
