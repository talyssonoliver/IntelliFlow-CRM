/**
 * Public Tour Config — PG-126
 *
 * Inlined TypeScript copy of `artifacts/misc/onboarding-config.json` for the
 * public marketing tour. Keeping the source of truth as JSON (the artifact
 * path referenced by Sprint_plan.csv) AND an inlined TS module gives us:
 *   - A JSON artifact the build + governance tooling can read.
 *   - A statically-typed import path (@/lib/public/tour-config) usable from
 *     client components without juggling `../../../artifacts/...` paths or
 *     a runtime fetch.
 *
 * The `onboarding-config.test` inside `public-onboarding.test.ts` asserts
 * both sources describe the same shape (validated by onboardingConfigSchema).
 */
import { onboardingConfigSchema } from '@intelliflow/validators';
import type { OnboardingConfig, TourConfig } from '@intelliflow/validators';

const RAW_CONFIG: OnboardingConfig = {
  tours: [
    {
      id: 'features-v1',
      route: '/features',
      steps: [
        {
          id: 'hero',
          targetSelector: '[data-tour="hero"]',
          title: 'Welcome to Aurora',
          description:
            "Let's walk through four things Aurora does for your team. Use Next or Enter to continue; Esc closes the tour.",
          placement: 'bottom',
        },
        {
          id: 'ai-scoring',
          targetSelector: '[data-tour="ai-lead-scoring"]',
          title: 'AI Lead Scoring',
          description:
            'Agents score every lead and show the reasons behind each score, so your team works the hottest leads first.',
          placement: 'right',
        },
        {
          id: 'automation',
          targetSelector: '[data-tour="workflow-automation"]',
          title: 'Workflow Automation',
          description:
            'Build multi-step workflows, and extend the builder with your own node and action types.',
          placement: 'left',
        },
        {
          id: 'analytics',
          targetSelector: '[data-tour="pipeline-analytics"]',
          title: 'Pipeline and forecast',
          description:
            'The deal board, the list and the forecast are the same pipeline, with stalled deals flagged.',
          placement: 'top',
          cta: {
            label: 'Start free trial',
            href: '/signup',
          },
        },
      ],
    },
  ],
};

// Validate at module load — throws if the embedded config drifts out of shape.
export const ONBOARDING_CONFIG: OnboardingConfig = onboardingConfigSchema.parse(RAW_CONFIG);

export const FEATURES_TOUR_CONFIG: TourConfig = ONBOARDING_CONFIG.tours.find(
  (t) => t.id === 'features-v1'
)!;
