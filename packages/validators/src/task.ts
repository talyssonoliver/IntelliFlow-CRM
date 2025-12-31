import { z } from 'zod';
import { idSchema, paginationSchema } from './common';
import { TASK_STATUSES, TASK_PRIORITIES } from '@intelliflow/domain';

// Re-export common schemas used by API routers
export { idSchema } from './common';

// Enums - derived from domain constants (single source of truth)
export const taskPrioritySchema = z.enum(TASK_PRIORITIES);
export const taskStatusSchema = z.enum(TASK_STATUSES);

export type TaskPriority = z.infer<typeof taskPrioritySchema>;
export type TaskStatus = z.infer<typeof taskStatusSchema>;

// Create Task Schema
export const createTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  dueDate: z.coerce.date().optional(),
  priority: taskPrioritySchema.default('MEDIUM'),
  status: taskStatusSchema.default('PENDING'),
  leadId: idSchema.optional(),
  contactId: idSchema.optional(),
  opportunityId: idSchema.optional(),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;

// Update Task Schema
export const updateTaskSchema = z.object({
  id: idSchema,
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  dueDate: z.coerce.date().optional().nullable(),
  priority: taskPrioritySchema.optional(),
  status: taskStatusSchema.optional(),
  leadId: idSchema.optional().nullable(),
  contactId: idSchema.optional().nullable(),
  opportunityId: idSchema.optional().nullable(),
});

export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

// Task Query Schema
export const taskQuerySchema = paginationSchema.extend({
  search: z.string().max(200).optional(),
  status: z.array(taskStatusSchema).optional(),
  priority: z.array(taskPrioritySchema).optional(),
  ownerId: idSchema.optional(),
  leadId: idSchema.optional(),
  contactId: idSchema.optional(),
  opportunityId: idSchema.optional(),
  dueDateFrom: z.coerce.date().optional(),
  dueDateTo: z.coerce.date().optional(),
  overdue: z.boolean().optional(),
});

export type TaskQueryInput = z.infer<typeof taskQuerySchema>;

// Task Response Schema
export const taskResponseSchema = z.object({
  id: idSchema,
  title: z.string(),
  description: z.string().nullable(),
  dueDate: z.coerce.date().nullable(),
  priority: taskPrioritySchema,
  status: taskStatusSchema,
  ownerId: idSchema,
  leadId: idSchema.nullable(),
  contactId: idSchema.nullable(),
  opportunityId: idSchema.nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  completedAt: z.coerce.date().nullable(),
});

export type TaskResponse = z.infer<typeof taskResponseSchema>;

// Task List Response Schema
export const taskListResponseSchema = z.object({
  tasks: z.array(taskResponseSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  hasMore: z.boolean(),
});

export type TaskListResponse = z.infer<typeof taskListResponseSchema>;

// Complete Task Schema
export const completeTaskSchema = z.object({
  taskId: idSchema,
  notes: z.string().max(1000).optional(),
});

export type CompleteTaskInput = z.infer<typeof completeTaskSchema>;
