'use client';

/**
 * ReactFlowComponent
 *
 * The inner browser-only component containing the actual React Flow canvas.
 * NEVER import this file directly — always use WorkflowCanvas.tsx which
 * wraps it with `dynamic({ ssr: false })` to prevent SSR breakage.
 *
 * Architecture:
 *   ReactFlowComponent (outer)
 *     └─ ReactFlowProvider
 *         └─ CanvasInner
 *              ├─ useReactFlow() for screenToFlowPosition etc.
 *              └─ DndContext
 *                   ├─ NodePalette                 (drag source)
 *                   └─ DroppableCanvasArea         (drop target)
 *                        └─ ReactFlow + controls + toolbar + minimap
 */

import { useState, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useReactFlow,
  Panel,
  type Node,
  type Edge,
  type OnConnect,
  type NodeTypes,
} from '@xyflow/react';
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useWorkflowCanvas, type CanvasNode, type CanvasEdge } from '@/hooks/useWorkflowCanvas';
import { useWorkflowMutations } from '@/hooks/useWorkflowMutations';
import { api } from '@/lib/api';
import { workflowNodeTypes } from './WorkflowNodeCard';
import { NodeConfigPanel } from './NodeConfigPanel';
import { NodePalette } from './NodePalette';
import { WorkflowToolbar } from './WorkflowToolbar';
import { useIsMobile } from '@/hooks/useIsMobile';
import type { WorkflowNodeType, WorkflowNodeConfig } from '@/lib/workflow-types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ReactFlowComponentProps {
  workflowId?: string | null;
  initialNodes?: CanvasNode[];
  initialEdges?: CanvasEdge[];
  onSave?: (nodes: Node[], edges: Edge[]) => void | Promise<void>;
  onBack?: () => void;
  nodes?: CanvasNode[];
  edges?: CanvasEdge[];
  isLoading?: boolean;
  onNodeClick?: (nodeId: string) => void;
  onNodesChange?: (changes: unknown) => void;
  onEdgesChange?: (changes: unknown) => void;
  onConnect?: OnConnect;
}

// Stable empty arrays — must be module-scoped so every render passes the
// SAME reference to hooks below. A `= []` default param would allocate a
// fresh array on every render, breaking the identity-compare sync effect
// in useWorkflowCanvas and causing an infinite setState loop.
const EMPTY_NODES: CanvasNode[] = [];
const EMPTY_EDGES: CanvasEdge[] = [];

/** Shared id for the ReactFlow pane droppable — referenced by tests + guards. */
const CANVAS_DROP_ZONE_ID = 'canvas-drop-zone';

/**
 * Map legacy persisted node types to the canonical 5 used by the
 * NodeConfigPanel + registry. Returns the canonical type, a possibly
 * augmented config (e.g. legacy `notify` gets `actionType: send_notification`)
 * and the display label the node card should show.
 *
 * Legacy types persist because IFC-028 and earlier seeded workflows with
 * action-style strings directly as `type` ("notify", "approval", "condition"…).
 * We keep the visual label but normalize the structural type so the
 * per-variant config form renders.
 */
function normalizeLegacyNodeType(
  rawType: string,
  rawConfig: Record<string, unknown>,
): { canonicalType: string; canonicalConfig: Record<string, unknown>; displayLabel: string } {
  const label = rawType.charAt(0).toUpperCase() + rawType.slice(1);
  switch (rawType) {
    case 'notify':
    case 'send_notification':
      return {
        canonicalType: 'action',
        canonicalConfig: { actionType: 'send_notification', ...rawConfig },
        displayLabel: rawType === 'notify' ? 'Notify' : 'Send notification',
      };
    case 'log':
    case 'log_event':
      return {
        canonicalType: 'action',
        canonicalConfig: { actionType: 'log_event', ...rawConfig },
        displayLabel: 'Log',
      };
    case 'task':
    case 'create_task':
      return {
        canonicalType: 'action',
        canonicalConfig: { actionType: 'create_task', ...rawConfig },
        displayLabel: 'Create task',
      };
    case 'webhook':
    case 'call_webhook':
      return {
        canonicalType: 'action',
        canonicalConfig: { actionType: 'call_webhook', ...rawConfig },
        displayLabel: 'Webhook',
      };
    case 'update_field':
      return {
        canonicalType: 'action',
        canonicalConfig: { actionType: 'update_field', ...rawConfig },
        displayLabel: 'Update field',
      };
    case 'trigger_workflow':
      return {
        canonicalType: 'action',
        canonicalConfig: { actionType: 'trigger_workflow', ...rawConfig },
        displayLabel: 'Trigger workflow',
      };
    case 'approval':
      return { canonicalType: 'human', canonicalConfig: rawConfig, displayLabel: 'Approval' };
    case 'condition':
      return { canonicalType: 'decision', canonicalConfig: rawConfig, displayLabel: 'Condition' };
    default:
      // Already canonical or unknown — pass through.
      return { canonicalType: rawType, canonicalConfig: rawConfig, displayLabel: label };
  }
}

// ---------------------------------------------------------------------------
// Drop-zone wrapper — makes the canvas area a valid dnd-kit target.
// ---------------------------------------------------------------------------

function DroppableCanvasArea({ children }: { children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: CANVAS_DROP_ZONE_ID });
  return (
    <div
      ref={setNodeRef}
      data-testid="canvas-drop-zone"
      className={[
        'flex-1 relative h-full min-h-[600px]',
        isOver ? 'ring-2 ring-primary/40 ring-inset' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Coordinate helper (extracted for unit-testability)
// ---------------------------------------------------------------------------

/**
 * Convert a dnd-kit DragEndEvent into screen coordinates suitable for
 * `useReactFlow().screenToFlowPosition`. Handles mouse and touch activator
 * events; returns null if no useable pointer info is attached.
 */
export function screenCoordsFromDragEvent(event: DragEndEvent): { x: number; y: number } | null {
  const activatorEvent = event.activatorEvent as MouseEvent | TouchEvent | PointerEvent | undefined;
  if (!activatorEvent) return null;

  let clientX: number | undefined;
  let clientY: number | undefined;

  if ('clientX' in activatorEvent && typeof activatorEvent.clientX === 'number') {
    clientX = activatorEvent.clientX;
    clientY = activatorEvent.clientY;
  } else if ('touches' in activatorEvent) {
    const touch = (activatorEvent as TouchEvent).touches?.[0];
    clientX = touch?.clientX;
    clientY = touch?.clientY;
  }

  if (clientX == null || clientY == null) return null;
  return {
    x: clientX + event.delta.x,
    y: clientY + event.delta.y,
  };
}

// ---------------------------------------------------------------------------
// Outer component — just sets up the ReactFlowProvider context.
// All stateful work happens in CanvasInner so it can use useReactFlow().
// ---------------------------------------------------------------------------

export function ReactFlowComponent(props: ReactFlowComponentProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}

// ---------------------------------------------------------------------------
// Inner component — runs inside ReactFlowProvider, so it can call
// useReactFlow() and map screen→flow coords for dropped palette items.
// ---------------------------------------------------------------------------

function CanvasInner({
  workflowId,
  initialNodes = EMPTY_NODES,
  initialEdges = EMPTY_EDGES,
  nodes: externalNodes,
  edges: externalEdges,
  onNodeClick: externalOnNodeClick,
  onNodesChange: externalOnNodesChange,
  onEdgesChange: externalOnEdgesChange,
  onConnect: externalOnConnect,
  onSave: externalOnSave,
}: ReactFlowComponentProps) {
  const { screenToFlowPosition } = useReactFlow();
  const isMobile = useIsMobile();

  // Sensor setup — PointerSensor handles mouse + pen, TouchSensor is
  // a separate activation path for finger input. Both get a small
  // activation delay/distance so a tap-to-scroll isn't hijacked into a
  // drag. These thresholds were tuned on a Pixel 7 emulation.
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 5 },
    }),
  );

  // ── Hydrate existing workflow when editing ──────────────────────────
  const workflowQuery = api.workflow.getById.useQuery(
    { id: workflowId! },
    { enabled: !!workflowId },
  );
  // Break deep tRPC type inference chain to avoid TS2589
  const existingWorkflow = workflowQuery.data as { steps?: unknown } | undefined;
  const isLoadingWorkflow = workflowQuery.isLoading;

  // Convert persisted steps/edges back into canvas format.
  // Storage format: { nodes: [...], edges: [...] } envelope in the `steps` JSON column.
  // Legacy format: flat array of steps (no edges).
  const existingSteps: unknown = existingWorkflow?.steps;

  const hydratedNodes = useMemo<CanvasNode[]>(() => {
    if (externalNodes) return externalNodes;
    if (!existingSteps) return initialNodes;
    const nodeArray = Array.isArray(existingSteps)
      ? existingSteps
      : (existingSteps as Record<string, unknown>)?.nodes;
    if (!Array.isArray(nodeArray)) return initialNodes;
    return nodeArray.map(
      (step: { id?: number; type?: string; config?: Record<string, unknown>; position?: { x: number; y: number } }, idx: number) => {
        const rawType = (step.type ?? 'action') as string;
        // Normalize legacy type names → canonical 5. Seeded workflows (IFC-028)
        // persisted types like "notify", "approval", "condition", etc. We keep
        // the original label for display so the card still reads "Notify" but
        // the canonical `type` drives the per-variant NodeConfigPanel form.
        const { canonicalType, canonicalConfig, displayLabel } =
          normalizeLegacyNodeType(rawType, (step.config ?? {}) as Record<string, unknown>);
        return {
          id: `node-${step.id ?? idx}`,
          type: canonicalType,
          position: step.position ?? { x: 250, y: 80 + idx * 120 },
          data: {
            label: displayLabel,
            config: canonicalConfig as WorkflowNodeConfig,
          },
        };
      },
    );
  }, [externalNodes, existingSteps, initialNodes]);

  const hydratedEdges = useMemo<CanvasEdge[]>(() => {
    if (externalEdges) return externalEdges;
    if (!existingSteps) return initialEdges;
    if (Array.isArray(existingSteps)) return initialEdges;
    const edgeArray = (existingSteps as Record<string, unknown>)?.edges;
    if (!Array.isArray(edgeArray)) return initialEdges;
    return edgeArray.map(
      (e: { id?: string; source: string; target: string; label?: string }, idx: number) => ({
        id: e.id ?? `edge-${idx}`,
        source: e.source,
        target: e.target,
        label: e.label,
      }),
    );
  }, [externalEdges, existingSteps, initialEdges]);

  const canvas = useWorkflowCanvas(hydratedNodes, hydratedEdges);

  const { createMutation, updateMutation } = useWorkflowMutations();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const selectedNode = canvas.nodes.find((n) => n.id === selectedNodeId) ?? null;

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setSelectedNodeId(node.id);
      externalOnNodeClick?.(node.id);
    },
    [externalOnNodeClick],
  );

  const handlePaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  // Drag-and-drop: NodePalette (draggable) → CanvasDropZone (droppable).
  // We map the activator's screen coords THROUGH screenToFlowPosition so
  // the dropped node lands at the pointer even after the viewport has been
  // panned or zoomed.
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over, delta } = event;
      if (!over || over.id !== CANVAS_DROP_ZONE_ID) return;

      const nodeType = active.data.current?.nodeType as WorkflowNodeType | undefined;
      if (!nodeType) return;

      const screenCoords = screenCoordsFromDragEvent(event);
      if (!screenCoords) {
        // Fallback: stack vertically if we can't resolve the pointer.
        const nodeCount = canvas.nodes.length;
        canvas.addNode(nodeType, { x: 250, y: 80 + nodeCount * 120 });
        return;
      }

      const flowPos = screenToFlowPosition(screenCoords);
      canvas.addNode(nodeType, flowPos);
      // Silence unused-var for delta — dnd-kit exposes delta on the event
      // for tests/debugging; screenCoordsFromDragEvent already factors it in.
      void delta;
    },
    [canvas, screenToFlowPosition],
  );

  // Save — create new workflow or update existing
  const handleSave = useCallback(async () => {
    if (externalOnSave) {
      await externalOnSave(canvas.nodes, canvas.edges);
      return;
    }

    const canvasIdToStepId = new Map<string, number>();
    const stepsPayload = canvas.nodes.map((n, idx) => {
      const stepId = idx + 1;
      canvasIdToStepId.set(n.id, stepId);
      return {
        id: stepId,
        type: n.type ?? 'action',
        config: (n.data.config as Record<string, unknown>) ?? {},
        position: n.position,
      };
    });

    const edgesPayload = canvas.edges.map((e) => {
      const sourceStepId = canvasIdToStepId.get(e.source);
      const targetStepId = canvasIdToStepId.get(e.target);
      return {
        id: e.id,
        source: sourceStepId != null ? `node-${sourceStepId}` : e.source,
        target: targetStepId != null ? `node-${targetStepId}` : e.target,
        ...(e.label ? { label: e.label as string } : {}),
      };
    });

    if (workflowId) {
      updateMutation.mutate({
        id: workflowId,
        steps: stepsPayload,
        edges: edgesPayload,
      });
    } else {
      createMutation.mutate({
        name: `Workflow ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`,
        category: 'custom',
        triggerType: 'manual',
        triggerConfig: {},
        steps: stepsPayload.length > 0 ? stepsPayload : [{ id: 1, type: 'action', config: {} }],
        edges: edgesPayload,
      });
    }
  }, [canvas.nodes, canvas.edges, workflowId, createMutation, updateMutation, externalOnSave]);

  const handleNodeConfigSave = useCallback(
    (newConfig: WorkflowNodeConfig) => {
      if (selectedNodeId) {
        canvas.updateNodeConfig(selectedNodeId, newConfig);
        setSelectedNodeId(null);
      }
    },
    [selectedNodeId, canvas],
  );

  const isSaving = createMutation.isPending || updateMutation.isPending;

  if (workflowId && isLoadingWorkflow) {
    return (
      <div className="flex h-full items-center justify-center bg-muted/20">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading workflow...</p>
        </div>
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex h-full w-full overflow-hidden min-h-[600px]">
        <NodePalette />

        <DroppableCanvasArea>
          {canvas.nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <p className="text-muted-foreground text-sm">
                Drag nodes from the palette to start building
              </p>
            </div>
          )}

          <ReactFlow
            nodes={canvas.nodes}
            edges={canvas.edges}
            nodeTypes={workflowNodeTypes as NodeTypes}
            onNodesChange={externalOnNodesChange ?? canvas.onNodesChange}
            onEdgesChange={externalOnEdgesChange ?? canvas.onEdgesChange}
            onConnect={externalOnConnect ?? canvas.onConnect}
            onNodeClick={handleNodeClick}
            onPaneClick={handlePaneClick}
            fitView
            className="bg-muted/20 h-full w-full"
            style={{ minHeight: 600 }}
            proOptions={{ hideAttribution: true }}
            // Mobile: disable mouse-wheel zoom (lets the page scroll naturally),
            // keep pinch-to-zoom (default). Desktop: wheel zoom on.
            zoomOnScroll={!isMobile}
            zoomOnPinch
            panOnScroll={!isMobile}
            minZoom={0.2}
            maxZoom={3}
          >
            <Background />
            <Controls />
            {!isMobile && <MiniMap />}
            <Panel position="top-right">
              <WorkflowToolbar
                onSave={handleSave}
                isValid={canvas.isValid}
                isSaving={isSaving}
                validationError={canvas.validationErrors?.[0]}
                canUndo={canvas.canUndo}
                canRedo={canvas.canRedo}
                onUndo={canvas.undo}
                onRedo={canvas.redo}
              />
            </Panel>
          </ReactFlow>
        </DroppableCanvasArea>

        {selectedNode && (
          <NodeConfigPanel
            nodeType={(selectedNode.type ?? 'action') as WorkflowNodeType}
            config={(selectedNode.data.config as WorkflowNodeConfig) ?? {}}
            onSave={handleNodeConfigSave}
            onClose={() => setSelectedNodeId(null)}
            open={true}
          />
        )}
      </div>
    </DndContext>
  );
}
