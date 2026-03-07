'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthContext';
import { trpc } from '@/lib/trpc';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { DraggablePinnedItem } from './DraggablePinnedItem';
import {
  ActivityFeed,
  ActivityFeedTypeFilter,
  type ActivityFeedTypeFilterValue,
} from '@/components/shared/activity-feed';
import type { ActivityFeedType } from '@intelliflow/domain';
import type { PinnableEntityType } from '@intelliflow/validators';
import { toast } from '@intelliflow/ui';
import {
  EditQuickActionsSheet,
  ALL_QUICK_ACTIONS,
  loadEnabledActions,
  EditPinnedNavigationSheet,
  ALL_PINNED_NAV_GROUPS,
  loadPinnedGroups,
} from './PinnedItemsSheet';
import { GoalSettingsModal } from './GoalSettingsModal';
import { InsightCard, type SerializedAIInsight } from '@/components/insights/InsightCard';

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

// InsightCard imported from @/components/insights/InsightCard

interface InsightsSectionProps {
  isLoading: boolean;
  insights: SerializedAIInsight[] | undefined;
}

function InsightsSection({ isLoading, insights }: Readonly<InsightsSectionProps>) {
  if (isLoading) {
    return <InsightsSkeleton />;
  }

  if (!insights || insights.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400 p-3">No insights at this time.</p>
    );
  }

  return (
    <>
      {insights.map((insight) => (
        <InsightCard key={insight.id} insight={insight} />
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
        <svg
          className="size-full -rotate-90"
          viewBox="0 0 36 36"
          role="img"
          aria-labelledby="goal-progress-title"
        >
          <title id="goal-progress-title">{`${progress}% of ${goal?.label || 'goal'} target reached`}</title>
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

function PinnedSection({
  isLoading,
  items,
  onReorder,
  onUnpin,
}: Readonly<{
  isLoading: boolean;
  items: SerializedPinnedItem[] | undefined;
  onReorder: (reorderedItems: SerializedPinnedItem[]) => void;
  onUnpin?: (entityType: string, entityId: string) => void;
}>) {
  const [orderedItems, setOrderedItems] = useState<SerializedPinnedItem[]>(items ?? []);

  useEffect(() => {
    setOrderedItems(items ?? []);
  }, [items]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const sortableIds = orderedItems.map((item) => `${item.entityType}-${item.entityId}`);

  function handleDragEnd(event: Readonly<DragEndEvent>) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = sortableIds.indexOf(String(active.id));
    const newIndex = sortableIds.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;

    const newItems = arrayMove(orderedItems, oldIndex, newIndex);
    setOrderedItems(newItems);
    onReorder(newItems);
  }

  if (isLoading) {
    return <PinnedSkeleton />;
  }

  if (!items || items.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-4">No pinned items</p>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
        {orderedItems.map((item) => (
          <DraggablePinnedItem
            key={`${item.entityType}-${item.entityId}`}
            item={item}
            onUnpin={onUnpin}
          />
        ))}
      </SortableContext>
    </DndContext>
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
  const [feedFilter, setFeedFilter] = useState<ActivityFeedTypeFilterValue>('all');
  const [isQuickActionsSheetOpen, setIsQuickActionsSheetOpen] = useState(false);
  const [enabledActionIds, setEnabledActionIds] = useState<Set<string>>(() => loadEnabledActions());
  const [isPinnedNavSheetOpen, setIsPinnedNavSheetOpen] = useState(false);
  const [pinnedGroupIds, setPinnedGroupIds] = useState<Set<string>>(() => loadPinnedGroups());
  const [isGoalSettingsOpen, setIsGoalSettingsOpen] = useState(false);

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
      unpinMutation.mutate({ entityType: entityType as PinnableEntityType, entityId });
    },
    [unpinMutation]
  );

  const handleQuickActionsSave = useCallback((ids: Readonly<Set<string>>) => {
    setEnabledActionIds(new Set(ids));
  }, []);

  const handlePinnedNavSave = useCallback((ids: Readonly<Set<string>>) => {
    setPinnedGroupIds(new Set(ids));
  }, []);

  const visibleQuickActions = ALL_QUICK_ACTIONS.filter((a) => enabledActionIds.has(a.id));

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
                  className="bg-white text-[#137fec] hover:bg-blue-50 px-4 py-2 rounded-lg font-semibold text-sm transition-colors shadow-sm flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-lg" aria-hidden="true">
                    calendar_today
                  </span>{' '}
                  View Schedule
                </Link>
                <Link
                  href="/dashboard"
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
                  <h2 className="font-bold text-slate-800 dark:text-slate-100">
                    AI Daily Insights
                  </h2>
                </div>
                <Link
                  href="/agent-approvals/insights"
                  className="text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 hover:underline"
                >
                  View All
                </Link>
              </div>
              <div className="p-4 grid gap-4">
                <InsightsSection isLoading={insightsLoading} insights={insightsData?.insights} />
              </div>
            </div>

            {/* Quick Actions - colSpan: 1 */}
            <div className="col-span-1 bg-white dark:bg-[#1e2936] rounded-xl border border-[#e2e8f0] dark:border-[#334155] shadow-sm p-5">
              <div className="flex justify-between items-center mb-4">
                <h2 className="font-bold text-slate-900 dark:text-white">Quick Actions</h2>
                <button
                  onClick={() => setIsQuickActionsSheetOpen(true)}
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
                        onClick={() =>
                          toast({
                            description: `${action.label} is coming soon! This feature is under development.`,
                          })
                        }
                      >
                        {inner}
                      </button>
                    );
                  }

                  return (
                    <Link key={action.id} href={action.href} className={cardClassName}>
                      {inner}
                    </Link>
                  );
                })}
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
                <h2 className="font-bold text-slate-900 dark:text-white">Your Feed</h2>
                <ActivityFeedTypeFilter value={feedFilter} onChange={setFeedFilter} />
              </div>
              <ActivityFeed types={feedTypes} limit={20} enabled={queryEnabled} height={480} />
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
                    onClick={() => setIsGoalSettingsOpen(true)}
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
                  onClick={() => setIsPinnedNavSheetOpen(true)}
                  className="text-slate-400 hover:text-[#137fec] transition-colors"
                  aria-label="Edit pinned navigation"
                >
                  <span className="material-symbols-outlined text-sm" aria-hidden="true">
                    edit
                  </span>
                </button>
              </div>
              <div className="space-y-3">
                <PinnedSection
                  isLoading={pinnedLoading}
                  items={filteredPinnedItems}
                  onReorder={handleReorder}
                  onUnpin={handleUnpin}
                />
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
                  <span className="material-symbols-outlined text-white text-xl" aria-hidden="true">
                    grid_view
                  </span>
                </div>
                <span className="text-lg font-bold text-slate-900 dark:text-white">
                  IntelliFlow CRM
                </span>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                AI-powered CRM with modern automation and governance-grade validation
              </p>
              <div className="flex items-center gap-3">
                <a
                  href="https://twitter.com/intelliflow"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors"
                  aria-label="Twitter"
                >
                  <span className="text-sm font-medium">X</span>
                </a>
                <a
                  href="https://linkedin.com/company/intelliflow"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors"
                  aria-label="LinkedIn"
                >
                  <span className="text-sm font-medium">LinkedIn</span>
                </a>
                <a
                  href="https://github.com/intelliflow"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors"
                  aria-label="GitHub"
                >
                  <span className="text-sm font-medium">GitHub</span>
                </a>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Product</h3>
              <ul className="space-y-3">
                <li>
                  <Link
                    href="/features"
                    className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors"
                  >
                    Features
                  </Link>
                </li>
                <li>
                  <Link
                    href="/pricing"
                    className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors"
                  >
                    Pricing
                  </Link>
                </li>
                <li>
                  <Link
                    href="/security"
                    className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors"
                  >
                    Security
                  </Link>
                </li>
                <li>
                  <Link
                    href="/integrations"
                    className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors"
                  >
                    Integrations
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Company</h3>
              <ul className="space-y-3">
                <li>
                  <Link
                    href="/about"
                    className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors"
                  >
                    About
                  </Link>
                </li>
                <li>
                  <Link
                    href="/contact"
                    className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors"
                  >
                    Contact
                  </Link>
                </li>
                <li>
                  <Link
                    href="/partners"
                    className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors"
                  >
                    Partners
                  </Link>
                </li>
                <li>
                  <Link
                    href="/press"
                    className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors"
                  >
                    Press
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">
                Resources
              </h3>
              <ul className="space-y-3">
                <li>
                  <Link
                    href="/docs"
                    className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors"
                  >
                    Documentation
                  </Link>
                </li>
                <li>
                  <Link
                    href="/api-docs"
                    className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors"
                  >
                    API Reference
                  </Link>
                </li>
                <li>
                  <Link
                    href="/support"
                    className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors"
                  >
                    Support
                  </Link>
                </li>
                <li>
                  <a
                    href="https://status.intelliflow.ai"
                    className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors"
                  >
                    Status
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Legal</h3>
              <ul className="space-y-3">
                <li>
                  <Link
                    href="/privacy"
                    className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors"
                  >
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link
                    href="/terms"
                    className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors"
                  >
                    Terms of Service
                  </Link>
                </li>
                <li>
                  <Link
                    href="/cookies"
                    className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors"
                  >
                    Cookie Policy
                  </Link>
                </li>
                <li>
                  <Link
                    href="/gdpr"
                    className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors"
                  >
                    GDPR
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-[#e2e8f0] dark:border-[#334155]">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                &copy; 2025 IntelliFlow CRM. All rights reserved.
              </p>
              <div className="flex items-center gap-6">
                <Link
                  href="/privacy"
                  className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors"
                >
                  Privacy
                </Link>
                <Link
                  href="/terms"
                  className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors"
                >
                  Terms
                </Link>
                <Link
                  href="/cookies"
                  className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors"
                >
                  Cookies
                </Link>
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

      {/* Goal Settings Modal (IFC-195) */}
      <GoalSettingsModal
        open={isGoalSettingsOpen}
        onOpenChange={setIsGoalSettingsOpen}
        currentGoal={goalData?.goal}
      />
    </div>
  );
}
