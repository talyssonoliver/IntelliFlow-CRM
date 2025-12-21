/**
 * Observability Example
 *
 * Demonstrates how to use the observability stack in IntelliFlow CRM API.
 *
 * This file is for documentation and testing purposes.
 * It shows best practices for integrating tracing, metrics, and error tracking.
 *
 * @see IFC-074: Full Stack Observability
 */

import { trace, SpanStatusCode } from '@opentelemetry/api';
import {
  startTracing,
  initializeSentry,
  captureException,
  getCorrelationId,
  logWithCorrelation,
  initializeRequestContext,
  runWithContext,
} from './index';

/**
 * Example 1: Initialize observability at application startup
 *
 * Call this BEFORE importing other modules to ensure instrumentation works.
 */
export function initializeObservability() {
  console.log('[Example] Initializing observability...');

  // Start OpenTelemetry tracing
  startTracing();

  // Initialize Sentry error tracking
  initializeSentry();

  console.log('[Example] Observability initialized successfully');
}

/**
 * Example 2: Manual tracing with OpenTelemetry
 *
 * Use this pattern for custom spans that aren't auto-instrumented.
 */
export async function manualTracingExample() {
  const tracer = trace.getTracer('intelliflow-api', '0.1.0');

  return tracer.startActiveSpan('example.operation', async (span) => {
    try {
      // Add custom attributes
      span.setAttribute('example.param', 'value');
      span.setAttribute('user.id', '12345');

      // Simulate work
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Mark success
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();

      return { success: true };
    } catch (error) {
      // Mark error
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      span.recordException(error as Error);
      span.end();

      throw error;
    }
  });
}

/**
 * Example 3: Using correlation IDs for request tracking
 *
 * This pattern ensures all logs for a request can be traced.
 */
export async function correlationIdExample(requestHeaders: Record<string, string>) {
  // Initialize request context
  const context = initializeRequestContext(requestHeaders, 'user-123');

  // Run code within context
  return runWithContext(context, async () => {
    // Correlation ID is now available everywhere
    const correlationId = getCorrelationId();

    // Enhanced logging with correlation ID
    logWithCorrelation('Processing request', { operation: 'example' });

    // Simulate async work
    await new Promise((resolve) => setTimeout(resolve, 50));

    logWithCorrelation('Request completed', { correlationId });

    return { correlationId };
  });
}

/**
 * Example 4: Error tracking with Sentry
 *
 * Use this pattern for capturing errors with context.
 */
export async function errorTrackingExample() {
  try {
    // Simulate an error
    throw new Error('Example error for demonstration');
  } catch (error) {
    // Capture to Sentry with context
    captureException(error as Error, {
      user: {
        id: 'user-123',
        email: 'test@example.com',
      },
      tags: {
        feature: 'observability-example',
        severity: 'low',
      },
      extra: {
        exampleData: 'Additional context',
        timestamp: new Date().toISOString(),
      },
    });

    // Log locally as well
    console.error('[Example] Error captured:', error);
  }
}

/**
 * Example 5: Nested spans for detailed tracing
 *
 * Create child spans to trace sub-operations.
 */
export async function nestedSpansExample() {
  const tracer = trace.getTracer('intelliflow-api', '0.1.0');

  return tracer.startActiveSpan('example.parent-operation', async (parentSpan) => {
    try {
      // First sub-operation
      await tracer.startActiveSpan('example.fetch-data', async (childSpan1) => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        childSpan1.setAttribute('data.source', 'database');
        childSpan1.end();
      });

      // Second sub-operation
      await tracer.startActiveSpan('example.process-data', async (childSpan2) => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        childSpan2.setAttribute('records.processed', 100);
        childSpan2.end();
      });

      parentSpan.setStatus({ code: SpanStatusCode.OK });
      parentSpan.end();

      return { success: true };
    } catch (error) {
      parentSpan.setStatus({ code: SpanStatusCode.ERROR });
      parentSpan.recordException(error as Error);
      parentSpan.end();
      throw error;
    }
  });
}

/**
 * Example 6: Logging with structured data
 *
 * Best practice for logs that will be aggregated in Loki.
 */
export function structuredLoggingExample() {
  // Use JSON format for structured logging
  const logEntry = {
    timestamp: new Date().toISOString(),
    level: 'info',
    correlationId: getCorrelationId() ?? 'no-context',
    message: 'User action performed',
    data: {
      action: 'create_lead',
      userId: 'user-123',
      leadId: 'lead-456',
    },
    metadata: {
      source: 'api',
      version: '0.1.0',
    },
  };

  console.log(JSON.stringify(logEntry));
}

/**
 * Example 7: Performance measurement
 *
 * Track custom performance metrics.
 */
export async function performanceExample() {
  const tracer = trace.getTracer('intelliflow-api', '0.1.0');

  return tracer.startActiveSpan('example.performance-test', async (span) => {
    const startTime = Date.now();

    try {
      // Simulate work
      await new Promise((resolve) => setTimeout(resolve, 100));

      const duration = Date.now() - startTime;

      // Add timing attribute
      span.setAttribute('duration.ms', duration);
      span.setAttribute('performance.target', 50);
      span.setAttribute('performance.met', duration <= 50);

      // Log performance
      if (duration > 50) {
        console.warn(`[Performance] Operation took ${duration}ms (target: 50ms)`);
      }

      span.setStatus({ code: SpanStatusCode.OK });
      span.end();

      return { duration };
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR });
      span.recordException(error as Error);
      span.end();
      throw error;
    }
  });
}

/**
 * Run all examples
 *
 * Use this to test the observability stack.
 */
export async function runAllExamples() {
  console.log('\n=== IntelliFlow Observability Examples ===\n');

  // Example 1: Initialize
  initializeObservability();

  // Wait for initialization
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Example 2: Manual tracing
  console.log('\n[Example 2] Manual tracing...');
  await manualTracingExample();

  // Example 3: Correlation IDs
  console.log('\n[Example 3] Correlation IDs...');
  await correlationIdExample({ 'x-request-id': 'req-123' });

  // Example 4: Error tracking
  console.log('\n[Example 4] Error tracking...');
  await errorTrackingExample();

  // Example 5: Nested spans
  console.log('\n[Example 5] Nested spans...');
  await nestedSpansExample();

  // Example 6: Structured logging
  console.log('\n[Example 6] Structured logging...');
  structuredLoggingExample();

  // Example 7: Performance measurement
  console.log('\n[Example 7] Performance measurement...');
  await performanceExample();

  console.log('\n=== Examples completed ===\n');
}

/**
 * Uncomment to run examples:
 *
 * if (require.main === module) {
 *   runAllExamples().catch(console.error);
 * }
 */
