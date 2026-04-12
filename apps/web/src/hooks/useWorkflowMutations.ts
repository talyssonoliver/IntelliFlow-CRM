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

// Simplified mutation shape to break deep tRPC type inference (avoids TS2589)
interface SimpleMutation<TInput> {
  mutate: (input: TInput) => void;
  isPending: boolean;
}

export function useWorkflowMutations() {
  const router = useRouter();
  const utils = api.useUtils();

  const createMutation: SimpleMutation<{
    name: string;
    category: string;
    triggerType: string;
    triggerConfig: Record<string, unknown>;
    steps: Array<{ id: number; type: string; config?: Record<string, unknown>; position?: { x: number; y: number } }>;
    edges?: Array<{ id: string; source: string; target: string; label?: string }>;
  }> = api.workflow.create.useMutation({
    onSuccess: () => {
      void utils.workflow.list.invalidate();
      router.push('/cases/case-workflows');
    },
    onError: (error: { message?: string }) => {
      toast({ title: 'Error', description: error.message ?? 'Failed to create workflow', variant: 'destructive' });
    },
  });

  const updateMutation: SimpleMutation<{
    id: string;
    name?: string;
    steps?: Array<{ id: number; type: string; config?: Record<string, unknown>; position?: { x: number; y: number } }>;
    edges?: Array<{ id: string; source: string; target: string; label?: string }>;
  }> = api.workflow.update.useMutation({
    onSuccess: () => {
      void utils.workflow.list.invalidate();
      toast({ title: 'Workflow saved' });
    },
    onError: (error: { message?: string }) => {
      toast({ title: 'Error', description: error.message ?? 'Failed to update workflow', variant: 'destructive' });
    },
  });

  const deleteMutation: SimpleMutation<{ id: string }> = api.workflow.delete.useMutation({
    onSuccess: () => {
      void utils.workflow.list.invalidate();
      toast({ title: 'Workflow deleted' });
    },
    onError: (error: { message?: string }) => {
      toast({ title: 'Error', description: error.message ?? 'Failed to delete workflow', variant: 'destructive' });
    },
  });

  const setActiveMutation: SimpleMutation<{ id: string; isActive: boolean }> = api.workflow.setActive.useMutation({
    onSuccess: () => {
      void utils.workflow.list.invalidate();
    },
    onError: (error: { message?: string }) => {
      toast({ title: 'Error', description: error.message ?? 'Failed to update workflow status', variant: 'destructive' });
    },
  });

  return {
    createMutation,
    updateMutation,
    deleteMutation,
    setActiveMutation,
  };
}
