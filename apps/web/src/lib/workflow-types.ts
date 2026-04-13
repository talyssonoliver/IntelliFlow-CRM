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

/**
 * Reference to a CRM record.
 *
 * Mirrors `EntityRef` in `@intelliflow/domain` → `node-catalog.ts` so
 * server-side validation stays in sync with the UI config shape.
 */
export interface WorkflowEntityRef {
  kind: 'lead' | 'contact' | 'account' | 'opportunity' | 'deal' | 'case' | 'task' | 'user' | 'team';
  id: string;
  label?: string;
}

/** Priority aligned with TaskPriority / CasePriority. */
export type WorkflowPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface WorkflowNodeConfig {
  // start
  triggerType?: 'event' | 'schedule' | 'manual' | 'webhook';
  eventName?: string;
  cronExpression?: string;
  triggerEntity?: WorkflowEntityRef['kind'];

  // action
  actionType?: ActionType;
  actionParams?: Record<string, unknown>;

  // action: notify / create_task / log
  recipients?: WorkflowEntityRef[];
  priority?: WorkflowPriority;
  message?: string;

  // action: create_task
  title?: string;
  description?: string;
  assignee?: WorkflowEntityRef;
  linkedEntity?: WorkflowEntityRef;
  flag?: string;
  dueInHours?: number;

  // action: update_field
  target?: WorkflowEntityRef;
  fieldName?: string;
  newValue?: string;

  // action: call_webhook
  url?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: string;

  // action: trigger_workflow
  workflowId?: string;

  // decision
  conditions?: string[];
  defaultBranch?: string;

  // human
  timeout?: number; // seconds
  instructions?: string;
  assigneeType?: 'user' | 'role' | 'round_robin';
  approvers?: WorkflowEntityRef[];
  deadlineInHours?: number;

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

/**
 * Palette entries derived from the domain node catalog
 * (`@intelliflow/domain` → NODE_DISPLAY_META). Kept as a `const` export for
 * backward compatibility — consumers can still import `PALETTE_ITEMS`
 * directly, but the upstream source of truth is the catalog.
 */
import {
  NODE_TYPE_IDS as CATALOG_IDS,
  NODE_DISPLAY_META as CATALOG_META,
} from '@intelliflow/domain';

export const PALETTE_ITEMS: PaletteItem[] = CATALOG_IDS.map((id) => {
  const meta = CATALOG_META[id];
  return {
    nodeType: id as WorkflowNodeType,
    label: meta.label,
    description: meta.description,
    iconName: meta.lucideIcon,
  };
});

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
