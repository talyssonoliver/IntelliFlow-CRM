/**
 * embedding-model-publisher.ts — PG-199 (owner Q10): the worker publishes the embedding model it
 * actually runs, so the Model Configuration page shows the real locked rag model instead of a
 * catalog default. Only the worker knows it: EMBEDDING_PROVIDER and the Gemini settings live in
 * the worker's environment, not the API's.
 *
 * The API reads `ACTIVE_EMBEDDING_MODEL_KEY` (apps/api/src/modules/agent/active-embedding-model.ts)
 * and shows "unavailable" when the key is missing, so the TTL makes a stopped worker's value expire.
 */

import pino from 'pino';
import { MODEL_CATALOG } from '@intelliflow/domain';
import { aiConfig } from '../config/ai.config.js';
import { embeddingsPricingKey } from './llm-factory.js';

const logger = pino({ name: 'embedding-model-publisher', level: process.env.LOG_LEVEL || 'info' });

/** Shared with the API reader; a parity test on each side pins the literal. */
export const ACTIVE_EMBEDDING_MODEL_KEY = 'ai-config:v1:embedding-model';
export const EMBEDDING_MODEL_PUBLISH_INTERVAL_MS = 5 * 60_000;
/** Six publish intervals, so one missed tick never blanks the page. */
const TTL_SECONDS = (6 * EMBEDDING_MODEL_PUBLISH_INTERVAL_MS) / 1000;

export interface ActiveEmbeddingModel {
  id: string;
  dimensions: number | null;
}

export interface EmbeddingModelRedis {
  set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown>;
}

/** The embedding model createEmbeddings('free') builds (the tier the embedding chain uses). */
export function activeEmbeddingModel(): ActiveEmbeddingModel {
  const pricingKey = embeddingsPricingKey('free');
  const entry = MODEL_CATALOG.find(
    (model) => model.kind === 'embedding' && model.pricingKey === pricingKey
  );
  if (aiConfig.provider !== 'mock' && process.env['EMBEDDING_PROVIDER'] === 'gemini') {
    // GeminiEmbeddings truncates to EMBEDDING_DIMENSIONS (default 1536), see createEmbeddings.
    const dimensions = Number.parseInt(process.env['EMBEDDING_DIMENSIONS'] || '1536', 10);
    return {
      id: entry?.id ?? pricingKey,
      dimensions: Number.isFinite(dimensions) ? dimensions : null,
    };
  }
  return { id: entry?.id ?? pricingKey, dimensions: entry?.dimensions ?? null };
}

export class EmbeddingModelPublisher {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly redis: EmbeddingModelRedis,
    private readonly intervalMs: number = EMBEDDING_MODEL_PUBLISH_INTERVAL_MS
  ) {}

  /** Publish once; a Redis failure is logged and retried on the next tick. */
  async publish(): Promise<void> {
    try {
      await this.redis.set(
        ACTIVE_EMBEDDING_MODEL_KEY,
        JSON.stringify(activeEmbeddingModel()),
        'EX',
        TTL_SECONDS
      );
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'active embedding model not published'
      );
    }
  }

  start(): void {
    if (this.timer) return;
    this.publish().catch(() => undefined);
    this.timer = setInterval(() => {
      this.publish().catch(() => undefined);
    }, this.intervalMs);
    this.timer.unref?.();
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
