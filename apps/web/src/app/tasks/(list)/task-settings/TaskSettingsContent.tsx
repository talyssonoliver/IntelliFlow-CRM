'use client';

// Task Settings Content — PG-191
// Task-specific state/validation over the shared ModuleSettingsShell, which
// owns the page chrome (skeleton / error / header actions / grid / reset dialog).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { trpc } from '@/lib/trpc';
import { toast } from '@intelliflow/ui';
import { ModuleSettingsShell } from '@/components/shared/module-settings-shell';
import {
  dueDateOffsetDaysSchema,
  reminderDefaultsSchema,
  taskTemplatesSchema,
  DEFAULT_TASK_SETTINGS,
  type ReminderDefaults,
  type TaskTemplateInput,
} from '@intelliflow/validators';
import { DueDateOffsetSection } from './components/DueDateOffsetSection';
import { ReminderDefaultsSection } from './components/ReminderDefaultsSection';
import { TaskTemplatesSection } from './components/TaskTemplatesSection';

interface TaskSettingsSnapshot {
  dueDateOffsetDays: number;
  reminderDefaults: ReminderDefaults;
  taskTemplates: TaskTemplateInput[];
}

/**
 * Parse each server field INDEPENDENTLY so one corrupt/out-of-range field never
 * wipes the others (a whole-object parse would fall a valid template list back
 * to [] just because, e.g., dueDateOffsetDays was out of range). Mirrors the
 * router's per-column normalizeRow philosophy.
 */
function parseServerSnapshot(data: unknown): TaskSettingsSnapshot {
  const record = (data ?? {}) as Record<string, unknown>;
  const offset = dueDateOffsetDaysSchema.safeParse(record.dueDateOffsetDays);
  const reminder = reminderDefaultsSchema.safeParse(record.reminderDefaults);
  const templates = taskTemplatesSchema.safeParse(record.taskTemplates);
  return {
    dueDateOffsetDays: offset.success ? offset.data : DEFAULT_TASK_SETTINGS.dueDateOffsetDays,
    reminderDefaults: reminder.success ? reminder.data : DEFAULT_TASK_SETTINGS.reminderDefaults,
    taskTemplates: templates.success ? templates.data : DEFAULT_TASK_SETTINGS.taskTemplates,
  };
}

export default function TaskSettingsContent() {
  const { isLoading: authLoading, isAuthenticated } = useRequireAuth();

  // ─── tRPC ──────────────────────────────────────────────────────────────────
  const utils = trpc.useUtils();
  const settingsQuery = trpc.taskSettings.get.useQuery(undefined, { enabled: isAuthenticated });
  const updateMutation = trpc.taskSettings.update.useMutation({
    onSuccess: () => utils.taskSettings.get.invalidate(),
  });
  const resetMutation = trpc.taskSettings.resetToDefaults.useMutation({
    onSuccess: () => utils.taskSettings.get.invalidate(),
  });

  // ─── Local state ───────────────────────────────────────────────────────────
  const [dueDateOffsetDays, setDueDateOffsetDays] = useState<number>(
    DEFAULT_TASK_SETTINGS.dueDateOffsetDays
  );
  const [reminderDefaults, setReminderDefaults] = useState<ReminderDefaults>(
    DEFAULT_TASK_SETTINGS.reminderDefaults
  );
  const [taskTemplates, setTaskTemplates] = useState<TaskTemplateInput[]>(
    DEFAULT_TASK_SETTINGS.taskTemplates
  );
  const [initialSnapshot, setInitialSnapshot] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);

  // ─── Sync server data → local state (with Zod parse) ──────────────────────
  useEffect(() => {
    if (!settingsQuery.data) return;
    const snap = parseServerSnapshot(settingsQuery.data);
    setDueDateOffsetDays(snap.dueDateOffsetDays);
    setReminderDefaults(snap.reminderDefaults);
    setTaskTemplates(snap.taskTemplates);
    setInitialSnapshot(JSON.stringify(snap));
  }, [settingsQuery.data]);

  const currentSnapshot = useMemo(
    () => JSON.stringify({ dueDateOffsetDays, reminderDefaults, taskTemplates }),
    [dueDateOffsetDays, reminderDefaults, taskTemplates]
  );
  const isDirty = initialSnapshot !== null && currentSnapshot !== initialSnapshot;

  const offsetInvalid =
    !Number.isInteger(dueDateOffsetDays) || dueDateOffsetDays < 0 || dueDateOffsetDays > 365;
  const reminderInvalid =
    reminderDefaults.enabled &&
    (!Number.isInteger(reminderDefaults.minutesBefore) || reminderDefaults.minutesBefore < 1);
  const hasInvalid = offsetInvalid || reminderInvalid;

  const isSaving = updateMutation.isPending || resetMutation.isPending;
  const canSave = isDirty && !isSaving && !hasInvalid;

  // ─── Handlers ──────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (hasInvalid) {
      toast({
        title: 'Cannot save',
        description: 'Fix the highlighted fields before saving.',
        variant: 'destructive',
      });
      return;
    }
    try {
      await updateMutation.mutateAsync({ dueDateOffsetDays, reminderDefaults, taskTemplates });
      toast({
        title: 'Settings saved',
        description: 'Task settings have been updated successfully.',
      });
    } catch (err) {
      toast({
        title: 'Save failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  }, [dueDateOffsetDays, hasInvalid, reminderDefaults, taskTemplates, updateMutation]);

  const handleReset = useCallback(async () => {
    try {
      await resetMutation.mutateAsync();
      toast({
        title: 'Reset to defaults',
        description: 'Task settings restored to factory defaults.',
      });
      setResetOpen(false);
    } catch (err) {
      toast({
        title: 'Reset failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  }, [resetMutation]);

  // ─── Render ────────────────────────────────────────────────────────────────
  // The chrome (skeleton / error card / header actions / section grid / reset
  // dialog) lives in ModuleSettingsShell; this component only supplies its
  // config + sections. See components/shared/module-settings-shell.tsx.
  return (
    <ModuleSettingsShell
      breadcrumbs={[
        { label: 'Dashboard', href: '/' },
        { label: 'Tasks', href: '/tasks' },
        { label: 'Task Settings' },
      ]}
      title="Task Settings"
      description="Configure default due-date offset, reminder defaults, and task templates."
      errorTitle="Failed to load task settings"
      isLoading={authLoading || settingsQuery.isLoading}
      errorMessage={settingsQuery.error?.message ?? null}
      isSaving={isSaving}
      canSave={canSave}
      onSave={handleSave}
      resetOpen={resetOpen}
      onResetOpenChange={setResetOpen}
      onResetConfirm={handleReset}
      resetDescription="This will restore all task settings to their factory defaults. This action cannot be undone."
    >
      <DueDateOffsetSection value={dueDateOffsetDays} onChange={setDueDateOffsetDays} />
      <ReminderDefaultsSection value={reminderDefaults} onChange={setReminderDefaults} />
      <TaskTemplatesSection value={taskTemplates} onChange={setTaskTemplates} />
    </ModuleSettingsShell>
  );
}
