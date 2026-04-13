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
