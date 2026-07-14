'use client';

// Task Settings Content — PG-191
// PageHeader + section cards, dirty-state save/reset. Mirrors the PG-187
// report-settings orchestrator pattern.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { trpc } from '@/lib/trpc';
import { Card, ConfirmationDialog, toast } from '@intelliflow/ui';
import { PageHeader, type PageAction } from '@/components/shared/page-header';
import {
  taskSettingsSchema,
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

function parseServerSnapshot(data: unknown): TaskSettingsSnapshot {
  const parsed = taskSettingsSchema.safeParse(data);
  if (parsed.success) return parsed.data;
  return {
    dueDateOffsetDays: DEFAULT_TASK_SETTINGS.dueDateOffsetDays,
    reminderDefaults: DEFAULT_TASK_SETTINGS.reminderDefaults,
    taskTemplates: DEFAULT_TASK_SETTINGS.taskTemplates,
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

  // ─── Early returns ─────────────────────────────────────────────────────────
  if (authLoading || settingsQuery.isLoading) {
    return (
      <div className="w-full">
        <div className="mb-6">
          <div className="h-7 bg-muted animate-pulse rounded-md w-64 mb-2" />
          <div className="h-4 bg-muted animate-pulse rounded-md w-96" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
          <div className="lg:col-span-6 h-48 bg-muted animate-pulse rounded-md" />
          <div className="lg:col-span-6 h-48 bg-muted animate-pulse rounded-md" />
          <div className="lg:col-span-12 h-64 bg-muted animate-pulse rounded-md" />
        </div>
      </div>
    );
  }

  if (settingsQuery.error) {
    return (
      <div className="w-full">
        <Card className="p-6 text-center">
          <h2 className="text-lg font-semibold">Failed to load task settings</h2>
          <p className="text-sm text-muted-foreground mt-2">{settingsQuery.error.message}</p>
        </Card>
      </div>
    );
  }

  const actions: PageAction[] = [
    {
      label: 'Reset to Defaults',
      variant: 'secondary',
      onClick: () => setResetOpen(true),
      disabled: isSaving,
    },
    {
      label: isSaving ? 'Saving…' : 'Save Changes',
      variant: 'primary',
      onClick: handleSave,
      disabled: !canSave,
      loading: isSaving,
    },
  ];

  return (
    <div className="w-full">
      <PageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          { label: 'Tasks', href: '/tasks' },
          { label: 'Task Settings' },
        ]}
        title="Task Settings"
        description="Configure default due-date offset, reminder defaults, and task templates."
        actions={actions}
        className="mb-6"
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
        <DueDateOffsetSection value={dueDateOffsetDays} onChange={setDueDateOffsetDays} />
        <ReminderDefaultsSection value={reminderDefaults} onChange={setReminderDefaults} />
        <TaskTemplatesSection value={taskTemplates} onChange={setTaskTemplates} />
      </div>

      <ConfirmationDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset to Defaults"
        description="This will restore all task settings to their factory defaults. This action cannot be undone."
        confirmLabel="Reset"
        variant="destructive"
        onConfirm={handleReset}
      />
    </div>
  );
}
