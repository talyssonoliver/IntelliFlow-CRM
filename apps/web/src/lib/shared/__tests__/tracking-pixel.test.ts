/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isDoNotTrackEnabled,
  isTrackingAllowed,
  pushToDataLayer,
  trackGA4Event,
  trackFacebookEvent,
  trackLinkedInConversion,
  trackEvent,
  trackConversion,
  trackSignupComplete,
  trackEmailVerified,
  trackOnboardingStep,
  trackOnboardingComplete,
  trackPageView,
} from '../tracking-pixel';

// Extend globalThis types for tests
declare const globalThis: {
  dataLayer?: Record<string, unknown>[];
  gtag?: (...args: unknown[]) => void;
  fbq?: (...args: unknown[]) => void;
  lintrk?: (action: string, data: Record<string, unknown>) => void;
};

describe('tracking-pixel', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Reset globalThis properties
    globalThis.dataLayer = undefined;
    globalThis.gtag = undefined;
    globalThis.fbq = undefined;
    globalThis.lintrk = undefined;

    // Mock console.log for debug output
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Reset navigator.doNotTrack
    Object.defineProperty(navigator, 'doNotTrack', {
      value: null,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    vi.restoreAllMocks();
  });

  describe('isDoNotTrackEnabled', () => {
    it('returns false when DNT is not set', () => {
      Object.defineProperty(navigator, 'doNotTrack', {
        value: null,
        configurable: true,
      });

      expect(isDoNotTrackEnabled()).toBe(false);
    });

    it('returns true when DNT is "1"', () => {
      Object.defineProperty(navigator, 'doNotTrack', {
        value: '1',
        configurable: true,
      });

      expect(isDoNotTrackEnabled()).toBe(true);
    });

    it('returns true when DNT is "yes"', () => {
      Object.defineProperty(navigator, 'doNotTrack', {
        value: 'yes',
        configurable: true,
      });

      expect(isDoNotTrackEnabled()).toBe(true);
    });

    it('returns false when DNT is "0"', () => {
      Object.defineProperty(navigator, 'doNotTrack', {
        value: '0',
        configurable: true,
      });

      expect(isDoNotTrackEnabled()).toBe(false);
    });
  });

  describe('isTrackingAllowed', () => {
    it('returns true when DNT is not set', () => {
      expect(isTrackingAllowed()).toBe(true);
    });

    it('returns false when DNT is enabled and respectDoNotTrack is true', () => {
      Object.defineProperty(navigator, 'doNotTrack', {
        value: '1',
        configurable: true,
      });

      expect(isTrackingAllowed({ respectDoNotTrack: true })).toBe(false);
    });

    it('returns true when DNT is enabled but respectDoNotTrack is false', () => {
      Object.defineProperty(navigator, 'doNotTrack', {
        value: '1',
        configurable: true,
      });

      expect(isTrackingAllowed({ respectDoNotTrack: false })).toBe(true);
    });
  });

  describe('pushToDataLayer', () => {
    it('initializes dataLayer if not present', () => {
      pushToDataLayer({ name: 'test_event' });

      expect(globalThis.dataLayer).toBeDefined();
      expect(globalThis.dataLayer).toHaveLength(1);
    });

    it('pushes event to dataLayer', () => {
      globalThis.dataLayer = [];

      pushToDataLayer({
        name: 'test_event',
        category: 'test_category',
        action: 'test_action',
        label: 'test_label',
        value: 100,
      });

      expect(globalThis.dataLayer).toHaveLength(1);
      expect(globalThis.dataLayer[0]).toMatchObject({
        event: 'test_event',
        eventCategory: 'test_category',
        eventAction: 'test_action',
        eventLabel: 'test_label',
        eventValue: 100,
      });
    });

    it('does not push when DNT is enabled', () => {
      Object.defineProperty(navigator, 'doNotTrack', {
        value: '1',
        configurable: true,
      });
      globalThis.dataLayer = [];

      pushToDataLayer({ name: 'test_event' });

      expect(globalThis.dataLayer).toHaveLength(0);
    });
  });

  describe('trackGA4Event', () => {
    it('calls gtag with event parameters', () => {
      const mockGtag = vi.fn();
      globalThis.gtag = mockGtag;

      trackGA4Event({
        name: 'button_click',
        category: 'engagement',
        label: 'signup_button',
        value: 1,
      });

      expect(mockGtag).toHaveBeenCalledWith('event', 'button_click', {
        event_category: 'engagement',
        event_label: 'signup_button',
        value: 1,
      });
    });

    it('does not call gtag when not available', () => {
      // gtag is undefined
      expect(() => trackGA4Event({ name: 'test' })).not.toThrow();
    });
  });

  describe('trackFacebookEvent', () => {
    it('calls fbq with mapped event name', () => {
      const mockFbq = vi.fn();
      globalThis.fbq = mockFbq;

      trackFacebookEvent({
        name: 'signup_complete',
        category: 'registration',
      });

      expect(mockFbq).toHaveBeenCalledWith('track', 'CompleteRegistration', {
        content_category: 'registration',
        content_name: undefined,
        value: undefined,
      });
    });

    it('maps standard events correctly', () => {
      const mockFbq = vi.fn();
      globalThis.fbq = mockFbq;

      trackFacebookEvent({ name: 'lead_captured' });
      expect(mockFbq).toHaveBeenCalledWith('track', 'Lead', expect.any(Object));

      trackFacebookEvent({ name: 'page_view' });
      expect(mockFbq).toHaveBeenCalledWith('track', 'PageView', expect.any(Object));
    });
  });

  describe('trackLinkedInConversion', () => {
    it('calls lintrk with conversion ID', () => {
      const mockLintrk = vi.fn();
      globalThis.lintrk = mockLintrk;

      trackLinkedInConversion('12345');

      expect(mockLintrk).toHaveBeenCalledWith('track', { conversion_id: '12345' });
    });

    it('does not call lintrk when not available', () => {
      expect(() => trackLinkedInConversion('12345')).not.toThrow();
    });
  });

  describe('trackEvent', () => {
    it('tracks to all providers by default', () => {
      const mockGtag = vi.fn();
      const mockFbq = vi.fn();
      globalThis.gtag = mockGtag;
      globalThis.fbq = mockFbq;
      globalThis.dataLayer = [];

      trackEvent({ name: 'test_event' });

      expect(globalThis.dataLayer.length).toBeGreaterThan(0);
      expect(mockGtag).toHaveBeenCalled();
      expect(mockFbq).toHaveBeenCalled();
    });

    it('tracks only to specified providers', () => {
      const mockGtag = vi.fn();
      const mockFbq = vi.fn();
      globalThis.gtag = mockGtag;
      globalThis.fbq = mockFbq;
      globalThis.dataLayer = [];

      trackEvent({ name: 'test_event' }, ['gtm']);

      expect(globalThis.dataLayer.length).toBeGreaterThan(0);
      expect(mockGtag).toHaveBeenCalled();
      expect(mockFbq).not.toHaveBeenCalled();
    });

    it('tracks LinkedIn conversion when ID is provided', () => {
      const mockLintrk = vi.fn();
      globalThis.lintrk = mockLintrk;

      trackEvent(
        { name: 'test', properties: { linkedInConversionId: '12345' } },
        ['linkedin']
      );

      expect(mockLintrk).toHaveBeenCalledWith('track', { conversion_id: '12345' });
    });
  });

  describe('trackConversion', () => {
    it('includes conversion metadata in event', () => {
      globalThis.dataLayer = [];

      trackConversion({
        name: 'purchase',
        conversionId: 'conv_123',
        currency: 'USD',
        transactionId: 'txn_456',
        value: 99.99,
      });

      expect(globalThis.dataLayer[0]).toMatchObject({
        event: 'purchase',
        conversion_id: 'conv_123',
        currency: 'USD',
        transaction_id: 'txn_456',
        eventValue: 99.99,
      });
    });
  });

  describe('trackSignupComplete', () => {
    it('tracks signup with email method', () => {
      globalThis.dataLayer = [];

      trackSignupComplete({ method: 'email', email: 'test@example.com' });

      expect(globalThis.dataLayer[0]).toMatchObject({
        event: 'signup_complete',
        signup_method: 'email',
        has_email: true,
      });
    });

    it('tracks signup with Google OAuth', () => {
      globalThis.dataLayer = [];

      trackSignupComplete({ method: 'google' });

      expect(globalThis.dataLayer[0]).toMatchObject({
        event: 'signup_complete',
        signup_method: 'google',
      });
    });

    it('does not include PII', () => {
      globalThis.dataLayer = [];

      trackSignupComplete({
        method: 'email',
        email: 'sensitive@example.com',
        userId: 'user_123',
      });

      const event = globalThis.dataLayer[0] as Record<string, unknown>;
      expect(event.email).toBeUndefined();
      expect(event.userId).toBeUndefined();
      expect(event.has_email).toBe(true);
      expect(event.has_user_id).toBe(true);
    });
  });

  describe('trackEmailVerified', () => {
    it('tracks email verification event', () => {
      globalThis.dataLayer = [];

      trackEmailVerified({ userId: 'user_123', timeToVerify: 300 });

      expect(globalThis.dataLayer[0]).toMatchObject({
        event: 'email_verified',
        eventCategory: 'registration',
        eventAction: 'verify',
        eventValue: 300,
      });
    });
  });

  describe('trackOnboardingStep', () => {
    it('tracks step with progress percentage', () => {
      globalThis.dataLayer = [];

      trackOnboardingStep({
        step: 2,
        stepName: 'Complete Profile',
        totalSteps: 4,
      });

      expect(globalThis.dataLayer[0]).toMatchObject({
        event: 'onboarding_step',
        step_number: 2,
        step_name: 'Complete Profile',
        total_steps: 4,
        progress_percent: 50,
      });
    });
  });

  describe('trackOnboardingComplete', () => {
    it('tracks onboarding completion', () => {
      globalThis.dataLayer = [];

      trackOnboardingComplete({ totalSteps: 4, timeToComplete: 600 });

      expect(globalThis.dataLayer[0]).toMatchObject({
        event: 'onboarding_complete',
        total_steps: 4,
        time_to_complete_seconds: 600,
      });
    });
  });

  describe('trackPageView', () => {
    it('tracks page view with path', () => {
      globalThis.dataLayer = [];

      trackPageView({
        path: '/signup/success',
        title: 'Sign Up Success',
        referrer: 'https://google.com',
      });

      expect(globalThis.dataLayer[0]).toMatchObject({
        event: 'page_view',
        page_path: '/signup/success',
        page_title: 'Sign Up Success',
        referrer: 'https://google.com',
      });
    });
  });
});

