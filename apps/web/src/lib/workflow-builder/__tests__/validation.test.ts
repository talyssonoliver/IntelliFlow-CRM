/**
 * Workflow Topology Validation Tests — IFC-031
 *
 * Tests for validateWorkflowTopology and validateNodeConfig functions.
 * All tests FAIL initially (validation.ts does not exist yet — RED phase).
 */

import { describe, it, expect } from 'vitest';
import { validateWorkflowTopology, validateNodeConfig } from '../validation';

// ---------------------------------------------------------------------------
// Helpers — minimal node/edge shapes used across tests
// ---------------------------------------------------------------------------

const startNode = { id: 'n1', type: 'start', data: { label: 'Start', config: { triggerType: 'event' } } };
const actionNode = { id: 'n2', type: 'action', data: { label: 'Notify', config: { actionType: 'send_notification' } } };
const decisionNode = { id: 'n3', type: 'decision', data: { label: 'Check', config: { conditions: ['a > b'] } } };
const humanNode = { id: 'n4', type: 'human', data: { label: 'Review', config: { timeout: 3600 } } };
const endNode = { id: 'n5', type: 'end', data: { label: 'End', config: {} } };

const edgeStoA = { id: 'e1', source: 'n1', target: 'n2' };
const edgeAtoD = { id: 'e2', source: 'n2', target: 'n3' };
const edgeDtoH = { id: 'e3', source: 'n3', target: 'n4' }; // decision out 1
const edgeDtoE = { id: 'e4', source: 'n3', target: 'n5' }; // decision out 2
const edgeHtoE = { id: 'e5', source: 'n4', target: 'n5' };

// Valid full graph: start → action → decision → {human, end}, human → end
const validNodes = [startNode, actionNode, decisionNode, humanNode, endNode];
const validEdges = [edgeStoA, edgeAtoD, edgeDtoH, edgeDtoE, edgeHtoE];

// ---------------------------------------------------------------------------
// validateWorkflowTopology
// ---------------------------------------------------------------------------

describe('validateWorkflowTopology', () => {
  // --- Start node rules ---

  it('valid workflow with exactly one start node returns isValid: true', () => {
    const result = validateWorkflowTopology(validNodes, validEdges);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('zero start nodes → error "Workflow must have exactly one Start node"', () => {
    const nodes = [actionNode, endNode];
    const edges = [{ id: 'e1', source: 'n2', target: 'n5' }];
    const result = validateWorkflowTopology(nodes, edges);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e: string) => e.includes('exactly one Start node'))).toBe(true);
  });

  it('two start nodes → error "Workflow must have exactly one Start node"', () => {
    const start2 = { id: 'n6', type: 'start', data: { label: 'Start2', config: {} } };
    const nodes = [startNode, start2, actionNode, endNode];
    const edges = [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n6', target: 'n2' },
      { id: 'e3', source: 'n2', target: 'n5' },
    ];
    const result = validateWorkflowTopology(nodes, edges);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e: string) => e.includes('exactly one Start node'))).toBe(true);
  });

  // --- End node rules ---

  it('valid with exactly one end node returns isValid: true', () => {
    const nodes = [startNode, actionNode, endNode];
    const edges = [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n5' },
    ];
    const result = validateWorkflowTopology(nodes, edges);
    expect(result.isValid).toBe(true);
  });

  it('zero end nodes → error "Workflow must have exactly one End node"', () => {
    const nodes = [startNode, actionNode];
    const edges = [{ id: 'e1', source: 'n1', target: 'n2' }];
    const result = validateWorkflowTopology(nodes, edges);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e: string) => e.includes('exactly one End node'))).toBe(true);
  });

  // --- Connectivity rules ---

  it('valid fully-connected graph returns isValid: true', () => {
    const result = validateWorkflowTopology(validNodes, validEdges);
    expect(result.isValid).toBe(true);
  });

  it('disconnected node present → error "All nodes must be connected"', () => {
    const orphan = { id: 'n99', type: 'action', data: { label: 'Orphan', config: {} } };
    const nodes = [startNode, actionNode, endNode, orphan];
    const edges = [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n5' },
      // n99 has no edges
    ];
    const result = validateWorkflowTopology(nodes, edges);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e: string) => e.includes('connected'))).toBe(true);
  });

  // --- Decision node rules ---

  it('decision node with ≥2 outgoing edges returns isValid: true', () => {
    const result = validateWorkflowTopology(validNodes, validEdges);
    expect(result.isValid).toBe(true);
  });

  it('decision node with 1 outgoing edge → error about minimum connections', () => {
    // Decision only has 1 outgoing: drop edgeDtoE
    const edges = [edgeStoA, edgeAtoD, edgeDtoH, edgeHtoE];
    const result = validateWorkflowTopology(validNodes, edges);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e: string) => e.toLowerCase().includes('decision') && e.toLowerCase().includes('2'))).toBe(true);
  });

  // --- Cycle detection ---

  it('DAG with no cycles returns isValid: true', () => {
    const result = validateWorkflowTopology(validNodes, validEdges);
    expect(result.isValid).toBe(true);
  });

  it('graph with a cycle → error "Workflow must not have cycles"', () => {
    const cycle = { id: 'e_cycle', source: 'n4', target: 'n2' }; // human → action creates cycle
    const result = validateWorkflowTopology(validNodes, [...validEdges, cycle]);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e: string) => e.toLowerCase().includes('cycle'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateNodeConfig
// ---------------------------------------------------------------------------

describe('validateNodeConfig', () => {
  it('action node missing actionType → returns error', () => {
    const result = validateNodeConfig('action', {});
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('action node with valid actionType → passes', () => {
    const result = validateNodeConfig('action', { actionType: 'send_notification' });
    expect(result.valid).toBe(true);
  });

  it('decision node missing conditions → returns error', () => {
    const result = validateNodeConfig('decision', {});
    expect(result.valid).toBe(false);
    expect(result.errors.some((e: string) => e.toLowerCase().includes('condition'))).toBe(true);
  });

  it('human node missing deadline → returns error', () => {
    // IFC-031 Phase E: humans now use `deadlineInHours` instead of `timeout`.
    // Validator accepts either, so missing BOTH should fail.
    const result = validateNodeConfig('human', { instructions: 'Review this' });
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e: string) => e.toLowerCase().includes('deadline')),
    ).toBe(true);
  });

  it('human node with deadlineInHours → passes', () => {
    const result = validateNodeConfig('human', { deadlineInHours: 24 });
    expect(result.valid).toBe(true);
  });

  it('human node with legacy timeout → still passes (backward-compat)', () => {
    const result = validateNodeConfig('human', { timeout: 3600 });
    expect(result.valid).toBe(true);
  });

  it('start node with valid trigger config → passes', () => {
    const result = validateNodeConfig('start', { triggerType: 'event' });
    expect(result.valid).toBe(true);
  });

  it('end node with no config → passes (all fields optional)', () => {
    const result = validateNodeConfig('end', {});
    expect(result.valid).toBe(true);
  });
});
