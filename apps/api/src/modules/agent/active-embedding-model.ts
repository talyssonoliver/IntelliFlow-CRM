/**
 * active-embedding-model.ts — PG-199 (owner Q10): reads the embedding model the ai-worker
 * publishes (apps/ai-worker/src/lib/embedding-model-publisher.ts). Only the worker's environment
 * says which embeddings provider runs, so the Model Configuration page shows this value, or
 * "unavailable" when it is missing, never a catalog default.
 */

import { z } from 'zod';

/** Shared with the ai-worker publisher; a parity test on each side pins the literal. */
export const ACTIVE_EMBEDDING_MODEL_KEY = 'ai-config:v1:embedding-model';

const activeEmbeddingModelSchema = z.object({
  id: z.string().min(1).max(200),
  dimensions: z.number().int().positive().nullable(),
});

export type ActiveEmbeddingModel = z.infer<typeof activeEmbeddingModelSchema>;

/** Minimal ioredis surface; `status` / `connect` let a lazy client connect on first read. */
export interface ActiveEmbeddingModelRedis {
  get(key: string): Promise<string | null>;
  status?: string;
  connect?(): Promise<unknown>;
}

/**
 * The published embedding model, or null when Redis is unavailable, the key is missing or
 * expired (no worker running), or the value is malformed. Never throws.
 */
export function createActiveEmbeddingModelReader(
  redis: ActiveEmbeddingModelRedis | null
): () => Promise<ActiveEmbeddingModel | null> {
  return async () => {
    if (!redis) return null;
    try {
      if (redis.status === 'wait') await redis.connect?.();
      const raw = await redis.get(ACTIVE_EMBEDDING_MODEL_KEY);
      if (!raw) return null;
      const parsed = activeEmbeddingModelSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch (err) {
      console.warn(
        '[model-config] active embedding model unavailable:',
        err instanceof Error ? err.message : err
      );
      return null;
    }
  };
}
