'use client';

/**
 * Agent Detail Page
 *
 * Shows a single agent's info, status, and full conversation transcript.
 * Route: /agent-approvals/logs/:id (id = agentId e.g. "ai-insights-v1")
 */

import { use, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, Skeleton, cn } from '@intelliflow/ui';
import { PageHeader } from '@/components/shared';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { useActiveAgentsDashboard } from '@/lib/active-agents/hooks';
import { useAgentLogs } from '@/lib/ai-monitoring/hooks';
import {
  getAgentTypeLabel,
  getAgentTypeIcon,
  getStatusBadgeClass,
  getStatusDotClass,
  formatLastActive,
} from '@/lib/active-agents/agent-utils';
import type { AgentLogMessage, AgentLogToolCall } from '@/lib/ai-monitoring/types';

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function formatTimestamp(iso: string, timezone: string = 'Europe/London'): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: timezone,
  });
}

// ---------------------------------------------------------------------------
// Message List
// ---------------------------------------------------------------------------

function getMessageIconClass(isError: boolean, isCompleted: boolean): string {
  if (isError) return 'text-red-500';
  if (isCompleted) return 'text-green-500';
  return 'text-blue-500';
}

function getMessageIconName(isError: boolean, isCompleted: boolean): string {
  if (isError) return 'error';
  if (isCompleted) return 'check_circle';
  return 'play_circle';
}

function MessageList({ messages }: Readonly<{ messages: AgentLogMessage[] }>) {
  if (messages.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-sm text-muted-foreground italic">
        No messages recorded yet. Messages will appear here when this agent processes jobs.
      </div>
    );
  }

  return (
    <div className="divide-y">
      {messages.map((msg, idx) => {
        const isError = msg.content.startsWith('Failed');
        const isCompleted = msg.content.startsWith('Completed');
        return (
          <div
            key={`${msg.timestamp}-${idx}`}
            className={cn(
              'flex items-start gap-3 px-4 py-3',
              isError && 'bg-red-50/50 dark:bg-red-950/10'
            )}
          >
            <span
              className={cn(
                'mt-0.5 material-symbols-outlined text-base',
                getMessageIconClass(isError, isCompleted)
              )}
            >
              {getMessageIconName(isError, isCompleted)}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatTimestamp(msg.timestamp)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tool Call List
// ---------------------------------------------------------------------------

const TOOL_STATUS_COLORS: Record<string, string> = {
  SUCCESS: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  FAILED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  PENDING: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  RUNNING: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
};

function ToolCallList({ toolCalls }: Readonly<{ toolCalls: AgentLogToolCall[] }>) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  if (toolCalls.length === 0) return null;

  return (
    <Card>
      <CardContent className="p-0">
        <div className="px-4 py-3 border-b">
          <h3 className="text-sm font-semibold">Tool Calls</h3>
        </div>
        <div className="divide-y">
          {toolCalls.map((tc, idx) => {
            const isExpanded = expandedIdx === idx;
            return (
              <div key={`${tc.name}-${tc.timestamp}`}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-muted/50"
                  onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                >
                  <span className="text-sm font-medium">{tc.name}</span>
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                      TOOL_STATUS_COLORS[tc.status] ?? 'bg-slate-100 text-slate-600'
                    )}
                  >
                    {tc.status}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {formatTimestamp(tc.timestamp)}
                  </span>
                </button>
                {isExpanded && (
                  <div className="px-6 pb-3 space-y-2">
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
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Detail Content
// ---------------------------------------------------------------------------

function AgentDetailContent({ agentId }: Readonly<{ agentId: string }>) {
  const { isLoading: authLoading } = useRequireAuth();
  const { agents, isLoading: agentsLoading } = useActiveAgentsDashboard();
  const {
    logs,
    isLoading: logsLoading,
    refetch,
  } = useAgentLogs({
    agentId,
    limit: 50,
    sort: 'newest',
  });

  const isLoading = authLoading || agentsLoading || logsLoading;

  // Find agent metadata from the active agents list
  const agent = agents.find((a) => a.agentId === agentId);
  const agentType = agent?.type ?? agentId.replace(/^ai-/, '').replace(/-v\d+$/, '');
  const label = getAgentTypeLabel(agentType);

  // Merge all messages across conversation logs (usually 1 conversation per agent)
  const allMessages = logs.flatMap((l) => l.messages);
  const allToolCalls = logs.flatMap((l) => l.toolCalls);

  const breadcrumbs = [
    { label: 'AI & Agents', href: '/agent-approvals' },
    { label: 'Active Agents', href: '/agent-approvals/agents' },
    { label },
  ];

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={breadcrumbs}
        title={label}
        description={`Agent logs and activity for ${agentId}`}
        actions={[
          {
            label: 'Refresh',
            icon: 'refresh',
            variant: 'secondary',
            onClick: refetch,
          },
        ]}
      />

      {/* Agent Info Card */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <span className="material-symbols-outlined text-xl">
                {getAgentTypeIcon(agentType)}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-lg font-semibold">{label}</h2>
                {agent && (
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
                      getStatusBadgeClass(agent.status)
                    )}
                  >
                    <span
                      className={cn('h-1.5 w-1.5 rounded-full', getStatusDotClass(agent.status))}
                    />
                    {agent.status.charAt(0).toUpperCase() + agent.status.slice(1)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">badge</span>
                  {agentId}
                </span>
                {agent && (
                  <>
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm">memory</span>
                      {agent.model}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm">schedule</span>
                      {formatLastActive(agent.lastActive)}
                    </span>
                  </>
                )}
              </div>
              {agent?.currentTask && (
                <p className="mt-2 text-sm">
                  <span className="text-muted-foreground">Current task: </span>
                  {agent.currentTask}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Activity Log */}
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h3 className="text-sm font-semibold">Activity Log</h3>
            <span className="text-xs text-muted-foreground">
              {allMessages.length} {allMessages.length === 1 ? 'entry' : 'entries'}
            </span>
          </div>
          <MessageList messages={allMessages} />
        </CardContent>
      </Card>

      {/* Tool Calls (if any) */}
      <ToolCallList toolCalls={allToolCalls} />

      {/* Back link */}
      <div>
        <Link
          href="/agent-approvals/agents"
          className="text-sm text-primary hover:underline inline-flex items-center gap-1"
        >
          <span className="material-symbols-outlined text-sm">arrow_back</span> Back to Active
          Agents
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AgentLogsDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  return <AgentDetailContent agentId={id} />;
}
