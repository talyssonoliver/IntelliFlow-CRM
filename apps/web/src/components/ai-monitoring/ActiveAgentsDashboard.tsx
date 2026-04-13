'use client';

/**
 * Active Agents Dashboard — PG-151
 *
 * Displays AI agent status monitoring with health indicators,
 * task assignments, and filtering/sorting capabilities.
 * Route: /agent-approvals/agents
 */

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent, Button, EmptyState, Skeleton, cn } from '@intelliflow/ui';
import { PageHeader, SearchFilterBar, useMultiFilterState } from '@/components/shared';
import { useActiveAgentsDashboard } from '@/lib/active-agents/hooks';
import { api } from '@/lib/api';
import { QueueSchedulerPanel } from './QueueSchedulerPanel';
import { WorkflowProgressPanel } from './WorkflowProgressPanel';
import { useQueueScheduler, useQueueMutations } from '@/lib/ai-monitoring/queue-scheduler-hooks';
import {
  getAgentTypeLabel,
  getAgentTypeIcon,
  getStatusBadgeClass,
  getStatusDotClass,
  formatLastActive,
  computeAgentStats,
  filterAgents,
} from '@/lib/active-agents/agent-utils';
import type { ActiveAgent, ActiveAgentFilters } from '@/lib/active-agents/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BREADCRUMBS = [
  { label: 'AI & Agents', href: '/agent-approvals' },
  { label: 'Active Agents' },
];

const AGENTS_GRID_SKELETON_KEYS = [
  'agent-grid-0',
  'agent-grid-1',
  'agent-grid-2',
  'agent-grid-3',
  'agent-grid-4',
] as const;
const AGENTS_LIST_SKELETON_KEYS = ['agent-list-0', 'agent-list-1', 'agent-list-2'] as const;

const TYPE_CHIPS = [
  { id: 'all', label: 'All' },
  { id: 'qualification', label: 'Qualification' },
  { id: 'email', label: 'Email Writer' },
  { id: 'followup', label: 'Follow-up' },
  { id: 'nba', label: 'Next Best Action' },
  { id: 'scoring', label: 'Lead Scoring' },
  { id: 'churn', label: 'Churn Prediction' },
  { id: 'sentiment', label: 'Sentiment' },
  { id: 'autoresponse', label: 'Auto-Response' },
  { id: 'rag', label: 'RAG Context' },
  { id: 'embedding', label: 'Embedding' },
  { id: 'crew', label: 'Crew' },
  { id: 'hallucination', label: 'Hallucination Check' },
  { id: 'indexer', label: 'Document Indexer' },
  { id: 'ocr', label: 'OCR Worker' },
  { id: 'insights', label: 'Insights' },
];

const SORT_OPTIONS = [
  { value: 'lastActive', label: 'Last Active' },
  { value: 'type', label: 'Type' },
  { value: 'status', label: 'Status' },
];

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'active', label: 'Active' },
  { value: 'idle', label: 'Idle' },
  { value: 'error', label: 'Error' },
];

// ---------------------------------------------------------------------------
// StatCard
// ---------------------------------------------------------------------------

interface StatCardProps {
  label: string;
  value: string | number;
  icon: string;
  colorClass: string;
  isLoading: boolean;
  testId?: string;
  ariaLabel?: string;
}

function StatCard({
  label,
  value,
  icon,
  colorClass,
  isLoading,
  testId,
  ariaLabel,
}: Readonly<StatCardProps>) {
  return (
    <Card>
      <CardContent className="p-4" data-testid={testId} aria-label={ariaLabel}>
        <div className="flex items-center gap-3">
          <div className={cn('h-10 w-10 rounded-lg flex items-center justify-center', colorClass)}>
            <span className="material-symbols-outlined text-lg">{icon}</span>
          </div>
          <div>
            {isLoading ? (
              <Skeleton className="h-6 w-10" data-testid="skeleton" />
            ) : (
              <p className="text-2xl font-bold" data-testid="stat-value">
                {value}
              </p>
            )}
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// AgentCard
// ---------------------------------------------------------------------------

interface AgentCardProps {
  agent: ActiveAgent;
  onReset: (agentId: string) => void;
  onDelete: (agentId: string) => void;
  isActing: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}

function AgentCard({
  agent,
  onReset,
  onDelete,
  isActing,
  isExpanded,
  onToggle,
}: Readonly<AgentCardProps>) {
  const agentId = agent.agentId ?? agent.id;

  return (
    <article data-testid="agent-card" className="rounded-lg border bg-card overflow-hidden">
      <div className="flex items-start justify-between gap-4 p-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <span className="material-symbols-outlined text-lg">
              {getAgentTypeIcon(agent.type)}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-medium">{getAgentTypeLabel(agent.type)}</h3>
              <span
                data-testid="status-badge"
                aria-label={`Status: ${agent.status}`}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                  getStatusBadgeClass(agent.status)
                )}
              >
                <span className={cn('h-1.5 w-1.5 rounded-full', getStatusDotClass(agent.status))} />
                {agent.status}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">{agent.model}</p>
            <p className="mt-1 text-sm truncate">{agent.currentTask ?? 'No active task'}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <span className="text-xs text-muted-foreground">
            {formatLastActive(agent.lastActive)}
          </span>
          <div className="flex items-center gap-1.5">
            {agent.contextType && agent.contextId && (
              <button
                type="button"
                data-testid="expand-agent-workflow"
                aria-expanded={isExpanded}
                aria-label={isExpanded ? 'Hide workflow progress' : 'Show workflow progress'}
                onClick={onToggle}
                className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted transition-colors"
              >
                <span className="material-symbols-outlined text-sm">
                  {isExpanded ? 'expand_less' : 'expand_more'}
                </span>{' '}
                Workflow
              </button>
            )}
            <Link
              href={`/agent-approvals/logs/${agentId}`}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted transition-colors"
            >
              <span className="material-symbols-outlined text-sm">description</span> Logs
            </Link>
            {agent.status === 'error' && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={isActing}
                onClick={() => onReset(agentId)}
                aria-label={`Reset ${getAgentTypeLabel(agent.type)}`}
              >
                <span className="material-symbols-outlined text-sm mr-1">restart_alt</span> Reset
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600"
              disabled={isActing}
              onClick={() => onDelete(agentId)}
              aria-label={`Remove ${getAgentTypeLabel(agent.type)}`}
            >
              <span className="material-symbols-outlined text-sm">close</span>
            </Button>
          </div>
        </div>
      </div>
      {isExpanded && agent.contextType && agent.contextId && (
        <div className="border-t px-4 py-3">
          <WorkflowProgressPanel entityType={agent.contextType} entityId={agent.contextId} />
        </div>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Loading Skeleton
// ---------------------------------------------------------------------------

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {AGENTS_GRID_SKELETON_KEYS.map((key) => (
          <Skeleton key={key} className="h-20 rounded-lg animate-pulse" data-testid="skeleton" />
        ))}
      </div>
      <Skeleton className="h-10 w-full rounded-lg animate-pulse" data-testid="skeleton" />
      <div className="space-y-3">
        {AGENTS_LIST_SKELETON_KEYS.map((key) => (
          <Skeleton
            key={key}
            className="h-24 w-full rounded-lg animate-pulse"
            data-testid="skeleton"
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Dashboard
// ---------------------------------------------------------------------------

export function ActiveAgentsDashboard() {
  const { agents, healthStatus, isLoading, error, refetch } = useActiveAgentsDashboard();
  const queueScheduler = useQueueScheduler();
  const queueMutations = useQueueMutations();

  const [activeChip, setActiveChip] = useState('all');
  const [actingAgentId, setActingAgentId] = useState<string | null>(null);
  const [expandedAgentIds, setExpandedAgentIds] = useState<Set<string>>(new Set());

  const toggleAgentExpand = useCallback((id: string) => {
    setExpandedAgentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const resetMutation = api.aiMonitoring.resetAgentStatus.useMutation({
    onSuccess: () => {
      setActingAgentId(null);
      refetch();
    },
    onError: () => {
      setActingAgentId(null);
    },
  });

  const deleteMutation = api.aiMonitoring.deleteAgent.useMutation({
    onSuccess: () => {
      setActingAgentId(null);
      refetch();
    },
    onError: () => {
      setActingAgentId(null);
    },
  });

  const handleReset = useCallback(
    (agentId: string) => {
      setActingAgentId(agentId);
      resetMutation.mutate({ agentId });
    },
    [resetMutation]
  );

  const handleDelete = useCallback(
    (agentId: string) => {
      setActingAgentId(agentId);
      deleteMutation.mutate({ agentId });
    },
    [deleteMutation]
  );

  const filterState = useMultiFilterState({
    status: '',
    type: '',
    search: '',
    sort: 'lastActive',
  });

  const handleChipChange = useCallback(
    (chipId: string) => {
      setActiveChip(chipId);
      filterState.set('type', chipId === 'all' ? '' : chipId);
    },
    [filterState]
  );

  // Error state
  if (error && !isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          breadcrumbs={BREADCRUMBS}
          title="Active Agents"
          description="Monitor AI agent status and health"
        />
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-8 text-center">
            <span className="material-symbols-outlined text-4xl text-red-500 mb-2">error</span>
            <p className="text-sm text-muted-foreground mb-4">Failed to load agent data</p>
            <Button onClick={refetch} variant="outline" aria-label="Try again">
              Try again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const stats = computeAgentStats(agents);

  const filters: ActiveAgentFilters = {
    status: filterState.values.status,
    type: filterState.values.type,
    search: filterState.values.search,
    sort: filterState.values.sort as ActiveAgentFilters['sort'],
  };

  const filteredAgents = filterAgents(agents, filters);

  const healthLabelWhenPresent = healthStatus?.healthy
    ? 'Healthy'
    : `${healthStatus?.issues.length ?? 0} Issues`;
  const healthLabel = healthStatus ? healthLabelWhenPresent : '—';

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={BREADCRUMBS}
        title="Active Agents"
        description="Monitor AI agent status and health"
        actions={[
          {
            label: 'Refresh',
            icon: 'refresh',
            variant: 'secondary',
            onClick: refetch,
          },
        ]}
      />

      {/* Stat Cards */}
      {isLoading ? (
        <DashboardSkeleton />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatCard
              label="Total Agents"
              value={stats.total}
              icon="groups"
              colorClass="bg-primary/10 text-primary"
              isLoading={false}
            />
            <StatCard
              label="Active"
              value={stats.active}
              icon="play_circle"
              colorClass="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
              isLoading={false}
            />
            <StatCard
              label="Idle"
              value={stats.idle}
              icon="pause_circle"
              colorClass="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
              isLoading={false}
            />
            <StatCard
              label="Error"
              value={stats.error}
              icon="error"
              colorClass="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
              isLoading={false}
            />
            <StatCard
              label="Health"
              value={healthLabel}
              icon={healthStatus?.healthy ? 'check_circle' : 'warning'}
              colorClass={
                healthStatus?.healthy
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
              }
              isLoading={false}
              testId="health-stat"
              ariaLabel={`System health: ${healthLabel}`}
            />
          </div>

          {/* Filters */}
          <SearchFilterBar
            searchValue={filterState.values.search}
            onSearchChange={(v) => filterState.set('search', v)}
            searchPlaceholder="Search agents..."
            filters={[
              {
                id: 'status',
                label: 'Status',
                options: STATUS_FILTER_OPTIONS,
                value: filterState.values.status,
                onChange: (v) => filterState.set('status', v),
              },
            ]}
            filterChips={{
              options: TYPE_CHIPS,
              value: activeChip,
              onChange: handleChipChange,
            }}
            sort={{
              options: SORT_OPTIONS,
              value: filterState.values.sort,
              onChange: (v) => filterState.set('sort', v),
            }}
          />

          {/* Agent List */}
          {filteredAgents.length === 0 ? (
            <EmptyState entity="agents" phase="passive" />
          ) : (
            <div className="space-y-3">
              {filteredAgents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  onReset={handleReset}
                  onDelete={handleDelete}
                  isActing={actingAgentId === (agent.agentId ?? agent.id)}
                  isExpanded={expandedAgentIds.has(agent.id)}
                  onToggle={() => toggleAgentExpand(agent.id)}
                />
              ))}
            </div>
          )}

          {/* Queue Scheduler Panel — IFC-296 */}
          <QueueSchedulerPanel
            data={queueScheduler.data}
            isLoading={queueScheduler.isLoading}
            isUnavailable={queueScheduler.isUnavailable}
            isPending={queueMutations.isPending}
            onPause={queueMutations.pause}
            onResume={queueMutations.resume}
            onRetryFailed={queueMutations.retryFailed}
            onDeleteScheduler={queueMutations.deleteScheduler}
            onRefresh={queueScheduler.refetch}
          />
        </>
      )}
    </div>
  );
}
