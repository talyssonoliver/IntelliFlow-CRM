// IntelliFlow CRM - Report Template Validators (PG-200)
// Zod schemas for /analytics/report-templates page

import { z } from 'zod';
import { defaultRangeSchema } from './report-settings';

export const chartTypeSchema = z.enum(['table', 'bar', 'line', 'pie', 'area']);
export type ChartType = z.infer<typeof chartTypeSchema>;

export const sharingScopeSchema = z.enum(['private', 'team', 'tenant']);
export type SharingScope = z.infer<typeof sharingScopeSchema>;

export const createReportTemplateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(500).optional(),
  selectedColumns: z.array(z.string().trim().min(1)).min(1),
  // No .default() here — defaults are applied in the router to avoid TS2589
  // deep type instantiation through tRPC + Zod v4 generics.
  chartType: chartTypeSchema.optional(),
  defaultPeriod: defaultRangeSchema.optional(),
  sharingScope: sharingScopeSchema.optional(),
  filterSet: z.record(z.string(), z.unknown()).optional(),
});
export type CreateReportTemplateInput = z.infer<typeof createReportTemplateSchema>;

// Defined independently (not via .partial().extend()) to avoid TS2589 deep
// type instantiation when inferred through tRPC + Zod v4 defaults.
export const updateReportTemplateSchema = z.object({
  id: z.string().cuid(),
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  selectedColumns: z.array(z.string().trim().min(1)).min(1).optional(),
  chartType: chartTypeSchema.optional(),
  defaultPeriod: defaultRangeSchema.optional(),
  sharingScope: sharingScopeSchema.optional(),
  filterSet: z.record(z.string(), z.unknown()).optional(),
});
export type UpdateReportTemplateInput = z.infer<typeof updateReportTemplateSchema>;

export const deleteReportTemplateSchema = z.object({
  id: z.string().cuid(),
});
export type DeleteReportTemplateInput = z.infer<typeof deleteReportTemplateSchema>;

export const getReportTemplateSchema = z.object({
  id: z.string().cuid(),
});
export type GetReportTemplateInput = z.infer<typeof getReportTemplateSchema>;

/**
 * Typed view of a ReportTemplate row returned to the client.
 * Replaces Prisma's recursive JsonValue fields with explicit safe types
 * to avoid TS2589 deep type instantiation through tRPC generics.
 */
export interface ReportTemplateView {
  id: string;
  tenantId: string;
  createdBy: string;
  name: string;
  description: string | null;
  filterSet: Record<string, unknown>;
  selectedColumns: string[];
  chartType: string;
  defaultPeriod: string;
  sharingScope: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}
