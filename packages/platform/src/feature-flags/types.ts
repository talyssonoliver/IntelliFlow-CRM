export type FeatureFlagKey = string; // NOSONAR typescript:S6564 — exported as part of the public API for type-safe feature flag key usage

export interface FeatureFlagContext {
  /**
   * Stable identifier used for deterministic rollout bucketing.
   * Avoid emails/names; prefer an internal UUID.
   */
  subjectId?: string;

  /**
   * Optional attributes for rule evaluation (environment, plan tier, etc).
   */
  attributes?: Record<string, string | number | boolean>;
}

export interface FeatureFlagDecision {
  key: FeatureFlagKey;
  enabled: boolean;
  variant?: string;
  reason:
    | 'default'
    | 'missing_flag'
    | 'disabled'
    | 'rule_match'
    | 'percentage_rollout'
    | 'invalid_config';
}

export interface FeatureFlagRule {
  when: Record<string, string | number | boolean>;
  result: { enabled: boolean; variant?: string };
}

export interface FeatureFlagDefinition {
  key: FeatureFlagKey;
  description?: string;
  enabled: boolean;
  /**
   * Percentage rollout (0..100). If omitted, no percentage-based rollout is applied.
   */
  rolloutPercent?: number;
  /**
   * Optional rule list; first match wins.
   */
  rules?: FeatureFlagRule[];
  /**
   * Variant names for experiments. If provided and rolloutPercent triggers, a variant may be selected.
   */
  variants?: string[];
}

export interface FeatureFlagsConfig {
  version: 1;
  flags: FeatureFlagDefinition[];
}

export interface FeatureFlagProvider {
  getDecision(key: FeatureFlagKey, context?: FeatureFlagContext): FeatureFlagDecision;
  isEnabled(key: FeatureFlagKey, context?: FeatureFlagContext): boolean;
}
