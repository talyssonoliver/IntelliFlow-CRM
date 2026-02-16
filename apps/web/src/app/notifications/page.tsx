'use client';

/**
 * Notifications Inbox Page
 *
 * Full-featured notification inbox with:
 * - Real-time updates via WebSocket subscription
 * - Filtering by type, priority, read status
 * - Bulk actions (mark all read, batch delete)
 * - Pagination
 *
 * Task: PG-130 - Notifications Inbox Page
 * Uses: IFC-183 - Notifications tRPC Router
 */

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/shared';
import { Skeleton } from '@intelliflow/ui';
import { trpc } from '@/lib/trpc';
import { useRequireAuth } from '@/lib/auth/AuthContext';

// =============================================================================
// Types (aligned with @intelliflow/validators/notifications)
// =============================================================================

// Using types from @intelliflow/validators/notifications
type NotificationType =
  | 'lead_assigned'
  | 'lead_scored'
  | 'lead_converted'
  | 'lead_activity'
  | 'deal_assigned'
  | 'deal_stage_changed'
  | 'deal_won'
  | 'deal_lost'
  | 'deal_at_risk'
  | 'task_assigned'
  | 'task_due_soon'
  | 'task_overdue'
  | 'task_completed'
  | 'task_comment'
  | 'appointment_scheduled'
  | 'appointment_reminder'
  | 'appointment_cancelled'
  | 'appointment_rescheduled'
  | 'ai_insight'
  | 'ai_action_pending'
  | 'ai_action_approved'
  | 'ai_action_rejected'
  | 'ai_recommendation'
  | 'team_mention'
  | 'team_message'
  | 'team_announcement'
  | 'system_alert'
  | 'system_maintenance'
  | 'system_update'
  | 'document_shared'
  | 'document_comment'
  | 'document_approval_needed'
  | 'email_received'
  | 'email_opened'
  | 'email_replied';

type NotificationPriority = 'high' | 'normal' | 'low';

interface Notification {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  body: string;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
  expiresAt?: string | null;
  // Entity references
  entityType?: string | null;
  entityId?: string | null;
  entityName?: string | null;
  // Action data
  actionUrl?: string | null;
  actionLabel?: string | null;
  // Metadata
  metadata?: Record<string, unknown> | null;
}

// =============================================================================
// Utility Functions
// =============================================================================

function getTypeConfig(type: NotificationType) {
  const configs: Record<
    string,
    { icon: string; bgColor: string; iconColor: string; ringColor: string; label: string }
  > = {
    // Lead notifications
    lead_assigned: {
      icon: 'person_add',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
      iconColor: 'text-blue-600 dark:text-blue-400',
      ringColor: 'ring-blue-100 dark:ring-blue-800',
      label: 'Lead',
    },
    lead_scored: {
      icon: 'trending_up',
      bgColor: 'bg-purple-50 dark:bg-purple-900/20',
      iconColor: 'text-purple-600 dark:text-purple-400',
      ringColor: 'ring-purple-100 dark:ring-purple-800',
      label: 'Lead',
    },
    lead_converted: {
      icon: 'check_circle',
      bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      ringColor: 'ring-emerald-100 dark:ring-emerald-800',
      label: 'Lead',
    },
    lead_activity: {
      icon: 'history',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
      iconColor: 'text-blue-600 dark:text-blue-400',
      ringColor: 'ring-blue-100 dark:ring-blue-800',
      label: 'Lead',
    },
    // Deal notifications
    deal_assigned: {
      icon: 'assignment_ind',
      bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      ringColor: 'ring-emerald-100 dark:ring-emerald-800',
      label: 'Deal',
    },
    deal_stage_changed: {
      icon: 'swap_horiz',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
      iconColor: 'text-blue-600 dark:text-blue-400',
      ringColor: 'ring-blue-100 dark:ring-blue-800',
      label: 'Deal',
    },
    deal_won: {
      icon: 'emoji_events',
      bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      ringColor: 'ring-emerald-100 dark:ring-emerald-800',
      label: 'Deal',
    },
    deal_lost: {
      icon: 'cancel',
      bgColor: 'bg-red-50 dark:bg-red-900/20',
      iconColor: 'text-red-600 dark:text-red-400',
      ringColor: 'ring-red-100 dark:ring-red-800',
      label: 'Deal',
    },
    deal_at_risk: {
      icon: 'warning',
      bgColor: 'bg-amber-50 dark:bg-amber-900/20',
      iconColor: 'text-amber-600 dark:text-amber-400',
      ringColor: 'ring-amber-100 dark:ring-amber-800',
      label: 'Deal',
    },
    // Task notifications
    task_assigned: {
      icon: 'assignment_ind',
      bgColor: 'bg-amber-50 dark:bg-amber-900/20',
      iconColor: 'text-amber-600 dark:text-amber-400',
      ringColor: 'ring-amber-100 dark:ring-amber-800',
      label: 'Task',
    },
    task_due_soon: {
      icon: 'schedule',
      bgColor: 'bg-orange-50 dark:bg-orange-900/20',
      iconColor: 'text-orange-600 dark:text-orange-400',
      ringColor: 'ring-orange-100 dark:ring-orange-800',
      label: 'Task',
    },
    task_overdue: {
      icon: 'warning',
      bgColor: 'bg-red-50 dark:bg-red-900/20',
      iconColor: 'text-red-600 dark:text-red-400',
      ringColor: 'ring-red-100 dark:ring-red-800',
      label: 'Task',
    },
    task_completed: {
      icon: 'task_alt',
      bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      ringColor: 'ring-emerald-100 dark:ring-emerald-800',
      label: 'Task',
    },
    task_comment: {
      icon: 'chat_bubble',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
      iconColor: 'text-blue-600 dark:text-blue-400',
      ringColor: 'ring-blue-100 dark:ring-blue-800',
      label: 'Task',
    },
    // Appointment notifications
    appointment_scheduled: {
      icon: 'event_available',
      bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      ringColor: 'ring-emerald-100 dark:ring-emerald-800',
      label: 'Calendar',
    },
    appointment_reminder: {
      icon: 'event',
      bgColor: 'bg-purple-50 dark:bg-purple-900/20',
      iconColor: 'text-purple-600 dark:text-purple-400',
      ringColor: 'ring-purple-100 dark:ring-purple-800',
      label: 'Calendar',
    },
    appointment_cancelled: {
      icon: 'event_busy',
      bgColor: 'bg-red-50 dark:bg-red-900/20',
      iconColor: 'text-red-600 dark:text-red-400',
      ringColor: 'ring-red-100 dark:ring-red-800',
      label: 'Calendar',
    },
    appointment_rescheduled: {
      icon: 'update',
      bgColor: 'bg-amber-50 dark:bg-amber-900/20',
      iconColor: 'text-amber-600 dark:text-amber-400',
      ringColor: 'ring-amber-100 dark:ring-amber-800',
      label: 'Calendar',
    },
    // AI notifications
    ai_insight: {
      icon: 'psychology',
      bgColor: 'bg-indigo-50 dark:bg-indigo-900/20',
      iconColor: 'text-indigo-600 dark:text-indigo-400',
      ringColor: 'ring-indigo-100 dark:ring-indigo-800',
      label: 'AI',
    },
    ai_action_pending: {
      icon: 'pending_actions',
      bgColor: 'bg-amber-50 dark:bg-amber-900/20',
      iconColor: 'text-amber-600 dark:text-amber-400',
      ringColor: 'ring-amber-100 dark:ring-amber-800',
      label: 'AI',
    },
    ai_action_approved: {
      icon: 'check_circle',
      bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      ringColor: 'ring-emerald-100 dark:ring-emerald-800',
      label: 'AI',
    },
    ai_action_rejected: {
      icon: 'cancel',
      bgColor: 'bg-red-50 dark:bg-red-900/20',
      iconColor: 'text-red-600 dark:text-red-400',
      ringColor: 'ring-red-100 dark:ring-red-800',
      label: 'AI',
    },
    ai_recommendation: {
      icon: 'lightbulb',
      bgColor: 'bg-amber-50 dark:bg-amber-900/20',
      iconColor: 'text-amber-600 dark:text-amber-400',
      ringColor: 'ring-amber-100 dark:ring-amber-800',
      label: 'AI',
    },
    // Team notifications
    team_mention: {
      icon: 'alternate_email',
      bgColor: 'bg-orange-50 dark:bg-orange-900/20',
      iconColor: 'text-orange-600 dark:text-orange-400',
      ringColor: 'ring-orange-100 dark:ring-orange-800',
      label: 'Team',
    },
    team_message: {
      icon: 'chat',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
      iconColor: 'text-blue-600 dark:text-blue-400',
      ringColor: 'ring-blue-100 dark:ring-blue-800',
      label: 'Team',
    },
    team_announcement: {
      icon: 'campaign',
      bgColor: 'bg-purple-50 dark:bg-purple-900/20',
      iconColor: 'text-purple-600 dark:text-purple-400',
      ringColor: 'ring-purple-100 dark:ring-purple-800',
      label: 'Team',
    },
    // System notifications
    system_alert: {
      icon: 'info',
      bgColor: 'bg-slate-100 dark:bg-slate-700',
      iconColor: 'text-slate-600 dark:text-slate-400',
      ringColor: 'ring-slate-100 dark:ring-slate-700',
      label: 'System',
    },
    system_maintenance: {
      icon: 'build',
      bgColor: 'bg-slate-100 dark:bg-slate-700',
      iconColor: 'text-slate-600 dark:text-slate-400',
      ringColor: 'ring-slate-100 dark:ring-slate-700',
      label: 'System',
    },
    system_update: {
      icon: 'system_update',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
      iconColor: 'text-blue-600 dark:text-blue-400',
      ringColor: 'ring-blue-100 dark:ring-blue-800',
      label: 'System',
    },
    // Document notifications
    document_shared: {
      icon: 'share',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
      iconColor: 'text-blue-600 dark:text-blue-400',
      ringColor: 'ring-blue-100 dark:ring-blue-800',
      label: 'Document',
    },
    document_comment: {
      icon: 'comment',
      bgColor: 'bg-purple-50 dark:bg-purple-900/20',
      iconColor: 'text-purple-600 dark:text-purple-400',
      ringColor: 'ring-purple-100 dark:ring-purple-800',
      label: 'Document',
    },
    document_approval_needed: {
      icon: 'approval',
      bgColor: 'bg-amber-50 dark:bg-amber-900/20',
      iconColor: 'text-amber-600 dark:text-amber-400',
      ringColor: 'ring-amber-100 dark:ring-amber-800',
      label: 'Document',
    },
    // Email notifications
    email_received: {
      icon: 'mail',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
      iconColor: 'text-blue-600 dark:text-blue-400',
      ringColor: 'ring-blue-100 dark:ring-blue-800',
      label: 'Email',
    },
    email_opened: {
      icon: 'drafts',
      bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      ringColor: 'ring-emerald-100 dark:ring-emerald-800',
      label: 'Email',
    },
    email_replied: {
      icon: 'reply',
      bgColor: 'bg-purple-50 dark:bg-purple-900/20',
      iconColor: 'text-purple-600 dark:text-purple-400',
      ringColor: 'ring-purple-100 dark:ring-purple-800',
      label: 'Email',
    },
  };
  return configs[type] || configs.system_alert;
}

function getPriorityConfig(priority: NotificationPriority) {
  const configs: Record<
    NotificationPriority,
    { borderColor: string; badgeBg: string; badgeText: string; badgeRing: string; label: string }
  > = {
    high: {
      borderColor: 'bg-red-500',
      badgeBg: 'bg-red-50 dark:bg-red-900/30',
      badgeText: 'text-red-700 dark:text-red-300',
      badgeRing: 'ring-red-600/10 dark:ring-red-500/20',
      label: 'High',
    },
    normal: {
      borderColor: 'bg-primary',
      badgeBg: 'bg-blue-50 dark:bg-blue-900/30',
      badgeText: 'text-blue-700 dark:text-blue-300',
      badgeRing: 'ring-blue-600/10 dark:ring-blue-500/20',
      label: 'Normal',
    },
    low: {
      borderColor: 'bg-slate-300 dark:bg-slate-600',
      badgeBg: 'bg-slate-50 dark:bg-slate-800',
      badgeText: 'text-slate-700 dark:text-slate-300',
      badgeRing: 'ring-slate-600/10 dark:ring-slate-500/20',
      label: 'Low',
    },
  };
  return configs[priority];
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  return date.toLocaleDateString();
}

// =============================================================================
// Notification Item Component
// =============================================================================

function NotificationItem({
  notification,
  onMarkAsRead,
  onDismiss,
}: {
  notification: Notification;
  onMarkAsRead: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const typeConfig = getTypeConfig(notification.type);
  const priorityConfig = getPriorityConfig(notification.priority);

  const isAiType = notification.type.startsWith('ai_');
  const isUnread = !notification.isRead;

  // Extract link from notification actionUrl
  const actionLink = notification.actionUrl;

  return (
    <div
      className={`group relative flex w-full items-start gap-4 rounded-xl p-4 shadow-sm border transition-all hover:shadow-md ${
        isAiType
          ? 'bg-indigo-50/40 dark:bg-indigo-900/10 border-indigo-100 dark:border-indigo-800/30 hover:border-indigo-200 dark:hover:border-indigo-700/50'
          : isUnread
            ? 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
            : 'bg-slate-50/50 dark:bg-slate-800/50 border-transparent hover:bg-white dark:hover:bg-slate-800 hover:border-slate-200 dark:hover:border-slate-700'
      }`}
    >
      {/* Priority Indicator */}
      <div
        className={`absolute left-0 top-3 bottom-3 w-1 ${priorityConfig.borderColor} rounded-r-lg`}
      />

      {/* Icon */}
      <div
        className={`ml-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${typeConfig.bgColor} ${typeConfig.iconColor} ring-1 ${typeConfig.ringColor}`}
      >
        <span className="material-symbols-outlined">{typeConfig.icon}</span>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3
              className={`text-sm ${isUnread ? 'font-bold' : 'font-medium'} text-slate-900 dark:text-white`}
            >
              {notification.title}
            </h3>
            {notification.priority === 'high' && (
              <span
                className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${priorityConfig.badgeBg} ${priorityConfig.badgeText} ${priorityConfig.badgeRing}`}
              >
                {priorityConfig.label}
              </span>
            )}
            {isUnread && <div className="h-2 w-2 rounded-full bg-primary" />}
          </div>
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {formatRelativeTime(notification.createdAt)}
          </span>
        </div>
        <p
          className={`text-sm ${isUnread ? 'text-slate-700 dark:text-slate-300' : 'text-slate-600 dark:text-slate-400'} line-clamp-2 pr-12`}
        >
          {notification.body}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${typeConfig.bgColor} ${typeConfig.iconColor}`}
          >
            {typeConfig.label}
          </span>
          {actionLink && (
            <Link
              href={actionLink}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              View details
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </Link>
          )}
        </div>
      </div>

      {/* Actions */}
      <div
        className={`absolute right-4 top-4 hidden group-hover:flex items-center gap-1 ${isAiType ? 'bg-indigo-50/50 dark:bg-indigo-900/20' : 'bg-white dark:bg-slate-800'} pl-2 backdrop-blur-sm`}
      >
        {isUnread && (
          <button
            onClick={() => onMarkAsRead(notification.id)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-primary"
            title="Mark as read"
          >
            <span className="material-symbols-outlined text-[20px]">check_circle</span>
          </button>
        )}
        <button
          onClick={() => onDismiss(notification.id)}
          className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-red-500"
          title="Dismiss"
        >
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// Loading Skeleton
// =============================================================================

function NotificationSkeleton() {
  return (
    <div className="flex items-start gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
      <Skeleton className="h-10 w-10 rounded-full" />
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-16" />
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  );
}

// =============================================================================
// Main Notifications Page Component
// =============================================================================

export default function NotificationsPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [priorityFilter, setPriorityFilter] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'all' | 'unread' | 'urgent' | 'high'>('all');
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const limit = 20;

  // Require authentication - redirects to login if not authenticated
  const { isLoading: authLoading, isAuthenticated } = useRequireAuth();

  // Build query filters
  const queryFilters = useMemo(() => {
    const filters: {
      types?: NotificationType[];
      priorities?: NotificationPriority[];
      isRead?: boolean;
    } = {};

    if (typeFilter) {
      filters.types = [typeFilter as NotificationType];
    }

    if (priorityFilter) {
      filters.priorities = [priorityFilter as NotificationPriority];
    }

    if (activeTab === 'unread') {
      filters.isRead = false;
    } else if (activeTab === 'urgent' || activeTab === 'high') {
      filters.priorities = ['high'];
    }

    return filters;
  }, [typeFilter, priorityFilter, activeTab]);

  // Fetch notifications - only run when authenticated
  const { data, isLoading, error, refetch } = trpc.notifications.list.useQuery(
    {
      limit,
      cursor,
      ...queryFilters,
    },
    { enabled: isAuthenticated && !authLoading }
  );

  // Check for auth errors
  const isAuthError =
    error?.data?.code === 'UNAUTHORIZED' ||
    error?.message?.toLowerCase().includes('authentication') ||
    error?.message?.toLowerCase().includes('unauthorized');

  // Redirect to login for auth errors
  useEffect(() => {
    if (error && isAuthError && !isLoading && !authLoading) {
      router.replace('/login');
    }
  }, [error, isAuthError, isLoading, authLoading, router]);

  // Fetch unread count - only run when authenticated
  const { data: unreadData } = trpc.notifications.getUnreadCount.useQuery(undefined, {
    enabled: isAuthenticated && !authLoading,
  });

  // Mutations
  const markAsReadMutation = trpc.notifications.markAsRead.useMutation({
    onSuccess: () => refetch(),
  });

  const markAllAsReadMutation = trpc.notifications.markAllAsRead.useMutation({
    onSuccess: () => refetch(),
  });

  const deleteMutation = trpc.notifications.delete.useMutation({
    onSuccess: () => refetch(),
  });

  // Filter by search query client-side
  const filteredNotifications = useMemo(() => {
    if (!data?.notifications) return [];
    if (!searchQuery) return data.notifications;

    return data.notifications.filter(
      (n) =>
        n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        n.body.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [data?.notifications, searchQuery]);

  // Actions
  const handleMarkAsRead = (id: string) => {
    markAsReadMutation.mutate({ notificationIds: [id] });
  };

  const handleDismiss = (id: string) => {
    deleteMutation.mutate({ notificationIds: [id], permanent: false });
  };

  const handleMarkAllAsRead = () => {
    markAllAsReadMutation.mutate();
  };

  // Calculate total unread
  const totalUnread = unreadData?.total ?? 0;

  const tabs = [
    { id: 'all' as const, label: 'All' },
    { id: 'unread' as const, label: 'Unread', count: totalUnread, dot: 'bg-primary' },
    {
      id: 'urgent' as const,
      label: 'Urgent',
      count: unreadData?.byPriority?.urgent,
      dot: 'bg-red-500',
    },
    {
      id: 'high' as const,
      label: 'High',
      count: unreadData?.byPriority?.high,
      dot: 'bg-orange-500',
    },
  ];

  // Type options for filter
  const typeOptions = [
    { value: '', label: 'Type: All' },
    { value: 'lead_assigned', label: 'Lead Assigned' },
    { value: 'lead_scored', label: 'Lead Scored' },
    { value: 'lead_converted', label: 'Lead Converted' },
    { value: 'deal_stage_changed', label: 'Deal Stage Changed' },
    { value: 'deal_won', label: 'Deal Won' },
    { value: 'deal_at_risk', label: 'Deal At Risk' },
    { value: 'task_assigned', label: 'Task Assigned' },
    { value: 'task_due_soon', label: 'Task Due Soon' },
    { value: 'task_overdue', label: 'Task Overdue' },
    { value: 'team_mention', label: 'Team Mention' },
    { value: 'ai_insight', label: 'AI Insights' },
    { value: 'ai_recommendation', label: 'AI Recommendations' },
    { value: 'ai_action_pending', label: 'AI Action Pending' },
    { value: 'document_approval_needed', label: 'Document Approval' },
    { value: 'system_alert', label: 'System Alerts' },
  ];

  return (
    <div className="p-6 lg:p-8">
      <div className="mx-auto flex flex-col gap-6">
        {/* Page Header */}
        <PageHeader
          breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Notifications' }]}
          title="Notifications"
          description="Stay updated with your latest alerts and activities."
          actions={[
            {
              label: 'Settings',
              icon: 'tune',
              variant: 'secondary',
              href: '/notifications/settings',
            },
            {
              label: 'Mark all as read',
              icon: 'done_all',
              variant: 'primary',
              onClick: handleMarkAllAsRead,
              disabled: totalUnread === 0 || markAllAsReadMutation.isPending,
            },
          ]}
        />

        {/* Filter Bar */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="flex-1 relative">
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-primary">
                <span className="material-symbols-outlined">search</span>
              </div>
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-12 pl-11 pr-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent shadow-sm placeholder:text-slate-400"
                placeholder="Search notifications..."
              />
            </div>
            <div className="flex gap-3 overflow-x-auto pb-1 lg:pb-0">
              <select
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value);
                  setCursor(undefined);
                }}
                className="h-12 pl-4 pr-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium text-sm focus:ring-2 focus:ring-primary focus:border-transparent shadow-sm cursor-pointer min-w-[160px]"
              >
                {typeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <select
                value={priorityFilter}
                onChange={(e) => {
                  setPriorityFilter(e.target.value);
                  setCursor(undefined);
                }}
                className="h-12 pl-4 pr-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium text-sm focus:ring-2 focus:ring-primary focus:border-transparent shadow-sm cursor-pointer min-w-[140px]"
              >
                <option value="">Priority: All</option>
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>

          {/* Quick Filter Tabs */}
          <div className="flex flex-wrap gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setCursor(undefined);
                }}
                className={`h-8 px-4 rounded-full text-xs font-semibold flex items-center gap-2 transition-all ${
                  activeTab === tab.id
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm'
                    : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
              >
                {tab.dot && <span className={`size-2 rounded-full ${tab.dot}`} />}
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className="text-[10px] bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200 px-1.5 py-0.5 rounded-full">
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
            {(searchQuery || typeFilter || priorityFilter || activeTab !== 'all') && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setTypeFilter('');
                  setPriorityFilter('');
                  setActiveTab('all');
                  setCursor(undefined);
                }}
                className="ml-auto flex shrink-0 items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>

        {/* Redirecting State for Auth Errors */}
        {error && isAuthError && (
          <div className="flex items-center justify-center gap-3 p-8">
            <span className="material-symbols-outlined text-slate-400 animate-spin">
              progress_activity
            </span>
            <p className="text-slate-600 dark:text-slate-400">Redirecting to login...</p>
          </div>
        )}

        {/* Error State for Non-Auth Errors */}
        {error && !isAuthError && (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <span className="material-symbols-outlined text-red-500">error</span>
            <div>
              <p className="font-medium text-red-700 dark:text-red-400">
                Failed to load notifications
              </p>
              <p className="text-sm text-red-600 dark:text-red-500">{error.message}</p>
            </div>
            <button
              onClick={() => refetch()}
              className="ml-auto px-3 py-1.5 rounded-md bg-red-100 dark:bg-red-800 text-red-700 dark:text-red-300 text-sm font-medium hover:bg-red-200 dark:hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="flex flex-col gap-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <NotificationSkeleton key={i} />
            ))}
          </div>
        )}

        {/* Notification List */}
        {!isLoading && !error && (
          <div className="flex flex-col gap-3">
            {filteredNotifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onMarkAsRead={handleMarkAsRead}
                onDismiss={handleDismiss}
              />
            ))}

            {filteredNotifications.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <span
                  className="material-symbols-outlined text-slate-300 dark:text-slate-600 mb-4"
                  style={{ fontSize: '64px' }}
                >
                  notifications_off
                </span>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">
                  No notifications
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {searchQuery || typeFilter || priorityFilter || activeTab !== 'all'
                    ? 'No notifications match your filters.'
                    : "You're all caught up!"}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Pagination */}
        {data && data.total > 0 && (
          <div className="flex items-center justify-between px-2 py-4 border-t border-slate-200 dark:border-slate-700">
            <div className="text-sm text-slate-500 dark:text-slate-400">
              Showing{' '}
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {data.notifications.length}
              </span>{' '}
              of{' '}
              <span className="font-semibold text-slate-700 dark:text-slate-200">{data.total}</span>{' '}
              notifications
            </div>
            <div className="flex items-center gap-2">
              {cursor && (
                <button
                  onClick={() => setCursor(undefined)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-700 text-sm font-medium transition-colors"
                >
                  Back to start
                </button>
              )}
              {data.hasMore && data.nextCursor && (
                <button
                  onClick={() => setCursor(data.nextCursor ?? undefined)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-700 text-sm font-medium transition-colors"
                >
                  Load more
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
