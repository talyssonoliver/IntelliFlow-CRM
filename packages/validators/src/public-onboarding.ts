import { z } from 'zod';

export const tourStepSchema = z.object({
  id: z.string().min(1),
  targetSelector: z.string().min(1),
  title: z.string().min(1).max(60),
  description: z.string().min(1).max(240),
  placement: z.enum(['top', 'bottom', 'left', 'right', 'center']).optional(),
  cta: z
    .object({
      label: z.string().min(1).max(40),
      href: z.string().min(1).optional(),
    })
    .optional(),
});

export type TourStep = z.infer<typeof tourStepSchema>;

export const tourConfigSchema = z.object({
  id: z.string().min(1),
  route: z.string().regex(/^\//, 'Route must start with /'),
  steps: z.array(tourStepSchema).min(1).max(6),
});

export type TourConfig = z.infer<typeof tourConfigSchema>;

export const onboardingConfigSchema = z.object({
  tours: z.array(tourConfigSchema).min(1),
});

export type OnboardingConfig = z.infer<typeof onboardingConfigSchema>;

export const publicFeedbackInputSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
  email: z.string().email().max(254).optional(),
  source: z.string().min(1).max(200),
  userAgent: z.string().max(500).optional(),
  __honeypot: z.literal('').optional(),
});

export type PublicFeedbackInput = z.infer<typeof publicFeedbackInputSchema>;
