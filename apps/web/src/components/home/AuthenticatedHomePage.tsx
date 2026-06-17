'use client';

import { useState, useCallback, useMemo, lazy, Suspense } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useAuth } from '@/lib/auth/AuthContext';
import { trpc } from '@/lib/trpc';
import { PinnedSkeleton } from './PinnedSkeleton';
import {
  ActivityFeed,
  ActivityFeedTypeFilter,
  ActivityFeedStatsBar,
  type ActivityFeedTypeFilterValue,
} from '@/components/shared/activity-feed';
import type { ActivityFeedType } from '@intelliflow/domain';
import type { PinnableEntityType } from '@intelliflow/validators';
import { toast, EmptyState } from '@intelliflow/ui';
import {
  trackWelcomeCtaClick,
  trackInsightClick,
  trackInsightsViewAllClick,
  trackQuickActionClick,
  trackQuickActionsSettingsOpened,
  trackFeedFilterChange,
  trackFeedViewAllClick,
  trackGoalSettingsOpened,
  trackPinnedItemClick,
  trackPinnedItemUnpin,
  trackPinnedItemsReorder,
  trackPinnedNavSettingsOpened,
} from '@/lib/analytics';
import {
  ALL_QUICK_ACTIONS,
  loadEnabledActions,
  ALL_PINNED_NAV_GROUPS,
  loadPinnedGroups,
} from './PinnedItemsSheet';
import { InsightCard, type SerializedAIInsight } from '@/components/insights/InsightCard';

// Defer @dnd-kit chunk until after initial paint (PERF-05)
const PinnedItemsDndRegion = dynamic(
  () => import('./PinnedItemsDndRegion').then((m) => ({ default: m.PinnedSection })),
  { ssr: false, loading: () => <PinnedSkeleton /> }
);

// Lazy-load heavy modals/sheets — only needed on user click (PG-166 TTI optimization)
const EditQuickActionsSheet = lazy(() =>
  import('./PinnedItemsSheet').then((m) => ({ default: m.EditQuickActionsSheet }))
);
const EditPinnedNavigationSheet = lazy(() =>
  import('./PinnedItemsSheet').then((m) => ({ default: m.EditPinnedNavigationSheet }))
);
const GoalSettingsModal = lazy(() =>
  import('./GoalSettingsModal').then((m) => ({ default: m.GoalSettingsModal }))
);

// =============================================================================
// Types (inferred from tRPC to handle date serialization)
// =============================================================================

// SerializedAIInsight imported from @/components/insights/InsightCard

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

export type SerializedPinnedItem = {
  id: string;
  entityType:
    | 'lead'
    | 'contact'
    | 'account'
    | 'opportunity'
    | 'document'
    | 'report'
    | 'list'
    | 'ticket';
  entityId: string;
  title: string;
  subtitle?: string | null;
  icon?: string | null;
  url: string;
  pinnedAt: string;
  position: number;
  isAvailable?: boolean;
};

// InsightIconStyle and getInsightIcon imported from @/components/insights/insights-utils

// =============================================================================
// Helper Functions
// =============================================================================

function getGreetingIcon(hour: number): string {
  return hour < 18 ? 'wb_sunny' : 'nights_stay';
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
    parts.push(
      `${stats.highPriorityTasksCount} high-priority ${pluralize(stats.highPriorityTasksCount, 'task')} pending`
    );
  }
  if (stats.newLeadsCount > 0) {
    const periodLabel = getPeriodLabel(stats.newLeadsPeriod);
    parts.push(
      `${stats.newLeadsCount} new ${pluralize(stats.newLeadsCount, 'lead')} assigned to you ${periodLabel}`
    );
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

function GoalSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="w-32 h-32 mx-auto rounded-full bg-slate-200 dark:bg-slate-700 mb-4" />
      <div className="h-4 w-3/4 mx-auto bg-slate-200 dark:bg-slate-700 rounded" />
    </div>
  );
}

// =============================================================================
// Section Components
// =============================================================================

// InsightCard imported from @/components/insights/InsightCard

interface InsightsSectionProps {
  isLoading: boolean;
  insights: SerializedAIInsight[] | undefined;
  onInsightClick?: (insight: SerializedAIInsight) => void;
}

function InsightsSection({ isLoading, insights, onInsightClick }: Readonly<InsightsSectionProps>) {
  if (isLoading) {
    return <InsightsSkeleton />;
  }

  if (!insights || insights.length === 0) {
    return <EmptyState entity="insights" phase="passive" className="py-4" />;
  }

  return (
    <>
      {insights.map((insight) => (
        <InsightCard key={insight.id} insight={insight} onClick={onInsightClick} />
      ))}
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
        {}
        {}
        <svg
          className="size-full -rotate-90"
          viewBox="0 0 36 36"
          aria-label={`${progress}% of ${goal?.label || 'goal'} target reached`}
        >
          <title>{`${progress}% of ${goal?.label || 'goal'} target reached`}</title>
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
          <p className="text-[10px] text-slate-500 uppercase font-semibold">
            {goal?.label || 'Goal Reached'}
          </p>
        </div>
      </div>
      <p className="text-sm text-center text-slate-600 dark:text-slate-400">
        You need <span className="font-bold text-slate-900 dark:text-white">{remaining}</span> more
        to hit today&apos;s target.
      </p>
    </>
  );
}

// =============================================================================
// Main Component
// =============================================================================

interface AuthenticatedHomePageProps {
  /**
   * Welcome summary prefetched server-side by `(public)/page.tsx` and passed
   * through the RSC → client boundary. Used as `initialData` for the React
   * Query cache so the greeting, user name, and stats are in the initial SSR
   * HTML — no client-side hydration flash for authenticated users.
   *
   * `unknown` because the server sends the payload as a JSON-serialised blob
   * (Date → string roundtrip at the RSC boundary); the tRPC client infers the
   * real shape from the query itself.
   */
  initialWelcomeData?: unknown;
}

export function AuthenticatedHomePage({ initialWelcomeData }: AuthenticatedHomePageProps = {}) {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const hour = new Date().getUTCHours();
  const greetingIcon = getGreetingIcon(hour);

  // Local state
  const [feedFilter, setFeedFilter] = useState<ActivityFeedTypeFilterValue>('all');
  const [isQuickActionsSheetOpen, setIsQuickActionsSheetOpen] = useState(false);
  const [enabledActionIds, setEnabledActionIds] = useState<Set<string>>(() => loadEnabledActions());
  const [isPinnedNavSheetOpen, setIsPinnedNavSheetOpen] = useState(false);
  const [pinnedGroupIds, setPinnedGroupIds] = useState<Set<string>>(() => loadPinnedGroups());
  const [isGoalSettingsOpen, setIsGoalSettingsOpen] = useState(false);

  // Only fetch data when authenticated. Server-side prefetch means the query
  // cache is already populated with initialWelcomeData, but the enabled flag
  // stays true so stale data refetches in the background.
  const queryEnabled = isAuthenticated && !authLoading;

  // Fetch data from tRPC. `initialData` comes from the RSC server-render when
  // available, eliminating the empty-greeting flash on first paint.
  const { data: welcomeData, isLoading: welcomeLoading } = trpc.home.getWelcomeSummary.useQuery(
    undefined,
    {
      enabled: queryEnabled,
      ...(initialWelcomeData !== undefined && initialWelcomeData !== null
        ? { initialData: initialWelcomeData as never }
        : {}),
    }
  );
  const { data: insightsData, isLoading: insightsLoading } = trpc.home.getAIInsights.useQuery(
    undefined,
    { enabled: queryEnabled }
  );
  // Unified Activity Feed (IFC-069) — filter types computed from dropdown
  const feedTypes = useMemo(
    () => (feedFilter === 'all' ? undefined : [feedFilter as ActivityFeedType]),
    [feedFilter]
  );
  const { data: goalData, isLoading: goalLoading } = trpc.home.getDailyGoal.useQuery(undefined, {
    enabled: queryEnabled,
  });
  const {
    data: pinnedData,
    isLoading: pinnedLoading,
    refetch: refetchPinned,
  } = trpc.home.getPinnedItems.useQuery(undefined, { enabled: queryEnabled });

  // Mutations
  const unpinMutation = trpc.home.unpinItem.useMutation({
    onSuccess: () => {
      refetchPinned();
    },
  });

  const reorderMutation = trpc.home.reorderPinnedItems.useMutation({
    onSuccess: () => refetchPinned(),
    onError: () => refetchPinned(),
  });

  const handleReorder = useCallback(
    (items: SerializedPinnedItem[]) => {
      trackPinnedItemsReorder(items.length);
      reorderMutation.mutate({
        items: items.map((item, i) => ({
          entityType: item.entityType,
          entityId: item.entityId,
          position: i,
        })),
      });
    },
    [reorderMutation]
  );

  // Callbacks
  const handleUnpin = useCallback(
    (entityType: string, entityId: string) => {
      trackPinnedItemUnpin(entityType);
      unpinMutation.mutate({ entityType: entityType as PinnableEntityType, entityId });
    },
    [unpinMutation]
  );

  const handleQuickActionsSave = useCallback((ids: Set<string>) => {
    setEnabledActionIds(new Set(ids));
  }, []);

  const handlePinnedNavSave = useCallback((ids: Set<string>) => {
    setPinnedGroupIds(new Set(ids));
  }, []);

  const handleFeedFilterChange = useCallback(
    (newValue: ActivityFeedTypeFilterValue) => {
      trackFeedFilterChange(newValue, feedFilter);
      setFeedFilter(newValue);
    },
    [feedFilter]
  );

  const handleInsightClick = useCallback((insight: SerializedAIInsight) => {
    trackInsightClick(insight.id, insight.type, insight.priority);
  }, []);

  const handlePinnedItemClick = useCallback((entityType: string, entityId: string) => {
    trackPinnedItemClick(entityType, entityId);
  }, []);

  const allEnabledActions = ALL_QUICK_ACTIONS.filter((a) => enabledActionIds.has(a.id));
  const insightCount = insightsData?.insights?.length ?? 0;
  // When insights < 4, cap quick actions at 4 to prevent the card from
  // expanding beyond the insights card and leaving empty space.
  const visibleQuickActions =
    insightCount < 4 && allEnabledActions.length > 4
      ? allEnabledActions.slice(0, 4)
      : allEnabledActions;

  // Compute enabled groups and filter pinned items by those groups
  const enabledGroups = ALL_PINNED_NAV_GROUPS.filter((g) => pinnedGroupIds.has(g.id));
  const enabledEntityTypes = new Set(enabledGroups.flatMap((g) => g.entityTypes));
  const filteredPinnedItems = pinnedData?.items?.filter((item) =>
    enabledEntityTypes.has(item.entityType)
  );

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
              <span className="material-symbols-outlined text-9xl" aria-hidden="true">
                waving_hand
              </span>
            </div>
            <div className="relative z-10 max-w-2xl">
              <div className="flex items-center gap-2 mb-2 text-blue-100">
                <span className="material-symbols-outlined text-sm" aria-hidden="true">
                  {greetingIcon}
                </span>
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
                  onClick={() => trackWelcomeCtaClick('View Schedule', '/calendar')}
                  className="bg-white text-[#137fec] hover:bg-blue-50 px-4 py-2 rounded-lg font-semibold text-sm transition-colors shadow-sm flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-lg" aria-hidden="true">
                    calendar_today
                  </span>{' '}
                  View Schedule
                </Link>
                <Link
                  href="/dashboard"
                  onClick={() => trackWelcomeCtaClick('Go to Dashboard', '/dashboard')}
                  className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg font-semibold text-sm transition-colors backdrop-blur-sm flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-lg" aria-hidden="true">
                    dashboard
                  </span>{' '}
                  Go to Dashboard
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
                  <span
                    className="material-symbols-outlined text-indigo-600 dark:text-indigo-400"
                    aria-hidden="true"
                  >
                    auto_awesome
                  </span>
                  <h2 className="font-bold text-slate-800 dark:text-slate-100">Insights</h2>
                </div>
                <Link
                  href="/agent-approvals/insights"
                  onClick={() => trackInsightsViewAllClick()}
                  className="text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 hover:underline"
                >
                  View All
                </Link>
              </div>
              <div className="p-4 grid gap-4">
                <InsightsSection
                  isLoading={insightsLoading}
                  insights={insightsData?.insights}
                  onInsightClick={handleInsightClick}
                />
              </div>
            </div>

            {/* Quick Actions - colSpan: 1 */}
            <div className="col-span-1 bg-white dark:bg-[#1e2936] rounded-xl border border-[#e2e8f0] dark:border-[#334155] shadow-sm p-5">
              <div className="flex justify-between items-center mb-4">
                <h2 className="font-bold text-slate-900 dark:text-white">Quick Actions</h2>
                <button
                  onClick={() => {
                    trackQuickActionsSettingsOpened();
                    setIsQuickActionsSheetOpen(true);
                  }}
                  className="text-slate-400 hover:text-[#137fec] transition-colors"
                  aria-label="Edit quick actions"
                >
                  <span className="material-symbols-outlined text-sm" aria-hidden="true">
                    settings
                  </span>
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {visibleQuickActions.map((action) => {
                  const cardClassName =
                    'flex flex-col items-center justify-center p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors gap-2 group';
                  const inner = (
                    <>
                      <div
                        className={`p-2 ${action.iconBg} ${action.iconColor} rounded-full group-hover:scale-110 transition-transform`}
                      >
                        <span className="material-symbols-outlined" aria-hidden="true">
                          {action.icon}
                        </span>
                      </div>
                      <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                        {action.label}
                      </span>
                    </>
                  );

                  if (action.comingSoon) {
                    return (
                      <button
                        key={action.id}
                        type="button"
                        className={cardClassName}
                        onClick={() => {
                          trackQuickActionClick(action.id, action.label, true);
                          toast({
                            description: `${action.label} is coming soon! This feature is under development.`,
                          });
                        }}
                      >
                        {inner}
                      </button>
                    );
                  }

                  return (
                    <Link
                      key={action.id}
                      href={action.href}
                      onClick={() => trackQuickActionClick(action.id, action.label, false)}
                      className={cardClassName}
                    >
                      {inner}
                    </Link>
                  );
                })}
                {visibleQuickActions.length === 0 && (
                  <div className="col-span-2">
                    <EmptyState entity="pinned" phase="passive" className="py-2" />
                  </div>
                )}
              </div>
            </div>

            {/* Your Feed - colSpan: 3, rowSpan: 2 */}
            <div className="col-span-1 md:col-span-2 lg:col-span-3 row-span-2 bg-white dark:bg-[#1e2936] rounded-xl border border-[#e2e8f0] dark:border-[#334155] shadow-sm">
              <div className="p-5 border-b border-[#e2e8f0] dark:border-[#334155] flex justify-between items-center">
                <h2 className="font-bold text-slate-900 dark:text-white">Your Feed</h2>
                <div className="flex items-center gap-2">
                  <ActivityFeedTypeFilter value={feedFilter} onChange={handleFeedFilterChange} />
                  <Link
                    href="/activity"
                    onClick={() => trackFeedViewAllClick()}
                    className="text-sm text-ds-primary hover:underline"
                  >
                    View All
                  </Link>
                </div>
              </div>
              {/* IFC-202: Activity stats summary */}
              <div className="px-5 py-2.5 border-b border-[#e2e8f0] dark:border-[#334155] bg-slate-50/50 dark:bg-slate-800/20">
                <ActivityFeedStatsBar timeWindow="7d" enabled={queryEnabled} maxTypes={4} />
              </div>
              <ActivityFeed types={feedTypes} limit={20} enabled={queryEnabled} height={440} />
            </div>

            {/* Today's Focus - colSpan: 1 */}
            <div className="col-span-1 bg-white dark:bg-[#1e2936] rounded-xl border border-[#e2e8f0] dark:border-[#334155] shadow-sm p-5">
              <div className="flex justify-between items-center mb-4">
                <h2 className="font-bold text-slate-900 dark:text-white">Today&apos;s Focus</h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-slate-600 dark:text-slate-400">
                    {goalData?.goal.label || 'Sales'}
                  </span>
                  <button
                    onClick={() => {
                      trackGoalSettingsOpened();
                      setIsGoalSettingsOpen(true);
                    }}
                    className="text-slate-400 hover:text-[#137fec] transition-colors"
                    aria-label="Goal settings"
                    data-testid="goal-settings-button"
                  >
                    <span className="material-symbols-outlined text-sm" aria-hidden="true">
                      settings
                    </span>
                  </button>
                </div>
              </div>
              <GoalSection isLoading={goalLoading} goal={goalData?.goal} />
            </div>

            {/* Pinned - colSpan: 1 */}
            <div className="col-span-1 bg-white dark:bg-[#1e2936] rounded-xl border border-[#e2e8f0] dark:border-[#334155] shadow-sm p-5">
              <div className="flex justify-between items-center mb-3">
                <h2 className="font-bold text-slate-900 dark:text-white">Pinned</h2>
                <button
                  onClick={() => {
                    trackPinnedNavSettingsOpened();
                    setIsPinnedNavSheetOpen(true);
                  }}
                  className="text-slate-400 hover:text-[#137fec] transition-colors"
                  aria-label="Edit pinned navigation"
                >
                  <span className="material-symbols-outlined text-sm" aria-hidden="true">
                    edit
                  </span>
                </button>
              </div>
              <div className="space-y-3">
                <PinnedItemsDndRegion
                  isLoading={pinnedLoading}
                  items={filteredPinnedItems}
                  onReorder={handleReorder}
                  onUnpin={handleUnpin}
                  onItemClick={handlePinnedItemClick}
                />
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Lazy-loaded modals (PG-166 TTI optimization) */}
      <Suspense fallback={null}>
        <EditQuickActionsSheet
          open={isQuickActionsSheetOpen}
          onOpenChange={setIsQuickActionsSheetOpen}
          onSave={handleQuickActionsSave}
        />
        <EditPinnedNavigationSheet
          open={isPinnedNavSheetOpen}
          onOpenChange={setIsPinnedNavSheetOpen}
          onSave={handlePinnedNavSave}
          pinnedItems={pinnedData?.items}
          onUnpin={handleUnpin}
        />
        <GoalSettingsModal
          open={isGoalSettingsOpen}
          onOpenChange={setIsGoalSettingsOpen}
          currentGoal={goalData?.goal}
        />
      </Suspense>
    </div>
  );
}
