'use client';

/**
 * WorkflowToolbar
 *
 * Toolbar rendered inside ReactFlowProvider (Panel component). Provides
 * save, undo/redo, zoom+, zoom-, and fit-view. Uses the design-system
 * Button + Tooltip primitives and lucide icons so it matches the rest
 * of the app and so disabled states explain themselves on hover.
 */

import { Panel, useReactFlow } from '@xyflow/react';
import { Save, Undo2, Redo2, ZoomIn, ZoomOut, Maximize, Loader2 } from 'lucide-react';
import { Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@intelliflow/ui';
import { useIsMobile } from '@/hooks/useIsMobile';

export interface WorkflowToolbarProps {
  onSave: () => void;
  onAutoLayout?: () => void;
  isValid: boolean;
  isSaving: boolean;
  /** First validation error, shown on the Save tooltip when !isValid */
  validationError?: string;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

interface IconActionProps {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  disabledReason?: string;
}

function IconAction({ label, icon, onClick, disabled, disabledReason }: IconActionProps) {
  const hoverText = disabled && disabledReason ? disabledReason : label;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* span wrapper keeps the tooltip target clickable even when the
            inner button is disabled (disabled buttons don't fire events) */}
        <span className="inline-flex">
          <Button
            size="sm"
            variant="ghost"
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
            className="h-8 w-8 p-0"
          >
            {icon}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom">{hoverText}</TooltipContent>
    </Tooltip>
  );
}

export function WorkflowToolbar({
  onSave,
  isValid,
  isSaving,
  validationError,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: WorkflowToolbarProps) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const isMobile = useIsMobile();

  const saveDisabled = !isValid || isSaving;
  const saveTooltip = isSaving
    ? 'Saving…'
    : !isValid
      ? (validationError ?? 'Connect every node between a Start and an End before saving.')
      : 'Save workflow';

  const pillContent = (
    <TooltipProvider delayDuration={200}>
      <div
        className="flex items-center gap-1 bg-background/95 backdrop-blur-sm border border-border rounded-full px-1.5 py-1 shadow-lg"
        data-testid="workflow-toolbar"
        data-variant={isMobile ? 'mobile' : 'desktop'}
      >
        {/* Save */}
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <Button
                size="sm"
                onClick={onSave}
                disabled={saveDisabled}
                aria-label="Save workflow"
                className="gap-1.5 h-8"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Save className="h-4 w-4" aria-hidden="true" />
                )}
                {isSaving ? 'Saving…' : 'Save'}
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">{saveTooltip}</TooltipContent>
        </Tooltip>

        <div className="w-px h-5 bg-border mx-1" aria-hidden="true" />

        {/* Undo / Redo */}
        <IconAction
          label="Undo"
          icon={<Undo2 className="h-4 w-4" aria-hidden="true" />}
          onClick={onUndo}
          disabled={!canUndo}
          disabledReason="Nothing to undo"
        />
        <IconAction
          label="Redo"
          icon={<Redo2 className="h-4 w-4" aria-hidden="true" />}
          onClick={onRedo}
          disabled={!canRedo}
          disabledReason="Nothing to redo"
        />

        <div className="w-px h-5 bg-border mx-1" aria-hidden="true" />

        {/* Zoom controls */}
        <IconAction
          label="Zoom in"
          icon={<ZoomIn className="h-4 w-4" aria-hidden="true" />}
          onClick={() => void zoomIn()}
        />
        <IconAction
          label="Zoom out"
          icon={<ZoomOut className="h-4 w-4" aria-hidden="true" />}
          onClick={() => void zoomOut()}
        />
        <IconAction
          label="Fit view"
          icon={<Maximize className="h-4 w-4" aria-hidden="true" />}
          onClick={() => void fitView()}
        />
      </div>
    </TooltipProvider>
  );

  if (isMobile) {
    // Floating bottom-center FAB row. Render outside the ReactFlow
    // <Panel> so it escapes the canvas padding and lives above the
    // keyboard/drawer layer on small screens.
    return (
      <div
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 pointer-events-auto"
        data-testid="workflow-toolbar-mobile-wrap"
      >
        {pillContent}
      </div>
    );
  }

  return <Panel position="top-right">{pillContent}</Panel>;
}
