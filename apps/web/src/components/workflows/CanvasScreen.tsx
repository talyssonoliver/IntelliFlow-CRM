'use client';

/**
 * CanvasScreen
 *
 * Fullscreen canvas layout used by /cases/case-workflows/new and
 * /cases/case-workflows/[id]. Renders a compact PageHeader row at the
 * top and fills the remaining viewport height with the ReactFlow canvas.
 *
 * The layout at apps/web/src/app/cases/case-workflows/layout.tsx already
 * suppressed the Cases sidebar for this URL; here we just lay out the
 * header + canvas edge-to-edge.
 */

import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { WorkflowCanvas } from './WorkflowCanvas';

export interface CanvasScreenProps {
  /** null for a new workflow; non-null for an edit */
  workflowId: string | null;
  /** Optional display name for an existing workflow (used in breadcrumb) */
  workflowName?: string;
}

export function CanvasScreen({ workflowId, workflowName }: CanvasScreenProps) {
  const router = useRouter();
  const isNew = workflowId === null;

  const title = isNew ? 'New workflow' : 'Edit workflow';
  const trailingCrumb = isNew
    ? { label: 'New workflow' }
    : { label: workflowName ?? 'Edit workflow' };

  const goToList = () => router.push('/cases/case-workflows');

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] w-full bg-background">
      <div className="flex-shrink-0 px-4 sm:px-6 py-4 border-b border-border">
        <PageHeader
          breadcrumbs={[
            { label: 'Cases', href: '/cases' },
            { label: 'Case Workflows', href: '/cases/case-workflows' },
            trailingCrumb,
          ]}
          title={title}
          description={
            isNew
              ? 'Drag nodes from the palette onto the canvas, then connect them to define the flow.'
              : 'Update the workflow graph. Changes take effect on save.'
          }
          actions={[
            {
              label: 'Back to workflows',
              icon: 'arrow_back',
              variant: 'secondary',
              onClick: goToList,
            },
          ]}
        />
      </div>
      <div className="flex-1 overflow-hidden">
        <WorkflowCanvas workflowId={workflowId} onBack={goToList} />
      </div>
    </div>
  );
}
