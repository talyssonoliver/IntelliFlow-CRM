/**
 * LeadRoutingService: rule priority order and action types (#771)
 *
 * Convention under test: a HIGHER priority is evaluated FIRST, and every action
 * the editor/validator offers (assign_to_user, assign_to_team, assign_by_skill)
 * really assigns someone. Unsupported legacy actions (notify, escalate) assign
 * nobody and never block a later action or rule.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockDeep, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@intelliflow/db';
import { LeadRoutingService } from '../LeadRoutingService';

const TENANT_ID = 'tenant-001';
const LEAD_ID = 'lead-001';
const AGENT_1 = 'agent-001';
const AGENT_2 = 'agent-002';
const AGENT_3 = 'agent-003';
const RULE_ID = 'rule-001';
const TEAM_ID = 'team-001';

const LEAD_CONTEXT = {
  score: 85,
  source: 'WEB',
  status: 'NEW',
  estimatedValue: 5000,
  location: 'New York',
  tags: ['enterprise'],
};

function makeAgent(overrides: Record<string, unknown> = {}) {
  return {
    userId: AGENT_1,
    userName: 'Alice Agent',
    status: 'ONLINE',
    currentCapacity: 2,
    maxCapacity: 10,
    tenantId: TENANT_ID,
    ...overrides,
  };
}

function makeLead() {
  return {
    id: LEAD_ID,
    tenantId: TENANT_ID,
    status: 'NEW',
    score: 85,
    source: 'WEB',
    estimatedValue: 5000,
    location: 'New York',
    tags: ['enterprise'],
    ownerId: null,
  };
}

function makeRule(actions: unknown, overrides: Record<string, unknown> = {}) {
  return {
    id: RULE_ID,
    tenantId: TENANT_ID,
    name: 'Hot Lead Rule',
    isActive: true,
    priority: 10,
    conditions: JSON.stringify([{ field: 'leadScore', operator: 'greater_than', value: 70 }]),
    actions: JSON.stringify(actions),
    ...overrides,
  };
}

function makeTx() {
  return {
    lead: { findFirst: vi.fn(), update: vi.fn() },
    agentAvailability: { findMany: vi.fn(), updateMany: vi.fn() },
    agentSkill: { findMany: vi.fn() },
    routingRule: { findMany: vi.fn() },
    routingAudit: { create: vi.fn() },
    teamMember: { findMany: vi.fn().mockResolvedValue([]) },
  };
}

let prismaMock: DeepMockProxy<PrismaClient>;
let tx: ReturnType<typeof makeTx>;
let service: LeadRoutingService;

// The service is exercised through its public surface; findMatchingRule runs the
// same code against the client, so most cases use `tx` as that client.
beforeEach(() => {
  prismaMock = mockDeep<PrismaClient>();
  tx = makeTx();
  (prismaMock.$transaction as any).mockImplementation(async (fn: (t: any) => Promise<any>) =>
    fn(tx)
  );
  Object.assign(prismaMock as any, {
    routingRule: tx.routingRule,
    agentAvailability: tx.agentAvailability,
    agentSkill: tx.agentSkill,
    teamMember: tx.teamMember,
  });
  service = new LeadRoutingService(prismaMock);
});

function givenRules(rules: unknown[]) {
  tx.routingRule.findMany.mockResolvedValue(rules);
}

// Honours the `userId` filter the service uses to look up the assignee's name.
function givenAgents(agents: ReturnType<typeof makeAgent>[]) {
  tx.agentAvailability.findMany.mockImplementation(async (args: { where: { userId?: string } }) =>
    args.where.userId ? agents.filter((a) => a.userId === args.where.userId) : agents
  );
}

describe('rule ordering', () => {
  it('F1: asks for rules highest priority first, ties by creation order', async () => {
    givenRules([]);

    await service.findMatchingRule(TENANT_ID, LEAD_CONTEXT);

    expect(tx.routingRule.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, ruleType: 'LEAD', isActive: true },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
  });

  it('F2: the first matching rule in that order wins over a later match', async () => {
    givenRules([
      makeRule([{ type: 'assign_to_user', target: 'high-priority-user' }], {
        id: 'rule-high',
        priority: 9,
      }),
      makeRule([{ type: 'assign_to_user', target: 'low-priority-user' }], {
        id: 'rule-low',
        priority: 1,
      }),
    ]);

    const result = await service.findMatchingRule(TENANT_ID, LEAD_CONTEXT);

    expect(result).toMatchObject({ ruleId: 'rule-high', assigneeId: 'high-priority-user' });
  });

  it('F3: a matching rule that resolves nobody does not stop lower rules applying', async () => {
    givenRules([
      makeRule([{ type: 'assign_to_team', target: TEAM_ID }], { id: 'rule-empty-team' }),
      makeRule([{ type: 'assign_to_user', target: AGENT_2 }], { id: 'rule-next' }),
    ]);
    givenAgents([]);

    const result = await service.findMatchingRule(TENANT_ID, LEAD_CONTEXT);

    expect(result?.ruleId).toBe('rule-next');
  });
});

describe('assign_to_user', () => {
  it('F4: assigns the named user and reports the action type', async () => {
    givenRules([makeRule([{ type: 'assign_to_user', target: AGENT_3 }])]);

    expect(await service.findMatchingRule(TENANT_ID, LEAD_CONTEXT)).toEqual({
      ruleId: RULE_ID,
      ruleName: 'Hot Lead Rule',
      assigneeId: AGENT_3,
      actionType: 'assign_to_user',
      matchedSkill: null,
    });
  });

  it('F5: ignores an action with no target', async () => {
    givenRules([makeRule([{ type: 'assign_to_user' }])]);

    expect(await service.findMatchingRule(TENANT_ID, LEAD_CONTEXT)).toBeNull();
  });
});

describe('assign_to_team', () => {
  it('F6: picks the least-loaded eligible member of the team', async () => {
    givenRules([makeRule([{ type: 'assign_to_team', target: TEAM_ID }])]);
    tx.teamMember.findMany.mockResolvedValue([{ userId: AGENT_1 }, { userId: AGENT_2 }]);
    givenAgents([
      makeAgent({ userId: AGENT_1, userName: 'Busy', currentCapacity: 6 }),
      makeAgent({ userId: AGENT_2, userName: 'Free', currentCapacity: 1 }),
      // Not on the team and the lowest load of all: must not be chosen.
      makeAgent({ userId: AGENT_3, userName: 'Outsider', currentCapacity: 0 }),
    ]);

    const result = await service.findMatchingRule(TENANT_ID, LEAD_CONTEXT);

    expect(result).toMatchObject({ assigneeId: AGENT_2, actionType: 'assign_to_team' });
    expect(tx.teamMember.findMany).toHaveBeenCalledWith({
      where: { teamId: TEAM_ID, tenantId: TENANT_ID, team: { isActive: true } },
    });
  });

  it('F7: skips members who are at capacity', async () => {
    givenRules([makeRule([{ type: 'assign_to_team', target: TEAM_ID }])]);
    tx.teamMember.findMany.mockResolvedValue([{ userId: AGENT_1 }, { userId: AGENT_2 }]);
    givenAgents([
      makeAgent({ userId: AGENT_1, currentCapacity: 10, maxCapacity: 10 }),
      makeAgent({ userId: AGENT_2, currentCapacity: 4 }),
    ]);

    expect((await service.findMatchingRule(TENANT_ID, LEAD_CONTEXT))?.assigneeId).toBe(AGENT_2);
  });

  it('F8: falls through when the team has no members', async () => {
    givenRules([makeRule([{ type: 'assign_to_team', target: TEAM_ID }])]);
    givenAgents([makeAgent({ userId: AGENT_1 })]);

    expect(await service.findMatchingRule(TENANT_ID, LEAD_CONTEXT)).toBeNull();
  });
});

describe('assign_by_skill', () => {
  it('F9: picks the most proficient eligible agent and records the skill', async () => {
    givenRules([makeRule([{ type: 'assign_by_skill', target: 'enterprise' }])]);
    givenAgents([
      makeAgent({ userId: AGENT_1, currentCapacity: 1 }),
      makeAgent({ userId: AGENT_2, currentCapacity: 5 }),
    ]);
    tx.agentSkill.findMany.mockResolvedValue([
      { userId: AGENT_1, proficiency: 2 },
      { userId: AGENT_2, proficiency: 5 },
    ]);

    expect(await service.findMatchingRule(TENANT_ID, LEAD_CONTEXT)).toMatchObject({
      assigneeId: AGENT_2,
      actionType: 'assign_by_skill',
      matchedSkill: 'enterprise',
    });
  });

  it('F10: breaks a proficiency tie by lowest load', async () => {
    givenRules([makeRule([{ type: 'assign_by_skill', target: 'enterprise' }])]);
    givenAgents([
      makeAgent({ userId: AGENT_1, currentCapacity: 7 }),
      makeAgent({ userId: AGENT_2, currentCapacity: 2 }),
    ]);
    tx.agentSkill.findMany.mockResolvedValue([
      { userId: AGENT_1, proficiency: 4 },
      { userId: AGENT_2, proficiency: 4 },
    ]);

    expect((await service.findMatchingRule(TENANT_ID, LEAD_CONTEXT))?.assigneeId).toBe(AGENT_2);
  });

  it('F11: falls through when nobody with capacity has the skill', async () => {
    givenRules([makeRule([{ type: 'assign_by_skill', target: 'enterprise' }])]);
    givenAgents([makeAgent({ userId: AGENT_1 })]);
    tx.agentSkill.findMany.mockResolvedValue([]);

    expect(await service.findMatchingRule(TENANT_ID, LEAD_CONTEXT)).toBeNull();
  });
});

describe('unsupported and malformed actions', () => {
  it('F12: legacy notify / escalate assign nobody but never block a later action', async () => {
    givenRules([
      makeRule([
        { type: 'notify', channels: ['email'] },
        { type: 'escalate', target: 'manager' },
        { type: 'assign_to_user', target: AGENT_3 },
      ]),
    ]);

    expect((await service.findMatchingRule(TENANT_ID, LEAD_CONTEXT))?.assigneeId).toBe(AGENT_3);
  });

  it('F13: a rule with only notify actions assigns nobody', async () => {
    givenRules([makeRule([{ type: 'notify', channels: ['email'] }])]);

    expect(await service.findMatchingRule(TENANT_ID, LEAD_CONTEXT)).toBeNull();
  });

  it('F14: tolerates actions that are not an array or hold junk entries', async () => {
    givenRules([makeRule({ type: 'assign_to_user', target: AGENT_1 })]);
    expect(await service.findMatchingRule(TENANT_ID, LEAD_CONTEXT)).toBeNull();

    givenRules([
      makeRule([null, 'x', { target: 'no-type' }, { type: 'assign_to_user', target: 7 }]),
    ]);
    expect(await service.findMatchingRule(TENANT_ID, LEAD_CONTEXT)).toBeNull();
  });
});

describe('routeLead with rule actions', () => {
  beforeEach(() => {
    tx.lead.findFirst.mockResolvedValue(makeLead());
    tx.lead.update.mockResolvedValue({});
    tx.agentAvailability.updateMany.mockResolvedValue({ count: 1 });
    tx.routingAudit.create.mockResolvedValue({ id: 'audit-001' });
  });

  it('F15: a team rule assigns a team member and audits the rule and action type', async () => {
    tx.teamMember.findMany.mockResolvedValue([{ userId: AGENT_2 }]);
    givenRules([makeRule([{ type: 'assign_to_team', target: TEAM_ID }])]);
    givenAgents([
      makeAgent({ userId: AGENT_1 }),
      makeAgent({ userId: AGENT_2, userName: 'Team Member' }),
    ]);

    const result = await service.routeLead({ leadId: LEAD_ID, tenantId: TENANT_ID });

    expect(result).toMatchObject({
      assigneeId: AGENT_2,
      assigneeName: 'Team Member',
      routingMethod: 'rule_match',
      ruleId: RULE_ID,
      matchedSkill: null,
    });
    expect(tx.lead.update).toHaveBeenCalledWith({
      where: { id: LEAD_ID },
      data: { ownerId: AGENT_2, status: 'CONTACTED' },
    });
    expect(tx.routingAudit.create.mock.calls[0][0].data.details).toMatchObject({
      ruleActionType: 'assign_to_team',
    });
  });

  it('F16: a skill rule reports the matched skill', async () => {
    givenRules([makeRule([{ type: 'assign_by_skill', target: 'enterprise' }])]);
    givenAgents([makeAgent({ userId: AGENT_1 })]);
    tx.agentSkill.findMany.mockResolvedValue([{ userId: AGENT_1, proficiency: 5 }]);

    const result = await service.routeLead({ leadId: LEAD_ID, tenantId: TENANT_ID });

    expect(result).toMatchObject({
      assigneeId: AGENT_1,
      routingMethod: 'rule_match',
      matchedSkill: 'enterprise',
    });
  });

  it('F17: a rule whose actions resolve nobody falls back to load balancing', async () => {
    givenRules([makeRule([{ type: 'notify', channels: ['email'] }])]);
    givenAgents([
      makeAgent({ userId: AGENT_1, currentCapacity: 5 }),
      makeAgent({ userId: AGENT_2, currentCapacity: 1 }),
    ]);
    tx.agentSkill.findMany.mockResolvedValue([]);

    const result = await service.routeLead({ leadId: LEAD_ID, tenantId: TENANT_ID });

    // Score 85 is HOT: the 'sales' skill match finds nobody, so load balance.
    expect(result).toMatchObject({ routingMethod: 'load_balance', assigneeId: AGENT_2 });
  });
});
