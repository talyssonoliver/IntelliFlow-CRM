'use client';

/**
 * Activity Feed Item
 * IFC-069: Unified Activity Feed Service
 *
 * Renders a single activity item with type-specific icons and formatting.
 */

import type { ActivityFeedType, ActivityFeedSource } from '@intelliflow/domain';

interface ActivityFeedItemProps {
  id: string;
  source: ActivityFeedSource;
  type: ActivityFeedType;
  title: string;
  description: string | null;
  timestamp: Date | string;
  actor: { id: string | null; name: string; avatarUrl?: string | null } | null;
  entity: { id: string; type: string; name: string } | null;
}

const TYPE_ICONS: Record<ActivityFeedType, string> = {
  EMAIL: '\u2709\uFE0F',
  CALL: '\uD83D\uDCDE',
  MEETING: '\uD83D\uDCC5',
  NOTE: '\uD83D\uDCDD',
  TASK: '\u2705',
  CHAT: '\uD83D\uDCAC',
  DOCUMENT: '\uD83D\uDCC4',
  DEAL: '\uD83E\uDD1D',
  TICKET: '\uD83C\uDFAB',
  STAGE_CHANGE: '\u27A1\uFE0F',
  STATUS_CHANGE: '\uD83D\uDD04',
  SCORE_UPDATE: '\uD83D\uDCCA',
  QUALIFICATION: '\u2B50',
  AGENT_ACTION: '\uD83E\uDD16',
  SLA_ALERT: '\u26A0\uFE0F',
  ASSIGNMENT: '\uD83D\uDC64',
  SYSTEM: '\u2699\uFE0F',
};

const SOURCE_COLORS: Record<ActivityFeedSource, string> = {
  LEAD_ACTIVITY: 'border-l-blue-500',
  CONTACT_ACTIVITY: 'border-l-green-500',
  OPPORTUNITY_EVENT: 'border-l-purple-500',
  TICKET_ACTIVITY: 'border-l-orange-500',
  EMAIL: 'border-l-sky-500',
  CALL: 'border-l-yellow-500',
  CHAT: 'border-l-pink-500',
};

function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(date).toLocaleDateString();
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function ActivityFeedItem({
  source,
  type,
  title,
  description,
  timestamp,
  actor,
  entity,
}: ActivityFeedItemProps) {
  const icon = TYPE_ICONS[type] || '\u2022';
  const borderColor = SOURCE_COLORS[source] || 'border-l-gray-300';

  return (
    <div
      className={`flex gap-3 border-l-2 ${borderColor} py-3 px-4 hover:bg-muted/50 transition-colors`}
    >
      {/* Icon */}
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm">
        {icon}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{title}</p>
            {description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{description}</p>
            )}
          </div>
          <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
            {formatRelativeTime(timestamp)}
          </span>
        </div>

        {/* Actor + Entity */}
        <div className="flex items-center gap-2 mt-1.5">
          {actor && (
            <div className="flex items-center gap-1">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-[10px] font-medium text-primary">
                {getInitials(actor.name)}
              </span>
              <span className="text-xs text-muted-foreground">{actor.name}</span>
            </div>
          )}
          {entity && (
            <>
              {actor && <span className="text-xs text-muted-foreground">&middot;</span>}
              <span className="text-xs text-muted-foreground truncate">
                {entity.type.toLowerCase()}: {entity.name}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
