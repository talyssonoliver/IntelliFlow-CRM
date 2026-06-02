/**
 * OpenTelemetry SDK Configuration
 *
 * Provides distributed tracing and metrics for IntelliFlow CRM API.
 *
 * Features:
 * - Automatic instrumentation of Node.js, HTTP, and database operations
 * - Correlation IDs for request tracking
 * - Console exporter for development
 * - OTLP exporter for production (Tempo/Grafana)
 * - Performance monitoring with metrics
 *
 * KPI: p95 tracing overhead < 5ms
 *
 * Environment Variables:
 * - OTEL_ENABLED: Enable/disable tracing (default: true)
 * - OTEL_SERVICE_NAME: Service name (default: intelliflow-api)
 * - OTEL_EXPORTER_OTLP_ENDPOINT: OTLP collector endpoint (default: http://localhost:4318)
 * - NODE_ENV: Environment (development/production)
 *
 * @see https://opentelemetry.io/docs/instrumentation/js/
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { installQueryBudgetOtelEmitter } from './query-budget-otel';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions/incubating';
import { requiredProdEnv } from '@intelliflow/validators/required-url';

/**
 * Configuration for OpenTelemetry
 */
interface OtelConfig {
  enabled: boolean;
  serviceName: string;
  serviceVersion: string;
  environment: string;
  otlpEndpoint: string;
  exportToConsole: boolean;
}

function envString(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  if (!trimmed) return fallback;
  return trimmed;
}

/**
 * Get OpenTelemetry configuration from environment
 */
function getOtelConfig(): OtelConfig {
  const environment = envString(process.env.NODE_ENV, 'development');

  return {
    enabled: process.env.OTEL_ENABLED !== 'false',
    serviceName: envString(process.env.OTEL_SERVICE_NAME, 'intelliflow-api'),
    serviceVersion: envString(process.env.npm_package_version, '0.1.0'),
    environment,
    otlpEndpoint: requiredProdEnv(
      'OTEL_EXPORTER_OTLP_ENDPOINT',
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
      'http://localhost:4318'
    ),
    exportToConsole: environment === 'development',
  };
}

/**
 * Initialize OpenTelemetry SDK
 *
 * Sets up:
 * - Resource attributes (service name, version, environment)
 * - Trace exporter (Console for dev, OTLP for production)
 * - Metric exporter (OTLP)
 * - Auto-instrumentation for common libraries
 *
 * @returns NodeSDK instance (call .start() to begin tracing)
 */
export function initializeOpenTelemetry(): NodeSDK | null {
  const config = getOtelConfig();

  // Skip initialization if disabled
  if (!config.enabled) {
    console.log('[OpenTelemetry] Tracing disabled (OTEL_ENABLED=false)');
    return null;
  }

  // In development without a custom OTLP endpoint, use console traces
  // and disable metrics to avoid ECONNREFUSED on localhost:4318
  if (config.environment === 'development' && !process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    process.env.OTEL_TRACES_EXPORTER = process.env.OTEL_TRACES_EXPORTER ?? 'console';
    process.env.OTEL_METRICS_EXPORTER = process.env.OTEL_METRICS_EXPORTER ?? 'none';
    process.env.OTEL_LOGS_EXPORTER = process.env.OTEL_LOGS_EXPORTER ?? 'none';
  }

  // Define service resource attributes
  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: config.serviceName,
    [ATTR_SERVICE_VERSION]: config.serviceVersion,
    [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: config.environment,
  });

  // Initialize SDK with auto-instrumentation
  // For Sprint 1, we use a simplified setup to avoid version conflicts
  const sdk = new NodeSDK({
    resource,
    instrumentations: [
      getNodeAutoInstrumentations({
        // Customize instrumentation
        '@opentelemetry/instrumentation-fs': {
          enabled: false, // Disable filesystem instrumentation (too noisy)
        },
        '@opentelemetry/instrumentation-http': {
          enabled: true,
        },
      }),
    ],
  });

  console.log(`[OpenTelemetry] Initialized tracing for ${config.serviceName}`);
  console.log(`[OpenTelemetry] Environment: ${config.environment}`);
  console.log(
    `[OpenTelemetry] Exporter: ${config.exportToConsole ? 'Console' : config.otlpEndpoint}`
  );

  return sdk;
}

/**
 * Shutdown OpenTelemetry SDK gracefully
 *
 * Call this on process termination to flush pending spans/metrics.
 */
export async function shutdownOpenTelemetry(sdk: NodeSDK | null): Promise<void> {
  if (!sdk) return;

  try {
    await sdk.shutdown();
    console.log('[OpenTelemetry] Shutdown complete');
  } catch (error) {
    console.error('[OpenTelemetry] Error during shutdown:', error);
  }
}

/**
 * Global SDK instance
 */
let sdkInstance: NodeSDK | null = null;

/**
 * Start OpenTelemetry tracing
 *
 * Call this early in the application lifecycle (before importing other modules).
 */
export function startTracing(): void {
  if (sdkInstance) {
    console.warn('[OpenTelemetry] Already initialized, skipping...');
    return;
  }

  sdkInstance = initializeOpenTelemetry();

  if (sdkInstance) {
    sdkInstance.start();
  }

  // ADR-053: forward query-budget over-budget events to OTel metrics so N+1 /
  // over-budget requests surface on dashboards, not just in span attributes and
  // the warn log. Idempotent and safe even when metric export is disabled.
  installQueryBudgetOtelEmitter();

  // Register shutdown handlers
  process.on('SIGTERM', async () => {
    await shutdownOpenTelemetry(sdkInstance);
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    await shutdownOpenTelemetry(sdkInstance);
    process.exit(0);
  });
}

/**
 * Get the current SDK instance
 */
export function getSDKInstance(): NodeSDK | null {
  return sdkInstance;
}
