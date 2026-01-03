'use client';

import { useState, useMemo } from 'react';
import { PageHeader } from '@/components/shared';

// =============================================================================
// Types
// =============================================================================

type NotificationType =
  | 'sla_alert'
  | 'ai_insight'
  | 'mention'
  | 'task'
  | 'deal'
  | 'calendar'
  | 'system';
type NotificationPriority = 'low' | 'medium' | 'high' | 'urgent';

interface Notification {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  body: string;
  source: string;
  sourceLink?: string;
  isRead: boolean;
  createdAt: string;
  relativeTime: string;
}

// =============================================================================
// Sample Data
// =============================================================================

const SAMPLE_NOTIFICATIONS: Notification[] = [
  {
    id: '1',
    type: 'sla_alert',
    priority: 'urgent',
    title: 'SLA Breach Warning',
    body: 'Ticket #4209 (Acme Corp) is approaching response deadline. Immediate action required.',
    source: 'Support System',
    sourceLink: '/tickets/T-4209',
    isRead: false,
    createdAt: '2025-12-31T17:58:00Z',
    relativeTime: '2 min ago',
  },
  {
    id: '2',
    type: 'ai_insight',
    priority: 'medium',
    title: 'Deal Probability Update',
    body: 'IntelliFlow AI detected a 85% probability of closing deal "Global Tech Expansion".',
    source: 'AI Insights',
    sourceLink: '/deals/D-1042',
    isRead: false,
    createdAt: '2025-12-31T17:45:00Z',
    relativeTime: '15 min ago',
  },
  {
    id: '3',
    type: 'mention',
    priority: 'high',
    title: 'Sarah mentioned you',
    body: 'Hey @Alex, can you review the attached Q3 Strategy Doc before the meeting?',
    source: 'Team Chat',
    sourceLink: '/chat/thread-123',
    isRead: false,
    createdAt: '2025-12-31T17:00:00Z',
    relativeTime: '1 hour ago',
  },
  {
    id: '4',
    type: 'task',
    priority: 'low',
    title: 'Task Completed',
    body: 'Prepare monthly sales report task marked as complete.',
    source: 'Tasks',
    sourceLink: '/tasks/T-789',
    isRead: true,
    createdAt: '2025-12-30T14:00:00Z',
    relativeTime: 'Yesterday',
  },
  {
    id: '5',
    type: 'calendar',
    priority: 'medium',
    title: 'Weekly Sync Reminder',
    body: 'Meeting starts in 10 minutes: "Sales Team Weekly Sync".',
    source: 'Calendar',
    sourceLink: '/calendar',
    isRead: true,
    createdAt: '2025-12-29T10:00:00Z',
    relativeTime: '2 days ago',
  },
  {
    id: '6',
    type: 'deal',
    priority: 'medium',
    title: 'Contract Signed',
    body: 'Docusign: "Service Agreement - Orion Logistics" has been signed by the client.',
    source: 'Integrations',
    sourceLink: '/deals/D-1038',
    isRead: true,
    createdAt: '2025-12-28T16:00:00Z',
    relativeTime: '3 days ago',
  },
];

// =============================================================================
// Utility Functions
// =============================================================================

function getTypeConfig(type: NotificationType) {
  const configs = {
    sla_alert: {
      icon: 'warning',
      bgColor: 'bg-red-50 dark:bg-red-900/20',
      iconColor: 'text-red-600 dark:text-red-400',
      ringColor: 'ring-red-100 dark:ring-red-800',
    },
    ai_insight: {
      icon: 'psychology',
      bgColor: 'bg-white dark:bg-slate-800',
      iconColor: 'text-primary',
      ringColor: 'ring-blue-100 dark:ring-blue-800',
    },
    mention: {
      icon: 'alternate_email',
      bgColor: 'bg-orange-50 dark:bg-orange-900/20',
      iconColor: 'text-orange-600 dark:text-orange-400',
      ringColor: 'ring-orange-100 dark:ring-orange-800',
    },
    task: {
      icon: 'task_alt',
      bgColor: 'bg-slate-100 dark:bg-slate-700',
      iconColor: 'text-slate-500 dark:text-slate-400',
      ringColor: 'ring-slate-100 dark:ring-slate-700',
    },
    deal: {
      icon: 'description',
      bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      ringColor: 'ring-emerald-100 dark:ring-emerald-800',
    },
    calendar: {
      icon: 'schedule',
      bgColor: 'bg-slate-100 dark:bg-slate-700',
      iconColor: 'text-slate-500 dark:text-slate-400',
      ringColor: 'ring-slate-100 dark:ring-slate-700',
    },
    system: {
      icon: 'info',
      bgColor: 'bg-slate-100 dark:bg-slate-700',
      iconColor: 'text-slate-500 dark:text-slate-400',
      ringColor: 'ring-slate-100 dark:ring-slate-700',
    },
  };
  return configs[type];
}

function getPriorityConfig(priority: NotificationPriority) {
  const configs = {
    urgent: {
      borderColor: 'bg-red-500',
      badgeBg: 'bg-red-50 dark:bg-red-900/30',
      badgeText: 'text-red-700 dark:text-red-300',
      badgeRing: 'ring-red-600/10 dark:ring-red-500/20',
      label: 'Urgent',
    },
    high: {
      borderColor: 'bg-orange-400',
      badgeBg: 'bg-orange-50 dark:bg-orange-900/30',
      badgeText: 'text-orange-700 dark:text-orange-300',
      badgeRing: 'ring-orange-600/10 dark:ring-orange-500/20',
      label: 'High',
    },
    medium: {
      borderColor: 'bg-primary',
      badgeBg: 'bg-blue-50 dark:bg-blue-900/30',
      badgeText: 'text-blue-700 dark:text-blue-300',
      badgeRing: 'ring-blue-600/10 dark:ring-blue-500/20',
      label: 'Medium',
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

  const isAiInsight = notification.type === 'ai_insight';
  const isUnread = !notification.isRead;

  return (
    <div
      className={`group relative flex w-full items-start gap-4 rounded-xl p-4 shadow-sm border transition-all hover:shadow-md ${
        isAiInsight
          ? 'bg-blue-50/40 dark:bg-blue-900/10 border-blue-100 dark:border-blue-800/30 hover:border-blue-200 dark:hover:border-blue-700/50'
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
            {(notification.priority === 'urgent' || notification.priority === 'high') && (
              <span
                className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${priorityConfig.badgeBg} ${priorityConfig.badgeText} ${priorityConfig.badgeRing}`}
              >
                {priorityConfig.label}
              </span>
            )}
            {isUnread && <div className="h-2 w-2 rounded-full bg-primary" />}
          </div>
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {notification.relativeTime}
          </span>
        </div>
        <p
          className={`text-sm ${isUnread ? 'text-slate-700 dark:text-slate-300' : 'text-slate-600 dark:text-slate-400'} line-clamp-1 pr-12`}
        >
          {notification.body}
        </p>
        <p className="text-xs text-slate-400 mt-1">Source: {notification.source}</p>
      </div>

      {/* Actions */}
      <div
        className={`absolute right-4 top-4 hidden group-hover:flex items-center gap-1 ${isAiInsight ? 'bg-blue-50/50 dark:bg-blue-900/20' : 'bg-white dark:bg-slate-800'} pl-2 backdrop-blur-sm`}
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
          className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-orange-500"
          title="Snooze"
        >
          <span className="material-symbols-outlined text-[20px]">snooze</span>
        </button>
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
// Main Notifications Page Component
// =============================================================================

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState(SAMPLE_NOTIFICATIONS);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [activeTab, setActiveTab] = useState('all');

  // Filter notifications
  const filteredNotifications = useMemo(() => {
    return notifications.filter((n) => {
      // Search filter
      const matchesSearch =
        searchQuery === '' ||
        n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        n.body.toLowerCase().includes(searchQuery.toLowerCase());

      // Type filter
      const matchesType = typeFilter === '' || n.type === typeFilter;

      // Priority filter
      const matchesPriority = priorityFilter === '' || n.priority === priorityFilter;

      // Tab filter
      let matchesTab = true;
      if (activeTab === 'unread') matchesTab = !n.isRead;
      else if (activeTab === 'urgent') matchesTab = n.priority === 'urgent';
      else if (activeTab === 'high') matchesTab = n.priority === 'high';

      return matchesSearch && matchesType && matchesPriority && matchesTab;
    });
  }, [notifications, searchQuery, typeFilter, priorityFilter, activeTab]);

  // Stats
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  // Actions
  const handleMarkAsRead = (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
  };

  const handleDismiss = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const handleMarkAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  const tabs = [
    { id: 'all', label: 'All' },
    { id: 'unread', label: 'Unread', dot: 'bg-primary' },
    { id: 'urgent', label: 'Urgent', dot: 'bg-red-500' },
    { id: 'high', label: 'High', dot: 'bg-orange-500' },
  ];

  return (
    <div className="p-6 lg:p-8">
      <div className="mx-auto flex flex-col gap-6">
        {/* Page Header */}
        <PageHeader
          breadcrumbs={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Notifications' },
          ]}
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
              disabled: unreadCount === 0,
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
                onChange={(e) => setTypeFilter(e.target.value)}
                className="h-12 pl-4 pr-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium text-sm focus:ring-2 focus:ring-primary focus:border-transparent shadow-sm cursor-pointer min-w-[140px]"
              >
                <option value="">Type: All</option>
                <option value="sla_alert">SLA Alerts</option>
                <option value="mention">Mentions</option>
                <option value="ai_insight">AI Insights</option>
                <option value="task">Tasks</option>
                <option value="deal">Deals</option>
                <option value="system">System</option>
              </select>
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
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
                onClick={() => setActiveTab(tab.id)}
                className={`h-8 px-4 rounded-full text-xs font-semibold flex items-center gap-2 transition-all ${
                  activeTab === tab.id
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm'
                    : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
              >
                {tab.dot && <span className={`size-2 rounded-full ${tab.dot}`} />}
                {tab.label}
              </button>
            ))}
            {(searchQuery || typeFilter || priorityFilter || activeTab !== 'all') && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setTypeFilter('');
                  setPriorityFilter('');
                  setActiveTab('all');
                }}
                className="ml-auto flex shrink-0 items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>

        {/* Notification List */}
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
                {searchQuery || typeFilter || priorityFilter
                  ? 'No notifications match your filters.'
                  : "You're all caught up!"}
              </p>
            </div>
          )}
        </div>

        {/* Pagination */}
        {filteredNotifications.length > 0 && (
          <div className="flex items-center justify-between px-2 py-4 border-t border-slate-200 dark:border-slate-700">
            <div className="text-sm text-slate-500 dark:text-slate-400">
              Showing{' '}
              <span className="font-semibold text-slate-700 dark:text-slate-200">1</span> to{' '}
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {filteredNotifications.length}
              </span>{' '}
              of{' '}
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {notifications.length}
              </span>{' '}
              notifications
            </div>
            <div className="flex items-center gap-2">
              <button
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-700 disabled:opacity-50 text-sm font-medium transition-colors"
                disabled
              >
                Previous
              </button>
              <button className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-700 text-sm font-medium transition-colors">
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
