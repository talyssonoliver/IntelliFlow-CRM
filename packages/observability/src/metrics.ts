/**
 * OpenTelemetry Metrics Utilities
 *
 * This module provides metrics collection using OpenTelemetry.
 * It enables monitoring of system performance, business KPIs, and operational health.
 *
 * Key Features:
 * - Counter, Gauge, Histogram metrics
 * - Automatic metric aggregation
 * - Custom business metrics
 * - Performance monitoring
 *
 * Usage:
 * ```typescript
 * import { initMetrics, metrics } from '@intelliflow/observability/metrics';
 *
 * // Initialize once at application startup
 * initMetrics({ serviceName: 'my-service' });
 *
 * // Record metrics
 * metrics.leadCreated.add(1, { source: 'website' });
 * metrics.apiLatency.record(duration, { endpoint: '/api/leads' });
 * ```
 */

import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import {
  Meter,
  Counter,
  Histogram,
  ObservableGauge,
  metrics as otelMetrics,
} from '@opentelemetry/api';

/**
 * Metrics configuration options
 */
export interface MetricsConfig {
  serviceName: string;
  serviceVersion?: string;
  environment?: string;
  endpoint?: string;
  enabled?: boolean;
  exportInterval?: number;
}

let meterProvider: MeterProvider | null = null;
let meter: Meter | null = null;

/**
 * Business metrics for IntelliFlow CRM
 */
export const metrics = {
  // Lead metrics
  leadCreated: null as Counter | null,
  leadScored: null as Counter | null,
  leadQualified: null as Counter | null,
  leadConverted: null as Counter | null,
  leadScore: null as Histogram | null,

  // Contact metrics
  contactCreated: null as Counter | null,
  contactUpdated: null as Counter | null,

  // Account metrics
  accountCreated: null as Counter | null,

  // Opportunity metrics
  opportunityCreated: null as Counter | null,
  opportunityWon: null as Counter | null,
  opportunityLost: null as Counter | null,
  opportunityValue: null as Histogram | null,

  // AI metrics
  aiInferenceCount: null as Counter | null,
  aiInferenceLatency: null as Histogram | null,
  aiInferenceCost: null as Histogram | null,
  aiConfidence: null as Histogram | null,

  // API metrics
  apiRequestCount: null as Counter | null,
  apiRequestDuration: null as Histogram | null,
  apiErrorCount: null as Counter | null,

  // Database metrics
  dbQueryCount: null as Counter | null,
  dbQueryDuration: null as Histogram | null,
  dbConnectionPoolSize: null as ObservableGauge | null,

  // Cache metrics
  cacheHitCount: null as Counter | null,
  cacheMissCount: null as Counter | null,

  // System metrics
  activeUsers: null as ObservableGauge | null,
  memoryUsage: null as ObservableGauge | null,
  cpuUsage: null as ObservableGauge | null,
};

/**
 * Initialize OpenTelemetry metrics
 *
 * This should be called once at application startup.
 * It sets up the meter provider and creates all metrics.
 *
 * @param config - Metrics configuration
 */
export function initMetrics(config: MetricsConfig): void {
  if (meterProvider) {
    console.warn('Metrics already initialized');
    return;
  }

  const enabled = config.enabled ?? process.env.NODE_ENV !== 'test';
  if (!enabled) {
    console.log('Metrics disabled');
    return;
  }

  const resource = new Resource({
    [ATTR_SERVICE_NAME]: config.serviceName,
    [ATTR_SERVICE_VERSION]: config.serviceVersion || process.env.SERVICE_VERSION || '0.1.0',
    'deployment.environment': config.environment || process.env.ENVIRONMENT || 'development',
    'service.namespace': 'intelliflow',
  });

  const metricExporter = new OTLPMetricExporter({
    url: config.endpoint || process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4317',
  });

  meterProvider = new MeterProvider({
    resource,
    readers: [
      new PeriodicExportingMetricReader({
        exporter: metricExporter,
        exportIntervalMillis: config.exportInterval || 60000, // 1 minute
      }),
    ],
  });

  otelMetrics.setGlobalMeterProvider(meterProvider);
  meter = meterProvider.getMeter(config.serviceName, config.serviceVersion);

  // Initialize all metrics
  createMetrics();

  console.log(`✅ OpenTelemetry metrics initialized for ${config.serviceName}`);

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    await shutdownMetrics();
  });
}

/**
 * Create all business metrics
 */
function createMetrics(): void {
  if (!meter) return;

  // Lead metrics
  metrics.leadCreated = meter.createCounter('intelliflow.lead.created', {
    description: 'Number of leads created',
    unit: '1',
  });

  metrics.leadScored = meter.createCounter('intelliflow.lead.scored', {
    description: 'Number of leads scored by AI',
    unit: '1',
  });

  metrics.leadQualified = meter.createCounter('intelliflow.lead.qualified', {
    description: 'Number of leads qualified',
    unit: '1',
  });

  metrics.leadConverted = meter.createCounter('intelliflow.lead.converted', {
    description: 'Number of leads converted to customers',
    unit: '1',
  });

  metrics.leadScore = meter.createHistogram('intelliflow.lead.score', {
    description: 'Distribution of lead scores',
    unit: '1',
  });

  // Contact metrics
  metrics.contactCreated = meter.createCounter('intelliflow.contact.created', {
    description: 'Number of contacts created',
    unit: '1',
  });

  metrics.contactUpdated = meter.createCounter('intelliflow.contact.updated', {
    description: 'Number of contacts updated',
    unit: '1',
  });

  // Account metrics
  metrics.accountCreated = meter.createCounter('intelliflow.account.created', {
    description: 'Number of accounts created',
    unit: '1',
  });

  // Opportunity metrics
  metrics.opportunityCreated = meter.createCounter('intelliflow.opportunity.created', {
    description: 'Number of opportunities created',
    unit: '1',
  });

  metrics.opportunityWon = meter.createCounter('intelliflow.opportunity.won', {
    description: 'Number of opportunities won',
    unit: '1',
  });

  metrics.opportunityLost = meter.createCounter('intelliflow.opportunity.lost', {
    description: 'Number of opportunities lost',
    unit: '1',
  });

  metrics.opportunityValue = meter.createHistogram('intelliflow.opportunity.value', {
    description: 'Distribution of opportunity values',
    unit: 'USD',
  });

  // AI metrics
  metrics.aiInferenceCount = meter.createCounter('intelliflow.ai.inference.count', {
    description: 'Number of AI model inferences',
    unit: '1',
  });

  metrics.aiInferenceLatency = meter.createHistogram('intelliflow.ai.inference.latency', {
    description: 'AI inference latency',
    unit: 'ms',
  });

  metrics.aiInferenceCost = meter.createHistogram('intelliflow.ai.inference.cost', {
    description: 'Cost of AI inference',
    unit: 'USD',
  });

  metrics.aiConfidence = meter.createHistogram('intelliflow.ai.confidence', {
    description: 'AI model confidence scores',
    unit: '1',
  });

  // API metrics
  metrics.apiRequestCount = meter.createCounter('intelliflow.api.request.count', {
    description: 'Number of API requests',
    unit: '1',
  });

  metrics.apiRequestDuration = meter.createHistogram('intelliflow.api.request.duration', {
    description: 'API request duration',
    unit: 'ms',
  });

  metrics.apiErrorCount = meter.createCounter('intelliflow.api.error.count', {
    description: 'Number of API errors',
    unit: '1',
  });

  // Database metrics
  metrics.dbQueryCount = meter.createCounter('intelliflow.db.query.count', {
    description: 'Number of database queries',
    unit: '1',
  });

  metrics.dbQueryDuration = meter.createHistogram('intelliflow.db.query.duration', {
    description: 'Database query duration',
    unit: 'ms',
  });

  metrics.dbConnectionPoolSize = meter.createObservableGauge(
    'intelliflow.db.connection.pool.size',
    {
      description: 'Database connection pool size',
      unit: '1',
    }
  );

  // Cache metrics
  metrics.cacheHitCount = meter.createCounter('intelliflow.cache.hit', {
    description: 'Number of cache hits',
    unit: '1',
  });

  metrics.cacheMissCount = meter.createCounter('intelliflow.cache.miss', {
    description: 'Number of cache misses',
    unit: '1',
  });

  // System metrics
  metrics.activeUsers = meter.createObservableGauge('intelliflow.users.active', {
    description: 'Number of active users',
    unit: '1',
  });

  metrics.memoryUsage = meter.createObservableGauge('intelliflow.system.memory.usage', {
    description: 'Memory usage in bytes',
    unit: 'bytes',
  });

  metrics.cpuUsage = meter.createObservableGauge('intelliflow.system.cpu.usage', {
    description: 'CPU usage percentage',
    unit: '%',
  });
}

/**
 * Shutdown metrics and flush pending data
 */
export async function shutdownMetrics(): Promise<void> {
  if (meterProvider) {
    await meterProvider.shutdown();
    meterProvider = null;
    meter = null;
    console.log('✅ OpenTelemetry metrics shut down');
  }
}

/**
 * Get the current meter instance
 */
export function getMeter(): Meter {
  if (!meter) {
    throw new Error('Metrics not initialized. Call initMetrics() first.');
  }
  return meter;
}

/**
 * Helper to increment a counter with common attributes
 */
export function incrementCounter(
  counter: Counter | null,
  value: number = 1,
  attributes?: Record<string, string | number>
): void {
  if (counter) {
    counter.add(value, attributes);
  }
}

/**
 * Helper to record a histogram value
 */
export function recordHistogram(
  histogram: Histogram | null,
  value: number,
  attributes?: Record<string, string | number>
): void {
  if (histogram) {
    histogram.record(value, attributes);
  }
}

/**
 * Measure execution time and record as histogram
 */
export async function measureTime<T>(
  histogram: Histogram | null,
  fn: () => Promise<T> | T,
  attributes?: Record<string, string | number>
): Promise<T> {
  const startTime = Date.now();
  try {
    return await fn();
  } finally {
    const duration = Date.now() - startTime;
    recordHistogram(histogram, duration, attributes);
  }
}

/**
 * Decorator for measuring method execution time
 *
 * @example
 * ```typescript
 * class LeadService {
 *   @MeasureTime(metrics.apiRequestDuration)
 *   async processLead(leadId: string) {
 *     // Method implementation
 *   }
 * }
 * ```
 */
export function MeasureTime(histogram: Histogram | null, attributes?: Record<string, string>) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      return measureTime(histogram, () => originalMethod.apply(this, args), {
        ...attributes,
        method: propertyKey,
        class: target.constructor.name,
      });
    };

    return descriptor;
  };
}

/**
 * Common metric attributes
 */
export const MetricAttributes = {
  // Source attributes
  SOURCE_WEBSITE: { source: 'website' },
  SOURCE_REFERRAL: { source: 'referral' },
  SOURCE_SOCIAL: { source: 'social' },
  SOURCE_EMAIL: { source: 'email' },

  // Status attributes
  STATUS_SUCCESS: { status: 'success' },
  STATUS_ERROR: { status: 'error' },
  STATUS_TIMEOUT: { status: 'timeout' },

  // AI model attributes
  MODEL_GPT4: { model: 'gpt-4' },
  MODEL_GPT35: { model: 'gpt-3.5-turbo' },
  MODEL_OLLAMA: { model: 'ollama' },

  // HTTP method attributes
  METHOD_GET: { method: 'GET' },
  METHOD_POST: { method: 'POST' },
  METHOD_PUT: { method: 'PUT' },
  METHOD_DELETE: { method: 'DELETE' },
};

/**
 * Pre-configured metric helpers for common operations
 */
export const metricHelpers = {
  /**
   * Record a lead creation
   */
  recordLeadCreated: (source: string) => {
    incrementCounter(metrics.leadCreated, 1, { source });
  },

  /**
   * Record a lead score
   */
  recordLeadScored: (score: number, confidence: number, modelVersion: string) => {
    incrementCounter(metrics.leadScored, 1, { model_version: modelVersion });
    recordHistogram(metrics.leadScore, score, { model_version: modelVersion });
    recordHistogram(metrics.aiConfidence, confidence, { model_version: modelVersion });
  },

  /**
   * Record an API request
   */
  recordApiRequest: (method: string, endpoint: string, duration: number, statusCode: number) => {
    incrementCounter(metrics.apiRequestCount, 1, { method, endpoint, status: String(statusCode) });
    recordHistogram(metrics.apiRequestDuration, duration, { method, endpoint });

    if (statusCode >= 400) {
      incrementCounter(metrics.apiErrorCount, 1, { method, endpoint, status: String(statusCode) });
    }
  },

  /**
   * Record a database query
   */
  recordDatabaseQuery: (operation: string, table: string, duration: number) => {
    incrementCounter(metrics.dbQueryCount, 1, { operation, table });
    recordHistogram(metrics.dbQueryDuration, duration, { operation, table });
  },

  /**
   * Record cache hit/miss
   */
  recordCacheAccess: (hit: boolean, key?: string) => {
    if (hit) {
      incrementCounter(metrics.cacheHitCount, 1, key ? { key } : undefined);
    } else {
      incrementCounter(metrics.cacheMissCount, 1, key ? { key } : undefined);
    }
  },

  /**
   * Record AI inference
   */
  recordAiInference: (model: string, latency: number, cost: number, confidence?: number) => {
    incrementCounter(metrics.aiInferenceCount, 1, { model });
    recordHistogram(metrics.aiInferenceLatency, latency, { model });
    recordHistogram(metrics.aiInferenceCost, cost, { model });
    if (confidence !== undefined) {
      recordHistogram(metrics.aiConfidence, confidence, { model });
    }
  },
};
