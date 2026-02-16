'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  Card,
  Skeleton,
  ChurnRiskCard,
  NextBestActionCard,
  type ChurnRiskData,
  type NextBestActionData,
  type ChurnRiskLevel,
  type NBAActionType,
  type NBAPriority,
} from '@intelliflow/ui';
import { api } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { EntityActionSheet } from '@/components/shared/entity-action-sheet';
import { MoreActionsButton } from '@/components/shared/more-actions-button';
import { AppAvatar } from '@/components/shared/app-avatar';
import { RelatedTasksCard } from '@/components/tasks/RelatedTasksCard';
import { UpcomingEventsCard } from '@/components/shared';
import { normalizeAvatarSource } from '@/lib/shared/avatar-utils';
import { ActivityFeed } from '@/components/shared/activity-feed/ActivityFeed';

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

// Database activity type enum
type DBActivityType =
  | 'EMAIL'
  | 'CALL'
  | 'MEETING'
  | 'CHAT'
  | 'DOCUMENT'
  | 'DEAL'
  | 'TICKET'
  | 'NOTE';

// Map database activity types to UI activity types
const mapActivityType = (dbType: DBActivityType): ActivityType => {
  const typeMap: Record<DBActivityType, ActivityType> = {
    EMAIL: 'email',
    CALL: 'call',
    MEETING: 'meeting',
    CHAT: 'chat',
    DOCUMENT: 'document',
    DEAL: 'deal',
    TICKET: 'ticket',
    NOTE: 'note',
  };
  return typeMap[dbType] || 'note';
};

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
type ContactStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';

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
    closeDate: string | Date | null;
  }>;
  tasks?: Array<{
    id: string;
    title: string;
    dueDate: string | Date | null;
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
    endTime: string | Date | null;
    attendees: string[] | null;
  }>;
}

// Activity type filter options
const activityTypeFilters: { value: ActivityType | 'all'; label: string; icon: string }[] = [
  { value: 'all', label: 'All', icon: '📋' },
  { value: 'email', label: 'Emails', icon: '📧' },
  { value: 'call', label: 'Calls', icon: '📞' },
  { value: 'meeting', label: 'Meetings', icon: '📅' },
  { value: 'chat', label: 'Chats', icon: '💬' },
  { value: 'document', label: 'Documents', icon: '📄' },
  { value: 'deal', label: 'Deals', icon: '🎯' },
  { value: 'ticket', label: 'Tickets', icon: '🎫' },
  { value: 'note', label: 'Notes', icon: '📝' },
];

// Contact Status Badge Component
function ContactStatusBadge({ status }: { status: ContactStatus }) {
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
  };

  const config = statusConfig[status];

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-xs font-semibold ${config.className}`}
    >
      {config.icon}
      {config.label}
    </span>
  );
}

export default function Contact360Page() {
  // Get contact ID from URL params
  const params = useParams();
  const router = useRouter();
  const contactId = params.id as string;

  // Require authentication - redirects to login if not authenticated
  const { isLoading: authLoading, isAuthenticated } = useRequireAuth();

  // Fetch contact data from API
  const {
    data: rawApiContact,
    isLoading,
    error,
  } = api.contact.getById.useQuery(
    { id: contactId },
    { enabled: isAuthenticated && !authLoading && !!contactId }
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

  // Cast to extended type
  const apiContact = rawApiContact as ContactWithRelations | undefined;

  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [activityNote, setActivityNote] = useState('');
  const [expandedActivities, setExpandedActivities] = useState<Set<string>>(new Set());
  const [activityTypeFilter, setActivityTypeFilter] = useState<ActivityType | 'all'>('all');
  const [personFilter, setPersonFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(5);
  const [activityView, setActivityView] = useState<'timeline' | 'unified'>('timeline');

  // Transform API data to UI format
  const contact = useMemo(() => {
    if (!apiContact) return null;
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
      location: '', // Not in API yet
      timezone: '', // Not in API yet
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
        emailsOpened: 0, // Not tracked in current schema
        meetings: apiContact.activities?.filter((a) => a.type === 'MEETING').length || 0,
      },
      tags: [], // Not in API yet
    };
  }, [apiContact]);

  // Transform activities from API to UI format
  const activities: Activity[] = useMemo(() => {
    if (!apiContact?.activities) return [];
    return apiContact.activities.map((act) => ({
      id: act.id,
      type: mapActivityType(act.type as DBActivityType),
      title: act.title,
      description: act.description || '',
      timestamp: typeof act.timestamp === 'string' ? act.timestamp : act.timestamp.toISOString(),
      user: act.userName,
      metadata: act.metadata as Activity['metadata'],
      sentiment: mapSentiment(act.sentiment),
      reactions: [],
      comments: [],
    }));
  }, [apiContact?.activities]);

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
    return apiContact.opportunities.map((opp) => ({
      id: opp.id,
      name: opp.name,
      value: opp.value,
      stage: opp.stage,
      probability: opp.probability,
      closeDate: opp.closeDate
        ? typeof opp.closeDate === 'string'
          ? opp.closeDate
          : opp.closeDate.toISOString()
        : '',
    }));
  }, [apiContact?.opportunities]);

  // Transform tasks from API
  const tasks = useMemo(() => {
    if (!apiContact?.tasks) return [];
    return apiContact.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      dueDate: task.dueDate
        ? typeof task.dueDate === 'string'
          ? task.dueDate
          : task.dueDate.toISOString()
        : '',
      priority: task.priority?.toLowerCase() || 'medium',
      completed: task.status === 'COMPLETED',
    }));
  }, [apiContact?.tasks]);

  // Transform AI insights from API
  const aiInsights = useMemo(() => {
    const insight = apiContact?.aiInsight;
    if (!insight) {
      return {
        conversionProbability: 0,
        lifetimeValue: 0,
        churnRisk: 'Unknown',
        nextBestAction: 'Gather more information about this contact',
        sentiment: 'Unknown',
        engagementScore: 0,
        recommendations: ['No AI recommendations available yet'],
        quietPeriodAlert: null as string | null,
        sentimentTrend: null as string | null,
        lastEngagementDays: 0,
      };
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
  const churnRiskData: ChurnRiskData | null = useMemo(() => {
    const insight = apiContact?.aiInsight;
    if (!insight) return null;

    // Map database churn risk level to component format
    const levelMap: Record<string, ChurnRiskLevel> = {
      LOW: 'LOW',
      MEDIUM: 'MEDIUM',
      HIGH: 'HIGH',
      CRITICAL: 'CRITICAL',
      MINIMAL: 'MINIMAL',
    };
    const level = levelMap[insight.churnRisk] || 'LOW';

    // Map level to score range
    const scoreMap: Record<ChurnRiskLevel, number> = {
      CRITICAL: 90,
      HIGH: 70,
      MEDIUM: 50,
      LOW: 25,
      MINIMAL: 10,
    };

    // Map level to SLA hours
    const slaMap: Record<ChurnRiskLevel, number> = {
      CRITICAL: 24,
      HIGH: 48,
      MEDIUM: 168,
      LOW: 336,
      MINIMAL: 720,
    };

    return {
      score: scoreMap[level],
      level,
      confidence: 0.85, // Default confidence
      slaHours: slaMap[level],
      trend:
        insight.sentimentTrend === 'IMPROVING'
          ? 'IMPROVING'
          : insight.sentimentTrend === 'DECLINING'
            ? 'DECLINING'
            : 'STABLE',
      factors: [
        {
          factor: 'Engagement Score',
          impact:
            insight.engagementScore < 30 ? 'HIGH' : insight.engagementScore < 60 ? 'MEDIUM' : 'LOW',
          value: `${insight.engagementScore}%`,
        },
        {
          factor: 'Days Since Contact',
          impact:
            insight.lastEngagementDays > 30
              ? 'HIGH'
              : insight.lastEngagementDays > 14
                ? 'MEDIUM'
                : 'LOW',
          value: `${insight.lastEngagementDays} days`,
        },
      ],
    };
  }, [apiContact?.aiInsight]);

  // Transform AI insights to NextBestActionData format (IFC-095)
  const nextBestActionData: NextBestActionData | null = useMemo(() => {
    const insight = apiContact?.aiInsight;
    if (!insight || !insight.nextBestAction) return null;

    // Parse action type from next best action string
    const actionText = insight.nextBestAction.toUpperCase();
    let actionType: NBAActionType = 'WAIT';
    if (actionText.includes('CALL')) actionType = 'CALL';
    else if (actionText.includes('EMAIL')) actionType = 'EMAIL';
    else if (actionText.includes('MEET')) actionType = 'MEETING';
    else if (actionText.includes('PROPOSAL')) actionType = 'SEND_PROPOSAL';
    else if (actionText.includes('DEMO')) actionType = 'SCHEDULE_DEMO';
    else if (actionText.includes('DISCOUNT')) actionType = 'OFFER_DISCOUNT';
    else if (actionText.includes('TRAIN')) actionType = 'TRAINING';
    else if (actionText.includes('ESCALATE')) actionType = 'ESCALATE';

    // Determine priority based on churn risk
    let priority: NBAPriority = 'MEDIUM';
    if (insight.churnRisk === 'HIGH' || insight.churnRisk === 'CRITICAL') priority = 'HIGH';
    else if (insight.churnRisk === 'LOW' || insight.churnRisk === 'MINIMAL') priority = 'LOW';

    return {
      actionType,
      title: insight.nextBestAction,
      priority,
      rationale: `Based on ${insight.engagementScore}% engagement score and ${insight.churnRisk} churn risk level.`,
      confidence: 0.85,
    };
  }, [apiContact?.aiInsight]);

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
      { id: 'tickets', label: 'Tickets', count: 0 },
      { id: 'documents', label: 'Documents', count: apiContact?.documents?.length || 0 },
      { id: 'notes', label: 'Notes', count: notes.length },
      { id: 'ai-insights', label: 'AI Insights' },
    ],
    [activities.length, deals.length, notes.length, apiContact?.documents?.length]
  );

  // Filter and search activities
  const filteredActivities = useMemo(() => {
    return activities.filter((activity) => {
      // Type filter
      if (activityTypeFilter !== 'all' && activity.type !== activityTypeFilter) return false;
      // Person filter
      if (personFilter !== 'all' && activity.user !== personFilter) return false;
      // Search filter
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
  }, [activities, activityTypeFilter, personFilter, searchQuery]);

  // Visible activities (for infinite scroll simulation)
  const visibleActivities = filteredActivities.slice(0, visibleCount);
  const hasMore = visibleCount < filteredActivities.length;

  // Loading state
  if (isLoading) {
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

  // Auth error - show redirecting state
  if (error && isAuthError) {
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

  // Error state or no contact data (non-auth errors)
  if ((error && !isAuthError) || !contact) {
    return (
      <div className="mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-16">
        <Card className="p-8 text-center">
          <span className="material-symbols-outlined text-5xl text-red-500 mb-4">error</span>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
            Contact Not Found
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mb-4">
            The contact you&apos;re looking for doesn&apos;t exist or you don&apos;t have permission
            to view it.
          </p>
          <Link
            href="/contacts"
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#137fec] text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            <span className="material-symbols-outlined text-sm">arrow_back</span>
            Back to Contacts
          </Link>
        </Card>
      </div>
    );
  }

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

  // Format date helper
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return formatDate(dateString);
  };

  const getStageColor = (stage: string) => {
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
  };

  const getActivityIcon = (type: ActivityType) => {
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
  };

  const getActivityIconBg = (type: ActivityType) => {
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
  };

  const getSentimentColor = (sentiment?: string) => {
    switch (sentiment) {
      case 'positive':
        return 'text-green-500';
      case 'negative':
        return 'text-red-500';
      default:
        return 'text-slate-400';
    }
  };

  const getChannelIcon = (channel?: string) => {
    switch (channel) {
      case 'whatsapp':
        return '💬';
      case 'teams':
        return '👥';
      case 'slack':
        return '💼';
      default:
        return '💬';
    }
  };

  // Helper for call outcome styling
  const getCallOutcomeStyle = (outcome?: string) => {
    switch (outcome) {
      case 'connected':
        return 'bg-green-100 text-green-700';
      case 'voicemail':
        return 'bg-yellow-100 text-yellow-700';
      default:
        return 'bg-red-100 text-red-700';
    }
  };

  const getCallOutcomeLabel = (outcome?: string) => {
    switch (outcome) {
      case 'connected':
        return '✓ Connected';
      case 'voicemail':
        return '📞 Voicemail';
      default:
        return '✗ No Answer';
    }
  };

  // Helper for ticket status styling
  const getTicketStatusStyle = (status?: string) => {
    switch (status) {
      case 'Resolved':
        return 'bg-green-100 text-green-700';
      case 'Open':
        return 'bg-blue-100 text-blue-700';
      default:
        return 'bg-yellow-100 text-yellow-700';
    }
  };

  // Helper for priority styling
  const getPriorityStyle = (priority?: string) => {
    switch (priority) {
      case 'High':
        return 'text-red-600';
      case 'Medium':
        return 'text-yellow-600';
      default:
        return 'text-slate-500';
    }
  };

  // Helper for sentiment trend styling
  const getSentimentTrendStyle = (trend?: string) => {
    switch (trend) {
      case 'improving':
        return 'text-green-600';
      case 'declining':
        return 'text-red-600';
      default:
        return 'text-slate-600';
    }
  };

  // Helper for sentiment emoji
  const getSentimentEmoji = (sentiment?: string) => {
    switch (sentiment) {
      case 'positive':
        return '😊';
      case 'negative':
        return '😟';
      default:
        return '😐';
    }
  };

  // Render activity rich preview
  const renderRichPreview = (activity: Activity) => {
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
                </svg>
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
              {meta.recordingUrl && (
                <button className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-[#137fec] hover:bg-[#137fec]/10 rounded transition-colors">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  Play Recording
                </button>
              )}
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
                {meta.duration && <span className="text-slate-400">• {meta.duration}</span>}
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
                <span className="text-xs text-slate-500">• {meta.messageCount} messages</span>
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
            <button className="p-2 text-slate-500 hover:text-[#137fec] hover:bg-[#137fec]/10 rounded-lg transition-colors">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z" />
              </svg>
            </button>
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
  };

  // Render inline actions for activity
  const renderActivityActions = (_activity: Activity) => (
    <div className="flex items-center gap-1 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
      <button className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-slate-500 hover:text-[#137fec] hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors">
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z" />
        </svg>
        Reply
      </button>
      <button className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-slate-500 hover:text-[#137fec] hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors">
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
        React
      </button>
      <button className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-slate-500 hover:text-[#137fec] hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors">
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M5 21q-.825 0-1.412-.587Q3 19.825 3 19V5q0-.825.588-1.413Q4.175 3 5 3h14q.825 0 1.413.587Q21 4.175 21 5v10l-6 6Zm0-2h9v-5h5V5H5v14Z" />
        </svg>
        Add Note
      </button>
      <button className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-slate-500 hover:text-[#137fec] hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors">
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z" />
        </svg>
        Share
      </button>
    </div>
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
          <button className="flex items-center gap-2 px-4 h-10 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
            <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M5 19h1.4l8.625-8.625-1.4-1.4L5 17.6ZM19.3 8.925l-4.25-4.2 1.4-1.4q.575-.575 1.413-.575.837 0 1.412.575l1.4 1.4q.575.575.6 1.388.025.812-.55 1.387Z" />
            </svg>
            Edit Profile
          </button>
          <button className="flex items-center gap-2 px-4 h-10 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
            <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M4 20q-.825 0-1.412-.587Q2 18.825 2 18V6q0-.825.588-1.412Q3.175 4 4 4h16q.825 0 1.413.588Q22 5.175 22 6v12q0 .825-.587 1.413Q20.825 20 20 20Zm8-7 8-5V6l-8 5-8-5v2Z" />
            </svg>
            Email
          </button>
          <button className="flex items-center gap-2 px-4 h-10 rounded-lg bg-[#137fec] text-white text-sm font-semibold hover:bg-blue-600 transition-colors shadow-sm shadow-blue-200 dark:shadow-none">
            <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.95 21q-3.125 0-6.175-1.362-3.05-1.363-5.55-3.863-2.5-2.5-3.862-5.55Q3 7.175 3 4.05q0-.45.3-.75t.75-.3H8.1q.35 0 .625.238.275.237.325.562l.65 3.5q.05.4-.025.675-.075.275-.275.475L6.65 11.2q.7 1.3 1.65 2.475.95 1.175 2.1 2.175l2.65-2.65q.225-.225.525-.325.3-.1.625-.025l3.3.7q.35.1.563.363.212.262.212.587v4.05q0 .45-.3.75t-.75.3Z" />
            </svg>
            Log Call
          </button>
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
          { label: 'Merge Duplicate', icon: 'merge', onClick: () => {} },
          { label: 'Archive', icon: 'archive', onClick: () => {} },
          { label: 'Delete', icon: 'delete', onClick: () => {}, destructive: true },
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
                <Link
                  href={`/accounts/${contact.account?.id || ''}`}
                  className="flex items-center gap-1 text-[#137fec] text-sm font-medium mt-1 hover:underline"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M1 20V10h6V8l5-5 5 5v6h6v10H1ZM3 18h4v-2H3Zm0-4h4v-2H3Zm6 4h4v-6h4v6h-4v-4H9Zm0-8h4V8l-2-2-2 2Z" />
                  </svg>
                  <span>{contact.company}</span>
                </Link>
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
                    <a
                      href={`mailto:${contact.email}`}
                      className="text-sm text-slate-700 dark:text-slate-300 hover:text-[#137fec] break-all"
                    >
                      {contact.email}
                    </a>
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
                    {Math.round((contact.metrics.emailsOpened / contact.metrics.emailsSent) * 100)}%
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
            <div className="h-32 w-full bg-cover bg-center border-t border-slate-200 dark:border-slate-800 relative">
              <div className="w-full h-full bg-gradient-to-br from-blue-100 to-blue-50 dark:from-slate-700 dark:to-slate-800 flex items-center justify-center">
                <div className="text-center">
                  <svg
                    className="w-8 h-8 text-[#137fec] mx-auto mb-1"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M12 12q.825 0 1.413-.587Q14 10.825 14 10t-.587-1.413Q12.825 8 12 8t-1.412.587Q10 9.175 10 10t.588 1.413Q11.175 12 12 12Zm0 9.625q-.2 0-.4-.075t-.35-.2Q7.6 18.125 5.8 15.362 4 12.6 4 10.2q0-3.75 2.413-5.975Q8.825 2 12 2t5.588 2.225Q20 6.45 20 10.2q0 2.4-1.8 5.163-1.8 2.762-5.45 5.987-.15.125-.35.2-.2.075-.4.075Z" />
                  </svg>
                  <button className="bg-white/90 text-slate-900 text-xs font-bold px-3 py-1.5 rounded shadow-sm hover:bg-white transition">
                    View Map
                  </button>
                </div>
              </div>
            </div>
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
            <div className="p-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex gap-3">
                <div className="pt-1">
                  <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M5 19h1.4l8.625-8.625-1.4-1.4L5 17.6ZM19.3 8.925l-4.25-4.2 1.4-1.4q.575-.575 1.413-.575.837 0 1.412.575l1.4 1.4q.575.575.6 1.388.025.812-.55 1.387Z" />
                    </svg>
                  </div>
                </div>
                <div className="flex-1">
                  <textarea
                    value={activityNote}
                    onChange={(e) => setActivityNote(e.target.value)}
                    className="w-full rounded-lg border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-sm focus:border-[#137fec] focus:ring-1 focus:ring-[#137fec] min-h-[80px] p-3 placeholder:text-slate-400"
                    placeholder="Log a note, call, or email..."
                  />
                  <div className="flex justify-between items-center mt-2">
                    <div className="flex gap-2">
                      <button className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors">
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5a2.5 2.5 0 0 1 5 0v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5a2.5 2.5 0 0 0 5 0V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z" />
                        </svg>
                      </button>
                      <button className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors">
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z" />
                        </svg>
                      </button>
                      <button className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors">
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z" />
                        </svg>
                      </button>
                    </div>
                    <button className="bg-[#137fec] text-white text-sm font-semibold px-4 py-1.5 rounded-lg hover:bg-blue-600 transition-colors">
                      Log Activity
                    </button>
                  </div>
                </div>
              </div>
            </div>
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
                  <span className="material-symbols-outlined text-sm align-middle mr-1">timeline</span>
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
                  <span className="material-symbols-outlined text-sm align-middle mr-1">dynamic_feed</span>
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
                      <span>{filter.icon}</span>
                      {filter.label}
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
                {aiInsights.sentimentTrend && (
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
                        ⚠️ Quiet Period
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
              <div className="relative pl-4 space-y-4">
                {visibleActivities.map((activity) => {
                  const isExpanded = expandedActivities.has(activity.id);
                  return (
                    <div key={activity.id} className="relative">
                      {/* Timeline line */}
                      <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-slate-200 dark:bg-slate-700 -ml-4" />

                      {/* Activity Card */}
                      <div className="relative ml-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4 hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
                        {/* Timeline dot */}
                        <div
                          className={`absolute -left-8 top-4 w-8 h-8 rounded-full border-2 border-white dark:border-slate-900 flex items-center justify-center z-10 ${getActivityIconBg(activity.type)}`}
                        >
                          {getActivityIcon(activity.type)}
                        </div>

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
                              {activity.user} • {formatRelativeTime(activity.timestamp)}
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
                                      {comment.user} • {formatRelativeTime(comment.timestamp)}
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
                <div className="text-center py-12">
                  <svg
                    className="w-12 h-12 text-slate-300 mx-auto mb-4"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z" />
                  </svg>
                  <p className="text-slate-500">No activities match your filters</p>
                  <button
                    onClick={() => {
                      setActivityTypeFilter('all');
                      setPersonFilter('all');
                      setSearchQuery('');
                    }}
                    className="mt-2 text-sm text-[#137fec] hover:underline"
                  >
                    Clear filters
                  </button>
                </div>
              )}
              </>
              )}
            </Card>
          )}

          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <Card className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                    Recent Activity
                  </h3>
                  <button
                    onClick={() => setActiveTab('activity')}
                    className="text-sm text-[#137fec] hover:underline"
                  >
                    View All
                  </button>
                </div>
                <div className="space-y-4">
                  {activities.slice(0, 3).map((activity) => (
                    <div key={activity.id} className="flex items-start gap-3">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${getActivityIconBg(activity.type)}`}
                      >
                        {getActivityIcon(activity.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-white">
                          {activity.title}
                        </p>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
                          {activity.description}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          {activity.user} • {formatRelativeTime(activity.timestamp)}
                        </p>
                      </div>
                    </div>
                  ))}
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
                      {formatRelativeTime(contact.lastContactedAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-slate-500 dark:text-slate-400">Created</dt>
                    <dd className="text-sm font-medium text-slate-900 dark:text-white">
                      {formatDate(contact.createdAt)}
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
                            ${deal.value.toLocaleString()}
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
                <button className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-[#137fec] hover:bg-[#137fec]/10 rounded-lg transition-colors">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M11 13H5v-2h6V5h2v6h6v2h-6v6h-2Z" />
                  </svg>
                  Add Deal
                </button>
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
                          Close: {formatDate(deal.closeDate)}
                        </span>
                      </div>
                    </div>
                    <div className="text-right ml-4">
                      <p className="font-semibold text-slate-900 dark:text-white">
                        ${deal.value.toLocaleString()}
                      </p>
                      <p className="text-xs text-slate-500">{deal.probability}% probability</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Tickets Tab */}
          {activeTab === 'tickets' && (
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Tickets</h3>
                <button className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-[#137fec] hover:bg-[#137fec]/10 rounded-lg transition-colors">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M11 13H5v-2h6V5h2v6h6v2h-6v6h-2Z" />
                  </svg>
                  Create Ticket
                </button>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                      <svg
                        className="w-5 h-5 text-green-600"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-medium text-slate-900 dark:text-white">
                        Integration API question
                      </p>
                      <p className="text-xs text-slate-500">
                        TKT-1234 • Resolved • Medium Priority
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-slate-500">
                    {formatRelativeTime('2024-12-15T14:00:00Z')}
                  </span>
                </div>
              </div>
            </Card>
          )}

          {/* Documents Tab */}
          {activeTab === 'documents' && (
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Documents</h3>
                <button className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-[#137fec] hover:bg-[#137fec]/10 rounded-lg transition-colors">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M11 13H5v-2h6V5h2v6h6v2h-6v6h-2Z" />
                  </svg>
                  Upload
                </button>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-4 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <svg className="w-8 h-8 text-[#137fec]" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 2a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6H6Zm0 2h7v5h5v11H6V4Zm2 8v2h8v-2H8Zm0 4v2h5v-2H8Z" />
                  </svg>
                  <div className="flex-1">
                    <p className="font-medium text-slate-900 dark:text-white">
                      Enterprise License Proposal.pdf
                    </p>
                    <p className="text-sm text-slate-500">Sent Dec 15, 2024 • 2.4 MB</p>
                  </div>
                  <button className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7m-2 16H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7Z" />
                    </svg>
                  </button>
                </div>
                <div className="flex items-center gap-4 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <svg className="w-8 h-8 text-[#137fec]" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 2a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6H6Zm0 2h7v5h5v11H6V4Zm2 8v2h8v-2H8Zm0 4v2h5v-2H8Z" />
                  </svg>
                  <div className="flex-1">
                    <p className="font-medium text-slate-900 dark:text-white">
                      SOC2 Compliance Report.pdf
                    </p>
                    <p className="text-sm text-slate-500">Sent Dec 10, 2024 • 1.8 MB</p>
                  </div>
                  <button className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7m-2 16H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7Z" />
                    </svg>
                  </button>
                </div>
              </div>
            </Card>
          )}

          {/* Notes Tab */}
          {activeTab === 'notes' && (
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Notes</h3>
                <button className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-[#137fec] hover:bg-[#137fec]/10 rounded-lg transition-colors">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M11 13H5v-2h6V5h2v6h6v2h-6v6h-2Z" />
                  </svg>
                  Add Note
                </button>
              </div>
              <div className="space-y-4">
                {notes.map((note) => (
                  <div
                    key={note.id}
                    className="pb-4 border-b border-slate-100 dark:border-slate-800 last:border-0 last:pb-0"
                  >
                    <p className="text-sm text-slate-600 dark:text-slate-400">{note.content}</p>
                    <div className="flex items-center gap-2 mt-2 text-xs text-slate-500">
                      <span>{note.author}</span>
                      <span>•</span>
                      <span>{formatRelativeTime(note.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* AI Insights Tab (IFC-095) */}
          {activeTab === 'ai-insights' && (
            <div className="space-y-6">
              {/* Churn Risk and Next Best Action Cards */}
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

              {/* Quick Stats Row */}
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
            </div>
          )}
        </section>

        {/* Right Sidebar */}
        <aside className="lg:col-span-3 flex flex-col gap-6">
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
                onClick={() => setActiveTab('ai-insights')}
                className="w-full mt-2 text-sm text-[#137fec] hover:underline text-center"
              >
                View Full Analysis
              </button>
            </div>
          </Card>
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
              <button className="w-6 h-6 rounded hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-500">
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
                    <span>•</span>
                    <span>{formatRelativeTime(note.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
