/**
 * Workflow Builder Type Definitions — IFC-031
 *
 * Shared types for the workflow builder UI. These are the frontend
 * representation of workflow definitions — independent from the tRPC
 * output types so the UI can evolve independently.
 */

// ---------------------------------------------------------------------------
// Node types
// ---------------------------------------------------------------------------

export type WorkflowNodeType = 'start' | 'action' | 'decision' | 'human' | 'end';

/**
 * Action types aligned with the platform workflow engine
 * at `packages/platform/src/workflow/rules-engine.ts`.
 */
export type ActionType =
  | 'trigger_workflow'
  | 'send_notification'
  | 'update_field'
  | 'create_task'
  | 'log_event'
  | 'call_webhook';

export interface WorkflowNodeConfig {
  // start
  triggerType?: 'event' | 'schedule' | 'manual' | 'webhook';
  eventName?: string;
  cronExpression?: string;

  // action
  actionType?: ActionType;
  actionParams?: Record<string, unknown>;

  // decision
  conditions?: string[];
  defaultBranch?: string;

  // human
  timeout?: number; // seconds
  instructions?: string;
  assigneeType?: 'user' | 'role' | 'round_robin';

  // end
  completionStatus?: string;
}

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  data: {
    label: string;
    config: WorkflowNodeConfig;
  };
  position: { x: number; y: number };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

// ---------------------------------------------------------------------------
// Workflow definition (matches API output)
// ---------------------------------------------------------------------------

export interface WorkflowDefinition {
  id: string;
  name: string;
  description?: string | null;
  category: string;
  triggerType: string;
  triggerConfig: Record<string, unknown>;
  steps: unknown[]; // raw JSON from API
  isActive: boolean;
  version: number;
  createdBy: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  deletedAt?: Date | string | null;
  tenantId: string;
}

// ---------------------------------------------------------------------------
// Palette item descriptor
// ---------------------------------------------------------------------------

export interface PaletteItem {
  nodeType: WorkflowNodeType;
  label: string;
  description: string;
  iconName: string; // lucide icon name
}

export const PALETTE_ITEMS: PaletteItem[] = [
  {
    nodeType: 'start',
    label: 'Start',
    description: 'Trigger that begins the workflow',
    iconName: 'Play',
  },
  {
    nodeType: 'action',
    label: 'Action',
    description: 'Perform an automated action',
    iconName: 'Zap',
  },
  {
    nodeType: 'decision',
    label: 'Decision',
    description: 'Branch based on conditions',
    iconName: 'GitFork',
  },
  {
    nodeType: 'human',
    label: 'Human',
    description: 'Wait for manual human review',
    iconName: 'User',
  },
  {
    nodeType: 'end',
    label: 'End',
    description: 'Terminal node — workflow completes',
    iconName: 'Square',
  },
];

// ---------------------------------------------------------------------------
// Validation result types (used by validation.ts + components)
// ---------------------------------------------------------------------------

export interface TopologyValidationResult {
  isValid: boolean;
  errors: string[];
}

export interface NodeConfigValidationResult {
  valid: boolean;
  errors: string[];
}
