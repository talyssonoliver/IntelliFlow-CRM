/**
 * Feature Flag Adapter
 *
 * Bridges the platform's InMemoryFeatureFlagProvider (sync) to the
 * application's FeatureFlagProviderPort (async).
 */

import type { FeatureFlagProviderPort } from '@intelliflow/application';
import type {
  FeatureFlagProvider,
  FeatureFlagContext,
  FeatureFlagsConfig,
} from '@intelliflow/platform';

/**
 * Adapts a sync FeatureFlagProvider to the async FeatureFlagProviderPort.
 *
 * Context mapping:
 *   Record<string, unknown> → FeatureFlagContext
 *   - `userId` → `subjectId`
 *   - remaining entries → `attributes` (coerced to string/number/boolean)
 */
export class FeatureFlagAdapter implements FeatureFlagProviderPort {
  constructor(
    private readonly provider: FeatureFlagProvider,
    private readonly config: FeatureFlagsConfig
  ) {}

  async isEnabled(flagKey: string, context: Record<string, unknown>): Promise<boolean> {
    return this.provider.isEnabled(flagKey, mapContext(context));
  }

  async getVariant(flagKey: string, context: Record<string, unknown>): Promise<string | null> {
    const decision = this.provider.getDecision(flagKey, mapContext(context));
    return decision.variant ?? null;
  }

  async getRolloutPercent(flagKey: string): Promise<number> {
    const definition = this.config.flags.find((f) => f.key === flagKey);
    return definition?.rolloutPercent ?? 0;
  }
}

function mapContext(ctx: Record<string, unknown>): FeatureFlagContext {
  const { userId, ...rest } = ctx;

  const attributes: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(rest)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      attributes[key] = value;
    }
  }

  return {
    subjectId: typeof userId === 'string' ? userId : undefined,
    attributes: Object.keys(attributes).length > 0 ? attributes : undefined,
  };
}
