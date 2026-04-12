/**
 * Shared Workflow Library
 *
 * Single source of truth for the STOA workflow used by both:
 * - UI (DailyWorkflowSummary, API endpoints)
 * - CLI (Claude Code skills: /spec-session, /plan-session, /exec)
 *
 * This ensures consistent behavior across all interfaces.
 */

export * from './types';
export * from './config';
export * from './status-transitions';
export * from './paths';
export * from './validation';
export * from './utils';
export * from './metrics';
