'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { EntityHoverCard } from '@/components/shared/entity-hover-card';
import {
  Button,
  Card,
  Skeleton,
  ChurnRiskCard,
  NextBestActionCard,
  toast,
  type ChurnRiskData,
  type NextBestActionData,
  type ChurnRiskLevel,
  type NBAActionType,
  type NBAPriority,
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
import { normalizeAvatarSource } from '@/lib/shared/avatar-utils';
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
import { ContactMapPreview, buildContactLocation } from '@/components/contacts/ContactMapPreview';
import {
  formatContactDate,
  formatContactRelativeTime,
} from '@/components/contacts/contact-date-format';

// Common nullable date type
type DateStringNull = string | Date | null;

// Tab types
type TabId =
  | 'overview'
  | 'activity'
  | 'tasks'
  | 'deals'
  | 'tickets'
  | 'documents'
  | 'notes'
  | 'ai-insights';

interface Tab {
  id: TabId;
  label: string;
  count?: number;
}

// Activity types per FLOW-020
type ActivityType = 'email' | 'call' | 'meeting' | 'chat' | 'document' | 'deal' | 'ticket' | 'note';

interface Activity {
  id: string;
  type: ActivityType;
  title: string;
  description: string;
  timestamp: string;
  user: string;
  // Rich preview data
  metadata?: {
    // Email
    subject?: string;
    preview?: string;
    openCount?: number;
    // Call
    duration?: string;
    outcome?: 'connected' | 'voicemail' | 'no-answer';
    recordingUrl?: string;
    // Meeting
    attendees?: string[];
    location?: string;
    notes?: string;
    // Chat
    channel?: 'whatsapp' | 'teams' | 'slack';
    messageCount?: number;
    // Document
    fileName?: string;
    fileSize?: string;
    fileType?: string;
    thumbnailUrl?: string;
    // Ticket
    ticketId?: string;
    status?: string;
    priority?: string;
  };
  sentiment?: 'positive' | 'neutral' | 'negative';
  reactions?: { emoji: string; count: number; users: string[] }[];
  comments?: { user: string; text: string; timestamp: string }[];
}

// Map sentiment from database to UI
const mapSentiment = (
  dbSentiment: string | null
): 'positive' | 'neutral' | 'negative' | undefined => {
  if (!dbSentiment) return undefined;
  const sentimentMap: Record<string, 'positive' | 'neutral' | 'negative'> = {
    POSITIVE: 'positive',
    NEUTRAL: 'neutral',
    NEGATIVE: 'negative',
  };
  return sentimentMap[dbSentiment];
};

// Default avatars
const defaultContactAvatar =
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=160&h=160&fit=crop&crop=face';
const defaultOwnerAvatar =
  'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=80&h=80&fit=crop&crop=face';

// Contact status type
type ContactStatus =
  | 'ACTIVE'
  | 'INACTIVE'
  | 'ARCHIVED'
  | 'PROSPECT'
  | 'CUSTOMER'
  | 'FORMER_CUSTOMER';

// Contact with relations type (from API)
interface ContactWithRelations {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  phone: string | null;
  title: string | null;
  department: string | null;
  status: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  avatarUrl?: string | null;
  streetAddress?: string | null;
  city?: string | null;
  zipCode?: string | null;
  account?: {
    id: string;
    name: string;
    industry: string | null;
    website: string | null;
  } | null;
  owner?: {
    id: string;
    name: string | null;
    email: string;
    avatarUrl: string | null;
  } | null;
  activities?: Array<{
    id: string;
    type: string;
    title: string;
    description: string | null;
    timestamp: string | Date;
    userName: string;
    metadata: unknown;
    sentiment: string | null;
  }>;
  notes?: Array<{
    id: string;
    content: string;
    author: string;
    createdAt: string | Date;
  }>;
  aiInsight?: {
    conversionProbability: number;
    lifetimeValue: number;
    churnRisk: string;
    nextBestAction: string | null;
    sentiment: string | null;
    engagementScore: number;
    recommendations: unknown;
    sentimentTrend: string | null;
    lastEngagementDays: number;
  } | null;
  opportunities?: Array<{
    id: string;
    name: string;
    value: number;
    stage: string;
    probability: number;
    closeDate: DateStringNull;
  }>;
  tasks?: Array<{
    id: string;
    title: string;
    dueDate: DateStringNull;
    priority: string | null;
    status: string;
  }>;
  documents?: Array<{
    id: string;
    name: string;
    fileType: string;
    createdAt: string | Date;
  }>;
  calendarEvents?: Array<{
    id: string;
    title: string;
    startTime: string | Date;
    endTime: DateStringNull;
    attendees: string[] | null;
  }>;
}

// Activity type filter options
const activityTypeFilters: { value: ActivityType | 'all'; label: string; icon: string }[] = [
  { value: 'all', label: 'All', icon: '­ƒôï' },
  { value: 'email', label: 'Emails', icon: '­ƒôº' },
  { value: 'call', label: 'Calls', icon: '­ƒô×' },
  { value: 'meeting', label: 'Meetings', icon: '­ƒôà' },
  { value: 'chat', label: 'Chats', icon: '­ƒÆ¼' },
  { value: 'document', label: 'Documents', icon: '­ƒôä' },
  { value: 'deal', label: 'Deals', icon: '­ƒÄ»' },
  { value: 'ticket', label: 'Tickets', icon: '­ƒÄ½' },
  { value: 'note', label: 'Notes', icon: '­ƒôØ' },
];

// Contact Status Badge Component
function ContactStatusBadge({ status }: Readonly<{ status: ContactStatus }>) {
  const statusConfig = {
    ACTIVE: {
      label: 'Active',
      className:
        'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800',
      icon: (
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
        </svg>
      ),
    },
    INACTIVE: {
      label: 'Inactive',
      className:
        'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
      icon: (
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
        </svg>
      ),
    },
    ARCHIVED: {
      label: 'Archived',
      className:
        'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800',
      icon: (
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
          <path d="m20.54 5.23-1.39-1.68C18.88 3.21 18.47 3 18 3H6c-.47 0-.88.21-1.16.55L3.46 5.23C3.17 5.57 3 6.02 3 6.5V19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6.5c0-.48-.17-.93-.46-1.27zM12 17.5L6.5 12H10v-2h4v2h3.5L12 17.5zM5.12 5l.81-1h12l.94 1H5.12z" />
        </svg>
      ),
    },
    PROSPECT: {
      label: 'Prospect',
      className:
        'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800',
      icon: (
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-4h2v2h-2zm1-10c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z" />
        </svg>
      ),
    },
    CUSTOMER: {
      label: 'Customer',
      className:
        'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800',
      icon: (
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
        </svg>
      ),
    },
    FORMER_CUSTOMER: {
      label: 'Former Customer',
      className:
        'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800',
      icon: (
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z" />
        </svg>
      ),
    },
  };

  const config = statusConfig[status] ?? {
    label: status,
    className:
      'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
    icon: (
      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z" />
      </svg>
    ),
  };

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-xs font-semibold ${config.className}`}
    >
      {config.icon}
      {config.label}
    </span>
  );
}

function ContactAiPendingState({
  compact = false,
  onAction,
  isPending = false,
}: Readonly<{
  compact?: boolean;
  onAction: () => void;
  isPending?: boolean;
}>) {
  return (
    <div
      data-testid={compact ? 'contact-ai-pending-summary' : 'contact-ai-pending-banner'}
      className={`rounded-lg border border-dashed border-amber-300 bg-amber-50 dark:bg-amber-950/20 ${
        /* istanbul ignore next */ compact ? 'p-3' : 'p-4'
      }`}
    >
      <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
        AI analysis has not been run for this contact yet.
      </p>
      <p className="mt-2 text-sm text-amber-700/90 dark:text-amber-300/90">
        Metrics and recommendations will appear here after a real AI analysis is available.
      </p>
      <Button size="sm" onClick={onAction} disabled={isPending} className="mt-3">
        {isPending ? 'Analyzing...' : 'Run AI Analysis'}
      </Button>
    </div>
  );
}

type ContactAiInsightsSummary = {
  conversionProbability: number;
  lifetimeValue: number;
  churnRisk: string;
  nextBestAction: string;
  sentiment: string;
  engagementScore: number;
  recommendations: string[];
  quietPeriodAlert: string | null;
  sentimentTrend: string | null;
  lastEngagementDays: number;
} | null;

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

function resolveNextBestActionType(selectedAction: string): NBAActionType {
  const actionText = selectedAction.toUpperCase();
  if (actionText.includes('CALL')) return 'CALL';
  if (actionText.includes('EMAIL')) return 'EMAIL';
  if (actionText.includes('MEET')) return 'MEETING';
  if (actionText.includes('PROPOSAL')) return 'SEND_PROPOSAL';
  if (actionText.includes('DEMO')) return 'SCHEDULE_DEMO';
  if (actionText.includes('DISCOUNT')) return 'OFFER_DISCOUNT';
  if (actionText.includes('TRAIN')) return 'TRAINING';
  if (actionText.includes('ESCALATE')) return 'ESCALATE';
  return 'WAIT';
}

function resolveNextBestActionPriority(
  linkedPriority: 'low' | 'medium' | 'high' | undefined,
  churnRisk: string | null | undefined
): NBAPriority {
  if (linkedPriority === 'high') return 'HIGH';
  if (linkedPriority === 'low') return 'LOW';
  if (churnRisk === 'HIGH' || churnRisk === 'CRITICAL') return 'HIGH';
  if (churnRisk === 'LOW' || churnRisk === 'MINIMAL') return 'LOW';
  return 'MEDIUM';
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

function ContactAiInsightsTab({
  aiInsights,
  churnRiskData,
  nextBestActionData,
  onPendingAction,
  isPending = false,
}: Readonly<{
  aiInsights: ContactAiInsightsSummary;
  churnRiskData: ChurnRiskData | null;
  nextBestActionData: NextBestActionData | null;
  onPendingAction: () => void;
  isPending?: boolean;
}>) {
  return (
    <div className="space-y-6">
      {!aiInsights && <ContactAiPendingState onAction={onPendingAction} isPending={isPending} />}

      {(churnRiskData || nextBestActionData) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {churnRiskData && (
            <ChurnRiskCard
              data={churnRiskData}
              title="Churn Risk Assessment"
              showFactors={true}
              showConfidence={true}
              showSLA={true}
            />
          )}
          {nextBestActionData && (
            <NextBestActionCard
              data={nextBestActionData}
              title="Recommended Action"
              showRationale={true}
              showConfidence={true}
            />
          )}
        </div>
      )}

      {aiInsights && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <span className="material-symbols-outlined text-green-600">trending_up</span>
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">
                    {aiInsights.conversionProbability}%
                  </p>
                  <p className="text-xs text-slate-500">Conversion Probability</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#137fec]/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[#137fec]">paid</span>
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">
                    ${(aiInsights.lifetimeValue / 1000).toFixed(0)}k
                  </p>
                  <p className="text-xs text-slate-500">Est. Lifetime Value</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                  <span className="material-symbols-outlined text-purple-600">
                    sentiment_satisfied
                  </span>
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">
                    {aiInsights.engagementScore}%
                  </p>
                  <p className="text-xs text-slate-500">Engagement Score</p>
                </div>
              </div>
            </Card>
          </div>
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              AI Recommendations
            </h3>
            <ul className="space-y-3">
              {aiInsights.recommendations.map((rec, index) => (
                <li key={`rec-${rec.slice(0, 20)}`} className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-[#137fec]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-xs font-medium text-[#137fec]">{index + 1}</span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-400">{rec}</p>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              Engagement Analysis
            </h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between mb-1.5">
                  <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                    Engagement Score
                  </span>
                  <span className="text-sm font-bold text-[#137fec]">
                    {aiInsights.engagementScore}%
                  </span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2">
                  <div
                    className="bg-[#137fec] h-2 rounded-full"
                    style={{ width: `${aiInsights.engagementScore}%` }}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between pt-2">
                <span className="text-sm text-slate-600 dark:text-slate-300">Sentiment</span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                  {aiInsights.sentiment}
                </span>
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function ContactAiSummaryCard({
  aiInsights,
  onViewAiTab,
}: Readonly<{
  aiInsights: ContactAiInsightsSummary;
  onViewAiTab: () => void;
}>) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-[#137fec]" viewBox="0 0 24 24" fill="currentColor">
            <path d="m19 9 1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25L19 9zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12l-5.5-2.5zM19 15l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25L19 15z" />
          </svg>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">AI Insights</h3>
        </div>
        <span className="text-xs text-slate-400">Updated today</span>
      </div>
      {aiInsights ? (
        <div className="space-y-4">
          <div>
            <div className="flex justify-between mb-1.5">
              <span className="text-sm text-slate-600 dark:text-slate-300">Conversion</span>
              <span className="text-sm font-bold text-[#137fec]">
                {aiInsights.conversionProbability}%
              </span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2">
              <div
                className="bg-[#137fec] h-2 rounded-full"
                style={{ width: `${aiInsights.conversionProbability}%` }}
              />
            </div>
          </div>
          <div>
            <div className="flex justify-between mb-1.5">
              <span className="text-sm text-slate-600 dark:text-slate-300">Engagement</span>
              <span className="text-sm font-bold text-green-600">
                {aiInsights.engagementScore}%
              </span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2">
              <div
                className="bg-green-500 h-2 rounded-full"
                style={{ width: `${aiInsights.engagementScore}%` }}
              />
            </div>
          </div>
          <div className="flex items-center justify-between pt-2">
            <span className="text-sm text-slate-600 dark:text-slate-300">Sentiment</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
              {aiInsights.sentiment}
            </span>
          </div>
          <button
            onClick={onViewAiTab}
            className="w-full mt-2 text-sm text-[#137fec] hover:underline text-center"
          >
            View Full Analysis
          </button>
        </div>
      ) : (
        <ContactAiPendingState compact onAction={onViewAiTab} />
      )}
    </Card>
  );
}

// ÔöÇÔöÇÔöÇ Module-level pure helpers (extracted to reduce cognitive complexity of Contact360Page) ÔöÇÔöÇÔöÇ

function getStageColor(stage: string): string {
  switch (stage) {
    case 'Closed Won':
      return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    case 'Closed Lost':
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    case 'Negotiation':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    case 'Proposal':
      return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400';
    default:
      return 'bg-[#137fec]/10 text-[#137fec]';
  }
}

function getActivityIcon(type: ActivityType): React.ReactNode {
  const icons: Record<ActivityType, React.ReactNode> = {
    email: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M4 20q-.825 0-1.412-.587Q2 18.825 2 18V6q0-.825.588-1.412Q3.175 4 4 4h16q.825 0 1.413.588Q22 5.175 22 6v12q0 .825-.587 1.413Q20.825 20 20 20Zm8-7 8-5V6l-8 5-8-5v2Z" />
      </svg>
    ),
    call: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19.95 21q-3.125 0-6.175-1.362-3.05-1.363-5.55-3.863-2.5-2.5-3.862-5.55Q3 7.175 3 4.05q0-.45.3-.75t.75-.3H8.1q.35 0 .625.238.275.237.325.562l.65 3.5q.05.4-.025.675-.075.275-.275.475L6.65 11.2q.7 1.3 1.65 2.475.95 1.175 2.1 2.175l2.65-2.65q.225-.225.525-.325.3-.1.625-.025l3.3.7q.35.1.563.363.212.262.212.587v4.05q0 .45-.3.75t-.75.3Z" />
      </svg>
    ),
    meeting: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM9 10H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm-8 4H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2z" />
      </svg>
    ),
    chat: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z" />
      </svg>
    ),
    document: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M6 2a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6H6Zm0 2h7v5h5v11H6V4Zm2 8v2h8v-2H8Zm0 4v2h5v-2H8Z" />
      </svg>
    ),
    deal: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M21 18v1c0 1.1-.9 2-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14c1.1 0 2 .9 2 2v1h-9a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h9zm-9-2h10V8H12v8zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" />
      </svg>
    ),
    ticket: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M22 10V6a2 2 0 0 0-2-2H4c-1.1 0-1.99.9-1.99 2v4c1.1 0 1.99.9 1.99 2s-.89 2-2 2v4c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2v-4c-1.1 0-2-.9-2-2s.9-2 2-2zm-9 7.5h-2v-2h2v2zm0-4.5h-2v-2h2v2zm0-4.5h-2v-2h2v2z" />
      </svg>
    ),
    note: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M5 21q-.825 0-1.412-.587Q3 19.825 3 19V5q0-.825.588-1.413Q4.175 3 5 3h14q.825 0 1.413.587Q21 4.175 21 5v10l-6 6Zm0-2h9v-5h5V5H5v14Z" />
      </svg>
    ),
  };
  return icons[type];
}

function getActivityIconBg(type: ActivityType): string {
  const colors: Record<ActivityType, string> = {
    email: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600',
    call: 'bg-green-100 dark:bg-green-900/30 text-green-600',
    meeting: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600',
    chat: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600',
    document: 'bg-orange-100 dark:bg-orange-900/30 text-orange-600',
    deal: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600',
    ticket: 'bg-pink-100 dark:bg-pink-900/30 text-pink-600',
    note: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600',
  };
  return colors[type];
}

function getSentimentColor(sentiment?: string): string {
  switch (sentiment) {
    case 'positive':
      return 'text-green-500';
    case 'negative':
      return 'text-red-500';
    default:
      return 'text-slate-400';
  }
}

function getChannelIcon(channel?: string): string {
  switch (channel) {
    case 'whatsapp':
      return '­ƒÆ¼';
    case 'teams':
      return '­ƒæÑ';
    case 'slack':
      return '­ƒÆ╝';
    default:
      return '­ƒÆ¼';
  }
}

function getCallOutcomeStyle(outcome?: string): string {
  switch (outcome) {
    case 'connected':
      return 'bg-green-100 text-green-700';
    case 'voicemail':
      return 'bg-yellow-100 text-yellow-700';
    default:
      return 'bg-red-100 text-red-700';
  }
}

function getCallOutcomeLabel(outcome?: string): string {
  switch (outcome) {
    case 'connected':
      return 'Ô£ô Connected';
    case 'voicemail':
      return '­ƒô× Voicemail';
    default:
      return 'Ô£ù No Answer';
  }
}

function getTicketStatusStyle(status?: string): string {
  switch (status) {
    case 'Resolved':
      return 'bg-green-100 text-green-700';
    case 'Open':
      return 'bg-blue-100 text-blue-700';
    default:
      return 'bg-yellow-100 text-yellow-700';
  }
}

function getPriorityStyle(priority?: string): string {
  switch (priority) {
    case 'High':
      return 'text-red-600';
    case 'Medium':
      return 'text-yellow-600';
    default:
      return 'text-slate-500';
  }
}

function getSentimentTrendStyle(trend?: string): string {
  switch (trend) {
    case 'improving':
      return 'text-green-600';
    case 'declining':
      return 'text-red-600';
    default:
      return 'text-slate-600';
  }
}

function getSentimentEmoji(sentiment?: string): string {
  switch (sentiment) {
    case 'positive':
      return '­ƒÿè';
    case 'negative':
      return '­ƒÿƒ';
    default:
      return '­ƒÿÉ';
  }
}

function renderRichPreview(activity: Activity): React.ReactNode {
  if (!activity.metadata) return null;
  const meta = activity.metadata;

  switch (activity.type) {
    case 'email':
      return (
        <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-700">
          {meta.subject && (
            <p className="text-sm font-medium text-slate-900 dark:text-white mb-1">
              {meta.subject}
            </p>
          )}
          {meta.preview && (
            <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2">
              {meta.preview}
            </p>
          )}
          {meta.openCount && (
            <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
              </svg>{' '}
              Opened {meta.openCount} times
            </p>
          )}
        </div>
      );

    case 'call':
      return (
        <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getCallOutcomeStyle(meta.outcome)}`}
              >
                {getCallOutcomeLabel(meta.outcome)}
              </span>
              {meta.duration && <span className="text-sm text-slate-500">{meta.duration}</span>}
            </div>
          </div>
        </div>
      );

    case 'meeting':
      return (
        <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-700">
          {meta.location && (
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 mb-2">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z" />
              </svg>
              {meta.location}
              {meta.duration && <span className="text-slate-400">ÔÇó {meta.duration}</span>}
            </div>
          )}
          {meta.attendees && meta.attendees.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 mb-2">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
              </svg>
              {meta.attendees.join(', ')}
            </div>
          )}
          {meta.notes && (
            <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
              <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Meeting Notes</p>
              <p className="text-sm text-slate-600 dark:text-slate-400">{meta.notes}</p>
            </div>
          )}
        </div>
      );

    case 'chat':
      return (
        <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-700">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">{getChannelIcon(meta.channel)}</span>
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300 capitalize">
              {meta.channel}
            </span>
            {meta.messageCount && (
              <span className="text-xs text-slate-500">ÔÇó {meta.messageCount} messages</span>
            )}
          </div>
          {meta.preview && (
            <p className="text-sm text-slate-600 dark:text-slate-400">{meta.preview}</p>
          )}
        </div>
      );

    case 'document':
      return (
        <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-700 flex items-center gap-3">
          <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded flex items-center justify-center">
            <svg className="w-5 h-5 text-red-600" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 2a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6H6Zm0 2h7v5h5v11H6V4Z" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-900 dark:text-white">{meta.fileName}</p>
            <p className="text-xs text-slate-500">{meta.fileSize}</p>
          </div>
        </div>
      );

    case 'ticket':
      return (
        <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono text-slate-600 dark:text-slate-400">
                {meta.ticketId}
              </span>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getTicketStatusStyle(meta.status)}`}
              >
                {meta.status}
              </span>
            </div>
            <span className={`text-xs font-medium ${getPriorityStyle(meta.priority)}`}>
              {meta.priority} Priority
            </span>
          </div>
        </div>
      );

    default:
      return null;
  }
}

// ÔöÇÔöÇÔöÇ Sub-components extracted to reduce cognitive complexity ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

function ContactLoadingSkeleton() {
  return (
    <div className="mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-16">
      <div className="mb-6">
        <Skeleton className="h-4 w-48 mb-2" />
        <Skeleton className="h-8 w-64" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
        <div className="lg:col-span-2">
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}

function ContactAuthRedirect() {
  return (
    <div className="mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-16">
      <Card className="p-8 text-center">
        <span className="material-symbols-outlined text-5xl text-slate-400 mb-4 animate-spin">
          progress_activity
        </span>
        <p className="text-slate-500 dark:text-slate-400">Redirecting to login...</p>
      </Card>
    </div>
  );
}

function ContactNotFoundError({ fromInsight }: { fromInsight: boolean }) {
  return (
    <div className="mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-16">
      <Card className="p-8 text-center">
        <span className="material-symbols-outlined text-5xl text-red-500 mb-4">
          {fromInsight ? 'link_off' : 'error'}
        </span>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
          {fromInsight ? 'Stale Insight' : 'Contact Not Found'}
        </h2>
        <p className="text-slate-500 dark:text-slate-400 mb-4">
          {fromInsight
            ? 'This contact may have been deleted since the insight was generated. The insight has been dismissed automatically.'
            : "The contact you're looking for doesn't exist or you don't have permission to view it."}
        </p>
        <div className="flex items-center justify-center gap-3">
          {fromInsight && (
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#137fec] text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              <span className="material-symbols-outlined text-sm">home</span> Back to Home
            </Link>
          )}
          <Link
            href="/contacts"
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#137fec] text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            <span className="material-symbols-outlined text-sm">arrow_back</span> Back to Contacts
          </Link>
        </div>
      </Card>
    </div>
  );
}

// ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

/** Returns true when a stale linked insight should be auto-dismissed. */
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

function transformFeedToActivities(
  feedItems: Array<{
    id: string;
    type: string;
    title: string;
    description?: string | null;
    timestamp: string | Date;
    actor?: { name?: string | null } | null;
    metadata?: Record<string, unknown> | null;
  }>
): Activity[] {
  return feedItems.map((item) => ({
    id: item.id,
    type: item.type.toLowerCase() as ActivityType,
    title: item.title,
    description: item.description || '',
    timestamp:
      typeof item.timestamp === 'string' ? item.timestamp : new Date(item.timestamp).toISOString(),
    user: item.actor?.name || 'System',
    metadata: item.metadata as Activity['metadata'],
    sentiment: item.metadata?.sentiment
      ? mapSentiment(String(item.metadata.sentiment).toUpperCase())
      : undefined,
    reactions: [],
    comments: [],
  }));
}

function buildChurnRiskData(
  insight: ContactWithRelations['aiInsight'] | undefined
): ChurnRiskData | null {
  if (!insight) return null;
  const levelMap: Record<string, ChurnRiskLevel> = {
    LOW: 'LOW',
    MEDIUM: 'MEDIUM',
    HIGH: 'HIGH',
    CRITICAL: 'CRITICAL',
    MINIMAL: 'MINIMAL',
  };
  const level = levelMap[insight.churnRisk] || 'LOW';
  const scoreMap: Record<ChurnRiskLevel, number> = {
    CRITICAL: 90,
    HIGH: 70,
    MEDIUM: 50,
    LOW: 25,
    MINIMAL: 10,
  };
  const slaMap: Record<ChurnRiskLevel, number> = {
    CRITICAL: 24,
    HIGH: 48,
    MEDIUM: 168,
    LOW: 336,
    MINIMAL: 720,
  };
  let trend: 'IMPROVING' | 'DECLINING' | 'STABLE';
  if (insight.sentimentTrend === 'IMPROVING') {
    trend = 'IMPROVING';
  } else if (insight.sentimentTrend === 'DECLINING') {
    trend = 'DECLINING';
  } else {
    trend = 'STABLE';
  }
  let engagementImpact: 'HIGH' | 'MEDIUM' | 'LOW';
  if (insight.engagementScore < 30) {
    engagementImpact = 'HIGH';
  } else if (insight.engagementScore < 60) {
    engagementImpact = 'MEDIUM';
  } else {
    engagementImpact = 'LOW';
  }
  let daysImpact: 'HIGH' | 'MEDIUM' | 'LOW';
  if (insight.lastEngagementDays > 30) {
    daysImpact = 'HIGH';
  } else if (insight.lastEngagementDays > 14) {
    daysImpact = 'MEDIUM';
  } else {
    daysImpact = 'LOW';
  }
  return {
    score: scoreMap[level],
    level,
    confidence: 0.85,
    slaHours: slaMap[level],
    trend,
    factors: [
      {
        factor: 'Engagement Score',
        impact: engagementImpact,
        value: `${insight.engagementScore}%`,
      },
      {
        factor: 'Days Since Contact',
        impact: daysImpact,
        value: `${insight.lastEngagementDays} days`,
      },
    ],
  };
}

function transformContactForUI(apiContact: ContactWithRelations) {
  const normalizedContactAvatar =
    normalizeAvatarSource(apiContact.avatarUrl) ??
    normalizeAvatarSource(defaultContactAvatar) ??
    defaultContactAvatar;
  const normalizedOwnerAvatar =
    normalizeAvatarSource(apiContact.owner?.avatarUrl) ??
    normalizeAvatarSource(defaultOwnerAvatar) ??
    defaultOwnerAvatar;

  return {
    id: apiContact.id,
    firstName: apiContact.firstName || '',
    lastName: apiContact.lastName || '',
    email: apiContact.email,
    phone: apiContact.phone || '',
    company: apiContact.account?.name || '',
    title: apiContact.title || '',
    department: apiContact.department || '',
    location: buildContactLocation(apiContact),
    timezone: '',
    status: (apiContact.status || 'ACTIVE') as ContactStatus,
    isOnline: false,
    isVIP: false,
    hasActiveDeal: (apiContact.opportunities?.length || 0) > 0,
    createdAt:
      typeof apiContact.createdAt === 'string'
        ? apiContact.createdAt
        : apiContact.createdAt.toISOString(),
    lastContactedAt:
      typeof apiContact.updatedAt === 'string'
        ? apiContact.updatedAt
        : apiContact.updatedAt.toISOString(),
    avatarUrl: normalizedContactAvatar,
    owner: apiContact.owner
      ? {
          name: apiContact.owner.name || 'Unknown',
          title: 'Account Executive',
          avatarUrl: normalizedOwnerAvatar,
        }
      : {
          name: 'Unassigned',
          title: '',
          avatarUrl: normalizedOwnerAvatar,
        },
    account: apiContact.account
      ? {
          id: apiContact.account.id,
          name: apiContact.account.name,
          industry: apiContact.account.industry || 'Unknown',
          website: apiContact.account.website || '',
        }
      : null,
    metrics: {
      totalDeals: apiContact.opportunities?.length || 0,
      totalValue: apiContact.opportunities?.reduce((sum, opp) => sum + (opp.value || 0), 0) || 0,
      openTasks: apiContact.tasks?.filter((t) => t.status !== 'COMPLETED').length || 0,
      emailsSent: apiContact.activities?.filter((a) => a.type === 'EMAIL').length || 0,
      emailsOpened: 0,
      meetings: apiContact.activities?.filter((a) => a.type === 'MEETING').length || 0,
    },
    tags: [],
  };
}

function filterContactActivities(
  activities: Activity[],
  activityTypeFilter: string,
  personFilter: string,
  searchQuery: string
) {
  return activities.filter((activity) => {
    if (activityTypeFilter !== 'all' && activity.type !== activityTypeFilter) return false;
    if (personFilter !== 'all' && activity.user !== personFilter) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesTitle = activity.title.toLowerCase().includes(query);
      const matchesDescription = activity.description.toLowerCase().includes(query);
      const matchesUser = activity.user.toLowerCase().includes(query);
      const matchesMetadata =
        activity.metadata?.subject?.toLowerCase().includes(query) ||
        activity.metadata?.preview?.toLowerCase().includes(query) ||
        activity.metadata?.notes?.toLowerCase().includes(query);
      if (!matchesTitle && !matchesDescription && !matchesUser && !matchesMetadata) return false;
    }
    return true;
  });
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
