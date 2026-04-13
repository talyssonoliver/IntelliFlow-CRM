'use client';

/**
 * WorkflowNodeCard
 *
 * Custom React Flow node renderer. Shows:
 *  - The type accent (colored badge with emoji + UPPERCASE label)
 *  - The user-set display label
 *  - A live summary chip-row reflecting the node's configuration so users
 *    can see at a glance what the node actually does (priority, action
 *    type, recipient count, message snippet, deadline, etc.) without
 *    having to open the config sheet for every node.
 */

import { memo } from 'react';
import { Handle, NodeResizer, Position, type NodeProps } from '@xyflow/react';
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

const PRIORITY_CHIP_CLASS: Record<string, string> = {
  LOW: 'bg-slate-200 text-slate-700',
  MEDIUM: 'bg-sky-200 text-sky-800',
  HIGH: 'bg-amber-200 text-amber-800',
  URGENT: 'bg-rose-200 text-rose-800',
};

const ACTION_LABEL: Record<string, string> = {
  send_notification: 'Notify',
  notify: 'Notify',
  create_task: 'Create task',
  update_field: 'Update field',
  call_webhook: 'Webhook',
  trigger_workflow: 'Trigger workflow',
  log_event: 'Log',
  log: 'Log',
};

/**
 * Build a list of summary chips from the node's config, ordered from
 * "what kind of action" to "who/where" to "constraints". Returns at most
 * 4 chips so a node card stays compact at typical zoom levels.
 */
function configChips(
  nodeType: WFNodeType,
  cfg: WorkflowNodeConfig
): Array<{ key: string; text: string; className: string }> {
  const chips: Array<{ key: string; text: string; className: string }> = [];

  if (nodeType === 'action' && cfg.actionType) {
    chips.push({
      key: 'actionType',
      text: ACTION_LABEL[cfg.actionType] ?? cfg.actionType,
      className: 'bg-sky-100 text-sky-800',
    });
  }

  if (cfg.priority) {
    chips.push({
      key: 'priority',
      text: cfg.priority.charAt(0) + cfg.priority.slice(1).toLowerCase(),
      className: PRIORITY_CHIP_CLASS[cfg.priority] ?? 'bg-slate-200 text-slate-700',
    });
  }

  // Recipient or assignee summary
  const recipientCount = Array.isArray(cfg.recipients) ? cfg.recipients.length : 0;
  const approverCount = Array.isArray(cfg.approvers) ? cfg.approvers.length : 0;
  if (recipientCount > 0) {
    chips.push({
      key: 'recipients',
      text: `${recipientCount} recipient${recipientCount === 1 ? '' : 's'}`,
      className: 'bg-emerald-100 text-emerald-800',
    });
  }
  if (approverCount > 0) {
    chips.push({
      key: 'approvers',
      text: `${approverCount} approver${approverCount === 1 ? '' : 's'}`,
      className: 'bg-violet-100 text-violet-800',
    });
  }
  if (cfg.assignee?.label) {
    chips.push({
      key: 'assignee',
      text: `→ ${cfg.assignee.label}`,
      className: 'bg-emerald-100 text-emerald-800',
    });
  }

  // Linked entity (e.g. create_task → Lead)
  if (cfg.linkedEntity?.label || cfg.linkedEntity?.kind) {
    chips.push({
      key: 'linked',
      text: cfg.linkedEntity.label
        ? `${cfg.linkedEntity.kind}: ${cfg.linkedEntity.label}`
        : `${cfg.linkedEntity.kind}`,
      className: 'bg-indigo-100 text-indigo-800',
    });
  }

  // Trigger / decision specifics
  if (nodeType === 'start' && cfg.triggerType) {
    chips.push({
      key: 'trigger',
      text: cfg.triggerType,
      className: 'bg-emerald-100 text-emerald-800',
    });
  }
  if (nodeType === 'decision') {
    const condCount = Array.isArray(cfg.conditions) ? cfg.conditions.length : 0;
    if (condCount > 0) {
      chips.push({
        key: 'conditions',
        text: `${condCount} condition${condCount === 1 ? '' : 's'}`,
        className: 'bg-amber-100 text-amber-800',
      });
    }
  }

  // Deadline (human / create_task)
  if (typeof cfg.deadlineInHours === 'number' && cfg.deadlineInHours > 0) {
    chips.push({
      key: 'deadline',
      text: `${cfg.deadlineInHours}h deadline`,
      className: 'bg-rose-100 text-rose-800',
    });
  } else if (typeof cfg.dueInHours === 'number' && cfg.dueInHours > 0) {
    chips.push({
      key: 'due',
      text: `due in ${cfg.dueInHours}h`,
      className: 'bg-rose-100 text-rose-800',
    });
  }

  return chips.slice(0, 4);
}

/** Optional one-line preview of free-text fields (message / instructions). */
function configPreview(cfg: WorkflowNodeConfig): string | null {
  if (cfg.message && cfg.message.trim().length > 0) return cfg.message.trim();
  if (cfg.title && cfg.title.trim().length > 0) return cfg.title.trim();
  if (cfg.instructions && cfg.instructions.trim().length > 0) return cfg.instructions.trim();
  return null;
}

function WorkflowNodeCardInner(props: NodeProps) {
  const nodeType = (props.type ?? 'action') as WFNodeType;
  const data = props.data as unknown as WorkflowNodeData;
  const cfg = NODE_TYPE_CONFIG[nodeType] ?? NODE_TYPE_CONFIG.action;
  const chips = configChips(nodeType, data.config ?? {});
  const preview = configPreview(data.config ?? {});
  const isSelected = props.selected ?? false;

  return (
    <div
      className={`relative rounded-lg border-2 shadow-sm min-w-[180px] ${cfg.color}`}
      role="figure"
      aria-label={`${cfg.label} node: ${data.label}`}
      style={{ width: '100%', height: '100%' }}
    >
      {/* NodeResizer — only visible when selected; constrains to a sensible
          range so users can compact a busy node or expand to read long
          messages without breaking the layout. */}
      <NodeResizer
        isVisible={isSelected}
        minWidth={160}
        minHeight={80}
        maxWidth={420}
        maxHeight={400}
        lineClassName="border-primary"
        handleClassName="!h-2 !w-2 !bg-primary !border !border-primary"
      />
      {/* Incoming handle (not on start node) */}
      {nodeType !== 'start' && (
        <Handle type="target" position={Position.Top} className="w-3 h-3 !bg-gray-400" />
      )}

      {/* Node header */}
      <div className={`flex items-center gap-1.5 px-3 py-2 ${cfg.textColor}`}>
        <span className="text-sm select-none" aria-hidden="true">
          {cfg.emoji}
        </span>
        <span className="text-xs font-semibold uppercase tracking-wide">{cfg.label}</span>
      </div>

      {/* Node display label */}
      <div className="px-3">
        <p className="text-sm text-gray-700 truncate font-medium">{data.label}</p>
      </div>

      {/* Config summary chips */}
      {chips.length > 0 && (
        <div className="px-3 pt-1.5 flex flex-wrap gap-1">
          {chips.map((chip) => (
            <span
              key={chip.key}
              className={`text-[10px] leading-none font-medium px-1.5 py-0.5 rounded ${chip.className}`}
            >
              {chip.text}
            </span>
          ))}
        </div>
      )}

      {/* Free-text preview (message / title / instructions) */}
      {preview && (
        <p className="px-3 pt-1.5 pb-0 text-[11px] text-gray-600 line-clamp-2 italic">
          “{preview}”
        </p>
      )}

      <div className="pb-2" />

      {/* Outgoing handle (not on end node) */}
      {nodeType !== 'end' && (
        <Handle type="source" position={Position.Bottom} className="w-3 h-3 !bg-gray-400" />
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
