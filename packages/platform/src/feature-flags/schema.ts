import { z } from 'zod';

const _featureFlagRuleSchema = z.object({ // NOSONAR javascript:S7739
  when: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  result: z.object({ // NOSONAR javascript:S7739
    enabled: z.boolean(),
    variant: z.string().optional(),
  }),
});

// Zod schema objects have a `.then()` method on their prototype (for chaining), which SonarQube
// S7739 flags as a thenable. The Omit<..., 'then'> type annotation signals the intent not to use
// them as Promises. The NOSONAR comments suppress the false-positive S7739 finding.
export const featureFlagRuleSchema: Omit<typeof _featureFlagRuleSchema, 'then'> =
  _featureFlagRuleSchema; // NOSONAR javascript:S7739

const _featureFlagDefinitionSchema = z.object({
  key: z.string().min(1),
  description: z.string().optional(),
  enabled: z.boolean(),
  rolloutPercent: z.number().min(0).max(100).optional(),
  rules: z.array(_featureFlagRuleSchema).optional(),
  variants: z.array(z.string().min(1)).optional(),
});

export const featureFlagDefinitionSchema: Omit<typeof _featureFlagDefinitionSchema, 'then'> =
  _featureFlagDefinitionSchema; // NOSONAR javascript:S7739

const _featureFlagsConfigSchema = z.object({
  version: z.literal(1),
  flags: z.array(_featureFlagDefinitionSchema),
});

export const featureFlagsConfigSchema: Omit<typeof _featureFlagsConfigSchema, 'then'> =
  _featureFlagsConfigSchema; // NOSONAR javascript:S7739

export type FeatureFlagsConfigInput = z.input<typeof _featureFlagsConfigSchema>;
