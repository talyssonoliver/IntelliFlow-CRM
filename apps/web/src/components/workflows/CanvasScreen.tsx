'use client';

/**
 * CanvasScreen
 *
 * Fullscreen canvas layout used by /cases/case-workflows/new and
 * /cases/case-workflows/[id]. Owns the workflow name (editable inline)
 * and propagates it to the canvas so Save persists with the user's chosen
 * name instead of an auto-generated timestamp.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil } from 'lucide-react';
import { Input } from '@intelliflow/ui';
import { PageHeader } from '@/components/shared/page-header';
import { WorkflowCanvas } from './WorkflowCanvas';
import { api } from '@/lib/api';

export interface CanvasScreenProps {
  /** null for a new workflow; non-null for an edit */
  workflowId: string | null;
}

export function CanvasScreen({ workflowId }: CanvasScreenProps) {
  const router = useRouter();
  const isNew = workflowId === null;

  // Hydrate the existing workflow's name on edit so the input shows it.
  // The query is `enabled` only when we have an id; disabled for /new.
  const workflowQuery = api.workflow.getById.useQuery(
    { id: workflowId! },
    { enabled: !!workflowId },
  );
  const remoteName = (workflowQuery.data as { name?: string } | undefined)?.name;

  // Local controlled state so users can type freely; seeded from the
  // remote name once it lands. Empty string for /new (placeholder shown).
  const [name, setName] = useState<string>('');
  const [editing, setEditing] = useState<boolean>(isNew);

  useEffect(() => {
    if (remoteName && !name) {
      setName(remoteName);
    }
  }, [remoteName, name]);

  const displayName = name.trim().length > 0
    ? name.trim()
    : isNew
      ? 'New workflow'
      : (remoteName ?? 'Workflow');

  const goToList = () => router.push('/cases/case-workflows');

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] w-full bg-background">
      <div className="flex-shrink-0 px-4 sm:px-6 py-4 border-b border-border">
        <PageHeader
          breadcrumbs={[
            { label: 'Cases', href: '/cases' },
            { label: 'Case Workflows', href: '/cases/case-workflows' },
            { label: displayName },
          ]}
          // PageHeader title is just the literal string; the editable input
          // below sits inside `children` so it shares the same row layout.
          title={editing ? '' : displayName}
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
        >
          {editing ? (
            <div className="mt-2 flex items-center gap-2">
              <label htmlFor="workflow-name" className="sr-only">
                Workflow name
              </label>
              <Input
                id="workflow-name"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => {
                  if (name.trim().length > 0) setEditing(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && name.trim().length > 0) {
                    e.preventDefault();
                    setEditing(false);
                  }
                  if (e.key === 'Escape') {
                    setEditing(false);
                  }
                }}
                placeholder={isNew ? 'Untitled workflow' : displayName}
                className="text-2xl md:text-3xl font-bold tracking-tight max-w-xl"
                aria-label="Workflow name"
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label="Edit workflow name"
              className="mt-1 inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
              <span className="text-sm">Rename</span>
            </button>
          )}
        </PageHeader>
      </div>
      <div className="flex-1 overflow-hidden">
        <WorkflowCanvas
          workflowId={workflowId}
          workflowName={name}
          onBack={goToList}
        />
      </div>
    </div>
  );
}
