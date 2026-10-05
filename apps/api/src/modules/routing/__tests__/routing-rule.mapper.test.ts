import { describe, it, expect } from 'vitest';
import { toRoutingRuleDto, type RoutingRuleRow } from '../routing-rule.mapper';

const row = (overrides: Partial<RoutingRuleRow> = {}): RoutingRuleRow => ({
  id: 'rule-1',
  tenantId: 'tenant-1',
  name: 'High-Value Leads',
  description: null,
  priority: 3,
  isActive: true,
  conditions: [{ field: 'leadScore', operator: 'greater_than', value: 69 }],
  actions: [{ type: 'assign_to_team', target: 'team-1' }],
  createdBy: 'user-1',
  createdAt: new Date('2026-10-01T00:00:00Z'),
  updatedAt: new Date('2026-10-02T00:00:00Z'),
  ...overrides,
});

describe('toRoutingRuleDto', () => {
  it('maps every column and returns lead conditions/actions as typed arrays', () => {
    const conditions = [{ field: 'leadScore', operator: 'greater_than', value: 69 }];
    const actions = [{ type: 'assign_to_team', target: 'team-1' }];
    expect(toRoutingRuleDto(row({ conditions, actions }))).toEqual({
      id: 'rule-1',
      tenantId: 'tenant-1',
      name: 'High-Value Leads',
      description: null,
      priority: 3,
      isActive: true,
      conditions,
      actions,
      conditionsJson: conditions,
      actionsJson: actions,
      createdBy: 'user-1',
      createdAt: new Date('2026-10-01T00:00:00Z'),
      updatedAt: new Date('2026-10-02T00:00:00Z'),
    });
  });

  it('drops columns the contract does not expose (e.g. Prisma relation payloads)', () => {
    const dto = toRoutingRuleDto({ ...row(), tenant: { id: 'tenant-1' } } as RoutingRuleRow);
    expect(dto).not.toHaveProperty('tenant');
  });

  it('keeps a ticket automation rule intact in the JSON fields while the lead view is empty', () => {
    const conditions = [{ field: 'category', operator: 'equals', value: 'billing' }];
    const actions = [{ type: 'assign_to_skill', target: 'billing' }];
    const dto = toRoutingRuleDto(row({ conditions, actions }));
    expect(dto.conditions).toEqual([]);
    expect(dto.actions).toEqual([]);
    expect(dto.conditionsJson).toEqual(conditions);
    expect(dto.actionsJson).toEqual(actions);
  });

  it('keeps a legacy keyed-object rule intact in the JSON fields', () => {
    const conditions = { score: { operator: 'gte', value: 90 } };
    const dto = toRoutingRuleDto(row({ conditions }));
    expect(dto.conditions).toEqual([]);
    expect(dto.conditionsJson).toBe(conditions);
    expect(dto.actions).toEqual([{ type: 'assign_to_team', target: 'team-1' }]);
  });
});
