/**
 * Chain Version Constants - Single Source of Truth
 *
 * Canonical enum values for AI chain/prompt versioning.
 * All validator schemas derive their types from these constants.
 *
 * Task: IFC-086 - Model Versioning with Zep
 */

// =============================================================================
// Chain Version Statuses
// =============================================================================

/**
 * Lifecycle statuses for chain versions
 */
export const CHAIN_VERSION_STATUSES = [
  'DRAFT',
  'ACTIVE',
  'DEPRECATED',
  'ARCHIVED',
] as const;

export type ChainVersionStatus = (typeof CHAIN_VERSION_STATUSES)[number];

// =============================================================================
// Chain Types
// =============================================================================

/**
 * Types of AI chains/agents that can be versioned
 */
export const CHAIN_TYPES = [
  'SCORING',
  'QUALIFICATION',
  'EMAIL_WRITER',
  'FOLLOWUP',
] as const;

export type ChainType = (typeof CHAIN_TYPES)[number];

// =============================================================================
// Version Rollout Strategies
// =============================================================================

/**
 * Strategies for rolling out new chain versions
 */
export const VERSION_ROLLOUT_STRATEGIES = [
  'IMMEDIATE',
  'PERCENTAGE',
  'AB_TEST',
] as const;

export type VersionRolloutStrategy = (typeof VERSION_ROLLOUT_STRATEGIES)[number];

// =============================================================================
// Chain Version Audit Actions
// =============================================================================

/**
 * Actions tracked in version audit log
 */
export const CHAIN_VERSION_AUDIT_ACTIONS = [
  'CREATED',
  'ACTIVATED',
  'DEPRECATED',
  'ARCHIVED',
  'ROLLED_BACK',
] as const;

export type ChainVersionAuditAction = (typeof CHAIN_VERSION_AUDIT_ACTIONS)[number];

// =============================================================================
// Chain Version Defaults
// =============================================================================

/**
 * Default configuration values for chain versions
 */
export const CHAIN_VERSION_DEFAULTS = {
  /** Default model for chains */
  DEFAULT_MODEL: 'gpt-4-turbo-preview',
  /** Default temperature for generation */
  DEFAULT_TEMPERATURE: 0.7,
  /** Default max tokens */
  DEFAULT_MAX_TOKENS: 2000,
  /** Default rollout strategy */
  DEFAULT_ROLLOUT_STRATEGY: 'IMMEDIATE' as VersionRolloutStrategy,
  /** Default rollout percentage (100% = full rollout) */
  DEFAULT_ROLLOUT_PERCENT: 100,
} as const;

// =============================================================================
// Zep Memory Configuration
// =============================================================================

/**
 * Zep memory configuration for session management
 */
export const ZEP_CONFIG = {
  /** Maximum episodes for free tier */
  MAX_FREE_EPISODES: 1000,
  /** Warning threshold (80%) */
  WARNING_THRESHOLD_PERCENT: 80,
  /** Hard limit threshold (95%) - fallback to in-memory */
  HARD_LIMIT_PERCENT: 95,
  /** Default session TTL in seconds (24 hours) */
  DEFAULT_SESSION_TTL: 86400,
  /** Maximum messages to retrieve per session */
  DEFAULT_MEMORY_LIMIT: 100,
} as const;
