'use client';

/**
 * WorkflowList — IFC-031
 *
 * Paginated list of workflow definitions with search, status toggle,
 * and delete confirmation. Uses shared components per DRY rules.
 */

import { useState } from 'react';
import { api } from '@/lib/api';
import { SearchFilterBar } from '@/components/shared/search-filter-bar';
import {
  Button,
  Switch,
  Skeleton,
  StatusBadge,
  EmptyState,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@intelliflow/ui';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WorkflowRow {
  id: string;
  name: string;
  category: string;
  isActive: boolean;
  triggerType: string;
  version: number;
  createdAt: Date | string;
  updatedAt: Date | string;
  /** Count of step nodes — surfaced in the list row so a save is visible */
  stepCount?: number;
}

export interface WorkflowListProps {
  onEdit: (id: string) => void;
  onCreateNew?: () => void;
}

/** Format an ISO date as a short, human-readable relative string. */
function formatRelative(date: Date | string): string {
  const d = new Date(date);
  const ms = Date.now() - d.getTime();
  const sec = Math.round(ms / 1000);
  if (sec < 60) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day} day${day === 1 ? '' : 's'} ago`;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function ListSkeleton() {
  return (
    <div data-testid="workflow-list-skeleton" className="space-y-2 p-4">
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-14 w-full rounded-lg" />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function WorkflowList({ onEdit, onCreateNew }: WorkflowListProps) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [_pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const { data, isLoading } = api.workflow.list.useQuery({ limit: 50 });
  const utils = api.useUtils();

  const deleteMutation = api.workflow.delete.useMutation({
    onSuccess: () => void utils.workflow.list.invalidate(),
  });

  const setActiveMutation = api.workflow.setActive.useMutation({
    onSuccess: () => void utils.workflow.list.invalidate(),
  });

  if (isLoading) {
    return <ListSkeleton />;
  }

  // Project server rows into WorkflowRow shape, deriving stepCount from the
  // `steps` payload so the list row can show "{N} steps".
  // Shape of `steps` comes from IFC-028:
  //   - envelope  { nodes: [...], edges: [...] }  (post-2026-04 workflows)
  //   - flat      [...]                           (legacy)
  const rawRows = (data?.items ?? []) as Array<WorkflowRow & { steps?: unknown }>;
  const rows: WorkflowRow[] = rawRows.map((row) => {
    const steps = row.steps;
    let stepCount = 0;
    if (Array.isArray(steps)) {
      stepCount = steps.length;
    } else if (steps && typeof steps === 'object') {
      const envelope = (steps as Record<string, unknown>).nodes;
      stepCount = Array.isArray(envelope) ? envelope.length : 0;
    }
    return { ...row, stepCount };
  });

  // Derive unique categories for the filter dropdown
  const uniqueCategories = Array.from(new Set(rows.map((wf) => wf.category))).sort();
  const categoryFilterOptions = [
    { value: 'all', label: 'All Categories' },
    ...uniqueCategories.map((cat) => ({
      value: cat,
      label: cat.charAt(0).toUpperCase() + cat.slice(1),
    })),
  ];

  // Client-side filter by name/category text + category dropdown
  const searchLower = search.toLowerCase();
  const filtered = rows.filter((wf) => {
    const matchesSearch =
      !search ||
      wf.name.toLowerCase().includes(searchLower) ||
      wf.category.toLowerCase().includes(searchLower);
    const matchesCategory =
      categoryFilter === 'all' || wf.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  if (rows.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between p-4 border-b">
          <SearchFilterBar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search workflows"
          />
          {onCreateNew && (
            <Button onClick={onCreateNew} size="sm" className="ml-2">
              + Create Workflow
            </Button>
          )}
        </div>
        <EmptyState
          title="No workflows yet"
          description="Create your first workflow to automate business processes."
          action={
            onCreateNew
              ? { label: 'Create Workflow', onClick: onCreateNew }
              : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-4 border-b gap-3">
        <SearchFilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search workflows…"
          filters={[
            {
              id: 'category',
              label: 'Category',
              options: categoryFilterOptions,
              value: categoryFilter,
              onChange: setCategoryFilter,
            },
          ]}
        />
        {onCreateNew && (
          <Button onClick={onCreateNew} size="sm">
            + Create Workflow
          </Button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <EmptyState
            title="No results"
            description={`No workflows match "${search}"`}
          />
        ) : (
          <ul className="divide-y">
            {filtered.map((wf) => (
              <li
                key={wf.id}
                className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
              >
                {/* Name + category + step count + updated-relative */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate" data-testid="workflow-name">{wf.name}</p>
                  <p className="text-xs text-muted-foreground">
                    <span data-testid="workflow-category">{wf.category}</span>
                    <span className="mx-1">&middot;</span>
                    <span data-testid="workflow-step-count">
                      {wf.stepCount ?? 0} step{(wf.stepCount ?? 0) === 1 ? '' : 's'}
                    </span>
                    <span className="mx-1">&middot;</span>
                    <span data-testid="workflow-updated">
                      Updated{' '}
                      <time dateTime={new Date(wf.updatedAt).toISOString()}>
                        {formatRelative(wf.updatedAt)}
                      </time>
                    </span>
                  </p>
                </div>

                {/* Status badge */}
                <StatusBadge
                  status={wf.isActive ? 'active' : 'inactive'}
                  type="custom"
                  config={{
                    active: { label: 'Active', variant: 'success' as const, icon: 'check_circle' },
                    inactive: { label: 'Inactive', variant: 'muted' as const },
                  }}
                />

                {/* Active toggle */}
                <Switch
                  checked={wf.isActive}
                  onCheckedChange={(checked) => {
                    setActiveMutation.mutate({ id: wf.id, isActive: checked });
                  }}
                  aria-label={`Toggle ${wf.name} active`}
                />

                {/* Edit button */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onEdit(wf.id)}
                  aria-label={`Edit ${wf.name}`}
                >
                  Edit
                </Button>

                {/* Delete button */}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Delete ${wf.name}`}
                      onClick={() => setPendingDeleteId(wf.id)}
                    >
                      Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete workflow?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will archive &quot;{wf.name}&quot;. You can restore it later.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel onClick={() => setPendingDeleteId(null)}>
                        Cancel
                      </AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => {
                          deleteMutation.mutate({ id: wf.id });
                          setPendingDeleteId(null);
                        }}
                      >
                        Confirm
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
