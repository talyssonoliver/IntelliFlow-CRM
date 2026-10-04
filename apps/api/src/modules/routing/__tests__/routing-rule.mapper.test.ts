import { describe, it, expect, vi, afterEach } from 'vitest';
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
  afterEach(() => vi.restoreAllMocks());

  it('maps every column and returns the stored conditions/actions as typed arrays', () => {
    expect(toRoutingRuleDto(row())).toEqual({
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
    });
  });

  it('drops columns the contract does not expose (e.g. Prisma relation payloads)', () => {
    const dto = toRoutingRuleDto({ ...row(), tenant: { id: 'tenant-1' } } as RoutingRuleRow);
    expect(dto).not.toHaveProperty('tenant');
  });

  it('returns [] and warns for a legacy keyed-object rule instead of failing the response', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const dto = toRoutingRuleDto(
      row({
        conditions: { score: { operator: 'gte', value: 90 } },
        actions: { assign_to_user: 'user-2' },
      })
    );
    expect(dto.conditions).toEqual([]);
    expect(dto.actions).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0][0]).toMatch(/rule rule-1: stored conditions do not match/);
    expect(warn.mock.calls[1][0]).toMatch(/rule rule-1: stored actions do not match/);
  });

  it('rejects an array whose entries use unknown fields or operators', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const dto = toRoutingRuleDto(
      row({ conditions: [{ field: 'score', operator: 'gte', value: 90 }] })
    );
    expect(dto.conditions).toEqual([]);
    expect(dto.actions).toEqual([{ type: 'assign_to_team', target: 'team-1' }]);
  });
});
