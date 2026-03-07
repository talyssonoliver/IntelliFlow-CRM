'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import type { WidgetProps } from './index';
import { useActivitySubscription, useRealtimeHealth } from '../../../../hooks/use-subscription';

// Activity type icons and colors using design system
const activityTypeConfig: Record<string, { icon: string; color: string }> = {
  EMAIL: { icon: '📧', color: 'text-info' },
  CALL: { icon: '📞', color: 'text-success' },
  MEETING: { icon: '📅', color: 'text-chart-3' },
  NOTE: { icon: '📝', color: 'text-warning' },
  TASK: { icon: '✓', color: 'text-chart-6' },
  STAGE_CHANGE: { icon: '🔄', color: 'text-chart-2' },
  AGENT_ACTION: { icon: '🤖', color: 'text-chart-4' },
  SYSTEM: { icon: '⚙️', color: 'text-muted-foreground' },
};

// Format timestamp to relative time
function formatRelativeTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  return date.toLocaleDateString();
}

// Connection status indicator
function ConnectionStatus({ status, latency }: Readonly<{ status: string; latency: number | null }>) {
  const statusConfig = {
    connected: { color: 'bg-success', label: 'Live' },
    connecting: { color: 'bg-warning animate-pulse', label: 'Connecting...' },
    disconnected: { color: 'bg-muted-foreground', label: 'Offline' },
    error: { color: 'bg-destructive', label: 'Error' },
  };

  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.disconnected;

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className={`w-2 h-2 rounded-full ${config.color}`} />
      <span>{config.label}</span>
      {status === 'connected' && latency !== null && (
        <span className="text-muted-foreground">({latency}ms)</span>
      )}
    </div>
  );
}

export function RecentActivityWidget(_props: Readonly<WidgetProps>) {
  // Real-time subscription for activities (gracefully handles missing table)
  const {
    activities: realtimeActivities,
    status,
    metrics,
  } = useActivitySubscription({
    onActivity: (activity) => {
      // Could trigger a toast notification here for new activities
      console.log('[RecentActivity] New activity:', activity.title);
    },
  });

  // Health check for connection monitoring (optional feature)
  const { isHealthy, latency } = useRealtimeHealth();

  // Don't show error status if we're using fallback data (table doesn't exist yet)
  const displayStatus =
    realtimeActivities.length === 0 && status === 'error' ? 'disconnected' : status;

  const displayActivities = useMemo(() => realtimeActivities.slice(0, 5), [realtimeActivities]);

  return (
    <div className="p-5 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-foreground">Recent Activity</h3>
        <div className="flex items-center gap-3">
          <Link href="/activity" className="text-xs text-primary hover:underline">
            View all
          </Link>
          <ConnectionStatus
            status={isHealthy ? displayStatus : 'disconnected'}
            latency={metrics.averageLatency || latency}
          />
        </div>
      </div>

      <div className="flex flex-col gap-4 flex-1">
        {displayActivities.length > 0 &&
          displayActivities.map((activity) => {
            const typeConfig = activityTypeConfig[activity.type] || activityTypeConfig.SYSTEM;

            return (
              <div key={activity.id} className="flex items-start gap-3">
                <div
                  className={`flex items-center justify-center w-8 h-8 rounded-full bg-muted ${typeConfig.color}`}
                >
                  <span className="text-sm">{typeConfig.icon}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground">
                    <span className="font-semibold">{activity.title}</span>
                    {activity.description && (
                      <span className="text-muted-foreground"> - {activity.description}</span>
                    )}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-xs text-muted-foreground">
                      {activity.dateLabel || formatRelativeTime(activity.timestamp)}
                    </p>
                    {activity.agentName && (
                      <span className="text-xs text-chart-4">by {activity.agentName}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        {displayActivities.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-border p-4">
            <p className="text-xs text-muted-foreground text-center">No recent activity yet.</p>
          </div>
        )}
      </div>

      {displayActivities.length === 0 && status === 'connected' && (
        <p className="text-xs text-muted-foreground mt-3 text-center">
          Waiting for new activities...
        </p>
      )}

      {/* Show metrics in dev mode */}
      {process.env.NODE_ENV === 'development' && metrics.messagesReceived > 0 && (
        <div className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border">
          <span>Messages: {metrics.messagesReceived}</span>
          <span className="mx-2">|</span>
          <span>Avg latency: {metrics.averageLatency}ms</span>
        </div>
      )}
    </div>
  );
}
