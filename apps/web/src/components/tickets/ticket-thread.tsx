'use client';

/**
 * TicketThread — Conversation thread with reply composer (PG-048)
 *
 * Renders ticket activities in chronological order with a reply composer
 * supporting Public Reply and Internal Note modes.
 */

import { useState } from 'react';
import type { TicketActivity } from './types';
import { cn } from '@/lib/utils';
import { EmptyState } from '@intelliflow/ui';

export interface TicketThreadProps {
  ticketId: string;
  activities: TicketActivity[];
  onAddResponse: (content: string, isInternal: boolean) => Promise<void>;
  isLoading?: boolean;
  currentUserName?: string | null;
}

type ViewMode = 'timeline' | 'all-sources';
type ComposerMode = 'public' | 'internal';

export function TicketThread({ activities, onAddResponse, isLoading = false }: TicketThreadProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('timeline');
  const [composerMode, setComposerMode] = useState<ComposerMode>('public');
  const [replyContent, setReplyContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!replyContent.trim() || isSubmitting || isLoading) return;
    setIsSubmitting(true);
    try {
      await onAddResponse(replyContent.trim(), composerMode === 'internal');
      setReplyContent('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isSendDisabled = !replyContent.trim() || isSubmitting || isLoading;

  return (
    <div className="flex flex-col gap-4">
      {/* View Toggle */}
      <div role="tablist" aria-label="Thread view mode" className="flex gap-1 border-b">
        <button
          role="tab"
          aria-selected={viewMode === 'timeline'}
          onClick={() => setViewMode('timeline')}
          className={cn(
            'px-3 py-2 text-sm font-medium border-b-2 transition-colors',
            viewMode === 'timeline'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          Timeline
        </button>
        <button
          role="tab"
          aria-selected={viewMode === 'all-sources'}
          onClick={() => setViewMode('all-sources')}
          className={cn(
            'px-3 py-2 text-sm font-medium border-b-2 transition-colors',
            viewMode === 'all-sources'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          All Sources
        </button>
      </div>

      {/* Activity List */}
      <div className="flex flex-col gap-3">
        {activities.length === 0 ? (
          <EmptyState entity="activity" phase="passive" />
        ) : (
          activities.map((activity) => <ActivityItem key={activity.id} activity={activity} />)
        )}
      </div>

      {/* Reply Composer */}
      <div className="border rounded-lg p-3 space-y-3">
        {/* Composer Mode Toggle */}
        <div role="tablist" aria-label="Reply mode" className="flex gap-1">
          <button
            role="tab"
            aria-selected={composerMode === 'public'}
            onClick={() => setComposerMode('public')}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
              composerMode === 'public'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            )}
          >
            Public Reply
          </button>
          <button
            role="tab"
            aria-selected={composerMode === 'internal'}
            onClick={() => setComposerMode('internal')}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
              composerMode === 'internal'
                ? 'bg-amber-500 text-white'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            )}
          >
            Internal Note
          </button>
        </div>

        <textarea
          placeholder={composerMode === 'internal' ? 'Type your note...' : 'Type your reply...'}
          aria-label={composerMode === 'internal' ? 'Internal note' : 'Reply message'}
          value={replyContent}
          onChange={(e) => setReplyContent(e.target.value)}
          className="w-full min-h-[80px] rounded-md border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
        />

        <div className="flex justify-end">
          <button
            type="button"
            disabled={isSendDisabled}
            onClick={handleSubmit}
            className={cn(
              'px-4 py-2 rounded-md text-sm font-medium transition-colors',
              'bg-primary text-primary-foreground hover:bg-primary/90',
              isSendDisabled && 'opacity-50 cursor-not-allowed'
            )}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Activity Item ──────────────────────────────────────────────────────────

function ActivityItem({ activity }: { activity: TicketActivity }) {
  const typeConfig = getActivityTypeConfig(activity.type);

  return (
    <article
      aria-label={`${activity.type} by ${activity.author.name}`}
      className={cn('rounded-lg border p-3', typeConfig.containerClass)}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm',
            typeConfig.iconClass
          )}
        >
          {typeConfig.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium">{activity.author.name}</span>
            {activity.type === 'internal_note' && (
              <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                INTERNAL
              </span>
            )}
            {activity.type === 'sla_breach' && (
              <span className="inline-flex items-center rounded-full bg-red-100 dark:bg-red-900/30 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-400">
                SLA BREACHED
              </span>
            )}
            <span className="text-xs text-muted-foreground">{activity.timestamp}</span>
          </div>
          <p className={cn('text-sm', typeConfig.contentClass)}>{activity.content}</p>
          {activity.type === 'priority_change' && activity.metadata?.newPriority && (
            <span className="inline-flex items-center rounded-full bg-orange-100 dark:bg-orange-900/30 px-2 py-0.5 text-xs font-medium text-orange-700 dark:text-orange-400 mt-1">
              {activity.metadata.newPriority}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

function getActivityTypeConfig(type: TicketActivity['type']) {
  switch (type) {
    case 'customer_message':
      return {
        icon: '👤',
        iconClass: 'bg-blue-100 dark:bg-blue-900/30',
        containerClass: '',
        contentClass: '',
      };
    case 'agent_reply':
      return {
        icon: '🎧',
        iconClass: 'bg-green-100 dark:bg-green-900/30',
        containerClass: '',
        contentClass: '',
      };
    case 'internal_note':
      return {
        icon: '🔒',
        iconClass: 'bg-amber-100 dark:bg-amber-900/30',
        containerClass:
          'bg-amber-50/50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800',
        contentClass: '',
      };
    case 'system_event':
      return {
        icon: 'ℹ️',
        iconClass: 'bg-slate-100 dark:bg-slate-800',
        containerClass: 'bg-slate-50/50 dark:bg-slate-900/30',
        contentClass: 'text-muted-foreground',
      };
    case 'sla_breach':
      return {
        icon: '⚠️',
        iconClass: 'bg-red-100 dark:bg-red-900/30',
        containerClass: 'bg-red-50/50 dark:bg-red-900/10 border-red-200 dark:border-red-800',
        contentClass: 'text-red-700 dark:text-red-400',
      };
    case 'priority_change':
      return {
        icon: '🚩',
        iconClass: 'bg-orange-100 dark:bg-orange-900/30',
        containerClass: '',
        contentClass: '',
      };
    default:
      return {
        icon: '📋',
        iconClass: 'bg-slate-100',
        containerClass: '',
        contentClass: '',
      };
  }
}
