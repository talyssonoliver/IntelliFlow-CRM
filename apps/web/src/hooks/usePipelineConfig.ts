'use client';

/**
 * usePipelineConfig Hook
 *
 * IFC-063: FLOW-007 Pipeline Stage Customization
 *
 * Provides tRPC integration for pipeline configuration:
 * - Fetch all stages (with defaults for unconfigured)
 * - Update individual stage
 * - Batch update all stages
 * - Reset to defaults
 * - Toast notifications for user feedback
 *
 * Target: <100ms save operations
 */

import { api } from '@/lib/api';
import { useToast } from '@intelliflow/ui';

export interface PipelineStage {
  id: string;
  stageKey: string;
  displayName: string;
  color: string;
  order: number;
  probability: number;
  isActive: boolean;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface UpdateStageInput {
  stage: string;
  displayName?: string;
  color?: string;
  sortOrder?: number;
  probability?: number;
  isActive?: boolean;
}

export interface UpdateAllInput {
  stages: UpdateStageInput[];
}

export function usePipelineConfig() {
  const { toast } = useToast();
  const utils = api.useUtils();

  // Fetch all pipeline stages
  const { data, isLoading, error } = api.pipelineConfig.getAll.useQuery();

  // Update single stage mutation
  const updateStageMutation = api.pipelineConfig.updateStage.useMutation({
    onSuccess: () => {
      utils.pipelineConfig.getAll.invalidate();
      toast({
        title: 'Stage updated',
        description: 'Pipeline stage has been updated successfully.',
      });
    },
    onError: (err) => {
      toast({
        title: 'Failed to update stage',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  // Batch update all stages mutation
  const updateAllMutation = api.pipelineConfig.updateAll.useMutation({
    onSuccess: () => {
      utils.pipelineConfig.getAll.invalidate();
      toast({
        title: 'Pipeline settings saved',
        description: 'All pipeline stages have been updated successfully.',
      });
    },
    onError: (err) => {
      toast({
        title: 'Failed to save settings',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  // Reset to defaults mutation
  const resetMutation = api.pipelineConfig.resetToDefaults.useMutation({
    onSuccess: () => {
      utils.pipelineConfig.getAll.invalidate();
      toast({
        title: 'Pipeline reset',
        description: 'Pipeline has been reset to default settings.',
      });
    },
    onError: (err) => {
      toast({
        title: 'Failed to reset',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  return {
    // Data
    stages: (data?.stages ?? []) as PipelineStage[],
    isLoading,
    error,

    // Mutations
    updateStage: updateStageMutation.mutate,
    updateStageAsync: updateStageMutation.mutateAsync,
    updateAll: updateAllMutation.mutate,
    updateAllAsync: updateAllMutation.mutateAsync,
    resetToDefaults: resetMutation.mutate,
    resetToDefaultsAsync: resetMutation.mutateAsync,

    // States
    isSaving: updateStageMutation.isPending || updateAllMutation.isPending,
    isResetting: resetMutation.isPending,
  };
}
