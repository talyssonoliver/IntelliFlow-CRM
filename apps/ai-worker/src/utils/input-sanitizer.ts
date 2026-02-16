/**
 * Input Sanitizer for Prediction Jobs (IFC-095)
 *
 * Validates and sanitizes prediction job inputs before passing to AI chains.
 * Enforces tenant isolation, validates UUIDs, and prevents injection attacks.
 *
 * @module utils/input-sanitizer
 */

import { z } from 'zod';
import pino from 'pino';

const logger = pino({
  name: 'input-sanitizer',
  level: process.env.LOG_LEVEL || 'info',
});

const ENTITY_TYPES = ['lead', 'contact', 'opportunity', 'account'] as const;
const PREDICTION_TYPES = ['CHURN_RISK', 'NEXT_BEST_ACTION', 'QUALIFICATION'] as const;

/**
 * Validate entity ID is a valid UUID
 */
export function validateEntityId(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

/**
 * Zod schema for prediction input with mandatory tenant context
 */
export const predictionInputSchema = z.object({
  entityType: z.enum(ENTITY_TYPES, {
    errorMap: () => ({ message: 'Invalid entity type' }),
  }),
  entityId: z.string().refine(validateEntityId, {
    message: 'Invalid entity ID - must be valid UUID',
  }),
  predictionType: z.enum(PREDICTION_TYPES, {
    errorMap: () => ({ message: 'Invalid prediction type' }),
  }),
  context: z
    .object({
      tenantId: z.string().refine(validateEntityId, {
        message: 'tenantId is required and must be valid UUID',
      }),
      userId: z.string().refine(validateEntityId, {
        message: 'userId is required and must be valid UUID',
      }),
    })
    .passthrough(),
  correlationId: z.string().optional(),
  priority: z.number().min(1).max(10).default(5),
});

export type SanitizedPredictionInput = z.infer<typeof predictionInputSchema>;

/**
 * Validate and sanitize prediction job input
 * @throws Error if validation fails
 */
export function sanitizePredictionInput(input: unknown): SanitizedPredictionInput {
  const result = predictionInputSchema.safeParse(input);

  if (!result.success) {
    const errors = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
    logger.warn({ errors, input }, 'Prediction input validation failed');
    throw new Error(`Invalid prediction input: ${errors}`);
  }

  logger.debug({ entityId: result.data.entityId }, 'Prediction input validated');
  return result.data;
}

/**
 * Validate tenant context is present and valid
 */
export function validateTenantContext(context: Record<string, unknown> | undefined): {
  tenantId: string;
  userId: string;
} {
  if (!context?.tenantId || typeof context.tenantId !== 'string') {
    throw new Error('tenantId is required in context');
  }
  if (!context?.userId || typeof context.userId !== 'string') {
    throw new Error('userId is required in context');
  }

  if (!validateEntityId(context.tenantId)) {
    throw new Error('tenantId must be a valid UUID');
  }
  if (!validateEntityId(context.userId)) {
    throw new Error('userId must be a valid UUID');
  }

  return {
    tenantId: context.tenantId,
    userId: context.userId,
  };
}

/**
 * Sanitize string field - trim, truncate, remove control characters
 */
export function sanitizeStringField(value: string, maxLength = 500): string {
  return (
    value
      .trim()
      // eslint-disable-next-line no-control-regex -- Intentional: sanitizing control characters from user input
      .replace(/[\x00-\x1F\x7F]/g, '')
      .slice(0, maxLength)
  );
}

/**
 * Clamp numeric field to valid range
 */
export function clampNumericField(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
