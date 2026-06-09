'use client';

/**
 * CanvasScreen
 *
 * Fullscreen canvas layout used by /cases/case-workflows/new and
 * /cases/case-workflows/[id]. Owns the workflow name (editable inline)
 * and propagates it to the canvas so Save persists with the user's chosen
 * name instead of an auto-generated timestamp.
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Input, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@intelliflow/ui';
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
    { enabled: !!workflowId }
  );
  const remoteName = (workflowQuery.data as { name?: string } | undefined)?.name;

  // Local controlled state so users can type freely; seeded from the
  // remote name once it lands. Empty string for /new (placeholder shown).
  const [name, setName] = useState<string>('');
  const [editing, setEditing] = useState<boolean>(isNew);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (remoteName && !name) {
      setName(remoteName);
    }
  }, [remoteName, name]);

  // Programmatic focus on entering edit mode — replaces autoFocus attribute
  // which is flagged by jsx-a11y/no-autofocus. Only fires on transition into
  // editing, not on every re-render.
  useEffect(() => {
    if (editing) {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }
  }, [editing]);

  const trimmedName = name.trim();
  let displayName: string;
  if (trimmedName.length > 0) displayName = trimmedName;
  else if (isNew) displayName = 'New workflow';
  else displayName = remoteName ?? 'Workflow';

  const goToList = () => router.push('/cases/case-workflows');

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] w-full bg-background">
      <div className="flex-shrink-0 px-4 sm:px-6 py-4 border-b border-border">
        {/* Custom header — the title itself is the click target for rename
            (matches Notion / Figma / Linear convention). PageHeader's
            structured `title` prop forces a static h1 so we render the
            row by hand to keep the same density. */}
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-2 text-sm text-muted-foreground mb-1"
        >
          <Link href="/cases" className="hover:text-foreground transition-colors">
            Cases
          </Link>
          <span aria-hidden="true">/</span>
          <Link href="/cases/case-workflows" className="hover:text-foreground transition-colors">
            Case Workflows
          </Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page" className="text-foreground font-medium truncate">
            {displayName}
          </span>
        </nav>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            {editing ? (
              <Input
                ref={nameInputRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => setEditing(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    setEditing(false);
                  }
                  if (e.key === 'Escape') {
                    setEditing(false);
                  }
                }}
                placeholder="Untitled workflow"
                className="text-2xl md:text-3xl font-bold tracking-tight h-auto py-1 max-w-xl"
                aria-label="Workflow name"
              />
            ) : (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setEditing(true)}
                      className="text-2xl md:text-3xl font-bold tracking-tight text-foreground text-left hover:bg-muted/40 rounded px-1 -mx-1 transition-colors max-w-full truncate"
                      aria-label="Rename workflow"
                    >
                      {displayName}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Click to rename</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <p className="text-muted-foreground mt-1">
              {isNew
                ? 'Drag nodes from the palette onto the canvas, then connect them to define the flow.'
                : 'Update the workflow graph. Changes take effect on save.'}
            </p>
          </div>
          <button
            type="button"
            onClick={goToList}
            className="shrink-0 inline-flex items-center gap-2 px-3 sm:px-5 py-2 sm:py-2.5 text-sm rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-all active:scale-95"
            aria-label="Back to workflows"
          >
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            <span className="hidden sm:inline">Back to workflows</span>
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <WorkflowCanvas workflowId={workflowId} workflowName={name} onBack={goToList} />
      </div>
    </div>
  );
}
