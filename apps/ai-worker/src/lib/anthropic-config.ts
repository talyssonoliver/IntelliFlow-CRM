/**
 * Settings for Claude calls (AI_PROVIDER=anthropic, owner decision 2026-11-07), read from env at
 * call time so ops can change them without a deploy. No SDK import: the worker's health check
 * reads these too.
 */

/** Effort levels the Messages API accepts in `output_config.effort`. */
export const ANTHROPIC_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type AnthropicEffort = (typeof ANTHROPIC_EFFORTS)[number];

/** Claude Haiku 5.5 for every chain unless a tier is overridden. */
export const DEFAULT_ANTHROPIC_MODEL = 'claude-haiku-5-5';

/**
 * The Claude model for a tier: `ANTHROPIC_MODEL_{FREE,STANDARD,PREMIUM}`, else `ANTHROPIC_MODEL`,
 * else Claude Haiku 5.5. Lets a tier move to `claude-sonnet-5-5` later.
 */
export function anthropicModelForTier(tier: string): string {
  return (
    process.env[`ANTHROPIC_MODEL_${tier.toUpperCase()}`] ||
    process.env['ANTHROPIC_MODEL'] ||
    DEFAULT_ANTHROPIC_MODEL
  );
}

/**
 * `output_config.effort`: `ANTHROPIC_EFFORT`, default `low`. Effort sets how much the model
 * thinks, and so most of the output tokens billed; the chains ask for short structured
 * answers. An unknown value falls back to `low` with a warning.
 */
export function anthropicEffort(): AnthropicEffort {
  const raw = (process.env['ANTHROPIC_EFFORT'] || '').trim().toLowerCase();
  if (!raw) return 'low';
  if ((ANTHROPIC_EFFORTS as readonly string[]).includes(raw)) return raw as AnthropicEffort;
  console.warn(
    `[anthropic-config] ANTHROPIC_EFFORT "${raw}" is not a known effort level — using low`
  );
  return 'low';
}

/**
 * Floor for `max_tokens` on Claude. Thinking is on by default on the current models and its
 * tokens count toward `max_tokens`, so the 2,000 the chains pass to other providers could cut an
 * answer off (stop_reason max_tokens, reported as a failure). It is a ceiling, not a charge:
 * only the tokens produced are billed.
 */
export const ANTHROPIC_MIN_MAX_TOKENS = 8000;
