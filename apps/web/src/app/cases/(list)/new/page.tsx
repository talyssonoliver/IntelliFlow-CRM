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

/** Typed escape-hatch for the cases tRPC namespace (TS2589 deep type instantiation workaround). */
interface CasesApiEscape {
  cases?: {
    create?: {
      useMutation?: (opts: {
        onSuccess: (data: { id: string }) => void;
        onError: (error: { message: string }) => void;
      }) => {
        mutateAsync: (data: Record<string, unknown>) => Promise<Record<string, unknown>>;
        isPending: boolean;
      };
    };
  };
}

const casesApi = api as unknown as CasesApiEscape;

export default function NewCasePage() {
  const router = useRouter();

  // Cast to avoid TS2589 deep type instantiation with tRPC inference
  const createMutation = casesApi.cases?.create?.useMutation?.({
    onSuccess: (data: { id: string }) => {
      toast({ title: 'Case Created', description: 'Your case has been created successfully.' });
      router.push(`/cases/${data.id}`);
    },
    onError: (error: { message: string }) => {
      toast({ title: 'Failed to create case', description: error.message, variant: 'destructive' });
    },
  }) ?? { mutateAsync: async () => ({}), isPending: false };

  const handleSubmit = useCallback(async (data: Record<string, unknown>) => {
    await createMutation.mutateAsync(data);
  }, [createMutation]);

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
        description="Log a new support ticket or customer inquiry into the CRM system."
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
