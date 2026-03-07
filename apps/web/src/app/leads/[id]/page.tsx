'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  Button,
  Card,
  Skeleton,
  ChurnRiskCard,
  NextBestActionCard,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  toast,
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
import { PinButton } from '@/components/home/PinButton';
import { AppAvatar } from '@/components/shared/app-avatar';
import { RelatedTasksCard } from '@/components/tasks/RelatedTasksCard';
import { UpcomingEventsCard } from '@/components/shared';
import { normalizeAvatarSource } from '@/lib/shared/avatar-utils';
import { ActivityFeed } from '@/components/shared/activity-feed';

// Common nullable date type
type DateStringNull = Date | string | null;

// Tab types matching Contact360 pattern
type TabId = 'overview' | 'activity' | 'tasks' | 'notes' | 'emails' | 'files' | 'ai-insights';

interface Tab {
  id: TabId;
  label: string;
  count?: number;
}

// Activity types matching database enum
type ActivityType =
  | 'web_form'
  | 'score_update'
  | 'email'
  | 'call'
  | 'note'
  | 'meeting'
  | 'status_change'
  | 'qualification';
type DBActivityType =
  | 'WEB_FORM'
  | 'EMAIL'
  | 'CALL'
  | 'MEETING'
  | 'NOTE'
  | 'SCORE_UPDATE'
  | 'STATUS_CHANGE'
  | 'QUALIFICATION';

// Resolve icon name for a next-best-action label
function resolveActionIcon(text: string): string {
  if (text.includes('CALL') || text.includes('DISCOVERY')) return 'call';
  if (text.includes('EMAIL') || text.includes('FOLLOW')) return 'mail';
  if (text.includes('MEET') || text.includes('DEMO')) return 'calendar_add_on';
  if (text.includes('PROPOSAL')) return 'description';
  return 'lightbulb';
}

type ActionItem = { icon: string; label: string; primary: boolean };
type ImpactLevel = 'HIGH' | 'MEDIUM' | 'LOW';

// Resolve churn factor impact level for engagement score
function engagementImpact(score: number): ImpactLevel {
  if (score < 30) return 'HIGH';
  if (score < 60) return 'MEDIUM';
  return 'LOW';
}

// Resolve churn factor impact level for days since last contact
function lastContactImpact(days: number): ImpactLevel {
  if (days > 30) return 'HIGH';
  if (days > 14) return 'MEDIUM';
  return 'LOW';
}

// Resolve churn factor impact level for conversion probability
function conversionImpact(probability: number): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (probability < 30) return 'HIGH';
  if (probability < 60) return 'MEDIUM';
  return 'LOW';
}

// Resolve NBA action type from action text keywords
function resolveNBAActionType(actionText: string): NBAActionType {
  if (actionText.includes('CALL') || actionText.includes('DISCOVERY')) return 'CALL';
  if (actionText.includes('EMAIL') || actionText.includes('FOLLOW')) return 'EMAIL';
  if (actionText.includes('MEET')) return 'MEETING';
  if (actionText.includes('PROPOSAL')) return 'SEND_PROPOSAL';
  if (actionText.includes('DEMO')) return 'SCHEDULE_DEMO';
  if (actionText.includes('CASE STUDY')) return 'SEND_CASE_STUDY';
  if (actionText.includes('DISCOUNT')) return 'OFFER_DISCOUNT';
  if (actionText.includes('TRAIN')) return 'TRAINING';
  if (actionText.includes('ESCALATE')) return 'ESCALATE';
  return 'WAIT';
}

// Resolve NBA priority from churn risk and conversion probability
function resolveNBAPriority(churnRisk: string, conversionProbability: number): NBAPriority {
  if (churnRisk === 'HIGH' || churnRisk === 'CRITICAL') return 'HIGH';
  if (conversionProbability >= 70) return 'HIGH';
  if (churnRisk === 'LOW' || churnRisk === 'MINIMAL') return 'LOW';
  return 'MEDIUM';
}

// Build the nextBestActions array from an AI insight object
function buildNextBestActions(insight: {
  nextBestAction: string | null | undefined;
  recommendations: unknown;
}): ActionItem[] {
  const actions: ActionItem[] = [];
  if (insight.nextBestAction) {
    const icon = resolveActionIcon(insight.nextBestAction.toUpperCase());
    actions.push({ icon, label: insight.nextBestAction, primary: true });
  }
  const recs = (insight.recommendations as string[]) || [];
  if (recs.length > 0 && recs[0] !== insight.nextBestAction) {
    actions.push({ icon: 'auto_awesome', label: recs[0], primary: false });
  }
  if (actions.length === 0) {
    actions.push({ icon: 'calendar_add_on', label: 'Schedule Discovery Call', primary: true });
  }
  return actions;
}

// Map database activity types to UI activity types
const mapActivityType = (dbType: Readonly<DBActivityType>): ActivityType => {
  const typeMap: Record<DBActivityType, ActivityType> = {
    WEB_FORM: 'web_form',
    EMAIL: 'email',
    CALL: 'call',
    MEETING: 'meeting',
    NOTE: 'note',
    SCORE_UPDATE: 'score_update',
    STATUS_CHANGE: 'status_change',
    QUALIFICATION: 'qualification',
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

interface Activity {
  id: string;
  type: ActivityType;
  title: string;
  description: string;
  timestamp: string;
  user: string;
  metadata?: {
    // Web form
    source?: string;
    message?: string;
    // Score update
    oldScore?: number;
    newScore?: number;
    // Email
    subject?: string;
    preview?: string;
    opened?: boolean;
    clicked?: boolean;
    openCount?: number;
    // Call
    duration?: string;
    outcome?: 'connected' | 'voicemail' | 'no-answer';
    recordingUrl?: string;
    // Meeting
    attendees?: string[];
    location?: string;
    notes?: string;
    // Status change
    oldStatus?: string;
    newStatus?: string;
  };
  sentiment?: 'positive' | 'neutral' | 'negative';
  reactions?: { emoji: string; count: number; users: string[] }[];
  comments?: { user: string; text: string; timestamp: string }[];
}

// Lead status type matching domain
type LeadStatus = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'UNQUALIFIED' | 'CONVERTED' | 'LOST';
type LeadSource = 'WEBSITE' | 'REFERRAL' | 'SOCIAL' | 'EMAIL' | 'COLD_CALL' | 'EVENT' | 'OTHER';
type LeadTemperature = 'hot' | 'warm' | 'cold';

// Default avatar for leads without one
const defaultLeadAvatar =
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=160&h=160&fit=crop&crop=face';
const defaultOwnerAvatar =
  'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=80&h=80&fit=crop&crop=face';

// Extended Lead type with relations (to be replaced by Prisma-generated types after regeneration)
interface LeadWithRelations {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  phone: string | { value?: string } | null;
  company: string | null;
  title: string | null;
  status: string;
  source: string;
  score: number;
  createdAt: string | Date;
  updatedAt: string | Date;
  // New Lead 360 fields
  location?: string | null;
  website?: string | null;
  avatarUrl?: string | null;
  lastContactedAt?: DateStringNull;
  estimatedValue?: number | null;
  tags?: string[];
  // Relations
  owner?: {
    id: string;
    email: string;
    name: string | null;
    avatarUrl: string | null;
    role?: string;
  } | null;
  activities?: Array<{
    id: string;
    type: string;
    title: string;
    description: string | null;
    timestamp: string | Date;
    userName: string;
    sentiment: string | null;
    metadata: unknown;
  }>;
  notes?: Array<{
    id: string;
    content: string;
    author: string;
    createdAt: string | Date;
  }>;
  files?: Array<{
    id: string;
    name: string;
    size: string;
    uploadedAt: string | Date;
  }>;
  tasks?: Array<{
    id: string;
    title: string;
    dueDate: DateStringNull;
    priority: string | null;
    status: string;
  }>;
  aiInsight?: {
    id: string;
    conversionProbability: number;
    estimatedValue: number;
    churnRisk: string;
    engagementScore: number;
    sentiment: string | null;
    sentimentTrend: string | null;
    lastEngagementDays: number;
    nextBestAction: string | null;
    recommendations: unknown;
    icpMatch: string | null;
  } | null;
}

// Activity type filter options
const activityTypeFilters: { value: ActivityType | 'all'; label: string; icon: string }[] = [
  { value: 'all', label: 'All', icon: '📋' },
  { value: 'email', label: 'Emails', icon: '📧' },
  { value: 'call', label: 'Calls', icon: '📞' },
  { value: 'note', label: 'Notes', icon: '📝' },
  { value: 'meeting', label: 'Meetings', icon: '📅' },
  { value: 'web_form', label: 'Web Forms', icon: '🌐' },
  { value: 'score_update', label: 'Scores', icon: '📊' },
];

// Lead Status Badge Component
function LeadStatusBadge({ status }: Readonly<{ status: LeadStatus }>) {
  const statusConfig: Record<LeadStatus, { label: string; className: string }> = {
    NEW: {
      label: 'New Lead',
      className:
        'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800',
    },
    CONTACTED: {
      label: 'Contacted',
      className:
        'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800',
    },
    QUALIFIED: {
      label: 'Qualified',
      className:
        'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800',
    },
    UNQUALIFIED: {
      label: 'Unqualified',
      className:
        'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
    },
    CONVERTED: {
      label: 'Converted',
      className:
        'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800',
    },
    LOST: {
      label: 'Lost',
      className:
        'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',
    },
  };

  const config = statusConfig[status];
  return (
    <span
      className={`inline-flex items-center px-2 py-1 rounded border text-xs font-semibold ${config.className}`}
    >
      {config.label}
    </span>
  );
}

// Temperature Badge Component
function TemperatureBadge({ temperature }: Readonly<{ temperature: LeadTemperature }>) {
  const config: Record<LeadTemperature, { label: string; className: string }> = {
    hot: {
      label: 'Hot',
      className: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400',
    },
    warm: {
      label: 'Warm',
      className:
        'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400',
    },
    cold: {
      label: 'Cold',
      className: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-400',
    },
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-1 rounded border text-xs font-semibold ${config[temperature].className}`}
    >
      {config[temperature].label}
    </span>
  );
}

// --- Module-level helpers extracted to reduce component cognitive complexity ---

function getLeadErrorMessage(
  isServerError: boolean,
  isNotFound: boolean,
  errorMessage: string | undefined
): string {
  if (isServerError) return 'An unexpected error occurred. Please try again.';
  if (isNotFound) return "The lead you're looking for doesn't exist or you don't have permission to view it.";
  return errorMessage || 'An error occurred while loading this lead.';
}

function matchesActivitySearch(activity: Activity, query: string): boolean {
  const q = query.toLowerCase();
  return (
    activity.title.toLowerCase().includes(q) ||
    activity.description.toLowerCase().includes(q) ||
    activity.user.toLowerCase().includes(q) ||
    !!activity.metadata?.subject?.toLowerCase().includes(q) ||
    !!activity.metadata?.preview?.toLowerCase().includes(q) ||
    !!activity.metadata?.message?.toLowerCase().includes(q)
  );
}

function filterActivity(
  activity: Activity,
  typeFilter: ActivityType | 'all',
  personFilter: string,
  searchQuery: string
): boolean {
  if (typeFilter !== 'all' && activity.type !== typeFilter) return false;
  if (personFilter !== 'all' && activity.user !== personFilter) return false;
  if (searchQuery && !matchesActivitySearch(activity, searchQuery)) return false;
  return true;
}

function getCallOutcomeBadge(outcome: string | undefined): { cls: string; label: string } {
  if (outcome === 'connected') return { cls: 'bg-green-100 text-green-700', label: '✓ Connected' };
  if (outcome === 'voicemail') return { cls: 'bg-yellow-100 text-yellow-700', label: '📞 Voicemail' };
  return { cls: 'bg-red-100 text-red-700', label: '✗ No Answer' };
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

// Source Badge Component
function SourceBadge({ source }: Readonly<{ source: LeadSource }>) {
  const sourceConfig: Record<LeadSource, { label: string; className: string }> = {
    WEBSITE: { label: 'Website', className: 'bg-blue-50 text-blue-700 border-blue-200' },
    REFERRAL: { label: 'Referral', className: 'bg-green-50 text-green-700 border-green-200' },
    SOCIAL: { label: 'Social', className: 'bg-purple-50 text-purple-700 border-purple-200' },
    EMAIL: { label: 'Email', className: 'bg-orange-50 text-orange-700 border-orange-200' },
    COLD_CALL: { label: 'Cold Call', className: 'bg-slate-100 text-slate-700 border-slate-200' },
    EVENT: { label: 'Event', className: 'bg-pink-50 text-pink-700 border-pink-200' },
    OTHER: { label: 'Other', className: 'bg-slate-100 text-slate-600 border-slate-200' },
  };

  const config = sourceConfig[source];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${config.className}`}
    >
      {config.label}
    </span>
  );
}

export default function Lead360Page() { // NOSONAR typescript:S3776
  // Get lead ID from URL params
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const leadId = params.id as string;

  // Require authentication - redirects to login if not authenticated
  const { isLoading: authLoading, isAuthenticated } = useRequireAuth();

  // Fetch lead data from API
  const {
    data: rawApiLead,
    isLoading,
    error,
  } = api.lead.getById.useQuery(
    { id: leadId },
    { enabled: isAuthenticated && !authLoading && !!leadId }
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

  // Cast to extended type (will be properly typed after Prisma regeneration)
  const apiLead = rawApiLead as LeadWithRelations | undefined;

  const validTabs: TabId[] = ['overview', 'activity', 'tasks', 'notes', 'emails', 'files', 'ai-insights'];
  const tabParam = searchParams.get('tab') as TabId | null;
  const [activeTab, setActiveTab] = useState<TabId>(tabParam && validTabs.includes(tabParam) ? tabParam : 'overview');
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [activityNote, setActivityNote] = useState('');
  const [activityTypeFilter, setActivityTypeFilter] = useState<ActivityType | 'all'>('all');
  const [personFilter, setPersonFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedActivities, setExpandedActivities] = useState<Set<string>>(new Set());
  const [visibleCount, setVisibleCount] = useState(5);
  const [activityView, setActivityView] = useState<'timeline' | 'unified'>('timeline');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [logCallOpen, setLogCallOpen] = useState(false);
  const [logCallTitle, setLogCallTitle] = useState('');
  const [logCallDescription, setLogCallDescription] = useState('');

  // API utils for cache invalidation
  const utils = api.useUtils();

  // Mutations
  const deleteMutation = api.lead.delete.useMutation({
    onSuccess: () => {
      toast({ title: 'Lead deleted', description: 'The lead has been permanently deleted.' });
      router.push('/leads');
    },
    onError: (err) => {
      toast({ title: 'Delete failed', description: err.message, variant: 'destructive' });
    },
  });

  const archiveMutation = api.lead.update.useMutation({
    onSuccess: () => {
      toast({ title: 'Lead archived', description: 'The lead has been moved to Lost status.' });
      utils.lead.getById.invalidate({ id: leadId });
    },
    onError: (err) => {
      toast({ title: 'Archive failed', description: err.message, variant: 'destructive' });
    },
  });

  const convertMutation = api.lead.convert.useMutation({
    onSuccess: (data) => {
      toast({ title: 'Lead converted', description: 'Lead has been converted to a contact.' });
      router.push(`/contacts/${data.contactId}`);
    },
    onError: (err) => {
      toast({ title: 'Conversion failed', description: err.message, variant: 'destructive' });
    },
  });

  const scoreWithAIMutation = api.lead.scoreWithAI.useMutation({
    onSuccess: () => {
      toast({ title: 'AI analysis complete', description: 'Lead has been scored by AI.' });
      utils.lead.getById.invalidate({ id: leadId });
    },
    onError: (err) => {
      toast({ title: 'AI analysis failed', description: err.message, variant: 'destructive' });
    },
  });

  const addNoteMutation = api.lead.addNote.useMutation({
    onSuccess: () => {
      toast({ title: 'Note added', description: 'Your note has been saved.' });
      setActivityNote('');
      utils.lead.getById.invalidate({ id: leadId });
    },
    onError: (err) => {
      toast({ title: 'Failed to add note', description: err.message, variant: 'destructive' });
    },
  });

  const logActivityMutation = api.lead.logActivity.useMutation({
    onSuccess: () => {
      toast({ title: 'Activity logged', description: 'Activity has been recorded.' });
      setActivityNote('');
      setLogCallOpen(false);
      setLogCallTitle('');
      setLogCallDescription('');
      utils.lead.getById.invalidate({ id: leadId });
    },
    onError: (err) => {
      toast({ title: 'Failed to log activity', description: err.message, variant: 'destructive' });
    },
  });

  // Calculate temperature based on score
  const getTemperature = (score: number): LeadTemperature => {
    if (score >= 70) return 'hot';
    if (score >= 40) return 'warm';
    return 'cold';
  };

  const getOwnerTitle = (role: string | undefined): string => {
    const roleMap: Record<string, string> = {
      SALES_REP: 'Sales Representative',
      MANAGER: 'Manager',
      ADMIN: 'Administrator',
      USER: 'Team Member',
    };
    return roleMap[role || ''] || 'Team Member';
  };

  // Transform API data to UI format
  const lead = useMemo(() => {
    if (!apiLead) return null;
    const normalizedLeadAvatar =
      normalizeAvatarSource(apiLead.avatarUrl) ??
      normalizeAvatarSource(defaultLeadAvatar) ??
      defaultLeadAvatar;
    const normalizedOwnerAvatar =
      normalizeAvatarSource(apiLead.owner?.avatarUrl) ??
      normalizeAvatarSource(defaultOwnerAvatar) ??
      defaultOwnerAvatar;

    // Handle phone - could be string or value object
    const phoneValue =
      typeof apiLead.phone === 'string'
        ? apiLead.phone
        : (apiLead.phone as { value?: string } | null)?.value || '';

    return {
      id: apiLead.id,
      firstName: apiLead.firstName || '',
      lastName: apiLead.lastName || '',
      email: apiLead.email,
      phone: phoneValue,
      company: apiLead.company || '',
      title: apiLead.title || '',
      location: apiLead.location || '',
      website: apiLead.website || '',
      status: apiLead.status as LeadStatus,
      source: apiLead.source as LeadSource,
      score: apiLead.score,
      temperature: getTemperature(apiLead.score),
      createdAt: apiLead.createdAt,
      lastContactedAt: apiLead.lastContactedAt || apiLead.createdAt,
      avatarUrl: normalizedLeadAvatar,
      estimatedValue: apiLead.estimatedValue || 0,
      tags: apiLead.tags || [],
      owner: apiLead.owner
        ? {
            name: apiLead.owner.name || 'Unknown',
            title: getOwnerTitle(apiLead.owner?.role),
            avatarUrl: normalizedOwnerAvatar,
          }
        : {
            name: 'Unassigned',
            title: '',
            avatarUrl: normalizedOwnerAvatar,
          },
    };
  }, [apiLead]);

  // Transform activities from API to UI format
  const activities: Activity[] = useMemo(() => {
    if (!apiLead?.activities) return [];
    return apiLead.activities.map((act) => ({
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
  }, [apiLead?.activities]);

  // Transform notes from API
  const notes = useMemo(() => {
    if (!apiLead?.notes) return [];
    return apiLead.notes.map((note) => ({
      id: note.id,
      content: note.content,
      author: note.author,
      createdAt: typeof note.createdAt === 'string' ? note.createdAt : note.createdAt.toISOString(),
    }));
  }, [apiLead?.notes]);

  // Transform files from API
  const files = useMemo(() => {
    if (!apiLead?.files) return [];
    return apiLead.files.map((file) => ({
      id: file.id,
      name: file.name,
      size: file.size,
      uploadedAt:
        typeof file.uploadedAt === 'string' ? file.uploadedAt : file.uploadedAt.toISOString(),
    }));
  }, [apiLead?.files]);

  // Transform tasks from API
  const tasks = useMemo(() => {
    if (!apiLead?.tasks) return [];
    return apiLead.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      dueDate: (() => {
        if (!task.dueDate) return '';
        if (typeof task.dueDate === 'string') return task.dueDate;
        return task.dueDate.toISOString();
      })(),
      priority: task.priority?.toLowerCase() || 'medium',
      completed: task.status === 'COMPLETED',
    }));
  }, [apiLead?.tasks]);

  // Derive emails from email activities
  const emails = useMemo(() => {
    return activities
      .filter((act) => act.type === 'email')
      .map((act) => ({
        id: act.id,
        subject: act.metadata?.subject || act.title,
        status: act.metadata?.opened ? 'opened' : 'sent',
        sentAt: act.timestamp,
        openCount: act.metadata?.openCount || 0,
      }));
  }, [activities]);

  // Transform AI insights from API
  const aiInsights = useMemo(() => {
    const insight = apiLead?.aiInsight;
    if (!insight) {
      return {
        qualificationScore: lead?.score || 0,
        engagementLevel: 'Unknown',
        engagementScore: 0,
        conversionProbability: 0,
        estimatedValue: lead?.estimatedValue || 0,
        churnRisk: 'Unknown',
        sentiment: 'Unknown',
        sentimentTrend: null as string | null,
        lastEngagementDays: 0,
        nextBestAction: 'Gather more information about this lead',
        nextBestActions: [
          { icon: 'calendar_add_on', label: 'Schedule Discovery Call', primary: true },
          { icon: 'mail', label: 'Send Follow-up Email', primary: false },
        ] as { icon: string; label: string; primary: boolean }[],
        recommendations: ['No AI recommendations available yet'],
        icpMatch: 'Not analyzed yet',
      };
    }

    const mediumOrLow = insight.engagementScore >= 40 ? 'Medium' : 'Low';
    const engagementLevel = insight.engagementScore >= 70 ? 'High' : mediumOrLow;

    return {
      qualificationScore: lead?.score || insight.engagementScore,
      engagementLevel,
      engagementScore: insight.engagementScore,
      conversionProbability: insight.conversionProbability,
      estimatedValue: insight.estimatedValue,
      churnRisk: insight.churnRisk,
      sentiment: insight.sentiment || 'Neutral',
      sentimentTrend: insight.sentimentTrend,
      lastEngagementDays: insight.lastEngagementDays,
      nextBestAction: insight.nextBestAction || 'No action recommended',
      nextBestActions: buildNextBestActions(insight),
      recommendations: (insight.recommendations as string[]) || [],
      icpMatch: insight.icpMatch || 'Not analyzed',
    };
  }, [apiLead?.aiInsight, lead?.score, lead?.estimatedValue]);

  // Transform AI insights to ChurnRiskData format (IFC-095)
  const churnRiskData: ChurnRiskData | null = useMemo(() => {
    const insight = apiLead?.aiInsight;
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

    // Derive confidence from how far the engagement score deviates from neutral (50)
    const engDelta = Math.abs(insight.engagementScore - 50);
    const derivedConfidence = Math.min(0.95, 0.5 + engDelta / 100);

    return {
      score: scoreMap[level],
      level,
      confidence: derivedConfidence,
      slaHours: slaMap[level],
      trend: (() => {
        if (insight.sentimentTrend === 'IMPROVING') return 'IMPROVING';
        if (insight.sentimentTrend === 'DECLINING') return 'DECLINING';
        return 'STABLE';
      })(),
      factors: [
        {
          factor: 'Engagement Score',
          impact: engagementImpact(insight.engagementScore),
          value: `${insight.engagementScore}%`,
        },
        {
          factor: 'Days Since Contact',
          impact: lastContactImpact(insight.lastEngagementDays),
          value: `${insight.lastEngagementDays} days`,
        },
        {
          factor: 'Conversion Probability',
          impact: conversionImpact(insight.conversionProbability),
          value: `${insight.conversionProbability}%`,
        },
      ],
    };
  }, [apiLead?.aiInsight]);

  // Transform AI insights to NextBestActionData format (IFC-095)
  const nextBestActionData: NextBestActionData | null = useMemo(() => {
    const insight = apiLead?.aiInsight;
    if (!insight?.nextBestAction) return null;

    const actionType = resolveNBAActionType(insight.nextBestAction.toUpperCase());
    const priority = resolveNBAPriority(insight.churnRisk, insight.conversionProbability);

    return {
      actionType,
      title: insight.nextBestAction,
      priority,
      rationale: `Based on ${insight.engagementScore}% engagement, ${insight.conversionProbability}% conversion probability, and ${insight.churnRisk} churn risk.`,
      confidence: insight.engagementScore / 100,
      successProbability: insight.conversionProbability / 100,
    };
  }, [apiLead?.aiInsight]);

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

  // Dynamic tabs with real counts
  const tabs: Tab[] = useMemo(
    () => [
      { id: 'overview', label: 'Overview' },
      { id: 'activity', label: 'Activity', count: activities.length },
      { id: 'tasks', label: 'Tasks', count: tasks.filter((t) => !t.completed).length },
      { id: 'notes', label: 'Notes', count: notes.length },
      { id: 'emails', label: 'Emails', count: emails.length },
      { id: 'files', label: 'Files', count: files.length },
      { id: 'ai-insights', label: 'AI Insights' },
    ],
    [activities.length, tasks, notes.length, emails.length, files.length]
  );

  // Loading state
  if (isLoading) {
    return (
      <div className="mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-16">
        <div className="mb-6">
          <Skeleton className="h-4 w-48 mb-2" />
          <Skeleton className="h-8 w-64" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Profile card skeleton */}
          <div className="lg:col-span-3">
            <Card className="p-6">
              <div className="flex flex-col items-center text-center gap-3 mb-4">
                <Skeleton className="h-16 w-16 rounded-full" />
                <Skeleton className="h-5 w-36" />
                <Skeleton className="h-4 w-28" />
              </div>
              <div className="mt-3">
                <div className="flex justify-between mb-1.5">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3 w-8" />
                </div>
                <Skeleton className="h-2 w-full rounded-full" />
              </div>
            </Card>
          </div>
          {/* Tabs + content skeleton */}
          <div className="lg:col-span-6">
            <Card className="p-6">
              <div className="flex gap-4 mb-6 border-b pb-3">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-5 w-20" />
              </div>
              <Skeleton className="h-32 w-full mb-4 rounded-lg" />
              <Skeleton className="h-32 w-full rounded-lg" />
            </Card>
          </div>
          {/* Sidebar skeleton */}
          <div className="lg:col-span-3 flex flex-col gap-4">
            <Card className="p-5">
              <Skeleton className="h-5 w-20 mb-4" />
              <Skeleton className="h-2 w-full rounded-full mb-2" />
              <Skeleton className="h-4 w-3/4 mb-4" />
              <Skeleton className="h-2 w-full rounded-full" />
            </Card>
            <Card className="p-5">
              <Skeleton className="h-5 w-16 mb-3" />
              <Skeleton className="h-10 w-full rounded mb-2" />
              <Skeleton className="h-10 w-full rounded" />
            </Card>
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

  // Error state or no lead data (non-auth errors)
  if ((error && !isAuthError) || !lead) {
    const isNotFound = error?.data?.code === 'NOT_FOUND' || !lead;
    const isServerError = error?.data?.code === 'INTERNAL_SERVER_ERROR';

    return (
      <div className="mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-16">
        <Card className="p-8 text-center">
          <span className="material-symbols-outlined text-5xl text-red-500 mb-4">
            {isServerError ? 'cloud_off' : 'error'}
          </span>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
            {isServerError ? 'Something Went Wrong' : 'Lead Not Found'}
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mb-4">
            {getLeadErrorMessage(isServerError, isNotFound, error?.message)}
          </p>
          <div className="flex items-center justify-center gap-3">
            {isServerError && (
              <button
                onClick={() => globalThis.location.reload()}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#137fec] text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                <span className="material-symbols-outlined !text-lg">refresh</span>{' '}Retry
              </button>
            )}
            <Link
              href="/leads"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#137fec] text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              <span className="material-symbols-outlined !text-lg">arrow_back</span>{' '}Back to Leads
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  // Compute metrics from activities
  const emailActivities = activities.filter((act) => act.type === 'email');
  const meetingActivities = activities.filter((act) => act.type === 'meeting');
  const emailsOpened = emailActivities.filter((act) => act.metadata?.opened).length;
  const leadMetrics = {
    estimatedValue: lead.estimatedValue,
    emailsSent: emailActivities.length,
    emailsOpened,
    meetings: meetingActivities.length,
    touchpoints: activities.length,
  };

  // Filter activities
  const filteredActivities = activities.filter((activity) =>
    filterActivity(activity, activityTypeFilter, personFilter, searchQuery)
  );

  const visibleActivities = filteredActivities.slice(0, visibleCount);
  const hasMore = visibleCount < filteredActivities.length;

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

  // Format date helper (formatRelativeTime is defined at module level)
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Activity icon and color helpers
  const getActivityIcon = (type: Readonly<ActivityType>): string => {
    const icons: Record<ActivityType, string> = {
      web_form: 'web',
      score_update: 'psychology',
      email: 'mail',
      call: 'call',
      note: 'edit_note',
      meeting: 'event',
      status_change: 'person_add',
      qualification: 'verified',
    };
    return icons[type];
  };

  const getActivityIconBg = (type: Readonly<ActivityType>): string => {
    const colors: Record<ActivityType, string> = {
      web_form: 'bg-blue-100 dark:bg-slate-800 text-blue-600',
      score_update: 'bg-purple-100 dark:bg-slate-800 text-purple-600',
      email: 'bg-orange-100 dark:bg-slate-800 text-orange-600',
      call: 'bg-green-100 dark:bg-slate-800 text-green-600',
      note: 'bg-amber-100 dark:bg-slate-800 text-amber-600',
      meeting: 'bg-indigo-100 dark:bg-slate-800 text-indigo-600',
      status_change: 'bg-slate-100 dark:bg-slate-800 text-slate-500',
      qualification: 'bg-teal-100 dark:bg-slate-800 text-teal-600',
    };
    return colors[type];
  };

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

  // Render activity rich preview
  const renderRichPreview = (activity: Activity) => {
    if (!activity.metadata) return null;
    const meta = activity.metadata;

    switch (activity.type) {
      case 'web_form':
        return (
          <div className="mt-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 border border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
            <p>
              <span className="font-semibold">Message:</span>{' '}"{meta.message}"
            </p>
          </div>
        );

      case 'score_update':
        return (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs text-slate-500">Score changed from</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">
              {meta.oldScore}
            </span>
            <span className="material-symbols-outlined text-slate-400 !text-sm">arrow_forward</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
              {meta.newScore}
            </span>
          </div>
        );

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
            <div className="flex gap-2 mt-2">
              {meta.opened && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-600 border border-blue-100">
                  <span className="material-symbols-outlined !text-[14px] mr-1">done_all</span>{' '}
                  Opened{meta.openCount && meta.openCount > 1 ? ` ${meta.openCount}x` : ''}
                </span>
              )}
              {meta.clicked && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">
                  Clicked Link
                </span>
              )}
            </div>
          </div>
        );

      case 'call': {
        const callOutcome = getCallOutcomeBadge(meta.outcome);
        return (
          <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${callOutcome.cls}`}
                >
                  {callOutcome.label}
                </span>
                {meta.duration && <span className="text-sm text-slate-500">{meta.duration}</span>}
              </div>
              {meta.recordingUrl && (
                <button className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-[#137fec] hover:bg-[#137fec]/10 rounded transition-colors">
                  <span className="material-symbols-outlined !text-[16px]">play_arrow</span>{' '}
                  Play Recording
                </button>
              )}
            </div>
          </div>
        );
      }

      case 'meeting':
        return (
          <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-700">
            {meta.location && (
              <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 mb-2">
                <span className="material-symbols-outlined !text-[16px]">location_on</span>{' '}
                {meta.location}
                {meta.duration && <span className="text-slate-400">• {meta.duration}</span>}
              </div>
            )}
            {meta.attendees && meta.attendees.length > 0 && (
              <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                <span className="material-symbols-outlined !text-[16px]">group</span>{' '}
                {meta.attendees.join(', ')}
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  // Render inline actions for activity
  const renderActivityActions = () => (
    <div className="flex items-center gap-1 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
      <button className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-slate-500 hover:text-[#137fec] hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors">
        <span className="material-symbols-outlined !text-[14px]">reply</span>{' '}
        Reply
      </button>
      <button className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-slate-500 hover:text-[#137fec] hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors">
        <span className="material-symbols-outlined !text-[14px]">add_reaction</span>{' '}
        React
      </button>
      <button className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-slate-500 hover:text-[#137fec] hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors">
        <span className="material-symbols-outlined !text-[14px]">note_add</span>{' '}
        Add Note
      </button>
      <button className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-slate-500 hover:text-[#137fec] hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors">
        <span className="material-symbols-outlined !text-[14px]">share</span>{' '}
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
            <Link href="/leads" className="hover:text-[#137fec]">
              Leads
            </Link>
            <span className="material-symbols-outlined !text-sm">chevron_right</span>
            <span className="font-medium text-slate-900 dark:text-white">
              {lead.firstName} {lead.lastName}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            {lead.firstName} {lead.lastName}
          </h1>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => convertMutation.mutate({ leadId: lead.id })}
            disabled={convertMutation.isPending}
            className="flex items-center gap-2 px-4 h-10 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            <span className="material-symbols-outlined !text-[18px]">transform</span>{' '}
            {convertMutation.isPending ? 'Converting...' : 'Convert Lead'}
          </button>
          <button
            onClick={() => router.push(`/leads/${lead.id}/edit`)}
            className="flex items-center gap-2 px-4 h-10 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <span className="material-symbols-outlined !text-[18px]">edit</span>{' '}
            Edit
          </button>
          <button
            onClick={() => setLogCallOpen(true)}
            className="flex items-center gap-2 px-4 h-10 rounded-lg bg-[#137fec] text-white text-sm font-semibold hover:bg-blue-600 transition-colors shadow-sm shadow-blue-200 dark:shadow-none"
          >
            <span className="material-symbols-outlined !text-[18px]">call</span>{' '}
            Log Call
          </button>
          <PinButton
            entityType="lead"
            entityId={lead.id}
            title={`${lead.firstName} ${lead.lastName}`}
            subtitle={lead.company || undefined}
            icon="person"
            url={`/leads/${lead.id}`}
          />
          <MoreActionsButton onClick={() => setActionSheetOpen(true)} />
        </div>
      </div>

      <EntityActionSheet
        open={actionSheetOpen}
        onOpenChange={setActionSheetOpen}
        entity={{
          type: 'lead',
          id: lead.id,
          title: `${lead.firstName} ${lead.lastName}`,
          subtitle: lead.company || undefined,
          icon: 'person',
          url: `/leads/${lead.id}`,
        }}
        extraActions={[
          { label: 'Archive', icon: 'archive', onClick: () => setArchiveConfirmOpen(true) },
          {
            label: 'Delete',
            icon: 'delete',
            onClick: () => setDeleteConfirmOpen(true),
            destructive: true,
          },
        ]}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Lead</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete {lead.firstName} {lead.lastName}? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate({ id: lead.id })}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Archive Confirmation Dialog */}
      <AlertDialog open={archiveConfirmOpen} onOpenChange={setArchiveConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Lead</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to archive {lead.firstName} {lead.lastName}? The lead will be
              moved to Lost status.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => archiveMutation.mutate({ id: lead.id, status: 'LOST' })}
            >
              {archiveMutation.isPending ? 'Archiving...' : 'Archive'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Log Call Dialog */}
      <Dialog open={logCallOpen} onOpenChange={setLogCallOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log Call</DialogTitle>
            <DialogDescription>
              Record a call with {lead.firstName} {lead.lastName}.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="log-call-title"
                className="text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Call Title{' '}<span className="text-red-500">*</span>
              </label>
              <input
                id="log-call-title"
                type="text"
                value={logCallTitle}
                onChange={(e) => setLogCallTitle(e.target.value)}
                placeholder="e.g. Discovery call, Follow-up"
                className="w-full px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#137fec] focus:border-transparent"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="log-call-description"
                className="text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Notes{' '}<span className="text-slate-400 text-xs font-normal">(optional)</span>
              </label>
              <textarea
                id="log-call-description"
                value={logCallDescription}
                onChange={(e) => setLogCallDescription(e.target.value)}
                placeholder="Call summary, outcomes, next steps..."
                rows={3}
                className="w-full px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#137fec] focus:border-transparent resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <button
              onClick={() => {
                setLogCallOpen(false);
                setLogCallTitle('');
                setLogCallDescription('');
              }}
              className="px-4 py-2 rounded-md border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (!logCallTitle.trim()) return;
                logActivityMutation.mutate({
                  leadId: lead.id,
                  type: 'CALL',
                  title: logCallTitle.trim(),
                  description: logCallDescription.trim() || undefined,
                });
              }}
              disabled={!logCallTitle.trim() || logActivityMutation.isPending}
              className="px-4 py-2 rounded-md bg-[#137fec] text-white text-sm font-semibold hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {logActivityMutation.isPending ? 'Saving...' : 'Log Call'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Main 3-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Sidebar - Lead Profile */}
        <aside className="lg:col-span-3 flex flex-col gap-6">
          {/* Profile Card */}
          <Card className="overflow-hidden">
            <div className="h-24 bg-gradient-to-r from-blue-100 to-indigo-50 dark:from-slate-800 dark:to-slate-800" />
            <div className="px-5 pb-6 relative">
              <div className="relative -mt-10 mb-3">
                <AppAvatar
                  name={`${lead.firstName} ${lead.lastName}`}
                  src={lead.avatarUrl}
                  className="w-20 h-20 border-4 border-white dark:border-slate-900 shadow-sm"
                  fallbackClassName="text-2xl font-bold text-slate-500 bg-slate-200 dark:bg-slate-700"
                />
              </div>
              <div className="mb-4">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                  {lead.firstName} {lead.lastName}
                </h2>
                <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">
                  {lead.title}
                </p>
                <div className="flex items-center gap-1 text-[#137fec] text-sm font-medium mt-1">
                  <span className="material-symbols-outlined !text-sm">domain</span>
                  <span>{lead.company}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mb-6">
                <LeadStatusBadge status={lead.status} />
                <TemperatureBadge temperature={lead.temperature} />
                {lead.tags.map((tag) => (
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
                  <span className="material-symbols-outlined text-slate-400 !text-[20px] mt-0.5">
                    mail
                  </span>
                  <div className="flex flex-col">
                    <span className="text-xs text-slate-400 uppercase font-semibold">Email</span>
                    <a
                      href={`mailto:${lead.email}`}
                      className="text-sm text-slate-700 dark:text-slate-300 hover:text-[#137fec] break-all"
                    >
                      {lead.email}
                    </a>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-slate-400 !text-[20px] mt-0.5">
                    call
                  </span>
                  <div className="flex flex-col">
                    <span className="text-xs text-slate-400 uppercase font-semibold">Phone</span>
                    <a
                      href={`tel:${lead.phone.replaceAll(/\D/g, '')}`}
                      className="text-sm text-slate-700 dark:text-slate-300 hover:text-[#137fec]"
                    >
                      {lead.phone}
                    </a>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-slate-400 !text-[20px] mt-0.5">
                    location_on
                  </span>
                  <div className="flex flex-col">
                    <span className="text-xs text-slate-400 uppercase font-semibold">Location</span>
                    <span className="text-sm text-slate-700 dark:text-slate-300">
                      {lead.location}
                    </span>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-slate-400 !text-[20px] mt-0.5">
                    language
                  </span>
                  <div className="flex flex-col">
                    <span className="text-xs text-slate-400 uppercase font-semibold">Website</span>
                    <a
                      href={`https://${lead.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-[#137fec] hover:underline"
                    >
                      {lead.website}
                    </a>
                  </div>
                </div>
              </div>
              {/* Metrics Grid */}
              <div className="grid grid-cols-2 gap-3 mt-6 pt-4 border-t border-slate-200 dark:border-slate-700">
                <div className="text-center p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <p className="text-lg font-bold text-slate-900 dark:text-white">
                    ${(leadMetrics.estimatedValue / 1000).toFixed(0)}k
                  </p>
                  <p className="text-xs text-slate-500">Est. Value</p>
                </div>
                <div className="text-center p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <p className="text-lg font-bold text-slate-900 dark:text-white">{lead.score}</p>
                  <p className="text-xs text-slate-500">Lead Score</p>
                </div>
                <div className="text-center p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <p className="text-lg font-bold text-slate-900 dark:text-white">
                    {leadMetrics.emailsSent > 0
                      ? Math.round((leadMetrics.emailsOpened / leadMetrics.emailsSent) * 100)
                      : 0}
                    %
                  </p>
                  <p className="text-xs text-slate-500">Open Rate</p>
                </div>
                <div className="text-center p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <p className="text-lg font-bold text-slate-900 dark:text-white">
                    {leadMetrics.touchpoints}
                  </p>
                  <p className="text-xs text-slate-500">Touchpoints</p>
                </div>
              </div>
            </div>
            {/* Map placeholder */}
            <div className="h-32 w-full bg-cover bg-center border-t border-slate-200 dark:border-slate-800 relative">
              <div className="w-full h-full bg-gradient-to-br from-blue-100 to-blue-50 dark:from-slate-700 dark:to-slate-800 flex items-center justify-center">
                <div className="text-center">
                  <span className="material-symbols-outlined text-[#137fec] !text-3xl mb-1">
                    location_on
                  </span>
                  <button className="bg-white/90 text-slate-900 text-xs font-bold px-3 py-1.5 rounded shadow-sm hover:bg-white transition">
                    View Map
                  </button>
                </div>
              </div>
            </div>
          </Card>

          {/* Lead Owner */}
          <Card className="p-5">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase mb-3 tracking-wider">
              Lead Owner
            </h3>
            <div className="flex items-center gap-3">
              <AppAvatar
                name={lead.owner.name}
                src={lead.owner.avatarUrl}
                className="w-10 h-10"
                fallbackClassName="text-sm font-bold bg-slate-200 dark:bg-slate-700"
              />
              <div>
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  {lead.owner.name}
                </p>
                <p className="text-xs text-slate-500">{lead.owner.title}</p>
              </div>
            </div>
          </Card>
        </aside>

        {/* Center Content - Tabs and Content */}
        <section className="lg:col-span-6 flex flex-col gap-6">
          {/* Tabs and Activity Input */}
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
                    <span className="material-symbols-outlined !text-[20px]">edit_note</span>
                  </div>
                </div>
                <div className="flex-1">
                  <textarea
                    value={activityNote}
                    onChange={(e) => setActivityNote(e.target.value)}
                    className="w-full rounded-lg border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-sm focus:border-[#137fec] focus:ring-1 focus:ring-[#137fec] min-h-[80px] p-3 placeholder:text-slate-400"
                    placeholder="Log a call, email, or internal note..."
                  />
                  <div className="flex justify-between items-center mt-2">
                    <div className="flex gap-2">
                      <button className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors">
                        <span className="material-symbols-outlined !text-[20px]">attach_file</span>
                      </button>
                      <button className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors">
                        <span className="material-symbols-outlined !text-[20px]">format_bold</span>
                      </button>
                      <button className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors">
                        <span className="material-symbols-outlined !text-[20px]">list</span>
                      </button>
                    </div>
                    <button
                      onClick={() => {
                        if (!activityNote.trim()) return;
                        logActivityMutation.mutate({
                          leadId,
                          type: 'NOTE',
                          title: 'Note Added',
                          description: activityNote.trim(),
                        });
                      }}
                      disabled={!activityNote.trim() || logActivityMutation.isPending}
                      className="bg-[#137fec] text-white text-sm font-semibold px-4 py-1.5 rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
                    >
                      {logActivityMutation.isPending ? 'Logging...' : 'Log Activity'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </Card>

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
                  {activities.length > 0 ? (
                    activities.slice(0, 3).map((activity) => (
                      <div key={activity.id} className="flex items-start gap-3">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${getActivityIconBg(activity.type)}`}
                        >
                          <span className="material-symbols-outlined !text-[16px]">
                            {getActivityIcon(activity.type)}
                          </span>
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
                    ))
                  ) : (
                    <p className="text-sm text-slate-500 text-center py-4">No activities yet</p>
                  )}
                </div>
              </Card>
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
                  Lead Information
                </h3>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <dt className="text-sm text-slate-500 dark:text-slate-400">Status</dt>
                    <dd className="text-sm font-medium mt-1">
                      <LeadStatusBadge status={lead.status} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-slate-500 dark:text-slate-400">Source</dt>
                    <dd className="text-sm font-medium mt-1">
                      <SourceBadge source={lead.source} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-slate-500 dark:text-slate-400">Temperature</dt>
                    <dd className="text-sm font-medium mt-1">
                      <TemperatureBadge temperature={lead.temperature} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-slate-500 dark:text-slate-400">Lead Owner</dt>
                    <dd className="text-sm font-medium text-slate-900 dark:text-white">
                      {lead.owner.name}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-slate-500 dark:text-slate-400">Last Contacted</dt>
                    <dd className="text-sm font-medium text-slate-900 dark:text-white">
                      {formatRelativeTime(
                        typeof lead.lastContactedAt === 'string'
                          ? lead.lastContactedAt
                          : lead.lastContactedAt.toISOString()
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-slate-500 dark:text-slate-400">Created</dt>
                    <dd className="text-sm font-medium text-slate-900 dark:text-white">
                      {formatDate(
                        typeof lead.createdAt === 'string'
                          ? lead.createdAt
                          : lead.createdAt.toISOString()
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-slate-500 dark:text-slate-400">Company</dt>
                    <dd className="text-sm font-medium">
                      <span className="text-[#137fec]">{lead.company}</span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-slate-500 dark:text-slate-400">Lead Score</dt>
                    <dd className="text-sm font-medium text-slate-900 dark:text-white">
                      {lead.score}/100
                    </dd>
                  </div>
                </dl>
              </Card>
              <RelatedTasksCard
                entityType="lead"
                entityId={leadId}
                title="Open Tasks"
                maxItems={2}
                onViewAll={() => setActiveTab('tasks')}
              />
            </div>
          )}

          {/* Activity Tab - Timeline with Filters */}
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
                  entityType="LEAD"
                  entityId={leadId}
                  height={500}
                  emptyMessage="No activity found across all sources"
                />
              ) : (
                <>
                  {/* Filters and Search Bar */}
                  <div className="mb-6 space-y-4">
                    {/* Search */}
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 !text-[18px] text-slate-400">
                        search
                      </span>
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
                          <span>{filter.icon}</span>{' '}
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

                    {/* AI Insights Banner */}
                    {aiInsights.sentimentTrend && (
                      <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-800 rounded-lg border border-blue-100 dark:border-slate-700">
                        <div className="w-8 h-8 rounded-full bg-[#137fec]/10 flex items-center justify-center">
                          <span className="material-symbols-outlined !text-[18px] text-[#137fec]">
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
                            Last engagement: {aiInsights.lastEngagementDays} day
                            {aiInsights.lastEngagementDays === 1 ? '' : 's'} ago
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Results count */}
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-sm text-slate-500">
                      Showing {visibleActivities.length} of {filteredActivities.length} activities
                    </p>
                  </div>

                  {/* Timeline */}
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
                              <span className="material-symbols-outlined !text-[16px]">
                                {getActivityIcon(activity.type)}
                              </span>
                            </div>

                            {/* Header */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                                  {activity.title}
                                </p>
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
                                <span
                                  className={`material-symbols-outlined !text-[18px] transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                >
                                  expand_more
                                </span>
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
                                {renderActivityActions()}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Load More */}
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
                      <span className="material-symbols-outlined !text-[48px] text-slate-300 mb-4">
                        search_off
                      </span>
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

          {/* Tasks Tab */}
          {activeTab === 'tasks' && (
            <RelatedTasksCard entityType="lead" entityId={leadId} maxItems={20} />
          )}

          {/* Notes Tab */}
          {activeTab === 'notes' && (
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Notes</h3>
                <button
                  onClick={() => {
                    const noteContent = globalThis.prompt('Enter note:');
                    if (noteContent?.trim()) {
                      addNoteMutation.mutate({ leadId, content: noteContent.trim() });
                    }
                  }}
                  disabled={addNoteMutation.isPending}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-[#137fec] hover:bg-[#137fec]/10 rounded-lg transition-colors disabled:opacity-50"
                >
                  <span className="material-symbols-outlined !text-[18px]">add</span>{' '}
                  {addNoteMutation.isPending ? 'Adding...' : 'Add Note'}
                </button>
              </div>
              <div className="space-y-4">
                {notes.length > 0 ? (
                  notes.map((note) => (
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
                  ))
                ) : (
                  <p className="text-sm text-slate-500 text-center py-8">No notes yet</p>
                )}
              </div>
            </Card>
          )}

          {/* Emails Tab */}
          {activeTab === 'emails' && (
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Emails</h3>
                <button className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-[#137fec] hover:bg-[#137fec]/10 rounded-lg transition-colors">
                  <span className="material-symbols-outlined !text-[18px]">send</span>{' '}
                  Compose
                </button>
              </div>
              <div className="space-y-3">
                {emails.length > 0 ? (
                  emails.map((email) => (
                    <div
                      key={email.id}
                      className="flex items-center gap-4 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer transition-colors"
                    >
                      <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                        <span className="material-symbols-outlined !text-[20px] text-orange-600">
                          mail
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-900 dark:text-white truncate">
                          {email.subject}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${email.status === 'opened' ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-600'}`}
                          >
                            {email.status === 'opened' ? `Opened ${email.openCount}x` : 'Sent'}
                          </span>
                          <span className="text-xs text-slate-500">
                            {formatRelativeTime(email.sentAt)}
                          </span>
                        </div>
                      </div>
                      <button className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg">
                        <span className="material-symbols-outlined !text-[18px]">open_in_new</span>
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500 text-center py-8">No emails yet</p>
                )}
              </div>
            </Card>
          )}

          {/* Files Tab */}
          {activeTab === 'files' && (
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Files</h3>
                <button className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-[#137fec] hover:bg-[#137fec]/10 rounded-lg transition-colors">
                  <span className="material-symbols-outlined !text-[18px]">upload</span>{' '}
                  Upload
                </button>
              </div>
              <div className="space-y-3">
                {files.length > 0 ? (
                  files.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center gap-4 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg"
                    >
                      <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                        <span className="material-symbols-outlined !text-[20px] text-red-600">
                          description
                        </span>
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-slate-900 dark:text-white">{file.name}</p>
                        <p className="text-sm text-slate-500">
                          {file.size} • {formatRelativeTime(file.uploadedAt)}
                        </p>
                      </div>
                      <button className="p-2 text-slate-500 hover:text-[#137fec] hover:bg-[#137fec]/10 rounded-lg transition-colors">
                        <span className="material-symbols-outlined !text-[18px]">download</span>
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500 text-center py-8">No files yet</p>
                )}
              </div>
            </Card>
          )}

          {/* AI Insights Tab (IFC-095) */}
          {activeTab === 'ai-insights' && (
            <div className="space-y-6">
              {/* No AI analysis banner */}
              {!apiLead?.aiInsight && (
                <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-4">
                  <p className="text-sm text-amber-700 dark:text-amber-400 mb-3">
                    AI analysis has not been run for this lead yet.
                  </p>
                  <Button
                    size="sm"
                    onClick={() => scoreWithAIMutation.mutate({ leadId: lead.id })}
                    disabled={scoreWithAIMutation.isPending}
                  >
                    {scoreWithAIMutation.isPending ? 'Analyzing...' : 'Run AI Analysis'}
                  </Button>
                </div>
              )}
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
                      <span className="material-symbols-outlined !text-[20px] text-green-600">
                        trending_up
                      </span>
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
                      <span className="material-symbols-outlined !text-[20px] text-[#137fec]">
                        payments
                      </span>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-slate-900 dark:text-white">
                        ${(aiInsights.estimatedValue / 1000).toFixed(0)}k
                      </p>
                      <p className="text-xs text-slate-500">Est. Deal Value</p>
                    </div>
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                      <span className="material-symbols-outlined !text-[20px] text-purple-600">
                        grade
                      </span>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-slate-900 dark:text-white">
                        {aiInsights.qualificationScore}
                      </p>
                      <p className="text-xs text-slate-500">Lead Score</p>
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
                    <li key={`rec-${index}`} className="flex items-start gap-3"> {/* NOSONAR typescript:S6479 */}
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

        {/* Right Sidebar - Lead IQ, Tasks, Upcoming, Similar Leads */}
        <aside className="lg:col-span-3 flex flex-col gap-6">
          {/* Lead IQ (AI Insights) */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#137fec]">auto_awesome</span>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Lead IQ</h3>
              </div>
              <span className="text-[10px] bg-[#137fec]/10 text-[#137fec] px-1.5 py-0.5 rounded font-bold">
                BETA
              </span>
            </div>
            {!apiLead?.aiInsight && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mb-3 flex items-center gap-1">
                <span className="material-symbols-outlined !text-[14px]">warning</span>{' '}
                AI analysis not run yet
              </p>
            )}
            <div className="space-y-5">
              {/* Lead Score */}
              <div>
                <div className="flex justify-between mb-1.5">
                  <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                    Lead Score
                  </span>
                  <span className="text-sm font-bold text-green-600">
                    {aiInsights.qualificationScore}/100
                  </span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2">
                  <div
                    className="bg-green-500 h-2 rounded-full"
                    style={{ width: `${aiInsights.qualificationScore}%` }}
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                  {aiInsights.icpMatch}
                </p>
              </div>

              <div className="h-px bg-slate-100 dark:bg-slate-800 w-full" />

              {/* Engagement */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                    Engagement
                  </span>
                  <span className="text-xs font-bold text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                    {aiInsights.engagementLevel}
                  </span>
                </div>
                <div className="flex gap-1 h-1.5">
                  {[1, 2, 3, 4, 5].map((level) => (
                    <div
                      key={level}
                      className={`flex-1 ${level === 1 ? 'rounded-l-full' : ''} ${level === 5 ? 'rounded-r-full' : ''} ${
                        aiInsights.engagementScore >= level * 20
                          ? 'bg-[#137fec]'
                          : 'bg-[#137fec]/30'
                      }`}
                    />
                  ))}
                </div>
              </div>

              <div className="h-px bg-slate-100 dark:bg-slate-800 w-full" />

              {/* Recommended Next Steps */}
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Recommended Next Steps
                </p>
                <div className="space-y-2">
                  {aiInsights.nextBestActions.map((action) => (
                    <button
                      key={action.label}
                      className={`w-full text-left p-2 rounded border transition-colors group ${
                        action.primary
                          ? 'bg-blue-50 dark:bg-slate-800/50 border-blue-100 dark:border-slate-700 hover:border-[#137fec]/50'
                          : 'bg-slate-50 dark:bg-slate-800/30 border-slate-100 dark:border-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`material-symbols-outlined !text-[18px] ${action.primary ? 'text-[#137fec]' : 'text-slate-500'}`}
                        >
                          {action.icon}
                        </span>
                        <span
                          className={`text-sm font-medium ${action.primary ? 'text-slate-700 dark:text-slate-200 group-hover:text-[#137fec]' : 'text-slate-600 dark:text-slate-300 group-hover:text-slate-900'}`}
                        >
                          {action.label}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <button
              onClick={() => setActiveTab('ai-insights')}
              className="w-full mt-4 text-sm text-[#137fec] hover:underline text-center"
            >
              View Full Analysis
            </button>
          </Card>

          {/* Tasks Widget */}
          <RelatedTasksCard
            entityType="lead"
            entityId={leadId}
            maxItems={2}
            compact
            onViewAll={() => setActiveTab('tasks')}
          />

          {/* Upcoming Event */}
          <UpcomingEventsCard entityType="lead" entityId={leadId} maxItems={1} compact />

          {/* Notes Widget */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Notes</h3>
              <button className="w-6 h-6 rounded hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-500">
                <span className="material-symbols-outlined !text-[20px]">add</span>
              </button>
            </div>
            <div className="space-y-4">
              {notes.length > 0 ? (
                notes.slice(0, 2).map((note) => (
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
                ))
              ) : (
                <p className="text-sm text-slate-500 text-center py-2">No notes yet</p>
              )}
            </div>
          </Card>

          {/* Similar Leads */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Similar Leads</h3>
            </div>
            <div className="text-center py-4">
              <span className="material-symbols-outlined !text-[32px] text-slate-300 dark:text-slate-600 mb-2">
                group
              </span>
              <p className="text-sm text-slate-500 dark:text-slate-400">No similar leads found</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                AI similarity matching coming soon
              </p>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
