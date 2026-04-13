'use client';

/**
 * Agent Tools Page
 *
 * Displays the agent tool registry from the backend.
 * Wires: agent.listTools, agent.getTool, agent.executeTool
 * Route: /agent-approvals/tools
 */

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent, Button, Skeleton, cn, EmptyState } from '@intelliflow/ui';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { trpc } from '@/lib/trpc';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ToolInfo {
  name: string;
  description: string;
  actionType: string;
  entityTypes: string[];
}

interface ToolDetail {
  name: string;
  description: string;
  actionType: string;
  entityTypes: string[];
  requiresApproval: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ACTION_TYPE_STYLES: Record<string, { bg: string; text: string; icon: string }> = {
  SEARCH: {
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    text: 'text-blue-700 dark:text-blue-400',
    icon: 'search',
  },
  CREATE: {
    bg: 'bg-green-100 dark:bg-green-900/30',
    text: 'text-green-700 dark:text-green-400',
    icon: 'add_circle',
  },
  UPDATE: {
    bg: 'bg-amber-100 dark:bg-amber-900/30',
    text: 'text-amber-700 dark:text-amber-400',
    icon: 'edit',
  },
  DELETE: {
    bg: 'bg-red-100 dark:bg-red-900/30',
    text: 'text-red-700 dark:text-red-400',
    icon: 'delete',
  },
  DRAFT: {
    bg: 'bg-purple-100 dark:bg-purple-900/30',
    text: 'text-purple-700 dark:text-purple-400',
    icon: 'draft',
  },
};

function getActionStyle(actionType: string) {
  return ACTION_TYPE_STYLES[actionType] ?? ACTION_TYPE_STYLES.SEARCH;
}

// ---------------------------------------------------------------------------
// Tool Detail Panel (sub-component for expanded tool card)
// ---------------------------------------------------------------------------

interface ToolDetailPanelProps {
  detailQuery: { isLoading: boolean; error: { message: string } | null; data: unknown };
  requiresApproval: boolean;
  executeMutation: {
    isPending: boolean;
    isSuccess: boolean;
    error: { message: string } | null;
  };
  handleTestExecute: () => void;
}

function ToolDetailPanel({
  detailQuery,
  requiresApproval,
  executeMutation,
  handleTestExecute,
}: Readonly<ToolDetailPanelProps>) {
  if (detailQuery.isLoading)
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-4 w-32" />
      </div>
    );
  if (detailQuery.error)
    return (
      <p className="text-sm text-destructive">
        Failed to load tool details: {detailQuery.error.message}
      </p>
    );
  if (!detailQuery.data) return null;

  const detail = detailQuery.data as ToolDetail;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div>
          <span className="text-muted-foreground">Action Type</span>
          <p className="font-medium">{detail.actionType}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Entity Types</span>
          <p className="font-medium">{detail.entityTypes.join(', ')}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Requires Approval</span>
          <p className="font-medium">{detail.requiresApproval ? 'Yes' : 'No'}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Tool Name</span>
          <p className="font-mono text-xs">{detail.name}</p>
        </div>
      </div>

      {requiresApproval && (
        <div className="flex items-center gap-3 pt-2 border-t">
          <Button
            size="sm"
            variant="outline"
            onClick={handleTestExecute}
            disabled={executeMutation.isPending}
            className="gap-1.5"
          >
            <span className="material-symbols-outlined text-sm">
              {executeMutation.isPending ? 'hourglass_empty' : 'play_arrow'}
            </span>
            {executeMutation.isPending ? 'Submitting...' : 'Test Execute'}
          </Button>
          <span className="text-xs text-muted-foreground">
            Creates a pending approval action for review
          </span>
          {executeMutation.isSuccess && (
            <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">check_circle</span> Action
              submitted — check{' '}
              <Link href="/agent-approvals/preview" className="underline">
                Tool Actions
              </Link>
            </span>
          )}
          {executeMutation.error && (
            <span className="text-xs text-destructive">{executeMutation.error.message}</span>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tool Card
// ---------------------------------------------------------------------------

interface ToolCardProps {
  tool: ToolInfo;
  requiresApproval: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}

function ToolCard({ tool, requiresApproval, isExpanded, onToggle }: Readonly<ToolCardProps>) {
  const style = getActionStyle(tool.actionType);
  const detailQuery = trpc.agent.getTool.useQuery({ toolName: tool.name }, { enabled: isExpanded });

  const executeMutation = trpc.agent.executeTool.useMutation();
  const utils = trpc.useUtils();

  const handleTestExecute = useCallback(async () => {
    try {
      const result = await executeMutation.mutateAsync({
        toolName: tool.name,
        input: {},
      });
      if (result.requiresApproval) {
        utils.agent.getPendingApprovals.invalidate();
        utils.agent.getPendingCount.invalidate();
      }
    } catch {
      // Error is shown via executeMutation.error
    }
  }, [executeMutation, tool.name, utils.agent.getPendingApprovals, utils.agent.getPendingCount]);

  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="p-0">
        <button
          type="button"
          onClick={onToggle}
          className="flex w-full items-center justify-between gap-4 p-4 text-left"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                style.bg,
                style.text
              )}
            >
              <span className="material-symbols-outlined text-lg">{style.icon}</span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-medium">{tool.name}</h3>
                <span
                  className={cn(
                    'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                    style.bg,
                    style.text
                  )}
                >
                  {tool.actionType}
                </span>
                {requiresApproval && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                    <span className="material-symbols-outlined text-xs">shield</span> Approval
                    Required
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground truncate">{tool.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-muted-foreground">{tool.entityTypes.join(', ')}</span>
            <span
              className="material-symbols-outlined text-base text-muted-foreground transition-transform"
              style={{ transform: isExpanded ? 'rotate(180deg)' : undefined }}
            >
              expand_more
            </span>
          </div>
        </button>

        {isExpanded && (
          <div className="border-t px-4 py-3 bg-muted/30">
            <ToolDetailPanel
              detailQuery={detailQuery}
              requiresApproval={requiresApproval}
              executeMutation={executeMutation}
              handleTestExecute={handleTestExecute}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Loading Skeleton
// ---------------------------------------------------------------------------

const GRID_SKELETON_KEYS = ['grid-0', 'grid-1', 'grid-2', 'grid-3'] as const;
const LIST_SKELETON_KEYS = ['list-0', 'list-1', 'list-2', 'list-3', 'list-4'] as const;

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {GRID_SKELETON_KEYS.map((key) => (
          <Skeleton key={key} className="h-20 rounded-lg" />
        ))}
      </div>
      <div className="space-y-3">
        {LIST_SKELETON_KEYS.map((key) => (
          <Skeleton key={key} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

function AgentToolsDashboard() {
  const toolsQuery = trpc.agent.listTools.useQuery();
  const countQuery = trpc.agent.getPendingCount.useQuery(undefined, {
    refetchInterval: 30_000,
  });
  const [expandedTool, setExpandedTool] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'approval' | 'no-approval'>('all');

  if (toolsQuery.isLoading) return <LoadingSkeleton />;

  if (toolsQuery.error) {
    return (
      <div className="flex flex-col gap-6">
        <Header pendingCount={0} />
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-8 text-center">
            <span className="material-symbols-outlined text-4xl text-red-500 mb-2">error</span>
            <p className="text-sm text-muted-foreground mb-4">
              Failed to load agent tools: {toolsQuery.error.message}
            </p>
            <Button onClick={() => toolsQuery.refetch()} variant="outline">
              Try again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const data = toolsQuery.data!;
  const approvalSet = new Set(data.requiringApproval.map((t) => t.name));
  const allTools = [...data.requiringApproval, ...data.noApproval];

  let filteredTools: typeof allTools;
  if (filter === 'approval') {
    filteredTools = data.requiringApproval;
  } else if (filter === 'no-approval') {
    filteredTools = data.noApproval;
  } else {
    filteredTools = allTools;
  }

  const pendingCount = countQuery.data?.count ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <Header pendingCount={pendingCount} onRefresh={() => toolsQuery.refetch()} />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Tools</p>
            <p className="text-2xl font-bold">{data.all.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Require Approval</p>
            <p className="text-2xl font-bold text-amber-600">{data.requiringApproval.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Auto-Execute</p>
            <p className="text-2xl font-bold text-green-600">{data.noApproval.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Pending Actions</p>
            <p className="text-2xl font-bold text-blue-600">{pendingCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Categories */}
      {data.metadata?.categories && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(
            data.metadata.categories as Record<
              string,
              { name: string; description: string; requiresApproval: boolean; tools: string[] }
            >
          ).map(([key, cat]) => {
            const catStyle = getActionStyle(key.toUpperCase());
            return (
              <Card key={key} className="border-l-4" style={{ borderLeftColor: 'currentColor' }}>
                <CardContent className={cn('p-3', catStyle.text)}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="material-symbols-outlined text-sm">{catStyle.icon}</span>
                    <span className="text-sm font-medium">{cat.name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{cat.description}</p>
                  <p className="text-xs mt-1">
                    {cat.tools.length} tool{cat.tools.length === 1 ? '' : 's'}{' '}
                    {cat.requiresApproval ? '(approval)' : '(auto)'}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-base text-muted-foreground">
          filter_list
        </span>
        <span className="text-sm text-muted-foreground">Filter:</span>
        {(['all', 'approval', 'no-approval'] as const).map((f) => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? 'default' : 'ghost'}
            onClick={() => setFilter(f)}
          >
            {(() => {
              if (f === 'all') return 'All';
              if (f === 'approval') return 'Approval Required';
              return 'Auto-Execute';
            })()}
          </Button>
        ))}
      </div>

      {/* Tool List */}
      {filteredTools.length === 0 ? (
        <Card>
          <CardContent className="p-8">
            <EmptyState entity="agents" variant="filtered" phase="passive" />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredTools.map((tool) => (
            <ToolCard
              key={tool.name}
              tool={tool}
              requiresApproval={approvalSet.has(tool.name)}
              isExpanded={expandedTool === tool.name}
              onToggle={() => setExpandedTool((prev) => (prev === tool.name ? null : tool.name))}
            />
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="rounded-lg border bg-card p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          <span className="text-sm font-medium">Backend Connection</span>
          <span className="text-xs text-muted-foreground">Connected to agent.listTools</span>
        </div>
        <Link href="/agent-approvals/preview">
          <Button variant="outline" size="sm" className="gap-1.5">
            <span className="material-symbols-outlined text-sm">pending_actions</span> View Pending
            Actions
            {pendingCount > 0 && (
              <span className="ml-1 rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
                {pendingCount}
              </span>
            )}
          </Button>
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

interface HeaderProps {
  pendingCount: number;
  onRefresh?: () => void;
}

function Header({ pendingCount, onRefresh }: Readonly<HeaderProps>) {
  return (
    <div>
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-2 text-sm text-muted-foreground mb-1"
      >
        <Link href="/dashboard" className="hover:text-foreground transition-colors">
          Dashboard
        </Link>
        <span className="material-symbols-outlined text-xs">chevron_right</span>
        <Link href="/agent-approvals" className="hover:text-foreground transition-colors">
          Agent Approvals
        </Link>
        <span className="material-symbols-outlined text-xs">chevron_right</span>
        <span className="text-foreground font-medium" aria-current="page">
          Agent Tools
        </span>
      </nav>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Agent Tools</h1>
          <p className="text-muted-foreground">
            Available AI agent tools and their approval requirements
          </p>
        </div>
        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 dark:bg-amber-900/30 px-3 py-1 text-sm font-medium text-amber-700 dark:text-amber-400">
              <span className="material-symbols-outlined text-sm">pending_actions</span>
              {pendingCount} pending
            </span>
          )}
          {onRefresh && (
            <Button variant="outline" onClick={onRefresh} className="gap-2">
              <span className="material-symbols-outlined text-base">refresh</span> Refresh
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page Shell
// ---------------------------------------------------------------------------

function AgentToolsContent() {
  const { isLoading: authLoading } = useRequireAuth();
  if (authLoading) return <LoadingSkeleton />;
  return <AgentToolsDashboard />;
}

export default function AgentToolsPage() {
  return <AgentToolsContent />;
}
