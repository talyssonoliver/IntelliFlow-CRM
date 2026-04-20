// IntelliFlow CRM - Report Settings Validators (PG-187)
// Zod schemas for /analytics/report-settings page

import { z } from 'zod';

export const defaultRangeSchema = z.enum(['7d', '14d', '30d', '90d']);
export type DefaultRange = z.infer<typeof defaultRangeSchema>;

export const currencyCodeSchema = z
  .string()
  .length(3)
  .regex(/^[A-Z]{3}$/, 'Must be a 3-letter ISO 4217 currency code');
export type CurrencyCode = z.infer<typeof currencyCodeSchema>;

export const scheduledDeliveryFrequencySchema = z.enum(['daily', 'weekly', 'monthly']);
export type ScheduledDeliveryFrequency = z.infer<typeof scheduledDeliveryFrequencySchema>;

export const scheduledDeliveryFormatSchema = z.enum(['pdf', 'csv', 'excel']);
export type ScheduledDeliveryFormat = z.infer<typeof scheduledDeliveryFormatSchema>;

export const scheduledDeliverySchema = z
  .object({
    enabled: z.boolean().default(false),
    frequency: scheduledDeliveryFrequencySchema.default('weekly'),
    dayOfWeek: z.number().int().min(0).max(6).optional(),
    time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Must be HH:MM (24-hour) format')
      .default('09:00'),
    recipients: z.array(z.string().email()).default([]),
    format: scheduledDeliveryFormatSchema.default('pdf'),
  })
  .superRefine((val, ctx) => {
    if (val.enabled && val.recipients.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['recipients'],
        message: 'At least one recipient is required when scheduled delivery is enabled.',
      });
    }
  });
export type ScheduledDelivery = z.infer<typeof scheduledDeliverySchema>;

export const reportSettingsSchema = z.object({
  defaultRange: defaultRangeSchema,
  currency: currencyCodeSchema,
  scheduledDelivery: scheduledDeliverySchema,
});
export type ReportSettingsInput = z.infer<typeof reportSettingsSchema>;

export const updateReportSettingsSchema = z.object({
  defaultRange: defaultRangeSchema.optional(),
  currency: currencyCodeSchema.optional(),
  scheduledDelivery: scheduledDeliverySchema.optional(),
});
export type UpdateReportSettingsInput = z.infer<typeof updateReportSettingsSchema>;

export const DEFAULT_REPORT_SETTINGS: ReportSettingsInput = {
  defaultRange: '30d',
  currency: 'USD',
  scheduledDelivery: {
    enabled: false,
    frequency: 'weekly',
    dayOfWeek: 1,
    time: '09:00',
    recipients: [],
    format: 'pdf',
  },
};
