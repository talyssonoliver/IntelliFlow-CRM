/**
 * Workflow node-catalog schema tests (D.8)
 *
 * Verifies the strict `WorkflowNodeConfigSchema` in `@intelliflow/domain`
 * behaves correctly for:
 *  - every registered node type with its default config (must parse)
 *  - legacy / unknown node types (handled at the router via isNodeTypeId
 *    — not this schema's concern)
 *  - malformed action configs (must reject, with an `actionType` path hint)
 *
 * These tests ONLY exercise the zod schema, not a live tRPC call, so they
 * don't need Prisma or a running dev server. That's intentional: the
 * schema is the single source of truth; the router just delegates to it.
 */

import { describe, it, expect } from 'vitest';
import {
  WorkflowNodeConfigSchema,
  NODE_TYPE_IDS,
  defaultConfigForType,
  isNodeTypeId,
} from '@intelliflow/domain';

describe('WorkflowNodeConfigSchema (IFC-031 Phase D)', () => {
  it.each(NODE_TYPE_IDS)(
    'accepts the default config for %s',
    (type) => {
      const cfg = defaultConfigForType(type);
      const result = WorkflowNodeConfigSchema.safeParse(cfg);
      expect(result.success).toBe(true);
    },
  );

  it('rejects an action node with an unknown actionType', () => {
    const result = WorkflowNodeConfigSchema.safeParse({
      type: 'action',
      actionType: 'not_a_real_action',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      // The error path should mention the invalid discriminator
      const messages = result.error.issues.map((i) => i.message).join(' | ');
      expect(messages.toLowerCase()).toMatch(/action|option|invalid/);
    }
  });

  it('rejects an action:create_task node with a non-positive dueInHours', () => {
    const result = WorkflowNodeConfigSchema.safeParse({
      type: 'action',
      actionType: 'create_task',
      title: 'T',
      dueInHours: -3,
    });
    expect(result.success).toBe(false);
  });

  it('accepts an action:notify node with priority URGENT and recipients', () => {
    const result = WorkflowNodeConfigSchema.safeParse({
      type: 'action',
      actionType: 'notify',
      recipients: [{ kind: 'user', id: 'u_1', label: 'Alice' }],
      priority: 'URGENT',
      message: 'Hello {{trigger.lead.name}}',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a decision node with AND combinator and one condition', () => {
    const result = WorkflowNodeConfigSchema.safeParse({
      type: 'decision',
      combinator: 'AND',
      conditions: [{ field: 'lead.score', op: 'gte', value: 50 }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts a human node with approvers and priority', () => {
    const result = WorkflowNodeConfigSchema.safeParse({
      type: 'human',
      approvers: [{ kind: 'team', id: 't_1' }],
      priority: 'HIGH',
      instructions: 'Please approve',
    });
    expect(result.success).toBe(true);
  });

  it('isNodeTypeId type guard accepts catalog types, rejects unknowns', () => {
    for (const id of NODE_TYPE_IDS) {
      expect(isNodeTypeId(id)).toBe(true);
    }
    expect(isNodeTypeId('approval')).toBe(false);
    expect(isNodeTypeId('condition')).toBe(false);
    expect(isNodeTypeId('')).toBe(false);
  });
});
