import { describe, it, expect } from 'vitest';
import { routingActionSchema, createRoutingRuleSchema, updateRoutingRuleSchema } from '../routing';

describe('routingActionSchema (#771: only actions the engine executes)', () => {
  it.each(['assign_to_user', 'assign_to_team', 'assign_by_skill'] as const)(
    'accepts %s with a target',
    (type) => {
      expect(routingActionSchema.safeParse({ type, target: 'abc' }).success).toBe(true);
    }
  );

  it.each(['notify', 'escalate'])('rejects %s, which no engine path acts on', (type) => {
    expect(routingActionSchema.safeParse({ type, target: 'abc' }).success).toBe(false);
  });

  it('requires a non-blank target so a rule cannot match and assign nobody', () => {
    expect(routingActionSchema.safeParse({ type: 'assign_to_user' }).success).toBe(false);
    expect(routingActionSchema.safeParse({ type: 'assign_to_team', target: '' }).success).toBe(
      false
    );
    expect(routingActionSchema.safeParse({ type: 'assign_by_skill', target: '   ' }).success).toBe(
      false
    );
  });
});

describe('routing rule schemas', () => {
  const condition = { field: 'leadScore', operator: 'greater_than', value: 70 } as const;

  it('create accepts a rule whose actions are all supported', () => {
    const parsed = createRoutingRuleSchema.safeParse({
      name: 'Hot leads',
      conditions: [condition],
      actions: [{ type: 'assign_to_team', target: 'team-1' }],
    });
    expect(parsed.success).toBe(true);
  });

  it('create and update reject an unsupported action', () => {
    const actions = [{ type: 'notify', target: 'x' }];
    expect(
      createRoutingRuleSchema.safeParse({ name: 'n', conditions: [condition], actions }).success
    ).toBe(false);
    expect(updateRoutingRuleSchema.safeParse({ id: 'r1', actions }).success).toBe(false);
  });
});
