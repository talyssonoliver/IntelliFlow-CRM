/**
 * OpenTelemetry Tracing Utilities
 *
 * This module provides distributed tracing capabilities using OpenTelemetry.
 * It enables end-to-end request tracking across microservices and AI workflows.
 *
 * Key Features:
 * - Automatic instrumentation for Node.js
 * - Manual span creation and annotation
 * - Trace context propagation
 * - Error tracking and status codes
 * - Custom attributes and events
 *
 * Usage:
 * ```typescript
 * import { initTracing, trace } from '@intelliflow/observability/tracing';
 *
 * // Initialize once at application startup
 * initTracing({ serviceName: 'my-service' });
 *
 * // Create spans
 * await trace('operation-name', async (span) => {
 *   span.setAttribute('user.id', userId);
 *   // Your code here
 * });
 * ```
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import {
  Span,
  SpanStatusCode,
  trace as otelTrace,
  context,
  SpanKind,
  Tracer,
} from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';

/**
 * Tracing configuration options
 */
export interface TracingConfig {
  serviceName: string;
  serviceVersion?: string;
  environment?: string;
  endpoint?: string;
  enabled?: boolean;
  sampleRate?: number;
}

let sdk: NodeSDK | null = null;
let tracer: Tracer | null = null;

/**
 * Initialize OpenTelemetry tracing
 *
 * This should be called once at application startup, before any other code.
 * It sets up automatic instrumentation and exports traces to the collector.
 *
 * @param config - Tracing configuration
 */
export function initTracing(config: TracingConfig): void {
  if (sdk) {
    console.warn('Tracing already initialized');
    return;
  }

  const enabled = config.enabled ?? process.env.NODE_ENV !== 'test';
  if (!enabled) {
    console.log('Tracing disabled');
    return;
  }

  const resource = new Resource({
    [ATTR_SERVICE_NAME]: config.serviceName,
    [ATTR_SERVICE_VERSION]: config.serviceVersion || process.env.SERVICE_VERSION || '0.1.0',
    'deployment.environment': config.environment || process.env.ENVIRONMENT || 'development',
    'service.namespace': 'intelliflow',
  });

  const traceExporter = new OTLPTraceExporter({
    url: config.endpoint || process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4317',
  });

  sdk = new NodeSDK({
    resource,
    traceExporter,
    spanProcessor: new BatchSpanProcessor(traceExporter),
    instrumentations: [
      getNodeAutoInstrumentations({
        // Automatic instrumentation configuration
        '@opentelemetry/instrumentation-fs': {
          enabled: false, // Too noisy
        },
        '@opentelemetry/instrumentation-http': {
          ignoreIncomingRequestHook: (req) => {
            // Ignore health checks
            return req.url?.includes('/health') || req.url?.includes('/metrics');
          },
        },
        '@opentelemetry/instrumentation-express': {
          enabled: true,
        },
        '@opentelemetry/instrumentation-pg': {
          enabled: true,
        },
        '@opentelemetry/instrumentation-redis': {
          enabled: true,
        },
      }),
    ],
  });

  sdk.start();
  tracer = otelTrace.getTracer(config.serviceName, config.serviceVersion);

  console.log(`✅ OpenTelemetry tracing initialized for ${config.serviceName}`);

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    await shutdownTracing();
  });
}

/**
 * Shutdown tracing and flush pending spans
 */
export async function shutdownTracing(): Promise<void> {
  if (sdk) {
    await sdk.shutdown();
    sdk = null;
    tracer = null;
    console.log('✅ OpenTelemetry tracing shut down');
  }
}

/**
 * Get the current tracer instance
 */
export function getTracer(): Tracer {
  if (!tracer) {
    throw new Error('Tracing not initialized. Call initTracing() first.');
  }
  return tracer;
}

/**
 * Execute a function within a traced span
 *
 * This is the primary API for creating manual spans. The span is automatically
 * ended when the function completes, and errors are recorded.
 *
 * @param name - Span name (operation description)
 * @param fn - Function to execute within the span
 * @param options - Span options
 * @returns Result of the function
 *
 * @example
 * ```typescript
 * const result = await trace('processLead', async (span) => {
 *   span.setAttribute('lead.id', leadId);
 *   span.setAttribute('lead.score', score);
 *   return await processLead(leadId);
 * });
 * ```
 */
export async function trace<T>(
  name: string,
  fn: (span: Span) => Promise<T> | T,
  options?: {
    kind?: SpanKind;
    attributes?: Record<string, string | number | boolean>;
  }
): Promise<T> {
  const currentTracer = getTracer();

  return currentTracer.startActiveSpan(
    name,
    {
      kind: options?.kind || SpanKind.INTERNAL,
      attributes: options?.attributes,
    },
    async (span) => {
      try {
        const result = await fn(span);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
        span.recordException(error instanceof Error ? error : new Error(String(error)));
        throw error;
      } finally {
        span.end();
      }
    }
  );
}

/**
 * Create a child span from the current context
 *
 * Use this when you need more control over span lifecycle.
 * Remember to call span.end() when done.
 *
 * @param name - Span name
 * @param options - Span options
 * @returns Span instance
 */
export function createSpan(
  name: string,
  options?: {
    kind?: SpanKind;
    attributes?: Record<string, string | number | boolean>;
  }
): Span {
  const currentTracer = getTracer();
  return currentTracer.startSpan(name, {
    kind: options?.kind || SpanKind.INTERNAL,
    attributes: options?.attributes,
  });
}

/**
 * Add an event to the current span
 *
 * Events are timestamped annotations on a span, useful for marking
 * significant points in the execution (e.g., "email sent", "cache hit").
 *
 * @param name - Event name
 * @param attributes - Event attributes
 */
export function addEvent(name: string, attributes?: Record<string, string | number | boolean>): void {
  const span = otelTrace.getActiveSpan();
  if (span) {
    span.addEvent(name, attributes);
  }
}

/**
 * Add attributes to the current span
 *
 * Use this to enrich the current span with metadata.
 *
 * @param attributes - Attributes to add
 */
export function addAttributes(attributes: Record<string, string | number | boolean>): void {
  const span = otelTrace.getActiveSpan();
  if (span) {
    span.setAttributes(attributes);
  }
}

/**
 * Record an exception in the current span
 *
 * This marks the span as errored and records exception details.
 *
 * @param error - Error to record
 */
export function recordException(error: Error): void {
  const span = otelTrace.getActiveSpan();
  if (span) {
    span.recordException(error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });
  }
}

/**
 * Get the current trace ID
 *
 * Useful for correlation with logs and other telemetry.
 *
 * @returns Trace ID or undefined if no active span
 */
export function getTraceId(): string | undefined {
  const span = otelTrace.getActiveSpan();
  return span?.spanContext().traceId;
}

/**
 * Get the current span ID
 *
 * @returns Span ID or undefined if no active span
 */
export function getSpanId(): string | undefined {
  const span = otelTrace.getActiveSpan();
  return span?.spanContext().spanId;
}

/**
 * Decorator for tracing class methods
 *
 * @example
 * ```typescript
 * class LeadService {
 *   @Trace('LeadService.processLead')
 *   async processLead(leadId: string) {
 *     // Method implementation
 *   }
 * }
 * ```
 */
export function Trace(spanName?: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor {
    const originalMethod = descriptor.value;
    const name = spanName || `${target.constructor.name}.${propertyKey}`;

    descriptor.value = async function (...args: any[]) {
      return trace(name, async (span) => {
        span.setAttribute('method', propertyKey);
        span.setAttribute('class', target.constructor.name);
        return originalMethod.apply(this, args);
      });
    };

    return descriptor;
  };
}

/**
 * Trace context utilities
 */
export const traceContext = {
  /**
   * Run a function with a specific trace context
   */
  with: <T>(span: Span, fn: () => T): T => {
    return context.with(otelTrace.setSpan(context.active(), span), fn);
  },

  /**
   * Get the current active context
   */
  active: () => context.active(),

  /**
   * Extract trace context from carrier (e.g., HTTP headers)
   */
  extract: (carrier: any) => {
    // Implement W3C Trace Context extraction if needed
    return context.active();
  },

  /**
   * Inject trace context into carrier (e.g., HTTP headers)
   */
  inject: (carrier: any) => {
    // Implement W3C Trace Context injection if needed
  },
};

/**
 * Pre-defined span kinds for common operations
 */
export const SpanKinds = {
  SERVER: SpanKind.SERVER,
  CLIENT: SpanKind.CLIENT,
  PRODUCER: SpanKind.PRODUCER,
  CONSUMER: SpanKind.CONSUMER,
  INTERNAL: SpanKind.INTERNAL,
};

/**
 * Common semantic conventions for attributes
 */
export const SemanticAttributes = {
  // User attributes
  USER_ID: 'user.id',
  USER_EMAIL: 'user.email',
  USER_ROLE: 'user.role',

  // CRM attributes
  LEAD_ID: 'lead.id',
  LEAD_SCORE: 'lead.score',
  CONTACT_ID: 'contact.id',
  ACCOUNT_ID: 'account.id',
  OPPORTUNITY_ID: 'opportunity.id',

  // AI attributes
  AI_MODEL: 'ai.model',
  AI_MODEL_VERSION: 'ai.model.version',
  AI_CONFIDENCE: 'ai.confidence',
  AI_COST: 'ai.cost',
  AI_LATENCY: 'ai.latency',

  // Database attributes
  DB_OPERATION: 'db.operation',
  DB_TABLE: 'db.table',
  DB_QUERY_TIME: 'db.query.time',

  // HTTP attributes
  HTTP_METHOD: 'http.method',
  HTTP_URL: 'http.url',
  HTTP_STATUS_CODE: 'http.status_code',
};
