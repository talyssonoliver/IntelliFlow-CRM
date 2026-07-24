'use client';

// Contact 360 view — shared types, presentational scaffolding, and pure
// transforms extracted (behavior-preserving) from
// apps/web/src/app/contacts/[id]/page.tsx for PG-065. Relocating this code
// creates the named artifact, makes it independently unit-testable, and
// shrinks the route file. No logic changed.
import React from 'react';
import Link from 'next/link';
import { Card, Skeleton } from '@intelliflow/ui';
import { normalizeAvatarSource } from '@/lib/shared/avatar-utils';
import { buildContactLocation } from '@/components/contacts/ContactMapPreview';

export type DateStringNull = string | Date | null;

// Tab types

export type TabId =
  | 'overview'
  | 'activity'
  | 'tasks'
  | 'deals'
  | 'tickets'
  | 'documents'
  | 'notes'
  | 'ai-insights';

export interface Tab {
  id: TabId;
  label: string;
  count?: number;
}

// Activity types per FLOW-020

export type ActivityType =
  | 'email'
  | 'call'
  | 'meeting'
  | 'chat'
  | 'document'
  | 'deal'
  | 'ticket'
  | 'note';

export interface Activity {
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

export const mapSentiment = (
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

export const defaultContactAvatar =
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=160&h=160&fit=crop&crop=face';

export const defaultOwnerAvatar =
  'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=80&h=80&fit=crop&crop=face';

// Contact status type

export type ContactStatus =
  | 'ACTIVE'
  | 'INACTIVE'
  | 'ARCHIVED'
  | 'PROSPECT'
  | 'CUSTOMER'
  | 'FORMER_CUSTOMER';

// Contact with relations type (from API)

export interface ContactWithRelations {
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

export const activityTypeFilters: { value: ActivityType | 'all'; label: string; icon: string }[] = [
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

export function ContactStatusBadge({ status }: Readonly<{ status: ContactStatus }>) {
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

export function getStageColor(stage: string): string {
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

export function getActivityIcon(type: ActivityType): React.ReactNode {
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

export function getActivityIconBg(type: ActivityType): string {
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

export function getSentimentColor(sentiment?: string): string {
  switch (sentiment) {
    case 'positive':
      return 'text-green-500';
    case 'negative':
      return 'text-red-500';
    default:
      return 'text-slate-400';
  }
}

export function getChannelIcon(channel?: string): string {
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

export function getCallOutcomeStyle(outcome?: string): string {
  switch (outcome) {
    case 'connected':
      return 'bg-green-100 text-green-700';
    case 'voicemail':
      return 'bg-yellow-100 text-yellow-700';
    default:
      return 'bg-red-100 text-red-700';
  }
}

export function getCallOutcomeLabel(outcome?: string): string {
  switch (outcome) {
    case 'connected':
      return 'Ô£ô Connected';
    case 'voicemail':
      return '­ƒô× Voicemail';
    default:
      return 'Ô£ù No Answer';
  }
}

export function getTicketStatusStyle(status?: string): string {
  switch (status) {
    case 'Resolved':
      return 'bg-green-100 text-green-700';
    case 'Open':
      return 'bg-blue-100 text-blue-700';
    default:
      return 'bg-yellow-100 text-yellow-700';
  }
}

export function getPriorityStyle(priority?: string): string {
  switch (priority) {
    case 'High':
      return 'text-red-600';
    case 'Medium':
      return 'text-yellow-600';
    default:
      return 'text-slate-500';
  }
}

export function getSentimentTrendStyle(trend?: string): string {
  switch (trend) {
    case 'improving':
      return 'text-green-600';
    case 'declining':
      return 'text-red-600';
    default:
      return 'text-slate-600';
  }
}

export function getSentimentEmoji(sentiment?: string): string {
  switch (sentiment) {
    case 'positive':
      return '­ƒÿè';
    case 'negative':
      return '­ƒÿƒ';
    default:
      return '­ƒÿÉ';
  }
}

export function renderRichPreview(activity: Activity): React.ReactNode {
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

export function ContactLoadingSkeleton() {
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

export function ContactAuthRedirect() {
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

export function ContactNotFoundError({ fromInsight }: { fromInsight: boolean }) {
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

export function transformFeedToActivities(
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

export function transformContactForUI(apiContact: ContactWithRelations) {
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

export function filterContactActivities(
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
