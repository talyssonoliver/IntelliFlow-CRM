/**
 * Cookie Consent Component Tests - IFC-143
 *
 * Test coverage for:
 * - Banner display logic
 * - Accept/reject functionality
 * - Settings panel interactions
 * - Cookie storage
 * - Consent validation
 * - Accessibility
 *
 * @module CookieConsent.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  CookieConsentBanner,
  useCookieConsent,
  getStoredConsent,
  storeConsent,
  clearNonNecessaryCookies,
  isConsentValid,
  CookieConsent,
  COOKIE_INVENTORY,
} from './cookie-consent-component';

// ============================================
// Test Setup
// ============================================

// Mock document.cookie
let mockCookies: Record<string, string> = {};

const mockCookieGetter = vi.fn(() => {
  return Object.entries(mockCookies)
    .map(([key, value]) => `${key}=${value}`)
    .join('; ');
});

const mockCookieSetter = vi.fn((value: string) => {
  const [nameValue] = value.split(';');
  const [name, val] = nameValue.split('=');

  if (val === '' || value.includes('expires=Thu, 01 Jan 1970')) {
    delete mockCookies[name];
  } else {
    mockCookies[name] = val;
  }
});

beforeEach(() => {
  mockCookies = {};

  Object.defineProperty(document, 'cookie', {
    get: mockCookieGetter,
    set: mockCookieSetter,
    configurable: true,
  });
});

afterEach(() => {
  vi.clearAllMocks();
  mockCookies = {};
});

// ============================================
// Unit Tests: Utility Functions
// ============================================

describe('Cookie Utility Functions', () => {
  describe('getStoredConsent', () => {
    it('should return null when no consent cookie exists', () => {
      const consent = getStoredConsent();
      expect(consent).toBeNull();
    });

    it('should return consent when valid cookie exists', () => {
      const storedConsent: CookieConsent = {
        necessary: true,
        analytics: true,
        marketing: false,
        preferences: true,
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      };

      mockCookies['intelliflow_consent'] = encodeURIComponent(JSON.stringify(storedConsent));

      const consent = getStoredConsent();
      expect(consent).toEqual(storedConsent);
    });

    it('should return null for malformed cookie data', () => {
      mockCookies['intelliflow_consent'] = 'invalid-json';

      const consent = getStoredConsent();
      expect(consent).toBeNull();
    });

    it('should return null for cookie without required fields', () => {
      mockCookies['intelliflow_consent'] = encodeURIComponent(
        JSON.stringify({ necessary: true })
      );

      const consent = getStoredConsent();
      expect(consent).toBeNull();
    });
  });

  describe('storeConsent', () => {
    it('should store consent as encoded JSON cookie', () => {
      const consent: CookieConsent = {
        necessary: true,
        analytics: true,
        marketing: false,
        preferences: false,
        timestamp: '2025-12-31T12:00:00Z',
        version: '1.0.0',
      };

      storeConsent(consent);

      expect(mockCookieSetter).toHaveBeenCalled();
      const storedValue = mockCookies['intelliflow_consent'];
      expect(storedValue).toBeDefined();
      expect(JSON.parse(decodeURIComponent(storedValue))).toEqual(consent);
    });

    it('should set cookie with correct attributes', () => {
      const consent: CookieConsent = {
        necessary: true,
        analytics: false,
        marketing: false,
        preferences: false,
        timestamp: '2025-12-31T12:00:00Z',
        version: '1.0.0',
      };

      storeConsent(consent);

      const setCookieCall = mockCookieSetter.mock.calls[0][0];
      expect(setCookieCall).toContain('SameSite=Lax');
      expect(setCookieCall).toContain('Secure');
      expect(setCookieCall).toContain('path=/');
      expect(setCookieCall).toContain('expires=');
    });
  });

  describe('clearNonNecessaryCookies', () => {
    it('should clear cookies for specified categories', () => {
      mockCookies['_ga'] = 'test-value';
      mockCookies['_gid'] = 'test-value';
      mockCookies['session_token'] = 'should-remain';

      clearNonNecessaryCookies(['analytics']);

      // _ga and _gid should be cleared (analytics category)
      expect(mockCookieSetter).toHaveBeenCalledWith(
        expect.stringContaining('_ga=')
      );
      expect(mockCookieSetter).toHaveBeenCalledWith(
        expect.stringContaining('_gid=')
      );
    });

    it('should not clear necessary cookies', () => {
      mockCookies['session_token'] = 'test-value';

      clearNonNecessaryCookies(['necessary']);

      // session_token should NOT be cleared
      const clearCalls = mockCookieSetter.mock.calls.filter((call) =>
        call[0].includes('session_token=;')
      );
      expect(clearCalls).toHaveLength(0);
    });
  });

  describe('isConsentValid', () => {
    it('should return false for null consent', () => {
      expect(isConsentValid(null, '1.0.0')).toBe(false);
    });

    it('should return false for version mismatch', () => {
      const consent: CookieConsent = {
        necessary: true,
        analytics: true,
        marketing: false,
        preferences: false,
        timestamp: new Date().toISOString(),
        version: '0.9.0',
      };

      expect(isConsentValid(consent, '1.0.0')).toBe(false);
    });

    it('should return false for expired consent (over 1 year)', () => {
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

      const consent: CookieConsent = {
        necessary: true,
        analytics: true,
        marketing: false,
        preferences: false,
        timestamp: twoYearsAgo.toISOString(),
        version: '1.0.0',
      };

      expect(isConsentValid(consent, '1.0.0')).toBe(false);
    });

    it('should return true for valid recent consent', () => {
      const consent: CookieConsent = {
        necessary: true,
        analytics: true,
        marketing: false,
        preferences: false,
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      };

      expect(isConsentValid(consent, '1.0.0')).toBe(true);
    });
  });
});

// ============================================
// Integration Tests: Component Rendering
// ============================================

describe('CookieConsentBanner Component', () => {
  describe('Initial Rendering', () => {
    it('should show banner when no consent exists', () => {
      render(<CookieConsentBanner />);

      expect(screen.getByTestId('cookie-consent-banner')).toBeInTheDocument();
      expect(screen.getByText(/Cookie Preferences/i)).toBeInTheDocument();
    });

    it('should not show banner when valid consent exists', async () => {
      const consent: CookieConsent = {
        necessary: true,
        analytics: true,
        marketing: false,
        preferences: false,
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      };

      mockCookies['intelliflow_consent'] = encodeURIComponent(JSON.stringify(consent));

      render(<CookieConsentBanner />);

      await waitFor(() => {
        expect(screen.queryByTestId('cookie-consent-banner')).not.toBeInTheDocument();
      });
    });

    it('should display all action buttons', () => {
      render(<CookieConsentBanner />);

      expect(screen.getByTestId('accept-all-btn')).toBeInTheDocument();
      expect(screen.getByTestId('reject-all-btn')).toBeInTheDocument();
      expect(screen.getByTestId('customize-btn')).toBeInTheDocument();
    });

    it('should display privacy and cookie policy links', () => {
      render(
        <CookieConsentBanner
          privacyPolicyUrl="/privacy"
          cookiePolicyUrl="/cookies"
        />
      );

      expect(screen.getByText('Privacy Policy')).toHaveAttribute('href', '/privacy');
      expect(screen.getByText('Cookie Policy')).toHaveAttribute('href', '/cookies');
    });
  });

  describe('Accept All Functionality', () => {
    it('should store consent with all categories enabled', async () => {
      const onConsentChange = vi.fn();
      const user = userEvent.setup();

      render(<CookieConsentBanner onConsentChange={onConsentChange} />);

      await user.click(screen.getByTestId('accept-all-btn'));

      expect(onConsentChange).toHaveBeenCalledWith(
        expect.objectContaining({
          necessary: true,
          analytics: true,
          marketing: true,
          preferences: true,
        })
      );
    });

    it('should hide banner after accepting', async () => {
      const user = userEvent.setup();

      render(<CookieConsentBanner />);

      await user.click(screen.getByTestId('accept-all-btn'));

      await waitFor(() => {
        expect(screen.queryByTestId('cookie-consent-banner')).not.toBeInTheDocument();
      });
    });
  });

  describe('Reject All Functionality', () => {
    it('should store consent with only necessary cookies', async () => {
      const onConsentChange = vi.fn();
      const user = userEvent.setup();

      render(<CookieConsentBanner onConsentChange={onConsentChange} />);

      await user.click(screen.getByTestId('reject-all-btn'));

      expect(onConsentChange).toHaveBeenCalledWith(
        expect.objectContaining({
          necessary: true,
          analytics: false,
          marketing: false,
          preferences: false,
        })
      );
    });

    it('should clear non-necessary cookies when rejecting', async () => {
      const user = userEvent.setup();

      // Pre-set some analytics cookies
      mockCookies['_ga'] = 'test-value';

      render(<CookieConsentBanner />);

      await user.click(screen.getByTestId('reject-all-btn'));

      // Verify clear was called for analytics cookies
      expect(mockCookieSetter).toHaveBeenCalledWith(
        expect.stringContaining('_ga=;')
      );
    });
  });

  describe('Settings Panel', () => {
    it('should open settings modal when Customize is clicked', async () => {
      const user = userEvent.setup();

      render(<CookieConsentBanner />);

      await user.click(screen.getByTestId('customize-btn'));

      expect(screen.getByTestId('cookie-settings-modal')).toBeInTheDocument();
    });

    it('should display all cookie categories in settings', async () => {
      const user = userEvent.setup();

      render(<CookieConsentBanner />);

      await user.click(screen.getByTestId('customize-btn'));

      expect(screen.getByTestId('category-necessary')).toBeInTheDocument();
      expect(screen.getByTestId('category-analytics')).toBeInTheDocument();
      expect(screen.getByTestId('category-marketing')).toBeInTheDocument();
      expect(screen.getByTestId('category-preferences')).toBeInTheDocument();
    });

    it('should show necessary cookies as always active', async () => {
      const user = userEvent.setup();

      render(<CookieConsentBanner />);

      await user.click(screen.getByTestId('customize-btn'));

      expect(screen.getByText('Always active')).toBeInTheDocument();
    });

    it('should allow toggling non-necessary categories', async () => {
      const user = userEvent.setup();

      render(<CookieConsentBanner />);

      await user.click(screen.getByTestId('customize-btn'));

      const analyticsToggle = screen.getByTestId('category-analytics-toggle');

      expect(analyticsToggle).not.toBeChecked();

      await user.click(analyticsToggle);

      expect(analyticsToggle).toBeChecked();
    });

    it('should save custom preferences when Save is clicked', async () => {
      const onConsentChange = vi.fn();
      const user = userEvent.setup();

      render(<CookieConsentBanner onConsentChange={onConsentChange} />);

      await user.click(screen.getByTestId('customize-btn'));

      // Enable analytics, leave others disabled
      await user.click(screen.getByTestId('category-analytics-toggle'));

      await user.click(screen.getByTestId('save-preferences-btn'));

      expect(onConsentChange).toHaveBeenCalledWith(
        expect.objectContaining({
          necessary: true,
          analytics: true,
          marketing: false,
          preferences: false,
        })
      );
    });
  });
});

// ============================================
// Accessibility Tests
// ============================================

describe('Accessibility', () => {
  it('should have proper ARIA attributes on banner', () => {
    render(<CookieConsentBanner />);

    const banner = screen.getByTestId('cookie-consent-banner');
    expect(banner).toHaveAttribute('role', 'dialog');
    expect(banner).toHaveAttribute('aria-modal', 'true');
    expect(banner).toHaveAttribute('aria-labelledby', 'cookie-consent-title');
    expect(banner).toHaveAttribute('aria-describedby', 'cookie-consent-description');
  });

  it('should have proper ARIA attributes on settings modal', async () => {
    const user = userEvent.setup();

    render(<CookieConsentBanner />);

    await user.click(screen.getByTestId('customize-btn'));

    const modal = screen.getByRole('dialog');
    expect(modal).toHaveAttribute('aria-modal', 'true');
    expect(modal).toHaveAttribute('aria-labelledby', 'cookie-settings-title');
  });

  it('should be keyboard navigable', async () => {
    const user = userEvent.setup();

    render(<CookieConsentBanner />);

    // Tab to first button
    await user.tab();
    expect(screen.getByTestId('reject-all-btn')).toHaveFocus();

    // Tab to customize
    await user.tab();
    expect(screen.getByTestId('customize-btn')).toHaveFocus();

    // Tab to accept all
    await user.tab();
    expect(screen.getByTestId('accept-all-btn')).toHaveFocus();
  });
});

// ============================================
// Cookie Inventory Tests
// ============================================

describe('Cookie Inventory', () => {
  it('should have necessary cookies defined', () => {
    const necessaryCookies = COOKIE_INVENTORY.filter(
      (c) => c.category === 'necessary'
    );

    expect(necessaryCookies.length).toBeGreaterThan(0);
    expect(necessaryCookies.map((c) => c.name)).toContain('session_token');
  });

  it('should have descriptions for all cookies', () => {
    COOKIE_INVENTORY.forEach((cookie) => {
      expect(cookie.description).toBeDefined();
      expect(cookie.description.length).toBeGreaterThan(10);
    });
  });

  it('should have valid categories for all cookies', () => {
    const validCategories = ['necessary', 'analytics', 'marketing', 'preferences'];

    COOKIE_INVENTORY.forEach((cookie) => {
      expect(validCategories).toContain(cookie.category);
    });
  });
});
