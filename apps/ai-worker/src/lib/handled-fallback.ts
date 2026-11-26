/**
 * Handled fallbacks: a failure the caller already has a working answer for.
 *
 * Semantic search embeds the query and, when that fails, falls back to full-text search. The
 * failed embed call used to end its `llm.embed` span in ERROR and log at error level, so each
 * embedding outage fired the "Error spans in ai-worker or api" and "Error-level logs" Grafana
 * alerts even though every search still returned results (25/11/2026: the embedding model's end
 * of life made every call answer HTTP 410, 40 error spans and a flood of alert emails).
 *
 * A caller that handles the failure runs the call inside `runWithHandledFallback`. The tracing
 * wrapper and the embedding chain read `handledFallback()`: they keep the evidence (a span event
 * and attribute, a warn log, a counter) but do not mark the span ERROR or log at error level.
 * An unhandled failure, or a fallback that itself fails, is still an error.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { metrics, type Counter } from '@opentelemetry/api';

/** Closed set, so a fallback name can never become a high-cardinality metric label. */
export type HandledFallbackName = 'embedding_to_fts';

interface HandledFallbackScope {
  name: HandledFallbackName;
}

const scopeStore = new AsyncLocalStorage<HandledFallbackScope>();

let counter: Counter | null = null;

function fallbackCounter(): Counter {
  counter ??= metrics
    .getMeter('intelliflow-ai-worker')
    .createCounter('intelliflow.ai.fallback.handled', {
      description: 'Failures a caller recovered from with a fallback (not errors)',
    });
  return counter;
}

/** Runs `fn` as a call whose failure the caller handles by falling back. */
export function runWithHandledFallback<T>(
  name: HandledFallbackName,
  fn: () => Promise<T>
): Promise<T> {
  return scopeStore.run({ name }, fn);
}

/** The fallback scope the current call runs in, or undefined when a failure here is a real error. */
export function handledFallback(): HandledFallbackScope | undefined {
  return scopeStore.getStore();
}

/** Counts a recovered failure. Never throws: a metrics failure must not change the result. */
export function recordHandledFallback(name: HandledFallbackName): void {
  try {
    fallbackCounter().add(1, { fallback: name });
  } catch {
    // metrics are best effort
  }
}
