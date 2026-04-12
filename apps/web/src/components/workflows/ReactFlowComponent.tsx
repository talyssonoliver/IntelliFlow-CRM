'use client';

/**
 * ReactFlowComponent — IFC-031
 *
 * The inner browser-only component containing the actual React Flow canvas.
 * NEVER import this file directly — always use WorkflowCanvas.tsx which
 * wraps it with `dynamic({ ssr: false })` to prevent SSR breakage.
 *
 * Architecture:
 * - DndContext wraps the full layout (palette + canvas)
 * - ReactFlowProvider provides useReactFlow() to WorkflowToolbar
 * - ReactFlow is the actual canvas
 * - NodePalette is the drag source
 * - NodeConfigPanel opens as a Sheet when a node is clicked
 */

import { useState, useCallback, useMemo, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  Panel,
  type Node,
  type Edge,
  type OnConnect,
  type NodeTypes,
} from '@xyflow/react';
import { DndContext, type DragEndEvent } from '@dnd-kit/core';
import { useWorkflowCanvas, type CanvasNode, type CanvasEdge } from '@/hooks/useWorkflowCanvas';
import { useWorkflowMutations } from '@/hooks/useWorkflowMutations';
import { api } from '@/lib/api';
import { workflowNodeTypes } from './WorkflowNodeCard';
import { NodeConfigPanel } from './NodeConfigPanel';
import { NodePalette } from './NodePalette';
import { WorkflowToolbar } from './WorkflowToolbar';
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReactFlowComponent({
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
    // Detect envelope vs legacy flat array
    const nodeArray = Array.isArray(existingSteps)
      ? existingSteps // legacy: steps is a flat array
      : (existingSteps as Record<string, unknown>)?.nodes; // new envelope
    if (!Array.isArray(nodeArray)) return initialNodes;
    return nodeArray.map(
      (step: { id?: number; type?: string; config?: Record<string, unknown>; position?: { x: number; y: number } }, idx: number) => ({
        id: `node-${step.id ?? idx}`,
        type: (step.type ?? 'action') as string,
        position: step.position ?? { x: 250, y: 80 + idx * 120 },
        data: {
          label: (step.type ?? 'action').charAt(0).toUpperCase() + (step.type ?? 'action').slice(1),
          config: (step.config ?? {}) as WorkflowNodeConfig,
        },
      }),
    );
  }, [externalNodes, existingSteps, initialNodes]);

  const hydratedEdges = useMemo<CanvasEdge[]>(() => {
    if (externalEdges) return externalEdges;
    if (!existingSteps) return initialEdges;
    // Legacy flat arrays had no edges
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

  // All hooks MUST be called before any early return (React rules of hooks)
  const { createMutation, updateMutation } = useWorkflowMutations();
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const selectedNode = canvas.nodes.find((n) => n.id === selectedNodeId) ?? null;

  // When a node is clicked, open config panel
  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setSelectedNodeId(node.id);
      externalOnNodeClick?.(node.id);
    },
    [externalOnNodeClick],
  );

  // When pane (background) is clicked, deselect
  const handlePaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  // Handle drag-and-drop from NodePalette onto canvas
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) return;

      const nodeType = active.data.current?.nodeType as WorkflowNodeType | undefined;
      if (!nodeType) return;

      // Convert drag-end coordinates to canvas-relative position
      const containerRect = canvasContainerRef.current?.getBoundingClientRect();
      const activatorEvent = event.activatorEvent as MouseEvent | TouchEvent | undefined;
      let position: { x: number; y: number };

      if (containerRect && activatorEvent) {
        // Compute where the pointer actually ended up, relative to the canvas container
        const clientX = 'clientX' in activatorEvent
          ? activatorEvent.clientX
          : activatorEvent.touches?.[0]?.clientX ?? 0;
        const clientY = 'clientY' in activatorEvent
          ? activatorEvent.clientY
          : activatorEvent.touches?.[0]?.clientY ?? 0;
        position = {
          x: clientX + event.delta.x - containerRect.left,
          y: clientY + event.delta.y - containerRect.top,
        };
      } else {
        // Fallback: stack nodes vertically based on count
        const nodeCount = canvas.nodes.length;
        position = { x: 250, y: 80 + nodeCount * 120 };
      }

      canvas.addNode(nodeType, position);
    },
    [canvas],
  );

  // Save — create new workflow or update existing
  const handleSave = useCallback(async () => {
    if (externalOnSave) {
      await externalOnSave(canvas.nodes, canvas.edges);
      return;
    }

    // Build stable step IDs and a mapping from canvas IDs → persisted IDs
    // so that edge endpoints stay consistent with node identifiers.
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

    // Remap edge source/target from canvas IDs to the `node-{stepId}` format
    // that the server validator and hydration path both expect.
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

  // Save node config from panel
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

  // Show loading state while fetching existing workflow (after all hooks)
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
    <DndContext onDragEnd={handleDragEnd}>
      <div className="flex h-full w-full overflow-hidden min-h-[600px]">
        <NodePalette />

        <ReactFlowProvider>
          <div ref={canvasContainerRef} className="flex-1 relative h-full min-h-[600px]">
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
            >
              <Background />
              <Controls />
              <MiniMap />
              <Panel position="top-right">
                <WorkflowToolbar
                  onSave={handleSave}
                  isValid={canvas.isValid}
                  isSaving={isSaving}
                  canUndo={canvas.canUndo}
                  canRedo={canvas.canRedo}
                  onUndo={canvas.undo}
                  onRedo={canvas.redo}
                />
              </Panel>
            </ReactFlow>
          </div>

          {selectedNode && (
            <NodeConfigPanel
              nodeType={(selectedNode.type ?? 'action') as WorkflowNodeType}
              config={(selectedNode.data.config as WorkflowNodeConfig) ?? {}}
              onSave={handleNodeConfigSave}
              onClose={() => setSelectedNodeId(null)}
              open={true}
            />
          )}
        </ReactFlowProvider>
      </div>
    </DndContext>
  );
}
