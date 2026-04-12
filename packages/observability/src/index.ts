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

// Internal imports for initObservability function
import { initTracing as _initTracing, shutdownTracing as _shutdownTracing } from './tracing';
import { initMetrics as _initMetrics, shutdownMetrics as _shutdownMetrics } from './metrics';
import { initLogger as _initLogger } from './logging';

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
  _initLogger({
    name: serviceName,
    level: logLevel,
  });

  // Initialize tracing
  if (tracingEnabled) {
    _initTracing({
      serviceName,
      serviceVersion,
      environment,
      enabled: tracingEnabled,
    });
  }

  // Initialize metrics
  if (metricsEnabled) {
    _initMetrics({
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
  await Promise.all([_shutdownTracing(), _shutdownMetrics()]);

  console.log('✅ Observability shut down');
}
