import { EmptyState } from '@intelliflow/ui';

interface NoActionsEmptyStateProps {
  /** A status filter is narrowing the list, so "Clear filters" can bring rows back. */
  filtered: boolean;
  onClearFilters: () => void;
}

/**
 * Empty agent-action queue, shared by the approvals page and its preview.
 * Read-only: agents create the actions, so the only control is clearing
 * the status filter when one is set.
 */
export function NoActionsEmptyState({
  filtered,
  onClearFilters,
}: Readonly<NoActionsEmptyStateProps>) {
  return (
    <EmptyState
      entity="agents"
      variant={filtered ? 'filtered' : 'empty'}
      showCta={false}
      action={filtered ? { label: 'Clear filters', onClick: onClearFilters } : undefined}
    />
  );
}
