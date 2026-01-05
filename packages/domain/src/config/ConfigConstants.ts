/**
 * Config Constants - Single Source of Truth
 *
 * Canonical enum values for application configuration.
 * All validator schemas derive their types from these constants.
 */

// =============================================================================
// Node Environment
// =============================================================================

/**
 * Node.js environment values
 */
export const NODE_ENVIRONMENTS = [
  'development',
  'test',
  'staging',
  'production',
] as const;

export type NodeEnvironment = (typeof NODE_ENVIRONMENTS)[number];

// =============================================================================
// Log Levels
// =============================================================================

/**
 * Logging levels (severity order: debug < info < warn < error)
 */
export const LOG_LEVELS = [
  'debug',
  'info',
  'warn',
  'error',
] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];
