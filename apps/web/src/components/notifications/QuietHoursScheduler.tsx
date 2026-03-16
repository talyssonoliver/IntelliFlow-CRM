'use client';

import { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import {
  Card,
  CardHeader,
  CardContent,
  Switch,
  Input,
  Label,
  Button,
  Skeleton,
  toast,
} from '@intelliflow/ui';
import { TimezoneSelector } from '@/components/settings/TimezoneSelector';

interface QuietHoursSchedulerProps {
  className?: string;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function QuietHoursScheduler({ className }: QuietHoursSchedulerProps) {
  const { data, isLoading, isError, refetch } = trpc.notifications.getPreferences.useQuery();
  const utils = trpc.useUtils();

  const mutation = trpc.notifications.updatePreferences.useMutation({
    onSuccess: () => {
      utils.notifications.getPreferences.invalidate();
      toast({ title: 'Quiet hours updated', description: 'Your quiet hours schedule has been saved.' });
    },
    onError: (err: { message: string }) => {
      toast({ title: 'Failed to save', description: err.message, variant: 'destructive' });
    },
  });

  const [quietHours, setQuietHours] = useState({
    enabled: true,
    start: '22:00',
    end: '08:00',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    daysOfWeek: [1, 2, 3, 4, 5] as number[],
  });

  useEffect(() => {
    if (data?.quietHours) {
      setQuietHours({
        enabled: data.quietHours.enabled,
        start: data.quietHours.start,
        end: data.quietHours.end,
        timezone: data.quietHours.timezone,
        daysOfWeek: data.quietHours.daysOfWeek,
      });
    }
  }, [data]);

  if (isLoading) {
    return (
      <div className={className} data-testid="skeleton">
        <div className="space-y-4">
          <Skeleton className="h-16 w-full animate-pulse" />
          <Skeleton className="h-32 w-full animate-pulse" />
          <Skeleton className="h-16 w-full animate-pulse" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className={className}>
        <div className="text-center py-8">
          <p className="text-destructive mb-4">Failed to load quiet hours preferences</p>
          <Button variant="outline" onClick={() => refetch()} aria-label="Retry">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const toggleDay = (dayIndex: number) => {
    setQuietHours((prev) => ({
      ...prev,
      daysOfWeek: prev.daysOfWeek.includes(dayIndex)
        ? prev.daysOfWeek.filter((d) => d !== dayIndex)
        : [...prev.daysOfWeek, dayIndex],
    }));
  };

  const handleSave = () => {
    mutation.mutate({ quietHours });
  };

  return (
    <div className={className}>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <h3 className="font-semibold">Quiet Hours</h3>
            <p className="text-sm text-muted-foreground">
              Mute notifications during specific hours
            </p>
          </div>
          <Switch
            checked={quietHours.enabled}
            onCheckedChange={(checked) => setQuietHours((prev) => ({ ...prev, enabled: checked }))}
            aria-label="Quiet hours"
          />
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Time range */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Label htmlFor="quiet-start">Quiet hours start</Label>
              <Input
                id="quiet-start"
                type="time"
                value={quietHours.start}
                onChange={(e) => setQuietHours((prev) => ({ ...prev, start: e.target.value }))}
                disabled={!quietHours.enabled}
                className="w-32"
                aria-label="Quiet hours start"
              />
            </div>
            <span className="text-sm text-muted-foreground">to</span>
            <div className="flex items-center gap-2">
              <Label htmlFor="quiet-end">Quiet hours end</Label>
              <Input
                id="quiet-end"
                type="time"
                value={quietHours.end}
                onChange={(e) => setQuietHours((prev) => ({ ...prev, end: e.target.value }))}
                disabled={!quietHours.enabled}
                className="w-32"
                aria-label="Quiet hours end"
              />
            </div>
          </div>

          {/* Day selector */}
          <div className="space-y-2">
            <Label>Active Days</Label>
            <div className="flex gap-2">
              {DAY_LABELS.map((label, index) => (
                <Button
                  key={label}
                  variant={quietHours.daysOfWeek.includes(index) ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => toggleDay(index)}
                  disabled={!quietHours.enabled}
                  aria-pressed={quietHours.daysOfWeek.includes(index)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>

          {/* Timezone */}
          <div className="space-y-1">
            <Label htmlFor="timezone">Timezone</Label>
            <TimezoneSelector
              value={quietHours.timezone}
              onChange={(val) => setQuietHours((prev) => ({ ...prev, timezone: val }))}
              disabled={!quietHours.enabled}
            />
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 flex justify-end">
        <Button onClick={handleSave} disabled={mutation.isPending}>
          {mutation.isPending ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}
