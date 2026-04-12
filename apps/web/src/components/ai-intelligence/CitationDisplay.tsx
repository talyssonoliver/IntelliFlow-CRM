'use client';

import Link from 'next/link';
import { Badge, cn } from '@intelliflow/ui';
import { useTimezoneContext } from '@/providers/TimezoneProvider';
import {
  getSourceIcon,
  getSourceLabel,
  getSourceHref,
  getRelevanceBadgeClass,
  formatRelevanceScore,
} from '@/lib/ai-search/search-utils';

interface CitationDisplayProps {
  source: string;
  sourceId: string;
  title: string;
  relevanceScore: number;
  createdAt: string;
  /** Disable the title link (use when already inside a clickable container) */
  disableLink?: boolean;
}

function formatRelativeTime(dateStr: string, timezone: string = 'Europe/London'): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: timezone,
  });
}

export function CitationDisplay({
  source,
  sourceId,
  title,
  relevanceScore,
  createdAt,
  disableLink = false,
}: Readonly<CitationDisplayProps>) {
  const { timezone } = useTimezoneContext();
  const icon = getSourceIcon(source);
  const label = getSourceLabel(source);
  const href = getSourceHref(source, sourceId);
  const relevanceClass = getRelevanceBadgeClass(relevanceScore);
  const scoreText = formatRelevanceScore(relevanceScore);
  const timeAgo = formatRelativeTime(createdAt, timezone);

  const showLink = !disableLink && href !== '#';

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
      <span className="material-symbols-outlined text-base" aria-hidden="true">
        {icon}
      </span>

      <Badge variant="secondary" className="text-xs">
        {label}
      </Badge>

      {showLink ? (
        <Link
          href={href}
          className="text-primary hover:underline truncate max-w-[200px]"
          title={title}
        >
          {title}
        </Link>
      ) : (
        <span className="truncate max-w-[200px]" title={title}>
          {title}
        </span>
      )}

      <Badge className={cn('text-xs font-medium', relevanceClass)}>{scoreText}</Badge>

      <span
        className="text-xs"
        title={new Date(createdAt).toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          timeZone: timezone,
        })}
      >
        {timeAgo}
      </span>
    </div>
  );
}
