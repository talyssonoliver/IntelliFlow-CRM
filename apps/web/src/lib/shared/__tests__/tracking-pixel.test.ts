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

describe('tracking-pixel', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Reset window properties
    (window as Window & { dataLayer?: unknown[] }).dataLayer = undefined;
    (window as Window & { gtag?: unknown }).gtag = undefined;
    (window as Window & { fbq?: unknown }).fbq = undefined;
    (window as Window & { lintrk?: unknown }).lintrk = undefined;

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

      expect(window.dataLayer).toBeDefined();
      expect(window.dataLayer).toHaveLength(1);
    });

    it('pushes event to dataLayer', () => {
      window.dataLayer = [];

      pushToDataLayer({
        name: 'test_event',
        category: 'test_category',
        action: 'test_action',
        label: 'test_label',
        value: 100,
      });

      expect(window.dataLayer).toHaveLength(1);
      expect(window.dataLayer[0]).toMatchObject({
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
      window.dataLayer = [];

      pushToDataLayer({ name: 'test_event' });

      expect(window.dataLayer).toHaveLength(0);
    });
  });

  describe('trackGA4Event', () => {
    it('calls gtag with event parameters', () => {
      const mockGtag = vi.fn();
      window.gtag = mockGtag;

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
      window.fbq = mockFbq;

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
      window.fbq = mockFbq;

      trackFacebookEvent({ name: 'lead_captured' });
      expect(mockFbq).toHaveBeenCalledWith('track', 'Lead', expect.any(Object));

      trackFacebookEvent({ name: 'page_view' });
      expect(mockFbq).toHaveBeenCalledWith('track', 'PageView', expect.any(Object));
    });
  });

  describe('trackLinkedInConversion', () => {
    it('calls lintrk with conversion ID', () => {
      const mockLintrk = vi.fn();
      window.lintrk = mockLintrk;

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
      window.gtag = mockGtag;
      window.fbq = mockFbq;
      window.dataLayer = [];

      trackEvent({ name: 'test_event' });

      expect(window.dataLayer.length).toBeGreaterThan(0);
      expect(mockGtag).toHaveBeenCalled();
      expect(mockFbq).toHaveBeenCalled();
    });

    it('tracks only to specified providers', () => {
      const mockGtag = vi.fn();
      const mockFbq = vi.fn();
      window.gtag = mockGtag;
      window.fbq = mockFbq;
      window.dataLayer = [];

      trackEvent({ name: 'test_event' }, ['gtm']);

      expect(window.dataLayer.length).toBeGreaterThan(0);
      expect(mockGtag).toHaveBeenCalled();
      expect(mockFbq).not.toHaveBeenCalled();
    });

    it('tracks LinkedIn conversion when ID is provided', () => {
      const mockLintrk = vi.fn();
      window.lintrk = mockLintrk;

      trackEvent(
        { name: 'test', properties: { linkedInConversionId: '12345' } },
        ['linkedin']
      );

      expect(mockLintrk).toHaveBeenCalledWith('track', { conversion_id: '12345' });
    });
  });

  describe('trackConversion', () => {
    it('includes conversion metadata in event', () => {
      window.dataLayer = [];

      trackConversion({
        name: 'purchase',
        conversionId: 'conv_123',
        currency: 'USD',
        transactionId: 'txn_456',
        value: 99.99,
      });

      expect(window.dataLayer[0]).toMatchObject({
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
      window.dataLayer = [];

      trackSignupComplete({ method: 'email', email: 'test@example.com' });

      expect(window.dataLayer[0]).toMatchObject({
        event: 'signup_complete',
        signup_method: 'email',
        has_email: true,
      });
    });

    it('tracks signup with Google OAuth', () => {
      window.dataLayer = [];

      trackSignupComplete({ method: 'google' });

      expect(window.dataLayer[0]).toMatchObject({
        event: 'signup_complete',
        signup_method: 'google',
      });
    });

    it('does not include PII', () => {
      window.dataLayer = [];

      trackSignupComplete({
        method: 'email',
        email: 'sensitive@example.com',
        userId: 'user_123',
      });

      const event = window.dataLayer[0] as Record<string, unknown>;
      expect(event.email).toBeUndefined();
      expect(event.userId).toBeUndefined();
      expect(event.has_email).toBe(true);
      expect(event.has_user_id).toBe(true);
    });
  });

  describe('trackEmailVerified', () => {
    it('tracks email verification event', () => {
      window.dataLayer = [];

      trackEmailVerified({ userId: 'user_123', timeToVerify: 300 });

      expect(window.dataLayer[0]).toMatchObject({
        event: 'email_verified',
        eventCategory: 'registration',
        eventAction: 'verify',
        eventValue: 300,
      });
    });
  });

  describe('trackOnboardingStep', () => {
    it('tracks step with progress percentage', () => {
      window.dataLayer = [];

      trackOnboardingStep({
        step: 2,
        stepName: 'Complete Profile',
        totalSteps: 4,
      });

      expect(window.dataLayer[0]).toMatchObject({
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
      window.dataLayer = [];

      trackOnboardingComplete({ totalSteps: 4, timeToComplete: 600 });

      expect(window.dataLayer[0]).toMatchObject({
        event: 'onboarding_complete',
        total_steps: 4,
        time_to_complete_seconds: 600,
      });
    });
  });

  describe('trackPageView', () => {
    it('tracks page view with path', () => {
      window.dataLayer = [];

      trackPageView({
        path: '/signup/success',
        title: 'Sign Up Success',
        referrer: 'https://google.com',
      });

      expect(window.dataLayer[0]).toMatchObject({
        event: 'page_view',
        page_path: '/signup/success',
        page_title: 'Sign Up Success',
        referrer: 'https://google.com',
      });
    });
  });
});
