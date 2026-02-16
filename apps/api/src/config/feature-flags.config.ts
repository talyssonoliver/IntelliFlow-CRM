/**
 * Feature Flags Configuration
 *
 * Defines all application feature flags with env-var overrides.
 * This is the central place to add/remove/configure flags.
 */

import type { FeatureFlagsConfig } from '@intelliflow/platform';

export function loadFeatureFlagsConfig(): FeatureFlagsConfig {
  return {
    version: 1,
    flags: [
      // AI features (controlled via env vars)
      { key: 'ai_scoring', enabled: process.env.ENABLE_AI_SCORING === 'true' },
      { key: 'ai_email_generation', enabled: process.env.ENABLE_AI_EMAIL === 'true' },
      { key: 'ai_workflows', enabled: process.env.ENABLE_AI_WORKFLOWS === 'true' },

      // Real-time features
      { key: 'subscriptions', enabled: process.env.ENABLE_SUBSCRIPTIONS === 'true' },

      // Core features (always enabled)
      { key: 'lead_management', enabled: true },
      { key: 'contact_management', enabled: true },
      { key: 'account_management', enabled: true },
      { key: 'opportunity_management', enabled: true },
      { key: 'task_management', enabled: true },

      // Advanced features (disabled until implemented)
      { key: 'analytics', enabled: false },
      { key: 'reporting', enabled: false },
      { key: 'custom_dashboards', enabled: false },
      { key: 'api_integrations', enabled: false },
      { key: 'notifications', enabled: false },
    ],
  };
}

/**
 * Maps flag keys to the camelCase property names used by system.features.
 * Keeps the public API shape stable while flags use snake_case internally.
 */
export const FLAG_KEY_TO_FEATURE: Record<string, string> = {
  ai_scoring: 'aiScoring',
  ai_email_generation: 'aiEmailGeneration',
  ai_workflows: 'aiWorkflows',
  subscriptions: 'subscriptions',
  lead_management: 'leadManagement',
  contact_management: 'contactManagement',
  account_management: 'accountManagement',
  opportunity_management: 'opportunityManagement',
  task_management: 'taskManagement',
  analytics: 'analytics',
  reporting: 'reporting',
  custom_dashboards: 'customDashboards',
  api_integrations: 'apiIntegrations',
  notifications: 'notifications',
};
