'use client';

/**
 * WorkflowToolbar — IFC-031
 *
 * Toolbar rendered inside ReactFlowProvider (Panel component).
 * Provides save, zoom, fit-view, undo/redo controls.
 * Must be rendered as a child of ReactFlowProvider — uses useReactFlow().
 */

import { useReactFlow } from '@xyflow/react';
import { Button } from '@intelliflow/ui';

export interface WorkflowToolbarProps {
  onSave: () => void;
  onAutoLayout?: () => void;
  isValid: boolean;
  isSaving: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

export function WorkflowToolbar({
  onSave,
  isValid,
  isSaving,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: WorkflowToolbarProps) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  return (
    <div className="flex items-center gap-1 bg-background/90 backdrop-blur-sm border rounded-lg px-2 py-1 shadow-sm">
      {/* Save */}
      <Button
        size="sm"
        onClick={onSave}
        disabled={!isValid || isSaving}
        aria-label="Save workflow"
        className="gap-1.5"
      >
        {isSaving ? 'Saving…' : 'Save'}
      </Button>

      <div className="w-px h-5 bg-border mx-1" />

      {/* Undo / Redo */}
      <Button
        size="sm"
        variant="ghost"
        onClick={onUndo}
        disabled={!canUndo}
        aria-label="Undo"
        title="Undo"
      >
        ↩
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={onRedo}
        disabled={!canRedo}
        aria-label="Redo"
        title="Redo"
      >
        ↪
      </Button>

      <div className="w-px h-5 bg-border mx-1" />

      {/* Zoom controls */}
      <Button
        size="sm"
        variant="ghost"
        onClick={() => void zoomIn()}
        aria-label="Zoom in"
        title="Zoom in"
      >
        +
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => void zoomOut()}
        aria-label="Zoom out"
        title="Zoom out"
      >
        −
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => void fitView()}
        aria-label="Fit view"
        title="Fit view"
      >
        ⊞
      </Button>
    </div>
  );
}
