/**
 * PG-199: Module Settings — Model Config validators (ADR-082).
 *
 * One row per AI purpose (owner Q1). Purposes, the model catalog and the limits
 * derive from the domain (DRY rule). The superRefine rejects duplicate purposes
 * ("items N and M", reported at the second offender — playbook §6), models not
 * routed for the purpose, the effective primary inside its own fallbacks,
 * duplicate fallbacks, and any change to the locked rag row other than its
 * ceiling (owner Q5). Objects are not strict: unknown keys (including `tier`,
 * which the page never edits) are stripped so an older or newer client cannot
 * break the call.
 */
import { z } from 'zod';
import {
  LLM_PURPOSES,
  MODEL_CONFIG_LIMITS,
  defaultModelsFor,
  isModelAllowedForPurpose,
  type LLMPurpose,
} from '@intelliflow/domain';

const L = MODEL_CONFIG_LIMITS;

export const llmPurposeSchema = z.enum(LLM_PURPOSES);

const modelIdSchema = z.string().trim().min(1).max(64);

const purposeConfigFieldsSchema = z.object({
  purpose: llmPurposeSchema,
  modelId: modelIdSchema.nullable(),
  fallbackModelIds: z.array(modelIdSchema).max(L.maxFallbacks),
  temperature: z.number().min(L.temperatureMin).max(L.temperatureMax).nullable(),
  maxTokens: z.number().int().min(L.maxTokensMin).max(L.maxTokensMax).nullable(),
  monthlyCostCeilingCents: z
    .number()
    .int()
    .min(L.ceilingCentsMin)
    .max(L.ceilingCentsMax)
    .nullable(),
});

type PurposeConfigFields = z.infer<typeof purposeConfigFieldsSchema>;
type IssuePath = (string | number)[];

function refineRagLock(row: PurposeConfigFields, ctx: z.RefinementCtx, base: IssuePath): void {
  const locked: [keyof PurposeConfigFields, boolean][] = [
    ['modelId', row.modelId !== null],
    ['fallbackModelIds', row.fallbackModelIds.length > 0],
    ['temperature', row.temperature !== null],
    ['maxTokens', row.maxTokens !== null],
  ];
  for (const [field, changed] of locked) {
    if (!changed) continue;
    ctx.addIssue({
      code: 'custom',
      message: 'The rag embedding model is locked; only its monthly ceiling can change',
      path: [...base, field],
    });
  }
}

function refineModels(row: PurposeConfigFields, ctx: z.RefinementCtx, base: IssuePath): void {
  const purpose: LLMPurpose = row.purpose;
  if (row.modelId !== null && !isModelAllowedForPurpose(purpose, row.modelId)) {
    ctx.addIssue({
      code: 'custom',
      message: `Model "${row.modelId}" is not available for ${purpose}`,
      path: [...base, 'modelId'],
    });
  }
  const primaries = row.modelId === null ? defaultModelsFor(purpose) : [row.modelId];
  const seen = new Map<string, number>();
  row.fallbackModelIds.forEach((id, index) => {
    const path = [...base, 'fallbackModelIds', index];
    const first = seen.get(id);
    if (first !== undefined) {
      ctx.addIssue({
        code: 'custom',
        message: `Duplicate fallback model: items ${first + 1} and ${index + 1}`,
        path,
      });
      return;
    }
    seen.set(id, index);
    if (!isModelAllowedForPurpose(purpose, id)) {
      ctx.addIssue({
        code: 'custom',
        message: `Model "${id}" is not available for ${purpose}`,
        path,
      });
    } else if (primaries.includes(id)) {
      ctx.addIssue({ code: 'custom', message: 'A fallback cannot be the primary model', path });
    }
  });
}

function refinePurposeConfig(
  row: PurposeConfigFields,
  ctx: z.RefinementCtx,
  base: IssuePath = []
): void {
  if (row.purpose === 'rag') {
    refineRagLock(row, ctx, base);
    return;
  }
  refineModels(row, ctx, base);
}

export const purposeConfigInputSchema = purposeConfigFieldsSchema.superRefine((row, ctx) =>
  refinePurposeConfig(row, ctx)
);
export type PurposeConfigInput = z.infer<typeof purposeConfigInputSchema>;

/** Per-purpose optimistic-concurrency token: the row's updatedAt, or null when no row was seen. */
const expectedUpdatedAtSchema = z.object(
  Object.fromEntries(
    LLM_PURPOSES.map((p) => [p, z.iso.datetime().nullable().optional()])
  ) as Record<LLMPurpose, z.ZodOptional<z.ZodNullable<z.ZodISODateTime>>>
);
export type ModelConfigExpected = z.infer<typeof expectedUpdatedAtSchema>;

export const updateModelConfigSchema = z
  .object({
    purposes: z.array(purposeConfigFieldsSchema).min(1).max(LLM_PURPOSES.length),
    expected: expectedUpdatedAtSchema,
    acknowledgeDowngrade: z.literal(true).optional(),
  })
  .superRefine((data, ctx) => {
    const seen = new Map<LLMPurpose, number>();
    data.purposes.forEach((row, index) => {
      const first = seen.get(row.purpose);
      if (first !== undefined) {
        ctx.addIssue({
          code: 'custom',
          message: `Duplicate purpose: items ${first + 1} and ${index + 1}`,
          path: ['purposes', index],
        });
        return;
      }
      seen.set(row.purpose, index);
      refinePurposeConfig(row, ctx, ['purposes', index]);
    });
  });
export type UpdateModelConfigInput = z.infer<typeof updateModelConfigSchema>;

export const resetModelConfigSchema = z.object({
  expected: expectedUpdatedAtSchema,
  acknowledgeDowngrade: z.literal(true).optional(),
});
export type ResetModelConfigInput = z.infer<typeof resetModelConfigSchema>;
