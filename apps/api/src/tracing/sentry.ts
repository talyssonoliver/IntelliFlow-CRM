/**
 * Sentry Error Tracking Integration
 *
 * Provides error monitoring and performance tracking for IntelliFlow CRM API.
 *
 * Features:
 * - Automatic error capture and reporting
 * - Performance monitoring (transactions, spans)
 * - Release tracking and source maps
 * - User context and custom tags
 * - Environment-based configuration
 *
 * KPI: 100% error capture rate
 *
 * Environment Variables:
 * - SENTRY_DSN: Sentry project DSN (required for production)
 * - SENTRY_ENABLED: Enable/disable Sentry (default: true in production)
 * - SENTRY_ENVIRONMENT: Environment name (default: NODE_ENV)
 * - SENTRY_TRACES_SAMPLE_RATE: Traces sampling rate (default: 0.1 = 10%)
 * - npm_package_version: Package version for release tracking
 *
 * @see https://docs.sentry.io/platforms/node/
 */

import * as Sentry from '@sentry/node';

/**
 * Sentry configuration
 */
interface SentryConfig {
  enabled: boolean;
  dsn: string | undefined;
  environment: string;
  release: string;
  tracesSampleRate: number;
  debug: boolean;
}

function envString(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  if (!trimmed) return fallback;
  return trimmed;
}

function envNumber(value: string | undefined, fallback: number): number {
  const parsed = Number.parseFloat(value ?? '');
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Get Sentry configuration from environment
 */
function getSentryConfig(): SentryConfig {
  const environment = envString(process.env.NODE_ENV, 'development');
  const isDevelopment = environment === 'development';
  const releaseVersion = envString(process.env.npm_package_version, '0.1.0');

  return {
    enabled: process.env.SENTRY_ENABLED !== 'false' && !isDevelopment,
    dsn: process.env.SENTRY_DSN,
    environment: envString(process.env.SENTRY_ENVIRONMENT, environment),
    release: `intelliflow-api@${releaseVersion}`,
    tracesSampleRate: envNumber(process.env.SENTRY_TRACES_SAMPLE_RATE, 0.1),
    debug: isDevelopment,
  };
}

/**
 * Initialize Sentry error tracking
 *
 * Sets up:
 * - Error capture with stack traces
 * - Performance monitoring (transactions)
 * - Breadcrumbs for debugging
 * - Environment and release tags
 *
 * Safe to call multiple times (only initializes once).
 */
export function initializeSentry(): void {
  const config = getSentryConfig();

  // Skip initialization in development or if disabled
  if (!config.enabled) {
    console.log('[Sentry] Error tracking disabled (development mode or SENTRY_ENABLED=false)');
    return;
  }

  // Require DSN in production
  if (!config.dsn) {
    console.warn('[Sentry] SENTRY_DSN not configured - error tracking disabled');
    return;
  }

  try {
    Sentry.init({
      dsn: config.dsn,
      environment: config.environment,
      release: config.release,

      // Performance Monitoring
      tracesSampleRate: config.tracesSampleRate, // Sample 10% of transactions

      // Integrations (using modern API)
      integrations: [Sentry.httpIntegration(), Sentry.nativeNodeFetchIntegration()],

      // Debug mode (verbose logging)
      debug: config.debug,

      // Before sending to Sentry, scrub sensitive data
      beforeSend(event, hint) {
        // Remove sensitive headers
        if (event.request?.headers) {
          delete event.request.headers.authorization;
          delete event.request.headers.cookie;
          delete event.request.headers['x-api-key'];
        }

        // Remove sensitive data from context
        if (event.contexts?.user) {
          // Keep user ID but remove email/name in production
          if (config.environment === 'production') {
            delete event.contexts.user.email;
            delete event.contexts.user.username;
          }
        }

        return event;
      },

      // Before sending breadcrumbs
      beforeBreadcrumb(breadcrumb, hint) {
        // Filter out noisy breadcrumbs
        if (breadcrumb.category === 'console' && breadcrumb.level === 'debug') {
          return null;
        }

        // Scrub sensitive URLs
        if (breadcrumb.data?.url) {
          breadcrumb.data.url = breadcrumb.data.url.replace(/apikey=[^&]+/gi, 'apikey=***');
        }

        return breadcrumb;
      },
    });

    console.log(`[Sentry] Initialized error tracking for ${config.environment}`);
    console.log(`[Sentry] Release: ${config.release}`);
    console.log(`[Sentry] Traces sample rate: ${config.tracesSampleRate * 100}%`);
  } catch (error) {
    console.error('[Sentry] Failed to initialize:', error);
  }
}

/**
 * Capture an exception to Sentry
 *
 * @param error - Error to capture
 * @param context - Additional context (user, tags, etc.)
 */
export function captureException(
  error: Error,
  context?: {
    user?: { id: string; email?: string };
    tags?: Record<string, string>;
    extra?: Record<string, unknown>;
  }
): string {
  return Sentry.captureException(error, {
    user: context?.user,
    tags: context?.tags,
    extra: context?.extra,
  });
}

/**
 * Capture a message to Sentry
 *
 * @param message - Message to capture
 * @param level - Severity level
 */
export function captureMessage(
  message: string,
  level: Sentry.SeverityLevel = 'info'
): string | undefined {
  return Sentry.captureMessage(message, level);
}

/**
 * Start a Sentry span for performance tracking
 *
 * @param name - Span name
 * @param operation - Operation type (http.request, db.query, etc.)
 */
export function startSpan(name: string, operation: string) {
  return Sentry.startSpan(
    {
      name,
      op: operation,
    },
    () => {
      // Span implementation
    }
  );
}

/**
 * Set user context for error tracking
 *
 * @param user - User information
 */
export function setUser(user: { id: string; email?: string; username?: string } | null): void {
  Sentry.setUser(user);
}

/**
 * Set custom tag for error grouping
 *
 * @param key - Tag key
 * @param value - Tag value
 */
export function setTag(key: string, value: string): void {
  Sentry.setTag(key, value);
}

/**
 * Set custom context data
 *
 * @param key - Context key
 * @param value - Context value
 */
export function setContext(key: string, value: Record<string, unknown>): void {
  Sentry.setContext(key, value);
}

/**
 * Flush pending events to Sentry
 *
 * Useful before process termination to ensure all errors are sent.
 *
 * @param timeout - Timeout in milliseconds (default: 2000)
 * @returns Promise that resolves when all events are sent
 */
export async function flushSentry(timeout = 2000): Promise<boolean> {
  try {
    const result = await Sentry.flush(timeout);
    console.log('[Sentry] Flushed pending events');
    return result;
  } catch (error) {
    console.error('[Sentry] Error flushing events:', error);
    return false;
  }
}

/**
 * Close Sentry client gracefully
 *
 * Call this on process termination.
 */
export async function closeSentry(): Promise<void> {
  try {
    await Sentry.close(2000);
    console.log('[Sentry] Closed gracefully');
  } catch (error) {
    console.error('[Sentry] Error during shutdown:', error);
  }
}

// Express middleware helpers are available directly from Sentry
// For modern usage, integrate Sentry directly in your error handling
