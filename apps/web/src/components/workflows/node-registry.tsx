'use client';

/**
 * Workflow Node Registry (web side)
 *
 * Binds the domain-layer node catalog (`@intelliflow/domain` →
 * `node-catalog.ts`) to React renderers + per-type config forms. This file
 * is the ONLY place the web app needs to touch when adding a new node
 * type — the domain schema is added in `packages/domain/src/workflow/
 * node-catalog.ts` and its renderer + form are registered here.
 *
 * Consumed by:
 *  - `NodePalette.tsx`        → `getPaletteEntries()`
 *  - `ReactFlowComponent.tsx` → `workflowNodeTypes`
 *  - `NodeConfigPanel.tsx`    → `getConfigForm(type)` (Phase E)
 */

import type { ComponentType } from 'react';
import {
  NODE_TYPE_IDS,
  NODE_DISPLAY_META,
  type NodeTypeId,
  defaultConfigForType,
  type WorkflowNodeConfig as DomainWorkflowNodeConfig,
  type CustomNodeTypeDescriptor,
} from '@intelliflow/domain';
import { WorkflowNodeCard } from './WorkflowNodeCard';
import type { PaletteItem, WorkflowNodeType } from '@/lib/workflow-types';

// ---------------------------------------------------------------------------
// Canvas renderer map — one React component per node type
// ---------------------------------------------------------------------------

/**
 * Map passed to ReactFlow's `nodeTypes` prop. Currently every type uses
 * the same `WorkflowNodeCard` component; per-type visual styling comes
 * from the `type` prop that ReactFlow automatically forwards.
 *
 * To register a per-type renderer, add `customType: MyCustomNodeCard`
 * here AND the matching schema + display meta in the domain catalog.
 */
// `WorkflowNodeCard` is typed against React Flow's `NodeProps`; the map must
// type-erase for ReactFlow's `nodeTypes` prop (which is generic-agnostic).
// `unknown` bridge keeps TS strict-mode happy without widening the component
// contract at the call site.
export const workflowNodeTypes: Record<NodeTypeId, ComponentType<Record<string, unknown>>> = {
  start: WorkflowNodeCard as unknown as ComponentType<Record<string, unknown>>,
  action: WorkflowNodeCard as unknown as ComponentType<Record<string, unknown>>,
  decision: WorkflowNodeCard as unknown as ComponentType<Record<string, unknown>>,
  human: WorkflowNodeCard as unknown as ComponentType<Record<string, unknown>>,
  end: WorkflowNodeCard as unknown as ComponentType<Record<string, unknown>>,
};

// ---------------------------------------------------------------------------
// Palette entries — derived from domain NODE_DISPLAY_META (single source)
// ---------------------------------------------------------------------------

/**
 * Returns the list of node types that appear in the builder's palette,
 * in display order. Each entry is a drag-source descriptor.
 */
export function getPaletteEntries(): PaletteItem[] {
  return NODE_TYPE_IDS.map((id) => {
    const meta = NODE_DISPLAY_META[id];
    return {
      nodeType: id,
      label: meta.label,
      description: meta.description,
      iconName: meta.lucideIcon,
    };
  });
}

// ---------------------------------------------------------------------------
// Config form registry — populated by Phase E per-type form components
// ---------------------------------------------------------------------------

/**
 * Props that every node config-form component receives.
 * Populated by form components under `config-forms/<NodeType>Config.tsx`
 * in Phase E.
 */
export interface NodeConfigFormProps {
  nodeType: NodeTypeId;
  config: DomainWorkflowNodeConfig;
  onSave: (next: DomainWorkflowNodeConfig) => void;
  onClose: () => void;
}

type ConfigFormComponent = ComponentType<NodeConfigFormProps>;

// Registry — starts empty; Phase E populates it via `registerConfigForm(...)`
// or by direct assignment. Returning `null` here is the signal that
// NodeConfigPanel should fall back to its current generic form.
const configFormRegistry = new Map<NodeTypeId, ConfigFormComponent>();

export function registerConfigForm(type: NodeTypeId, component: ConfigFormComponent): void {
  configFormRegistry.set(type, component);
}

export function getConfigForm(type: NodeTypeId): ConfigFormComponent | null {
  return configFormRegistry.get(type) ?? null;
}

// ---------------------------------------------------------------------------
// Custom node type registry (IFC-031 FU-011)
// ---------------------------------------------------------------------------

/**
 * Tenant-registered descriptors hydrated at mount via
 * `api.customNodeType.list`. Keyed by `typeId`. Separate from the canonical
 * registry so canonical behaviour is never mutated at runtime.
 */
const customDescriptorRegistry = new Map<string, CustomNodeTypeDescriptor>();

/**
 * Register a custom node type descriptor and attach a generic
 * `WorkflowNodeCard` renderer + the dynamic form under the
 * same config-form registry used by canonical forms.
 */
export function registerCustomNodeType(descriptor: CustomNodeTypeDescriptor): void {
  customDescriptorRegistry.set(descriptor.typeId, descriptor);
}

export function unregisterCustomNodeType(typeId: string): void {
  customDescriptorRegistry.delete(typeId);
}

export function getCustomNodeTypeDescriptor(typeId: string): CustomNodeTypeDescriptor | undefined {
  return customDescriptorRegistry.get(typeId);
}

export function clearCustomNodeTypeRegistry(): void {
  customDescriptorRegistry.clear();
}

/**
 * Palette entries including canonical + custom (active only). Custom
 * entries are sorted by label for stable ordering.
 */
export function getAllPaletteEntries(): PaletteItem[] {
  const canonical: PaletteItem[] = NODE_TYPE_IDS.map((id) => {
    const meta = NODE_DISPLAY_META[id];
    return {
      nodeType: id as WorkflowNodeType,
      label: meta.label,
      description: meta.description,
      iconName: meta.lucideIcon,
    };
  });
  const custom: PaletteItem[] = Array.from(customDescriptorRegistry.values())
    .filter((d) => d.isActive)
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((d) => ({
      // Custom types don't satisfy the WorkflowNodeType literal union, but the
      // palette only uses this as an opaque drag identifier — runtime is a string.
      nodeType: d.typeId as unknown as WorkflowNodeType,
      label: d.label,
      description: d.description ?? 'Custom node type',
      iconName: 'Puzzle',
    }));
  return [...canonical, ...custom];
}

/**
 * Is this a canonical catalog type? Consumers that need to differentiate
 * rendering (e.g. generic card for custom types) can use this guard.
 */
export function isCanonicalNodeType(typeId: string): typeId is NodeTypeId {
  return (NODE_TYPE_IDS as readonly string[]).includes(typeId);
}

// ---------------------------------------------------------------------------
// Re-exports from the domain catalog (convenience)
// ---------------------------------------------------------------------------

export { NODE_TYPE_IDS, NODE_DISPLAY_META, defaultConfigForType, type NodeTypeId };
