'use client';

/**
 * Experiment Dashboard Hooks (PG-149)
 *
 * Wraps tRPC experiment endpoints for the ExperimentsDashboard.
 */

import { api } from '@/lib/api';

/**
 * Query hook for experiment list
 */
export function useExperimentsDashboard() {
  const listQuery = api.experiment.list.useQuery(undefined, { retry: 1 });

  return {
    experiments: listQuery.data ?? [],
    isLoading: listQuery.isLoading,
    error: listQuery.error,
    refetch: listQuery.refetch,
  };
}

/**
 * Query hook for experiment statistical results
 */
export function useExperimentResults(experimentId: string) {
  return api.experiment.getResults.useQuery({ experimentId }, { enabled: !!experimentId });
}

/**
 * Mutation hooks for experiment lifecycle actions
 */
export function useExperimentActions() {
  const startMutation = api.experiment.start.useMutation();
  const pauseMutation = api.experiment.pause.useMutation();
  const completeMutation = api.experiment.complete.useMutation();
  const archiveMutation = api.experiment.archive.useMutation();

  return { startMutation, pauseMutation, completeMutation, archiveMutation };
}
