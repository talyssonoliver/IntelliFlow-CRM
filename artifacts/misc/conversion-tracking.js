/**
 * Conversion Tracking for IntelliFlow CRM Public Pages
 *
 * Integrates with Google Analytics 4 (GA4) for conversion tracking.
 * Tracks page views, feature interactions, and conversion events.
 *
 * @file conversion-tracking.js
 * @requires Google Analytics 4 (gtag.js loaded in layout)
 */

/**
 * Track page view
 * @param {string} pagePath - The page path (e.g., '/features')
 * @param {string} pageTitle - The page title
 */
export function trackPageView(pagePath, pageTitle) {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', 'page_view', {
      page_path: pagePath,
      page_title: pageTitle,
      page_location: window.location.href,
    });
  }
}

/**
 * Track feature view interaction
 * @param {string} featureId - The feature ID (e.g., 'ai-lead-scoring')
 * @param {string} featureName - The feature name for display
 * @param {string} category - The feature category
 */
export function trackFeatureView(featureId, featureName, category) {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', 'feature_view', {
      feature_id: featureId,
      feature_name: featureName,
      category: category,
      page_path: '/features',
    });
  }
}

/**
 * Track "Learn More" click on a feature
 * @param {string} featureId - The feature ID
 * @param {string} featureName - The feature name
 * @param {string} targetUrl - The URL being navigated to
 */
export function trackFeatureLearnMore(featureId, featureName, targetUrl) {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', 'feature_learn_more', {
      feature_id: featureId,
      feature_name: featureName,
      target_url: targetUrl,
      page_path: '/features',
    });
  }
}

/**
 * Track CTA button click
 * @param {string} ctaType - The CTA type ('trial', 'pricing', 'demo')
 * @param {string} ctaText - The button text
 * @param {string} sourcePage - The page where CTA was clicked
 */
export function trackCTAClick(ctaType, ctaText, sourcePage) {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', 'cta_click', {
      cta_type: ctaType,
      cta_text: ctaText,
      source_page: sourcePage,
    });
  }
}

/**
 * Track scroll depth (for engagement metrics)
 * @param {number} percentage - Scroll depth percentage (25, 50, 75, 100)
 */
export function trackScrollDepth(percentage) {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', 'scroll', {
      percent_scrolled: percentage,
      page_path: window.location.pathname,
    });
  }
}

/**
 * Initialize scroll tracking
 * Sets up listeners for 25%, 50%, 75%, 100% scroll depths
 */
export function initScrollTracking() {
  if (typeof window === 'undefined') return;

  const scrollDepths = [25, 50, 75, 100];
  const triggered = new Set();

  const handleScroll = () => {
    const scrollPercent = (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100;

    scrollDepths.forEach(depth => {
      if (scrollPercent >= depth && !triggered.has(depth)) {
        triggered.add(depth);
        trackScrollDepth(depth);
      }
    });
  };

  window.addEventListener('scroll', handleScroll, { passive: true });

  // Cleanup function
  return () => {
    window.removeEventListener('scroll', handleScroll);
  };
}

/**
 * Track time on page
 * @param {string} pagePath - The page path
 * @returns {Function} Cleanup function to track actual time spent
 */
export function trackTimeOnPage(pagePath) {
  const startTime = Date.now();

  return () => {
    const timeSpent = Math.floor((Date.now() - startTime) / 1000); // in seconds

    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'time_on_page', {
        page_path: pagePath,
        time_seconds: timeSpent,
      });
    }
  };
}
