import { describe, it, expect } from 'vitest';
import {
  selfServiceMetricsSchema,
  validateSelfServiceMetrics,
  safeValidateSelfServiceMetrics,
  goldenPathSchema,
  deploymentConfigSchema,
  kpiEntrySchema,
  idpStatusSchema,
  deploymentProviderSchema,
  deploymentTriggerSchema,
  goldenPathTypeSchema,
  ciStageSchema,
  cdStageSchema,
  onboardingStepSchema,
  secretsToolSchema,
} from '../platform-metrics';
import type { SelfServiceMetrics, GoldenPath, DeploymentConfig, KpiEntry } from '../platform-metrics';

describe('Platform Metrics Validators', () => {
  describe('Enum Schemas', () => {
    it('should validate IDP status values', () => {
      expect(idpStatusSchema.parse('operational')).toBe('operational');
      expect(idpStatusSchema.parse('degraded')).toBe('degraded');
      expect(idpStatusSchema.parse('offline')).toBe('offline');
      expect(() => idpStatusSchema.parse('invalid')).toThrow();
    });

    it('should validate deployment provider values', () => {
      expect(deploymentProviderSchema.parse('Vercel')).toBe('Vercel');
      expect(deploymentProviderSchema.parse('Railway')).toBe('Railway');
      expect(deploymentProviderSchema.parse('Easypanel')).toBe('Easypanel');
      expect(() => deploymentProviderSchema.parse('AWS')).toThrow();
    });

    it('should validate deployment trigger values', () => {
      expect(deploymentTriggerSchema.parse('pull_request')).toBe('pull_request');
      expect(deploymentTriggerSchema.parse('merge_to_main')).toBe('merge_to_main');
      expect(deploymentTriggerSchema.parse('manual_approval')).toBe('manual_approval');
      expect(() => deploymentTriggerSchema.parse('push')).toThrow();
    });

    it('should validate golden path type values', () => {
      expect(goldenPathTypeSchema.parse('web-app-development')).toBe('web-app-development');
      expect(goldenPathTypeSchema.parse('api-development')).toBe('api-development');
      expect(goldenPathTypeSchema.parse('database-migrations')).toBe('database-migrations');
      expect(() => goldenPathTypeSchema.parse('invalid-path')).toThrow();
    });

    it('should validate CI stage values', () => {
      expect(ciStageSchema.parse('typecheck')).toBe('typecheck');
      expect(ciStageSchema.parse('lint')).toBe('lint');
      expect(ciStageSchema.parse('test')).toBe('test');
      expect(ciStageSchema.parse('build')).toBe('build');
      expect(() => ciStageSchema.parse('deploy')).toThrow();
    });

    it('should validate CD stage values', () => {
      expect(cdStageSchema.parse('deploy-preview')).toBe('deploy-preview');
      expect(cdStageSchema.parse('e2e-tests')).toBe('e2e-tests');
      expect(cdStageSchema.parse('deploy-staging')).toBe('deploy-staging');
      expect(cdStageSchema.parse('deploy-production')).toBe('deploy-production');
      expect(() => cdStageSchema.parse('rollback')).toThrow();
    });

    it('should validate onboarding step values', () => {
      expect(onboardingStepSchema.parse('clone_repository')).toBe('clone_repository');
      expect(onboardingStepSchema.parse('install_dependencies')).toBe('install_dependencies');
      expect(onboardingStepSchema.parse('complete_first_task')).toBe('complete_first_task');
      expect(() => onboardingStepSchema.parse('invalid_step')).toThrow();
    });

    it('should validate secrets tool values', () => {
      expect(secretsToolSchema.parse('HashiCorp Vault')).toBe('HashiCorp Vault');
      expect(secretsToolSchema.parse('AWS Secrets Manager')).toBe('AWS Secrets Manager');
      expect(secretsToolSchema.parse('Doppler')).toBe('Doppler');
      expect(() => secretsToolSchema.parse('plain-text')).toThrow();
    });
  });

  describe('Component Schemas', () => {
    it('should validate golden path', () => {
      const validPath: GoldenPath = {
        name: 'web-app-development',
        description: 'Standard path for Next.js web applications',
        entry_point: 'pnpm --filter web dev',
        documentation: 'docs/engineering-playbook.md',
      };

      expect(goldenPathSchema.parse(validPath)).toEqual(validPath);
    });

    it('should reject invalid golden path', () => {
      expect(() =>
        goldenPathSchema.parse({
          name: 'invalid-path',
          description: 'Test',
          entry_point: 'cmd',
          documentation: 'doc.md',
        })
      ).toThrow();
    });

    it('should validate deployment config', () => {
      const validConfig: DeploymentConfig = {
        enabled: true,
        provider: 'Vercel',
        trigger: 'pull_request',
        average_deploy_time_seconds: 120,
      };

      expect(deploymentConfigSchema.parse(validConfig)).toEqual(validConfig);
    });

    it('should validate deployment config with optional requires_approval', () => {
      const configWithApproval: DeploymentConfig = {
        enabled: true,
        provider: 'Easypanel',
        trigger: 'manual_approval',
        average_deploy_time_seconds: 240,
        requires_approval: true,
      };

      expect(deploymentConfigSchema.parse(configWithApproval)).toEqual(configWithApproval);
    });

    it('should validate KPI entry', () => {
      const validKpi: KpiEntry = {
        target: '>95%',
        actual: '97.4%',
        met: true,
      };

      expect(kpiEntrySchema.parse(validKpi)).toEqual(validKpi);
    });

    it('should reject KPI with missing met field', () => {
      expect(() =>
        kpiEntrySchema.parse({
          target: '>95%',
          actual: '97.4%',
        })
      ).toThrow();
    });
  });

  describe('selfServiceMetricsSchema', () => {
    const validMetrics: SelfServiceMetrics = {
      generated_at: '2026-01-26T12:00:00Z',
      task_id: 'IFC-078',
      sprint: 18,
      platform_engineering_foundation: {
        internal_developer_platform: {
          status: 'operational',
          version: '1.0.0',
          capabilities: ['self-service-deploys', 'automated-testing'],
        },
        golden_paths: {
          defined: true,
          paths: [
            {
              name: 'web-app-development',
              description: 'Standard path',
              entry_point: 'pnpm dev',
              documentation: 'docs/README.md',
            },
          ],
        },
      },
      self_service_deploy_metrics: {
        enabled: true,
        deployment_types: {
          preview_deployments: {
            enabled: true,
            provider: 'Vercel',
            trigger: 'pull_request',
            average_deploy_time_seconds: 120,
          },
          staging_deployments: {
            enabled: true,
            provider: 'Railway',
            trigger: 'merge_to_main',
            average_deploy_time_seconds: 180,
          },
          production_deployments: {
            enabled: true,
            provider: 'Easypanel',
            trigger: 'manual_approval',
            average_deploy_time_seconds: 240,
            requires_approval: true,
          },
        },
        total_self_service_deploys: 156,
        successful_deploys: 152,
        failed_deploys: 4,
        success_rate_percent: 97.4,
        average_time_to_deploy_seconds: 145,
      },
      standardized_workflows: {
        ci_pipeline: {
          name: 'CI',
          file: '.github/workflows/ci.yml',
          stages: ['typecheck', 'lint', 'test', 'build'],
          average_duration_minutes: 8,
          pass_rate_percent: 94.2,
        },
        cd_pipeline: {
          name: 'CD',
          stages: ['deploy-preview', 'e2e-tests', 'deploy-staging', 'deploy-production'],
          average_duration_minutes: 12,
          pass_rate_percent: 91.8,
        },
        developer_onboarding: {
          name: 'Onboarding',
          steps: [
            'clone_repository',
            'install_dependencies',
            'setup_environment',
            'run_local_dev',
            'complete_first_task',
          ],
          average_time_to_first_commit_hours: 4,
          success_rate_percent: 100,
        },
      },
      turborepo_integration: {
        status: 'mature',
        cache_enabled: true,
        remote_cache_enabled: true,
        tasks_defined: 25,
        average_cached_build_time_seconds: 15,
        average_fresh_build_time_seconds: 180,
        cache_hit_rate_percent: 78.5,
      },
      environment_management: {
        local_development: {
          tool: 'Docker Compose',
          setup_time_minutes: 5,
          services: ['postgres', 'redis'],
        },
        secrets_management: {
          tool: 'HashiCorp Vault',
          environments: ['development', 'staging', 'production'],
          rotation_policy: 'quarterly',
        },
        configuration: {
          method: 'environment_variables',
          validation: 'zod_schemas',
          documentation: 'env.example',
        },
      },
      kpis: {
        self_service_deploy_success_rate: { target: '>95%', actual: '97.4%', met: true },
        time_to_first_deploy: { target: '<5 minutes', actual: '2.4 minutes', met: true },
        developer_onboarding_time: { target: '<8 hours', actual: '4 hours', met: true },
        ci_pipeline_pass_rate: { target: '>90%', actual: '94.2%', met: true },
        cache_hit_rate: { target: '>70%', actual: '78.5%', met: true },
      },
      validation: {
        command: 'pnpm run validate:platform-metrics',
        exit_code: 0,
        passed: true,
        validated_at: '2026-01-26T12:00:00Z',
      },
    };

    it('should validate complete metrics object', () => {
      const result = selfServiceMetricsSchema.safeParse(validMetrics);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.task_id).toBe('IFC-078');
      }
    });

    it('should reject invalid task_id format', () => {
      const invalid = { ...validMetrics, task_id: 'INVALID-078' };
      const result = selfServiceMetricsSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject invalid semver version', () => {
      const invalid = {
        ...validMetrics,
        platform_engineering_foundation: {
          ...validMetrics.platform_engineering_foundation,
          internal_developer_platform: {
            ...validMetrics.platform_engineering_foundation.internal_developer_platform,
            version: 'v1.0',
          },
        },
      };
      const result = selfServiceMetricsSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject success_rate_percent over 100', () => {
      const invalid = {
        ...validMetrics,
        self_service_deploy_metrics: {
          ...validMetrics.self_service_deploy_metrics,
          success_rate_percent: 150,
        },
      };
      const result = selfServiceMetricsSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject negative deploy counts', () => {
      const invalid = {
        ...validMetrics,
        self_service_deploy_metrics: {
          ...validMetrics.self_service_deploy_metrics,
          failed_deploys: -1,
        },
      };
      const result = selfServiceMetricsSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('Validation Functions', () => {
    const validData = {
      generated_at: '2026-01-26T12:00:00Z',
      task_id: 'IFC-078',
      sprint: 18,
      platform_engineering_foundation: {
        internal_developer_platform: {
          status: 'operational',
          version: '1.0.0',
          capabilities: ['self-service-deploys'],
        },
        golden_paths: {
          defined: true,
          paths: [
            {
              name: 'web-app-development',
              description: 'Test',
              entry_point: 'cmd',
              documentation: 'doc.md',
            },
          ],
        },
      },
      self_service_deploy_metrics: {
        enabled: true,
        deployment_types: {
          preview_deployments: {
            enabled: true,
            provider: 'Vercel',
            trigger: 'pull_request',
            average_deploy_time_seconds: 120,
          },
          staging_deployments: {
            enabled: true,
            provider: 'Railway',
            trigger: 'merge_to_main',
            average_deploy_time_seconds: 180,
          },
          production_deployments: {
            enabled: true,
            provider: 'Easypanel',
            trigger: 'manual_approval',
            average_deploy_time_seconds: 240,
          },
        },
        total_self_service_deploys: 100,
        successful_deploys: 95,
        failed_deploys: 5,
        success_rate_percent: 95,
        average_time_to_deploy_seconds: 150,
      },
      standardized_workflows: {
        ci_pipeline: {
          name: 'CI',
          stages: ['typecheck', 'lint', 'test', 'build'],
          average_duration_minutes: 8,
          pass_rate_percent: 90,
        },
        cd_pipeline: {
          name: 'CD',
          stages: ['deploy-preview', 'e2e-tests', 'deploy-staging', 'deploy-production'],
          average_duration_minutes: 12,
          pass_rate_percent: 90,
        },
        developer_onboarding: {
          name: 'Onboarding',
          steps: ['clone_repository', 'install_dependencies', 'setup_environment', 'run_local_dev', 'complete_first_task'],
          average_time_to_first_commit_hours: 4,
          success_rate_percent: 100,
        },
      },
      turborepo_integration: {
        status: 'mature',
        cache_enabled: true,
        remote_cache_enabled: true,
        tasks_defined: 25,
        average_cached_build_time_seconds: 15,
        average_fresh_build_time_seconds: 180,
        cache_hit_rate_percent: 75,
      },
      environment_management: {
        local_development: {
          tool: 'Docker',
          setup_time_minutes: 5,
          services: ['postgres'],
        },
        secrets_management: {
          tool: 'HashiCorp Vault',
          environments: ['dev'],
          rotation_policy: 'monthly',
        },
        configuration: {
          method: 'env',
          validation: 'zod',
          documentation: '.env.example',
        },
      },
      kpis: {
        self_service_deploy_success_rate: { target: '>90%', actual: '95%', met: true },
        time_to_first_deploy: { target: '<10 min', actual: '5 min', met: true },
        developer_onboarding_time: { target: '<1 day', actual: '4 hours', met: true },
        ci_pipeline_pass_rate: { target: '>85%', actual: '90%', met: true },
        cache_hit_rate: { target: '>70%', actual: '75%', met: true },
      },
      validation: {
        command: 'validate',
        exit_code: 0,
        passed: true,
        validated_at: '2026-01-26T12:00:00Z',
      },
    };

    it('validateSelfServiceMetrics should return typed data on valid input', () => {
      const result = validateSelfServiceMetrics(validData);
      expect(result.task_id).toBe('IFC-078');
    });

    it('validateSelfServiceMetrics should throw on invalid input', () => {
      expect(() => validateSelfServiceMetrics({ invalid: true })).toThrow();
    });

    it('safeValidateSelfServiceMetrics should return success object on valid input', () => {
      const result = safeValidateSelfServiceMetrics(validData);
      expect(result.success).toBe(true);
    });

    it('safeValidateSelfServiceMetrics should return error object on invalid input', () => {
      const result = safeValidateSelfServiceMetrics({ invalid: true });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });
  });
});
