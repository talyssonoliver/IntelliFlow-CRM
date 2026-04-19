/**
 * OpenTelemetry SDK Configuration — Next.js Web Frontend (server-side only)
 *
 * Invoked from apps/web/src/instrumentation.ts on the nodejs runtime.
 * Client-side instrumentation is explicitly out of scope for sprint 18.
 *
 * Environment Variables:
 * - OTEL_ENABLED: Enable/disable tracing (default: true)
 * - OTEL_SERVICE_NAME: Service name (default: intelliflow-web)
 * - OTEL_EXPORTER_OTLP_ENDPOINT: OTLP collector endpoint (default: http://localhost:4318)
 * - NODE_ENV: Environment (development/production)
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions/incubating';

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

function getOtelConfig(): OtelConfig {
  const environment = envString(process.env.NODE_ENV, 'development');
  return {
    enabled: process.env.OTEL_ENABLED !== 'false',
    serviceName: envString(process.env.OTEL_SERVICE_NAME, 'intelliflow-web'),
    serviceVersion: envString(process.env.npm_package_version, '0.1.0'),
    environment,
    otlpEndpoint: envString(process.env.OTEL_EXPORTER_OTLP_ENDPOINT, 'http://localhost:4318'),
    exportToConsole: environment === 'development',
  };
}

export function initializeOpenTelemetry(): NodeSDK | null {
  const config = getOtelConfig();

  if (!config.enabled) {
    console.log('[OpenTelemetry] Tracing disabled (OTEL_ENABLED=false)');
    return null;
  }

  // Avoid ECONNREFUSED noise when collector is not running locally in dev.
  if (config.environment === 'development' && !process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    process.env.OTEL_TRACES_EXPORTER = process.env.OTEL_TRACES_EXPORTER ?? 'console';
    process.env.OTEL_METRICS_EXPORTER = process.env.OTEL_METRICS_EXPORTER ?? 'none';
    process.env.OTEL_LOGS_EXPORTER = process.env.OTEL_LOGS_EXPORTER ?? 'none';
  }

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: config.serviceName,
    [ATTR_SERVICE_VERSION]: config.serviceVersion,
    [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: config.environment,
  });

  const sdk = new NodeSDK({
    resource,
    instrumentations: [
      getNodeAutoInstrumentations({
        // Disable FS instrumentation — noisy; browser/client-side plugins excluded
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-http': { enabled: true },
      }),
    ],
  });

  console.log(`[OpenTelemetry] Initialized tracing for ${config.serviceName}`);
  console.log(`[OpenTelemetry] Environment: ${config.environment}`);

  return sdk;
}

export async function shutdownOpenTelemetry(sdk: NodeSDK | null): Promise<void> {
  if (!sdk) return;
  try {
    await sdk.shutdown();
    console.log('[OpenTelemetry] Shutdown complete');
  } catch (error) {
    console.error('[OpenTelemetry] Error during shutdown:', error);
  }
}

let sdkInstance: NodeSDK | null = null;

export function startTracing(): void {
  if (sdkInstance) {
    console.warn('[OpenTelemetry] Already initialized, skipping...');
    return;
  }

  sdkInstance = initializeOpenTelemetry();

  if (sdkInstance) {
    sdkInstance.start();
  }
}

export function getSDKInstance(): NodeSDK | null {
  return sdkInstance;
}
