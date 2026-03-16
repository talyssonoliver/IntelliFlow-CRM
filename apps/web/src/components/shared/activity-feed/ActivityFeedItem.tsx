'use client';

/**
 * Activity Feed Item
 * IFC-069: Unified Activity Feed Service
 *
 * Renders a single activity item matching the home-authenticated.html mockup:
 * - size-10 avatars with initials or type-specific icons
 * - p-5 padding, divide-y separation (handled by parent)
 * - Rich content: attachment previews, status tags, action buttons
 * - Actor name, entity links, relative timestamps
 */

import Link from 'next/link';
import { useTimezoneContext } from '@/providers/TimezoneProvider';

export interface ActivityFeedItemProps {
  id: string;
  source: string;
  type: string;
  title: string;
  description: string | null;
  timestamp: Date | string;
  actor: { id: string | null; name: string; avatarUrl?: string | null } | null;
  entity: { id: string; type: string; name: string } | null;
  metadata?: Record<string, unknown> | null;
  /** When true, this item is the currently deep-linked / selected item */
  isSelected?: boolean;
}

interface IconStyle {
  icon: string;
  bg: string;
  color: string;
  /** If set, show initials instead of icon */
  initials?: string;
}

const TYPE_ICON_STYLES: Record<string, IconStyle> = {
  CALL: {
    icon: 'call_received',
    bg: 'bg-emerald-100 dark:bg-emerald-900',
    color: 'text-emerald-600 dark:text-emerald-300',
  },
  EMAIL: {
    icon: 'mail',
    bg: 'bg-indigo-100 dark:bg-indigo-900',
    color: 'text-indigo-600 dark:text-indigo-300',
  },
  MEETING: {
    icon: 'event',
    bg: 'bg-blue-100 dark:bg-blue-900',
    color: 'text-blue-600 dark:text-blue-300',
  },
  NOTE: {
    icon: 'sticky_note_2',
    bg: 'bg-teal-100 dark:bg-teal-900',
    color: 'text-teal-600 dark:text-teal-300',
  },
  TASK: {
    icon: 'task_alt',
    bg: 'bg-amber-100 dark:bg-amber-900',
    color: 'text-amber-600 dark:text-amber-300',
  },
  CHAT: {
    icon: 'chat',
    bg: 'bg-pink-100 dark:bg-pink-900',
    color: 'text-pink-600 dark:text-pink-300',
  },
  DOCUMENT: {
    icon: 'description',
    bg: 'bg-orange-100 dark:bg-orange-900',
    color: 'text-orange-600 dark:text-orange-300',
  },
  DEAL: {
    icon: 'handshake',
    bg: 'bg-green-100 dark:bg-green-900',
    color: 'text-green-600 dark:text-green-300',
  },
  TICKET: {
    icon: 'confirmation_number',
    bg: 'bg-rose-100 dark:bg-rose-900',
    color: 'text-rose-600 dark:text-rose-300',
  },
  STAGE_CHANGE: {
    icon: 'swap_horiz',
    bg: 'bg-violet-100 dark:bg-violet-900',
    color: 'text-violet-600 dark:text-violet-300',
  },
  STATUS_CHANGE: {
    icon: 'published_with_changes',
    bg: 'bg-sky-100 dark:bg-sky-900',
    color: 'text-sky-600 dark:text-sky-300',
  },
  SCORE_UPDATE: {
    icon: 'trending_up',
    bg: 'bg-lime-100 dark:bg-lime-900',
    color: 'text-lime-600 dark:text-lime-300',
  },
  QUALIFICATION: {
    icon: 'verified',
    bg: 'bg-cyan-100 dark:bg-cyan-900',
    color: 'text-cyan-600 dark:text-cyan-300',
  },
  AGENT_ACTION: {
    icon: 'smart_toy',
    initials: 'AI',
    bg: 'bg-purple-100 dark:bg-purple-900',
    color: 'text-purple-600 dark:text-purple-300',
  },
  SLA_ALERT: {
    icon: 'warning',
    bg: 'bg-red-100 dark:bg-red-900',
    color: 'text-red-600 dark:text-red-300',
  },
  ASSIGNMENT: {
    icon: 'person_add',
    bg: 'bg-cyan-100 dark:bg-cyan-900',
    color: 'text-cyan-600 dark:text-cyan-300',
  },
  SYSTEM: {
    icon: 'settings',
    bg: 'bg-slate-200 dark:bg-slate-700',
    color: 'text-slate-600 dark:text-slate-300',
  },
};

const DEFAULT_ICON_STYLE: IconStyle = {
  icon: 'notifications',
  bg: 'bg-slate-100 dark:bg-slate-800',
  color: 'text-slate-600 dark:text-slate-400',
};

const ENTITY_ROUTE_MAP: Record<string, string> = {
  lead: 'leads',
  contact: 'contacts',
  account: 'accounts',
  opportunity: 'deals',
  task: 'tasks',
  ticket: 'tickets',
  case: 'cases',
  document: 'documents',
};

function getEntityRoute(entityType: string, entityId: string): string | null {
  const route = ENTITY_ROUTE_MAP[entityType.toLowerCase()];
  return route ? `/${route}/${entityId}` : null;
}

function appendActivityId(url: string, activityId: string): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}activityId=${encodeURIComponent(activityId)}`;
}

function formatRelativeTime(date: Date | string, timezone: string = 'Europe/London'): string {
  const diffMs = Date.now() - new Date(date).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: timezone,
  });
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

/** File extension to icon mapping for attachment previews */
const FILE_TYPE_ICONS: Record<string, { icon: string; color: string }> = {
  pdf: { icon: 'picture_as_pdf', color: 'text-red-500' },
  doc: { icon: 'description', color: 'text-blue-500' },
  docx: { icon: 'description', color: 'text-blue-500' },
  xls: { icon: 'table_chart', color: 'text-green-600' },
  xlsx: { icon: 'table_chart', color: 'text-green-600' },
  ppt: { icon: 'slideshow', color: 'text-orange-500' },
  pptx: { icon: 'slideshow', color: 'text-orange-500' },
  img: { icon: 'image', color: 'text-purple-500' },
  default: { icon: 'attach_file', color: 'text-slate-500' },
};

function getFileIcon(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext)) {
    return FILE_TYPE_ICONS.img;
  }
  return FILE_TYPE_ICONS[ext] || FILE_TYPE_ICONS.default;
}

const TYPE_FALLBACK_LABELS: Record<string, string> = {
  STATUS_CHANGE: 'Status updated',
  STAGE_CHANGE: 'Stage changed',
  SCORE_UPDATE: 'Score updated',
  QUALIFICATION: 'Qualification changed',
  ASSIGNMENT: 'Assignment updated',
};

function buildCallParts(metadata: Readonly<Record<string, unknown>>): string[] {
  const parts: string[] = [];
  const duration = metadata.duration as number | undefined;
  const outcome = metadata.outcome as string | undefined;
  const sentiment = metadata.sentiment as string | undefined;
  if (duration) {
    const mins = Math.floor(duration / 60);
    const secs = duration % 60;
    parts.push(`Duration: ${mins}m ${secs.toString().padStart(2, '0')}s`);
  }
  if (outcome) parts.push(outcome);
  if (sentiment) parts.push(`Sentiment: ${sentiment}`);
  return parts;
}

function buildEmailParts(metadata: Readonly<Record<string, unknown>>): string[] {
  const parts: string[] = [];
  const openCount = metadata.openCount as number | undefined;
  const clickCount = metadata.clickCount as number | undefined;
  if (openCount && openCount > 0) parts.push(`Opened ${openCount}x`);
  if (clickCount && clickCount > 0) parts.push(`${clickCount} clicks`);
  return parts;
}

function buildOpportunityParts(metadata: Readonly<Record<string, unknown>>): string[] {
  const stageFrom = metadata.stageFrom as string | undefined;
  const stageTo = metadata.stageTo as string | undefined;
  if (stageFrom && stageTo) return [`${stageFrom} → ${stageTo}`];
  return [];
}

function buildSourceParts(
  source: string,
  metadata: Record<string, unknown> | null | undefined
): string[] {
  if (!metadata) return [];
  if (source === 'CALL') return buildCallParts(metadata);
  if (source === 'EMAIL') return buildEmailParts(metadata);
  if (source === 'OPPORTUNITY_EVENT') return buildOpportunityParts(metadata);
  return [];
}

/**
 * Build a context-rich description that always includes the entity name
 * so users can see WHERE the activity happened (e.g., "on lead John Doe").
 */
function buildDescription(
  description: string | null,
  entity: ActivityFeedItemProps['entity'],
  metadata: Record<string, unknown> | null | undefined,
  type: string,
  source: string
): string | null {
  const parts: string[] = buildSourceParts(source, metadata);

  if (description && !parts.some((p) => description.includes(p))) {
    parts.unshift(description);
  }

  if (parts.length === 0 && TYPE_FALLBACK_LABELS[type]) {
    parts.push(TYPE_FALLBACK_LABELS[type]);
  }

  return parts.length > 0 ? parts.join('. ') + '.' : null;
}

type TagVariant = 'green' | 'slate' | 'amber' | 'red' | 'blue';
type AutoTag = { label: string; variant: TagVariant };

function sentimentVariant(sentiment: string): TagVariant {
  const lower = sentiment.toLowerCase();
  if (lower === 'positive') return 'green';
  if (lower === 'negative') return 'red';
  return 'slate';
}

function emailStatusVariant(status: string): TagVariant {
  if (status === 'opened') return 'green';
  if (status === 'bounced') return 'red';
  return 'slate';
}

function buildSourceTags(source: string, type: string, metadata: Record<string, unknown>): AutoTag[] {
  if (source === 'CALL') {
    const tags: AutoTag[] = [];
    const sentiment = metadata.sentiment as string | undefined;
    const status = metadata.status as string | undefined;
    if (sentiment) tags.push({ label: sentiment, variant: sentimentVariant(sentiment) });
    if (status && status !== 'completed') tags.push({ label: status, variant: 'slate' });
    return tags;
  }
  if (source === 'EMAIL') {
    const status = metadata.status as string | undefined;
    if (status) return [{ label: status, variant: emailStatusVariant(status) }];
    return [];
  }
  if (type === 'STATUS_CHANGE' || type === 'STAGE_CHANGE') {
    const stageTo = metadata.stageTo as string | undefined;
    if (stageTo) return [{ label: stageTo, variant: 'blue' }];
  }
  return [];
}

/**
 * Build auto-tags from metadata (call sentiment, email status, opportunity stage, etc.)
 */
function buildAutoTags(
  metadata: Record<string, unknown> | null | undefined,
  source: string,
  type: string
): AutoTag[] {
  if (!metadata) return [];

  const tags: AutoTag[] = buildSourceTags(source, type, metadata);

  const manualTags = metadata.tags as
    | Array<{ label: string; variant?: TagVariant }>
    | undefined;
  if (manualTags) {
    for (const t of manualTags) {
      tags.push({ label: t.label, variant: t.variant || 'slate' });
    }
  }

  return tags;
}

const TAG_STYLES: Record<string, string> = {
  green: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  slate: 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300',
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300',
  red: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  blue: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
};

// ---------------------------------------------------------------------------
// ActivityFeedAvatar
// ---------------------------------------------------------------------------

interface ActivityFeedAvatarProps {
  style: IconStyle;
  actorInitials: string | null;
}

function ActivityFeedAvatar({ style, actorInitials }: Readonly<ActivityFeedAvatarProps>) {
  const baseClass = `shrink-0 size-10 rounded-full ${style.bg} flex items-center justify-center ${style.color}`;

  if (actorInitials && !style.initials) {
    return <div className={`${baseClass} font-bold`}>{actorInitials}</div>;
  }
  if (style.initials) {
    return <div className={`${baseClass} font-bold`}>{style.initials}</div>;
  }
  return (
    <div className={baseClass}>
      <span className="material-symbols-outlined">{style.icon}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EntityDescription
// ---------------------------------------------------------------------------

interface EntityDescriptionProps {
  richDescription: string | null;
  entity: ActivityFeedItemProps['entity'];
  entityUrl: string | null;
}

function EntityDescription({ richDescription, entity, entityUrl }: Readonly<EntityDescriptionProps>) {
  if (!richDescription && !entity) return null;

  return (
    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
      {richDescription}
      {entity && entityUrl && (
        <>
          {richDescription ? ' ' : ''}
          <Link
            href={entityUrl}
            className="font-semibold text-slate-800 dark:text-slate-200 hover:text-[#137fec]"
          >
            {entity.name}
          </Link>
        </>
      )}
      {entity && !entityUrl && (
        <>
          {richDescription ? ' — ' : ''}
          <span className="font-semibold text-slate-800 dark:text-slate-200">{entity.name}</span>
        </>
      )}
    </p>
  );
}

// ---------------------------------------------------------------------------
// ActivityFeedItem
// ---------------------------------------------------------------------------

export function ActivityFeedItem({
  id,
  source,
  type,
  title,
  description,
  timestamp,
  actor,
  entity,
  metadata,
  isSelected = false,
}: Readonly<ActivityFeedItemProps>) {
  const { timezone } = useTimezoneContext();
  const style = TYPE_ICON_STYLES[type] || DEFAULT_ICON_STYLE;
  const actorInitials = actor ? getInitials(actor.name) : null;
  const entityUrl = entity ? getEntityRoute(entity.type, entity.id) : null;

  // Build rich description with entity context
  const richDescription = buildDescription(description, entity, metadata, type, source);

  // Build auto-tags from metadata
  const tags = buildAutoTags(metadata, source, type);

  // Extract attachment from metadata (if provided)
  const attachment = metadata?.attachment as { filename: string; url?: string } | undefined;

  // Extract action link from metadata
  const actionUrl = metadata?.actionUrl as string | undefined;
  const actionLabel = metadata?.actionLabel as string | undefined;
  const basePrimaryUrl = actionUrl?.trim() ? actionUrl : entityUrl;
  const primaryUrl = basePrimaryUrl ? appendActivityId(basePrimaryUrl, id) : null;

  return (
    <div
      data-activity-id={id}
      className={`p-5 transition-colors ${
        isSelected
          ? 'bg-primary/5 ring-2 ring-primary/30 ring-inset rounded-lg'
          : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'
      }`}
    >
      <div className="flex gap-3">
        {/* Avatar / Icon — size-10 matching mockup */}
        <ActivityFeedAvatar style={style} actorInitials={actorInitials} />

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start">
            {primaryUrl ? (
              <Link
                href={primaryUrl}
                className="text-sm font-medium text-slate-900 dark:text-slate-100 hover:text-[#137fec] hover:underline"
              >
                {title}
              </Link>
            ) : (
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</p>
            )}
            <span className="text-xs text-slate-400 whitespace-nowrap">
              {formatRelativeTime(timestamp, timezone)}
            </span>
          </div>

          {/* Description with inline entity link */}
          <EntityDescription
            richDescription={richDescription}
            entity={entity}
            entityUrl={entityUrl}
          />

          {/* Attachment preview (matches mockup PDF card) */}
          {attachment && (
            <div className="mt-3 bg-slate-50 dark:bg-slate-800 rounded border border-[#e2e8f0] dark:border-[#334155] p-2 flex items-center gap-3">
              <div className="bg-white dark:bg-slate-700 p-1.5 rounded">
                <span
                  className={`material-symbols-outlined text-sm ${getFileIcon(attachment.filename).color}`}
                >
                  {getFileIcon(attachment.filename).icon}
                </span>
              </div>
              {attachment.url ? (
                <a
                  href={attachment.url}
                  className="text-sm text-slate-700 dark:text-slate-300 font-medium hover:text-[#137fec] truncate"
                >
                  {attachment.filename}
                </a>
              ) : (
                <span className="text-sm text-slate-700 dark:text-slate-300 font-medium truncate">
                  {attachment.filename}
                </span>
              )}
            </div>
          )}

          {/* Status tags / badges — auto-generated from metadata */}
          {tags.length > 0 && (
            <div className="mt-2 flex gap-2 flex-wrap">
              {tags.map((tag) => (
                <span
                  key={tag.label}
                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    TAG_STYLES[tag.variant] || TAG_STYLES.slate
                  }`}
                >
                  {tag.label}
                </span>
              ))}
            </div>
          )}

          {/* Action link (e.g., "View Report") */}
          {actionUrl && actionLabel && (
            <Link
              href={actionUrl}
              className="mt-2 inline-block text-sm text-[#137fec] font-medium hover:underline"
            >
              {actionLabel}
            </Link>
          )}

          {/* Entity link when not already shown inline */}
          {entity && entityUrl && !richDescription && !description && (
            <Link
              href={entityUrl}
              className="mt-2 inline-block text-sm text-[#137fec] font-medium hover:underline"
            >
              View {entity.type.charAt(0) + entity.type.slice(1).toLowerCase()}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
