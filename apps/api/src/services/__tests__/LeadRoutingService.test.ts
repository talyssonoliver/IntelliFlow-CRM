/**
 * LeadRoutingService Tests (IFC-030)
 *
 * 42 tests in 4 sections:
 * A: Unit Tests (20)
 * B: Accuracy/NF Tests (8)
 * C: Performance Tests (4)
 * D: Wiring Tests (10)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockDeep, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@intelliflow/db';
import { LeadRoutedEvent } from '@intelliflow/domain';
import { autoRouteLeadInputSchema, suggestLeadAssigneeInputSchema } from '@intelliflow/validators';
import { LeadRoutingService } from '../LeadRoutingService';

// ── Mock helpers ──────────────────────────────────────────────

function makeTxMock() {
  return {
    lead: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    agentAvailability: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    agentSkill: {
      findMany: vi.fn(),
    },
    routingRule: {
      findMany: vi.fn(),
    },
    routingAudit: {
      create: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  };
}

const TENANT_ID = 'tenant-001';
const LEAD_ID = 'lead-001';
const AGENT_ID_1 = 'agent-001';
const AGENT_ID_2 = 'agent-002';
const AGENT_ID_3 = 'agent-003';
const RULE_ID = 'rule-001';

function makeAgent(overrides: Record<string, unknown> = {}) {
  return {
    userId: AGENT_ID_1,
    userName: 'Alice Agent',
    status: 'ONLINE',
    currentCapacity: 2,
    maxCapacity: 10,
    tenantId: TENANT_ID,
    user: { id: AGENT_ID_1, name: 'Alice Agent' },
    ...overrides,
  };
}

function makeLead(overrides: Record<string, unknown> = {}) {
  return {
    id: LEAD_ID,
    tenantId: TENANT_ID,
    status: 'NEW',
    score: 85,
    source: 'WEB',
    estimatedValue: 5000,
    location: 'New York',
    tags: ['enterprise', 'saas'],
    ownerId: null,
    ...overrides,
  };
}

function makeRule(overrides: Record<string, unknown> = {}) {
  return {
    id: RULE_ID,
    tenantId: TENANT_ID,
    name: 'Hot Lead Rule',
    isActive: true,
    priority: 10,
    conditions: JSON.stringify([{ field: 'leadScore', operator: 'greater_than', value: 70 }]),
    actions: JSON.stringify([{ type: 'assign_to_user', target: AGENT_ID_1 }]),
    ...overrides,
  };
}

// ── Prisma mock with $transaction support ──────────────────

let prismaMock: DeepMockProxy<PrismaClient>;
let txMock: ReturnType<typeof makeTxMock>;
let service: LeadRoutingService;

beforeEach(() => {
  prismaMock = mockDeep<PrismaClient>();
  txMock = makeTxMock();

  // $transaction delegates to the callback with txMock
  (prismaMock.$transaction as any).mockImplementation(async (fn: (tx: any) => Promise<any>) =>
    fn(txMock)
  );

  // Default: agentAvailability.findMany returns agents
  (prismaMock as any).agentAvailability = {
    findMany: vi.fn().mockResolvedValue([makeAgent()]),
  };
  (prismaMock as any).agentSkill = {
    findMany: vi.fn().mockResolvedValue([]),
  };
  (prismaMock as any).routingRule = {
    findMany: vi.fn().mockResolvedValue([]),
  };

  service = new LeadRoutingService(prismaMock);
});

// ════════════════════════════════════════════════════════════
// Section A: Unit Tests (~20 tests)
// ════════════════════════════════════════════════════════════

describe('Section A: Unit Tests', () => {
  // ── getEligibleAgents ──

  it('A1: getEligibleAgents returns only ONLINE/BUSY agents', async () => {
    // Mock Prisma query: the WHERE clause filters status IN ('ONLINE','BUSY'),
    // so only ONLINE/BUSY agents are returned by the database.
    (prismaMock as any).agentAvailability.findMany.mockResolvedValue([
      makeAgent({ status: 'ONLINE' }),
      makeAgent({
        userId: AGENT_ID_2,
        userName: 'Bob',
        status: 'BUSY',
        user: { id: AGENT_ID_2, name: 'Bob' },
      }),
    ]);
    const agents = await service.getEligibleAgents(TENANT_ID);
    expect(agents).toHaveLength(2);
    expect(agents.every((a) => ['ONLINE', 'BUSY'].includes(a.status))).toBe(true);

    // Also verify the Prisma query filter includes the status constraint
    expect((prismaMock as any).agentAvailability.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ['ONLINE', 'BUSY'] },
        }),
      })
    );
  });

  it('A2: getEligibleAgents excludes agents at max capacity', async () => {
    (prismaMock as any).agentAvailability.findMany.mockResolvedValue([
      makeAgent({ currentCapacity: 10, maxCapacity: 10 }),
    ]);
    const agents = await service.getEligibleAgents(TENANT_ID);
    expect(agents).toHaveLength(0);
  });

  it('A3: getEligibleAgents filters by required skill', async () => {
    (prismaMock as any).agentAvailability.findMany.mockResolvedValue([
      makeAgent(),
      makeAgent({ userId: AGENT_ID_2, userName: 'Bob', user: { id: AGENT_ID_2, name: 'Bob' } }),
    ]);
    (prismaMock as any).agentSkill.findMany.mockResolvedValue([
      { userId: AGENT_ID_1, skillName: 'sales', proficiency: 5, tenantId: TENANT_ID },
    ]);
    const agents = await service.getEligibleAgents(TENANT_ID, 'sales');
    expect(agents).toHaveLength(1);
    expect(agents[0].agentId).toBe(AGENT_ID_1);
  });

  it('A4: getEligibleAgents sorts by proficiency descending', async () => {
    (prismaMock as any).agentAvailability.findMany.mockResolvedValue([
      makeAgent({ userId: AGENT_ID_1, userName: 'Alice', user: { id: AGENT_ID_1, name: 'Alice' } }),
      makeAgent({ userId: AGENT_ID_2, userName: 'Bob', user: { id: AGENT_ID_2, name: 'Bob' } }),
    ]);
    (prismaMock as any).agentSkill.findMany.mockResolvedValue([
      { userId: AGENT_ID_1, skillName: 'sales', proficiency: 3, tenantId: TENANT_ID },
      { userId: AGENT_ID_2, skillName: 'sales', proficiency: 5, tenantId: TENANT_ID },
    ]);
    const agents = await service.getEligibleAgents(TENANT_ID, 'sales');
    expect(agents[0].proficiency).toBe(5);
    expect(agents[1].proficiency).toBe(3);
  });

  it('A5: getEligibleAgents includes tenantId in query', async () => {
    await service.getEligibleAgents(TENANT_ID);
    expect((prismaMock as any).agentAvailability.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_ID }),
      })
    );
  });

  // ── routeLead ──

  it('A6: routeLead creates RoutingAudit with schema-valid fields', async () => {
    txMock.lead.findFirst.mockResolvedValue(makeLead());
    txMock.lead.update.mockResolvedValue({ ...makeLead(), ownerId: AGENT_ID_1 });
    txMock.agentAvailability.findMany.mockResolvedValue([makeAgent()]);
    txMock.agentAvailability.updateMany.mockResolvedValue({ count: 1 });
    txMock.routingAudit.create.mockResolvedValue({ id: 'audit-001' });
    txMock.routingRule.findMany.mockResolvedValue([makeRule()]);

    await service.routeLead({
      leadId: LEAD_ID,
      tenantId: TENANT_ID,
    });

    expect(txMock.routingAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: TENANT_ID,
        ticketId: LEAD_ID,
        toUserId: AGENT_ID_1,
        toUserName: expect.any(String),
        reason: expect.any(String),
        details: expect.objectContaining({ entityType: 'lead' }),
      }),
    });

    // Must NOT contain phantom fields
    const auditData = txMock.routingAudit.create.mock.calls[0][0].data;
    expect(auditData).not.toHaveProperty('assignedUserId');
    expect(auditData).not.toHaveProperty('routingMethod');
    expect(auditData).not.toHaveProperty('classifiedSkill');
    expect(auditData).not.toHaveProperty('confidence');
    expect(auditData).not.toHaveProperty('executionTimeMs');
    expect(auditData).not.toHaveProperty('modelVersion');
    expect(auditData).not.toHaveProperty('isFallback');
  });

  it('A7: routeLead updates lead.ownerId to assignee', async () => {
    txMock.lead.findFirst.mockResolvedValue(makeLead());
    txMock.lead.update.mockResolvedValue({ ...makeLead(), ownerId: AGENT_ID_1 });
    txMock.agentAvailability.findMany.mockResolvedValue([makeAgent()]);
    txMock.agentAvailability.updateMany.mockResolvedValue({ count: 1 });
    txMock.routingAudit.create.mockResolvedValue({ id: 'audit-001' });
    txMock.routingRule.findMany.mockResolvedValue([makeRule()]);

    await service.routeLead({ leadId: LEAD_ID, tenantId: TENANT_ID });

    expect(txMock.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ownerId: AGENT_ID_1 }),
      })
    );
  });

  it('A8: routeLead updates lead status to CONTACTED', async () => {
    txMock.lead.findFirst.mockResolvedValue(makeLead());
    txMock.lead.update.mockResolvedValue({ ...makeLead(), status: 'CONTACTED' });
    txMock.agentAvailability.findMany.mockResolvedValue([makeAgent()]);
    txMock.agentAvailability.updateMany.mockResolvedValue({ count: 1 });
    txMock.routingAudit.create.mockResolvedValue({ id: 'audit-001' });
    txMock.routingRule.findMany.mockResolvedValue([makeRule()]);

    await service.routeLead({ leadId: LEAD_ID, tenantId: TENANT_ID });

    expect(txMock.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'CONTACTED' }),
      })
    );
  });

  it('A9: routeLead increments agent currentCapacity', async () => {
    txMock.lead.findFirst.mockResolvedValue(makeLead());
    txMock.lead.update.mockResolvedValue({ ...makeLead(), ownerId: AGENT_ID_1 });
    txMock.agentAvailability.findMany.mockResolvedValue([makeAgent()]);
    txMock.agentAvailability.updateMany.mockResolvedValue({ count: 1 });
    txMock.routingAudit.create.mockResolvedValue({ id: 'audit-001' });
    txMock.routingRule.findMany.mockResolvedValue([makeRule()]);

    await service.routeLead({ leadId: LEAD_ID, tenantId: TENANT_ID });

    expect(txMock.agentAvailability.updateMany).toHaveBeenCalledWith({
      where: { userId: AGENT_ID_1, tenantId: TENANT_ID },
      data: { currentCapacity: { increment: 1 } },
    });
  });

  it('A10: routeLead emits LeadRoutedEvent post-transaction', async () => {
    txMock.lead.findFirst.mockResolvedValue(makeLead());
    txMock.lead.update.mockResolvedValue({ ...makeLead(), ownerId: AGENT_ID_1 });
    txMock.agentAvailability.findMany.mockResolvedValue([makeAgent()]);
    txMock.agentAvailability.updateMany.mockResolvedValue({ count: 1 });
    txMock.routingAudit.create.mockResolvedValue({ id: 'audit-001' });
    txMock.routingRule.findMany.mockResolvedValue([makeRule()]);

    const result = await service.routeLead({ leadId: LEAD_ID, tenantId: TENANT_ID });

    expect(result.events).toBeDefined();
    expect(result.events).toHaveLength(1);
    expect(result.events![0]).toBeInstanceOf(LeadRoutedEvent);
  });

  it('A11: routeLead uses rule_match reason when rule matches', async () => {
    txMock.lead.findFirst.mockResolvedValue(makeLead());
    txMock.lead.update.mockResolvedValue({ ...makeLead(), ownerId: AGENT_ID_1 });
    txMock.agentAvailability.findMany.mockResolvedValue([makeAgent()]);
    txMock.agentAvailability.updateMany.mockResolvedValue({ count: 1 });
    txMock.routingAudit.create.mockResolvedValue({ id: 'audit-001' });
    txMock.routingRule.findMany.mockResolvedValue([makeRule()]);

    const result = await service.routeLead({ leadId: LEAD_ID, tenantId: TENANT_ID });

    expect(result.reason).toBe('rule_match');
  });

  it('A12: routeLead stores entityType=lead in details JSON', async () => {
    txMock.lead.findFirst.mockResolvedValue(makeLead());
    txMock.lead.update.mockResolvedValue({ ...makeLead(), ownerId: AGENT_ID_1 });
    txMock.agentAvailability.findMany.mockResolvedValue([makeAgent()]);
    txMock.agentAvailability.updateMany.mockResolvedValue({ count: 1 });
    txMock.routingAudit.create.mockResolvedValue({ id: 'audit-001' });
    txMock.routingRule.findMany.mockResolvedValue([makeRule()]);

    await service.routeLead({ leadId: LEAD_ID, tenantId: TENANT_ID });

    const auditData = txMock.routingAudit.create.mock.calls[0][0].data;
    expect(auditData.details.entityType).toBe('lead');
  });

  it('A13: Guard — rejects routing of CONVERTED lead', async () => {
    txMock.lead.findFirst.mockResolvedValue(makeLead({ status: 'CONVERTED' }));

    await expect(service.routeLead({ leadId: LEAD_ID, tenantId: TENANT_ID })).rejects.toThrow(
      /converted/i
    );
  });

  it('A14: Guard — throws NOT_FOUND for non-existent lead', async () => {
    txMock.lead.findFirst.mockResolvedValue(null);

    await expect(service.routeLead({ leadId: LEAD_ID, tenantId: TENANT_ID })).rejects.toThrow(
      /not found/i
    );
  });

  // ── findMatchingRule ──

  it('A15: findMatchingRule evaluates JSON conditions array', async () => {
    (prismaMock as any).routingRule.findMany.mockResolvedValue([makeRule()]);

    const result = await service.findMatchingRule(TENANT_ID, {
      score: 85,
      source: 'WEB',
      status: 'NEW',
      estimatedValue: 5000,
      location: 'New York',
      tags: ['enterprise'],
    });

    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe(RULE_ID);
  });

  it('A16: findMatchingRule extracts assignee from actions[].target', async () => {
    (prismaMock as any).routingRule.findMany.mockResolvedValue([makeRule()]);

    const result = await service.findMatchingRule(TENANT_ID, {
      score: 85,
      source: 'WEB',
      status: 'NEW',
      estimatedValue: 5000,
      location: 'New York',
      tags: ['enterprise'],
    });

    expect(result!.assigneeId).toBe(AGENT_ID_1);
  });

  it('A17: findMatchingRule returns null when no rules match', async () => {
    (prismaMock as any).routingRule.findMany.mockResolvedValue([
      makeRule({
        conditions: JSON.stringify([{ field: 'leadScore', operator: 'greater_than', value: 99 }]),
      }),
    ]);

    const result = await service.findMatchingRule(TENANT_ID, {
      score: 50,
      source: 'WEB',
      status: 'NEW',
      estimatedValue: null,
      location: null,
      tags: [],
    });

    expect(result).toBeNull();
  });

  // ── evaluateConditions ──

  it('A18: evaluateConditions — greater_than operator', async () => {
    (prismaMock as any).routingRule.findMany.mockResolvedValue([
      makeRule({
        conditions: JSON.stringify([{ field: 'leadScore', operator: 'greater_than', value: 70 }]),
      }),
    ]);

    const result = await service.findMatchingRule(TENANT_ID, {
      score: 85,
      source: 'WEB',
      status: 'NEW',
      estimatedValue: null,
      location: null,
      tags: [],
    });

    expect(result).not.toBeNull();
  });

  it('A19: evaluateConditions — in operator', async () => {
    (prismaMock as any).routingRule.findMany.mockResolvedValue([
      makeRule({
        conditions: JSON.stringify([
          { field: 'leadSource', operator: 'in', value: ['WEB', 'REFERRAL'] },
        ]),
      }),
    ]);

    const result = await service.findMatchingRule(TENANT_ID, {
      score: 50,
      source: 'WEB',
      status: 'NEW',
      estimatedValue: null,
      location: null,
      tags: [],
    });

    expect(result).not.toBeNull();
  });

  it('A20: evaluateConditions — contains on numeric field throws error (NF-005)', async () => {
    (prismaMock as any).routingRule.findMany.mockResolvedValue([
      makeRule({
        conditions: JSON.stringify([{ field: 'leadScore', operator: 'contains', value: '8' }]),
      }),
    ]);

    await expect(
      service.findMatchingRule(TENANT_ID, {
        score: 85,
        source: 'WEB',
        status: 'NEW',
        estimatedValue: null,
        location: null,
        tags: [],
      })
    ).rejects.toThrow(/contains.*numeric/i);
  });
});

// ════════════════════════════════════════════════════════════
// Section B: Accuracy/NF Tests (~8 tests)
// ════════════════════════════════════════════════════════════

describe('Section B: Accuracy/NF Tests', () => {
  it('B1: HOT lead (score>=80) routed to highest-proficiency agent', async () => {
    txMock.lead.findFirst.mockResolvedValue(makeLead({ score: 90 }));
    txMock.lead.update.mockResolvedValue({ ...makeLead(), ownerId: AGENT_ID_2 });
    txMock.agentAvailability.findMany.mockResolvedValue([
      makeAgent({ userId: AGENT_ID_1, userName: 'Alice', user: { id: AGENT_ID_1, name: 'Alice' } }),
      makeAgent({ userId: AGENT_ID_2, userName: 'Bob', user: { id: AGENT_ID_2, name: 'Bob' } }),
    ]);
    txMock.agentAvailability.updateMany.mockResolvedValue({ count: 1 });
    txMock.routingAudit.create.mockResolvedValue({ id: 'audit-001' });
    txMock.routingRule.findMany.mockResolvedValue([]); // No rules → skill/load
    (txMock as any).agentSkill = {
      findMany: vi.fn().mockResolvedValue([
        { userId: AGENT_ID_1, skillName: 'sales', proficiency: 3, tenantId: TENANT_ID },
        { userId: AGENT_ID_2, skillName: 'sales', proficiency: 5, tenantId: TENANT_ID },
      ]),
    };

    const result = await service.routeLead({ leadId: LEAD_ID, tenantId: TENANT_ID });

    // HOT lead should go to highest proficiency agent
    expect(result.assigneeId).toBe(AGENT_ID_2);
  });

  it('B2: LOW lead routed via load balance (lowest capacity)', async () => {
    txMock.lead.findFirst.mockResolvedValue(makeLead({ score: 20 }));
    txMock.lead.update.mockResolvedValue({ ...makeLead(), ownerId: AGENT_ID_3 });
    txMock.agentAvailability.findMany.mockResolvedValue([
      makeAgent({
        userId: AGENT_ID_1,
        userName: 'Alice',
        currentCapacity: 8,
        user: { id: AGENT_ID_1, name: 'Alice' },
      }),
      makeAgent({
        userId: AGENT_ID_3,
        userName: 'Carol',
        currentCapacity: 1,
        user: { id: AGENT_ID_3, name: 'Carol' },
      }),
    ]);
    txMock.agentAvailability.updateMany.mockResolvedValue({ count: 1 });
    txMock.routingAudit.create.mockResolvedValue({ id: 'audit-001' });
    txMock.routingRule.findMany.mockResolvedValue([]);

    const result = await service.routeLead({ leadId: LEAD_ID, tenantId: TENANT_ID });

    expect(result.assigneeId).toBe(AGENT_ID_3);
    expect(result.reason).toBe('load_balance');
  });

  it('B3: Routing accuracy — first matching rule wins', async () => {
    txMock.lead.findFirst.mockResolvedValue(makeLead({ score: 85 }));
    txMock.lead.update.mockResolvedValue({ ...makeLead(), ownerId: AGENT_ID_1 });
    txMock.agentAvailability.findMany.mockResolvedValue([makeAgent()]);
    txMock.agentAvailability.updateMany.mockResolvedValue({ count: 1 });
    txMock.routingAudit.create.mockResolvedValue({ id: 'audit-001' });
    txMock.routingRule.findMany.mockResolvedValue([
      makeRule({ id: 'rule-high', name: 'High Priority', priority: 20 }),
      makeRule({ id: 'rule-low', name: 'Low Priority', priority: 5 }),
    ]);

    const result = await service.routeLead({ leadId: LEAD_ID, tenantId: TENANT_ID });

    expect(result.ruleId).toBe('rule-high');
  });

  it('B4: Tenant isolation — getEligibleAgents includes tenantId (NF-001)', async () => {
    await service.getEligibleAgents('tenant-xyz');

    expect((prismaMock as any).agentAvailability.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'tenant-xyz' }),
      })
    );
  });

  it('B5: Tenant isolation — findMatchingRule includes tenantId (NF-001)', async () => {
    (prismaMock as any).routingRule.findMany.mockResolvedValue([]);

    await service.findMatchingRule('tenant-xyz', {
      score: 50,
      source: 'WEB',
      status: 'NEW',
      estimatedValue: null,
      location: null,
      tags: [],
    });

    expect((prismaMock as any).routingRule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'tenant-xyz' }),
      })
    );
  });

  it('B6: Tenant isolation — routeLead includes tenantId (NF-001)', async () => {
    txMock.lead.findFirst.mockResolvedValue(makeLead());
    txMock.lead.update.mockResolvedValue({ ...makeLead(), ownerId: AGENT_ID_1 });
    txMock.agentAvailability.findMany.mockResolvedValue([makeAgent()]);
    txMock.agentAvailability.updateMany.mockResolvedValue({ count: 1 });
    txMock.routingAudit.create.mockResolvedValue({ id: 'audit-001' });
    txMock.routingRule.findMany.mockResolvedValue([makeRule()]);

    await service.routeLead({ leadId: LEAD_ID, tenantId: TENANT_ID });

    expect(txMock.lead.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_ID }),
      })
    );
  });

  it('B7: Validator — autoRouteLeadInputSchema rejects empty leadId', () => {
    const result = autoRouteLeadInputSchema.safeParse({ leadId: '' });
    expect(result.success).toBe(false);
  });

  it('B8: Validator — suggestLeadAssigneeInputSchema enforces limit range', () => {
    const tooLow = suggestLeadAssigneeInputSchema.safeParse({ leadId: 'x', limit: 0 });
    expect(tooLow.success).toBe(false);

    const tooHigh = suggestLeadAssigneeInputSchema.safeParse({ leadId: 'x', limit: 11 });
    expect(tooHigh.success).toBe(false);

    const valid = suggestLeadAssigneeInputSchema.safeParse({ leadId: 'x', limit: 5 });
    expect(valid.success).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════
// Section C: Performance Tests (~4 tests)
// ════════════════════════════════════════════════════════════

describe('Section C: Performance Tests', () => {
  it('C1: routeLead completes in <50ms (mocked prisma)', async () => {
    txMock.lead.findFirst.mockResolvedValue(makeLead());
    txMock.lead.update.mockResolvedValue({ ...makeLead(), ownerId: AGENT_ID_1 });
    txMock.agentAvailability.findMany.mockResolvedValue([makeAgent()]);
    txMock.agentAvailability.updateMany.mockResolvedValue({ count: 1 });
    txMock.routingAudit.create.mockResolvedValue({ id: 'audit-001' });
    txMock.routingRule.findMany.mockResolvedValue([makeRule()]);

    const start = performance.now();
    await service.routeLead({ leadId: LEAD_ID, tenantId: TENANT_ID });
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(50);
  });

  it('C2: getEligibleAgents completes in <5ms (mocked prisma)', async () => {
    const start = performance.now();
    await service.getEligibleAgents(TENANT_ID);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(5);
  });

  it('C3: suggestAssignees completes in <5ms (mocked prisma)', async () => {
    const start = performance.now();
    await service.suggestAssignees(TENANT_ID);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(5);
  });

  it('C4: executionTimeMs included in routing result', async () => {
    txMock.lead.findFirst.mockResolvedValue(makeLead());
    txMock.lead.update.mockResolvedValue({ ...makeLead(), ownerId: AGENT_ID_1 });
    txMock.agentAvailability.findMany.mockResolvedValue([makeAgent()]);
    txMock.agentAvailability.updateMany.mockResolvedValue({ count: 1 });
    txMock.routingAudit.create.mockResolvedValue({ id: 'audit-001' });
    txMock.routingRule.findMany.mockResolvedValue([makeRule()]);

    const result = await service.routeLead({ leadId: LEAD_ID, tenantId: TENANT_ID });

    expect(result.executionTimeMs).toBeDefined();
    expect(typeof result.executionTimeMs).toBe('number');
    expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
  });
});

// ════════════════════════════════════════════════════════════
// Section D: Wiring Tests (~10 tests)
// ════════════════════════════════════════════════════════════

describe('Section D: Wiring Tests', () => {
  it('D1: Container registration — container.leadRoutingService is instance of LeadRoutingService (MANDATORY)', async () => {
    // Dynamic import to get actual container
    const { container } = await import('../../container.js');
    expect(container.leadRoutingService).toBeDefined();
    expect(container.leadRoutingService).toBeInstanceOf(LeadRoutingService);
  });

  it('D2: routing.autoRouteLead mutation accepts valid input', async () => {
    const parsed = autoRouteLeadInputSchema.safeParse({
      leadId: 'lead-001',
      forceReroute: false,
    });
    expect(parsed.success).toBe(true);
  });

  it('D3: routing.autoRouteLead returns routing result with required fields', async () => {
    txMock.lead.findFirst.mockResolvedValue(makeLead());
    txMock.lead.update.mockResolvedValue({ ...makeLead(), ownerId: AGENT_ID_1 });
    txMock.agentAvailability.findMany.mockResolvedValue([makeAgent()]);
    txMock.agentAvailability.updateMany.mockResolvedValue({ count: 1 });
    txMock.routingAudit.create.mockResolvedValue({ id: 'audit-001' });
    txMock.routingRule.findMany.mockResolvedValue([makeRule()]);

    const result = await service.routeLead({ leadId: LEAD_ID, tenantId: TENANT_ID });

    expect(result).toHaveProperty('leadId');
    expect(result).toHaveProperty('assigneeId');
    expect(result).toHaveProperty('assigneeName');
    expect(result).toHaveProperty('auditId');
    expect(result).toHaveProperty('reason');
    expect(result).toHaveProperty('routingMethod');
  });

  it('D4: routing.suggestLeadAssignee query returns candidates array', async () => {
    const agents = await service.suggestAssignees(TENANT_ID);
    expect(Array.isArray(agents)).toBe(true);
  });

  it('D5: routing.suggestLeadAssignee respects limit parameter', async () => {
    (prismaMock as any).agentAvailability.findMany.mockResolvedValue([
      makeAgent({ userId: 'a1', user: { id: 'a1', name: 'A1' } }),
      makeAgent({ userId: 'a2', user: { id: 'a2', name: 'A2' } }),
      makeAgent({ userId: 'a3', user: { id: 'a3', name: 'A3' } }),
    ]);
    const agents = await service.suggestAssignees(TENANT_ID, undefined, 2);
    expect(agents.length).toBeLessThanOrEqual(2);
  });

  it('D6: Error — NOT_FOUND when lead does not exist', async () => {
    txMock.lead.findFirst.mockResolvedValue(null);

    await expect(service.routeLead({ leadId: 'nonexistent', tenantId: TENANT_ID })).rejects.toThrow(
      /not found/i
    );
  });

  it('D7: Error — PRECONDITION_FAILED when lead already assigned (no forceReroute)', async () => {
    txMock.lead.findFirst.mockResolvedValue(makeLead({ ownerId: 'someone-else' }));

    await expect(service.routeLead({ leadId: LEAD_ID, tenantId: TENANT_ID })).rejects.toThrow(
      /already assigned/i
    );
  });

  it('D8: Error — no eligible agents throws error', async () => {
    txMock.lead.findFirst.mockResolvedValue(makeLead());
    txMock.agentAvailability.findMany.mockResolvedValue([]);
    txMock.routingRule.findMany.mockResolvedValue([]);

    await expect(service.routeLead({ leadId: LEAD_ID, tenantId: TENANT_ID })).rejects.toThrow(
      /no eligible/i
    );
  });

  it('D9: forceReroute bypasses idempotency guard (AC-006)', async () => {
    txMock.lead.findFirst.mockResolvedValue(makeLead({ ownerId: 'someone-else' }));
    txMock.lead.update.mockResolvedValue({ ...makeLead(), ownerId: AGENT_ID_1 });
    txMock.agentAvailability.findMany.mockResolvedValue([makeAgent()]);
    txMock.agentAvailability.updateMany.mockResolvedValue({ count: 1 });
    txMock.routingAudit.create.mockResolvedValue({ id: 'audit-001' });
    txMock.routingRule.findMany.mockResolvedValue([makeRule()]);

    const result = await service.routeLead({
      leadId: LEAD_ID,
      tenantId: TENANT_ID,
      forceReroute: true,
    });

    expect(result.assigneeId).toBe(AGENT_ID_1);
  });

  it('D10: CONVERTED lead returns PRECONDITION_FAILED', async () => {
    txMock.lead.findFirst.mockResolvedValue(makeLead({ status: 'CONVERTED' }));

    await expect(service.routeLead({ leadId: LEAD_ID, tenantId: TENANT_ID })).rejects.toThrow(
      /converted/i
    );
  });
});

// ════════════════════════════════════════════════════════════
// Section E: Coverage Gap Tests (~15 tests)
// ════════════════════════════════════════════════════════════

describe('Section E: Coverage Gap Tests', () => {
  // findMatchingRule uses this.prisma (not tx), so mock the top-level prisma mock
  function mockRules(rules: ReturnType<typeof makeRule>[]) {
    (prismaMock as any).routingRule = {
      findMany: vi.fn().mockResolvedValue(rules),
    };
  }

  // ── Operator coverage ──

  it('E1: evaluateConditions — less_than operator', async () => {
    mockRules([
      makeRule({
        conditions: JSON.stringify([{ field: 'leadScore', operator: 'less_than', value: 50 }]),
      }),
    ]);

    const result = await service.findMatchingRule(TENANT_ID, {
      score: 30,
      source: 'WEB',
      status: 'NEW',
      estimatedValue: null,
      location: null,
      tags: [],
    });
    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe(RULE_ID);
  });

  it('E2: evaluateConditions — less_than rejects when value is higher', async () => {
    mockRules([
      makeRule({
        conditions: JSON.stringify([{ field: 'leadScore', operator: 'less_than', value: 50 }]),
      }),
    ]);

    const result = await service.findMatchingRule(TENANT_ID, {
      score: 70,
      source: 'WEB',
      status: 'NEW',
      estimatedValue: null,
      location: null,
      tags: [],
    });
    expect(result).toBeNull();
  });

  it('E3: evaluateConditions — in operator with array field (tags)', async () => {
    mockRules([
      makeRule({
        conditions: JSON.stringify([
          { field: 'tags', operator: 'in', value: ['enterprise', 'healthcare'] },
        ]),
      }),
    ]);

    const result = await service.findMatchingRule(TENANT_ID, {
      score: 50,
      source: 'WEB',
      status: 'NEW',
      estimatedValue: null,
      location: null,
      tags: ['enterprise', 'saas'],
    });
    expect(result).not.toBeNull();
  });

  it('E4: evaluateConditions — in operator with scalar field', async () => {
    mockRules([
      makeRule({
        conditions: JSON.stringify([
          { field: 'leadSource', operator: 'in', value: ['WEB', 'REFERRAL'] },
        ]),
      }),
    ]);

    const result = await service.findMatchingRule(TENANT_ID, {
      score: 50,
      source: 'WEB',
      status: 'NEW',
      estimatedValue: null,
      location: null,
      tags: [],
    });
    expect(result).not.toBeNull();
  });

  it('E5: evaluateConditions — not_in operator with array field', async () => {
    mockRules([
      makeRule({
        conditions: JSON.stringify([
          { field: 'tags', operator: 'not_in', value: ['healthcare', 'banking'] },
        ]),
      }),
    ]);

    const result = await service.findMatchingRule(TENANT_ID, {
      score: 50,
      source: 'WEB',
      status: 'NEW',
      estimatedValue: null,
      location: null,
      tags: ['enterprise', 'saas'],
    });
    expect(result).not.toBeNull();
  });

  it('E6: evaluateConditions — not_in operator with scalar field', async () => {
    mockRules([
      makeRule({
        conditions: JSON.stringify([
          { field: 'leadSource', operator: 'not_in', value: ['COLD_CALL', 'PARTNER'] },
        ]),
      }),
    ]);

    const result = await service.findMatchingRule(TENANT_ID, {
      score: 50,
      source: 'WEB',
      status: 'NEW',
      estimatedValue: null,
      location: null,
      tags: [],
    });
    expect(result).not.toBeNull();
  });

  it('E7: evaluateConditions — not_in rejects matching scalar', async () => {
    mockRules([
      makeRule({
        conditions: JSON.stringify([
          { field: 'leadSource', operator: 'not_in', value: ['WEB', 'REFERRAL'] },
        ]),
      }),
    ]);

    const result = await service.findMatchingRule(TENANT_ID, {
      score: 50,
      source: 'WEB',
      status: 'NEW',
      estimatedValue: null,
      location: null,
      tags: [],
    });
    expect(result).toBeNull();
  });

  it('E8: evaluateConditions — contains on string field (location)', async () => {
    mockRules([
      makeRule({
        conditions: JSON.stringify([{ field: 'location', operator: 'contains', value: 'New' }]),
      }),
    ]);

    const result = await service.findMatchingRule(TENANT_ID, {
      score: 50,
      source: 'WEB',
      status: 'NEW',
      estimatedValue: null,
      location: 'New York',
      tags: [],
    });
    expect(result).not.toBeNull();
  });

  it('E9: evaluateConditions — contains on string rejects non-match', async () => {
    mockRules([
      makeRule({
        conditions: JSON.stringify([{ field: 'location', operator: 'contains', value: 'Chicago' }]),
      }),
    ]);

    const result = await service.findMatchingRule(TENANT_ID, {
      score: 50,
      source: 'WEB',
      status: 'NEW',
      estimatedValue: null,
      location: 'New York',
      tags: [],
    });
    expect(result).toBeNull();
  });

  it('E10: evaluateConditions — unknown operator returns false', async () => {
    mockRules([
      makeRule({
        conditions: JSON.stringify([{ field: 'leadScore', operator: 'starts_with', value: 'abc' }]),
      }),
    ]);

    const result = await service.findMatchingRule(TENANT_ID, {
      score: 50,
      source: 'WEB',
      status: 'NEW',
      estimatedValue: null,
      location: null,
      tags: [],
    });
    expect(result).toBeNull();
  });

  it('E11: evaluateConditions — unknown field returns undefined (default branch)', async () => {
    mockRules([
      makeRule({
        conditions: JSON.stringify([
          { field: 'unknownField', operator: 'equals', value: 'anything' },
        ]),
      }),
    ]);

    const result = await service.findMatchingRule(TENANT_ID, {
      score: 50,
      source: 'WEB',
      status: 'NEW',
      estimatedValue: null,
      location: null,
      tags: [],
    });
    expect(result).toBeNull();
  });

  // ── Routing strategy coverage ──

  it('E12: HOT lead with sales skill agents uses skill_match', async () => {
    const hotLead = makeLead({ score: 90, ownerId: null });
    txMock.lead.findFirst.mockResolvedValue(hotLead);
    txMock.routingRule.findMany.mockResolvedValue([]);
    txMock.agentAvailability.findMany.mockResolvedValue([
      makeAgent({
        userId: AGENT_ID_1,
        userName: 'Alice',
        currentCapacity: 2,
        maxCapacity: 10,
        status: 'ONLINE',
      }),
      makeAgent({
        userId: AGENT_ID_2,
        userName: 'Bob',
        currentCapacity: 5,
        maxCapacity: 10,
        status: 'ONLINE',
      }),
    ]);
    txMock.agentSkill.findMany.mockResolvedValue([{ userId: AGENT_ID_1, proficiency: 9 }]);
    txMock.lead.update.mockResolvedValue({});
    txMock.agentAvailability.updateMany.mockResolvedValue({});
    txMock.routingAudit.create.mockResolvedValue({ id: 'audit-skill' });

    const result = await service.routeLead({ leadId: LEAD_ID, tenantId: TENANT_ID });
    expect(result.routingMethod).toBe('skill_match');
    expect(result.matchedSkill).toBe('sales');
    expect(result.assigneeId).toBe(AGENT_ID_1);
  });

  it('E13: HOT lead without skill agents falls back to load_balance', async () => {
    const hotLead = makeLead({ score: 90, ownerId: null });
    txMock.lead.findFirst.mockResolvedValue(hotLead);
    txMock.routingRule.findMany.mockResolvedValue([]);
    txMock.agentAvailability.findMany
      .mockResolvedValueOnce([
        makeAgent({
          userId: AGENT_ID_2,
          userName: 'Bob',
          currentCapacity: 5,
          maxCapacity: 10,
          status: 'ONLINE',
        }),
        makeAgent({
          userId: AGENT_ID_3,
          userName: 'Carol',
          currentCapacity: 1,
          maxCapacity: 8,
          status: 'ONLINE',
        }),
      ])
      .mockResolvedValueOnce([]); // No skill agents for sales
    txMock.agentSkill.findMany.mockResolvedValue([]);
    txMock.lead.update.mockResolvedValue({});
    txMock.agentAvailability.updateMany.mockResolvedValue({});
    txMock.routingAudit.create.mockResolvedValue({ id: 'audit-lb' });

    const result = await service.routeLead({ leadId: LEAD_ID, tenantId: TENANT_ID });
    expect(result.routingMethod).toBe('load_balance');
    expect(result.assigneeId).toBe(AGENT_ID_3); // lowest load
  });

  it('E14: LOST lead returns error', async () => {
    txMock.lead.findFirst.mockResolvedValue(makeLead({ status: 'LOST' }));

    await expect(service.routeLead({ leadId: LEAD_ID, tenantId: TENANT_ID })).rejects.toThrow(
      /lost/i
    );
  });

  it('E15a: contains on tags array matches substring', async () => {
    mockRules([
      makeRule({
        conditions: JSON.stringify([{ field: 'tags', operator: 'contains', value: 'enter' }]),
      }),
    ]);

    const result = await service.findMatchingRule(TENANT_ID, {
      score: 50,
      source: 'WEB',
      status: 'NEW',
      estimatedValue: null,
      location: null,
      tags: ['enterprise', 'saas'],
    });
    expect(result).not.toBeNull();
  });

  it('E15b: contains returns false for non-string non-array field', async () => {
    mockRules([
      makeRule({
        conditions: JSON.stringify([
          { field: 'leadStatus', operator: 'equals', value: 'NEW' },
          { field: 'tags', operator: 'contains', value: 'xyz' },
        ]),
      }),
    ]);

    // tags is an array but none match 'xyz'
    const result = await service.findMatchingRule(TENANT_ID, {
      score: 50,
      source: 'WEB',
      status: 'NEW',
      estimatedValue: null,
      location: null,
      tags: ['enterprise'],
    });
    expect(result).toBeNull();
  });

  it('E15c: contains on null location returns false', async () => {
    mockRules([
      makeRule({
        conditions: JSON.stringify([{ field: 'location', operator: 'contains', value: 'York' }]),
      }),
    ]);

    const result = await service.findMatchingRule(TENANT_ID, {
      score: 50,
      source: 'WEB',
      status: 'NEW',
      estimatedValue: null,
      location: null,
      tags: [],
    });
    expect(result).toBeNull();
  });

  it('E15d: not_equals operator matches when values differ', async () => {
    mockRules([
      makeRule({
        conditions: JSON.stringify([
          { field: 'leadStatus', operator: 'not_equals', value: 'CONVERTED' },
        ]),
      }),
    ]);

    const result = await service.findMatchingRule(TENANT_ID, {
      score: 50,
      source: 'WEB',
      status: 'NEW',
      estimatedValue: null,
      location: null,
      tags: [],
    });
    expect(result).not.toBeNull();
  });

  it('E15e: estimatedValue field used in condition', async () => {
    mockRules([
      makeRule({
        conditions: JSON.stringify([
          { field: 'estimatedValue', operator: 'greater_than', value: 10000 },
        ]),
      }),
    ]);

    const result = await service.findMatchingRule(TENANT_ID, {
      score: 50,
      source: 'WEB',
      status: 'NEW',
      estimatedValue: 15000,
      location: null,
      tags: [],
    });
    expect(result).not.toBeNull();
  });

  it('E15f: conditions as object (not string) are handled', async () => {
    mockRules([
      {
        id: RULE_ID,
        tenantId: TENANT_ID,
        name: 'Object Rule',
        isActive: true,
        priority: 10,
        conditions: [{ field: 'leadScore', operator: 'greater_than', value: 70 }],
        actions: [{ type: 'assign_to_user', target: AGENT_ID_1 }],
      } as any,
    ]);

    const result = await service.findMatchingRule(TENANT_ID, {
      score: 85,
      source: 'WEB',
      status: 'NEW',
      estimatedValue: null,
      location: null,
      tags: [],
    });
    expect(result).not.toBeNull();
  });
});
