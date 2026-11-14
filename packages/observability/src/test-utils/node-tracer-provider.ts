/**
 * Test-only stand-in for the 2.x `NodeTracerProvider` (IFC-319).
 *
 * OpenTelemetry JS SDK 3.x merged sdk-trace-base and sdk-trace-node into
 * `@opentelemetry/sdk-trace`, whose single `TracerProvider` has no `register()`.
 * In production `NodeSDK.start()` does the registering; tests that build a
 * provider by hand use this class to get what `register()` used to set up:
 * the global tracer provider, the AsyncLocalStorage context manager (so active
 * spans follow `await`) and the W3C trace-context + baggage propagators.
 */
import { context, propagation, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
  CompositePropagator,
  W3CBaggagePropagator,
  W3CTraceContextPropagator,
} from '@opentelemetry/core';
import { TracerProvider } from '@opentelemetry/sdk-trace';

export class NodeTracerProvider extends TracerProvider {
  register(): void {
    trace.setGlobalTracerProvider(this);
    context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
    propagation.setGlobalPropagator(
      new CompositePropagator({
        propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()],
      })
    );
  }
}
