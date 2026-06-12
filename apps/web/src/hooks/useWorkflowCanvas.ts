'use client';

/**
 * useWorkflowCanvas — IFC-031
 *
 * Canvas state management hook for the workflow builder.
 * Wraps @xyflow/react state hooks, adds undo/redo history,
 * and runs topology validation on every change.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
} from '@xyflow/react';
import { validateWorkflowTopology } from '@/lib/workflow-builder/validation';
import type { WorkflowNodeConfig } from '@/lib/workflow-types';

// Re-export xyflow types under the canvas interface
export type CanvasNode = Node<{ label: string; config: WorkflowNodeConfig }>;
export type CanvasEdge = Edge;

const MAX_HISTORY = 50;

/**
 * Pick the auto-link source node when adding a new node at `position`.
 * Exported for unit testing (the hook itself cannot be renderHook'd due to
 * @xyflow/react OOM in jsdom — see useWorkflowCanvas.test.ts).
 */
export function pickAutoLinkSource(
  nodes: Array<{ id: string; type?: string; position: { x: number; y: number } }>,
  position: { x: number; y: number }
): (typeof nodes)[0] | null {
  if (nodes.length === 0) return null;
  const candidates = nodes.filter((n) => n.type !== 'end' && n.position.y < position.y);
  const source =
    candidates.length > 0
      ? candidates.reduce(
          (best, n) => (position.y - n.position.y < position.y - best.position.y ? n : best),
          candidates[0]
        )
      : nodes[nodes.length - 1];
  return source && source.type !== 'end' ? source : null;
}

interface HistoryEntry {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

export function useWorkflowCanvas(
  initialNodes: CanvasNode[] = [],
  initialEdges: CanvasEdge[] = []
) {
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<CanvasEdge>(initialEdges);

  // Sync internal state when initial values change (e.g. after async query resolves).
  // useNodesState/useEdgesState only use their argument on first mount, so we
  // must push updated values via the setter when the hydrated data arrives.
  //
  // IMPORTANT: the guard must be CONTENT equality, not reference equality.
  // Callers often pass freshly-allocated arrays (default param, useMemo
  // output) even when nothing has actually changed — a reference check would
  // trigger setNodes every render and infinite-loop React.
  const prevInitialNodesRef = useRef(initialNodes);
  const prevInitialEdgesRef = useRef(initialEdges);

  useEffect(() => {
    const prev = prevInitialNodesRef.current;
    // Content hash includes id, type, position, and a stable serialization
    // of `data.config` so that a background refetch returning the same node
    // ids with updated configs / positions actually triggers re-hydration.
    // (Audit finding 2026-04-14: previous id+type-only check left stale
    // canvases when the upstream config changed.)
    const sameContent =
      prev.length === initialNodes.length &&
      prev.every((n, i) => {
        const next = initialNodes[i];
        if (n.id !== next.id || n.type !== next.type) return false;
        if (n.position?.x !== next.position?.x || n.position?.y !== next.position?.y) return false;
        return JSON.stringify(n.data?.config ?? null) === JSON.stringify(next.data?.config ?? null);
      });
    if (!sameContent) {
      prevInitialNodesRef.current = initialNodes;
      setNodes(initialNodes);
    }
  }, [initialNodes, setNodes]);

  useEffect(() => {
    const prev = prevInitialEdgesRef.current;
    const sameContent =
      prev.length === initialEdges.length &&
      prev.every(
        (e, i) =>
          e.id === initialEdges[i].id &&
          e.source === initialEdges[i].source &&
          e.target === initialEdges[i].target &&
          (e.label ?? null) === (initialEdges[i].label ?? null)
      );
    if (!sameContent) {
      prevInitialEdgesRef.current = initialEdges;
      setEdges(initialEdges);
    }
  }, [initialEdges, setEdges]);

  // Undo / redo history stacks
  const [undoStack, setUndoStack] = useState<HistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryEntry[]>([]);

  // Push current state to undo stack before mutation
  const pushHistory = useCallback((currentNodes: CanvasNode[], currentEdges: CanvasEdge[]) => {
    setUndoStack((prev) => {
      const next = [...prev, { nodes: currentNodes, edges: currentEdges }];
      return next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next;
    });
    setRedoStack([]);
  }, []);

  // History-aware wrappers for node changes
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChange(changes as NodeChange<CanvasNode>[]);
    },
    [onNodesChange]
  );

  // History-aware wrappers for edge changes
  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      onEdgesChange(changes);
    },
    [onEdgesChange]
  );

  // Connect two nodes (called by ReactFlow onConnect)
  const onConnect = useCallback(
    (connection: Connection) => {
      pushHistory(nodes, edges);
      setEdges((eds) => addEdge(connection, eds));
    },
    [nodes, edges, pushHistory, setEdges]
  );

  // Add a new node at a given canvas position.
  //
  // UX behaviour: the new node is auto-linked to the previously-added node
  // so users don't have to manually draw edges for sequential flows — the
  // common case. The "previous node" is whichever node is visually closest
  // above the new one's position (smallest Y delta among nodes above),
  // falling back to the most-recently-added node if no node is above. The
  // first node added is not linked (nothing to link to).
  //
  // Edges are still editable/removable from the UI, so auto-link is a
  // convenience, not a constraint.
  const addNode = useCallback(
    (nodeType: string, position: { x: number; y: number }) => {
      pushHistory(nodes, edges);
      const id = `node-${Date.now()}`;
      const newNode: CanvasNode = {
        id,
        type: nodeType,
        position,
        data: {
          label: nodeType.charAt(0).toUpperCase() + nodeType.slice(1),
          config: {},
        },
      };
      setNodes((nds) => [...nds, newNode]);

      // Auto-link: use pickAutoLinkSource (exported for unit tests) to find
      // the nearest node above the new position, or fall back to the last node.
      // istanbul ignore next — hook callbacks cannot be unit-tested via renderHook
      // (OOM from @xyflow/react in jsdom); logic is covered by pickAutoLinkSource tests.
      /* istanbul ignore next */
      const autoSource = pickAutoLinkSource(nodes, position);
      /* istanbul ignore next */
      if (autoSource) {
        setEdges((eds) =>
          addEdge({ source: autoSource.id, target: id, id: `edge-${Date.now()}` }, eds)
        );
      }
    },
    [nodes, edges, pushHistory, setNodes, setEdges]
  );

  // Remove a node (and its connected edges)
  const removeNode = useCallback(
    (nodeId: string) => {
      pushHistory(nodes, edges);
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    },
    [nodes, edges, pushHistory, setNodes, setEdges]
  );

  // Update the config data on an existing node
  const updateNodeConfig = useCallback(
    (nodeId: string, config: WorkflowNodeConfig) => {
      pushHistory(nodes, edges);
      setNodes((nds) =>
        nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, config } } : n))
      );
    },
    [nodes, edges, pushHistory, setNodes]
  );

  // Undo last action
  const undo = useCallback(() => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setRedoStack((redo) => [...redo, { nodes, edges }]);
      setNodes(last.nodes);
      setEdges(last.edges);
      return prev.slice(0, -1);
    });
  }, [nodes, edges, setNodes, setEdges]);

  // Redo last undone action
  const redo = useCallback(() => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setUndoStack((undo) => [...undo, { nodes, edges }]);
      setNodes(last.nodes);
      setEdges(last.edges);
      return prev.slice(0, -1);
    });
  }, [nodes, edges, setNodes, setEdges]);

  // Run topology validation
  const validationResult = validateWorkflowTopology(
    nodes.map((n) => ({ id: n.id, type: n.type ?? 'action', data: n.data })),
    edges.map((e) => ({ id: e.id, source: e.source, target: e.target }))
  );

  return {
    nodes,
    edges,
    onNodesChange: handleNodesChange,
    onEdgesChange: handleEdgesChange,
    onConnect,
    addNode,
    removeNode,
    updateNodeConfig,
    undo,
    redo,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    isValid: validationResult.isValid,
    validationErrors: validationResult.errors,
  };
}
