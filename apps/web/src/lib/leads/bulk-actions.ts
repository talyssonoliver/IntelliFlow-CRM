import type { BulkAction, StatusOption } from '@intelliflow/ui';
import type { LeadStatus } from '@intelliflow/domain';
import type { FilterOption } from '@/components/shared';
import type { Lead } from './lead-types';

export const SCORE_FILTER_OPTIONS: readonly FilterOption[] = [
  { value: 'high', label: 'High (80+)' },
  { value: 'medium', label: 'Medium (50-79)' },
  { value: 'low', label: 'Low (<50)' },
];

export const LEAD_SORT_OPTIONS: readonly { value: string; label: string }[] = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'score-high', label: 'Highest Score' },
  { value: 'score-low', label: 'Lowest Score' },
];

// Six options; CONVERTED is intentionally omitted — bulk conversion flows
// through bulkConvert, not a status change. See spec AC-007.
export const LEAD_STATUS_OPTIONS: readonly StatusOption[] = [
  {
    value: 'NEW',
    label: 'New',
    color: 'slate',
    icon: 'fiber_new',
    description: 'Newly captured lead',
  },
  {
    value: 'CONTACTED',
    label: 'Contacted',
    color: 'orange',
    icon: 'phone_in_talk',
    description: 'Initial contact made',
  },
  {
    value: 'QUALIFIED',
    label: 'Qualified',
    color: 'blue',
    icon: 'verified',
    description: 'Lead meets qualification criteria',
  },
  {
    value: 'NEGOTIATING',
    label: 'Negotiating',
    color: 'purple',
    icon: 'handshake',
    description: 'Active negotiations in progress',
  },
  {
    value: 'UNQUALIFIED',
    label: 'Unqualified',
    color: 'red',
    icon: 'do_not_disturb',
    description: 'Lead does not meet criteria',
  },
  {
    value: 'LOST',
    label: 'Lost',
    color: 'slate',
    icon: 'cancel',
    description: 'Lead is no longer viable',
  },
];

export function getSortParams(sortOrder: string): {
  sortBy: 'createdAt' | 'score';
  sortOrder: 'asc' | 'desc';
} {
  switch (sortOrder) {
    case 'oldest':
      return { sortBy: 'createdAt', sortOrder: 'asc' };
    case 'score-high':
      return { sortBy: 'score', sortOrder: 'desc' };
    case 'score-low':
      return { sortBy: 'score', sortOrder: 'asc' };
    case 'newest':
    default:
      return { sortBy: 'createdAt', sortOrder: 'desc' };
  }
}

export function getScoreParams(scoreFilter: string): {
  minScore?: number;
  maxScore?: number;
} {
  switch (scoreFilter) {
    case 'high':
      return { minScore: 80 };
    case 'medium':
      return { minScore: 50, maxScore: 79 };
    case 'low':
      return { maxScore: 49 };
    default:
      return {};
  }
}

export type BulkDialogKind = 'convert' | 'status' | 'archive' | 'delete';

export interface BulkActionFactoryDeps {
  readonly setSelected: (leads: Lead[]) => void;
  readonly openDialog: (kind: BulkDialogKind) => void;
}

export function buildLeadBulkActions(deps: BulkActionFactoryDeps): BulkAction<Lead>[] {
  return [
    {
      icon: 'person_add',
      label: 'Convert to Contacts',
      onClick: (selected) => {
        deps.setSelected(selected);
        deps.openDialog('convert');
      },
    },
    {
      icon: 'edit',
      label: 'Update Status',
      onClick: (selected) => {
        deps.setSelected(selected);
        deps.openDialog('status');
      },
    },
    {
      icon: 'archive',
      label: 'Archive',
      onClick: (selected) => {
        deps.setSelected(selected);
        deps.openDialog('archive');
      },
    },
    {
      icon: 'delete',
      label: 'Delete',
      variant: 'danger',
      onClick: (selected) => {
        deps.setSelected(selected);
        deps.openDialog('delete');
      },
    },
  ];
}

export interface BulkResult {
  readonly successful: readonly string[];
  readonly failed: readonly { id: string; error: string }[];
  readonly totalProcessed?: number;
}

export interface BulkRunnerMutations {
  readonly bulkConvert: {
    mutateAsync(input: { ids: string[]; createAccounts: boolean }): Promise<BulkResult>;
  };
  readonly bulkUpdateStatus: {
    mutateAsync(input: { ids: string[]; status: LeadStatus }): Promise<BulkResult>;
  };
  readonly bulkArchive: {
    mutateAsync(input: { ids: string[] }): Promise<BulkResult>;
  };
  readonly bulkDelete: {
    mutateAsync(input: { ids: string[] }): Promise<BulkResult>;
  };
}

export type ToastVariant = 'default' | 'destructive';

export interface ToastInput {
  title: string;
  description: string;
  variant?: ToastVariant;
}

export type ToastApi = (input: ToastInput) => void;

export interface BulkActionRunners {
  runConvert(leads: Lead[]): Promise<void>;
  runUpdateStatus(leads: Lead[], status: LeadStatus): Promise<void>;
  runArchive(leads: Lead[]): Promise<void>;
  runDelete(leads: Lead[]): Promise<void>;
}

export function createBulkActionRunners(
  mutations: BulkRunnerMutations,
  toast: ToastApi,
  onFinally: () => void
): BulkActionRunners {
  return {
    async runConvert(leads) {
      if (leads.length === 0) return;
      try {
        const result = await mutations.bulkConvert.mutateAsync({
          ids: leads.map((l) => l.id),
          createAccounts: false,
        });
        if (result.successful.length > 0) {
          toast({
            title: 'Leads Converted',
            description: `Successfully converted ${result.successful.length} lead(s) to contacts.`,
          });
        }
        if (result.failed.length > 0) {
          toast({
            title: 'Some leads could not be converted',
            description: `${result.failed.length} lead(s) failed: ${
              result.failed[0]?.error ?? 'Unknown error'
            }`,
            variant: 'destructive',
          });
        }
      } catch (error) {
        toast({
          title: 'Conversion Failed',
          description: error instanceof Error ? error.message : 'An unexpected error occurred',
          variant: 'destructive',
        });
      } finally {
        onFinally();
      }
    },

    async runUpdateStatus(leads, status) {
      if (leads.length === 0) return;
      try {
        const result = await mutations.bulkUpdateStatus.mutateAsync({
          ids: leads.map((l) => l.id),
          status,
        });
        if (result.successful.length > 0) {
          toast({
            title: 'Status Updated',
            description: `Successfully updated ${result.successful.length} lead(s) to "${status}".`,
          });
        }
        if (result.failed.length > 0) {
          const firstError = result.failed[0]?.error;
          toast({
            title: 'Some updates failed',
            description: firstError
              ? `${result.failed.length} lead(s) could not be updated: ${firstError}`
              : `${result.failed.length} lead(s) could not be updated.`,
            variant: 'destructive',
          });
        }
      } catch (error) {
        toast({
          title: 'Status Update Failed',
          description: error instanceof Error ? error.message : 'An unexpected error occurred',
          variant: 'destructive',
        });
      } finally {
        onFinally();
      }
    },

    async runArchive(leads) {
      if (leads.length === 0) return;
      try {
        const result = await mutations.bulkArchive.mutateAsync({
          ids: leads.map((l) => l.id),
        });
        if (result.successful.length > 0) {
          toast({
            title: 'Leads Archived',
            description: `Successfully archived ${result.successful.length} lead(s).`,
          });
        }
        if (result.failed.length > 0) {
          toast({
            title: 'Some leads could not be archived',
            description: `${result.failed.length} lead(s) failed.`,
            variant: 'destructive',
          });
        }
      } catch (error) {
        toast({
          title: 'Archive Failed',
          description: error instanceof Error ? error.message : 'An unexpected error occurred',
          variant: 'destructive',
        });
      } finally {
        onFinally();
      }
    },

    async runDelete(leads) {
      if (leads.length === 0) return;
      try {
        const result = await mutations.bulkDelete.mutateAsync({
          ids: leads.map((l) => l.id),
        });
        if (result.successful.length > 0) {
          toast({
            title: 'Leads Deleted',
            description: `Successfully deleted ${result.successful.length} lead(s).`,
          });
        }
        if (result.failed.length > 0) {
          toast({
            title: 'Some leads could not be deleted',
            description: `${result.failed.length} lead(s) failed: ${
              result.failed[0]?.error ?? 'Unknown error'
            }`,
            variant: 'destructive',
          });
        }
      } catch (error) {
        toast({
          title: 'Delete Failed',
          description: error instanceof Error ? error.message : 'An unexpected error occurred',
          variant: 'destructive',
        });
      } finally {
        onFinally();
      }
    },
  };
}
