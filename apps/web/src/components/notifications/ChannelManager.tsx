'use client';

import { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { NOTIFICATION_CHANNELS } from '@intelliflow/domain';
import {
  Card,
  CardHeader,
  CardContent,
  Switch,
  Input,
  Label,
  Button,
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
  Skeleton,
  StatusBadge,
  toast,
} from '@intelliflow/ui';

interface ChannelManagerProps {
  className?: string;
}

const CHANNEL_META: Record<string, { label: string; icon: string; description: string; badge?: string }> = {
  in_app: { label: 'In-App', icon: 'notifications', description: 'Notifications shown within the application' },
  email: { label: 'Email', icon: 'mail', description: 'Email notifications and digest' },
  sms: { label: 'SMS', icon: 'message', description: 'Text message notifications', badge: 'Requires SMS provider configuration' },
  push: { label: 'Push', icon: 'smartphone', description: 'Push notifications to devices', badge: 'Requires push notification setup' },
  webhook: { label: 'Webhook', icon: 'webhook', description: 'Webhook delivery to external systems', badge: 'Configure webhook endpoints in Developer Settings' },
};

export function ChannelManager({ className }: ChannelManagerProps) {
  const { data, isLoading, isError, refetch } = trpc.notifications.getPreferences.useQuery();
  const utils = trpc.useUtils();

  const mutation = trpc.notifications.updatePreferences.useMutation({
    onSuccess: () => {
      utils.notifications.getPreferences.invalidate();
      toast({ title: 'Channels updated', description: 'Your notification channel preferences have been saved.' });
    },
    onError: (err: { message: string }) => {
      toast({ title: 'Failed to save', description: err.message, variant: 'destructive' });
    },
  });

  const [defaultChannels, setDefaultChannels] = useState<typeof NOTIFICATION_CHANNELS[number][]>([]);
  const [emailDigest, setEmailDigest] = useState<{ enabled: boolean; frequency: 'daily' | 'weekly'; time: string }>({ enabled: false, frequency: 'daily', time: '09:00' });

  useEffect(() => {
    if (data) {
      setDefaultChannels(data.defaultChannels);
      setEmailDigest(data.emailDigest || { enabled: false, frequency: 'daily', time: '09:00' });
    }
  }, [data]);

  if (isLoading) {
    return (
      <div className={className} data-testid="skeleton">
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-24 w-full animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className={className}>
        <div className="text-center py-8">
          <p className="text-destructive mb-4">Failed to load channel preferences</p>
          <Button variant="outline" onClick={() => refetch()} aria-label="Retry">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const toggleChannel = (channel: typeof NOTIFICATION_CHANNELS[number]) => {
    if (channel === 'in_app') return; // Cannot disable in-app
    setDefaultChannels((prev) =>
      prev.includes(channel) ? prev.filter((c) => c !== channel) : [...prev, channel]
    );
  };

  const handleSave = () => {
    mutation.mutate({ defaultChannels, emailDigest });
  };

  return (
    <div className={className}>
      <div className="space-y-4">
        {NOTIFICATION_CHANNELS.map((channel) => {
          const meta = CHANNEL_META[channel] || { label: channel, icon: 'settings', description: '' };
          const isEnabled = defaultChannels.includes(channel);
          const isInApp = channel === 'in_app';

          return (
            <Card key={channel}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-muted-foreground">{meta.icon}</span>
                  <div>
                    <h3 className="font-semibold">{meta.label}</h3>
                    <p className="text-sm text-muted-foreground">{meta.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={isEnabled || isInApp ? 'Active' : 'Disabled'} />
                  <Switch
                    checked={isEnabled || isInApp}
                    onCheckedChange={() => toggleChannel(channel)}
                    disabled={isInApp}
                    aria-label={meta.label}
                  />
                </div>
              </CardHeader>
              {channel === 'email' && isEnabled && (
                <CardContent>
                  <div className="border-t pt-4 space-y-3">
                    <p className="text-sm font-medium">Email Digest</p>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Label htmlFor="digest-enabled">Enabled</Label>
                        <Switch
                          id="digest-enabled"
                          checked={emailDigest.enabled}
                          onCheckedChange={(checked) => setEmailDigest((prev) => ({ ...prev, enabled: checked }))}
                          aria-label="Email digest enabled"
                        />
                      </div>
                      {emailDigest.enabled && (
                        <>
                          <div className="flex items-center gap-2">
                            <Label htmlFor="digest-frequency">Frequency</Label>
                            <Select
                              value={emailDigest.frequency}
                              onValueChange={(val) => setEmailDigest((prev) => ({ ...prev, frequency: val as 'daily' | 'weekly' }))}
                            >
                              <SelectTrigger id="digest-frequency" className="w-32">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="daily">Daily</SelectItem>
                                <SelectItem value="weekly">Weekly</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex items-center gap-2">
                            <Label htmlFor="digest-time">Time</Label>
                            <Input
                              id="digest-time"
                              type="time"
                              value={emailDigest.time}
                              onChange={(e) => setEmailDigest((prev) => ({ ...prev, time: e.target.value }))}
                              className="w-32"
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              )}
              {meta.badge && (
                <CardContent className="pt-0">
                  <p className="text-xs text-muted-foreground italic">{meta.badge}</p>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      <div className="mt-6 flex justify-end">
        <Button onClick={handleSave} disabled={mutation.isPending}>
          {mutation.isPending ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}
