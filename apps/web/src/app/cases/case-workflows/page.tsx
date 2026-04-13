'use client';

/**
 * /cases/case-workflows
 *
 * List view only. Canvas (create / edit) lives at sibling routes
 *   /cases/case-workflows/new
 *   /cases/case-workflows/[id]
 * which run under the same layout but in canvas mode (fullscreen).
 */

import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { WorkflowList } from '@/components/workflows/WorkflowList';

export default function CaseWorkflowsPage() {
  const router = useRouter();

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Cases', href: '/cases' }, { label: 'Case Workflows' }]}
        title="Case Workflows"
        description="Configure escalation and resolution flows."
        actions={[
          {
            label: 'New workflow',
            icon: 'add',
            variant: 'primary',
            onClick: () => router.push('/cases/case-workflows/new'),
          },
        ]}
      />
      <WorkflowList
        onCreateNew={() => router.push('/cases/case-workflows/new')}
        onEdit={(id) => router.push(`/cases/case-workflows/${id}`)}
      />
    </>
  );
}
