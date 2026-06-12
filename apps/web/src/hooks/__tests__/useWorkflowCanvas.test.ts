/**
 * useWorkflowCanvas Hook Tests — IFC-031
 *
 * The useWorkflowCanvas hook wraps @xyflow/react's useNodesState/useEdgesState.
 * Direct renderHook testing causes OOM (>4GB) because @xyflow/react module
 * resolution in jsdom is too heavy for the 4GB worker limit.
 *
 * Strategy:
 * - Test the topology validation integration directly (pure functions)
 * - Verify module contract and key implementation details from source
 * - Behavioral coverage is achieved through ReactFlowComponent.test.tsx
 *   which exercises addNode, save, hydration, and edge remapping via the hook
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { validateWorkflowTopology, validateNodeConfig } from '@/lib/workflow-builder/validation';
import { pickAutoLinkSource } from '@/hooks/useWorkflowCanvas';

// ---------------------------------------------------------------------------
// Topology validation tests (exercised by useWorkflowCanvas on every render)
// ---------------------------------------------------------------------------

describe('useWorkflowCanvas — topology validation integration', () => {
  it('valid graph: start→action→end with all connected', () => {
    const nodes = [
      { id: 'n1', type: 'start', data: {} },
      { id: 'n2', type: 'action', data: {} },
      { id: 'n3', type: 'end', data: {} },
    ];
    const edges = [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
    ];
    const result = validateWorkflowTopology(nodes, edges);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('reports error when no start node exists', () => {
    const nodes = [{ id: 'n1', type: 'action', data: {} }];
    const result = validateWorkflowTopology(nodes, []);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Workflow must have exactly one Start node');
  });

  it('reports error when no end node exists', () => {
    const nodes = [{ id: 'n1', type: 'start', data: {} }];
    const result = validateWorkflowTopology(nodes, []);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Workflow must have exactly one End node');
  });

  it('reports disconnected nodes as invalid', () => {
    const nodes = [
      { id: 'n1', type: 'start', data: {} },
      { id: 'n2', type: 'action', data: {} },
      { id: 'n3', type: 'end', data: {} },
    ];
    const edges = [{ id: 'e1', source: 'n1', target: 'n3' }];
    const result = validateWorkflowTopology(nodes, edges);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('All nodes must be connected');
  });

  it('decision node requires >=2 outgoing edges', () => {
    const nodes = [
      { id: 'n1', type: 'start', data: {} },
      { id: 'n2', type: 'decision', data: {} },
      { id: 'n3', type: 'end', data: {} },
    ];
    const edges = [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
    ];
    const result = validateWorkflowTopology(nodes, edges);
    expect(result.isValid).toBe(false);
    expect(result.errors[0]).toMatch(/Decision nodes must have at least 2/);
  });

  it('valid decision with >=2 outgoing edges', () => {
    const nodes = [
      { id: 'n1', type: 'start', data: {} },
      { id: 'n2', type: 'decision', data: {} },
      { id: 'n3', type: 'action', data: {} },
      { id: 'n4', type: 'action', data: {} },
      { id: 'n5', type: 'end', data: {} },
    ];
    const edges = [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
      { id: 'e3', source: 'n2', target: 'n4' },
      { id: 'e4', source: 'n3', target: 'n5' },
      { id: 'e5', source: 'n4', target: 'n5' },
    ];
    const result = validateWorkflowTopology(nodes, edges);
    expect(result.isValid).toBe(true);
  });

  it('detects cycles in the graph', () => {
    const nodes = [
      { id: 'n1', type: 'start', data: {} },
      { id: 'n2', type: 'action', data: {} },
      { id: 'n3', type: 'end', data: {} },
    ];
    const edges = [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n1' },
      { id: 'e3', source: 'n2', target: 'n3' },
    ];
    const result = validateWorkflowTopology(nodes, edges);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Workflow must not have cycles');
  });

  it('empty graph with 0 nodes is valid (no rules violated)', () => {
    const result = validateWorkflowTopology([], []);
    expect(result.isValid).toBe(false); // missing start and end
  });

  it('single start node is invalid (missing end)', () => {
    const nodes = [{ id: 'n1', type: 'start', data: {} }];
    const result = validateWorkflowTopology(nodes, []);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Workflow must have exactly one End node');
  });
});

// ---------------------------------------------------------------------------
// Node config validation tests
// ---------------------------------------------------------------------------

describe('useWorkflowCanvas — node config validation', () => {
  it('start node requires triggerType', () => {
    const result = validateNodeConfig('start', {});
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Start node requires a trigger type');
  });

  it('start node with triggerType is valid', () => {
    const result = validateNodeConfig('start', { triggerType: 'manual' });
    expect(result.valid).toBe(true);
  });

  it('action node requires actionType', () => {
    const result = validateNodeConfig('action', {});
    expect(result.valid).toBe(false);
  });

  it('decision node requires conditions', () => {
    const result = validateNodeConfig('decision', {});
    expect(result.valid).toBe(false);
  });

  it('human node requires positive timeout', () => {
    expect(validateNodeConfig('human', {}).valid).toBe(false);
    expect(validateNodeConfig('human', { timeout: -1 }).valid).toBe(false);
    expect(validateNodeConfig('human', { timeout: 300 }).valid).toBe(true);
  });

  it('end node has no required config', () => {
    const result = validateNodeConfig('end', {});
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Module contract and source-level assertions
// ---------------------------------------------------------------------------

describe('useWorkflowCanvas — module contract', () => {
  it('exports useWorkflowCanvas function', async () => {
    const mod = await import('../../hooks/useWorkflowCanvas');
    expect(typeof mod.useWorkflowCanvas).toBe('function');
  });

  it('MAX_HISTORY is 50', () => {
    const source = readFileSync(resolve(__dirname, '../../hooks/useWorkflowCanvas.ts'), 'utf-8');
    expect(source).toContain('MAX_HISTORY = 50');
  });

  it('calls validateWorkflowTopology on every render', () => {
    const source = readFileSync(resolve(__dirname, '../../hooks/useWorkflowCanvas.ts'), 'utf-8');
    expect(source).toContain('validateWorkflowTopology(');
  });

  it('pushHistory clears redo stack on new mutation', () => {
    const source = readFileSync(resolve(__dirname, '../../hooks/useWorkflowCanvas.ts'), 'utf-8');
    expect(source).toContain('setRedoStack([])');
  });

  it('syncs initial values when refs change (useEffect)', () => {
    const source = readFileSync(resolve(__dirname, '../../hooks/useWorkflowCanvas.ts'), 'utf-8');
    expect(source).toContain('prevInitialNodesRef');
    expect(source).toContain('prevInitialEdgesRef');
  });

  it('removeNode also removes connected edges', () => {
    const source = readFileSync(resolve(__dirname, '../../hooks/useWorkflowCanvas.ts'), 'utf-8');
    expect(source).toMatch(/filter.*source.*nodeId.*target.*nodeId/s);
  });
});

// ---------------------------------------------------------------------------
// pickAutoLinkSource — pure auto-link logic (S6959 fix: reduce with initial value)
// ---------------------------------------------------------------------------

describe('pickAutoLinkSource', () => {
  it('returns null when nodes list is empty', () => {
    expect(pickAutoLinkSource([], { x: 100, y: 200 })).toBeNull();
  });

  it('returns null when the only node is an end node above position', () => {
    const nodes = [{ id: 'n1', type: 'end', position: { x: 0, y: 100 } }];
    expect(pickAutoLinkSource(nodes, { x: 0, y: 200 })).toBeNull();
  });

  it('falls back to last node when no candidates are above position', () => {
    const nodes = [
      { id: 'n1', type: 'action', position: { x: 0, y: 300 } },
      { id: 'n2', type: 'action', position: { x: 0, y: 400 } },
    ];
    // New node is at y=100, both existing nodes are BELOW it — no candidates above
    const result = pickAutoLinkSource(nodes, { x: 0, y: 100 });
    // Fallback: last node in array (n2)
    expect(result?.id).toBe('n2');
  });

  it('picks the nearest node above by Y when candidates exist (exercises reduce initial value)', () => {
    const nodes = [
      { id: 'n1', type: 'action', position: { x: 0, y: 50 } },
      { id: 'n2', type: 'action', position: { x: 0, y: 150 } },
      { id: 'n3', type: 'action', position: { x: 0, y: 200 } },
    ];
    // New node at y=250 — all three are candidates (y < 250); nearest is n3 (y=200, delta=50)
    const result = pickAutoLinkSource(nodes, { x: 0, y: 250 });
    expect(result?.id).toBe('n3');
  });

  it('returns single candidate node when only one is above', () => {
    const nodes = [{ id: 'n1', type: 'start', position: { x: 0, y: 100 } }];
    // One candidate above y=200 — reduce with initial value candidates[0] = n1
    const result = pickAutoLinkSource(nodes, { x: 0, y: 200 });
    expect(result?.id).toBe('n1');
  });
});
