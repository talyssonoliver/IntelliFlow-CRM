/**
 * Chain Version Validators - Model Versioning with Zep
 *
 * Zod schemas for chain version inputs/outputs.
 * Derived from domain constants in packages/domain/src/ai/ChainVersionConstants.ts
 *
 * Task: IFC-086 - Model Versioning with Zep
 */

import { z } from 'zod';
import {
  CHAIN_VERSION_STATUSES,
  CHAIN_TYPES,
  VERSION_ROLLOUT_STRATEGIES,
  CHAIN_VERSION_AUDIT_ACTIONS,
  CHAIN_VERSION_DEFAULTS,
} from '@intelliflow/domain';

// =============================================================================
// Base Schemas (derived from domain constants)
// =============================================================================

export const chainVersionStatusSchema = z.enum(CHAIN_VERSION_STATUSES);
export const chainTypeSchema = z.enum(CHAIN_TYPES);
export const versionRolloutStrategySchema = z.enum(VERSION_ROLLOUT_STRATEGIES);
export const chainVersionAuditActionSchema = z.enum(CHAIN_VERSION_AUDIT_ACTIONS);

// =============================================================================
// Chain Configuration Schema
// =============================================================================

export const chainConfigSchema = z.object({
  prompt: z.string().min(10).max(50000),
  model: z.string().min(1).max(100).default(CHAIN_VERSION_DEFAULTS.DEFAULT_MODEL),
  temperature: z
    .number()
    .min(0)
    .max(2)
    .default(CHAIN_VERSION_DEFAULTS.DEFAULT_TEMPERATURE),
  maxTokens: z
    .number()
    .int()
    .min(100)
    .max(128000)
    .default(CHAIN_VERSION_DEFAULTS.DEFAULT_MAX_TOKENS),
  additionalParams: z.record(z.unknown()).optional(),
});

export type ChainConfig = z.infer<typeof chainConfigSchema>;

// =============================================================================
// Create Chain Version Input
// =============================================================================

export const createChainVersionSchema = z.object({
  chainType: chainTypeSchema,
  prompt: z.string().min(10).max(50000),
  model: z.string().min(1).max(100).default(CHAIN_VERSION_DEFAULTS.DEFAULT_MODEL),
  temperature: z
    .number()
    .min(0)
    .max(2)
    .default(CHAIN_VERSION_DEFAULTS.DEFAULT_TEMPERATURE),
  maxTokens: z
    .number()
    .int()
    .min(100)
    .max(128000)
    .default(CHAIN_VERSION_DEFAULTS.DEFAULT_MAX_TOKENS),
  additionalParams: z.record(z.unknown()).optional(),
  description: z.string().max(1000).optional(),
  parentVersionId: z.string().uuid().optional(),
  rolloutStrategy: versionRolloutStrategySchema.default(
    CHAIN_VERSION_DEFAULTS.DEFAULT_ROLLOUT_STRATEGY
  ),
  rolloutPercent: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(CHAIN_VERSION_DEFAULTS.DEFAULT_ROLLOUT_PERCENT)
    .optional(),
  experimentId: z.string().cuid().optional(),
});

export type CreateChainVersionInput = z.infer<typeof createChainVersionSchema>;

// =============================================================================
// Update Chain Version Input
// =============================================================================

export const updateChainVersionSchema = z.object({
  prompt: z.string().min(10).max(50000).optional(),
  model: z.string().min(1).max(100).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(100).max(128000).optional(),
  additionalParams: z.record(z.unknown()).optional(),
  description: z.string().max(1000).optional(),
  rolloutStrategy: versionRolloutStrategySchema.optional(),
  rolloutPercent: z.number().int().min(1).max(100).optional(),
  experimentId: z.string().cuid().nullable().optional(),
});

export type UpdateChainVersionInput = z.infer<typeof updateChainVersionSchema>;

// =============================================================================
// Chain Version Full Schema
// =============================================================================

export const chainVersionSchema = z.object({
  id: z.string().uuid(),
  chainType: chainTypeSchema,
  status: chainVersionStatusSchema,
  prompt: z.string(),
  model: z.string(),
  temperature: z.number(),
  maxTokens: z.number().int(),
  additionalParams: z.record(z.unknown()).nullable(),
  description: z.string().nullable(),
  parentVersionId: z.string().uuid().nullable(),
  rolloutStrategy: versionRolloutStrategySchema,
  rolloutPercent: z.number().int().nullable(),
  experimentId: z.string().cuid().nullable(),
  createdBy: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  tenantId: z.string(),
});

export type ChainVersion = z.infer<typeof chainVersionSchema>;

// =============================================================================
// Chain Version Summary (for lists)
// =============================================================================

export const chainVersionSummarySchema = z.object({
  id: z.string().uuid(),
  chainType: chainTypeSchema,
  status: chainVersionStatusSchema,
  model: z.string(),
  description: z.string().nullable(),
  rolloutStrategy: versionRolloutStrategySchema,
  rolloutPercent: z.number().int().nullable(),
  createdAt: z.date(),
  createdBy: z.string(),
});

export type ChainVersionSummary = z.infer<typeof chainVersionSummarySchema>;

// =============================================================================
// Activate Version Input
// =============================================================================

export const activateVersionSchema = z.object({
  versionId: z.string().uuid(),
});

export type ActivateVersionInput = z.infer<typeof activateVersionSchema>;

// =============================================================================
// Rollback Version Input
// =============================================================================

export const rollbackVersionSchema = z.object({
  versionId: z.string().uuid(),
  reason: z.string().min(10).max(500),
});

export type RollbackVersionInput = z.infer<typeof rollbackVersionSchema>;

// =============================================================================
// Rollback Result
// =============================================================================

export const rollbackResultSchema = z.object({
  success: z.boolean(),
  previousVersionId: z.string().uuid(),
  rolledBackVersionId: z.string().uuid(),
  auditId: z.string().uuid(),
  rolledBackAt: z.date(),
});

export type RollbackResult = z.infer<typeof rollbackResultSchema>;

// =============================================================================
// Chain Version Audit Schema
// =============================================================================

export const chainVersionAuditSchema = z.object({
  id: z.string().uuid(),
  versionId: z.string().uuid(),
  action: chainVersionAuditActionSchema,
  previousState: z.record(z.unknown()).nullable(),
  newState: z.record(z.unknown()).nullable(),
  performedBy: z.string(),
  performedAt: z.date(),
  reason: z.string().nullable(),
});

export type ChainVersionAudit = z.infer<typeof chainVersionAuditSchema>;

// =============================================================================
// Version Context (for version selection)
// =============================================================================

export const versionContextSchema = z.object({
  userId: z.string().optional(),
  sessionId: z.string().optional(),
  leadId: z.string().cuid().optional(),
  tenantId: z.string(),
  experimentId: z.string().cuid().optional(),
});

export type VersionContext = z.infer<typeof versionContextSchema>;

// =============================================================================
// List Versions Input
// =============================================================================

export const listChainVersionsSchema = z.object({
  chainType: chainTypeSchema,
  status: chainVersionStatusSchema.optional(),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

export type ListChainVersionsInput = z.infer<typeof listChainVersionsSchema>;

// =============================================================================
// Version History Input
// =============================================================================

export const versionHistorySchema = z.object({
  chainType: chainTypeSchema,
  limit: z.number().int().min(1).max(50).default(10),
});

export type VersionHistoryInput = z.infer<typeof versionHistorySchema>;

// =============================================================================
// Active Version Response
// =============================================================================

export const activeVersionResponseSchema = z.object({
  version: chainVersionSchema,
  selectedBy: z.enum(['direct', 'rollout', 'experiment']),
  experimentVariant: z.string().optional(),
});

export type ActiveVersionResponse = z.infer<typeof activeVersionResponseSchema>;

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Check if a version is eligible for activation
 */
export function canActivateVersion(
  version: ChainVersion,
  currentActive: ChainVersion | null
): { canActivate: boolean; reason?: string } {
  if (version.status !== 'DRAFT') {
    return { canActivate: false, reason: 'Only DRAFT versions can be activated' };
  }
  if (version.prompt.length < 10) {
    return { canActivate: false, reason: 'Prompt is too short' };
  }
  return { canActivate: true };
}

/**
 * Format version info for display
 */
export function formatVersionInfo(version: ChainVersion): string {
  const status = version.status === 'ACTIVE' ? '✅' : version.status === 'DRAFT' ? '📝' : '📦';
  return `${status} ${version.chainType} v${version.id.slice(0, 8)} (${version.model})`;
}

/**
 * Get version age description
 */
export function getVersionAge(version: ChainVersion): string {
  const now = new Date();
  const diffMs = now.getTime() - version.createdAt.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Created today';
  if (diffDays === 1) return 'Created yesterday';
  if (diffDays < 7) return `Created ${diffDays} days ago`;
  if (diffDays < 30) return `Created ${Math.floor(diffDays / 7)} weeks ago`;
  return `Created ${Math.floor(diffDays / 30)} months ago`;
}
