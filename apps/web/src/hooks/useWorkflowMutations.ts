'use client';

/**
 * useWorkflowMutations — IFC-031
 *
 * tRPC mutation hooks for workflow CRUD operations.
 * Wraps create/update/delete/setActive procedures with success/error handlers.
 */

import { useRouter } from 'next/navigation';
import { toast } from '@intelliflow/ui';
import { api } from '@/lib/api';

export function useWorkflowMutations() {
  const router = useRouter();
  const utils = api.useUtils();

  const createMutation = api.workflow.create.useMutation({
    onSuccess: () => {
      router.push('/cases/case-workflows');
      return utils.workflow.list.invalidate();
    },
    onError: (error: { message?: string }) => {
      toast({
        title: 'Error',
        description: error.message ?? 'Failed to create workflow',
        variant: 'destructive',
      });
    },
  });

  const updateMutation = api.workflow.update.useMutation({
    // Invalidate BOTH the list (so the row re-renders with the new step
    // count / updatedAt) AND the single-workflow cache (so revisiting the
    // edit screen reflects the just-saved graph, not the stale one).
    onSuccess: (_data: unknown, variables: { id: string }) => {
      toast({ title: 'Workflow saved' });
      return Promise.all([
        utils.workflow.list.invalidate(),
        utils.workflow.getById.invalidate({ id: variables.id }),
      ]);
    },
    onError: (error: { message?: string }) => {
      toast({
        title: 'Error',
        description: error.message ?? 'Failed to update workflow',
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = api.workflow.delete.useMutation({
    onSuccess: () => {
      toast({ title: 'Workflow deleted' });
      return utils.workflow.list.invalidate();
    },
    onError: (error: { message?: string }) => {
      toast({
        title: 'Error',
        description: error.message ?? 'Failed to delete workflow',
        variant: 'destructive',
      });
    },
  });

  const setActiveMutation = api.workflow.setActive.useMutation({
    onSuccess: () => utils.workflow.list.invalidate(),
    onError: (error: { message?: string }) => {
      toast({
        title: 'Error',
        description: error.message ?? 'Failed to update workflow status',
        variant: 'destructive',
      });
    },
  });

  return {
    createMutation,
    updateMutation,
    deleteMutation,
    setActiveMutation,
  };
}
