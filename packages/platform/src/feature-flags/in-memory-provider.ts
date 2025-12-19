import type {
  FeatureFlagContext,
  FeatureFlagDecision,
  FeatureFlagDefinition,
  FeatureFlagKey,
  FeatureFlagProvider,
  FeatureFlagsConfig,
} from './types';
import { featureFlagsConfigSchema } from './schema';

function stableHashPercent(input: string): number {
  // FNV-1a 32-bit
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // Convert to [0, 100)
  return (hash >>> 0) % 100;
}

function firstMatchingRule(
  definition: FeatureFlagDefinition,
  context: FeatureFlagContext | undefined
): FeatureFlagDecision | null {
  if (!definition.rules?.length) return null;
  const attrs = context?.attributes ?? {};

  for (const rule of definition.rules) {
    const matches = Object.entries(rule.when).every(([key, expected]) => attrs[key] === expected);
    if (matches) {
      return {
        key: definition.key,
        enabled: rule.then.enabled,
        variant: rule.then.variant,
        reason: 'rule_match',
      };
    }
  }

  return null;
}

function rolloutDecision(
  definition: FeatureFlagDefinition,
  context: FeatureFlagContext | undefined
): FeatureFlagDecision | null {
  if (definition.rolloutPercent === undefined) return null;
  const subjectId = context?.subjectId;
  if (!subjectId) return null;

  const bucket = stableHashPercent(`${definition.key}:${subjectId}`);
  const enabled = bucket < definition.rolloutPercent;

  let variant: string | undefined;
  if (enabled && definition.variants?.length) {
    const variantBucket = stableHashPercent(`${definition.key}:variant:${subjectId}`);
    variant = definition.variants[variantBucket % definition.variants.length];
  }

  return { key: definition.key, enabled, variant, reason: 'percentage_rollout' };
}

export class InMemoryFeatureFlagProvider implements FeatureFlagProvider {
  private readonly flagsByKey: Map<FeatureFlagKey, FeatureFlagDefinition>;

  private constructor(flags: FeatureFlagDefinition[]) {
    this.flagsByKey = new Map(flags.map((f) => [f.key, f]));
  }

  static fromConfig(input: unknown): InMemoryFeatureFlagProvider {
    const parsed = featureFlagsConfigSchema.safeParse(input);
    if (!parsed.success) {
      // Fail closed: treat everything as disabled if config is invalid.
      return new InMemoryFeatureFlagProvider([]);
    }
    return new InMemoryFeatureFlagProvider((parsed.data as FeatureFlagsConfig).flags);
  }

  getDecision(key: FeatureFlagKey, context?: FeatureFlagContext): FeatureFlagDecision {
    const definition = this.flagsByKey.get(key);
    if (!definition) return { key, enabled: false, reason: 'missing_flag' };
    if (!definition.enabled) return { key, enabled: false, reason: 'disabled' };

    const ruleDecision = firstMatchingRule(definition, context);
    if (ruleDecision) return ruleDecision;

    const rollout = rolloutDecision(definition, context);
    if (rollout) return rollout;

    return { key, enabled: true, reason: 'default' };
  }

  isEnabled(key: FeatureFlagKey, context?: FeatureFlagContext): boolean {
    return this.getDecision(key, context).enabled;
  }
}

