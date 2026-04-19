import { z } from 'zod';
import { casePrioritySchema } from './case';

export const caseSettingsSchema = z
  .object({
    casePrefix: z
      .string()
      .min(1, 'Case prefix is required')
      .max(20, 'Case prefix must be 20 characters or fewer')
      .regex(/^[A-Z0-9-]+$/, 'Only uppercase letters, digits, and hyphens are allowed'),
    defaultPriority: casePrioritySchema,
    autoAssignEnabled: z.boolean(),
    autoAssignUserId: z.string().cuid().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.autoAssignEnabled && !data.autoAssignUserId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A user must be selected when auto-assign is enabled',
        path: ['autoAssignUserId'],
      });
    }
  });

export type CaseSettingsInput = z.infer<typeof caseSettingsSchema>;
export const updateCaseSettingsSchema = caseSettingsSchema;
export type UpdateCaseSettingsInput = z.infer<typeof updateCaseSettingsSchema>;
