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
  /**
   * When true (default), wraps content in a <Card>.
   * Set to false when used inside a dashboard widget grid that already provides its own Card wrapper.
   */
  readonly standalone?: boolean;
}

interface AppointmentEvent {
  id: string;
  title: string;
  startTime: string | Date;
  endTime: string | Date;
  appointmentType: string;
  status: string;
  location?: string | null;
  attendees?: Array<{ user?: { name?: string | null; avatarUrl?: string | null } | null }>;
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

function formatEventDate(date: Readonly<Date>) {
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
  title = 'Upcoming Events',
  maxItems = 3,
  showAddButton = true,
  compact = false,
  onViewAll,
  viewAllHref,
  standalone = true,
}: Readonly<UpcomingEventsCardProps>) {
  // Stable reference for "now" — prevents infinite re-fetch loop.
  // new Date() in the query input would create a different value every render,
  // making React Query treat it as a new query key each time.
  const [now] = useState(() => new Date());

  // Query upcoming appointments via tRPC
  const { data, isLoading, error } = api.appointments.list.useQuery(
    {
      status: ['SCHEDULED', 'CONFIRMED'],
      sortBy: 'startTime',
      sortOrder: 'asc' as const,
      limit: maxItems + 1, // fetch one extra to detect "has more"
      startTimeFrom: now,
      ...(entityType === 'case' && entityId ? { caseId: entityId } : Readonly<{}>),
    },
    { enabled: true }
  );

  const events: AppointmentEvent[] = useMemo(() => {
    if (!data) return [];
    const items = (data.appointments ?? []) as AppointmentEvent[];
    return items.slice(0, maxItems);
  }, [data, maxItems]);

  const hasMore = useMemo(() => {
    if (!data) return false;
    const items = data.appointments ?? [];
    return items.length > maxItems;
  }, [data, maxItems]);

  const calendarHref =
    entityType && entityId ? `/calendar?entity=${entityType}&entityId=${entityId}` : '/calendar';

  // Wrapper: Card for standalone usage, plain div for dashboard widget context
  type WrapperProps = { className: string; 'data-testid': string };
  const Wrapper = standalone ? Card : 'div';
  const wrapperProps: WrapperProps = standalone
    ? { className: compact ? 'p-4' : 'p-6', 'data-testid': 'upcoming-events-card' }
    : {
        className: `${compact ? 'p-4' : 'p-6'} h-full flex flex-col`,
        'data-testid': 'upcoming-events-card',
      };

  // ─── Loading ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <Wrapper {...wrapperProps}>
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-5 w-24" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: Math.min(maxItems, 3) }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" /> // NOSONAR typescript:S6479
          ))}
        </div>
      </Wrapper>
    );
  }

  // ─── Error ────────────────────────────────────────────────────────────
  if (error) {
    return (
      <Wrapper {...wrapperProps}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-foreground">{title}</h3>
        </div>
        <p className="text-sm text-destructive text-center py-2">Failed to load events</p>
      </Wrapper>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────
  return (
    <Wrapper {...wrapperProps}>
      {/* Header — matches UpcomingTasksWidget pattern */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <span className="material-symbols-outlined text-muted-foreground">calendar_month</span>
          {title}
        </h3>
        <div className="flex items-center gap-2">
          {(onViewAll || viewAllHref) &&
            (viewAllHref ? (
              <Link href={viewAllHref} className="text-sm text-ds-primary hover:underline">
                View All
              </Link>
            ) : (
              <button onClick={onViewAll} className="text-sm text-ds-primary hover:underline">
                View All
              </button>
            ))}
          {showAddButton && (
            <Link
              href={getAddHref(entityType, entityId)}
              className="inline-flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
              aria-label="Schedule event"
            >
              <span className="material-symbols-outlined text-lg" aria-hidden="true">
                add
              </span>
            </Link>
          )}
        </div>
      </div>

      {/* Empty state */}
      {events.length === 0 && (
        <div className="text-center py-4">
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

      {/* Event list — matches hover/spacing pattern of other widgets */}
      {events.length > 0 && (
        <div className={`${compact ? 'space-y-2' : 'space-y-1'} flex-1`}>
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
                className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted transition-colors group"
              >
                {/* Date badge */}
                <div className="flex flex-col items-center justify-center bg-muted rounded w-10 h-10 flex-shrink-0">
                  <span className="text-[10px] font-bold text-destructive uppercase leading-tight">
                    {month}
                  </span>
                  <span className="text-base font-bold text-foreground leading-none">{day}</span>
                </div>

                {/* Event info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div
                      className={`size-5 rounded-full flex items-center justify-center ${typeInfo.color}`}
                    >
                      <span className="material-symbols-outlined !text-[14px]">
                        {typeInfo.icon}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                      {event.title}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-xs text-muted-foreground">{time}</p>
                    {attendeeAvatars.length > 0 && (
                      <div className="flex -space-x-1.5">
                        {attendeeAvatars.map((avatar, idx) => (
                          <AppAvatar
                            key={idx} // NOSONAR typescript:S6479
                            name={avatar.name}
                            src={avatar.src}
                            fallbackText={avatar.name.charAt(0)}
                            className="w-4 h-4 ring-1 ring-background"
                            fallbackClassName="text-[8px] bg-muted"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Footer link — matches other widgets */}
      {hasMore && !onViewAll && !viewAllHref && (
        <Link
          href={calendarHref}
          className="text-xs text-primary hover:underline text-center block mt-2"
        >
          View all events
        </Link>
      )}
    </Wrapper>
  );
}
