/**
 * Platform Constants - Single Source of Truth
 *
 * Canonical enum values for Internal Developer Platform (IDP) metrics.
 * All validator schemas derive their types from these constants.
 *
 * Task: IFC-078 Platform Engineering Foundation
 */

// =============================================================================
// IDP Status
// =============================================================================

/**
 * Internal Developer Platform operational status
 */
export const IDP_STATUSES = ['operational', 'degraded', 'offline'] as const;

export type IdpStatus = (typeof IDP_STATUSES)[number];

// =============================================================================
// Deployment Types
// =============================================================================

/**
 * Types of deployments in the self-service pipeline
 */
export const DEPLOYMENT_TYPES = [
  'preview',
  'staging',
  'production',
] as const;

export type DeploymentType = (typeof DEPLOYMENT_TYPES)[number];

// =============================================================================
// Deployment Providers
// =============================================================================

/**
 * Supported deployment providers
 */
export const DEPLOYMENT_PROVIDERS = [
  'Vercel',
  'Railway',
  'Easypanel',
  'Docker',
  'Manual',
] as const;

export type DeploymentProvider = (typeof DEPLOYMENT_PROVIDERS)[number];

// =============================================================================
// Deployment Triggers
// =============================================================================

/**
 * Events that trigger deployments
 */
export const DEPLOYMENT_TRIGGERS = [
  'pull_request',
  'merge_to_main',
  'manual_approval',
  'tag_release',
  'schedule',
] as const;

export type DeploymentTrigger = (typeof DEPLOYMENT_TRIGGERS)[number];

// =============================================================================
// Golden Path Types
// =============================================================================

/**
 * Standard development golden paths
 */
export const GOLDEN_PATH_TYPES = [
  'web-app-development',
  'api-development',
  'ai-worker-development',
  'database-migrations',
  'package-development',
  'testing',
] as const;

export type GoldenPathType = (typeof GOLDEN_PATH_TYPES)[number];

// =============================================================================
// CI/CD Pipeline Stages
// =============================================================================

/**
 * CI pipeline stages
 */
export const CI_STAGES = [
  'typecheck',
  'lint',
  'test',
  'build',
  'security-scan',
] as const;

export type CiStage = (typeof CI_STAGES)[number];

/**
 * CD pipeline stages
 */
export const CD_STAGES = [
  'deploy-preview',
  'e2e-tests',
  'deploy-staging',
  'deploy-production',
] as const;

export type CdStage = (typeof CD_STAGES)[number];

// =============================================================================
// Developer Onboarding Steps
// =============================================================================

/**
 * Standard developer onboarding steps
 */
export const ONBOARDING_STEPS = [
  'clone_repository',
  'install_dependencies',
  'setup_environment',
  'run_local_dev',
  'complete_first_task',
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

// =============================================================================
// Secrets Management Tools
// =============================================================================

/**
 * Supported secrets management tools
 */
export const SECRETS_TOOLS = [
  'HashiCorp Vault',
  'AWS Secrets Manager',
  'Azure Key Vault',
  'Doppler',
  'Infisical',
] as const;

export type SecretsTool = (typeof SECRETS_TOOLS)[number];

// =============================================================================
// KPI Met Status
// =============================================================================

/**
 * Whether a KPI target was met
 */
export const KPI_STATUSES = [true, false] as const;

export type KpiStatus = (typeof KPI_STATUSES)[number];
