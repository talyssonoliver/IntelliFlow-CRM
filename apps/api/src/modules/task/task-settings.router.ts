/**
 * Task Settings Router - PG-191
 *
 * tRPC router for the /tasks/task-settings page.
 * Provides: get, update, resetToDefaults for per-tenant task defaults
 * (dueDateOffsetDays, reminderDefaults, taskTemplates).
 *
 * Follows the direct-Prisma singleton pattern established by
 * lead-settings.router.ts (PG-178) / report-settings.router.ts (PG-187).
 * Upsert-by-@unique(tenantId) is atomic, so concurrent first-page loads cannot
 * P2002-race. No container.ts wiring — settings routers use ctx.prismaWithTenant
 * directly.
 */

import type { Prisma, TaskSettings } from '@intelliflow/db';
import { createTRPCRouter, tenantProcedure } from '../../trpc';
import {
  updateTaskSettingsSchema,
  reminderDefaultsSchema,
  taskTemplatesSchema,
  DEFAULT_TASK_SETTINGS,
  type ReminderDefaults,
  type TaskTemplatesInput,
} from '@intelliflow/validators';

/**
 * Parse the Prisma Json columns (reminderDefaults, taskTemplates) through Zod.
 * Corrupt/hand-edited DB rows fall back to the factory defaults so the page
 * never receives an invalid shape.
 */
function normalizeRow(row: TaskSettings): TaskSettings & {
  reminderDefaults: ReminderDefaults;
  taskTemplates: TaskTemplatesInput;
} {
  const reminder = reminderDefaultsSchema.safeParse(row.reminderDefaults);
  const templates = taskTemplatesSchema.safeParse(row.taskTemplates);
  return {
    ...row,
    reminderDefaults: reminder.success ? reminder.data : DEFAULT_TASK_SETTINGS.reminderDefaults,
    taskTemplates: templates.success ? templates.data : DEFAULT_TASK_SETTINGS.taskTemplates,
  };
}

const createDefaults = () => ({
  dueDateOffsetDays: DEFAULT_TASK_SETTINGS.dueDateOffsetDays,
  reminderDefaults: DEFAULT_TASK_SETTINGS.reminderDefaults as unknown as Prisma.InputJsonValue,
  taskTemplates: DEFAULT_TASK_SETTINGS.taskTemplates as unknown as Prisma.InputJsonValue,
});

export const taskSettingsRouter = createTRPCRouter({
  /**
   * Get task settings for the current tenant.
   * Upserts the default row on first access (never returns null).
   */
  get: tenantProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    const row = await ctx.prismaWithTenant.taskSettings.upsert({
      where: { tenantId },
      create: { tenantId, ...createDefaults() },
      update: {},
    });
    return normalizeRow(row);
  }),

  /**
   * Update task settings (partial update of any subset of fields).
   * Zod superRefines (reminder lead-time, unique template names) enforce
   * invariants at the router boundary.
   */
  update: tenantProcedure.input(updateTaskSettingsSchema).mutation(async ({ ctx, input }) => {
    const tenantId = ctx.tenant.tenantId;
    const { dueDateOffsetDays, reminderDefaults, taskTemplates } = input;

    const row = await ctx.prismaWithTenant.taskSettings.upsert({
      where: { tenantId },
      create: {
        tenantId,
        dueDateOffsetDays: dueDateOffsetDays ?? DEFAULT_TASK_SETTINGS.dueDateOffsetDays,
        reminderDefaults: (reminderDefaults ??
          DEFAULT_TASK_SETTINGS.reminderDefaults) as unknown as Prisma.InputJsonValue,
        taskTemplates: (taskTemplates ??
          DEFAULT_TASK_SETTINGS.taskTemplates) as unknown as Prisma.InputJsonValue,
      },
      update: {
        ...(dueDateOffsetDays !== undefined && { dueDateOffsetDays }),
        ...(reminderDefaults !== undefined && {
          reminderDefaults: reminderDefaults as unknown as Prisma.InputJsonValue,
        }),
        ...(taskTemplates !== undefined && {
          taskTemplates: taskTemplates as unknown as Prisma.InputJsonValue,
        }),
      },
    });
    return normalizeRow(row);
  }),

  /**
   * Reset task settings to factory defaults.
   */
  resetToDefaults: tenantProcedure.mutation(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    const row = await ctx.prismaWithTenant.taskSettings.upsert({
      where: { tenantId },
      create: { tenantId, ...createDefaults() },
      update: { ...createDefaults() },
    });
    return normalizeRow(row);
  }),
});
