'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { EntityHoverCard } from '@/components/shared/entity-hover-card';
import {
  Card,
  toast,
  type ChurnRiskData,
  type NextBestActionData,
  EmptyState,
} from '@intelliflow/ui';
import { api } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { useTimezoneContext } from '@/providers/TimezoneProvider';
import { revalidateContactCaches } from '../actions';
import { EntityActionSheet } from '@/components/shared/entity-action-sheet';
import { MoreActionsButton } from '@/components/shared/more-actions-button';
import { PinButton } from '@/components/home/PinButton';
import { AppAvatar } from '@/components/shared/app-avatar';
import { RelatedTasksCard } from '@/components/tasks/RelatedTasksCard';
import { UpcomingEventsCard } from '@/components/shared';

import {
  ActivityFeed,
  ActivityFeedItem,
  ActivityFeedItemActions,
} from '@/components/shared/activity-feed';
import { useActivityFeed } from '@/hooks/useActivityFeed';
import { useActivityDeepLink, isDeepLinkedActivity } from '@/hooks/useActivityDeepLink';
import { useActivityReactions } from '@/hooks/useActivityReactions';
import { useActivityComments } from '@/hooks/useActivityComments';
import { QuickLogComposer } from '@/components/shared/quick-log-composer';
// IFC-312 ÔÇö AI chain UI surfaces
import { SuggestedTagsRow } from '@/components/shared/SuggestedTagsRow';
import { ReplyDraftsPanel } from '@/components/contacts/ReplyDraftsPanel';
import { ContactRelatedTabs } from '@/components/contacts/ContactRelatedTabs';
import { ContactQuickActions } from '@/components/contacts/ContactQuickActions';
import { ContactAddDealButton } from '@/components/contacts/ContactAddDealButton';
import { ContactMapPreview } from '@/components/contacts/ContactMapPreview';
import {
  formatContactDate,
  formatContactRelativeTime,
} from '@/components/contacts/contact-date-format';

// Common nullable date type
import {
  activityTypeFilters,
  ContactStatusBadge,
  getStageColor,
  getActivityIcon,
  getActivityIconBg,
  getSentimentColor,
  getSentimentTrendStyle,
  getSentimentEmoji,
  renderRichPreview,
  ContactLoadingSkeleton,
  ContactAuthRedirect,
  ContactNotFoundError,
  transformFeedToActivities,
  transformContactForUI,
  filterContactActivities,
  type TabId,
  type Tab,
  type ActivityType,
  type Activity,
  type ContactWithRelations,
} from '@/components/contacts/contact-360';
import {
  resolveNextBestActionType,
  resolveNextBestActionPriority,
  ContactAiInsightsTab,
  ContactAiSummaryCard,
  buildChurnRiskData,
} from '@/components/contacts/contact-insights';

type ContactPageQueryError =
  | {
      data?: { code?: string } | null;
      message?: string;
    }
  | null
  | undefined;

function isUnauthorizedContactError(error: ContactPageQueryError): boolean {
  const message = error?.message?.toLowerCase() ?? '';

  return (
    error?.data?.code === 'UNAUTHORIZED' ||
    message.includes('authentication') ||
    message.includes('unauthorized') ||
    false
  );
}

function shouldRequestLinkedInsightReview(
  insightId: string | null,
  requiresApproval: boolean,
  lastRequestedInsightId: string | null
): boolean {
  return Boolean(insightId && requiresApproval && lastRequestedInsightId !== insightId);
}

function useRedirectOnUnauthorizedContactError(params: {
  error: ContactPageQueryError;
  isAuthError: boolean;
  isLoading: boolean;
  authLoading: boolean;
  router: ReturnType<typeof useRouter>;
}) {
  const { error, isAuthError, isLoading, authLoading, router } = params;

  useEffect(() => {
    if (error && isAuthError && !isLoading && !authLoading) {
      router.replace('/login');
    }
  }, [error, isAuthError, isLoading, authLoading, router]);
}

function useEnsureLinkedInsightReview(params: {
  insightIdParam: string | null;
  linkedInsightRequiresApproval: boolean;
  reviewRequestedInsightRef: React.RefObject<string | null>;
  ensureInsightReviewMutation: { mutate: (input: { insightId: string }) => void };
}) {
  const {
    insightIdParam,
    linkedInsightRequiresApproval,
    reviewRequestedInsightRef,
    ensureInsightReviewMutation,
  } = params;

  useEffect(() => {
    if (
      !shouldRequestLinkedInsightReview(
        insightIdParam,
        linkedInsightRequiresApproval,
        reviewRequestedInsightRef.current
      )
    ) {
      return;
    }

    if (!insightIdParam) {
      return;
    }

    reviewRequestedInsightRef.current = insightIdParam;
    ensureInsightReviewMutation.mutate({ insightId: insightIdParam });
  }, [
    insightIdParam,
    linkedInsightRequiresApproval,
    reviewRequestedInsightRef,
    ensureInsightReviewMutation,
  ]);
}

const CONTACT_VALID_TABS: TabId[] = [
  'overview',
  'activity',
  'tasks',
  'deals',
  'tickets',
  'documents',
  'notes',
  'ai-insights',
];

function resolveInitialContactTab(tabParam: TabId | null): TabId {
  return tabParam && CONTACT_VALID_TABS.includes(tabParam) ? tabParam : 'overview';
}

function shouldDismissStaleInsight(
  fromInsight: boolean,
  insightIdParam: string | null,
  errorCode: string | undefined,
  isLoading: boolean,
  contact: unknown,
  alreadyDismissed: boolean
): boolean {
  if (!fromInsight || !insightIdParam || alreadyDismissed) return false;
  return errorCode === 'NOT_FOUND' || (!isLoading && !contact);
}

/**
 * Pick the loading / auth-error / not-found screen to show before the main
 * detail render. Pulled out of Contact360Page to keep its cognitive complexity
 * under sonar-guard's threshold; render order and copy are unchanged.
 */

function pickContactLoadingScreen(args: {
  isLoading: boolean;
  error: unknown;
  isAuthError: boolean;
  hasContact: boolean;
  fromInsight: boolean;
}): React.ReactElement | null {
  if (args.isLoading) return <ContactLoadingSkeleton />;
  if (args.error && args.isAuthError) return <ContactAuthRedirect />;
  const isHardError = (args.error && !args.isAuthError) || !args.hasContact;
  return isHardError ? <ContactNotFoundError fromInsight={args.fromInsight} /> : null;
}

export default function Contact360Page() {
  // Get contact ID from URL params
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const utils = api.useUtils();
  const contactId = params.id as string;
  const insightIdParam = searchParams.get('insightId');
  const { timezone } = useTimezoneContext();

  // Require authentication - redirects to login if not authenticated
  const { isLoading: authLoading, isAuthenticated, user } = useRequireAuth();

  // Fetch contact data from API
  const {
    data: rawApiContact,
    isLoading,
    error,
  } = api.contact.getById.useQuery(
    { id: contactId },
    { enabled: isAuthenticated && !authLoading && !!contactId }
  );
  const { data: linkedInsightResponse } = api.home.getInsightById.useQuery(
    { insightId: insightIdParam ?? '' },
    { enabled: isAuthenticated && !authLoading && !!insightIdParam }
  );
  const linkedInsight = linkedInsightResponse?.insight;
  const linkedInsightRequiresApproval =
    (linkedInsight as { requiresApproval?: boolean } | undefined)?.requiresApproval === true;
  const ensureInsightReviewMutation = api.home.ensureInsightReview.useMutation();
  const logActivityMutation = api.contact.logActivity.useMutation({
    onSuccess: () => {
      if (user?.id) revalidateContactCaches(user.id).catch(() => {});
      toast({ title: 'Activity logged', description: 'Activity has been recorded.' });
      utils.contact.getById.invalidate({ id: contactId });
      utils.activityFeed.getUnifiedFeed.invalidate();
      utils.activityFeed.getEntityFeed.invalidate();
    },
  });
  const addNoteMutation = api.contact.addNote.useMutation({
    onSuccess: () => {
      toast({ title: 'Note added', description: 'Your note has been saved.' });
      setShowNoteInput(false);
      setNewNoteContent('');
      utils.contact.getById.invalidate({ id: contactId });
      utils.activityFeed.getUnifiedFeed.invalidate();
      utils.activityFeed.getEntityFeed.invalidate();
    },
    onError: (err) => {
      toast({ title: 'Failed to add note', description: err.message, variant: 'destructive' });
    },
  });
  const scoreWithAIMutation = api.contact.scoreWithAI.useMutation({
    onSuccess: (() => {
      if (user?.id) revalidateContactCaches(user.id).catch(() => {});
      toast({ title: 'AI analysis complete', description: 'Contact has been analyzed by AI.' });
      utils.contact.getById.invalidate({ id: contactId });
    }) as () => void,
    onError: ((err: { message: string }) => {
      toast({ title: 'AI analysis failed', description: err.message, variant: 'destructive' });
    }) as (err: { message: string }) => void,
  });
  const reviewRequestedInsightRef = useRef<string | null>(null);

  // Check for auth errors
  const isAuthError = isUnauthorizedContactError(error);

  useRedirectOnUnauthorizedContactError({
    error,
    isAuthError,
    isLoading,
    authLoading,
    router,
  });

  useEnsureLinkedInsightReview({
    insightIdParam,
    linkedInsightRequiresApproval,
    reviewRequestedInsightRef,
    ensureInsightReviewMutation,
  });

  // Cast to extended type
  const apiContact = rawApiContact as ContactWithRelations | undefined;

  const tabParam = searchParams.get('tab') as TabId | null;
  const [activeTab, setActiveTab] = useState<TabId>(resolveInitialContactTab(tabParam));
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  // Activity note state managed by QuickLogComposer
  const [expandedActivities, setExpandedActivities] = useState<Set<string>>(new Set());
  const [activityTypeFilter, setActivityTypeFilter] = useState<ActivityType | 'all'>('all');
  const [personFilter, setPersonFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(5);
  const [activityView, setActivityView] = useState<'timeline' | 'unified'>('timeline');
  const { selectedActivityId } = useActivityDeepLink(
    activeTab,
    setActiveTab as (tab: 'activity') => void
  );

  // Deep-link: auto-expand the targeted activity and scroll it into view
  const deepLinkScrolledRef = useRef(false);
  useEffect(() => {
    if (!selectedActivityId || deepLinkScrolledRef.current) return;
    // Expand using both prefixed and raw forms so either ID format matches
    setExpandedActivities((prev) => {
      const next = new Set(prev);
      next.add(selectedActivityId.prefixed);
      next.add(selectedActivityId.raw);
      return next;
    });
    deepLinkScrolledRef.current = true;
    // Scroll after render ÔÇö try prefixed first, then raw
    requestAnimationFrame(() => {
      const el =
        document.querySelector(`[data-activity-id="${CSS.escape(selectedActivityId.prefixed)}"]`) ||
        document.querySelector(`[data-activity-id="${CSS.escape(selectedActivityId.raw)}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }, [selectedActivityId, activeTab]);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [newNoteContent, setNewNoteContent] = useState('');

  // Unified activity feed for this contact (shared by Overview + Timeline)
  const { items: contactFeedItems, isLoading: isUnifiedLoading } = useActivityFeed({
    entityType: 'CONTACT',
    entityId: contactId,
    limit: 50,
  });
  const recentUnifiedActivities = contactFeedItems.slice(0, 3);

  // Transform API data to UI format
  const contact = useMemo(
    () => (apiContact ? transformContactForUI(apiContact) : null),
    [apiContact]
  );

  // Transform unified feed items to Timeline UI format
  const activities: Activity[] = useMemo(
    () => transformFeedToActivities(contactFeedItems),
    [contactFeedItems]
  );

  // Transform notes from API
  const notes = useMemo(() => {
    if (!apiContact?.notes) return [];
    return apiContact.notes.map((note) => ({
      id: note.id,
      content: note.content,
      author: note.author,
      createdAt: typeof note.createdAt === 'string' ? note.createdAt : note.createdAt.toISOString(),
    }));
  }, [apiContact?.notes]);

  // Transform deals (opportunities) from API
  const deals = useMemo(() => {
    if (!apiContact?.opportunities) return [];
    return apiContact.opportunities.map((opp) => {
      const closeDateIso = opp.closeDate instanceof Date ? opp.closeDate.toISOString() : '';
      const closeDateStr = typeof opp.closeDate === 'string' ? opp.closeDate : closeDateIso;
      return {
        id: opp.id,
        name: opp.name,
        value: opp.value,
        stage: opp.stage,
        probability: opp.probability,
        closeDate: closeDateStr,
      };
    });
  }, [apiContact?.opportunities]);

  // Transform tasks from API
  const _tasks = useMemo(() => {
    if (!apiContact?.tasks) return [];
    return apiContact.tasks.map((task) => {
      const dueDateIso = task.dueDate instanceof Date ? task.dueDate.toISOString() : '';
      const dueDateStr = typeof task.dueDate === 'string' ? task.dueDate : dueDateIso;
      return {
        id: task.id,
        title: task.title,
        dueDate: dueDateStr,
        priority: task.priority?.toLowerCase() || 'medium',
        completed: task.status === 'COMPLETED',
      };
    });
  }, [apiContact?.tasks]);

  // Transform AI insights from API
  const aiInsights = useMemo(() => {
    const insight = apiContact?.aiInsight;
    if (!insight) {
      return null;
    }

    return {
      conversionProbability: insight.conversionProbability,
      lifetimeValue: insight.lifetimeValue / 100, // Convert cents to dollars
      churnRisk: insight.churnRisk,
      nextBestAction: insight.nextBestAction || 'No action recommended',
      sentiment: insight.sentiment || 'Neutral',
      engagementScore: insight.engagementScore,
      recommendations: (insight.recommendations as string[]) || [],
      quietPeriodAlert: null,
      sentimentTrend: insight.sentimentTrend,
      lastEngagementDays: insight.lastEngagementDays,
    };
  }, [apiContact?.aiInsight]);

  // Transform AI insights to ChurnRiskData format (IFC-095)
  const churnRiskData: ChurnRiskData | null = useMemo(
    () => buildChurnRiskData(apiContact?.aiInsight),
    [apiContact?.aiInsight]
  );

  // Transform AI insights to NextBestActionData format (IFC-095)
  const nextBestActionData: NextBestActionData | null = useMemo(() => {
    const contactInsight = apiContact?.aiInsight;
    const linkedSuggestedAction =
      linkedInsight?.entityType === 'contact' && linkedInsight?.entityId === contactId
        ? linkedInsight.suggestedAction
        : null;
    const selectedAction = linkedSuggestedAction || contactInsight?.nextBestAction;
    if (!selectedAction) return null;

    return {
      actionType: resolveNextBestActionType(selectedAction),
      title: selectedAction,
      priority: resolveNextBestActionPriority(linkedInsight?.priority, contactInsight?.churnRisk),
      rationale: linkedSuggestedAction
        ? `Opened from insight: ${linkedInsight?.title || 'AI insight'}.`
        : `Based on ${contactInsight?.engagementScore || 0}% engagement score and ${contactInsight?.churnRisk || 'unknown'} churn risk level.`,
      confidence: 0.85,
    };
  }, [apiContact?.aiInsight, contactId, linkedInsight]);

  // Person filter options derived from activities
  const personFilters = useMemo(() => {
    const people = new Set<string>();
    people.add('all');
    activities.forEach((act) => people.add(act.user));
    return Array.from(people).map((person) => ({
      value: person,
      label: person === 'all' ? 'All People' : person,
    }));
  }, [activities]);

  // Tabs with dynamic counts
  const tabs: Tab[] = useMemo(
    () => [
      { id: 'overview', label: 'Overview' },
      { id: 'activity', label: 'Activity', count: activities.length },
      { id: 'tasks', label: 'Tasks' },
      { id: 'deals', label: 'Deals', count: deals.length },
      { id: 'tickets', label: 'Tickets', count: rawApiContact?.ticketCount ?? 0 },
      { id: 'documents', label: 'Documents', count: rawApiContact?.documentCount ?? 0 },
      { id: 'notes', label: 'Notes', count: notes.length },
      { id: 'ai-insights', label: 'AI Insights' },
    ],
    [activities.length, deals.length, notes.length, rawApiContact]
  );

  // Filter and search activities
  const filteredActivities = useMemo(
    () => filterContactActivities(activities, activityTypeFilter, personFilter, searchQuery),
    [activities, activityTypeFilter, personFilter, searchQuery]
  );

  // Visible activities (for infinite scroll simulation)
  const visibleActivities = filteredActivities.slice(0, visibleCount);
  const hasMore = visibleCount < filteredActivities.length;

  // Activity reactions
  const activityIdsForReactions = useMemo(
    () => visibleActivities.map((a) => a.id),
    [visibleActivities]
  );
  const { reactions: reactionsMap, toggleReaction } = useActivityReactions(
    activityIdsForReactions,
    'CONTACT_ACTIVITY',
    user?.email
  );
  const {
    comments: commentsMap,
    addComment,
    isAdding: isAddingComment,
  } = useActivityComments(activityIdsForReactions, 'CONTACT_ACTIVITY');

  // Auto-dismiss stale insight when the referenced entity no longer exists
  const fromInsight = !!insightIdParam;
  const dismissInsightMutation = api.home.dismissInsight.useMutation();
  const dismissedInsightRef = useRef(false);
  useEffect(() => {
    if (
      shouldDismissStaleInsight(
        fromInsight,
        insightIdParam,
        error?.data?.code,
        isLoading,
        contact,
        dismissedInsightRef.current
      )
    ) {
      dismissedInsightRef.current = true;
      dismissInsightMutation.mutate(
        { insightId: insightIdParam!, reason: 'Referenced contact no longer exists' },
        {
          onError: () => {
            /* best-effort */
          },
        }
      );
    }
  }, [fromInsight, insightIdParam, error, isLoading, contact, dismissInsightMutation]);

  // Loading / auth-error / not-found short-circuits ÔÇö see helper above.
  const loadingScreen = pickContactLoadingScreen({
    isLoading,
    error,
    isAuthError,
    hasContact: Boolean(contact),
    fromInsight,
  });
  if (loadingScreen) return loadingScreen;
  if (!contact) return <ContactNotFoundError fromInsight={fromInsight} />;

  // Toggle activity expansion
  const toggleExpand = (id: string) => {
    setExpandedActivities((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Render inline actions for activity using shared component
  const renderActivityActions = (activity: Activity) => (
    <ActivityFeedItemActions
      activityId={activity.id}
      activityTitle={activity.title}
      onReply={addComment}
      onSubmitNote={(content) => addNoteMutation.mutate({ contactId, content })}
      onToggleReaction={toggleReaction}
      isSubmitting={addNoteMutation.isPending || isAddingComment}
      shareUrl={`${typeof window !== 'undefined' ? window.location.origin : ''}/contacts/${contactId}#activity-${activity.id}`}
      reactions={reactionsMap[activity.id] ?? []}
      currentUserId={user?.email ?? undefined}
      comments={commentsMap[activity.id] ?? []}
    />
  );

  return (
    <div className="mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-16">
      {/* Header with breadcrumb and actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-1">
            <Link href="/contacts" className="hover:text-[#137fec]">
              Contacts
            </Link>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8.025 22 6.25 20.225 14.475 12 6.25 3.775 8.025 2l10 10Z" />
            </svg>
            <span className="font-medium text-slate-900 dark:text-white">
              {contact.firstName} {contact.lastName}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            {contact.firstName} {contact.lastName}
          </h1>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => router.push(`/contacts/${contact.id}/edit`)}
            className="flex items-center gap-2 px-4 h-10 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M5 19h1.4l8.625-8.625-1.4-1.4L5 17.6ZM19.3 8.925l-4.25-4.2 1.4-1.4q.575-.575 1.413-.575.837 0 1.412.575l1.4 1.4q.575.575.6 1.388.025.812-.55 1.387Z" />
            </svg>{' '}
            Edit Profile
          </button>
          <ContactQuickActions contact={contact} />
          <PinButton
            entityType="contact"
            entityId={contact.id}
            title={`${contact.firstName} ${contact.lastName}`}
            subtitle={contact.company || undefined}
            icon="contacts"
            url={`/contacts/${contact.id}`}
          />
          <MoreActionsButton onClick={() => setActionSheetOpen(true)} />
        </div>
      </div>

      <EntityActionSheet
        open={actionSheetOpen}
        onOpenChange={setActionSheetOpen}
        entity={{
          type: 'contact',
          id: contact.id,
          title: `${contact.firstName} ${contact.lastName}`,
          subtitle: contact.company || undefined,
          icon: 'contacts',
          url: `/contacts/${contact.id}`,
        }}
        extraActions={[
          {
            label: 'Merge Duplicate',
            icon: 'merge',
            onClick: () =>
              toast({
                title: 'Coming soon',
                description: 'Merge duplicate contacts is under development',
              }),
          },
          {
            label: 'Archive',
            icon: 'archive',
            onClick: () =>
              toast({ title: 'Coming soon', description: 'Archive contact is under development' }),
          },
          {
            label: 'Delete',
            icon: 'delete',
            onClick: () =>
              toast({ title: 'Coming soon', description: 'Delete contact is under development' }),
            destructive: true,
          },
        ]}
      />

      {/* Main 3-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Sidebar - Contact Profile */}
        <aside className="lg:col-span-3 flex flex-col gap-6">
          {/* Profile Card with Photo */}
          <Card className="overflow-hidden">
            <div className="h-24 bg-gradient-to-r from-blue-100 to-blue-50 dark:from-slate-800 dark:to-slate-800" />
            <div className="px-5 pb-6 relative">
              <div className="relative -mt-10 mb-3">
                <AppAvatar
                  name={`${contact.firstName} ${contact.lastName}`}
                  src={contact.avatarUrl}
                  className="w-20 h-20 border-4 border-white dark:border-slate-900 shadow-sm"
                  fallbackClassName="text-2xl font-bold text-slate-500 bg-slate-200 dark:bg-slate-700"
                />
                {contact.isOnline && (
                  <div
                    className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 border-2 border-white dark:border-slate-900 rounded-full"
                    title="Online"
                  />
                )}
              </div>
              <div className="mb-4">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                  {contact.firstName} {contact.lastName}
                </h2>
                <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">
                  {contact.title}
                </p>
                {contact.account && (
                  <Link
                    href={`/accounts/${contact.account.id}`}
                    className="flex items-center gap-1 text-[#137fec] text-sm font-medium mt-1 hover:underline"
                  >
                    <span className="material-symbols-outlined !text-sm">domain</span>
                    <span>{contact.company || contact.account.name}</span>
                  </Link>
                )}
                {!contact.account && contact.company && (
                  <div className="flex items-center gap-1 text-slate-500 text-sm font-medium mt-1">
                    <span className="material-symbols-outlined !text-sm">domain</span>
                    <span>{contact.company}</span>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2 mb-6">
                <ContactStatusBadge status={contact.status} />
                {contact.isVIP && (
                  <span className="px-2 py-1 rounded bg-yellow-50 text-yellow-700 border border-yellow-200 text-xs font-semibold">
                    VIP
                  </span>
                )}
                {contact.hasActiveDeal && (
                  <span className="px-2 py-1 rounded bg-green-50 text-green-700 border border-green-200 text-xs font-semibold">
                    Active Deal
                  </span>
                )}
                {contact.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-1 rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 text-xs font-medium"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              {/* IFC-312 ÔÇö AI tag suggestions (hidden when flag off or empty). */}
              <div className="mt-2">
                <SuggestedTagsRow entity="contact" entityId={contact.id} enabled={true} />
              </div>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <svg
                    className="w-5 h-5 text-slate-400 mt-0.5"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M4 20q-.825 0-1.412-.587Q2 18.825 2 18V6q0-.825.588-1.412Q3.175 4 4 4h16q.825 0 1.413.588Q22 5.175 22 6v12q0 .825-.587 1.413Q20.825 20 20 20Zm8-7 8-5V6l-8 5-8-5v2Z" />
                  </svg>
                  <div className="flex flex-col">
                    <span className="text-xs text-slate-400 uppercase font-semibold">Email</span>
                    <EntityHoverCard
                      email={contact.email}
                      displayName={`${contact.firstName} ${contact.lastName}`.trim()}
                    >
                      <Link
                        href={`/email/compose?to=${encodeURIComponent(contact.email)}`}
                        className="text-sm text-slate-700 dark:text-slate-300 hover:text-[#137fec] break-all"
                      >
                        {contact.email}
                      </Link>
                    </EntityHoverCard>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <svg
                    className="w-5 h-5 text-slate-400 mt-0.5"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M19.95 21q-3.125 0-6.175-1.362-3.05-1.363-5.55-3.863-2.5-2.5-3.862-5.55Q3 7.175 3 4.05q0-.45.3-.75t.75-.3H8.1q.35 0 .625.238.275.237.325.562l.65 3.5q.05.4-.025.675-.075.275-.275.475L6.65 11.2q.7 1.3 1.65 2.475.95 1.175 2.1 2.175l2.65-2.65q.225-.225.525-.325.3-.1.625-.025l3.3.7q.35.1.563.363.212.262.212.587v4.05q0 .45-.3.75t-.75.3Z" />
                  </svg>
                  <div className="flex flex-col">
                    <span className="text-xs text-slate-400 uppercase font-semibold">Phone</span>
                    <a
                      href={`tel:${contact.phone.replaceAll(/\D/g, '')}`}
                      className="text-sm text-slate-700 dark:text-slate-300 hover:text-[#137fec]"
                    >
                      {contact.phone}
                    </a>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <svg
                    className="w-5 h-5 text-slate-400 mt-0.5"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M12 12q.825 0 1.413-.587Q14 10.825 14 10t-.587-1.413Q12.825 8 12 8t-1.412.587Q10 9.175 10 10t.588 1.413Q11.175 12 12 12Zm0 9.625q-.2 0-.4-.075t-.35-.2Q7.6 18.125 5.8 15.362 4 12.6 4 10.2q0-3.75 2.413-5.975Q8.825 2 12 2t5.588 2.225Q20 6.45 20 10.2q0 2.4-1.8 5.163-1.8 2.762-5.45 5.987-.15.125-.35.2-.2.075-.4.075Z" />
                  </svg>
                  <div className="flex flex-col">
                    <span className="text-xs text-slate-400 uppercase font-semibold">Location</span>
                    <span className="text-sm text-slate-700 dark:text-slate-300">
                      {contact.location}
                    </span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-6 pt-4 border-t border-slate-200 dark:border-slate-700">
                <div className="text-center p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <p className="text-lg font-bold text-slate-900 dark:text-white">
                    ${(contact.metrics.totalValue / 1000).toFixed(0)}k
                  </p>
                  <p className="text-xs text-slate-500">Total Value</p>
                </div>
                <div className="text-center p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <p className="text-lg font-bold text-slate-900 dark:text-white">
                    {contact.metrics.totalDeals}
                  </p>
                  <p className="text-xs text-slate-500">Deals</p>
                </div>
                <div className="text-center p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <p className="text-lg font-bold text-slate-900 dark:text-white">
                    {contact.metrics.emailsSent > 0
                      ? `${Math.round((contact.metrics.emailsOpened / contact.metrics.emailsSent) * 100)}%`
                      : 'ÔÇö'}
                  </p>
                  <p className="text-xs text-slate-500">Open Rate</p>
                </div>
                <div className="text-center p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <p className="text-lg font-bold text-slate-900 dark:text-white">
                    {contact.metrics.meetings}
                  </p>
                  <p className="text-xs text-slate-500">Meetings</p>
                </div>
              </div>
            </div>
            <ContactMapPreview location={contact.location} />
          </Card>
          <Card className="p-5">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase mb-3 tracking-wider">
              Contact Owner
            </h3>
            <div className="flex items-center gap-3">
              <AppAvatar
                name={contact.owner.name}
                src={contact.owner.avatarUrl}
                className="w-10 h-10"
                fallbackClassName="text-sm font-bold bg-slate-200 dark:bg-slate-700"
              />
              <div>
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  {contact.owner.name}
                </p>
                <p className="text-xs text-slate-500">{contact.owner.title}</p>
              </div>
            </div>
          </Card>
        </aside>

        {/* Center Content - Tabs and Content */}
        <section className="lg:col-span-6 flex flex-col gap-6">
          <Card>
            <div className="flex border-b border-slate-200 dark:border-slate-800 px-2 overflow-x-auto">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-4 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'text-[#137fec] border-[#137fec]'
                      : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 border-transparent'
                  }`}
                >
                  {tab.label}
                  {tab.count !== undefined && tab.count > 0 && (
                    <span className="ml-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] px-1.5 py-0.5 rounded-full">
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <QuickLogComposer
              placeholder="Log a call, meeting, or email..."
              isSubmitting={logActivityMutation.isPending}
              onSubmit={(note) => {
                logActivityMutation.mutate({
                  contactId,
                  type: 'CALL',
                  title: 'Note logged',
                  description: note,
                });
              }}
            />
          </Card>

          {/* Activity Tab with Filters & Search (FLOW-020) */}
          {activeTab === 'activity' && (
            <Card className="p-6">
              {/* View Toggle: Timeline (single-source) vs Unified (7-source IFC-069) */}
              <div className="flex items-center gap-1 mb-4 bg-slate-100 dark:bg-slate-800 rounded-lg p-1 w-fit">
                <button
                  onClick={() => setActivityView('timeline')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    activityView === 'timeline'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
                  }`}
                >
                  <span className="material-symbols-outlined text-sm align-middle mr-1">
                    timeline
                  </span>{' '}
                  Timeline
                </button>
                <button
                  onClick={() => setActivityView('unified')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    activityView === 'unified'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
                  }`}
                >
                  <span className="material-symbols-outlined text-sm align-middle mr-1">
                    dynamic_feed
                  </span>{' '}
                  All Sources
                </button>
              </div>

              {activityView === 'unified' ? (
                <ActivityFeed
                  entityType="CONTACT"
                  entityId={contactId}
                  height={500}
                  emptyMessage="No activity found across all sources"
                />
              ) : (
                <>
                  {/* Filters and Search Bar */}
                  <div className="mb-6 space-y-4">
                    {/* Search */}
                    <div className="relative">
                      <svg
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                      </svg>
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search activities..."
                        className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:border-[#137fec] focus:ring-1 focus:ring-[#137fec] placeholder:text-slate-400"
                      />
                    </div>

                    {/* Type Filters */}
                    <div className="flex flex-wrap gap-2">
                      {activityTypeFilters.map((filter) => (
                        <button
                          key={filter.value}
                          onClick={() => setActivityTypeFilter(filter.value)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                            activityTypeFilter === filter.value
                              ? 'bg-[#137fec] text-white'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                          }`}
                        >
                          <span>{filter.icon}</span> {filter.label}
                        </button>
                      ))}
                    </div>

                    {/* Person Filter */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 font-medium">Filter by:</span>
                      <select
                        value={personFilter}
                        onChange={(e) => setPersonFilter(e.target.value)}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:border-[#137fec] focus:ring-1 focus:ring-[#137fec]"
                      >
                        {personFilters.map((filter) => (
                          <option key={filter.value} value={filter.value}>
                            {filter.label}
                          </option>
                        ))}
                      </select>
                      {(activityTypeFilter !== 'all' || personFilter !== 'all' || searchQuery) && (
                        <button
                          onClick={() => {
                            setActivityTypeFilter('all');
                            setPersonFilter('all');
                            setSearchQuery('');
                          }}
                          className="text-xs text-[#137fec] hover:underline"
                        >
                          Clear filters
                        </button>
                      )}
                    </div>

                    {/* AI Insights Banner (Sentiment Trend & Quiet Period Alert) */}
                    {aiInsights?.sentimentTrend && (
                      <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-800 rounded-lg border border-blue-100 dark:border-slate-700">
                        <div className="w-8 h-8 rounded-full bg-[#137fec]/10 flex items-center justify-center">
                          <svg
                            className="w-4 h-4 text-[#137fec]"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                          >
                            <path d="m19 9 1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25L19 9zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12l-5.5-2.5z" />
                          </svg>
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-slate-900 dark:text-white">
                            Sentiment is{' '}
                            <span className={getSentimentTrendStyle(aiInsights.sentimentTrend)}>
                              {aiInsights.sentimentTrend}
                            </span>
                          </p>
                          <p className="text-xs text-slate-500">
                            Last engagement: {aiInsights.lastEngagementDays} days ago
                          </p>
                        </div>
                        {aiInsights.quietPeriodAlert && (
                          <span className="px-2 py-1 rounded bg-yellow-100 text-yellow-700 text-xs font-medium">
                            ÔÜá´©Å Quiet Period
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Results count */}
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-sm text-slate-500">
                      Showing {visibleActivities.length} of {filteredActivities.length} activities
                    </p>
                  </div>

                  {/* Activity Timeline */}
                  <div className="relative space-y-4" style={{ paddingLeft: 40 }}>
                    {/* Continuous vertical timeline line */}
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-slate-200 dark:bg-slate-700"
                      style={{ left: 19 }}
                    />

                    {visibleActivities.map((activity) => {
                      const isExpanded = expandedActivities.has(activity.id);
                      const isDeepLinked = isDeepLinkedActivity(activity.id, selectedActivityId);
                      return (
                        <div key={activity.id} data-activity-id={activity.id} className="relative">
                          {/* Timeline dot marker */}
                          <div
                            className={`absolute w-8 h-8 rounded-full border-2 border-white dark:border-slate-900 shadow-sm flex items-center justify-center z-10 ${getActivityIconBg(activity.type)}`}
                            style={{ left: -36, top: 12 }}
                          >
                            {getActivityIcon(activity.type)}
                          </div>

                          {/* Activity Card */}
                          <div
                            className={`rounded-lg p-4 transition-colors ${
                              isDeepLinked
                                ? 'bg-primary/5 border-2 border-primary/30 ring-1 ring-primary/20'
                                : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                            }`}
                          >
                            {/* Header */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                                    {activity.title}
                                  </p>
                                  {activity.sentiment && (
                                    <span
                                      className={`${getSentimentColor(activity.sentiment)}`}
                                      title={`${activity.sentiment} sentiment`}
                                    >
                                      {getSentimentEmoji(activity.sentiment)}
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
                                  {activity.description}
                                </p>
                                <p className="text-xs text-slate-500 mt-1">
                                  {activity.user} ÔÇó{' '}
                                  {formatContactRelativeTime(activity.timestamp, timezone)}
                                </p>
                              </div>
                              <button
                                onClick={() => toggleExpand(activity.id)}
                                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors"
                              >
                                <svg
                                  className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                  viewBox="0 0 24 24"
                                  fill="currentColor"
                                >
                                  <path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
                                </svg>
                              </button>
                            </div>

                            {/* Reactions */}
                            {activity.reactions && activity.reactions.length > 0 && (
                              <div className="flex items-center gap-2 mt-2">
                                {activity.reactions.map((reaction) => (
                                  <span
                                    key={`${activity.id}-${reaction.emoji}`}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 dark:bg-slate-700 rounded-full text-xs"
                                  >
                                    {reaction.emoji} {reaction.count}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Expanded Content */}
                            {isExpanded && (
                              <div className="mt-3">
                                {/* Rich Preview */}
                                {renderRichPreview(activity)}

                                {/* Comments */}
                                {activity.comments && activity.comments.length > 0 && (
                                  <div className="mt-3 space-y-2">
                                    <p className="text-xs font-semibold text-slate-500 uppercase">
                                      Comments
                                    </p>
                                    {activity.comments.map((comment) => (
                                      <div
                                        key={`${activity.id}-${comment.timestamp}`}
                                        className="p-2 bg-slate-50 dark:bg-slate-800/50 rounded border border-slate-100 dark:border-slate-700"
                                      >
                                        <p className="text-sm text-slate-600 dark:text-slate-400">
                                          {comment.text}
                                        </p>
                                        <p className="text-xs text-slate-500 mt-1">
                                          {comment.user} ÔÇó{' '}
                                          {formatContactRelativeTime(comment.timestamp, timezone)}
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {/* Inline Actions */}
                                {renderActivityActions(activity)}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Load More / Infinite Scroll */}
                  {hasMore && (
                    <button
                      onClick={() => setVisibleCount((prev) => prev + 5)}
                      className="w-full mt-6 py-3 text-sm text-[#137fec] font-medium hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors border border-slate-200 dark:border-slate-700"
                    >
                      Load more activities ({filteredActivities.length - visibleCount} remaining)
                    </button>
                  )}

                  {filteredActivities.length === 0 && (
                    <EmptyState entity="activity" variant="filtered" phase="passive" />
                  )}
                </>
              )}
            </Card>
          )}

          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <Card>
                <div className="flex items-center justify-between p-6 border-b border-border">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                    Recent Activity
                  </h3>
                  <button
                    onClick={() => setActiveTab('activity')}
                    className="text-sm text-ds-primary hover:underline"
                  >
                    View All
                  </button>
                </div>
                {/* AI Sentiment Trend Banner */}
                {aiInsights?.sentimentTrend && (
                  <div className="flex items-center gap-3 p-3 mx-5 mt-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-800 rounded-lg border border-blue-100 dark:border-slate-700">
                    <div className="w-8 h-8 rounded-full bg-[#137fec]/10 flex items-center justify-center">
                      <span className="material-symbols-outlined text-base text-[#137fec]">
                        auto_awesome
                      </span>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-900 dark:text-white">
                        Sentiment is{' '}
                        <span className={getSentimentTrendStyle(aiInsights.sentimentTrend)}>
                          {aiInsights.sentimentTrend}
                        </span>
                      </p>
                      <p className="text-xs text-slate-500">
                        Last engagement: {aiInsights.lastEngagementDays} days ago
                      </p>
                    </div>
                  </div>
                )}
                <div className="flex flex-col divide-y divide-border">
                  {recentUnifiedActivities.length > 0 &&
                    recentUnifiedActivities.map((activity) => (
                      <ActivityFeedItem
                        key={activity.id}
                        id={activity.id}
                        source={activity.source}
                        type={activity.type}
                        title={activity.title}
                        description={activity.description}
                        timestamp={activity.timestamp}
                        actor={activity.actor}
                        entity={activity.entity}
                        metadata={activity.metadata}
                      />
                    ))}
                  {recentUnifiedActivities.length === 0 && !isUnifiedLoading && (
                    <EmptyState entity="activity" phase="passive" />
                  )}
                  {isUnifiedLoading && (
                    <div className="flex items-center justify-center p-6">
                      <p className="text-xs text-muted-foreground">Loading activity...</p>
                    </div>
                  )}
                </div>
              </Card>
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
                  Contact Information
                </h3>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <dt className="text-sm text-slate-500 dark:text-slate-400">Status</dt>
                    <dd className="text-sm font-medium mt-1">
                      <ContactStatusBadge status={contact.status} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-slate-500 dark:text-slate-400">Department</dt>
                    <dd className="text-sm font-medium text-slate-900 dark:text-white">
                      {contact.department}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-slate-500 dark:text-slate-400">Timezone</dt>
                    <dd className="text-sm font-medium text-slate-900 dark:text-white">
                      {contact.timezone}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-slate-500 dark:text-slate-400">Contact Owner</dt>
                    <dd className="text-sm font-medium text-slate-900 dark:text-white">
                      {contact.owner.name}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-slate-500 dark:text-slate-400">Last Contacted</dt>
                    <dd className="text-sm font-medium text-slate-900 dark:text-white">
                      {formatContactRelativeTime(contact.lastContactedAt, timezone)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-slate-500 dark:text-slate-400">Created</dt>
                    <dd className="text-sm font-medium text-slate-900 dark:text-white">
                      {formatContactDate(contact.createdAt, timezone)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-slate-500 dark:text-slate-400">Account</dt>
                    <dd className="text-sm font-medium">
                      {contact.account ? (
                        <Link
                          href={`/accounts/${contact.account.id}`}
                          className="text-[#137fec] hover:underline"
                        >
                          {contact.account.name}
                        </Link>
                      ) : (
                        <span className="text-slate-400">No account</span>
                      )}
                    </dd>
                  </div>
                </dl>
              </Card>
              <Card className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                    Active Deals
                  </h3>
                  <button
                    onClick={() => setActiveTab('deals')}
                    className="text-sm text-[#137fec] hover:underline"
                  >
                    View All
                  </button>
                </div>
                <div className="space-y-3">
                  {deals
                    .filter((d) => d.stage !== 'Closed Won' && d.stage !== 'Closed Lost')
                    .slice(0, 2)
                    .map((deal) => (
                      <div
                        key={deal.id}
                        className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-slate-900 dark:text-white truncate">
                            {deal.name}
                          </p>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium mt-1 ${getStageColor(deal.stage)}`}
                          >
                            {deal.stage}
                          </span>
                        </div>
                        <div className="text-right ml-4">
                          <p className="font-semibold text-slate-900 dark:text-white">
                            ${deal.value.toLocaleString('en-GB')}
                          </p>
                          <p className="text-xs text-slate-500">{deal.probability}%</p>
                        </div>
                      </div>
                    ))}
                </div>
              </Card>
            </div>
          )}

          {/* Tasks Tab */}
          {activeTab === 'tasks' && (
            <RelatedTasksCard entityType="contact" entityId={contactId} maxItems={20} />
          )}

          {/* Deals Tab */}
          {activeTab === 'deals' && (
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Deals</h3>
                <ContactAddDealButton contactId={contactId} />
              </div>
              <div className="space-y-3">
                {deals.map((deal) => (
                  <div
                    key={deal.id}
                    className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900 dark:text-white truncate">
                        {deal.name}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getStageColor(deal.stage)}`}
                        >
                          {deal.stage}
                        </span>
                        <span className="text-xs text-slate-500">
                          Close: {formatContactDate(deal.closeDate, timezone)}
                        </span>
                      </div>
                    </div>
                    <div className="text-right ml-4">
                      <p className="font-semibold text-slate-900 dark:text-white">
                        ${deal.value.toLocaleString('en-GB')}
                      </p>
                      <p className="text-xs text-slate-500">{deal.probability}% probability</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Tickets & Documents tabs (IFC-256) */}
          <ContactRelatedTabs activeTab={activeTab} contact={rawApiContact} timezone={timezone} />

          {/* Notes Tab */}
          {activeTab === 'notes' && (
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Notes</h3>
                <button
                  onClick={() => setShowNoteInput((v) => !v)}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-[#137fec] hover:bg-[#137fec]/10 rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M11 13H5v-2h6V5h2v6h6v2h-6v6h-2Z" />
                  </svg>{' '}
                  Add Note
                </button>
              </div>
              {showNoteInput && (
                <div className="mb-4">
                  <textarea
                    value={newNoteContent}
                    onChange={(e) => setNewNoteContent(e.target.value)}
                    placeholder="Write a note..."
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#137fec] resize-none"
                    rows={3}
                  />
                  <div className="flex items-center justify-end gap-2 mt-2">
                    <button
                      onClick={() => {
                        setShowNoteInput(false);
                        setNewNoteContent('');
                      }}
                      className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 rounded transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        if (newNoteContent.trim()) {
                          addNoteMutation.mutate({ contactId, content: newNoteContent.trim() });
                        }
                      }}
                      disabled={!newNoteContent.trim() || addNoteMutation.isPending}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-[#137fec] hover:bg-[#0f6dd0] rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {addNoteMutation.isPending ? 'Saving...' : 'Save Note'}
                    </button>
                  </div>
                </div>
              )}
              <div className="space-y-4">
                {notes.map((note) => (
                  <div
                    key={note.id}
                    className="pb-4 border-b border-slate-100 dark:border-slate-800 last:border-0 last:pb-0"
                  >
                    <p className="text-sm text-slate-600 dark:text-slate-400">{note.content}</p>
                    <div className="flex items-center gap-2 mt-2 text-xs text-slate-500">
                      <span>{note.author}</span>
                      <span>ÔÇó</span>
                      <span>{formatContactRelativeTime(note.createdAt, timezone)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* AI Insights Tab (IFC-095) */}
          {activeTab === 'ai-insights' && (
            <>
              <ContactAiInsightsTab
                aiInsights={aiInsights}
                churnRiskData={churnRiskData}
                nextBestActionData={nextBestActionData}
                onPendingAction={() => scoreWithAIMutation.mutate({ contactId })}
                isPending={scoreWithAIMutation.isPending}
              />
              {/* IFC-312 ÔÇö AI reply drafts panel (hidden when flag off or empty). */}
              <div className="mt-6">
                <h3 className="text-sm font-semibold mb-2">AI-drafted replies</h3>
                <ReplyDraftsPanel contactId={contactId} enabled={true} />
              </div>
            </>
          )}
        </section>

        {/* Right Sidebar */}
        <aside className="lg:col-span-3 flex flex-col gap-6">
          <ContactAiSummaryCard
            aiInsights={aiInsights}
            onViewAiTab={() => setActiveTab('ai-insights')}
          />
          <RelatedTasksCard
            entityType="contact"
            entityId={contactId}
            maxItems={2}
            compact
            onViewAll={() => setActiveTab('tasks')}
          />
          <UpcomingEventsCard entityType="contact" entityId={contactId} maxItems={1} compact />
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Notes</h3>
              <button
                onClick={() => {
                  setShowNoteInput(true);
                  setActiveTab('notes');
                }}
                className="w-6 h-6 rounded hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-500"
                title="Add note"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M11 13H5v-2h6V5h2v6h6v2h-6v6h-2Z" />
                </svg>
              </button>
            </div>
            <div className="space-y-4">
              {notes.slice(0, 2).map((note) => (
                <div
                  key={note.id}
                  className="pb-4 border-b border-slate-100 dark:border-slate-800 last:border-0 last:pb-0"
                >
                  <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2">
                    {note.content}
                  </p>
                  <div className="flex items-center gap-2 mt-2 text-xs text-slate-500">
                    <span>{note.author}</span>
                    <span>ÔÇó</span>
                    <span>{formatContactRelativeTime(note.createdAt, timezone)}</span>
                  </div>
                </div>
              ))}
              {notes.length === 0 && <EmptyState entity="notes" phase="passive" className="py-2" />}
            </div>
            {notes.length > 2 && (
              <button
                onClick={() => setActiveTab('notes')}
                className="w-full mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs font-medium text-[#137fec] hover:text-[#0f6dd0] transition-colors text-center"
              >
                View all notes ({notes.length})
              </button>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}
