'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
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

function mapSettings(s: {
  defaultDurationMinutes: number;
  minDurationMinutes: number;
  maxDurationMinutes: number;
  defaultBufferBeforeMinutes: number;
  defaultBufferAfterMinutes: number;
  defaultReminderMinutes: number | null;
  primaryCalendarId: string | null;
  syncExternalCalendars: boolean;
  defaultTimezone: string;
}): LocalSettings {
  return {
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
  };
}

function normalize(s: LocalSettings): string {
  // Stable serialization for dirty-state comparison. Coerces undefined/''
  // to null on nullable fields so empty-input round-trips do not produce
  // false positives.
  return JSON.stringify({
    duration: s.duration,
    buffer: {
      ...s.buffer,
      defaultReminderMinutes: s.buffer.defaultReminderMinutes ?? null,
    },
    calendar: s.calendar,
  });
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
    onSuccess: (data) => {
      utils.appointmentSettings.get.invalidate();
      setInitialSettings(mapSettings(data));
      setLocalSettings(mapSettings(data));
    },
  });

  const resetMutation = trpc.appointmentSettings.resetToDefaults.useMutation({
    onSuccess: (data) => {
      utils.appointmentSettings.get.invalidate();
      setInitialSettings(mapSettings(data));
      setLocalSettings(mapSettings(data));
    },
  });

  const [localSettings, setLocalSettings] = useState<LocalSettings | null>(null);
  const [initialSettings, setInitialSettings] = useState<LocalSettings | null>(null);

  useEffect(() => {
    if (settingsQuery.data) {
      const mapped = mapSettings(settingsQuery.data);
      setLocalSettings(mapped);
      setInitialSettings(mapped);
    }
  }, [settingsQuery.data]);

  const isDirty = useMemo(() => {
    if (!localSettings || !initialSettings) return false;
    return normalize(localSettings) !== normalize(initialSettings);
  }, [localSettings, initialSettings]);

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
      isDirty={isDirty}
      lastUpdated={settingsQuery.data?.updatedAt ? new Date(settingsQuery.data.updatedAt) : null}
    />
  );
}
