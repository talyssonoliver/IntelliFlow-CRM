import { z } from 'zod';
import { idSchema, paginationSchema } from './common';
import { CASE_STATUSES, CASE_PRIORITIES, CASE_TASK_STATUSES } from '@intelliflow/domain';
import { timezoneSchema } from './user';

// Re-export common schemas used by API routers
export { idSchema } from './common';

// Enums - derived from domain constants (single source of truth)
export const caseStatusSchema = z.enum(CASE_STATUSES);
export const casePrioritySchema = z.enum(CASE_PRIORITIES);
export const caseTaskStatusSchema = z.enum(CASE_TASK_STATUSES);

export type CaseStatus = z.infer<typeof caseStatusSchema>;
export type CasePriority = z.infer<typeof casePrioritySchema>;
export type CaseTaskStatus = z.infer<typeof caseTaskStatusSchema>;

/** A real calendar date, `YYYY-MM-DD` (rejects 2026-02-31). */
const calendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a YYYY-MM-DD date')
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }, 'Not a real calendar date');

// Create Case Schema
export const createCaseSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(5000).optional(),
  // PG-204: no default — a blank priority lets the case type, then the module default, apply.
  priority: casePrioritySchema.optional(),
  deadline: z.coerce.date().optional(),
  // PG-204: a date picked in the form. The API stores the end of that day in the case
  // timezone; converting it in the browser (new Date('YYYY-MM-DD')) gives UTC midnight.
  deadlineDate: calendarDateSchema.optional(),
  timezone: timezoneSchema.optional(),
  jurisdiction: z.string().max(100).optional(),
  clientId: idSchema,
  assignedTo: idSchema.optional(),
  caseTypeId: idSchema.optional(),
});

export type CreateCaseInput = z.infer<typeof createCaseSchema>;

// Update Case Schema
export const updateCaseSchema = z.object({
  id: idSchema,
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(5000).optional(),
  priority: casePrioritySchema.optional(),
  deadline: z.coerce.date().optional().nullable(),
  timezone: timezoneSchema.optional().nullable(),
  jurisdiction: z.string().max(100).optional().nullable(),
  assignedTo: idSchema.optional(),
});

export type UpdateCaseInput = z.infer<typeof updateCaseSchema>;

// Case Query Schema
export const caseQuerySchema = paginationSchema.extend({
  search: z.string().max(200).optional(),
  status: z.array(caseStatusSchema).optional(),
  priority: z.array(casePrioritySchema).optional(),
  clientId: idSchema.optional(),
  assignedTo: idSchema.optional(),
  deadlineFrom: z.coerce.date().optional(),
  deadlineTo: z.coerce.date().optional(),
  overdue: z.boolean().optional(),
});

export type CaseQueryInput = z.infer<typeof caseQuerySchema>;

// Change Status Schema
export const changeCaseStatusSchema = z.object({
  caseId: idSchema,
  status: caseStatusSchema,
});

export type ChangeCaseStatusInput = z.infer<typeof changeCaseStatusSchema>;

// Close Case Schema
export const closeCaseSchema = z.object({
  caseId: idSchema,
  resolution: z.string().min(1).max(2000),
});

export type CloseCaseInput = z.infer<typeof closeCaseSchema>;

// Update Deadline Schema
export const updateDeadlineSchema = z.object({
  caseId: idSchema,
  deadline: z.coerce.date(),
});

export type UpdateDeadlineInput = z.infer<typeof updateDeadlineSchema>;

// Add Task Schema
export const addCaseTaskSchema = z.object({
  caseId: idSchema,
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  dueDate: z.coerce.date().optional(),
  assignee: idSchema.optional(),
});

export type AddCaseTaskInput = z.infer<typeof addCaseTaskSchema>;

// Remove Task Schema
export const removeCaseTaskSchema = z.object({
  caseId: idSchema,
  taskId: idSchema,
});

export type RemoveCaseTaskInput = z.infer<typeof removeCaseTaskSchema>;

// Complete Task Schema
export const completeCaseTaskSchema = z.object({
  caseId: idSchema,
  taskId: idSchema,
});

export type CompleteCaseTaskInput = z.infer<typeof completeCaseTaskSchema>;

// Case Task Response Schema
export const caseTaskResponseSchema = z.object({
  id: idSchema,
  title: z.string(),
  description: z.string().nullable(),
  dueDate: z.coerce.date().nullable(),
  status: caseTaskStatusSchema,
  assignee: idSchema.nullable(),
  isOverdue: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  completedAt: z.coerce.date().nullable(),
});

export type CaseTaskResponse = z.infer<typeof caseTaskResponseSchema>;

// Case Response Schema
export const caseResponseSchema = z.object({
  id: idSchema,
  title: z.string(),
  description: z.string().nullable(),
  status: caseStatusSchema,
  priority: casePrioritySchema,
  deadline: z.coerce.date().nullable(),
  timezone: z.string().nullable(),
  jurisdiction: z.string().nullable(),
  clientId: idSchema,
  assignedTo: idSchema,
  tasks: z.array(caseTaskResponseSchema),
  taskProgress: z.number().int().min(0).max(100),
  pendingTaskCount: z.number().int().nonnegative(),
  completedTaskCount: z.number().int().nonnegative(),
  isOverdue: z.boolean(),
  resolution: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  closedAt: z.coerce.date().nullable(),
});

export type CaseResponse = z.infer<typeof caseResponseSchema>;

// Case List Response Schema
export const caseListResponseSchema = z.object({
  cases: z.array(caseResponseSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  hasMore: z.boolean(),
});

export type CaseListResponse = z.infer<typeof caseListResponseSchema>;

// Case Statistics Schema
export const caseStatisticsSchema = z.object({
  total: z.number().int().nonnegative(),
  byStatus: z.record(caseStatusSchema, z.number().int().nonnegative()),
  byPriority: z.record(casePrioritySchema, z.number().int().nonnegative()),
  overdue: z.number().int().nonnegative(),
  averageTaskCompletion: z.number().min(0).max(100),
  closedThisMonth: z.number().int().nonnegative(),
});

export type CaseStatistics = z.infer<typeof caseStatisticsSchema>;
