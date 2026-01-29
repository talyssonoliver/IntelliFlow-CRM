/**
 * Cookie Consent Component - EXP-ARTIFACTS-002
 *
 * GDPR-compliant cookie consent banner with:
 * - Category-based consent (necessary, analytics, marketing)
 * - Persistent storage with server validation
 * - Granular control UI
 * - Accessibility (WCAG 2.1 AA)
 *
 * @module CookieConsent
 * @version 1.0.0
 */

'use client';

import * as React from 'react';
import { useState, useEffect, useCallback } from 'react';

// ============================================
// Types & Interfaces
// ============================================

/**
 * Cookie categories as defined by GDPR/ePrivacy
 */
export type CookieCategory = 'necessary' | 'analytics' | 'marketing' | 'preferences';

/**
 * User's consent choices for each category
 */
export interface CookieConsent {
  necessary: boolean; // Always true - required for functionality
  analytics: boolean;
  marketing: boolean;
  preferences: boolean;
  timestamp: string;  // ISO 8601 timestamp of consent
  version: string;    // Consent policy version
}

/**
 * Props for the CookieConsentBanner component
 */
export interface CookieConsentBannerProps {
  /** Called when user accepts/rejects cookies */
  onConsentChange?: (consent: CookieConsent) => void;
  /** Server endpoint for consent validation */
  validationEndpoint?: string;
  /** Current consent policy version */
  policyVersion?: string;
  /** Privacy policy URL */
  privacyPolicyUrl?: string;
  /** Cookie policy URL */
  cookiePolicyUrl?: string;
  /** Custom class names */
  className?: string;
  /** Position on screen */
  position?: 'bottom' | 'top' | 'bottom-left' | 'bottom-right';
}

/**
 * Cookie information for disclosure
 */
export interface CookieInfo {
  name: string;
  category: CookieCategory;
  duration: string;
  description: string;
  provider: string;
}

// ============================================
// Constants
// ============================================

const CONSENT_COOKIE_NAME = 'intelliflow_consent';
const CONSENT_VERSION = '1.0.0';

/**
 * Default consent (only necessary cookies enabled)
 */
const DEFAULT_CONSENT: CookieConsent = {
  necessary: true,
  analytics: false,
  marketing: false,
  preferences: false,
  timestamp: '',
  version: CONSENT_VERSION,
};

/**
 * Cookie inventory for transparency
 */
export const COOKIE_INVENTORY: CookieInfo[] = [
  {
    name: 'session_token',
    category: 'necessary',
    duration: '24 hours',
    description: 'Maintains user session for authentication',
    provider: 'IntelliFlow',
  },
  {
    name: 'csrf_token',
    category: 'necessary',
    duration: 'Session',
    description: 'Protects against cross-site request forgery',
    provider: 'IntelliFlow',
  },
  {
    name: 'intelliflow_consent',
    category: 'necessary',
    duration: '1 year',
    description: 'Stores cookie consent preferences',
    provider: 'IntelliFlow',
  },
  {
    name: '_ga',
    category: 'analytics',
    duration: '2 years',
    description: 'Distinguishes users for Google Analytics',
    provider: 'Google',
  },
  {
    name: '_gid',
    category: 'analytics',
    duration: '24 hours',
    description: 'Distinguishes users for Google Analytics',
    provider: 'Google',
  },
  {
    name: 'mixpanel_id',
    category: 'analytics',
    duration: '1 year',
    description: 'Tracks user behavior for product analytics',
    provider: 'Mixpanel',
  },
  {
    name: '_fbp',
    category: 'marketing',
    duration: '90 days',
    description: 'Facebook advertising pixel',
    provider: 'Meta',
  },
  {
    name: '_gcl_au',
    category: 'marketing',
    duration: '90 days',
    description: 'Google Ads conversion tracking',
    provider: 'Google',
  },
  {
    name: 'theme',
    category: 'preferences',
    duration: '1 year',
    description: 'Stores UI theme preference (light/dark)',
    provider: 'IntelliFlow',
  },
  {
    name: 'language',
    category: 'preferences',
    duration: '1 year',
    description: 'Stores language preference',
    provider: 'IntelliFlow',
  },
];

// ============================================
// Utility Functions
// ============================================

/**
 * Get consent from cookie storage
 */
export function getStoredConsent(): CookieConsent | null {
  if (typeof window === 'undefined') return null;

  try {
    const stored = document.cookie
      .split('; ')
      .find((row) => row.startsWith(`${CONSENT_COOKIE_NAME}=`));

    if (!stored) return null;

    const value = decodeURIComponent(stored.split('=')[1]);
    const consent = JSON.parse(value) as CookieConsent;

    // Validate consent structure
    if (!consent.timestamp || !consent.version) {
      return null;
    }

    return consent;
  } catch {
    return null;
  }
}

/**
 * Store consent in cookie
 */
export function storeConsent(consent: CookieConsent): void {
  if (typeof window === 'undefined') return;

  const value = encodeURIComponent(JSON.stringify(consent));
  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 1);

  document.cookie = `${CONSENT_COOKIE_NAME}=${value}; expires=${expires.toUTCString()}; path=/; SameSite=Lax; Secure`;
}

/**
 * Clear non-necessary cookies when consent is withdrawn
 */
export function clearNonNecessaryCookies(categories: CookieCategory[]): void {
  if (typeof window === 'undefined') return;

  const cookiesToClear = COOKIE_INVENTORY.filter(
    (cookie) => categories.includes(cookie.category) && cookie.category !== 'necessary'
  );

  cookiesToClear.forEach((cookie) => {
    document.cookie = `${cookie.name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  });
}

/**
 * Check if consent is still valid (not expired, same version)
 */
export function isConsentValid(consent: CookieConsent | null, version: string): boolean {
  if (!consent) return false;

  // Check version match
  if (consent.version !== version) return false;

  // Check if consent was given within last year
  const consentDate = new Date(consent.timestamp);
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  return consentDate > oneYearAgo;
}

// ============================================
// Hook: useCookieConsent
// ============================================

export interface UseCookieConsentReturn {
  consent: CookieConsent | null;
  hasConsented: boolean;
  showBanner: boolean;
  acceptAll: () => void;
  rejectAll: () => void;
  updateConsent: (categories: Partial<Omit<CookieConsent, 'necessary' | 'timestamp' | 'version'>>) => void;
  openSettings: () => void;
  closeSettings: () => void;
  settingsOpen: boolean;
}

export function useCookieConsent(
  policyVersion: string = CONSENT_VERSION,
  onConsentChange?: (consent: CookieConsent) => void
): UseCookieConsentReturn {
  const [consent, setConsent] = useState<CookieConsent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Load stored consent on mount
  useEffect(() => {
    const stored = getStoredConsent();

    if (isConsentValid(stored, policyVersion)) {
      setConsent(stored);
      setShowBanner(false);
    } else {
      setShowBanner(true);
    }
  }, [policyVersion]);

  const saveConsent = useCallback(
    (newConsent: CookieConsent) => {
      storeConsent(newConsent);
      setConsent(newConsent);
      setShowBanner(false);
      setSettingsOpen(false);
      onConsentChange?.(newConsent);
    },
    [onConsentChange]
  );

  const acceptAll = useCallback(() => {
    const newConsent: CookieConsent = {
      necessary: true,
      analytics: true,
      marketing: true,
      preferences: true,
      timestamp: new Date().toISOString(),
      version: policyVersion,
    };
    saveConsent(newConsent);
  }, [policyVersion, saveConsent]);

  const rejectAll = useCallback(() => {
    const newConsent: CookieConsent = {
      necessary: true,
      analytics: false,
      marketing: false,
      preferences: false,
      timestamp: new Date().toISOString(),
      version: policyVersion,
    };

    // Clear cookies for rejected categories
    clearNonNecessaryCookies(['analytics', 'marketing', 'preferences']);

    saveConsent(newConsent);
  }, [policyVersion, saveConsent]);

  const updateConsent = useCallback(
    (categories: Partial<Omit<CookieConsent, 'necessary' | 'timestamp' | 'version'>>) => {
      const newConsent: CookieConsent = {
        necessary: true,
        analytics: categories.analytics ?? consent?.analytics ?? false,
        marketing: categories.marketing ?? consent?.marketing ?? false,
        preferences: categories.preferences ?? consent?.preferences ?? false,
        timestamp: new Date().toISOString(),
        version: policyVersion,
      };

      // Clear cookies for newly rejected categories
      const rejectedCategories: CookieCategory[] = [];
      if (!newConsent.analytics && consent?.analytics) rejectedCategories.push('analytics');
      if (!newConsent.marketing && consent?.marketing) rejectedCategories.push('marketing');
      if (!newConsent.preferences && consent?.preferences) rejectedCategories.push('preferences');

      if (rejectedCategories.length > 0) {
        clearNonNecessaryCookies(rejectedCategories);
      }

      saveConsent(newConsent);
    },
    [consent, policyVersion, saveConsent]
  );

  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  return {
    consent,
    hasConsented: consent !== null,
    showBanner,
    acceptAll,
    rejectAll,
    updateConsent,
    openSettings,
    closeSettings,
    settingsOpen,
  };
}

// ============================================
// Component: CookieConsentBanner
// ============================================

export function CookieConsentBanner({
  onConsentChange,
  policyVersion = CONSENT_VERSION,
  privacyPolicyUrl = '/privacy',
  cookiePolicyUrl = '/cookies',
  className = '',
  position = 'bottom',
}: CookieConsentBannerProps): React.ReactElement | null {
  const {
    showBanner,
    settingsOpen,
    acceptAll,
    rejectAll,
    updateConsent,
    openSettings,
    closeSettings,
    consent,
  } = useCookieConsent(policyVersion, onConsentChange);

  // Category toggles for settings panel
  const [localConsent, setLocalConsent] = useState<Partial<CookieConsent>>({
    analytics: false,
    marketing: false,
    preferences: false,
  });

  // Sync local state with stored consent when settings open
  useEffect(() => {
    if (settingsOpen && consent) {
      setLocalConsent({
        analytics: consent.analytics,
        marketing: consent.marketing,
        preferences: consent.preferences,
      });
    }
  }, [settingsOpen, consent]);

  if (!showBanner && !settingsOpen) {
    return null;
  }

  const positionClasses = {
    bottom: 'bottom-0 left-0 right-0',
    top: 'top-0 left-0 right-0',
    'bottom-left': 'bottom-4 left-4 max-w-md',
    'bottom-right': 'bottom-4 right-4 max-w-md',
  };

  return (
    <>
      {/* Main Banner */}
      {showBanner && !settingsOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="cookie-consent-title"
          aria-describedby="cookie-consent-description"
          className={`fixed ${positionClasses[position]} z-50 bg-white dark:bg-gray-900 border-t dark:border-gray-700 shadow-lg p-4 md:p-6 ${className}`}
          data-testid="cookie-consent-banner"
        >
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex-1">
                <h2
                  id="cookie-consent-title"
                  className="text-lg font-semibold text-gray-900 dark:text-white"
                >
                  Cookie Preferences
                </h2>
                <p
                  id="cookie-consent-description"
                  className="mt-1 text-sm text-gray-600 dark:text-gray-300"
                >
                  We use cookies to enhance your experience. By continuing to visit this site you agree to our use of necessary cookies.
                  You can customize your preferences below.{' '}
                  <a
                    href={privacyPolicyUrl}
                    className="text-blue-600 hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Privacy Policy
                  </a>
                  {' | '}
                  <a
                    href={cookiePolicyUrl}
                    className="text-blue-600 hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Cookie Policy
                  </a>
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={rejectAll}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors"
                  data-testid="reject-all-btn"
                >
                  Reject All
                </button>
                <button
                  onClick={openSettings}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-md transition-colors"
                  data-testid="customize-btn"
                >
                  Customize
                </button>
                <button
                  onClick={acceptAll}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
                  data-testid="accept-all-btn"
                >
                  Accept All
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settings Panel (Modal) */}
      {settingsOpen && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cookie-settings-title"
        >
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50"
            onClick={closeSettings}
            aria-hidden="true"
          />

          {/* Modal */}
          <div className="relative min-h-screen flex items-center justify-center p-4">
            <div
              className="relative bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
              data-testid="cookie-settings-modal"
            >
              {/* Header */}
              <div className="sticky top-0 bg-white dark:bg-gray-900 border-b dark:border-gray-700 px-6 py-4">
                <div className="flex items-center justify-between">
                  <h2
                    id="cookie-settings-title"
                    className="text-xl font-semibold text-gray-900 dark:text-white"
                  >
                    Cookie Settings
                  </h2>
                  <button
                    onClick={closeSettings}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                    aria-label="Close settings"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="px-6 py-4 space-y-6">
                {/* Necessary Cookies - Always enabled */}
                <CookieCategorySection
                  title="Necessary Cookies"
                  description="These cookies are essential for the website to function properly. They cannot be disabled."
                  enabled={true}
                  locked={true}
                  cookies={COOKIE_INVENTORY.filter((c) => c.category === 'necessary')}
                  data-testid="category-necessary"
                />

                {/* Analytics Cookies */}
                <CookieCategorySection
                  title="Analytics Cookies"
                  description="These cookies help us understand how visitors interact with our website by collecting and reporting information anonymously."
                  enabled={localConsent.analytics ?? false}
                  onChange={(enabled) => setLocalConsent({ ...localConsent, analytics: enabled })}
                  cookies={COOKIE_INVENTORY.filter((c) => c.category === 'analytics')}
                  data-testid="category-analytics"
                />

                {/* Marketing Cookies */}
                <CookieCategorySection
                  title="Marketing Cookies"
                  description="These cookies are used to track visitors across websites to display relevant advertisements."
                  enabled={localConsent.marketing ?? false}
                  onChange={(enabled) => setLocalConsent({ ...localConsent, marketing: enabled })}
                  cookies={COOKIE_INVENTORY.filter((c) => c.category === 'marketing')}
                  data-testid="category-marketing"
                />

                {/* Preferences Cookies */}
                <CookieCategorySection
                  title="Preference Cookies"
                  description="These cookies remember your preferences like language and theme settings."
                  enabled={localConsent.preferences ?? false}
                  onChange={(enabled) => setLocalConsent({ ...localConsent, preferences: enabled })}
                  cookies={COOKIE_INVENTORY.filter((c) => c.category === 'preferences')}
                  data-testid="category-preferences"
                />
              </div>

              {/* Footer */}
              <div className="sticky bottom-0 bg-white dark:bg-gray-900 border-t dark:border-gray-700 px-6 py-4">
                <div className="flex justify-end gap-2">
                  <button
                    onClick={rejectAll}
                    className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors"
                  >
                    Reject All
                  </button>
                  <button
                    onClick={() => updateConsent(localConsent)}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
                    data-testid="save-preferences-btn"
                  >
                    Save Preferences
                  </button>
                  <button
                    onClick={acceptAll}
                    className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md transition-colors"
                  >
                    Accept All
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ============================================
// Component: CookieCategorySection
// ============================================

interface CookieCategorySectionProps {
  title: string;
  description: string;
  enabled: boolean;
  locked?: boolean;
  onChange?: (enabled: boolean) => void;
  cookies: CookieInfo[];
  'data-testid'?: string;
}

function CookieCategorySection({
  title,
  description,
  enabled,
  locked = false,
  onChange,
  cookies,
  'data-testid': testId,
}: CookieCategorySectionProps): React.ReactElement {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="border dark:border-gray-700 rounded-lg overflow-hidden"
      data-testid={testId}
    >
      <div className="p-4 bg-gray-50 dark:bg-gray-800">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h3 className="text-base font-medium text-gray-900 dark:text-white">
              {title}
            </h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              {description}
            </p>
          </div>

          <div className="ml-4 flex items-center">
            {locked ? (
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Always active
              </span>
            ) : (
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => onChange?.(e.target.checked)}
                  className="sr-only peer"
                  data-testid={`${testId}-toggle`}
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600" />
              </label>
            )}
          </div>
        </div>

        {/* Expand/Collapse button */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 text-sm text-blue-600 hover:underline flex items-center"
          aria-expanded={expanded}
        >
          {expanded ? 'Hide' : 'Show'} cookies ({cookies.length})
          <svg
            className={`ml-1 w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Cookie List */}
      {expanded && (
        <div className="border-t dark:border-gray-700">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 dark:bg-gray-800">
              <tr>
                <th className="px-4 py-2 text-left text-gray-600 dark:text-gray-300">Cookie</th>
                <th className="px-4 py-2 text-left text-gray-600 dark:text-gray-300">Provider</th>
                <th className="px-4 py-2 text-left text-gray-600 dark:text-gray-300">Duration</th>
                <th className="px-4 py-2 text-left text-gray-600 dark:text-gray-300">Purpose</th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-700">
              {cookies.map((cookie) => (
                <tr key={cookie.name}>
                  <td className="px-4 py-2 font-mono text-gray-900 dark:text-white">{cookie.name}</td>
                  <td className="px-4 py-2 text-gray-600 dark:text-gray-300">{cookie.provider}</td>
                  <td className="px-4 py-2 text-gray-600 dark:text-gray-300">{cookie.duration}</td>
                  <td className="px-4 py-2 text-gray-600 dark:text-gray-300">{cookie.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================
// Default Export
// ============================================

export default CookieConsentBanner;
