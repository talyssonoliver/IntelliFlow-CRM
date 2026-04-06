'use client';

/**
 * New Case Page — Create case form wrapper
 *
 * Route: /cases/new (inside (list) route group for sidebar layout)
 * Matches design: docs/design/mockups/case-new.png
 */

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { toast } from '@intelliflow/ui';
import { PageHeader } from '@/components/shared';
import { CaseForm } from '@/components/cases';
import { api } from '@/lib/api';

export default function NewCasePage() {
  const router = useRouter();

  const createMutation = api.cases.create.useMutation({
    onSuccess: (data: { id: string }) => {
      toast({ title: 'Case Created', description: 'Your case has been created successfully.' });
      router.push(`/cases/${data.id}`);
    },
    onError: (error: { message: string }) => {
      toast({ title: 'Failed to create case', description: error.message, variant: 'destructive' });
    },
  });

  const handleSubmit = useCallback(
    async (data: Record<string, unknown>) => {
      // CaseForm populates title and clientId — validate before calling typed mutation
      const { title, clientId, description, priority, deadline, assignedTo } = data;
      if (typeof title !== 'string' || typeof clientId !== 'string') {
        toast({
          title: 'Validation Error',
          description: 'Title and Client are required.',
          variant: 'destructive',
        });
        return;
      }
      await createMutation.mutateAsync({
        title,
        clientId,
        description: typeof description === 'string' ? description : undefined,
        priority: priority as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' | undefined,
        deadline: deadline as Date | undefined,
        assignedTo: typeof assignedTo === 'string' ? assignedTo : undefined,
      });
    },
    [createMutation]
  );

  const handleCancel = useCallback(() => {
    router.push('/cases');
  }, [router]);

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Cases', href: '/cases' },
          { label: 'Create New Case' },
        ]}
        title="Create New Case"
        description="Create a new legal case for management and tracking."
      />
      <CaseForm
        mode="create"
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isSubmitting={createMutation.isPending}
      />
    </>
  );
}
