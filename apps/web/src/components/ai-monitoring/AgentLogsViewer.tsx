'use client';

/**
 * Agent Logs Viewer — PG-152
 *
 * Displays AI agent conversation transcripts, tool call records,
 * and a searchable log timeline with filtering capabilities.
 * Route: /agent-approvals/logs
 */

import { useState, useCallback, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Card, CardContent, Button, EmptyState, Skeleton, cn } from '@intelliflow/ui';
import { PageHeader, SearchFilterBar, useMultiFilterState } from '@/components/shared';
import { useAgentLogs, useFailedJobs } from '@/lib/ai-monitoring/hooks';
import { getAgentTypeIcon, getAgentTypeLabel } from '@/lib/active-agents/agent-utils';
import type { AgentLog, AgentLogMessage, AgentLogToolCall, FailedJob } from '@/lib/ai-monitoring/types';
import { WorkflowProgressPanel } from './WorkflowProgressPanel';


// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BREADCRUMBS = [{ label: 'AI & Agents', href: '/agent-approvals' }, { label: 'Agent Logs' }];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
];

const STATUS_FILTER_OPTIONS = [
  { value: 'SUCCESS', label: 'Success' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'QUEUE_FAILURES', label: 'Queue Failures' },
];

const TOOL_STATUS_COLORS: Record<string, string> = {
  SUCCESS: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  FAILED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  PENDING: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  RUNNING: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  CANCELLED: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
};

const MESSAGE_TRUNCATE_LENGTH = 500;
const DEFAULT_LIMIT = 20;

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function formatRelativeTime(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffMs = now - then;

  if (diffMs < 0) return 'just now';

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return 'just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ---------------------------------------------------------------------------
// TranscriptView
// ---------------------------------------------------------------------------

interface TranscriptViewProps {
  messages: AgentLogMessage[];
}

function makeSystemKeyDownHandler(idx: number, toggle: (i: number) => void) {
  return (e: ReactKeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle(idx);
    }
  };
}

function messageBubbleClass(
  isUser: boolean,
  isSystem: boolean,
  isTool: boolean,
  isExpanded: boolean
): string {
  return cn(
    'rounded-lg px-3 py-2 text-sm max-w-[85%]',
    isUser && 'ml-auto bg-blue-100 dark:bg-blue-900/30',
    !isUser && !isSystem && !isTool && 'mr-auto bg-card border',
    isSystem && 'mr-auto text-muted-foreground italic collapsed',
    isTool && 'mr-auto font-mono text-xs bg-slate-50 dark:bg-slate-900 border',
    isSystem && !isExpanded && 'opacity-50 cursor-pointer'
  );
}

function TranscriptView({ messages }: Readonly<TranscriptViewProps>) {
  const [expandedMessages, setExpandedMessages] = useState<Set<number>>(new Set());

  const toggleMessage = useCallback((idx: number) => {
    setExpandedMessages((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  if (messages.length === 0) {
    return (
      <div data-testid="transcript-content">
        <EmptyState entity="agents" phase="passive" className="py-4" />
      </div>
    );
  }

  return (
    <div data-testid="transcript-content" className="space-y-2 p-4">
      {messages.map((msg, idx) => {
        const isSystem = msg.role === 'SYSTEM';
        const isTool = msg.role === 'TOOL';
        const isUser = msg.role === 'USER';
        const isLong = msg.content.length > MESSAGE_TRUNCATE_LENGTH;
        const isExpanded = expandedMessages.has(idx);
        const displayContent =
          isLong && !isExpanded
            ? msg.content.slice(0, MESSAGE_TRUNCATE_LENGTH) + '...'
            : msg.content;

        const bubbleClass = messageBubbleClass(isUser, isSystem, isTool, isExpanded);
        const bubbleContent = (
          <>
            <span className="text-xs font-semibold uppercase text-muted-foreground block mb-0.5">
              {msg.role}
            </span>
            {isSystem && !isExpanded ? (
              <span className="text-xs">[System message — click to expand]</span>
            ) : (
              <span className="whitespace-pre-wrap break-words">{displayContent}</span>
            )}
            {isLong && !isSystem && (
              <button
                onClick={() => toggleMessage(idx)}
                className="block text-xs text-primary hover:underline mt-1"
              >
                {isExpanded ? 'Show less' : 'Show more'}
              </button>
            )}
          </>
        );

        return isSystem ? (
          <button
            type="button"
            key={`${msg.role}-${idx}`}
            data-testid="message-bubble"
            className={bubbleClass}
            onClick={() => toggleMessage(idx)}
            onKeyDown={makeSystemKeyDownHandler(idx, toggleMessage)}
          >
            {bubbleContent}
          </button>
        ) : (
          <div
            key={`${msg.role}-${idx}`}
            data-testid="message-bubble"
            className={bubbleClass}
          >
            {bubbleContent}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ToolCallList
// ---------------------------------------------------------------------------

interface ToolCallListProps {
  toolCalls: AgentLogToolCall[];
}

function ToolCallList({ toolCalls }: Readonly<ToolCallListProps>) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  if (toolCalls.length === 0) return null;

  return (
    <div className="border-t px-4 py-3 space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase">Tool Calls</p>
      {toolCalls.map((tc, idx) => {
        const isExpanded = expandedIdx === idx;
        const colorClass = TOOL_STATUS_COLORS[tc.status] ?? 'bg-slate-100 text-slate-600';

        return (
          <div key={`${tc.name}-${tc.timestamp}`}>
            <button
              type="button"
              data-testid="tool-call-row"
              className="flex w-full items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-2 py-1.5 text-left"
              onClick={() => setExpandedIdx(isExpanded ? null : idx)}
            >
              <span className="text-sm font-medium">{tc.name}</span>
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                  colorClass
                )}
                aria-label={`Status: ${tc.status.charAt(0) + tc.status.slice(1).toLowerCase()}`}
              >
                {tc.status}
              </span>
              <span className="ml-auto text-xs text-muted-foreground">
                {formatRelativeTime(tc.timestamp)}
              </span>
            </button>
            {isExpanded && (
              <div data-testid="tool-call-detail" className="ml-4 mt-1 mb-2 space-y-2">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Input</p>
                  <pre className="text-xs bg-muted/50 rounded p-2 overflow-auto max-h-48">
                    {JSON.stringify(tc.input, null, 2)}
                  </pre>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Output</p>
                  <pre className="text-xs bg-muted/50 rounded p-2 overflow-auto max-h-48">
                    {JSON.stringify(tc.output, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LogEntryCard
// ---------------------------------------------------------------------------

interface LogEntryCardProps {
  log: AgentLog;
  isExpanded: boolean;
  onToggle: () => void;
}

function LogEntryCard({ log, isExpanded, onToggle }: Readonly<LogEntryCardProps>) {
  const messageCount = log.messages.length;
  const toolCallCount = log.toolCalls.length;

  return (
    <article data-testid="log-card" className="rounded-lg border bg-card overflow-hidden">
      <div className="flex items-start justify-between gap-4 p-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <span className="material-symbols-outlined text-lg">
              {getAgentTypeIcon(log.agentType)}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-medium">{getAgentTypeLabel(log.agentType)}</h3>
              <span className="text-xs text-muted-foreground font-mono">{log.id}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Agent: {log.agentId.slice(0, 8)}...
            </p>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs text-muted-foreground">
                {messageCount} {messageCount === 1 ? 'message' : 'messages'}
              </span>
              {toolCallCount > 0 && (
                <span className="text-xs text-muted-foreground">
                  {toolCallCount} tool {toolCallCount === 1 ? 'call' : 'calls'}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <span className="text-xs text-muted-foreground">{formatRelativeTime(log.createdAt)}</span>
          <button
            data-testid="expand-transcript"
            aria-expanded={isExpanded}
            onClick={onToggle}
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-sm">
              {isExpanded ? 'expand_less' : 'expand_more'}
            </span>
            {isExpanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
      </div>
      {isExpanded && (
        <>
          <TranscriptView messages={log.messages} />
          <ToolCallList toolCalls={log.toolCalls} />
          {log.contextType && log.contextId && (
            <div className="border-t px-4 py-3">
              <WorkflowProgressPanel
                entityType={log.contextType}
                entityId={log.contextId}
              />
            </div>
          )}
        </>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Loading Skeleton
// ---------------------------------------------------------------------------

function LogsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-24 w-full rounded-lg animate-pulse" /> // NOSONAR typescript:S6479 — static skeleton placeholder, no data identity
      ))}
    </div>
  );
}


// ---------------------------------------------------------------------------
// Failed Job Card (BullMQ DLQ visibility)
// ---------------------------------------------------------------------------

const QUEUE_LABELS: Record<string, string> = {
  'ai-scoring': 'Scoring',
  'ai-prediction': 'Prediction',
  'ai-insights': 'Insights',
};

function FailedJobCard({ job }: Readonly<{ job: FailedJob }>) {
  const [expanded, setExpanded] = useState(false);

  return (
    <article data-testid="failed-job-card" className="rounded-lg border bg-card overflow-hidden">
      <div className="flex items-start justify-between gap-4 p-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
            <span className="material-symbols-outlined text-lg">error</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-medium">{job.name}</h3>
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                {QUEUE_LABELS[job.queue] ?? job.queue}
              </span>
            </div>
            <p className="text-sm text-red-600 dark:text-red-400 mt-0.5 line-clamp-2">
              {job.failedReason}
            </p>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs text-muted-foreground">
                {job.attemptsMade} {job.attemptsMade === 1 ? 'attempt' : 'attempts'}
              </span>
              <span className="text-xs text-muted-foreground font-mono">{job.id}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <span className="text-xs text-muted-foreground">{formatRelativeTime(job.timestamp)}</span>
          <button
            data-testid="expand-failed-job"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-sm">
              {expanded ? 'expand_less' : 'expand_more'}
            </span>
            {expanded ? 'Hide Data' : 'Show Data'}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="border-t px-4 py-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Job Data</p>
          <pre className="text-xs bg-muted/50 rounded p-2 overflow-auto max-h-48">
            {JSON.stringify(job.data, null, 2)}
          </pre>
        </div>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Sub-renderers (extracted to reduce AgentLogsViewer cognitive complexity)
// ---------------------------------------------------------------------------

interface QueueFailuresContentProps {
  jobs: FailedJob[];
  hasMore: boolean;
  onLoadMore: () => void;
}

function QueueFailuresContent({ jobs, hasMore, onLoadMore }: Readonly<QueueFailuresContentProps>) {
  if (jobs.length === 0) {
    return (
      <Card>
        <CardContent className="p-2">
          <EmptyState entity="agents" phase="passive" className="py-4" />
        </CardContent>
      </Card>
    );
  }
  return (
    <>
      <div className="space-y-3">
        {jobs.map((job) => (
          <FailedJobCard key={`${job.queue}-${job.id}`} job={job} />
        ))}
      </div>
      {hasMore && (
        <div className="flex justify-center">
          <Button data-testid="load-more" variant="outline" onClick={onLoadMore}>
            Load More
          </Button>
        </div>
      )}
    </>
  );
}

interface AgentLogsContentProps {
  logs: AgentLog[];
  expandedLogIds: Set<string>;
  onToggle: (id: string) => void;
  hasMore: boolean;
  onLoadMore: () => void;
  hasFilters: boolean;
  onClearFilters: () => void;
}

function AgentLogsContent({
  logs,
  expandedLogIds,
  onToggle,
  hasMore,
  onLoadMore,
  hasFilters,
  onClearFilters,
}: Readonly<AgentLogsContentProps>) {
  if (logs.length === 0) {
    return (
      <div data-testid="empty-state">
        <EmptyState entity="agents" variant={hasFilters ? 'filtered' : 'empty'} phase="passive" />
        {hasFilters && (
          <div className="flex justify-center mt-4">
            <Button variant="outline" onClick={onClearFilters}>
              Clear filters
            </Button>
          </div>
        )}
      </div>
    );
  }
  return (
    <>
      <div className="space-y-3">
        {logs.map((log) => (
          <LogEntryCard
            key={log.id}
            log={log}
            isExpanded={expandedLogIds.has(log.id)}
            onToggle={() => onToggle(log.id)}
          />
        ))}
      </div>
      {hasMore && (
        <div className="flex justify-center">
          <Button data-testid="load-more" variant="outline" onClick={onLoadMore}>
            Load More
          </Button>
        </div>
      )}
    </>
  );
}

function getTotalLabel(isQueueFailuresView: boolean, activeTotal: number): string {
  if (isQueueFailuresView) {
    return activeTotal === 1 ? 'failed job' : 'failed jobs';
  }
  return activeTotal === 1 ? 'log' : 'logs';
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

interface AgentLogsViewerProps {
  agentId?: string | null;
}

export function AgentLogsViewer({ agentId }: Readonly<AgentLogsViewerProps>) {
  const filterState = useMultiFilterState({
    search: '',
    toolStatus: '',
    sort: 'newest',
  });

  const [expandedLogIds, setExpandedLogIds] = useState<Set<string>>(new Set());
  const [offset, setOffset] = useState(0);

  const isQueueFailuresView = filterState.values.toolStatus === 'QUEUE_FAILURES';

  // Agent logs query — skip when viewing queue failures
  const { logs, total, hasMore, isLoading, error, refetch } = useAgentLogs({
    agentId: agentId ?? undefined,
    search: isQueueFailuresView ? undefined : (filterState.values.search || undefined),
    toolStatus: isQueueFailuresView ? undefined : (filterState.values.toolStatus || undefined),
    sort: (filterState.values.sort as 'newest' | 'oldest') || 'newest',
    limit: DEFAULT_LIMIT,
    offset: isQueueFailuresView ? 0 : offset,
  });

  // Failed jobs query — only active when queue failures filter is selected
  const failedJobs = useFailedJobs({
    limit: DEFAULT_LIMIT,
    offset: isQueueFailuresView ? offset : 0,
    enabled: isQueueFailuresView,
  });

  const activeTotal = isQueueFailuresView ? failedJobs.total : total;
  const activeHasMore = isQueueFailuresView ? failedJobs.hasMore : hasMore;
  const activeLoading = isQueueFailuresView ? failedJobs.isLoading : isLoading;
  const activeError = isQueueFailuresView ? failedJobs.error : error;
  const activeRefetch = isQueueFailuresView ? failedJobs.refetch : refetch;

  const toggleExpand = useCallback((logId: string) => {
    setExpandedLogIds((prev) => {
      const next = new Set(prev);
      if (next.has(logId)) next.delete(logId);
      else next.add(logId);
      return next;
    });
  }, []);

  const handleLoadMore = useCallback(() => {
    setOffset((prev) => prev + DEFAULT_LIMIT);
  }, []);

  const handleClearFilters = useCallback(() => {
    filterState.set('search', '');
    filterState.set('toolStatus', '');
  }, [filterState]);

  const pageHeader = (
    <PageHeader
      breadcrumbs={BREADCRUMBS}
      title="Agent Logs"
      description="View AI agent conversation transcripts and tool call records"
      actions={[{ label: 'Refresh', icon: 'refresh', variant: 'secondary', onClick: activeRefetch }]}
    />
  );

  // Error state
  if (activeError && !activeLoading) {
    const errorMsg = isQueueFailuresView
      ? 'Failed to load queue failures — Redis may be unavailable'
      : 'Failed to load agent logs';
    return (
      <div className="flex flex-col gap-6">
        {pageHeader}
        <Card data-testid="error-message">
          <CardContent className="flex flex-col items-center justify-center p-8 text-center">
            <span className="material-symbols-outlined text-4xl text-red-500 mb-2">error</span>
            <p className="text-sm text-muted-foreground mb-4">{errorMsg}</p>
            <Button data-testid="retry-button" onClick={activeRefetch} variant="outline">
              Try again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const hasFilters = !!(filterState.values.search || filterState.values.toolStatus);

  return (
    <div className="flex flex-col gap-6">
      {pageHeader}

      {/* Filters */}
      <SearchFilterBar
        searchValue={filterState.values.search}
        onSearchChange={(v) => filterState.set('search', v)}
        searchPlaceholder={isQueueFailuresView ? 'Search disabled for queue view' : 'Search logs...'}
        filters={[
          {
            id: 'toolStatus',
            label: 'All Statuses',
            options: STATUS_FILTER_OPTIONS,
            value: filterState.values.toolStatus,
            onChange: (v) => {
              filterState.set('toolStatus', v);
              setOffset(0);
            },
          },
        ]}
        sort={{
          options: SORT_OPTIONS,
          value: filterState.values.sort,
          onChange: (v) => filterState.set('sort', v),
        }}
      />

      {/* Agent ID chip */}
      {agentId && !isQueueFailuresView && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Filtering by agent:</span>
          <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
            {agentId.slice(0, 8)}...
          </span>
        </div>
      )}

      {/* Total count */}
      {!activeLoading && (
        <p className="text-sm text-muted-foreground">
          {activeTotal} {getTotalLabel(isQueueFailuresView, activeTotal)} found
        </p>
      )}

      {/* Loading */}
      {activeLoading && <LogsSkeleton />}

      {/* Content — queue failures or agent logs */}
      {!activeLoading && isQueueFailuresView && (
        <QueueFailuresContent
          jobs={failedJobs.jobs}
          hasMore={activeHasMore}
          onLoadMore={handleLoadMore}
        />
      )}
      {!activeLoading && !isQueueFailuresView && (
        <AgentLogsContent
          logs={logs}
          expandedLogIds={expandedLogIds}
          onToggle={toggleExpand}
          hasMore={activeHasMore}
          onLoadMore={handleLoadMore}
          hasFilters={hasFilters}
          onClearFilters={handleClearFilters}
        />
      )}
    </div>
  );
}
