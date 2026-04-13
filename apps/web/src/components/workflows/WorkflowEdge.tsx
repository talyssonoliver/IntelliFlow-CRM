'use client';

/**
 * WorkflowEdge — custom React Flow edge with a hover-revealed delete affordance.
 *
 * Renders the default smooth-step path PLUS an interactive button at the
 * midpoint that lets the user remove the edge with a single click. Without
 * this, edge removal was only reachable via keyboard (Delete on a
 * selected edge) — a hidden affordance the user explicitly flagged.
 */

import { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  useReactFlow,
  type EdgeProps,
} from '@xyflow/react';
import { X } from 'lucide-react';

function WorkflowEdgeInner(props: EdgeProps) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    selected,
    style,
    markerEnd,
  } = props;

  const { setEdges } = useReactFlow();

  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const handleDelete = (event: React.MouseEvent | React.PointerEvent) => {
    event.stopPropagation();
    setEdges((eds) => eds.filter((e) => e.id !== id));
  };

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{
          strokeWidth: selected ? 2 : 1.5,
          stroke: selected ? '#3b82f6' : '#94a3b8',
          ...style,
        }}
      />
      <EdgeLabelRenderer>
        {/* The wrapper has `pointer-events-auto` so the inner button is
            clickable; the outer ReactFlow surface uses pointer-events-none
            on edge labels by default. The wrapper is invisible until
            hovered or when the edge is selected, and on touch it's always
            visible (touch:opacity-100). */}
        <div
          className="absolute pointer-events-auto"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
        >
          <button
            type="button"
            onClick={handleDelete}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label="Remove connection"
            className={[
              'flex h-5 w-5 items-center justify-center rounded-full',
              'bg-background border border-border shadow-sm',
              'text-muted-foreground hover:text-rose-600 hover:border-rose-300',
              'transition-opacity',
              selected ? 'opacity-100' : 'opacity-0 hover:opacity-100',
            ].join(' ')}
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export const WorkflowEdge = memo(WorkflowEdgeInner);

/** Edge type key registered with React Flow's `edgeTypes` prop. */
export const WORKFLOW_EDGE_TYPE = 'workflow-edge';

/** Map for the `edgeTypes` prop. */
export const workflowEdgeTypes = {
  [WORKFLOW_EDGE_TYPE]: WorkflowEdge,
};
