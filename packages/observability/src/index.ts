/**
 * IntelliFlow CRM Observability Package
 *
 * This package provides comprehensive observability for the IntelliFlow CRM system:
 * - Distributed tracing with OpenTelemetry
 * - Metrics collection and aggregation
 * - Structured logging with correlation IDs
 *
 * @packageDocumentation
 */

// Export tracing utilities
export {
  initTracing,
  shutdownTracing,
  getTracer,
  trace,
  createSpan,
  addEvent,
  addAttributes,
  recordException,
  getTraceId,
  getSpanId,
  Trace,
  traceContext,
  SpanKinds,
  SemanticAttributes,
  type TracingConfig,
} from './tracing';

// Export metrics utilities
export {
  initMetrics,
  shutdownMetrics,
  getMeter,
  metrics,
  incrementCounter,
  recordHistogram,
  measureTime,
  MeasureTime,
  MetricAttributes,
  metricHelpers,
  type MetricsConfig,
} from './metrics';

// Export logging utilities
export {
  createLogger,
  initLogger,
  getLogger,
  createChildLogger,
  createRequestLogger,
  logger,
  logDomainEvent,
  logApiRequest,
  logDatabaseQuery,
  logAiOperation,
  logCacheOperation,
  logSecurityEvent,
  logBusinessMetric,
  LogPerformance,
  redactSensitiveData,
  LogLevel,
  LogContexts,
  type LoggerConfig,
  type LogContext,
  type Logger,
} from './logging';

/**
 * Initialize all observability systems
 *
 * This is a convenience function to initialize tracing, metrics, and logging
 * with a single call. Use this at application startup.
 *
 * @param config - Observability configuration
 *
 * @example
 * ```typescript
 * import { initObservability } from '@intelliflow/observability';
 *
 * initObservability({
 *   serviceName: 'intelliflow-api',
 *   serviceVersion: '1.0.0',
 *   environment: 'production',
 * });
 * ```
 */
export function initObservability(config: {
  serviceName: string;
  serviceVersion?: string;
  environment?: string;
  tracingEnabled?: boolean;
  metricsEnabled?: boolean;
  logLevel?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
}): void {
  const {
    serviceName,
    serviceVersion,
    environment,
    tracingEnabled = true,
    metricsEnabled = true,
    logLevel = 'info',
  } = config;

  // Initialize logging first (so other systems can log)
  const { initLogger } = require('./logging');
  initLogger({
    name: serviceName,
    level: logLevel,
  });

  // Initialize tracing
  if (tracingEnabled) {
    const { initTracing } = require('./tracing');
    initTracing({
      serviceName,
      serviceVersion,
      environment,
      enabled: tracingEnabled,
    });
  }

  // Initialize metrics
  if (metricsEnabled) {
    const { initMetrics } = require('./metrics');
    initMetrics({
      serviceName,
      serviceVersion,
      environment,
      enabled: metricsEnabled,
    });
  }

  console.log(`✅ Observability initialized for ${serviceName}`);
}

/**
 * Shutdown all observability systems
 *
 * Call this on application shutdown to ensure all telemetry is flushed.
 */
export async function shutdownObservability(): Promise<void> {
  const { shutdownTracing } = require('./tracing');
  const { shutdownMetrics } = require('./metrics');

  await Promise.all([shutdownTracing(), shutdownMetrics()]);

  console.log('✅ Observability shut down');
}
