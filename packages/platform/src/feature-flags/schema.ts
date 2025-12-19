import { z } from 'zod';

export const featureFlagRuleSchema = z.object({
  when: z.record(z.union([z.string(), z.number(), z.boolean()])),
  then: z.object({
    enabled: z.boolean(),
    variant: z.string().optional(),
  }),
});

export const featureFlagDefinitionSchema = z.object({
  key: z.string().min(1),
  description: z.string().optional(),
  enabled: z.boolean(),
  rolloutPercent: z.number().min(0).max(100).optional(),
  rules: z.array(featureFlagRuleSchema).optional(),
  variants: z.array(z.string().min(1)).optional(),
});

export const featureFlagsConfigSchema = z.object({
  version: z.literal(1),
  flags: z.array(featureFlagDefinitionSchema),
});

export type FeatureFlagsConfigInput = z.input<typeof featureFlagsConfigSchema>;

