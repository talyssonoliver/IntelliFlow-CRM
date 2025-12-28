import { z } from 'zod';
import { idSchema, paginationSchema } from './common';

// Re-export common schemas used by API routers
export { idSchema } from './common';

// Enums
export const caseStatusSchema = z.enum(['OPEN', 'IN_PROGRESS', 'ON_HOLD', 'CLOSED', 'CANCELLED']);
export const casePrioritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);
export const caseTaskStatusSchema = z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']);

export type CaseStatus = z.infer<typeof caseStatusSchema>;
export type CasePriority = z.infer<typeof casePrioritySchema>;
export type CaseTaskStatus = z.infer<typeof caseTaskStatusSchema>;

// Create Case Schema
export const createCaseSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(5000).optional(),
  priority: casePrioritySchema.default('MEDIUM'),
  deadline: z.coerce.date().optional(),
  clientId: idSchema,
  assignedTo: idSchema.optional(),
});

export type CreateCaseInput = z.infer<typeof createCaseSchema>;

// Update Case Schema
export const updateCaseSchema = z.object({
  id: idSchema,
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(5000).optional(),
  priority: casePrioritySchema.optional(),
  deadline: z.coerce.date().optional().nullable(),
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
