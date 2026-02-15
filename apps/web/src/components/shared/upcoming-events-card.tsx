'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, Skeleton } from '@intelliflow/ui';
import { AppAvatar } from './app-avatar';
import { normalizeAvatarSource } from '@/lib/shared/avatar-utils';
import { api } from '@/lib/api';

// =============================================================================
// Types
// =============================================================================

export interface UpcomingEventsCardProps {
  /** Entity type to filter appointments for. Omit for global (dashboard) view. */
  readonly entityType?: 'lead' | 'contact' | 'case' | 'deal';
  /** Entity ID to filter appointments for. Required when entityType is set. */
  readonly entityId?: string;
  /** Card title */
  readonly title?: string;
  /** Maximum number of events to display */
  readonly maxItems?: number;
  /** Show the "add" button */
  readonly showAddButton?: boolean;
  /** Compact mode for sidebar/widget usage */
  readonly compact?: boolean;
  /** Callback when "View All" is clicked */
  readonly onViewAll?: () => void;
  /** Link for "View All" */
  readonly viewAllHref?: string;
}

interface AppointmentEvent {
  id: string;
  title: string;
  startTime: string | Date;
  endTime: string | Date;
  appointmentType: string;
  status: string;
  location?: string | null;
  attendees?: Array<{ user?: { name?: string; avatarUrl?: string | null } | null }>;
}

// =============================================================================
// Helpers
// =============================================================================

const TYPE_ICONS: Record<string, { icon: string; color: string }> = {
  MEETING: { icon: 'videocam', color: 'text-blue-500 bg-blue-100 dark:bg-blue-900/20' },
  HEARING: { icon: 'gavel', color: 'text-amber-500 bg-amber-100 dark:bg-amber-900/20' },
  CONSULTATION: { icon: 'forum', color: 'text-green-500 bg-green-100 dark:bg-green-900/20' },
  DEPOSITION: { icon: 'description', color: 'text-purple-500 bg-purple-100 dark:bg-purple-900/20' },
  CALL: { icon: 'call', color: 'text-green-500 bg-green-100 dark:bg-green-900/20' },
  DEADLINE: { icon: 'schedule', color: 'text-red-500 bg-red-100 dark:bg-red-900/20' },
};

const DEFAULT_ICON = { icon: 'event', color: 'text-slate-500 bg-slate-100 dark:bg-slate-800' };

function formatEventDate(date: Date) {
  return {
    month: date.toLocaleDateString('en-US', { month: 'short' }),
    day: date.getDate().toString(),
    time: date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
  };
}

function getAddHref(entityType?: string, entityId?: string): string {
  if (entityType && entityId) {
    return `/calendar/new?linkTo=${entityType}&linkId=${entityId}`;
  }
  return '/calendar/new';
}

// =============================================================================
// Component
// =============================================================================

export function UpcomingEventsCard({
  entityType,
  entityId,
  title = 'Upcoming',
  maxItems = 3,
  showAddButton = true,
  compact = false,
  onViewAll,
  viewAllHref,
}: UpcomingEventsCardProps) {
  // Stable reference for "now" — prevents infinite re-fetch loop.
  // new Date() in the query input would create a different value every render,
  // making React Query treat it as a new query key each time.
  const [now] = useState(() => new Date());

  // Query upcoming appointments via tRPC
  const appointmentsApi = (api as Record<string, any>).appointments;
  const { data, isLoading, error } = appointmentsApi?.list?.useQuery?.(
    {
      status: ['SCHEDULED', 'CONFIRMED'],
      sortBy: 'startTime',
      sortOrder: 'asc' as const,
      limit: maxItems + 1, // fetch one extra to detect "has more"
      startTimeFrom: now,
      ...(entityType === 'case' && entityId ? { caseId: entityId } : {}),
    },
    { enabled: true },
  ) ?? { data: undefined, isLoading: false, error: null };

  const events: AppointmentEvent[] = useMemo(() => {
    if (!data) return [];
    const items = (data as any)?.appointments ?? [];
    return items.slice(0, maxItems);
  }, [data, maxItems]);

  const hasMore = useMemo(() => {
    if (!data) return false;
    const items = (data as any)?.appointments ?? [];
    return items.length > maxItems;
  }, [data, maxItems]);

  const calendarHref = entityType && entityId
    ? `/calendar?entity=${entityType}&entityId=${entityId}`
    : '/calendar';

  // ─── Loading ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <Card className={compact ? 'p-4' : 'p-5'} data-testid="upcoming-events-card">
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-5 w-24" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: Math.min(maxItems, 3) }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      </Card>
    );
  }

  // ─── Error ────────────────────────────────────────────────────────────
  if (error) {
    return (
      <Card className={compact ? 'p-4' : 'p-5'} data-testid="upcoming-events-card">
        <div className="flex items-center justify-between mb-4">
          <h3 className={`font-bold text-slate-900 dark:text-white ${compact ? 'text-sm' : 'text-base'}`}>
            {title}
          </h3>
        </div>
        <p className="text-sm text-destructive text-center py-2">Failed to load events</p>
      </Card>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────
  return (
    <Card className={compact ? 'p-4' : 'p-5'} data-testid="upcoming-events-card">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className={`font-bold text-slate-900 dark:text-white ${compact ? 'text-sm' : 'text-base'}`}>
          {title}
        </h3>
        <div className="flex items-center gap-2">
          {(onViewAll || viewAllHref) && hasMore && (
            viewAllHref ? (
              <Link href={viewAllHref} className="text-xs text-primary hover:underline">View All</Link>
            ) : (
              <button onClick={onViewAll} className="text-xs text-primary hover:underline">View All</button>
            )
          )}
          {showAddButton && (
            <Link
              href={getAddHref(entityType, entityId)}
              className="w-6 h-6 rounded hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-500"
              aria-label="Schedule event"
            >
              <span className="material-symbols-outlined !text-[20px]">calendar_add_on</span>
            </Link>
          )}
        </div>
      </div>

      {/* Empty state */}
      {events.length === 0 && (
        <div className="text-center py-4">
          <span className="material-symbols-outlined text-3xl text-muted-foreground/40 mb-2">event_busy</span>
          <p className="text-sm text-muted-foreground">No upcoming events</p>
          {showAddButton && (
            <Link
              href={getAddHref(entityType, entityId)}
              className="text-sm text-primary hover:underline mt-1 inline-block"
            >
              Schedule an event
            </Link>
          )}
        </div>
      )}

      {/* Event list */}
      {events.length > 0 && (
        <div className={compact ? 'space-y-2' : 'space-y-3'}>
          {events.map((event) => {
            const date = new Date(event.startTime);
            const { month, day, time } = formatEventDate(date);
            const typeInfo = TYPE_ICONS[event.appointmentType] ?? DEFAULT_ICON;
            const attendeeAvatars = (event.attendees ?? [])
              .map((a) => ({
                name: a.user?.name ?? 'Attendee',
                src: normalizeAvatarSource(a.user?.avatarUrl ?? null),
              }))
              .slice(0, 4);

            return (
              <Link
                key={event.id}
                href={`/calendar/${event.id}`}
                className="flex gap-3 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-100 dark:border-slate-800 hover:border-primary/30 transition-colors group"
              >
                {/* Date badge */}
                <div className="flex flex-col items-center justify-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded w-12 h-12 flex-shrink-0">
                  <span className="text-[10px] font-bold text-red-500 uppercase">{month}</span>
                  <span className="text-lg font-bold text-slate-900 dark:text-white leading-none">{day}</span>
                </div>

                {/* Event info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className={`size-5 rounded-full flex items-center justify-center ${typeInfo.color}`}>
                      <span className="material-symbols-outlined !text-[14px]">{typeInfo.icon}</span>
                    </div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate group-hover:text-primary transition-colors">
                      {event.title}
                    </p>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{time}</p>
                  {attendeeAvatars.length > 0 && (
                    <div className="flex -space-x-1.5 mt-1.5">
                      {attendeeAvatars.map((avatar, idx) => (
                        <AppAvatar
                          key={idx}
                          name={avatar.name}
                          src={avatar.src}
                          fallbackText={avatar.name.charAt(0)}
                          className="w-5 h-5 ring-2 ring-white dark:ring-slate-900"
                          fallbackClassName="text-[10px] bg-slate-200 dark:bg-slate-700"
                        />
                      ))}
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
          {hasMore && !onViewAll && !viewAllHref && (
            <Link href={calendarHref} className="text-xs text-primary hover:underline text-center block pt-1">
              View all events
            </Link>
          )}
        </div>
      )}
    </Card>
  );
}
