/**
 * Zod schema for AIMonitoringEvent.payload validation (M10)
 *
 * The `payload` column is Json? at the DB level, so the schema is fully
 * optional.  When a value IS present every recognised field is validated;
 * unknown extra fields are preserved via .passthrough().
 */
import { z } from 'zod';

export const AIMonitoringPayloadSchema = z
  .object({
    provider: z.enum(['litellm', 'openai', 'ollama', 'mock']).optional(),
    tier: z.enum(['free', 'standard', 'premium']).optional(),
    purpose: z.string().optional(),
    modelName: z.string().optional(),
    latencyMs: z.number().optional(),
    inputTokens: z.number().optional(),
    outputTokens: z.number().optional(),
    costUsd: z.number().optional(),
    hallucinationDetected: z.boolean().optional(),
    driftScore: z.number().optional(),
  })
  .passthrough();

export type AIMonitoringPayload = z.infer<typeof AIMonitoringPayloadSchema>;
