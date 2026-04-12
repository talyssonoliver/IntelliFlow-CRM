/**
 * OpenTelemetry Tracer - Convenience Export
 *
 * This file provides a direct export of the tracing utilities.
 * It's an alias to tracing.ts for convenience and backwards compatibility.
 *
 * Usage:
 * ```typescript
 * import { initTracing, trace } from '@intelliflow/observability/tracer';
 * ```
 */

// Re-export everything from tracing.ts
export * from './tracing';
