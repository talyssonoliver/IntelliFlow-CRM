'use client';

/**
 * New Case Page — Create case form wrapper
 *
 * Route: /cases/new (inside (list) route group for sidebar layout)
 * Matches design: docs/design/mockups/case-new.png
 */

import { useRouter } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { toast } from '@intelliflow/ui';
import { PageHeader } from '@/components/shared';
import { CaseForm } from '@/components/cases';
import { requiredKeysFromRows } from '@/components/cases/case-type-labels';
import { api } from '@/lib/api';

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export default function NewCasePage() {
  const router = useRouter();

  // PG-204: active case types for the picker and the Case Settings required fields.
  const caseTypesQuery = api.caseTypes.listActive.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });
  const requiredFieldsQuery = api.caseSettings.requiredFields.list.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });
  const moduleRequiredFields = useMemo(
    () => requiredKeysFromRows(requiredFieldsQuery.data),
    [requiredFieldsQuery.data]
  );

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
      const { title, clientId, priority, deadline } = data;
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
        description: optionalString(data.description),
        // PG-204: omitted when blank so the case type / Case Settings default applies.
        priority: priority as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' | undefined,
        deadline: deadline as Date | undefined,
        assignedTo: optionalString(data.assignedTo),
        // PG-204: jurisdiction and timezone feed the required-field check and the SLA deadline.
        timezone: optionalString(data.timezone),
        jurisdiction: optionalString(data.jurisdiction),
        caseTypeId: optionalString(data.caseTypeId),
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
        caseTypes={caseTypesQuery.data}
        moduleRequiredFields={moduleRequiredFields}
      />
    </>
  );
}
