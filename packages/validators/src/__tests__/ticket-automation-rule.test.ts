import { describe, it, expect } from 'vitest';
import {
  createTicketRuleSchema,
  updateTicketRuleSchema,
  ticketRuleConditionSchema,
  ticketRuleActionSchema,
  toggleTicketRuleSchema,
  listTicketRulesSchema,
  ticketAutomationRuleSchema,
} from '../ticket-automation-rule';

const validRule = {
  name: 'High priority billing',
  conditions: [{ field: 'ticketCategory', operator: 'equals', value: 'BILLING' }],
  actions: [{ type: 'assign_to_skill', target: 'billing' }],
};

describe('ticketRuleConditionSchema', () => {
  it('accepts a scalar condition and a list condition', () => {
    expect(
      ticketRuleConditionSchema.safeParse({
        field: 'ticketPriority',
        operator: 'in',
        value: ['HIGH', 'CRITICAL'],
      }).success
    ).toBe(true);
    expect(
      ticketRuleConditionSchema.safeParse({
        field: 'isSlaBreached',
        operator: 'equals',
        value: 'true',
      }).success
    ).toBe(true);
  });

  it('rejects lead vocabulary', () => {
    expect(
      ticketRuleConditionSchema.safeParse({
        field: 'leadScore',
        operator: 'equals',
        value: '90',
      }).success
    ).toBe(false);
    expect(
      ticketRuleConditionSchema.safeParse({
        field: 'ticketCategory',
        operator: 'greater_than',
        value: 'BILLING',
      }).success
    ).toBe(false);
  });

  it('requires a list for in/not_in and a scalar otherwise', () => {
    const list = ticketRuleConditionSchema.safeParse({
      field: 'ticketPriority',
      operator: 'in',
      value: 'HIGH',
    });
    expect(list.success).toBe(false);
    expect(list.error?.issues[0].message).toContain('needs a list');
    const scalar = ticketRuleConditionSchema.safeParse({
      field: 'ticketPriority',
      operator: 'equals',
      value: ['HIGH'],
    });
    expect(scalar.success).toBe(false);
    expect(scalar.error?.issues[0].message).toContain('needs a single value');
  });

  it('restricts gte/lte to ticketPriority', () => {
    const bad = ticketRuleConditionSchema.safeParse({
      field: 'ticketCategory',
      operator: 'gte',
      value: 'BILLING',
    });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0].message).toContain('only applies to ticketPriority');
    expect(
      ticketRuleConditionSchema.safeParse({
        field: 'ticketPriority',
        operator: 'gte',
        value: 'HIGH',
      }).success
    ).toBe(true);
  });

  it('rejects values outside the field vocabulary', () => {
    const bad = ticketRuleConditionSchema.safeParse({
      field: 'ticketPriority',
      operator: 'in',
      value: ['HIGH', 'URGENT'],
    });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0].message).toContain('URGENT');
  });
});

describe('ticketRuleActionSchema', () => {
  it('accepts executed actions only', () => {
    expect(ticketRuleActionSchema.safeParse({ type: 'assign_to_user', target: 'u1' }).success).toBe(
      true
    );
    expect(
      ticketRuleActionSchema.safeParse({ type: 'change_status', target: 'OPEN' }).success
    ).toBe(false);
    expect(ticketRuleActionSchema.safeParse({ type: 'assign_to_user', target: '  ' }).success).toBe(
      false
    );
  });
});

describe('createTicketRuleSchema', () => {
  it('applies defaults', () => {
    const parsed = createTicketRuleSchema.parse(validRule);
    expect(parsed.priority).toBe(0);
    expect(parsed.isActive).toBe(true);
  });

  it('requires at least one condition and one action', () => {
    expect(createTicketRuleSchema.safeParse({ ...validRule, conditions: [] }).success).toBe(false);
    expect(createTicketRuleSchema.safeParse({ ...validRule, actions: [] }).success).toBe(false);
    expect(createTicketRuleSchema.safeParse({ ...validRule, name: '  ' }).success).toBe(false);
  });
});

describe('updateTicketRuleSchema', () => {
  it('does not re-apply defaults to omitted keys', () => {
    const parsed = updateTicketRuleSchema.parse({ id: 'r1', name: 'Renamed' });
    expect(parsed).toEqual({ id: 'r1', name: 'Renamed' });
  });

  it('validates provided conditions', () => {
    expect(
      updateTicketRuleSchema.safeParse({
        id: 'r1',
        conditions: [{ field: 'leadScore', operator: 'equals', value: '1' }],
      }).success
    ).toBe(false);
  });
});

describe('toggle / list / output schemas', () => {
  it('parse their shapes', () => {
    expect(toggleTicketRuleSchema.parse({ id: 'r1', isActive: false })).toEqual({
      id: 'r1',
      isActive: false,
    });
    expect(listTicketRulesSchema.parse({})).toEqual({});
    const dto = ticketAutomationRuleSchema.parse({
      id: 'r1',
      name: 'n',
      description: null,
      priority: 1,
      isActive: true,
      conditions: validRule.conditions,
      actions: validRule.actions,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(dto.description).toBeNull();
  });
});
