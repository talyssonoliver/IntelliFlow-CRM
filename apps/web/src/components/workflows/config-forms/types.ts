/**
 * Shared types for workflow node config-form variants (IFC-031 FU-008).
 *
 * Each variant file under `config-forms/{Variant}Config.tsx` implements
 * `NodeConfigFormComponent` and registers itself via the barrel index.
 * `NodeConfigPanel.tsx` dispatches to the registry at render time — it
 * owns the Sheet chrome + Save/Cancel footer + validation; the variant
 * owns the fields.
 */

import type { ComponentType } from 'react';
import type { WorkflowNodeType, WorkflowNodeConfig } from '@/lib/workflow-types';

export interface NodeConfigFormProps {
  readonly config: WorkflowNodeConfig;
  readonly update: (patch: Partial<WorkflowNodeConfig>) => void;
}

export type NodeConfigFormComponent = ComponentType<NodeConfigFormProps>;

const configFormRegistry = new Map<WorkflowNodeType, NodeConfigFormComponent>();

export function registerConfigForm(
  nodeType: WorkflowNodeType,
  component: NodeConfigFormComponent
): void {
  configFormRegistry.set(nodeType, component);
}

export function getConfigForm(nodeType: WorkflowNodeType): NodeConfigFormComponent | null {
  return configFormRegistry.get(nodeType) ?? null;
}

export function resetConfigFormRegistry(): void {
  configFormRegistry.clear();
}

/** For tests: snapshot of registered types (does not expose components). */
export function getRegisteredNodeTypes(): WorkflowNodeType[] {
  return Array.from(configFormRegistry.keys());
}
