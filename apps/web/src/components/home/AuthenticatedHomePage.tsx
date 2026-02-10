'use client';

import { useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthContext';
import { trpc } from '@/lib/trpc';
import { useActivityFeed } from '@/hooks/useActivityFeed';
import type { ActivityFeedType } from '@intelliflow/domain';
import {
  EditQuickActionsSheet, ALL_QUICK_ACTIONS, loadEnabledActions,
  EditPinnedNavigationSheet, ALL_PINNED_NAV_GROUPS, loadPinnedGroups,
  getPinnedIcon,
} from './PinnedItemsSheet';

// Activity feed type filter options — values match ActivityFeedType (IFC-069 unified feed)
const FEED_FILTER_OPTIONS = [
  { value: 'all', label: 'All Activity', icon: 'list' },
  { value: 'CALL', label: 'Calls', icon: 'call' },
  { value: 'EMAIL', label: 'Emails', icon: 'mail' },
  { value: 'MEETING', label: 'Meetings', icon: 'event' },
  { value: 'TASK', label: 'Tasks', icon: 'task_alt' },
  { value: 'DEAL', label: 'Deals', icon: 'handshake' },
  { value: 'NOTE', label: 'Notes', icon: 'sticky_note_2' },
  { value: 'TICKET', label: 'Tickets', icon: 'confirmation_number' },
] as const;

// =============================================================================
// Types (inferred from tRPC to handle date serialization)
// =============================================================================

// tRPC serializes Date as string over JSON, so we use serialized versions
type SerializedAIInsight = {
  id: string;
  type: 'warning' | 'opportunity' | 'reminder' | 'achievement';
  title: string;
  description: string;
  suggestedAction?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  actionUrl?: string | null;
  priority: 'low' | 'medium' | 'high';
  createdAt: string;
};

/** Shape of items from the unified activity feed (IFC-069), after tRPC serialization */
type UnifiedFeedItem = {
  id: string;
  source: string;
  type: string;
  title: string;
  description: string | null;
  timestamp: string; // Date serialized to string by tRPC
  actor: { id: string | null; name: string; avatarUrl?: string | null } | null;
  entity: { id: string; type: string; name: string } | null;
  metadata: Record<string, unknown> | null;
};

/** Compute relative time label from a timestamp string */
function formatRelativeTime(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

/** Derive initials from a name string */
function getInitialsFromName(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

type SerializedDailyGoal = {
  id: string;
  type: 'revenue' | 'calls' | 'meetings' | 'tasks' | 'custom';
  label: string;
  targetValue: number;
  currentValue: number;
  unit: string;
  progress: number;
  remainingToTarget: number;
  remainingFormatted: string;
};

type SerializedPinnedItem = {
  id: string;
  entityType: 'lead' | 'contact' | 'account' | 'opportunity' | 'document' | 'report' | 'list' | 'ticket';
  entityId: string;
  title: string;
  subtitle?: string | null;
  icon?: string | null;
  url: string;
  pinnedAt: string;
  position: number;
};

interface InsightIconStyle {
  icon: string;
  iconBg: string;
  iconColor: string;
}

interface ActivityIconStyle {
  initials?: string;
  icon?: string;
  bg: string;
  color: string;
}

// =============================================================================
// Helper Functions
// =============================================================================

function getGreetingIcon(hour: number): string {
  return hour < 18 ? 'wb_sunny' : 'nights_stay';
}

function getInsightIcon(type: string): InsightIconStyle {
  const iconMap: Record<string, InsightIconStyle> = {
    warning: { icon: 'warning', iconBg: 'bg-amber-100 dark:bg-amber-900/30', iconColor: 'text-amber-600 dark:text-amber-400' },
    opportunity: { icon: 'trending_up', iconBg: 'bg-emerald-100 dark:bg-emerald-900/30', iconColor: 'text-emerald-600 dark:text-emerald-400' },
    reminder: { icon: 'schedule', iconBg: 'bg-blue-100 dark:bg-blue-900/30', iconColor: 'text-blue-600 dark:text-blue-400' },
    achievement: { icon: 'emoji_events', iconBg: 'bg-purple-100 dark:bg-purple-900/30', iconColor: 'text-purple-600 dark:text-purple-400' },
  };
  return iconMap[type] || { icon: 'info', iconBg: 'bg-slate-100 dark:bg-slate-800', iconColor: 'text-slate-600 dark:text-slate-400' };
}

function getActivityIcon(type: string): ActivityIconStyle {
  const iconMap: Record<string, ActivityIconStyle> = {
    // Unified feed types (UPPERCASE — IFC-069)
    CALL: { icon: 'call_received', bg: 'bg-emerald-100 dark:bg-emerald-900', color: 'text-emerald-600 dark:text-emerald-300' },
    EMAIL: { icon: 'mail', bg: 'bg-indigo-100 dark:bg-indigo-900', color: 'text-indigo-600 dark:text-indigo-300' },
    MEETING: { icon: 'event', bg: 'bg-blue-100 dark:bg-blue-900', color: 'text-blue-600 dark:text-blue-300' },
    NOTE: { icon: 'sticky_note_2', bg: 'bg-teal-100 dark:bg-teal-900', color: 'text-teal-600 dark:text-teal-300' },
    TASK: { icon: 'task_alt', bg: 'bg-amber-100 dark:bg-amber-900', color: 'text-amber-600 dark:text-amber-300' },
    CHAT: { icon: 'chat', bg: 'bg-pink-100 dark:bg-pink-900', color: 'text-pink-600 dark:text-pink-300' },
    DOCUMENT: { icon: 'description', bg: 'bg-orange-100 dark:bg-orange-900', color: 'text-orange-600 dark:text-orange-300' },
    DEAL: { icon: 'handshake', bg: 'bg-green-100 dark:bg-green-900', color: 'text-green-600 dark:text-green-300' },
    TICKET: { icon: 'confirmation_number', bg: 'bg-rose-100 dark:bg-rose-900', color: 'text-rose-600 dark:text-rose-300' },
    STAGE_CHANGE: { icon: 'swap_horiz', bg: 'bg-violet-100 dark:bg-violet-900', color: 'text-violet-600 dark:text-violet-300' },
    STATUS_CHANGE: { icon: 'published_with_changes', bg: 'bg-sky-100 dark:bg-sky-900', color: 'text-sky-600 dark:text-sky-300' },
    SCORE_UPDATE: { icon: 'trending_up', bg: 'bg-lime-100 dark:bg-lime-900', color: 'text-lime-600 dark:text-lime-300' },
    QUALIFICATION: { icon: 'verified', bg: 'bg-cyan-100 dark:bg-cyan-900', color: 'text-cyan-600 dark:text-cyan-300' },
    AGENT_ACTION: { initials: 'AI', bg: 'bg-purple-100 dark:bg-purple-900', color: 'text-purple-600 dark:text-purple-300' },
    SLA_ALERT: { icon: 'warning', bg: 'bg-red-100 dark:bg-red-900', color: 'text-red-600 dark:text-red-300' },
    ASSIGNMENT: { icon: 'person_add', bg: 'bg-cyan-100 dark:bg-cyan-900', color: 'text-cyan-600 dark:text-cyan-300' },
    SYSTEM: { icon: 'settings', bg: 'bg-slate-200 dark:bg-slate-700', color: 'text-slate-600 dark:text-slate-300' },
  };
  return iconMap[type] || { icon: 'notifications', bg: 'bg-slate-100 dark:bg-slate-800', color: 'text-slate-600 dark:text-slate-400' };
}

function pluralize(count: number, singular: string): string {
  return count === 1 ? singular : `${singular}s`;
}

type StatsPeriod = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'all_time';

function getPeriodLabel(period: StatsPeriod | undefined): string {
  const labels: Record<StatsPeriod, string> = {
    today: 'today',
    yesterday: 'since yesterday',
    this_week: 'this week',
    this_month: 'this month',
    all_time: 'in total',
  };
  return period ? labels[period] : 'since yesterday'; // default fallback
}

function getTrendPeriodLabel(period: StatsPeriod | undefined): string {
  const labels: Record<StatsPeriod, string> = {
    today: 'today',
    yesterday: 'since yesterday',
    this_week: 'this week',
    this_month: 'this month',
    all_time: 'overall',
  };
  return period ? labels[period] : 'this week'; // default fallback
}

interface WelcomeStats {
  highPriorityTasksCount: number;
  newLeadsCount: number;
  newLeadsPeriod?: StatsPeriod; // optional for backwards compatibility
  dealClosingRateTrend: number;
  dealsTrendPeriod?: StatsPeriod; // optional for backwards compatibility
}

function buildWelcomeMessage(stats: WelcomeStats | undefined): string {
  if (!stats) return "Here's what's happening today.";

  const parts: string[] = [];

  if (stats.highPriorityTasksCount > 0) {
    parts.push(`${stats.highPriorityTasksCount} high-priority ${pluralize(stats.highPriorityTasksCount, 'task')} pending`);
  }
  if (stats.newLeadsCount > 0) {
    const periodLabel = getPeriodLabel(stats.newLeadsPeriod);
    parts.push(`${stats.newLeadsCount} new ${pluralize(stats.newLeadsCount, 'lead')} assigned to you ${periodLabel}`);
  }

  // Build the deal trend suffix
  let trendSuffix = '';
  const trendPeriod = getTrendPeriodLabel(stats.dealsTrendPeriod);
  if (stats.dealClosingRateTrend > 0) {
    trendSuffix = ` Your deal closing rate is up by ${stats.dealClosingRateTrend}% ${trendPeriod}!`;
  } else if (stats.dealClosingRateTrend < 0) {
    trendSuffix = ` Your deal closing rate is down by ${Math.abs(stats.dealClosingRateTrend)}% ${trendPeriod}.`;
  }

  if (parts.length === 0 && !trendSuffix) return "Here's what's happening today.";
  if (parts.length === 0) return `Great news!${trendSuffix}`;

  const mainParts = parts.join(' and ');
  return `You have ${mainParts}.${trendSuffix}`;
}

// =============================================================================
// Loading Skeleton Components
// =============================================================================

function InsightsSkeleton() {
  return (
    <>
      {[1, 2].map((i) => (
        <div key={i} className="flex gap-4 p-3 animate-pulse">
          <div className="w-10 h-10 rounded-lg bg-slate-200 dark:bg-slate-700" />
          <div className="flex-1">
            <div className="h-4 w-48 bg-slate-200 dark:bg-slate-700 rounded mb-2" />
            <div className="h-3 w-full bg-slate-200 dark:bg-slate-700 rounded" />
          </div>
        </div>
      ))}
    </>
  );
}

function FeedSkeleton() {
  return (
    <>
      {[1, 2, 3].map((i) => (
        <div key={i} className="p-5 animate-pulse">
          <div className="flex gap-3">
            <div className="size-10 rounded-full bg-slate-200 dark:bg-slate-700" />
            <div className="flex-1">
              <div className="h-4 w-48 bg-slate-200 dark:bg-slate-700 rounded mb-2" />
              <div className="h-3 w-full bg-slate-200 dark:bg-slate-700 rounded" />
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

function GoalSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="w-32 h-32 mx-auto rounded-full bg-slate-200 dark:bg-slate-700 mb-4" />
      <div className="h-4 w-3/4 mx-auto bg-slate-200 dark:bg-slate-700 rounded" />
    </div>
  );
}

function PinnedSkeleton() {
  return (
    <>
      {[1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3 p-2 animate-pulse">
          <div className="size-8 rounded bg-slate-200 dark:bg-slate-700" />
          <div className="flex-1">
            <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded mb-1" />
            <div className="h-3 w-20 bg-slate-200 dark:bg-slate-700 rounded" />
          </div>
        </div>
      ))}
    </>
  );
}

// =============================================================================
// Section Components
// =============================================================================

interface InsightCardProps {
  insight: SerializedAIInsight;
}

function InsightCard({ insight }: Readonly<InsightCardProps>) {
  const iconStyle = getInsightIcon(insight.type);
  return (
    <Link
      href={insight.actionUrl || '#'}
      className="flex gap-4 p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer border border-transparent hover:border-slate-100 dark:hover:border-slate-700"
    >
      <div className={`shrink-0 ${iconStyle.iconBg} ${iconStyle.iconColor} rounded-lg p-2 h-fit`}>
        <span className="material-symbols-outlined">{iconStyle.icon}</span>
      </div>
      <div>
        <h4 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">{insight.title}</h4>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          {insight.description}
          {insight.suggestedAction && (
            <span className="font-medium text-[#137fec]"> Suggested Action: {insight.suggestedAction}</span>
          )}
        </p>
      </div>
    </Link>
  );
}

interface InsightsSectionProps {
  isLoading: boolean;
  insights: SerializedAIInsight[] | undefined;
}

function InsightsSection({ isLoading, insights }: Readonly<InsightsSectionProps>) {
  if (isLoading) {
    return <InsightsSkeleton />;
  }

  if (!insights || insights.length === 0) {
    return <p className="text-sm text-slate-500 dark:text-slate-400 p-3">No insights at this time.</p>;
  }

  return (
    <>
      {insights.map((insight) => (
        <InsightCard key={insight.id} insight={insight} />
      ))}
    </>
  );
}

interface FeedItemCardProps {
  item: UnifiedFeedItem;
}

function FeedItemCard({ item }: Readonly<FeedItemCardProps>) {
  const iconStyle = getActivityIcon(item.type);
  const actorInitials = item.actor ? getInitialsFromName(item.actor.name) : null;
  const showInitials = actorInitials || iconStyle.initials;
  const relativeTime = formatRelativeTime(item.timestamp);
  // Build entity link if we have an entity reference
  const entityUrl = item.entity
    ? `/${item.entity.type.toLowerCase()}s/${item.entity.id}`
    : null;

  return (
    <div className="p-5 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
      <div className="flex gap-3">
        {showInitials ? (
          <div className={`size-10 rounded-full ${iconStyle.bg} flex items-center justify-center ${iconStyle.color} font-bold shrink-0`}>
            {actorInitials || iconStyle.initials}
          </div>
        ) : (
          <div className={`size-10 rounded-full ${iconStyle.bg} flex items-center justify-center ${iconStyle.color} shrink-0`}>
            <span className="material-symbols-outlined">{iconStyle.icon}</span>
          </div>
        )}
        <div className="flex-1">
          <div className="flex justify-between items-start">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{item.title}</p>
            <span className="text-xs text-slate-400 whitespace-nowrap">{relativeTime}</span>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{item.description || ''}</p>
          {entityUrl && (
            <Link href={entityUrl} className="mt-2 text-sm text-[#137fec] font-medium hover:underline inline-block">
              View {item.entity!.name}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

interface FeedSectionProps {
  isLoading: boolean;
  items: UnifiedFeedItem[] | undefined;
  hasMore: boolean | undefined;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
}

function FeedSection({ isLoading, items, hasMore, onLoadMore, isLoadingMore }: Readonly<FeedSectionProps>) {
  if (isLoading) {
    return <FeedSkeleton />;
  }

  if (!items || items.length === 0) {
    return (
      <div className="p-8 text-center text-slate-500 dark:text-slate-400">
        <span className="material-symbols-outlined text-4xl mb-2">inbox</span>
        <p>No recent activity</p>
      </div>
    );
  }

  return (
    <>
      {items.map((item, idx) => (
        <FeedItemCard key={`${item.id}-${idx}`} item={item} />
      ))}
      {hasMore && (
        <div className="p-4 border-t border-[#e2e8f0] dark:border-[#334155] text-center">
          <button
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="text-sm font-medium text-slate-500 hover:text-[#137fec] transition-colors disabled:opacity-50"
          >
            {isLoadingMore ? (
              <span className="flex items-center gap-2 justify-center">
                <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                Loading...
              </span>
            ) : (
              'Load More Updates'
            )}
          </button>
        </div>
      )}
    </>
  );
}

interface GoalSectionProps {
  isLoading: boolean;
  goal: SerializedDailyGoal | undefined;
}

function GoalSection({ isLoading, goal }: Readonly<GoalSectionProps>) {
  if (isLoading) {
    return <GoalSkeleton />;
  }

  const progress = goal?.progress || 0;
  const remaining = goal?.remainingFormatted || '$0';

  return (
    <>
      <div className="relative w-32 h-32 mx-auto mb-4">
        <svg className="size-full -rotate-90" viewBox="0 0 36 36">
          <path
            className="text-slate-100 dark:text-slate-800"
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
          />
          <path
            className="text-[#137fec]"
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none"
            stroke="currentColor"
            strokeDasharray={`${progress}, 100`}
            strokeWidth="3"
          />
        </svg>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
          <span className="text-2xl font-bold text-slate-900 dark:text-white">{progress}%</span>
          <p className="text-[10px] text-slate-500 uppercase font-semibold">Goal Reached</p>
        </div>
      </div>
      <p className="text-sm text-center text-slate-600 dark:text-slate-400">
        You need <span className="font-bold text-slate-900 dark:text-white">{remaining}</span> more to hit today&apos;s target.
      </p>
    </>
  );
}

function PinnedItemCard({ item }: Readonly<{ item: SerializedPinnedItem }>) {
  const customIcon = item.icon;
  const iconStyle = customIcon
    ? { icon: customIcon, iconBg: 'bg-slate-100 dark:bg-slate-800', iconColor: 'text-slate-600' }
    : getPinnedIcon(item.entityType);

  return (
    <Link
      href={item.url}
      className="flex items-center gap-3 p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors group"
    >
      <div className={`size-8 rounded ${iconStyle.iconBg} ${iconStyle.iconColor} flex items-center justify-center`}>
        <span className="material-symbols-outlined text-lg">{iconStyle.icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate group-hover:text-[#137fec]">{item.title}</p>
        {item.subtitle && <p className="text-xs text-slate-400">{item.subtitle}</p>}
      </div>
    </Link>
  );
}

function PinnedSection({ isLoading, items }: Readonly<{ isLoading: boolean; items: SerializedPinnedItem[] | undefined }>) {
  if (isLoading) {
    return <PinnedSkeleton />;
  }

  if (!items || items.length === 0) {
    return <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-4">No pinned items</p>;
  }

  return (
    <>
      {items.map((item) => (
        <PinnedItemCard key={item.id} item={item} />
      ))}
    </>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function AuthenticatedHomePage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const hour = new Date().getHours();
  const greetingIcon = getGreetingIcon(hour);

  // Local state
  const [feedFilter, setFeedFilter] = useState<string>('all');
  const [showFeedFilterMenu, setShowFeedFilterMenu] = useState(false);
  const [isQuickActionsSheetOpen, setIsQuickActionsSheetOpen] = useState(false);
  const [enabledActionIds, setEnabledActionIds] = useState<Set<string>>(() => loadEnabledActions());
  const [isPinnedNavSheetOpen, setIsPinnedNavSheetOpen] = useState(false);
  const [pinnedGroupIds, setPinnedGroupIds] = useState<Set<string>>(() => loadPinnedGroups());

  // Only fetch data when authenticated
  const queryEnabled = isAuthenticated && !authLoading;

  // Fetch data from tRPC
  const { data: welcomeData, isLoading: welcomeLoading } = trpc.home.getWelcomeSummary.useQuery(
    undefined,
    { enabled: queryEnabled }
  );
  const { data: insightsData, isLoading: insightsLoading } = trpc.home.getAIInsights.useQuery(
    undefined,
    { enabled: queryEnabled }
  );
  // Unified Activity Feed (IFC-069) — real-time via WebSocket subscriptions
  const feedTypes = useMemo(
    () => (feedFilter === 'all' ? undefined : [feedFilter as ActivityFeedType]),
    [feedFilter],
  );
  const {
    items: unifiedFeedItems,
    isLoading: feedLoading,
    isFetchingNextPage: feedFetchingNext,
    hasNextPage: feedHasMore,
    fetchNextPage: feedFetchNextPage,
  } = useActivityFeed({ limit: 5, types: feedTypes, enabled: queryEnabled });
  const { data: goalData, isLoading: goalLoading } = trpc.home.getDailyGoal.useQuery(
    undefined,
    { enabled: queryEnabled }
  );
  const { data: pinnedData, isLoading: pinnedLoading, refetch: refetchPinned } = trpc.home.getPinnedItems.useQuery(
    undefined,
    { enabled: queryEnabled }
  );

  // Mutations
  const unpinMutation = trpc.home.unpinItem.useMutation({
    onSuccess: () => {
      refetchPinned();
    },
  });

  // Callbacks
  const handleLoadMore = useCallback(() => {
    feedFetchNextPage();
  }, [feedFetchNextPage]);

  const handleFeedFilterChange = useCallback((filter: string) => {
    setFeedFilter(filter);
    setShowFeedFilterMenu(false);
  }, []);

  const handleUnpin = useCallback((entityType: string, entityId: string) => {
    unpinMutation.mutate({ entityType: entityType as any, entityId });
  }, [unpinMutation]);

  const handleQuickActionsSave = useCallback((ids: Set<string>) => {
    setEnabledActionIds(new Set(ids));
  }, []);

  const handlePinnedNavSave = useCallback((ids: Set<string>) => {
    setPinnedGroupIds(new Set(ids));
  }, []);

  const visibleQuickActions = ALL_QUICK_ACTIONS.filter((a) => enabledActionIds.has(a.id));

  // Compute enabled groups and filter pinned items by those groups
  const enabledGroups = ALL_PINNED_NAV_GROUPS.filter((g) => pinnedGroupIds.has(g.id));
  const enabledEntityTypes = new Set(enabledGroups.flatMap((g) => g.entityTypes));
  const filteredPinnedItems = pinnedData?.items?.filter((item) => enabledEntityTypes.has(item.entityType));

  // Feed items are already flattened by useActivityFeed hook
  const displayedFeedItems = unifiedFeedItems as UnifiedFeedItem[];

  const firstName = welcomeData?.userName || user?.name?.split(' ')[0] || 'there';
  const greeting = welcomeData?.greeting || 'Welcome';
  const welcomeMessage = buildWelcomeMessage(welcomeData?.stats);

  return (
    <div className="min-h-screen bg-[#f6f7f8] dark:bg-[#101922]">
      <main className="relative">
        {/* Subtle grid background pattern */}
        <div
          className="absolute inset-0 opacity-[0.015] dark:opacity-[0.03]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Crect width='40' height='40' fill='none' stroke='%23334155' stroke-width='0.5'/%3E%3C/svg%3E")`,
          }}
        />

        <div className="relative px-4 sm:px-6 lg:px-8 xl:px-12 py-6 max-w-[1800px] mx-auto">
          {/* Welcome Banner */}
          <div className="bg-gradient-to-r from-[#137fec] to-indigo-600 rounded-xl p-8 text-white shadow-lg relative overflow-hidden mb-6">
            <div className="absolute top-0 right-0 p-8 opacity-10">
              <span className="material-symbols-outlined text-9xl">waving_hand</span>
            </div>
            <div className="relative z-10 max-w-2xl">
              <div className="flex items-center gap-2 mb-2 text-blue-100">
                <span className="material-symbols-outlined text-sm">{greetingIcon}</span>
                <span className="text-sm font-medium uppercase tracking-wide">{greeting}</span>
              </div>
              <h1 className="text-3xl md:text-4xl font-bold mb-4">Welcome back, {firstName}!</h1>
              {welcomeLoading ? (
                <div className="h-6 w-3/4 bg-white/20 rounded animate-pulse" />
              ) : (
                <p className="text-lg text-blue-50 mb-6 leading-relaxed">{welcomeMessage}</p>
              )}
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/calendar"
                  className="bg-white text-[#137fec] hover:bg-blue-50 px-4 py-2 rounded-lg font-semibold text-sm transition-colors shadow-sm flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-lg">calendar_today</span> View Schedule
                </Link>
                <Link
                  href="/dashboard"
                  className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg font-semibold text-sm transition-colors backdrop-blur-sm flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-lg">dashboard</span> Go to Dashboard
                </Link>
              </div>
            </div>
          </div>

          {/* Dashboard Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 auto-rows-min">
            {/* AI Daily Insights - colSpan: 3 */}
            <div className="col-span-1 md:col-span-2 lg:col-span-3 bg-white dark:bg-[#1e2936] rounded-xl border border-[#e2e8f0] dark:border-[#334155] shadow-sm">
              <div className="p-4 border-b border-[#e2e8f0] dark:border-[#334155] flex justify-between items-center bg-indigo-50/50 dark:bg-indigo-900/10 rounded-t-xl">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-indigo-600 dark:text-indigo-400">auto_awesome</span>
                  <h3 className="font-bold text-slate-800 dark:text-slate-100">AI Daily Insights</h3>
                </div>
                <Link href="/agent-approvals" className="text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 hover:underline">View All</Link>
              </div>
              <div className="p-4 grid gap-4">
                <InsightsSection isLoading={insightsLoading} insights={insightsData?.insights} />
              </div>
            </div>

            {/* Quick Actions - colSpan: 1 */}
            <div className="col-span-1 bg-white dark:bg-[#1e2936] rounded-xl border border-[#e2e8f0] dark:border-[#334155] shadow-sm p-5">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-slate-900 dark:text-white">Quick Actions</h3>
                <button
                  onClick={() => setIsQuickActionsSheetOpen(true)}
                  className="text-slate-400 hover:text-[#137fec] transition-colors"
                  title="Edit quick actions"
                >
                  <span className="material-symbols-outlined text-sm">settings</span>
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {visibleQuickActions.map((action) => (
                  <Link
                    key={action.id}
                    href={action.href}
                    className="flex flex-col items-center justify-center p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors gap-2 group"
                  >
                    <div className={`p-2 ${action.iconBg} ${action.iconColor} rounded-full group-hover:scale-110 transition-transform`}>
                      <span className="material-symbols-outlined">{action.icon}</span>
                    </div>
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{action.label}</span>
                  </Link>
                ))}
                {visibleQuickActions.length === 0 && (
                  <p className="col-span-2 text-sm text-slate-500 dark:text-slate-400 text-center py-4">
                    No actions selected. Click settings to add some.
                  </p>
                )}
              </div>
            </div>

            {/* Your Feed - colSpan: 3, rowSpan: 2 */}
            <div className="col-span-1 md:col-span-2 lg:col-span-3 row-span-2 bg-white dark:bg-[#1e2936] rounded-xl border border-[#e2e8f0] dark:border-[#334155] shadow-sm">
              <div className="p-5 border-b border-[#e2e8f0] dark:border-[#334155] flex justify-between items-center">
                <h3 className="font-bold text-slate-900 dark:text-white">Your Feed</h3>
                <div className="relative">
                  <button
                    onClick={() => setShowFeedFilterMenu(!showFeedFilterMenu)}
                    className={`p-1 transition-colors rounded flex items-center gap-1 ${
                      feedFilter !== 'all' ? 'text-[#137fec]' : 'text-slate-400 hover:text-[#137fec]'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[20px]">filter_list</span>
                    {feedFilter !== 'all' && (
                      <span className="text-xs font-medium">
                        {FEED_FILTER_OPTIONS.find(o => o.value === feedFilter)?.label}
                      </span>
                    )}
                  </button>
                  {showFeedFilterMenu && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowFeedFilterMenu(false)} />
                      <div className="absolute right-0 top-full mt-1 z-20 bg-white dark:bg-[#1e2936] border border-[#e2e8f0] dark:border-[#334155] rounded-lg shadow-lg py-1 min-w-[160px]">
                        {FEED_FILTER_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            onClick={() => handleFeedFilterChange(option.value)}
                            className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${
                              feedFilter === option.value ? 'text-[#137fec] font-medium' : 'text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            <span className="material-symbols-outlined text-lg">{option.icon}</span>
                            {option.label}
                            {feedFilter === option.value && (
                              <span className="material-symbols-outlined text-sm ml-auto">check</span>
                            )}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div className="divide-y divide-[#e2e8f0] dark:divide-[#334155]">
                <FeedSection
                  isLoading={feedLoading}
                  items={displayedFeedItems}
                  hasMore={feedHasMore}
                  onLoadMore={handleLoadMore}
                  isLoadingMore={feedFetchingNext}
                />
              </div>
            </div>

            {/* Today's Focus - colSpan: 1 */}
            <div className="col-span-1 bg-white dark:bg-[#1e2936] rounded-xl border border-[#e2e8f0] dark:border-[#334155] shadow-sm p-5">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-slate-900 dark:text-white">Today&apos;s Focus</h3>
                <span className="text-xs font-medium bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-slate-600 dark:text-slate-400">
                  {goalData?.goal.label || 'Sales'}
                </span>
              </div>
              <GoalSection isLoading={goalLoading} goal={goalData?.goal} />
            </div>

            {/* Pinned - colSpan: 1 */}
            <div className="col-span-1 bg-white dark:bg-[#1e2936] rounded-xl border border-[#e2e8f0] dark:border-[#334155] shadow-sm p-5">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-slate-900 dark:text-white">Pinned</h3>
                <button
                  onClick={() => setIsPinnedNavSheetOpen(true)}
                  className="text-slate-400 hover:text-[#137fec] transition-colors"
                  title="Edit pinned navigation"
                >
                  <span className="material-symbols-outlined text-sm">edit</span>
                </button>
              </div>
              <div className="space-y-3">
                <PinnedSection isLoading={pinnedLoading} items={filteredPinnedItems} />
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#e2e8f0] dark:border-[#334155] bg-white dark:bg-[#1e2936]">
        <div className="px-4 sm:px-6 lg:px-8 xl:px-12 py-12 max-w-[1800px] mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8 mb-8">
            <div className="col-span-2 md:col-span-4 lg:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded bg-[#137fec] flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-white text-xl">grid_view</span>
                </div>
                <span className="text-lg font-bold text-slate-900 dark:text-white">IntelliFlow CRM</span>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                AI-powered CRM with modern automation and governance-grade validation
              </p>
              <div className="flex items-center gap-3">
                <a href="https://twitter.com/intelliflow" target="_blank" rel="noopener noreferrer" className="text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors" aria-label="Twitter">
                  <span className="text-sm font-medium">X</span>
                </a>
                <a href="https://linkedin.com/company/intelliflow" target="_blank" rel="noopener noreferrer" className="text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors" aria-label="LinkedIn">
                  <span className="text-sm font-medium">LinkedIn</span>
                </a>
                <a href="https://github.com/intelliflow" target="_blank" rel="noopener noreferrer" className="text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors" aria-label="GitHub">
                  <span className="text-sm font-medium">GitHub</span>
                </a>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Product</h3>
              <ul className="space-y-3">
                <li><Link href="/features" className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors">Features</Link></li>
                <li><Link href="/pricing" className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors">Pricing</Link></li>
                <li><Link href="/security" className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors">Security</Link></li>
                <li><Link href="/integrations" className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors">Integrations</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Company</h3>
              <ul className="space-y-3">
                <li><Link href="/about" className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors">About</Link></li>
                <li><Link href="/contact" className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors">Contact</Link></li>
                <li><Link href="/partners" className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors">Partners</Link></li>
                <li><Link href="/press" className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors">Press</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Resources</h3>
              <ul className="space-y-3">
                <li><Link href="/docs" className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors">Documentation</Link></li>
                <li><Link href="/api-docs" className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors">API Reference</Link></li>
                <li><Link href="/support" className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors">Support</Link></li>
                <li><a href="https://status.intelliflow.ai" className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors">Status</a></li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Legal</h3>
              <ul className="space-y-3">
                <li><Link href="/privacy" className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors">Privacy Policy</Link></li>
                <li><Link href="/terms" className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors">Terms of Service</Link></li>
                <li><Link href="/cookies" className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors">Cookie Policy</Link></li>
                <li><Link href="/gdpr" className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors">GDPR</Link></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-[#e2e8f0] dark:border-[#334155]">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
              <p className="text-sm text-slate-600 dark:text-slate-400">&copy; 2025 IntelliFlow CRM. All rights reserved.</p>
              <div className="flex items-center gap-6">
                <Link href="/privacy" className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors">Privacy</Link>
                <Link href="/terms" className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors">Terms</Link>
                <Link href="/cookies" className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors">Cookies</Link>
              </div>
            </div>
          </div>
        </div>
      </footer>

      {/* Edit Quick Actions Sheet */}
      <EditQuickActionsSheet
        open={isQuickActionsSheetOpen}
        onOpenChange={setIsQuickActionsSheetOpen}
        onSave={handleQuickActionsSave}
      />

      {/* Edit Pinned Navigation Sheet */}
      <EditPinnedNavigationSheet
        open={isPinnedNavSheetOpen}
        onOpenChange={setIsPinnedNavSheetOpen}
        onSave={handlePinnedNavSave}
        pinnedItems={pinnedData?.items}
        onUnpin={handleUnpin}
      />

    </div>
  );
}
