'use client';

/**
 * WorkflowBuilder
 *
 * Page-level orchestrator. Owns the PageHeader (breadcrumbs + actions) for
 * both views and switches between list view and canvas view without a full
 * navigation. Shared PageHeader primitive used in both modes — no custom
 * per-screen chrome.
 */

import { useState } from 'react';
import { PageHeader } from '@/components/shared/page-header';
import { WorkflowList } from './WorkflowList';
import { WorkflowCanvas } from './WorkflowCanvas';

type ViewMode = 'list' | 'canvas';

const CASES_CRUMB = { label: 'Cases', href: '/cases' };
const WORKFLOWS_CRUMB = { label: 'Case Workflows', href: '/cases/case-workflows' };

export function WorkflowBuilder() {
  const [view, setView] = useState<ViewMode>('list');
  const [editingWorkflowId, setEditingWorkflowId] = useState<string | null>(null);

  const goToList = () => {
    setView('list');
    setEditingWorkflowId(null);
  };

  if (view === 'canvas') {
    const isNew = editingWorkflowId === null;
    const canvasTitle = isNew ? 'New workflow' : 'Edit workflow';
    return (
      <>
        <PageHeader
          breadcrumbs={[CASES_CRUMB, WORKFLOWS_CRUMB, { label: canvasTitle }]}
          title={canvasTitle}
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
        <div className="flex-1 overflow-hidden">
          <WorkflowCanvas workflowId={editingWorkflowId} onBack={goToList} />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        breadcrumbs={[CASES_CRUMB, { label: 'Case Workflows' }]}
        title="Case Workflows"
        description="Configure escalation and resolution flows."
      />
      <div className="flex-1 overflow-hidden">
        <WorkflowList
          onCreateNew={() => {
            setEditingWorkflowId(null);
            setView('canvas');
          }}
          onEdit={(id) => {
            setEditingWorkflowId(id);
            setView('canvas');
          }}
        />
      </div>
    </>
  );
}
