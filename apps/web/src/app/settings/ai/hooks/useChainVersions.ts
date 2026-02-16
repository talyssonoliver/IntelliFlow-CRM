'use client';

/**
 * useChainVersions Hook
 *
 * PG-128: AI Chain Versioning Admin UI
 *
 * Provides tRPC integration for chain version management:
 * - Fetch all versions with filters
 * - Create/update/activate/deprecate/archive versions
 * - Rollback to previous versions
 * - Version comparison
 * - Toast notifications for user feedback
 *
 * Pattern: Follows usePipelineConfig hook structure
 */

import { api } from '@/lib/api';
import { useToast } from '@intelliflow/ui';
import type { ChainType, ChainVersionStatus } from '@intelliflow/domain';
import type {
  ChainVersion,
  ChainVersionSummary,
  ChainVersionAudit,
  CreateChainVersionInput,
  UpdateChainVersionInput,
  RollbackResult,
} from '@intelliflow/validators';

export interface UseChainVersionsOptions {
  chainType?: ChainType | 'all';
  status?: ChainVersionStatus | 'all';
  limit?: number;
  offset?: number;
}

export interface ChainVersionStats {
  totalVersions: number;
  activeVersions: number;
  draftVersions: number;
  deprecatedVersions: number;
  archivedVersions: number;
  byChainType: Record<string, number>;
}

export interface VersionComparison {
  versionA: ChainVersion;
  versionB: ChainVersion;
  differences: {
    field: string;
    valueA: unknown;
    valueB: unknown;
  }[];
}

export interface UseChainVersionsReturn {
  // Queries
  versions: ChainVersionSummary[] | undefined;
  activeVersions: Record<ChainType, ChainVersionSummary | null>;
  stats: ChainVersionStats | undefined;

  // Query states
  isLoading: boolean;
  isLoadingActive: boolean;
  isLoadingStats: boolean;
  error: Error | null;

  // Mutations
  createVersion: (input: CreateChainVersionInput) => Promise<ChainVersion>;
  updateVersion: (id: string, input: UpdateChainVersionInput) => Promise<ChainVersion>;
  activateVersion: (versionId: string) => Promise<ChainVersion>;
  deprecateVersion: (versionId: string) => Promise<ChainVersion>;
  archiveVersion: (versionId: string) => Promise<ChainVersion>;
  rollbackVersion: (versionId: string, reason: string) => Promise<RollbackResult>;

  // Mutation states
  isCreating: boolean;
  isUpdating: boolean;
  isActivating: boolean;
  isDeprecating: boolean;
  isArchiving: boolean;
  isRollingBack: boolean;

  // Utilities
  refetch: () => void;
  compareVersions: (idA: string, idB: string) => Promise<VersionComparison>;
}

export function useChainVersions(options: UseChainVersionsOptions = {}): UseChainVersionsReturn {
  const { toast } = useToast();
  const utils = api.useUtils();

  const { chainType = 'all', status = 'all', limit = 50, offset = 0 } = options;

  // ===========================================================================
  // Queries
  // ===========================================================================

  // Fetch all versions with filters
  const versionsQuery = api.chainVersion.list.useQuery({
    chainType: chainType === 'all' ? undefined : chainType,
    status: status === 'all' ? undefined : status,
    limit,
    offset,
  });

  // Fetch active versions for each chain type
  const scoringActiveQuery = api.chainVersion.getActive.useQuery({
    chainType: 'SCORING',
  });
  const qualificationActiveQuery = api.chainVersion.getActive.useQuery({
    chainType: 'QUALIFICATION',
  });
  const emailWriterActiveQuery = api.chainVersion.getActive.useQuery({
    chainType: 'EMAIL_WRITER',
  });
  const followupActiveQuery = api.chainVersion.getActive.useQuery({
    chainType: 'FOLLOWUP',
  });

  // Build active versions record
  const activeVersions: Record<ChainType, ChainVersionSummary | null> = {
    SCORING: (scoringActiveQuery.data?.version as ChainVersionSummary | null) ?? null,
    QUALIFICATION: (qualificationActiveQuery.data?.version as ChainVersionSummary | null) ?? null,
    EMAIL_WRITER: (emailWriterActiveQuery.data?.version as ChainVersionSummary | null) ?? null,
    FOLLOWUP: (followupActiveQuery.data?.version as ChainVersionSummary | null) ?? null,
  };

  // Fetch stats
  const statsQuery = api.chainVersion.getStats.useQuery({});

  // ===========================================================================
  // Mutations
  // ===========================================================================

  // Create version
  const createMutation = api.chainVersion.create.useMutation({
    onSuccess: () => {
      utils.chainVersion.list.invalidate();
      utils.chainVersion.getStats.invalidate();
      toast({
        title: 'Version created',
        description: 'New chain version has been created as a draft.',
      });
    },
    onError: (err: { message: string }) => {
      toast({
        title: 'Failed to create version',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  // Update version
  const updateMutation = api.chainVersion.update.useMutation({
    onSuccess: () => {
      utils.chainVersion.list.invalidate();
      toast({
        title: 'Version updated',
        description: 'Chain version has been updated successfully.',
      });
    },
    onError: (err: { message: string }) => {
      toast({
        title: 'Failed to update version',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  // Activate version
  const activateMutation = api.chainVersion.activate.useMutation({
    onSuccess: () => {
      utils.chainVersion.list.invalidate();
      utils.chainVersion.getActive.invalidate();
      utils.chainVersion.getStats.invalidate();
      toast({
        title: 'Version activated',
        description: 'Chain version is now active. Previous active version has been deprecated.',
      });
    },
    onError: (err: { message: string }) => {
      toast({
        title: 'Failed to activate version',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  // Deprecate version
  const deprecateMutation = api.chainVersion.deprecate.useMutation({
    onSuccess: () => {
      utils.chainVersion.list.invalidate();
      utils.chainVersion.getStats.invalidate();
      toast({
        title: 'Version deprecated',
        description: 'Chain version has been deprecated.',
      });
    },
    onError: (err: { message: string }) => {
      toast({
        title: 'Failed to deprecate version',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  // Archive version
  const archiveMutation = api.chainVersion.archive.useMutation({
    onSuccess: () => {
      utils.chainVersion.list.invalidate();
      utils.chainVersion.getStats.invalidate();
      toast({
        title: 'Version archived',
        description: 'Chain version has been archived.',
      });
    },
    onError: (err: { message: string }) => {
      toast({
        title: 'Failed to archive version',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  // Rollback version
  const rollbackMutation = api.chainVersion.rollback.useMutation({
    onSuccess: () => {
      utils.chainVersion.list.invalidate();
      utils.chainVersion.getActive.invalidate();
      utils.chainVersion.getStats.invalidate();
      utils.chainVersion.getAuditLog.invalidate();
      toast({
        title: 'Rollback successful',
        description: 'Chain version has been rolled back.',
      });
    },
    onError: (err: { message: string }) => {
      toast({
        title: 'Rollback failed',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  // ===========================================================================
  // Utilities
  // ===========================================================================

  const compareVersions = async (idA: string, idB: string): Promise<VersionComparison> => {
    const result = await utils.client.chainVersion.compare.query({
      versionIdA: idA,
      versionIdB: idB,
    });
    return result as VersionComparison;
  };

  // ===========================================================================
  // Return
  // ===========================================================================

  return {
    // Queries
    versions: versionsQuery.data as ChainVersionSummary[] | undefined,
    activeVersions,
    stats: statsQuery.data as ChainVersionStats | undefined,

    // Query states
    isLoading: versionsQuery.isLoading,
    isLoadingActive:
      scoringActiveQuery.isLoading ||
      qualificationActiveQuery.isLoading ||
      emailWriterActiveQuery.isLoading ||
      followupActiveQuery.isLoading,
    isLoadingStats: statsQuery.isLoading,
    error: versionsQuery.error ? new Error(versionsQuery.error.message) : null,

    // Mutations
    createVersion: async (input) => {
      return createMutation.mutateAsync(input) as Promise<ChainVersion>;
    },
    updateVersion: async (id, input) => {
      return updateMutation.mutateAsync({ versionId: id, data: input }) as Promise<ChainVersion>;
    },
    activateVersion: async (versionId) => {
      return activateMutation.mutateAsync({ versionId }) as Promise<ChainVersion>;
    },
    deprecateVersion: async (versionId) => {
      return deprecateMutation.mutateAsync({ versionId }) as Promise<ChainVersion>;
    },
    archiveVersion: async (versionId) => {
      return archiveMutation.mutateAsync({ versionId }) as Promise<ChainVersion>;
    },
    rollbackVersion: async (versionId, reason) => {
      return rollbackMutation.mutateAsync({ versionId, reason }) as Promise<RollbackResult>;
    },

    // Mutation states
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isActivating: activateMutation.isPending,
    isDeprecating: deprecateMutation.isPending,
    isArchiving: archiveMutation.isPending,
    isRollingBack: rollbackMutation.isPending,

    // Utilities
    refetch: () => {
      versionsQuery.refetch();
      scoringActiveQuery.refetch();
      qualificationActiveQuery.refetch();
      emailWriterActiveQuery.refetch();
      followupActiveQuery.refetch();
      statsQuery.refetch();
    },
    compareVersions,
  };
}

// ===========================================================================
// useVersionAudit Hook
// ===========================================================================

export interface UseVersionAuditOptions {
  versionId?: string;
  limit?: number;
}

export interface UseVersionAuditReturn {
  auditLog: ChainVersionAudit[] | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useVersionAudit(options: UseVersionAuditOptions = {}): UseVersionAuditReturn {
  const { versionId, limit = 50 } = options;

  const auditQuery = api.chainVersion.getAuditLog.useQuery(
    { versionId: versionId ?? '', limit },
    { enabled: !!versionId }
  );

  return {
    auditLog: auditQuery.data as ChainVersionAudit[] | undefined,
    isLoading: auditQuery.isLoading,
    error: auditQuery.error ? new Error(auditQuery.error.message) : null,
    refetch: () => auditQuery.refetch(),
  };
}

// ===========================================================================
// useZepBudget Hook
// ===========================================================================

export interface EpisodeBudget {
  used: number;
  remaining: number;
  total: number;
  warningThreshold: number;
  limitThreshold: number;
  isWarning: boolean;
  isLimited: boolean;
  isPersisted: boolean;
  lastSyncedAt: string | null;
}

export interface UseZepBudgetReturn {
  budget: EpisodeBudget | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
  percentUsed: number;
  budgetStatus: 'normal' | 'warning' | 'critical';
}

export function useZepBudget(): UseZepBudgetReturn {
  // Note: This requires the getZepBudget endpoint to be added to chain-version.router.ts
  // For now, we'll provide a mock implementation
  const mockBudget: EpisodeBudget = {
    used: 0,
    remaining: 1000,
    total: 1000,
    warningThreshold: 800,
    limitThreshold: 950,
    isWarning: false,
    isLimited: false,
    isPersisted: false,
    lastSyncedAt: null,
  };

  const percentUsed =
    mockBudget.total > 0 ? Math.round((mockBudget.used / mockBudget.total) * 100) : 0;

  const budgetStatus: 'normal' | 'warning' | 'critical' =
    percentUsed >= 95 ? 'critical' : percentUsed >= 80 ? 'warning' : 'normal';

  return {
    budget: mockBudget,
    isLoading: false,
    error: null,
    refetch: () => {},
    percentUsed,
    budgetStatus,
  };
}
