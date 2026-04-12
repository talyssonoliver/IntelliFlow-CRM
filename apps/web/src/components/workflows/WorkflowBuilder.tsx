'use client';

/**
 * WorkflowBuilder — IFC-031
 *
 * Page-level orchestrator component. Switches between list view and
 * canvas (editor) view. Rendered by the case-workflows page.
 */

import { useState } from 'react';
import { WorkflowList } from './WorkflowList';
import { WorkflowCanvas } from './WorkflowCanvas';
import { Button } from '@intelliflow/ui';

type ViewMode = 'list' | 'canvas';

export function WorkflowBuilder() {
  const [view, setView] = useState<ViewMode>('list');
  const [editingWorkflowId, setEditingWorkflowId] = useState<string | null>(null);

  if (view === 'canvas') {
    return (
      <div className="flex flex-col h-full">
        {/* Back navigation */}
        <div className="flex items-center gap-2 px-4 py-2 border-b bg-background">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setView('list');
              setEditingWorkflowId(null);
            }}
            aria-label="Back to workflow list"
          >
            ← Back
          </Button>
          <span className="text-sm text-muted-foreground">
            {editingWorkflowId ? 'Edit Workflow' : 'New Workflow'}
          </span>
        </div>

        {/* Canvas */}
        <div className="flex-1 overflow-hidden">
          <WorkflowCanvas
            workflowId={editingWorkflowId}
            onBack={() => {
              setView('list');
              setEditingWorkflowId(null);
            }}
          />
        </div>
      </div>
    );
  }

  return (
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
  );
}
