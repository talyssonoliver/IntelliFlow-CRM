/**
 * SLA Policy Validators - PG-173
 *
 * Zod schemas for SLA policy CRUD operations.
 */

import { z } from 'zod';

const positiveMinutes = z.number().int().positive('Must be a positive number');

export const createSlaPolicySchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
  criticalResponseMinutes: positiveMinutes,
  highResponseMinutes: positiveMinutes,
  mediumResponseMinutes: positiveMinutes,
  lowResponseMinutes: positiveMinutes,
  criticalResolutionMinutes: positiveMinutes,
  highResolutionMinutes: positiveMinutes,
  mediumResolutionMinutes: positiveMinutes,
  lowResolutionMinutes: positiveMinutes,
  warningThresholdPercent: z.number().int().min(1).max(100).default(25),
  isDefault: z.boolean().default(false),
});
export type CreateSlaPolicyInput = z.infer<typeof createSlaPolicySchema>;

export const updateSlaPolicySchema = createSlaPolicySchema.partial().extend({
  id: z.string().min(1),
  isActive: z.boolean().optional(),
});
export type UpdateSlaPolicyInput = z.infer<typeof updateSlaPolicySchema>;
