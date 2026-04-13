/**
 * Workflow Topology Validation — IFC-031
 *
 * Pure functions for validating workflow graph topology and individual
 * node configurations. No React or tRPC dependencies — safe to use in
 * both tests and production code.
 */

import type {
  WorkflowNodeType,
  WorkflowNodeConfig,
  TopologyValidationResult,
  NodeConfigValidationResult,
} from '../workflow-types';

// ---------------------------------------------------------------------------
// Internal types for the topology functions
// ---------------------------------------------------------------------------

interface GraphNode {
  id: string;
  type: string;
  data?: unknown;
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
}

// ---------------------------------------------------------------------------
// validateWorkflowTopology
// ---------------------------------------------------------------------------

/**
 * Validates that a set of nodes and edges form a valid workflow topology.
 *
 * Rules:
 * 1. Exactly one `start` node
 * 2. Exactly one `end` node
 * 3. All nodes must be reachable (no orphan/disconnected nodes)
 * 4. Decision nodes must have at least 2 outgoing edges
 * 5. Graph must be a DAG (no cycles)
 */
export function validateWorkflowTopology(
  nodes: GraphNode[],
  edges: GraphEdge[],
): TopologyValidationResult {
  const errors: string[] = [];

  // Rule 1 — exactly one start node
  const startNodes = nodes.filter((n) => n.type === 'start');
  if (startNodes.length !== 1) {
    errors.push('Workflow must have exactly one Start node');
  }

  // Rule 2 — exactly one end node
  const endNodes = nodes.filter((n) => n.type === 'end');
  if (endNodes.length !== 1) {
    errors.push('Workflow must have exactly one End node');
  }

  // Build adjacency structures
  const nodeIds = new Set(nodes.map((n) => n.id));
  const outgoing: Map<string, string[]> = new Map();
  const incoming: Map<string, string[]> = new Map();

  for (const id of nodeIds) {
    outgoing.set(id, []);
    incoming.set(id, []);
  }

  for (const edge of edges) {
    outgoing.get(edge.source)?.push(edge.target);
    incoming.get(edge.target)?.push(edge.source);
  }

  // Rule 3 — all nodes must be reachable from start via BFS
  // Also catches isolated nodes (zero-degree) as a subset.
  if (nodes.length > 1 && startNodes.length === 1) {
    const visited = new Set<string>();
    const queue = [startNodes[0].id];
    visited.add(startNodes[0].id);
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const neighbor of outgoing.get(current) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    if (visited.size < nodes.length) {
      errors.push('All nodes must be connected');
    }
  } else if (nodes.length > 1) {
    // Fallback: if start node is missing, still check for isolated nodes
    const isolated = nodes.filter(
      (n) =>
        (outgoing.get(n.id)?.length ?? 0) === 0 &&
        (incoming.get(n.id)?.length ?? 0) === 0,
    );
    if (isolated.length > 0) {
      errors.push('All nodes must be connected');
    }
  }

  // Rule 4 — decision nodes need ≥2 outgoing edges
  const decisionNodes = nodes.filter((n) => n.type === 'decision');
  for (const dn of decisionNodes) {
    const outCount = outgoing.get(dn.id)?.length ?? 0;
    if (outCount < 2) {
      errors.push(
        `Decision nodes must have at least 2 outgoing connections (node "${dn.id}" has ${outCount})`,
      );
    }
  }

  // Rule 5 — cycle detection (Kahn's algorithm / topological sort)
  if (_hasCycle(nodeIds, outgoing, incoming)) {
    errors.push('Workflow must not have cycles');
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Detect cycles using Kahn's topological sort algorithm.
 * Returns true if the graph contains a cycle.
 */
function _hasCycle(
  nodeIds: Set<string>,
  outgoing: Map<string, string[]>,
  incoming: Map<string, string[]>,
): boolean {
  // Build in-degree map (copy so we don't mutate)
  const inDegree = new Map<string, number>();
  for (const id of nodeIds) {
    inDegree.set(id, incoming.get(id)?.length ?? 0);
  }

  // Start with nodes of in-degree 0
  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  let processed = 0;
  while (queue.length > 0) {
    const current = queue.shift()!;
    processed++;
    for (const neighbor of outgoing.get(current) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  return processed < nodeIds.size;
}

// ---------------------------------------------------------------------------
// validateNodeConfig
// ---------------------------------------------------------------------------

/**
 * Validates the configuration object for a single workflow node.
 *
 * Returns `{ valid: true, errors: [] }` when config is acceptable.
 * Returns `{ valid: false, errors: [...] }` with human-readable error messages.
 */
export function validateNodeConfig(
  nodeType: WorkflowNodeType,
  config: WorkflowNodeConfig,
): NodeConfigValidationResult {
  const errors: string[] = [];

  switch (nodeType) {
    case 'start': {
      // triggerType is required
      if (!config.triggerType) {
        errors.push('Start node requires a trigger type');
      }
      break;
    }

    case 'action': {
      // actionType is required
      if (!config.actionType) {
        errors.push('Action node requires an action type');
      }
      break;
    }

    case 'decision': {
      // conditions array must be present and non-empty
      if (!config.conditions || config.conditions.length === 0) {
        errors.push('Decision node requires at least one condition');
      }
      break;
    }

    case 'human': {
      // Accept EITHER the new `deadlineInHours` (hours) OR the legacy
      // `timeout` (seconds). Phase E renamed the UI control but saved
      // workflows may still carry `timeout`. At least one must be > 0.
      const legacyTimeout = config.timeout;
      const deadlineHours = (config as { deadlineInHours?: number }).deadlineInHours;

      const legacyValid = typeof legacyTimeout === 'number' && legacyTimeout > 0;
      const deadlineValid = typeof deadlineHours === 'number' && deadlineHours > 0;

      if (!legacyValid && !deadlineValid) {
        errors.push('Human node requires a deadline (hours)');
      }
      break;
    }

    case 'end': {
      // No required fields — completionStatus is optional
      break;
    }
  }

  return { valid: errors.length === 0, errors };
}
