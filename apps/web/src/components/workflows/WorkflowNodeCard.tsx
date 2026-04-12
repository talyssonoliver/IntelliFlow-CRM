'use client';

/**
 * WorkflowNodeCard — IFC-031
 *
 * Custom React Flow node component. Renders a colored card with node type
 * icon and label. Used as the nodeTypes map for all workflow node types.
 */

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { WorkflowNodeConfig, WorkflowNodeType as WFNodeType } from '@/lib/workflow-types';

// ---------------------------------------------------------------------------
// Node type visual config
// ---------------------------------------------------------------------------

interface NodeTypeConfig {
  label: string;
  color: string;
  textColor: string;
  emoji: string;
}

const NODE_TYPE_CONFIG: Record<WFNodeType, NodeTypeConfig> = {
  start: {
    label: 'Start',
    color: 'bg-green-100 border-green-400',
    textColor: 'text-green-800',
    emoji: '▶',
  },
  action: {
    label: 'Action',
    color: 'bg-blue-100 border-blue-400',
    textColor: 'text-blue-800',
    emoji: '⚡',
  },
  decision: {
    label: 'Decision',
    color: 'bg-yellow-100 border-yellow-400',
    textColor: 'text-yellow-800',
    emoji: '⑂',
  },
  human: {
    label: 'Human',
    color: 'bg-purple-100 border-purple-400',
    textColor: 'text-purple-800',
    emoji: '👤',
  },
  end: {
    label: 'End',
    color: 'bg-red-100 border-red-400',
    textColor: 'text-red-800',
    emoji: '■',
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type WorkflowNodeData = {
  label: string;
  config: WorkflowNodeConfig;
};

function WorkflowNodeCardInner(props: NodeProps) {
  const nodeType = ((props.type ?? 'action') as WFNodeType);
  const data = props.data as unknown as WorkflowNodeData;
  const cfg = NODE_TYPE_CONFIG[nodeType] ?? NODE_TYPE_CONFIG.action;

  return (
    <div
      className={`rounded-lg border-2 shadow-sm min-w-[140px] max-w-[200px] ${cfg.color}`}
      role="figure"
      aria-label={`${cfg.label} node: ${data.label}`}
    >
      {/* Incoming handle (not on start node) */}
      {nodeType !== 'start' && (
        <Handle
          type="target"
          position={Position.Top}
          className="w-3 h-3 !bg-gray-400"
        />
      )}

      {/* Node header */}
      <div className={`flex items-center gap-1.5 px-3 py-2 ${cfg.textColor}`}>
        <span className="text-sm select-none" aria-hidden="true">
          {cfg.emoji}
        </span>
        <span className="text-xs font-semibold uppercase tracking-wide">
          {cfg.label}
        </span>
      </div>

      {/* Node label */}
      <div className="px-3 pb-2">
        <p className="text-sm text-gray-700 truncate">{data.label}</p>
      </div>

      {/* Outgoing handle (not on end node) */}
      {nodeType !== 'end' && (
        <Handle
          type="source"
          position={Position.Bottom}
          className="w-3 h-3 !bg-gray-400"
        />
      )}
    </div>
  );
}

export const WorkflowNodeCard = memo(WorkflowNodeCardInner);

/**
 * nodeTypes map — pass to ReactFlow `nodeTypes` prop.
 * Using the same component for all types; type-specific styling is driven
 * by the `type` prop which React Flow automatically passes down.
 */
export const workflowNodeTypes = {
  start: WorkflowNodeCard,
  action: WorkflowNodeCard,
  decision: WorkflowNodeCard,
  human: WorkflowNodeCard,
  end: WorkflowNodeCard,
};
