/**
 * TicketRoutingService.findMatchingRule — evaluates the canonical ticket rule shape:
 * routing_rules rows with ruleType = 'TICKET', conditions as { field, operator, value }[]
 * and actions as { type, target }[] (the shape ticketRouting.createRule writes).
 */

import { describe, it, expect, vi } from 'vitest';
import { TicketRoutingService } from '../TicketRoutingService';

const TENANT = 'tenant-1';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rule-1',
    name: 'Billing to Alice',
    conditions: [{ field: 'ticketCategory', operator: 'equals', value: 'BILLING' }],
    actions: [{ type: 'assign_to_user', target: 'user-alice' }],
    ...overrides,
  };
}

function build(
  rules: unknown[],
  agents: Array<{ userId: string }> = [],
  tenantUsers: string[] = ['user-alice', 'user-bob']
) {
  const prisma = {
    routingRule: { findMany: vi.fn().mockResolvedValue(rules) },
    user: {
      findFirst: vi
        .fn()
        .mockImplementation(
          async ({ where }: { where: { id: string; OR: Array<{ tenantId?: string }> } }) =>
            where.OR[0].tenantId === TENANT && tenantUsers.includes(where.id)
              ? { id: where.id, name: `Name of ${where.id}` }
              : null
        ),
    },
    agentAvailability: {
      findMany: vi.fn().mockResolvedValue(
        agents.map((a) => ({
          userId: a.userId,
          currentCapacity: 0,
          maxCapacity: 5,
          status: 'ONLINE',
          user: { id: a.userId, name: a.userId },
        }))
      ),
    },
    agentSkill: {
      findMany: vi
        .fn()
        .mockResolvedValue(agents.map((a) => ({ userId: a.userId, proficiency: 80 }))),
    },
  };
  return { prisma, service: new TicketRoutingService(prisma as never) };
}

describe('TicketRoutingService.findMatchingRule', () => {
  it('reads only active TICKET rules of the tenant, highest priority first', async () => {
    const { prisma, service } = build([]);

    await service.findMatchingRule(TENANT, 'BILLING', 'HIGH');

    expect(prisma.routingRule.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT, ruleType: 'TICKET', isActive: true },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });
  });

  it('matches an assign_to_user rule on ticket category', async () => {
    const { service } = build([row()]);

    expect(await service.findMatchingRule(TENANT, 'BILLING', 'LOW')).toEqual({
      id: 'rule-1',
      assignToUserId: 'user-alice',
      assigneeName: 'Name of user-alice',
      ruleName: 'Billing to Alice',
    });
  });

  it('returns null when no rule matches', async () => {
    const { service } = build([row()]);

    expect(await service.findMatchingRule(TENANT, 'SALES', 'LOW')).toBeNull();
  });

  it('returns the first matching rule in query order', async () => {
    const { service } = build([
      row({
        id: 'first',
        name: 'First',
        actions: [{ type: 'assign_to_user', target: 'user-alice' }],
      }),
      row({
        id: 'second',
        name: 'Second',
        actions: [{ type: 'assign_to_user', target: 'user-bob' }],
      }),
    ]);

    expect((await service.findMatchingRule(TENANT, 'BILLING', 'LOW'))?.id).toBe('first');
  });

  it('evaluates priority, status and SLA facts, including isSlaBreached', async () => {
    const { service } = build([
      row({
        conditions: [
          { field: 'ticketPriority', operator: 'gte', value: 'HIGH' },
          { field: 'ticketStatus', operator: 'in', value: ['OPEN', 'IN_PROGRESS'] },
          { field: 'isSlaBreached', operator: 'equals', value: 'true' },
        ],
      }),
    ]);

    expect(
      await service.findMatchingRule(TENANT, 'GENERAL', 'CRITICAL', {
        status: 'OPEN',
        slaStatus: 'BREACHED',
      })
    ).not.toBeNull();
    expect(
      await service.findMatchingRule(TENANT, 'GENERAL', 'CRITICAL', {
        status: 'OPEN',
        slaStatus: 'ON_TRACK',
      })
    ).toBeNull();
    // facts the caller did not supply never match a rule that needs them
    expect(await service.findMatchingRule(TENANT, 'GENERAL', 'CRITICAL')).toBeNull();
  });

  it('matches on slaStatus when supplied', async () => {
    const { service } = build([
      row({ conditions: [{ field: 'slaStatus', operator: 'equals', value: 'AT_RISK' }] }),
    ]);

    expect(
      await service.findMatchingRule(TENANT, 'GENERAL', 'LOW', { slaStatus: 'AT_RISK' })
    ).not.toBeNull();
  });

  it('only assigns to users of the tenant, skipping a rule that targets anyone else', async () => {
    const { prisma, service } = build([
      row({ id: 'foreign', actions: [{ type: 'assign_to_user', target: 'user-of-other-tenant' }] }),
      row({ id: 'own', actions: [{ type: 'assign_to_user', target: 'user-bob' }] }),
    ]);

    const match = await service.findMatchingRule(TENANT, 'BILLING', 'LOW');

    expect(match).toEqual({
      id: 'own',
      assignToUserId: 'user-bob',
      assigneeName: 'Name of user-bob',
      ruleName: 'Billing to Alice',
    });
    // membership-aware predicate (home users minus revoked, plus live members), not a bare tenantId
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'user-of-other-tenant',
        OR: [expect.objectContaining({ tenantId: TENANT }), expect.any(Object)],
      },
      select: { id: true, name: true },
    });
  });

  it('resolves assign_to_skill to the best eligible agent with that skill', async () => {
    const { prisma, service } = build(
      [row({ actions: [{ type: 'assign_to_skill', target: 'billing' }] })],
      [{ userId: 'agent-1' }, { userId: 'agent-2' }]
    );

    const match = await service.findMatchingRule(TENANT, 'BILLING', 'LOW');

    expect(match?.assignToUserId).toBe('agent-1');
    expect(match?.assigneeName).toBe('agent-1');
    expect(prisma.agentSkill.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT, skillName: 'billing' }),
      })
    );
  });

  it('skips a skill rule with no eligible agent so later rules still apply', async () => {
    const { service } = build(
      [
        row({ id: 'skill', actions: [{ type: 'assign_to_skill', target: 'billing' }] }),
        row({ id: 'fallback', actions: [{ type: 'assign_to_user', target: 'user-bob' }] }),
      ],
      []
    );

    const match = await service.findMatchingRule(TENANT, 'BILLING', 'LOW');

    expect(match?.id).toBe('fallback');
  });

  it('skips rows whose stored JSON does not parse (legacy shapes, wrong vocabulary)', async () => {
    const { service } = build([
      row({ id: 'legacy-object', conditions: { score: { operator: 'gte', value: 90 } } }),
      row({
        id: 'lead-vocab',
        conditions: [{ field: 'leadScore', operator: 'equals', value: '9' }],
      }),
      row({ id: 'bad-actions', actions: [{ type: 'change_status', target: 'OPEN' }] }),
      row({ id: 'empty-conditions', conditions: [] }),
      row({ id: 'valid' }),
    ]);

    expect((await service.findMatchingRule(TENANT, 'BILLING', 'LOW'))?.id).toBe('valid');
  });

  it('prefers a user action over a skill action when a rule has both', async () => {
    const { prisma, service } = build([
      row({
        actions: [
          { type: 'assign_to_skill', target: 'billing' },
          { type: 'assign_to_user', target: 'user-alice' },
        ],
      }),
    ]);

    expect((await service.findMatchingRule(TENANT, 'BILLING', 'LOW'))?.assignToUserId).toBe(
      'user-alice'
    );
    expect(prisma.agentSkill.findMany).not.toHaveBeenCalled();
  });
});
