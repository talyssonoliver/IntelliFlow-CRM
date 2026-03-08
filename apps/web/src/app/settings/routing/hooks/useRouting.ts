'use client';

/**
 * useRouting Hook
 *
 * PG-132: Smart Lead Routing UI
 *
 * Provides tRPC integration for routing rule management:
 * - Fetch rules with pagination/filtering
 * - CRUD operations on routing rules
 * - Reorder, toggle active state
 * - Fetch assignments, agent workload, lead queue
 * - Manual lead assignment
 * - 30-second polling for assignments (real-time updates)
 */

import { api } from '@/lib/api';
import { useToast } from '@intelliflow/ui';

export interface UseRoutingOptions {
  isActive?: boolean;
  limit?: number;
}

export interface UseLeadQueueOptions {
  scoreMin?: number;
  source?: string;
  limit?: number;
}

export function useRouting(options: UseRoutingOptions = {}) {
  const { toast } = useToast();
  const utils = api.useUtils();

  // --- Queries ---

  const rulesQuery = api.routing.list.useQuery(
    {
      isActive: options.isActive,
      limit: options.limit ?? 20,
    },
    { refetchOnWindowFocus: false }
  );

  const assignmentsQuery = api.routing.getAssignments.useQuery(
    { limit: 20 },
    { refetchInterval: 30000 } // 30-second polling per spec
  );

  const agentWorkloadQuery = api.routing.getAgentWorkload.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  // --- Mutations ---

  // @ts-expect-error — tRPC recursive type instantiation exceeds depth limit
  const createRule = api.routing.create.useMutation({
    onSuccess: () => {
      utils.routing.list.invalidate();
      toast({ title: 'Rule created', description: 'Routing rule created successfully.' });
    },
    onError: (err) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const updateRule = api.routing.update.useMutation({
    onSuccess: () => {
      utils.routing.list.invalidate();
      toast({ title: 'Rule updated', description: 'Routing rule updated successfully.' });
    },
    onError: (err) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const deleteRule = api.routing.delete.useMutation({
    onSuccess: () => {
      utils.routing.list.invalidate();
      toast({ title: 'Rule deleted', description: 'Routing rule deleted.' });
    },
    onError: (err) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const reorderRules = api.routing.reorder.useMutation({
    onSuccess: () => {
      utils.routing.list.invalidate();
    },
    onError: (err) => {
      toast({ title: 'Reorder failed', description: err.message, variant: 'destructive' });
    },
  });

  const toggleRule = api.routing.toggle.useMutation({
    onSuccess: () => {
      utils.routing.list.invalidate();
    },
    onError: (err) => {
      toast({ title: 'Toggle failed', description: err.message, variant: 'destructive' });
    },
  });

  const assignLead = api.routing.assignLead.useMutation({
    onSuccess: () => {
      utils.routing.getAssignments.invalidate();
      utils.routing.getLeadQueue.invalidate();
      utils.routing.getAgentWorkload.invalidate();
      toast({ title: 'Lead assigned', description: 'Lead has been assigned successfully.' });
    },
    onError: (err) => {
      toast({ title: 'Assignment failed', description: err.message, variant: 'destructive' });
    },
  });

  return {
    // Queries
    rules: rulesQuery.data?.items,
    rulesLoading: rulesQuery.isLoading,
    assignments: assignmentsQuery.data?.items,
    assignmentsLoading: assignmentsQuery.isLoading,
    agentWorkload: agentWorkloadQuery.data,
    agentWorkloadLoading: agentWorkloadQuery.isLoading,

    // Mutations
    createRule,
    updateRule,
    deleteRule,
    reorderRules,
    toggleRule,
    assignLead,

    // Refetch
    refetchRules: rulesQuery.refetch,
    refetchAssignments: assignmentsQuery.refetch,
  };
}

export function useLeadQueue(options: UseLeadQueueOptions = {}) {
  return api.routing.getLeadQueue.useQuery({
    limit: options.limit ?? 20,
    scoreMin: options.scoreMin,
    source: options.source,
  });
}
