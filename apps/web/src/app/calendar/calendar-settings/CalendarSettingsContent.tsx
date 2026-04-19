'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { trpc } from '@/lib/trpc';
import { toast } from '@intelliflow/ui';
import {
  ModuleSettingsLayout,
  type ModuleSettingsTab,
} from '@/components/settings/ModuleSettingsLayout';
import { DurationDefaultsTab, type DurationSettings } from './components/DurationDefaultsTab';
import { BufferRemindersTab, type BufferSettings } from './components/BufferRemindersTab';
import {
  CalendarIntegrationTab,
  type CalendarIntegrationSettings,
} from './components/CalendarIntegrationTab';

interface LocalSettings {
  duration: DurationSettings;
  buffer: BufferSettings;
  calendar: CalendarIntegrationSettings;
}

export default function CalendarSettingsContent() {
  const { isLoading: authLoading, isAuthenticated } = useRequireAuth();

  const settingsQuery = trpc.appointmentSettings.get.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const calendarsQuery = trpc.calendar.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const utils = trpc.useUtils();

  const updateMutation = trpc.appointmentSettings.update.useMutation({
    onSuccess: () => utils.appointmentSettings.get.invalidate(),
  });

  const resetMutation = trpc.appointmentSettings.resetToDefaults.useMutation({
    onSuccess: () => utils.appointmentSettings.get.invalidate(),
  });

  const [localSettings, setLocalSettings] = useState<LocalSettings | null>(null);

  useEffect(() => {
    if (settingsQuery.data) {
      const s = settingsQuery.data;
      setLocalSettings({
        duration: {
          defaultDurationMinutes: s.defaultDurationMinutes,
          minDurationMinutes: s.minDurationMinutes,
          maxDurationMinutes: s.maxDurationMinutes,
        },
        buffer: {
          defaultBufferBeforeMinutes: s.defaultBufferBeforeMinutes,
          defaultBufferAfterMinutes: s.defaultBufferAfterMinutes,
          defaultReminderMinutes: s.defaultReminderMinutes,
        },
        calendar: {
          primaryCalendarId: s.primaryCalendarId,
          syncExternalCalendars: s.syncExternalCalendars,
          defaultTimezone: s.defaultTimezone,
        },
      });
    }
  }, [settingsQuery.data]);

  const handleSave = useCallback(async () => {
    if (!localSettings) return;
    try {
      await updateMutation.mutateAsync({
        ...localSettings.duration,
        ...localSettings.buffer,
        ...localSettings.calendar,
      });
      toast({ title: 'Settings saved', description: 'Appointment settings have been updated.' });
    } catch (err) {
      toast({
        title: 'Error saving settings',
        description: err instanceof Error ? err.message : 'An unexpected error occurred',
        variant: 'destructive',
      });
    }
  }, [localSettings, updateMutation]);

  const handleReset = useCallback(async () => {
    try {
      await resetMutation.mutateAsync();
      toast({
        title: 'Settings reset',
        description: 'Appointment settings have been restored to defaults.',
      });
    } catch (err) {
      toast({
        title: 'Error resetting settings',
        description: err instanceof Error ? err.message : 'An unexpected error occurred',
        variant: 'destructive',
      });
    }
  }, [resetMutation]);

  if (authLoading || !isAuthenticated) return null;

  const availableCalendars = (calendarsQuery.data ?? []).map((c: { id: string; name: string }) => ({
    id: c.id,
    name: c.name,
  }));

  const tabs: ModuleSettingsTab[] = [
    {
      value: 'duration',
      label: 'Duration Defaults',
      content: localSettings ? (
        <DurationDefaultsTab
          settings={localSettings.duration}
          onSettingsChange={(duration) =>
            setLocalSettings((prev) => (prev ? { ...prev, duration } : null))
          }
        />
      ) : null,
    },
    {
      value: 'buffer',
      label: 'Buffer & Reminders',
      content: localSettings ? (
        <BufferRemindersTab
          settings={localSettings.buffer}
          onSettingsChange={(buffer) =>
            setLocalSettings((prev) => (prev ? { ...prev, buffer } : null))
          }
        />
      ) : null,
    },
    {
      value: 'calendar',
      label: 'Calendar Integration',
      content: localSettings ? (
        <CalendarIntegrationTab
          settings={localSettings.calendar}
          onSettingsChange={(calendar) =>
            setLocalSettings((prev) => (prev ? { ...prev, calendar } : null))
          }
          availableCalendars={availableCalendars}
        />
      ) : null,
    },
  ];

  return (
    <ModuleSettingsLayout
      title="Appointment Settings"
      description="Configure default durations, buffers, reminders, and calendar integrations."
      breadcrumbs={[{ label: 'Calendar', href: '/calendar' }, { label: 'Settings' }]}
      tabs={tabs}
      onSave={handleSave}
      onReset={handleReset}
      isSaving={updateMutation.isPending || resetMutation.isPending}
      lastUpdated={settingsQuery.data?.updatedAt ? new Date(settingsQuery.data.updatedAt) : null}
    />
  );
}
