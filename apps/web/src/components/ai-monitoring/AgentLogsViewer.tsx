'use client';

/**
 * Agent Logs Viewer — PG-152
 *
 * Displays AI agent conversation transcripts, tool call records,
 * and a searchable log timeline with filtering capabilities.
 * Route: /agent-approvals/logs
 */

import { useState, useCallback, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Card, CardContent, Button, Skeleton, cn } from '@intelliflow/ui';
import { PageHeader, SearchFilterBar, useMultiFilterState } from '@/components/shared';
import { useAgentLogs } from '@/lib/ai-monitoring/hooks';
import { getAgentTypeIcon, getAgentTypeLabel } from '@/lib/active-agents/agent-utils';
import type { AgentLog, AgentLogMessage, AgentLogToolCall } from '@/lib/ai-monitoring/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BREADCRUMBS = [{ label: 'AI & Agents', href: '/agent-approvals' }, { label: 'Agent Logs' }];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
];

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'SUCCESS', label: 'Success' },
  { value: 'FAILED', label: 'Failed' },
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
  return (e: Readonly<ReactKeyboardEvent>) => {
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
      <div data-testid="transcript-content" className="p-4 text-sm text-muted-foreground italic">
        No messages recorded
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

        return (
          <div // NOSONAR
            key={`${msg.role}-${idx}`}
            data-testid="message-bubble"
            role={isSystem ? 'button' : undefined}
            tabIndex={isSystem ? 0 : undefined}
            className={messageBubbleClass(isUser, isSystem, isTool, isExpanded)}
            onClick={isSystem ? () => toggleMessage(idx) : undefined}
            onKeyDown={isSystem ? makeSystemKeyDownHandler(idx, toggleMessage) : undefined}
          >
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
// Empty State
// ---------------------------------------------------------------------------

interface LogsEmptyStateProps {
  hasFilters: boolean;
  onClearFilters: () => void;
}

function LogsEmptyState({ hasFilters, onClearFilters }: Readonly<LogsEmptyStateProps>) {
  return (
    <Card data-testid="empty-state">
      <CardContent className="flex flex-col items-center justify-center p-8 text-center">
        <span className="material-symbols-outlined text-4xl text-muted-foreground mb-2">
          description
        </span>
        <p className="text-sm text-muted-foreground mb-4">
          {hasFilters ? 'No logs match your filters' : 'No logs recorded yet'}
        </p>
        {hasFilters && (
          <Button variant="outline" onClick={onClearFilters}>
            Clear filters
          </Button>
        )}
      </CardContent>
    </Card>
  );
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

  const { logs, total, hasMore, isLoading, error, refetch } = useAgentLogs({
    agentId: agentId ?? undefined,
    search: filterState.values.search || undefined,
    toolStatus: filterState.values.toolStatus || undefined,
    sort: (filterState.values.sort as 'newest' | 'oldest') || 'newest',
    limit: DEFAULT_LIMIT,
    offset,
  });

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

  // Error state
  if (error && !isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          breadcrumbs={BREADCRUMBS}
          title="Agent Logs"
          description="View AI agent conversation transcripts and tool call records"
          actions={[{ label: 'Refresh', icon: 'refresh', variant: 'secondary', onClick: refetch }]}
        />
        <Card data-testid="error-message">
          <CardContent className="flex flex-col items-center justify-center p-8 text-center">
            <span className="material-symbols-outlined text-4xl text-red-500 mb-2">error</span>
            <p className="text-sm text-muted-foreground mb-4">Failed to load agent logs</p>
            <Button data-testid="retry-button" onClick={refetch} variant="outline">
              Try again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const hasFilters = filterState.values.search || filterState.values.toolStatus;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={BREADCRUMBS}
        title="Agent Logs"
        description="View AI agent conversation transcripts and tool call records"
        actions={[{ label: 'Refresh', icon: 'refresh', variant: 'secondary', onClick: refetch }]}
      />

      {/* Filters */}
      <SearchFilterBar
        searchValue={filterState.values.search}
        onSearchChange={(v) => filterState.set('search', v)}
        searchPlaceholder="Search logs..."
        filters={[
          {
            id: 'toolStatus',
            label: 'Tool Status',
            options: STATUS_FILTER_OPTIONS,
            value: filterState.values.toolStatus,
            onChange: (v) => filterState.set('toolStatus', v),
          },
        ]}
        sort={{
          options: SORT_OPTIONS,
          value: filterState.values.sort,
          onChange: (v) => filterState.set('sort', v),
        }}
      />

      {/* Agent ID chip */}
      {agentId && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Filtering by agent:</span>
          <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
            {agentId.slice(0, 8)}...
          </span>
        </div>
      )}

      {/* Total count */}
      {!isLoading && (
        <p className="text-sm text-muted-foreground">
          {total} {total === 1 ? 'log' : 'logs'} found
        </p>
      )}

      {/* Loading */}
      {isLoading && <LogsSkeleton />}
      {!isLoading && logs.length === 0 && (
        <LogsEmptyState
          hasFilters={!!hasFilters}
          onClearFilters={() => {
            filterState.set('search', '');
            filterState.set('toolStatus', '');
          }}
        />
      )}
      {!isLoading && logs.length > 0 && (
        <>
          <div className="space-y-3">
            {logs.map((log) => (
              <LogEntryCard
                key={log.id}
                log={log}
                isExpanded={expandedLogIds.has(log.id)}
                onToggle={() => toggleExpand(log.id)}
              />
            ))}
          </div>

          {hasMore && (
            <div className="flex justify-center">
              <Button data-testid="load-more" variant="outline" onClick={handleLoadMore}>
                Load More
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
