'use client';

import * as React from 'react';
import { useState, useMemo, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@intelliflow/ui';
// Material Symbols icon helper component
const Icon = ({ name, className = '' }: { name: string; className?: string }) => (
  <span className={`material-symbols-outlined ${className}`} aria-hidden="true">
    {name}
  </span>
);
import Link from 'next/link';
import { trpc } from '@/lib/trpc';
import { useRemindersOptional } from '@/lib/cases/reminders-context';

// Timeline event types
type TimelineEventType =
  | 'deadline'
  | 'task'
  | 'appointment'
  | 'document'
  | 'status_change'
  | 'note'
  | 'reminder'
  | 'agent_action';

// Status types
type DeadlineStatus = 'pending' | 'approaching' | 'due_today' | 'overdue' | 'completed' | 'waived';
type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
type AppointmentStatus = 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
type AgentActionStatus = 'pending_approval' | 'approved' | 'rejected' | 'rolled_back' | 'expired';

// Priority levels
type Priority = 'low' | 'medium' | 'high' | 'critical';

// Timeline event interface
interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  title: string;
  description?: string;
  date: Date;
  endDate?: Date;
  status: DeadlineStatus | TaskStatus | AppointmentStatus | AgentActionStatus;
  priority: Priority;
  assignedTo?: string;
  linkedCaseId?: string;
  metadata?: Record<string, unknown>;
  // Agent action specific fields
  agentActionId?: string;
  agentName?: string;
  confidenceScore?: number;
  entityType?: string;
  entityName?: string;
}

// Props for the timeline component
interface CaseTimelineProps {
  caseId: string;
  events?: TimelineEvent[];
  onEventClick?: (event: TimelineEvent) => void;
  onAddDeadline?: () => void;
  onAddTask?: () => void;
  onAddAppointment?: () => void;
}

// Filter options
interface FilterOptions {
  eventTypes: TimelineEventType[];
  statusFilter: string[];
  priorityFilter: Priority[];
  dateRange: {
    start: Date | null;
    end: Date | null;
  };
}

// Sample data for demonstration (in real app, this comes from API)
const generateSampleEvents = (): TimelineEvent[] => {
  const now = new Date();
  const addDays = (days: number): Date => {
    const date = new Date(now);
    date.setDate(date.getDate() + days);
    return date;
  };

  return [
    {
      id: '1',
      type: 'deadline',
      title: 'Response to Motion Due',
      description: 'File response to defendant motion to dismiss',
      date: addDays(2),
      status: 'approaching',
      priority: 'high',
      assignedTo: 'John Smith',
    },
    {
      id: '2',
      type: 'appointment',
      title: 'Client Meeting',
      description: 'Review case strategy with client',
      date: addDays(1),
      endDate: addDays(1),
      status: 'confirmed',
      priority: 'medium',
      assignedTo: 'Jane Doe',
    },
    {
      id: '3',
      type: 'deadline',
      title: 'Discovery Deadline',
      description: 'Complete all discovery requests',
      date: addDays(14),
      status: 'pending',
      priority: 'medium',
    },
    {
      id: '4',
      type: 'task',
      title: 'Draft Settlement Proposal',
      description: 'Prepare initial settlement terms',
      date: addDays(-2),
      status: 'completed',
      priority: 'high',
    },
    {
      id: '5',
      type: 'deadline',
      title: 'Expert Report Due',
      description: 'Submit expert witness report',
      date: addDays(-1),
      status: 'overdue',
      priority: 'critical',
      assignedTo: 'Expert Consultant',
    },
    {
      id: '6',
      type: 'task',
      title: 'Review Evidence Documents',
      description: 'Review and categorize new evidence',
      date: addDays(5),
      status: 'in_progress',
      priority: 'medium',
      assignedTo: 'Paralegal Team',
    },
    {
      id: '7',
      type: 'appointment',
      title: 'Court Hearing',
      description: 'Pre-trial conference',
      date: addDays(21),
      status: 'scheduled',
      priority: 'high',
    },
    {
      id: '8',
      type: 'reminder',
      title: 'Follow up with witness',
      description: 'Contact key witness for deposition scheduling',
      date: addDays(3),
      status: 'pending',
      priority: 'medium',
    },
    // Agent action events
    {
      id: 'agent-1',
      type: 'agent_action',
      title: 'AI: Update case priority based on new evidence',
      description: 'Lead Scoring Agent detected high-priority indicators in recent document uploads',
      date: addDays(0),
      status: 'pending_approval',
      priority: 'high',
      agentActionId: 'action-1',
      agentName: 'Lead Scoring Agent',
      confidenceScore: 85,
      entityType: 'case',
      entityName: 'Smith vs. Acme Corp',
    },
    {
      id: 'agent-2',
      type: 'agent_action',
      title: 'AI: Draft follow-up email to opposing counsel',
      description: 'Outreach Agent prepared response based on recent correspondence',
      date: addDays(-1),
      status: 'pending_approval',
      priority: 'medium',
      agentActionId: 'action-2',
      agentName: 'Outreach Agent',
      confidenceScore: 78,
      entityType: 'contact',
      entityName: 'Sarah Johnson',
    },
    {
      id: 'agent-3',
      type: 'agent_action',
      title: 'AI: Schedule settlement conference',
      description: 'Task Automation Agent identified optimal meeting time based on calendars',
      date: addDays(-2),
      status: 'approved',
      priority: 'medium',
      agentActionId: 'action-3',
      agentName: 'Task Automation Agent',
      confidenceScore: 92,
      entityType: 'appointment',
      entityName: 'Settlement Conference',
    },
  ];
};

// Status color mapping
const getStatusColor = (status: string): string => {
  const colorMap: Record<string, string> = {
    pending: 'bg-gray-100 text-gray-800',
    approaching: 'bg-yellow-100 text-yellow-800',
    due_today: 'bg-orange-100 text-orange-800',
    overdue: 'bg-red-100 text-red-800',
    completed: 'bg-green-100 text-green-800',
    waived: 'bg-gray-100 text-gray-500',
    in_progress: 'bg-blue-100 text-blue-800',
    cancelled: 'bg-gray-100 text-gray-500',
    scheduled: 'bg-blue-100 text-blue-800',
    confirmed: 'bg-green-100 text-green-800',
    no_show: 'bg-red-100 text-red-800',
    // Agent action statuses
    pending_approval: 'bg-amber-100 text-amber-800',
    approved: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
    rolled_back: 'bg-purple-100 text-purple-800',
    expired: 'bg-gray-100 text-gray-500',
  };
  return colorMap[status] || 'bg-gray-100 text-gray-800';
};

// Priority color mapping
const getPriorityColor = (priority: Priority): string => {
  const colorMap: Record<Priority, string> = {
    low: 'border-l-gray-400',
    medium: 'border-l-blue-500',
    high: 'border-l-orange-500',
    critical: 'border-l-red-600',
  };
  return colorMap[priority];
};

// Event type icon mapping
const getEventIcon = (type: TimelineEventType): React.ReactNode => {
  const iconMap: Record<TimelineEventType, React.ReactNode> = {
    deadline: <Icon name="schedule" className="text-base" />,
    task: <Icon name="check_circle" className="text-base" />,
    appointment: <Icon name="event_available" className="text-base" />,
    document: <Icon name="description" className="text-base" />,
    status_change: <Icon name="work" className="text-base" />,
    note: <Icon name="description" className="text-base" />,
    reminder: <Icon name="notifications" className="text-base" />,
    agent_action: <Icon name="smart_toy" className="text-base" />,
  };
  return iconMap[type];
};

// Helper function for timeline dot color
const getTimelineDotColor = (isOverdue: boolean, isCompleted: boolean): string => {
  if (isOverdue) return 'bg-red-500';
  if (isCompleted) return 'bg-green-500';
  return 'bg-blue-500';
};

// Helper function for confidence score styling
const getConfidenceScoreStyle = (score: number): string => {
  if (score >= 80) return 'bg-green-100 text-green-700';
  if (score >= 60) return 'bg-amber-100 text-amber-700';
  return 'bg-red-100 text-red-700';
};

// Helper function for agent action status label
const getAgentActionLabel = (status: string): string => {
  const labels: Record<string, string> = {
    approved: 'Already Approved',
    rejected: 'Rejected',
    rolled_back: 'Rolled Back',
  };
  return labels[status] || 'Expired';
};

// Format date for display
const formatDate = (date: Date): string => {
  const now = new Date();
  const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  if (diffDays > 0 && diffDays <= 7) return `In ${diffDays} days`;
  if (diffDays < 0 && diffDays >= -7) return `${Math.abs(diffDays)} days ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
};

// Format time for display
const formatTime = (date: Date): string => {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
};

// Timeline Event Card Component
interface TimelineEventCardProps {
  event: TimelineEvent;
  onClick?: () => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

function TimelineEventCard({ event, onClick, isExpanded, onToggleExpand }: Readonly<TimelineEventCardProps>) {
  const isOverdue = event.status === 'overdue';
  const isCompleted = event.status === 'completed';

  return (
    <li
      className={`
        relative pl-8 pb-6 border-l-4 ${getPriorityColor(event.priority)}
        ${isOverdue ? 'bg-red-50/50' : ''}
        ${isCompleted ? 'opacity-75' : ''}
      `}
      
      aria-label={`${event.type}: ${event.title}`}
    >
      {/* Timeline dot */}
      <div
        className={`
          absolute left-0 transform -translate-x-1/2 w-4 h-4 rounded-full border-2 border-white
          ${getTimelineDotColor(isOverdue, isCompleted)}
        `}
        aria-hidden="true"
      />

      {/* Event card */}
      <div
        role="button"
        tabIndex={0}
        className={`
          ml-4 p-4 rounded-lg border shadow-sm cursor-pointer w-full text-left
          hover:shadow-md transition-shadow
          ${isOverdue ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'}
        `}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick?.();
          }
        }}
        aria-expanded={isExpanded}
      >
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              className={`p-1.5 rounded ${isOverdue ? 'bg-red-100' : 'bg-gray-100'}`}
              aria-hidden="true"
            >
              {getEventIcon(event.type)}
            </span>
            <div>
              <h4 className="font-medium text-gray-900">{event.title}</h4>
              <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                <Icon name="calendar_today" className="text-xs" />
                <span>{formatDate(event.date)}</span>
                {event.endDate && (
                  <>
                    <span aria-hidden="true">-</span>
                    <span>{formatTime(event.endDate)}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(event.status)}`}
            >
              {event.status.replace('_', ' ')}
            </span>
            {isOverdue && <Icon name="warning" className="text-base text-red-500" />}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand();
              }}
              className="p-1 hover:bg-gray-100 rounded"
              aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
            >
              {isExpanded ? <Icon name="expand_less" className="text-base" /> : <Icon name="expand_more" className="text-base" />}
            </button>
          </div>
        </div>

        {/* Expanded content */}
        {isExpanded && (
          <section
            className="mt-4 pt-4 border-t border-gray-100"
            aria-label="Event details"
          >
            {event.description && <p className="text-sm text-gray-600 mb-3">{event.description}</p>}

            {/* Agent action specific details */}
            {event.type === 'agent_action' && (
              <div className="mb-4 p-3 bg-purple-50 rounded-lg border border-purple-200">
                <div className="flex items-center gap-2 mb-2">
                  <Icon name="smart_toy" className="text-base text-purple-600" />
                  <span className="font-medium text-purple-800">{event.agentName}</span>
                  {event.confidenceScore && (
                    <span className={`ml-auto px-2 py-0.5 text-xs rounded-full ${getConfidenceScoreStyle(event.confidenceScore)}`}>
                      {event.confidenceScore}% confidence
                    </span>
                  )}
                </div>
                {event.entityName && (
                  <p className="text-sm text-purple-700">
                    Affecting: {event.entityType} - {event.entityName}
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 text-sm">
              {event.assignedTo && (
                <div className="flex items-center gap-2">
                  <Icon name="group" className="text-base text-gray-400" />
                  <span className="text-gray-600">Assigned to: {event.assignedTo}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Icon name="warning" className="text-base text-gray-400" />
                <span className="text-gray-600">Priority: {event.priority}</span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="mt-4 flex gap-2">
              {!isCompleted && event.type === 'deadline' && (
                <button className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors">
                  Mark Complete
                </button>
              )}
              {!isCompleted && event.type === 'task' && (
                <button className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">
                  {event.status === 'pending' ? 'Start' : 'Complete'}
                </button>
              )}
              {/* Agent action: Link to approval preview */}
              {event.type === 'agent_action' && event.status === 'pending_approval' && event.agentActionId && (
                <Link
                  href={`/agent-approvals/preview?actionId=${event.agentActionId}`}
                  className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors flex items-center gap-2"
                >
                  <Icon name="open_in_new" className="text-xs" />
                  Review & Approve
                </Link>
              )}
              {event.type === 'agent_action' && event.status !== 'pending_approval' && (
                <span className={`px-3 py-1.5 text-sm rounded ${getStatusColor(event.status)}`}>
                  {getAgentActionLabel(event.status)}
                </span>
              )}
              <button className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 transition-colors">
                View Details
              </button>
            </div>
          </section>
        )}
      </div>
    </li>
  );
}

// Filter Panel Component
interface FilterPanelProps {
  filters: FilterOptions;
  onFilterChange: (filters: FilterOptions) => void;
  isOpen: boolean;
}

function FilterPanel({ filters, onFilterChange, isOpen }: Readonly<FilterPanelProps>) {
  const eventTypes: TimelineEventType[] = [
    'deadline',
    'task',
    'appointment',
    'reminder',
    'document',
    'agent_action',
  ];
  const priorities: Priority[] = ['critical', 'high', 'medium', 'low'];

  const toggleEventType = (type: TimelineEventType) => {
    const newTypes = filters.eventTypes.includes(type)
      ? filters.eventTypes.filter((t) => t !== type)
      : [...filters.eventTypes, type];
    onFilterChange({ ...filters, eventTypes: newTypes });
  };

  const togglePriority = (priority: Priority) => {
    const newPriorities = filters.priorityFilter.includes(priority)
      ? filters.priorityFilter.filter((p) => p !== priority)
      : [...filters.priorityFilter, priority];
    onFilterChange({ ...filters, priorityFilter: newPriorities });
  };

  if (isOpen) {
    return (
    <section
        className="p-4 bg-gray-50 rounded-lg border border-gray-200 mb-4"
        aria-label="Filters"
      >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Event Type Filter */}
        <div>
          <h4 className="font-medium text-sm text-gray-700 mb-2">Event Types</h4>
          <div className="flex flex-wrap gap-2">
            {eventTypes.map((type) => (
              <button
                key={type}
                onClick={() => toggleEventType(type)}
                className={`
                  px-3 py-1 text-sm rounded-full border transition-colors
                  ${
                    filters.eventTypes.includes(type)
                      ? 'bg-blue-100 border-blue-300 text-blue-800'
                      : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                  }
                `}
                aria-pressed={filters.eventTypes.includes(type)}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Priority Filter */}
        <div>
          <h4 className="font-medium text-sm text-gray-700 mb-2">Priority</h4>
          <div className="flex flex-wrap gap-2">
            {priorities.map((priority) => (
              <button
                key={priority}
                onClick={() => togglePriority(priority)}
                className={`
                  px-3 py-1 text-sm rounded-full border transition-colors
                  ${
                    filters.priorityFilter.includes(priority)
                      ? 'bg-blue-100 border-blue-300 text-blue-800'
                      : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                  }
                `}
                aria-pressed={filters.priorityFilter.includes(priority)}
              >
                {priority.charAt(0).toUpperCase() + priority.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>
      </section>
    );
  }

  return null;
}

// Stats Summary Component
interface StatsSummaryProps {
  events: TimelineEvent[];
}

function StatsSummary({ events }: Readonly<StatsSummaryProps>) {
  const stats = useMemo(() => {
    const activeDeadlines = events.filter(
      (e) => e.type === 'deadline' && !['completed', 'waived'].includes(e.status)
    );
    const overdue = events.filter((e) => e.status === 'overdue');
    const dueSoon = events.filter((e) => e.status === 'approaching' || e.status === 'due_today');
    const completed = events.filter((e) => e.status === 'completed');

    return {
      total: events.length,
      activeDeadlines: activeDeadlines.length,
      overdue: overdue.length,
      dueSoon: dueSoon.length,
      completed: completed.length,
    };
  }, [events]);

  return (
    <section
      className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6"
      aria-label="Timeline statistics"
    >
      <div className="p-4 bg-white rounded-lg border border-gray-200 text-center">
        <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
        <p className="text-sm text-gray-500">Total Events</p>
      </div>
      <div className="p-4 bg-white rounded-lg border border-gray-200 text-center">
        <p className="text-2xl font-bold text-blue-600">{stats.activeDeadlines}</p>
        <p className="text-sm text-gray-500">Active Deadlines</p>
      </div>
      <div className="p-4 bg-white rounded-lg border border-red-200 text-center">
        <p className="text-2xl font-bold text-red-600">{stats.overdue}</p>
        <p className="text-sm text-gray-500">Overdue</p>
      </div>
      <div className="p-4 bg-white rounded-lg border border-yellow-200 text-center">
        <p className="text-2xl font-bold text-yellow-600">{stats.dueSoon}</p>
        <p className="text-sm text-gray-500">Due Soon</p>
      </div>
      <div className="p-4 bg-white rounded-lg border border-green-200 text-center">
        <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
        <p className="text-sm text-gray-500">Completed</p>
      </div>
    </section>
  );
}

// Main Timeline Component
function CaseTimeline({
  caseId: _caseId,
  events: externalEvents,
  onEventClick,
  onAddDeadline,
  onAddTask,
  onAddAppointment,
}: Readonly<CaseTimelineProps>) {
  // Use provided events or generate sample data
  const events = externalEvents || generateSampleEvents();

  // State
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<FilterOptions>({
    eventTypes: [],
    statusFilter: [],
    priorityFilter: [],
    dateRange: { start: null, end: null },
  });
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Filter and sort events
  const filteredEvents = useMemo(() => {
    let result = [...events];

    // Apply event type filter
    if (filters.eventTypes.length > 0) {
      result = result.filter((e) => filters.eventTypes.includes(e.type));
    }

    // Apply priority filter
    if (filters.priorityFilter.length > 0) {
      result = result.filter((e) => filters.priorityFilter.includes(e.priority));
    }

    // Sort by date
    result.sort((a, b) => {
      const diff = a.date.getTime() - b.date.getTime();
      return sortOrder === 'asc' ? diff : -diff;
    });

    return result;
  }, [events, filters, sortOrder]);

  // Separate overdue events for attention
  const overdueEvents = useMemo(
    () => filteredEvents.filter((e) => e.status === 'overdue'),
    [filteredEvents]
  );

  const handleEventClick = useCallback(
    (event: TimelineEvent) => {
      if (onEventClick) {
        onEventClick(event);
      }
    },
    [onEventClick]
  );

  const toggleExpand = useCallback((eventId: string) => {
    setExpandedEventId((prev) => (prev === eventId ? null : eventId));
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Case Timeline</h2>
          <p className="text-sm text-gray-500 mt-1">Track deadlines, tasks, and appointments</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilterOpen(!filterOpen)}
            className={`
              px-4 py-2 text-sm border rounded-lg flex items-center gap-2 transition-colors
              ${filterOpen ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-gray-300 hover:bg-gray-50'}
            `}
            aria-expanded={filterOpen}
            aria-controls="filter-panel"
          >
            <Icon name="filter_list" className="text-base" />
            Filters
            {(filters.eventTypes.length > 0 || filters.priorityFilter.length > 0) && (
              <span className="ml-1 px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">
                {filters.eventTypes.length + filters.priorityFilter.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
            aria-label={`Sort ${sortOrder === 'asc' ? 'descending' : 'ascending'}`}
          >
            {sortOrder === 'asc' ? (
              <Icon name="expand_less" className="text-base" />
            ) : (
              <Icon name="expand_more" className="text-base" />
            )}
            {sortOrder === 'asc' ? 'Earliest First' : 'Latest First'}
          </button>
        </div>
      </div>

      {/* Stats Summary */}
      <StatsSummary events={events} />

      {/* Filter Panel */}
      <div id="filter-panel">
        <FilterPanel
          filters={filters}
          onFilterChange={setFilters}
          isOpen={filterOpen}
        />
      </div>

      {/* Overdue Alert */}
      {overdueEvents.length > 0 && (
        <div
          className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3"
          role="alert"
          aria-live="polite"
        >
          <Icon name="warning" className="text-xl text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-medium text-red-800">
              {overdueEvents.length} Overdue {overdueEvents.length === 1 ? 'Item' : 'Items'}
            </h3>
            <p className="text-sm text-red-700 mt-1">
              Immediate attention required for overdue deadlines and tasks.
            </p>
          </div>
        </div>
      )}

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icon name="calendar_today" className="text-xl" />
            Timeline Events
          </CardTitle>
          <CardDescription>
            {filteredEvents.length} {filteredEvents.length === 1 ? 'event' : 'events'} showing
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredEvents.length === 0 ? (
            <div className="text-center py-12">
              <Icon name="calendar_today" className="text-5xl text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No events match your filters</p>
              {(filters.eventTypes.length > 0 || filters.priorityFilter.length > 0) && (
                <button
                  onClick={() =>
                    setFilters({
                      eventTypes: [],
                      statusFilter: [],
                      priorityFilter: [],
                      dateRange: { start: null, end: null },
                    })
                  }
                  className="mt-2 text-blue-600 hover:text-blue-700 text-sm"
                >
                  Clear all filters
                </button>
              )}
            </div>
          ) : (
            <ul className="relative" aria-label="Timeline events">
              {filteredEvents.map((event) => (
                <TimelineEventCard
                  key={event.id}
                  event={event}
                  onClick={() => handleEventClick(event)}
                  isExpanded={expandedEventId === event.id}
                  onToggleExpand={() => toggleExpand(event.id)}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={onAddDeadline}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          <Icon name="schedule" className="text-base" />
          Add Deadline
        </button>
        <button
          onClick={onAddTask}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
        >
          <Icon name="check_circle" className="text-base" />
          Add Task
        </button>
        <button
          onClick={onAddAppointment}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
        >
          <Icon name="event_available" className="text-base" />
          Schedule Appointment
        </button>
      </div>
    </div>
  );
}

// Transform API timeline event to component format
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformApiEvent(apiEvent: any): TimelineEvent {
  // Note: tRPC serializes Date as string over JSON, so we handle both types
  // Map API event type to component event type
  let type: TimelineEventType = 'task';
  if (apiEvent.type === 'appointment') type = 'appointment';
  else if (apiEvent.type === 'deadline') type = 'deadline';
  else if (apiEvent.type === 'agent_action') type = 'agent_action';
  else if (apiEvent.type === 'reminder') type = 'reminder';
  else if (apiEvent.type === 'document' || apiEvent.type === 'document_version') type = 'document';
  else if (apiEvent.type === 'status_change' || apiEvent.type === 'stage_change') type = 'status_change';
  else if (apiEvent.type === 'note') type = 'note';
  else if (apiEvent.type.includes('task')) type = 'task';

  // Map status
  let status: DeadlineStatus | TaskStatus | AppointmentStatus | AgentActionStatus = 'pending';
  if (apiEvent.task) {
    const taskStatusMap: Record<string, TaskStatus> = {
      PENDING: 'pending',
      IN_PROGRESS: 'in_progress',
      COMPLETED: 'completed',
      CANCELLED: 'cancelled',
    };
    status = taskStatusMap[apiEvent.task.status] || 'pending';
  } else if (apiEvent.appointment) {
    const aptStatusMap: Record<string, AppointmentStatus> = {
      SCHEDULED: 'scheduled',
      CONFIRMED: 'confirmed',
      COMPLETED: 'completed',
      CANCELLED: 'cancelled',
      NO_SHOW: 'no_show',
      IN_PROGRESS: 'confirmed',
    };
    status = aptStatusMap[apiEvent.appointment.status] || 'scheduled';
  } else if (apiEvent.agentAction) {
    const agentStatusMap: Record<string, AgentActionStatus> = {
      pending_approval: 'pending_approval',
      approved: 'approved',
      rejected: 'rejected',
      rolled_back: 'rolled_back',
      expired: 'expired',
    };
    status = agentStatusMap[apiEvent.agentAction.status] || 'pending_approval';
  }

  // Handle overdue status
  if (apiEvent.isOverdue && type === 'task') {
    status = 'overdue' as DeadlineStatus;
  }

  // Map priority
  const priorityMap: Record<string, Priority> = {
    low: 'low',
    medium: 'medium',
    high: 'high',
    urgent: 'critical',
  };
  const priority: Priority = priorityMap[apiEvent.priority || 'medium'] || 'medium';

  return {
    id: apiEvent.id,
    type,
    title: apiEvent.title,
    description: apiEvent.description || undefined,
    date: new Date(apiEvent.timestamp),
    endDate: apiEvent.appointment ? new Date(apiEvent.appointment.endTime) : undefined,
    status,
    priority,
    assignedTo: apiEvent.actor?.name || undefined,
    agentActionId: apiEvent.agentAction?.actionId,
    agentName: apiEvent.agentAction?.agentName,
    confidenceScore: apiEvent.agentAction?.confidence ? Math.round(apiEvent.agentAction.confidence * 100) : undefined,
  };
}

// Inner Page Content Component (uses searchParams)
function CaseTimelinePageContent() {
  const searchParams = useSearchParams();
  const dealId = searchParams.get('dealId');
  const caseId = searchParams.get('caseId') || dealId || 'demo-case-1';

  // Get reminders context (optional - works without provider)
  const reminders = useRemindersOptional();

  // Fetch timeline data from API
  const {
    data: timelineData,
    isLoading,
    error,
    refetch,
  } = trpc.timeline.getEvents.useQuery(
    {
      dealId: caseId !== 'demo-case-1' ? caseId : undefined,
      limit: 50,
      sortOrder: 'desc',
      includeCompleted: true,
    },
    {
      enabled: true,
      refetchOnWindowFocus: false,
    }
  );

  // Transform API events to component format
  const apiEvents = useMemo(() => {
    if (!timelineData?.events) return null;
    return timelineData.events.map(transformApiEvent);
  }, [timelineData]);

  // Create reminders from timeline events
  React.useEffect(() => {
    if (apiEvents && reminders) {
      // Create reminders from future events (tasks, deadlines, appointments)
      // Map local TimelineEvent format to service's expected format
      // Note: Local Priority has 'critical', service uses 'urgent' - map accordingly
      const mapPriority = (p: Priority): 'low' | 'medium' | 'high' | 'urgent' =>
        p === 'critical' ? 'urgent' : p;

      const reminderEvents = apiEvents.map(e => ({
        id: e.id,
        type: e.type,
        title: e.title,
        description: e.description,
        timestamp: e.date,
        priority: mapPriority(e.priority),
        entityType: e.type === 'task' ? 'task' : e.type === 'appointment' ? 'appointment' : 'case',
        entityId: e.linkedCaseId,
      }));
      reminders.createFromTimelineEvents(reminderEvents);
    }
  }, [apiEvents]);

  const handleEventClick = (event: TimelineEvent) => {
    console.log('Event clicked:', event);
  };

  const handleAddDeadline = () => {
    console.log('Add deadline clicked');
  };

  const handleAddTask = () => {
    console.log('Add task clicked');
  };

  const handleAddAppointment = () => {
    console.log('Add appointment clicked');
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="container mx-auto py-8 px-4 max-w-5xl">
        <div className="flex items-center justify-center py-12">
          <Icon name="progress_activity" className="text-3xl animate-spin text-blue-600" />
          <span className="ml-3 text-gray-600">Loading timeline...</span>
        </div>
      </div>
    );
  }

  // Error state - fall back to demo data
  if (error) {
    console.warn('Timeline API error, using demo data:', error.message);
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-5xl">
      {/* API Status Banner */}
      {timelineData && (
        <div className="mb-4 flex items-center justify-between text-sm text-gray-500 bg-gray-50 px-4 py-2 rounded-lg">
          <span>
            Showing {timelineData.events.length} events from API
            {timelineData.queryDurationMs && ` (${timelineData.queryDurationMs.toFixed(0)}ms)`}
          </span>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1 text-blue-600 hover:text-blue-700"
          >
            <Icon name="refresh" className="text-base" />
            Refresh
          </button>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <p className="font-medium">Using demo data</p>
          <p className="text-amber-700">API unavailable: {error.message}</p>
        </div>
      )}

      <CaseTimeline
        caseId={caseId}
        events={apiEvents || undefined}
        onEventClick={handleEventClick}
        onAddDeadline={handleAddDeadline}
        onAddTask={handleAddTask}
        onAddAppointment={handleAddAppointment}
      />
    </div>
  );
}

// Loading fallback
function TimelineLoadingFallback() {
  return (
    <div className="container mx-auto py-8 px-4 max-w-5xl">
      <div className="flex items-center justify-center py-12">
        <Icon name="progress_activity" className="text-3xl animate-spin text-blue-600" />
        <span className="ml-3 text-gray-600">Loading timeline...</span>
      </div>
    </div>
  );
}

// Page Component - wrapped with Suspense
export default function CaseTimelinePage() {
  return (
    <Suspense fallback={<TimelineLoadingFallback />}>
      <CaseTimelinePageContent />
    </Suspense>
  );
}
