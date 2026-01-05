/**
 * Tracking Pixel Service
 *
 * Client-side analytics and conversion tracking utilities.
 *
 * IMPLEMENTS: PG-017 (Sign Up Success page)
 *
 * Features:
 * - Google Tag Manager integration
 * - Facebook Pixel integration
 * - LinkedIn Insight Tag integration
 * - Custom event tracking
 * - Privacy-aware tracking (respects Do Not Track)
 */

// ============================================
// Types
// ============================================

export type TrackingProvider = 'gtm' | 'facebook' | 'linkedin' | 'custom';

export interface TrackingEvent {
  name: string;
  category?: string;
  action?: string;
  label?: string;
  value?: number;
  properties?: Record<string, unknown>;
}

export interface ConversionEvent extends TrackingEvent {
  conversionId?: string;
  currency?: string;
  transactionId?: string;
}

export interface TrackingConfig {
  gtmId?: string;
  facebookPixelId?: string;
  linkedInPartnerId?: string;
  debug?: boolean;
  respectDoNotTrack?: boolean;
}

// ============================================
// Constants
// ============================================

const DEFAULT_CONFIG: TrackingConfig = {
  gtmId: process.env.NEXT_PUBLIC_GTM_ID,
  facebookPixelId: process.env.NEXT_PUBLIC_FB_PIXEL_ID,
  linkedInPartnerId: process.env.NEXT_PUBLIC_LINKEDIN_PARTNER_ID,
  debug: process.env.NODE_ENV === 'development',
  respectDoNotTrack: true,
};

// ============================================
// Do Not Track Detection
// ============================================

/**
 * Check if user has Do Not Track enabled
 */
export function isDoNotTrackEnabled(): boolean {
  if (typeof window === 'undefined') return false;

  const dnt =
    navigator.doNotTrack ||
    (window as Window & { doNotTrack?: string }).doNotTrack ||
    (navigator as Navigator & { msDoNotTrack?: string }).msDoNotTrack;

  return dnt === '1' || dnt === 'yes';
}

/**
 * Check if tracking is allowed based on config and DNT
 */
export function isTrackingAllowed(config: TrackingConfig = DEFAULT_CONFIG): boolean {
  if (config.respectDoNotTrack && isDoNotTrackEnabled()) {
    return false;
  }
  return true;
}

// ============================================
// Google Tag Manager
// ============================================

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
    _linkedin_data_partner_ids?: string[];
    lintrk?: (action: string, data: Record<string, unknown>) => void;
  }
}

/**
 * Push event to Google Tag Manager dataLayer
 */
export function pushToDataLayer(event: TrackingEvent): void {
  if (typeof window === 'undefined') return;
  if (!isTrackingAllowed()) return;

  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    event: event.name,
    eventCategory: event.category,
    eventAction: event.action,
    eventLabel: event.label,
    eventValue: event.value,
    ...event.properties,
  });

  if (DEFAULT_CONFIG.debug) {
    console.log('[Tracking] GTM dataLayer push:', event);
  }
}

/**
 * Track Google Analytics 4 event via gtag
 */
export function trackGA4Event(event: TrackingEvent): void {
  if (typeof window === 'undefined' || !window.gtag) return;
  if (!isTrackingAllowed()) return;

  window.gtag('event', event.name, {
    event_category: event.category,
    event_label: event.label,
    value: event.value,
    ...event.properties,
  });

  if (DEFAULT_CONFIG.debug) {
    console.log('[Tracking] GA4 event:', event);
  }
}

// ============================================
// Facebook Pixel
// ============================================

/**
 * Track Facebook Pixel event
 */
export function trackFacebookEvent(event: TrackingEvent): void {
  if (typeof window === 'undefined' || !window.fbq) return;
  if (!isTrackingAllowed()) return;

  const eventName = mapToFacebookEvent(event.name);
  window.fbq('track', eventName, {
    content_category: event.category,
    content_name: event.label,
    value: event.value,
    ...event.properties,
  });

  if (DEFAULT_CONFIG.debug) {
    console.log('[Tracking] Facebook Pixel event:', eventName, event);
  }
}

/**
 * Map custom event names to Facebook standard events
 */
function mapToFacebookEvent(eventName: string): string {
  const mapping: Record<string, string> = {
    signup_complete: 'CompleteRegistration',
    signup_success: 'CompleteRegistration',
    registration_complete: 'CompleteRegistration',
    lead_captured: 'Lead',
    page_view: 'PageView',
    add_to_cart: 'AddToCart',
    purchase: 'Purchase',
    subscribe: 'Subscribe',
  };

  return mapping[eventName.toLowerCase()] || eventName;
}

// ============================================
// LinkedIn Insight Tag
// ============================================

/**
 * Track LinkedIn conversion event
 */
export function trackLinkedInConversion(conversionId: string): void {
  if (typeof window === 'undefined' || !window.lintrk) return;
  if (!isTrackingAllowed()) return;

  window.lintrk('track', { conversion_id: conversionId });

  if (DEFAULT_CONFIG.debug) {
    console.log('[Tracking] LinkedIn conversion:', conversionId);
  }
}

// ============================================
// Unified Tracking API
// ============================================

/**
 * Track event across all configured providers
 *
 * @param event - The event to track
 * @param providers - Optional array of providers to track to (defaults to all)
 *
 * @example
 * ```tsx
 * // Track signup completion
 * trackEvent({
 *   name: 'signup_complete',
 *   category: 'auth',
 *   properties: { method: 'email' }
 * });
 *
 * // Track to specific providers only
 * trackEvent(
 *   { name: 'page_view', category: 'navigation' },
 *   ['gtm', 'facebook']
 * );
 * ```
 */
export function trackEvent(
  event: TrackingEvent,
  providers: TrackingProvider[] = ['gtm', 'facebook', 'linkedin']
): void {
  if (!isTrackingAllowed()) {
    if (DEFAULT_CONFIG.debug) {
      console.log('[Tracking] Blocked by Do Not Track preference');
    }
    return;
  }

  if (providers.includes('gtm')) {
    pushToDataLayer(event);
    trackGA4Event(event);
  }

  if (providers.includes('facebook')) {
    trackFacebookEvent(event);
  }

  if (providers.includes('linkedin') && event.properties?.linkedInConversionId) {
    trackLinkedInConversion(event.properties.linkedInConversionId as string);
  }
}

/**
 * Track conversion event (e.g., signup, purchase)
 *
 * @param conversion - The conversion event details
 *
 * @example
 * ```tsx
 * trackConversion({
 *   name: 'signup_complete',
 *   category: 'registration',
 *   value: 0,
 *   currency: 'USD',
 *   transactionId: 'user-123',
 *   properties: {
 *     method: 'email',
 *     plan: 'free_trial'
 *   }
 * });
 * ```
 */
export function trackConversion(conversion: ConversionEvent): void {
  trackEvent({
    ...conversion,
    properties: {
      ...conversion.properties,
      conversion_id: conversion.conversionId,
      currency: conversion.currency,
      transaction_id: conversion.transactionId,
    },
  });
}

// ============================================
// Pre-defined Events
// ============================================

/**
 * Track signup completion event
 */
export function trackSignupComplete(options: {
  method: 'email' | 'google' | 'microsoft';
  email?: string;
  userId?: string;
}): void {
  trackConversion({
    name: 'signup_complete',
    category: 'registration',
    action: 'complete',
    label: options.method,
    properties: {
      signup_method: options.method,
      // Don't track PII - only hashed or anonymized data
      has_email: !!options.email,
      has_user_id: !!options.userId,
    },
  });
}

/**
 * Track email verification event
 */
export function trackEmailVerified(options: {
  userId?: string;
  timeToVerify?: number;
}): void {
  trackEvent({
    name: 'email_verified',
    category: 'registration',
    action: 'verify',
    value: options.timeToVerify,
    properties: {
      has_user_id: !!options.userId,
    },
  });
}

/**
 * Track onboarding step completion
 */
export function trackOnboardingStep(options: {
  step: number;
  stepName: string;
  totalSteps: number;
}): void {
  trackEvent({
    name: 'onboarding_step',
    category: 'onboarding',
    action: 'complete_step',
    label: options.stepName,
    value: options.step,
    properties: {
      step_number: options.step,
      step_name: options.stepName,
      total_steps: options.totalSteps,
      progress_percent: Math.round((options.step / options.totalSteps) * 100),
    },
  });
}

/**
 * Track onboarding completion
 */
export function trackOnboardingComplete(options: {
  totalSteps: number;
  timeToComplete?: number;
}): void {
  trackConversion({
    name: 'onboarding_complete',
    category: 'onboarding',
    action: 'complete',
    value: options.timeToComplete,
    properties: {
      total_steps: options.totalSteps,
      time_to_complete_seconds: options.timeToComplete,
    },
  });
}

/**
 * Track page view
 */
export function trackPageView(options: {
  path: string;
  title?: string;
  referrer?: string;
}): void {
  trackEvent({
    name: 'page_view',
    category: 'navigation',
    label: options.path,
    properties: {
      page_path: options.path,
      page_title: options.title,
      referrer: options.referrer,
    },
  });
}
