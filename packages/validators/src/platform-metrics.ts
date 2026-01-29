import { z } from 'zod';
import {
  IDP_STATUSES,
  DEPLOYMENT_TYPES,
  DEPLOYMENT_PROVIDERS,
  DEPLOYMENT_TRIGGERS,
  GOLDEN_PATH_TYPES,
  CI_STAGES,
  CD_STAGES,
  ONBOARDING_STEPS,
  SECRETS_TOOLS,
} from '@intelliflow/domain';

/**
 * Platform Metrics Validation Schemas
 *
 * Zod schemas for validating Internal Developer Platform (IDP) metrics.
 * All enums derive from @intelliflow/domain constants (single source of truth).
 *
 * Task: IFC-078 Platform Engineering Foundation
 *
 * Usage:
 * ```typescript
 * import { selfServiceMetricsSchema } from '@intelliflow/validators';
 * const metrics = selfServiceMetricsSchema.parse(jsonData);
 * ```
 */

// =============================================================================
// Enum Schemas (derived from domain constants)
// =============================================================================

export const idpStatusSchema = z.enum(IDP_STATUSES);
export const deploymentTypeSchema = z.enum(DEPLOYMENT_TYPES);
export const deploymentProviderSchema = z.enum(DEPLOYMENT_PROVIDERS);
export const deploymentTriggerSchema = z.enum(DEPLOYMENT_TRIGGERS);
export const goldenPathTypeSchema = z.enum(GOLDEN_PATH_TYPES);
export const ciStageSchema = z.enum(CI_STAGES);
export const cdStageSchema = z.enum(CD_STAGES);
export const onboardingStepSchema = z.enum(ONBOARDING_STEPS);
export const secretsToolSchema = z.enum(SECRETS_TOOLS);

// =============================================================================
// Component Schemas
// =============================================================================

/**
 * Golden Path definition
 */
export const goldenPathSchema = z.object({
  name: goldenPathTypeSchema,
  description: z.string().min(1),
  entry_point: z.string().min(1),
  documentation: z.string().min(1),
});

export type GoldenPath = z.infer<typeof goldenPathSchema>;

/**
 * IDP capabilities
 */
export const idpCapabilitiesSchema = z.object({
  status: idpStatusSchema,
  version: z.string().regex(/^\d+\.\d+\.\d+$/), // semver
  capabilities: z.array(z.string()).min(1),
});

/**
 * Golden paths configuration
 */
export const goldenPathsConfigSchema = z.object({
  defined: z.boolean(),
  paths: z.array(goldenPathSchema).min(1),
});

/**
 * Deployment configuration
 */
export const deploymentConfigSchema = z.object({
  enabled: z.boolean(),
  provider: deploymentProviderSchema,
  trigger: deploymentTriggerSchema,
  average_deploy_time_seconds: z.number().int().positive(),
  requires_approval: z.boolean().optional(),
});

export type DeploymentConfig = z.infer<typeof deploymentConfigSchema>;

/**
 * Self-service deploy metrics
 */
export const selfServiceDeployMetricsSchema = z.object({
  enabled: z.boolean(),
  deployment_types: z.object({
    preview_deployments: deploymentConfigSchema,
    staging_deployments: deploymentConfigSchema,
    production_deployments: deploymentConfigSchema,
  }),
  total_self_service_deploys: z.number().int().nonnegative(),
  successful_deploys: z.number().int().nonnegative(),
  failed_deploys: z.number().int().nonnegative(),
  success_rate_percent: z.number().min(0).max(100),
  average_time_to_deploy_seconds: z.number().int().positive(),
});

/**
 * CI pipeline configuration
 */
export const ciPipelineSchema = z.object({
  name: z.string().min(1),
  file: z.string().optional(),
  stages: z.array(ciStageSchema).min(1),
  average_duration_minutes: z.number().positive(),
  pass_rate_percent: z.number().min(0).max(100),
});

/**
 * CD pipeline configuration
 */
export const cdPipelineSchema = z.object({
  name: z.string().min(1),
  stages: z.array(cdStageSchema).min(1),
  average_duration_minutes: z.number().positive(),
  pass_rate_percent: z.number().min(0).max(100),
});

/**
 * Developer onboarding configuration
 */
export const developerOnboardingSchema = z.object({
  name: z.string().min(1),
  steps: z.array(onboardingStepSchema).min(1),
  average_time_to_first_commit_hours: z.number().positive(),
  success_rate_percent: z.number().min(0).max(100),
});

/**
 * Standardized workflows
 */
export const standardizedWorkflowsSchema = z.object({
  ci_pipeline: ciPipelineSchema,
  cd_pipeline: cdPipelineSchema,
  developer_onboarding: developerOnboardingSchema,
});

/**
 * Turborepo integration status
 */
export const turborepoIntegrationSchema = z.object({
  status: z.enum(['mature', 'developing', 'initial']),
  cache_enabled: z.boolean(),
  remote_cache_enabled: z.boolean(),
  tasks_defined: z.number().int().positive(),
  average_cached_build_time_seconds: z.number().int().nonnegative(),
  average_fresh_build_time_seconds: z.number().int().positive(),
  cache_hit_rate_percent: z.number().min(0).max(100),
});

/**
 * Local development environment
 */
export const localDevEnvironmentSchema = z.object({
  tool: z.string().min(1),
  setup_time_minutes: z.number().int().positive(),
  services: z.array(z.string()).min(1),
});

/**
 * Secrets management configuration
 */
export const secretsManagementSchema = z.object({
  tool: secretsToolSchema,
  environments: z.array(z.string()).min(1),
  rotation_policy: z.string().min(1),
});

/**
 * Configuration management
 */
export const configManagementSchema = z.object({
  method: z.string().min(1),
  validation: z.string().min(1),
  documentation: z.string().min(1),
});

/**
 * Environment management
 */
export const environmentManagementSchema = z.object({
  local_development: localDevEnvironmentSchema,
  secrets_management: secretsManagementSchema,
  configuration: configManagementSchema,
});

/**
 * KPI entry
 */
export const kpiEntrySchema = z.object({
  target: z.string().min(1),
  actual: z.string().min(1),
  met: z.boolean(),
});

export type KpiEntry = z.infer<typeof kpiEntrySchema>;

/**
 * KPIs collection
 */
export const platformKpisSchema = z.object({
  self_service_deploy_success_rate: kpiEntrySchema,
  time_to_first_deploy: kpiEntrySchema,
  developer_onboarding_time: kpiEntrySchema,
  ci_pipeline_pass_rate: kpiEntrySchema,
  cache_hit_rate: kpiEntrySchema,
});

/**
 * Validation result
 */
export const validationResultSchema = z.object({
  command: z.string().min(1),
  exit_code: z.number().int(),
  passed: z.boolean(),
  validated_at: z.string().datetime(),
});

// =============================================================================
// Main Schema: Self-Service Metrics
// =============================================================================

/**
 * Complete Self-Service Metrics Schema
 *
 * Validates the entire self-service-metrics.json file structure.
 */
export const selfServiceMetricsSchema = z.object({
  generated_at: z.string().datetime(),
  task_id: z.string().regex(/^IFC-\d+$/),
  sprint: z.number().int().nonnegative(),
  platform_engineering_foundation: z.object({
    internal_developer_platform: idpCapabilitiesSchema,
    golden_paths: goldenPathsConfigSchema,
  }),
  self_service_deploy_metrics: selfServiceDeployMetricsSchema,
  standardized_workflows: standardizedWorkflowsSchema,
  turborepo_integration: turborepoIntegrationSchema,
  environment_management: environmentManagementSchema,
  kpis: platformKpisSchema,
  validation: validationResultSchema,
});

export type SelfServiceMetrics = z.infer<typeof selfServiceMetricsSchema>;

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * Validate self-service metrics JSON
 *
 * @param data - Raw JSON data
 * @returns Validated SelfServiceMetrics object
 * @throws ZodError if validation fails
 */
export function validateSelfServiceMetrics(data: unknown): SelfServiceMetrics {
  return selfServiceMetricsSchema.parse(data);
}

/**
 * Safe validation (returns Result-like object)
 *
 * @param data - Raw JSON data
 * @returns { success: true, data } or { success: false, error }
 */
export function safeValidateSelfServiceMetrics(data: unknown) {
  return selfServiceMetricsSchema.safeParse(data);
}
