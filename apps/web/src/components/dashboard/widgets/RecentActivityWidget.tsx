'use client';

import { useMemo } from 'react';
import type { WidgetProps } from './index';
import {
  useActivitySubscription,
  useRealtimeHealth,
  type ActivityRecord,
} from '../../../../hooks/use-subscription';

// Activity type icons and colors
const activityTypeConfig: Record<string, { icon: string; color: string }> = {
  EMAIL: { icon: '📧', color: 'text-blue-600' },
  CALL: { icon: '📞', color: 'text-green-600' },
  MEETING: { icon: '📅', color: 'text-purple-600' },
  NOTE: { icon: '📝', color: 'text-yellow-600' },
  TASK: { icon: '✓', color: 'text-orange-600' },
  STAGE_CHANGE: { icon: '🔄', color: 'text-indigo-600' },
  AGENT_ACTION: { icon: '🤖', color: 'text-pink-600' },
  SYSTEM: { icon: '⚙️', color: 'text-gray-600' },
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
function ConnectionStatus({ status, latency }: { status: string; latency: number | null }) {
  const statusConfig = {
    connected: { color: 'bg-green-500', label: 'Live' },
    connecting: { color: 'bg-yellow-500 animate-pulse', label: 'Connecting...' },
    disconnected: { color: 'bg-gray-400', label: 'Offline' },
    error: { color: 'bg-red-500', label: 'Error' },
  };

  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.disconnected;

  return (
    <div className="flex items-center gap-2 text-xs text-slate-500">
      <span className={`w-2 h-2 rounded-full ${config.color}`} />
      <span>{config.label}</span>
      {status === 'connected' && latency !== null && (
        <span className="text-slate-400">({latency}ms)</span>
      )}
    </div>
  );
}

// Fallback sample activities for when there's no real data
const sampleActivities: ActivityRecord[] = [
  {
    id: 'sample-1',
    type: 'EMAIL',
    title: 'Sent proposal to Acme Corp',
    description: 'Q4 enterprise license proposal',
    timestamp: new Date(Date.now() - 120000).toISOString(), // 2 mins ago
    dateLabel: 'today',
    opportunityId: null,
    userId: 'user-1',
    agentName: null,
    agentStatus: null,
  },
  {
    id: 'sample-2',
    type: 'STAGE_CHANGE',
    title: 'Deal moved to Negotiation',
    description: 'Tech Solutions Bundle advanced',
    timestamp: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
    dateLabel: 'today',
    opportunityId: null,
    userId: 'user-2',
    agentName: null,
    agentStatus: null,
  },
  {
    id: 'sample-3',
    type: 'AGENT_ACTION',
    title: 'AI Follow-up scheduled',
    description: 'Automated reminder for Project Alpha',
    timestamp: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
    dateLabel: 'today',
    opportunityId: null,
    userId: null,
    agentName: 'Follow-up Agent',
    agentStatus: 'completed',
  },
];

export function RecentActivityWidget(_props: WidgetProps) {
  // Real-time subscription for activities (gracefully handles missing table)
  const { activities: realtimeActivities, status, metrics } = useActivitySubscription({
    onActivity: (activity) => {
      // Could trigger a toast notification here for new activities
      console.log('[RecentActivity] New activity:', activity.title);
    },
  });

  // Health check for connection monitoring (optional feature)
  const { isHealthy, latency } = useRealtimeHealth();

  // Don't show error status if we're using fallback data (table doesn't exist yet)
  const displayStatus = realtimeActivities.length === 0 && status === 'error'
    ? 'disconnected'
    : status;

  // Use realtime activities if available, otherwise show sample data
  const displayActivities = useMemo(() => {
    if (realtimeActivities.length > 0) {
      return realtimeActivities.slice(0, 5);
    }
    // Show sample data when no real activities yet (connection may still be establishing)
    return sampleActivities;
  }, [realtimeActivities]);

  const isUsingFallback = realtimeActivities.length === 0;

  return (
    <div className="p-5 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-slate-900 dark:text-white">Recent Activity</h3>
        <ConnectionStatus
          status={isHealthy ? displayStatus : 'disconnected'}
          latency={metrics.averageLatency || latency}
        />
      </div>

      <div className="flex flex-col gap-4 flex-1">
        {displayActivities.map((activity) => {
          const typeConfig = activityTypeConfig[activity.type] || activityTypeConfig.SYSTEM;

          return (
            <div key={activity.id} className="flex items-start gap-3">
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 ${typeConfig.color}`}
              >
                <span className="text-sm">{typeConfig.icon}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-800 dark:text-slate-200">
                  <span className="font-semibold">{activity.title}</span>
                  {activity.description && (
                    <span className="text-slate-600 dark:text-slate-400">
                      {' '}- {activity.description}
                    </span>
                  )}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-xs text-slate-500">
                    {activity.dateLabel || formatRelativeTime(activity.timestamp)}
                  </p>
                  {activity.agentName && (
                    <span className="text-xs text-pink-600 dark:text-pink-400">
                      by {activity.agentName}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Show hint when using fallback data */}
      {isUsingFallback && status === 'connected' && (
        <p className="text-xs text-slate-400 mt-3 text-center">
          Waiting for new activities...
        </p>
      )}

      {/* Show metrics in dev mode */}
      {process.env.NODE_ENV === 'development' && metrics.messagesReceived > 0 && (
        <div className="text-xs text-slate-400 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
          <span>Messages: {metrics.messagesReceived}</span>
          <span className="mx-2">|</span>
          <span>Avg latency: {metrics.averageLatency}ms</span>
        </div>
      )}
    </div>
  );
}
