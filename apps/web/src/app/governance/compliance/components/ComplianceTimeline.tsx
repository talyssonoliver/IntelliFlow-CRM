'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card } from '@intelliflow/ui';
import type { ComplianceEvent, ComplianceTimelineResponse, ComplianceEventType } from '@/app/api/compliance/types';

// Event type colors
const EVENT_TYPE_COLORS: Record<ComplianceEventType, { bg: string; text: string; dot: string }> = {
  audit: {
    bg: 'bg-purple-100 dark:bg-purple-900/30',
    text: 'text-purple-700 dark:text-purple-400',
    dot: 'bg-purple-500',
  },
  certification: {
    bg: 'bg-emerald-100 dark:bg-emerald-900/30',
    text: 'text-emerald-700 dark:text-emerald-400',
    dot: 'bg-emerald-500',
  },
  review: {
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    text: 'text-blue-700 dark:text-blue-400',
    dot: 'bg-blue-500',
  },
  assessment: {
    bg: 'bg-amber-100 dark:bg-amber-900/30',
    text: 'text-amber-700 dark:text-amber-400',
    dot: 'bg-amber-500',
  },
  renewal: {
    bg: 'bg-cyan-100 dark:bg-cyan-900/30',
    text: 'text-cyan-700 dark:text-cyan-400',
    dot: 'bg-cyan-500',
  },
};

// Event status icons
const EVENT_STATUS_ICONS: Record<string, { icon: string; color: string }> = {
  scheduled: { icon: 'event', color: 'text-blue-500' },
  completed: { icon: 'check_circle', color: 'text-emerald-500' },
  overdue: { icon: 'error', color: 'text-red-500' },
  cancelled: { icon: 'cancel', color: 'text-muted-foreground' },
};

type ViewMode = 'month' | 'quarter';

interface CalendarDayProps {
  date: Date;
  events: ComplianceEvent[];
  isCurrentMonth: boolean;
  isToday: boolean;
  onEventClick: (event: ComplianceEvent) => void;
}

function CalendarDay({ date, events, isCurrentMonth, isToday, onEventClick }: CalendarDayProps) {
  return (
    <div
      className={`
        min-h-[70px] p-1 border border-border rounded-lg
        ${!isCurrentMonth ? 'opacity-40' : ''}
        ${isToday ? 'ring-2 ring-primary' : ''}
      `}
    >
      <div className={`text-xs font-medium mb-1 ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
        {date.getDate()}
      </div>
      <div className="space-y-1">
        {events.slice(0, 2).map((event) => {
          const typeColors = EVENT_TYPE_COLORS[event.type];
          return (
            <button
              key={event.id}
              onClick={() => onEventClick(event)}
              className={`
                w-full text-left px-1 py-0.5 rounded text-xs truncate
                ${typeColors.bg} ${typeColors.text}
                hover:opacity-80 transition-opacity
              `}
              title={`${event.title} (${event.standard})`}
            >
              {event.title}
            </button>
          );
        })}
        {events.length > 2 && (
          <div className="text-xs text-muted-foreground text-center">
            +{events.length - 2} more
          </div>
        )}
      </div>
    </div>
  );
}

interface EventDetailModalProps {
  event: ComplianceEvent;
  onClose: () => void;
}

function EventDetailModal({ event, onClose }: EventDetailModalProps) {
  const typeColors = EVENT_TYPE_COLORS[event.type];
  const statusInfo = EVENT_STATUS_ICONS[event.status];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-label="Close"
      />
      <Card className="relative z-10 w-full max-w-md p-6 m-4">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${typeColors.dot}`} />
            <div>
              <h3 className="font-semibold text-foreground">{event.title}</h3>
              <p className="text-sm text-muted-foreground">{event.standard}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-muted-foreground">calendar_today</span>
            <span className="text-sm text-foreground">
              {new Date(event.date).toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className={`material-symbols-outlined ${statusInfo.color}`}>
              {statusInfo.icon}
            </span>
            <span className={`text-sm capitalize ${statusInfo.color}`}>
              {event.status}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-muted-foreground">category</span>
            <span className={`text-sm px-2 py-0.5 rounded ${typeColors.bg} ${typeColors.text} capitalize`}>
              {event.type}
            </span>
          </div>

          {event.description && (
            <div>
              <p className="text-sm text-muted-foreground">{event.description}</p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

export function ComplianceTimeline() {
  const [data, setData] = useState<ComplianceTimelineResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<ComplianceEvent | null>(null);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const monthStr = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}`;
      const response = await fetch(`/api/compliance/timeline?month=${monthStr}`);
      const result = await response.json();
      if (result.success) {
        setData(result.data);
      }
    } catch (error) {
      console.error('Failed to fetch timeline:', error);
    } finally {
      setLoading(false);
    }
  }, [currentDate]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const navigateMonth = (direction: number) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + direction);
    setCurrentDate(newDate);
  };

  const getCalendarDays = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    // First day of month
    const firstDay = new Date(year, month, 1);
    // Last day of month
    const lastDay = new Date(year, month + 1, 0);

    // Start from Sunday of the week containing the first day
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - startDate.getDay());

    // End on Saturday of the week containing the last day
    const endDate = new Date(lastDay);
    endDate.setDate(endDate.getDate() + (6 - endDate.getDay()));

    const days: Date[] = [];
    const current = new Date(startDate);

    while (current <= endDate) {
      days.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }

    return days;
  };

  const getEventsForDate = (date: Date): ComplianceEvent[] => {
    if (!data?.events) return [];
    const dateStr = date.toISOString().split('T')[0];
    return data.events.filter((event) => event.date === dateStr);
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const isToday = (date: Date) => {
    return date.toDateString() === today.toDateString();
  };

  const isCurrentMonth = (date: Date) => {
    return date.getMonth() === currentDate.getMonth();
  };

  const upcomingEvents = data?.events
    .filter((e) => e.status === 'scheduled' && new Date(e.date) >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5) || [];

  if (loading && !data) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <span className="material-symbols-outlined text-blue-600 dark:text-blue-400">
              calendar_month
            </span>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Compliance Timeline</h2>
            <p className="text-sm text-muted-foreground">Loading...</p>
          </div>
        </div>
        <div className="h-64 flex items-center justify-center">
          <span className="material-symbols-outlined text-4xl text-muted-foreground animate-spin">
            progress_activity
          </span>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <span className="material-symbols-outlined text-blue-600 dark:text-blue-400">
              calendar_month
            </span>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Compliance Timeline</h2>
            <p className="text-sm text-muted-foreground">
              {data?.upcomingCount || 0} upcoming events
            </p>
          </div>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('month')}
            className={`px-3 py-1 text-sm rounded-lg transition-colors ${
              viewMode === 'month'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Month
          </button>
          <button
            onClick={() => setViewMode('quarter')}
            className={`px-3 py-1 text-sm rounded-lg transition-colors ${
              viewMode === 'quarter'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Quarter
          </button>
        </div>
      </div>

      {/* Calendar Navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => navigateMonth(-1)}
          className="p-2 rounded-lg hover:bg-accent transition-colors"
        >
          <span className="material-symbols-outlined">chevron_left</span>
        </button>
        <h3 className="text-lg font-medium text-foreground">
          {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </h3>
        <button
          onClick={() => navigateMonth(1)}
          className="p-2 rounded-lg hover:bg-accent transition-colors"
        >
          <span className="material-symbols-outlined">chevron_right</span>
        </button>
      </div>

      {/* Calendar Grid */}
      <div className="mb-6">
        {/* Weekday Headers */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <div key={day} className="text-center text-xs font-medium text-muted-foreground py-2">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Days */}
        <div className="grid grid-cols-7 gap-1">
          {getCalendarDays().map((date) => (
            <CalendarDay
              key={date.toISOString()}
              date={date}
              events={getEventsForDate(date)}
              isCurrentMonth={isCurrentMonth(date)}
              isToday={isToday(date)}
              onEventClick={setSelectedEvent}
            />
          ))}
        </div>
      </div>

      {/* Event Type Legend */}
      <div className="flex flex-wrap gap-3 mb-4 pb-4 border-b border-border">
        {(Object.keys(EVENT_TYPE_COLORS) as ComplianceEventType[]).map((type) => (
          <div key={type} className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-full ${EVENT_TYPE_COLORS[type].dot}`} />
            <span className="text-xs text-muted-foreground capitalize">{type}</span>
          </div>
        ))}
      </div>

      {/* Upcoming Events List */}
      <div>
        <h4 className="text-sm font-medium text-foreground mb-3">Upcoming Events</h4>
        {upcomingEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No upcoming events</p>
        ) : (
          <div className="space-y-2">
            {upcomingEvents.map((event) => {
              const typeColors = EVENT_TYPE_COLORS[event.type];
              return (
                <button
                  key={event.id}
                  onClick={() => setSelectedEvent(event)}
                  className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-accent transition-colors text-left"
                >
                  <div className={`w-2 h-2 rounded-full ${typeColors.dot}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{event.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(event.date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })} • {event.standard}
                    </p>
                  </div>
                  <span className="material-symbols-outlined text-muted-foreground text-sm">
                    chevron_right
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Event Detail Modal */}
      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </Card>
  );
}
