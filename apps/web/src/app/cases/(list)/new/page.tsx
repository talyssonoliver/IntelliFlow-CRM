'use client';

/**
 * New Case Page — Create case form wrapper
 *
 * Route: /cases/new (inside (list) route group for sidebar layout)
 * Matches design: docs/design/mockups/case-new.png
 */

import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Button, toast } from '@intelliflow/ui';
import { PageHeader } from '@/components/shared';
import { CaseForm } from '@/components/cases';
import { requiredKeysFromRows } from '@/components/cases/case-type-labels';
import { api } from '@/lib/api';

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export default function NewCasePage() {
  const router = useRouter();
  // PG-204: a server rejection (e.g. required fields of the case type) is shown inline as well as toasted.
  const [serverError, setServerError] = useState<string | null>(null);

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
      const { title, clientId, priority } = data;
      if (typeof title !== 'string' || typeof clientId !== 'string') {
        toast({
          title: 'Validation Error',
          description: 'Title and Client are required.',
          variant: 'destructive',
        });
        return;
      }
      setServerError(null);
      try {
        await createMutation.mutateAsync({
          title,
          clientId,
          description: optionalString(data.description),
          // PG-204: omitted when blank so the case type / Case Settings default applies.
          priority: priority as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' | undefined,
          // A calendar date: the API stores the end of that day in the case timezone.
          deadlineDate: optionalString(data.deadlineDate),
          assignedTo: optionalString(data.assignedTo),
          // PG-204: jurisdiction and timezone feed the required-field check and the SLA deadline.
          timezone: optionalString(data.timezone),
          jurisdiction: optionalString(data.jurisdiction),
          caseTypeId: optionalString(data.caseTypeId),
        });
      } catch (error) {
        // onError already toasts; keep the message next to the form and settle the submit.
        setServerError(error instanceof Error ? error.message : 'Failed to create case.');
      }
    },
    [createMutation]
  );

  const handleCancel = useCallback(() => {
    router.push('/cases');
  }, [router]);

  // PG-204: the form waits for both lists. Rendering it early would let a submit go out
  // without the default case type or the Case Settings required fields.
  const configReady = caseTypesQuery.isSuccess && requiredFieldsQuery.isSuccess;
  const configFailed = caseTypesQuery.isError || requiredFieldsQuery.isError;

  const handleRetry = useCallback(() => {
    if (caseTypesQuery.isError) void caseTypesQuery.refetch();
    if (requiredFieldsQuery.isError) void requiredFieldsQuery.refetch();
  }, [caseTypesQuery, requiredFieldsQuery]);

  let content: ReactNode;
  if (configFailed) {
    content = (
      <div className="w-full text-center py-12">
        <p className="text-red-700 dark:text-red-300 mb-4" role="alert">
          Could not load case types and required fields.
        </p>
        <Button type="button" variant="outline" onClick={handleRetry}>
          Retry
        </Button>
      </div>
    );
  } else if (configReady) {
    content = (
      <>
        {serverError && (
          <p
            role="alert"
            className="mb-4 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-red-700 dark:text-red-300"
          >
            {serverError}
          </p>
        )}
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
  } else {
    content = (
      <output className="block py-12 text-center text-muted-foreground">
        Loading case types and required fields…
      </output>
    );
  }

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
      {content}
    </>
  );
}
