'use client';

/**
 * WorkflowList
 *
 * Workflow definitions list — visual layout matches the canonical CRM
 * list pattern (Leads / Contacts / Cases): full-width `SearchFilterBar`,
 * row-level `TableRowActions` (icon-only quick actions + "•••" dropdown),
 * single shared `ConfirmationDialog` for delete, no inline per-row dialogs,
 * no duplicated Create button (the page-level `PageHeader` owns the
 * primary CTA via `actions`).
 */

import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { SearchFilterBar } from '@/components/shared/search-filter-bar';
import {
  ConfirmationDialog,
  EmptyState,
  Skeleton,
  StatusBadge,
  Switch,
  TableRowActions,
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
  /** Kept for backward-compat with existing tests; the live page surfaces
      "+ New workflow" via PageHeader so this prop is no longer rendered as
      a duplicate button inside the list. */
  onCreateNew?: () => void;
}

/** Human-readable relative time. */
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
    <div data-testid="workflow-list-skeleton" className="space-y-2">
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-16 w-full rounded-lg" />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function WorkflowList({ onEdit }: WorkflowListProps) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const { data, isLoading } = api.workflow.list.useQuery({ limit: 50 });
  const utils = api.useUtils();

  const deleteMutation = api.workflow.delete.useMutation({
    onSuccess: () => void utils.workflow.list.invalidate(),
  });

  const setActiveMutation = api.workflow.setActive.useMutation({
    onSuccess: () => void utils.workflow.list.invalidate(),
  });

  // Project rows once, derive stepCount from the persisted steps shape
  // (envelope { nodes } or legacy flat array) so the row badge is accurate.
  const rows = useMemo<WorkflowRow[]>(() => {
    const raw = (data?.items ?? []) as Array<WorkflowRow & { steps?: unknown }>;
    return raw.map((row) => {
      const steps = row.steps;
      let stepCount = 0;
      if (Array.isArray(steps)) {
        stepCount = steps.length;
      } else if (steps && typeof steps === 'object') {
        const env = (steps as Record<string, unknown>).nodes;
        stepCount = Array.isArray(env) ? env.length : 0;
      }
      return { ...row, stepCount };
    });
  }, [data]);

  const uniqueCategories = useMemo(
    () => Array.from(new Set(rows.map((wf) => wf.category))).sort((a, b) => a.localeCompare(b)),
    [rows]
  );
  const categoryFilterOptions = useMemo(
    () => [
      { value: 'all', label: 'All Categories' },
      ...uniqueCategories.map((cat) => ({
        value: cat,
        label: cat.charAt(0).toUpperCase() + cat.slice(1),
      })),
    ],
    [uniqueCategories]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter((wf) => {
      const matchesSearch =
        !search || wf.name.toLowerCase().includes(q) || wf.category.toLowerCase().includes(q);
      const matchesCategory = categoryFilter === 'all' || wf.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [rows, search, categoryFilter]);

  const pendingDelete = pendingDeleteId
    ? (rows.find((r) => r.id === pendingDeleteId) ?? null)
    : null;

  if (isLoading) {
    // Full-bleed search bar then skeleton — same shape as Leads / Contacts
    return (
      <div className="flex flex-col gap-4">
        <SearchFilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search workflows…"
        />
        <ListSkeleton />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <SearchFilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search workflows…"
        />
        <EmptyState
          title="No workflows yet"
          description="Create your first workflow from the New workflow button above."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Full-bleed search + filter bar — matches Leads / Contacts / Cases. */}
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

      {filtered.length === 0 ? (
        <EmptyState title="No results" description={`No workflows match "${search}"`} />
      ) : (
        <ul className="divide-y rounded-lg border border-border bg-card">
          {filtered.map((wf) => (
            <li
              key={wf.id}
              className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
            >
              {/* Name + meta — the row body is itself clickable; the Edit
                  quick action below is the explicit affordance. The body
                  button has no aria-label so screen readers announce the
                  workflow name from the text content. */}
              <button
                type="button"
                onClick={() => onEdit(wf.id)}
                className="flex-1 min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              >
                <p className="font-medium text-sm truncate" data-testid="workflow-name">
                  {wf.name}
                </p>
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
              </button>

              {/* Status badge */}
              <StatusBadge
                status={wf.isActive ? 'active' : 'inactive'}
                type="custom"
                config={{
                  active: { label: 'Active', variant: 'success' as const, icon: 'check_circle' },
                  inactive: { label: 'Inactive', variant: 'muted' as const },
                }}
              />

              {/* Active toggle — kept inline because it's a 1-click state change */}
              <Switch
                checked={wf.isActive}
                onCheckedChange={(checked) => {
                  setActiveMutation.mutate({ id: wf.id, isActive: checked });
                }}
                aria-label={`Toggle ${wf.name} active`}
              />

              {/* Row actions — single canonical TableRowActions component
                  matching Leads / Contacts / Cases. Edit is a quick action;
                  Delete sits in the dropdown with destructive styling. */}
              <TableRowActions
                quickActions={[
                  {
                    icon: 'edit',
                    label: `Edit ${wf.name}`,
                    onClick: () => onEdit(wf.id),
                  },
                ]}
                dropdownActions={[
                  {
                    id: 'duplicate',
                    icon: 'content_copy',
                    label: `Duplicate ${wf.name}`,
                    onClick: () => {
                      // Future: wire to a workflow.duplicate mutation when available
                      // (FU). For now, opens Edit on the source workflow.
                      onEdit(wf.id);
                    },
                  },
                  {
                    id: 'delete',
                    icon: 'delete',
                    label: `Delete ${wf.name}`,
                    variant: 'destructive',
                    onClick: () => setPendingDeleteId(wf.id),
                  },
                ]}
              />
            </li>
          ))}
        </ul>
      )}

      {/* Single shared confirmation dialog — replaces N inline AlertDialogs */}
      <ConfirmationDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteId(null);
        }}
        title="Delete workflow?"
        description={
          pendingDelete
            ? `This will archive "${pendingDelete.name}". You can restore it later.`
            : ''
        }
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          if (pendingDeleteId) {
            deleteMutation.mutate({ id: pendingDeleteId });
            setPendingDeleteId(null);
          }
        }}
      />
    </div>
  );
}
