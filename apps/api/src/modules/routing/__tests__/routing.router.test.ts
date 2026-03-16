/**
 * Routing Router Tests - PG-132
 *
 * Tests for routing rule CRUD, assignments, agent workload, and lead queue.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { routingRouter } from '../routing.router';
import { prismaMock, createTestContext, TEST_UUIDS } from '../../../test/setup';

const mockRule = {
  id: 'rule-1',
  name: 'High Score Leads',
  description: 'Route high-score leads to senior team',
  priority: 0,
  isActive: true,
  conditions: [{ field: 'leadScore', operator: 'greater_than', value: 80 }],
  actions: [{ type: 'assign_to_team', target: 'senior-sales' }],
  createdBy: TEST_UUIDS.user1,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

const mockRule2 = {
  ...mockRule,
  id: 'rule-2',
  name: 'Website Leads',
  priority: 1,
  conditions: [{ field: 'leadSource', operator: 'equals', value: 'WEBSITE' }],
};

describe('Routing Router', () => {
  let caller: ReturnType<typeof routingRouter.createCaller>;

  beforeEach(() => {
    const ctx = createTestContext();
    caller = routingRouter.createCaller(ctx);
  });

  describe('list', () => {
    it('should return paginated rules', async () => {
      (prismaMock.routingRule.findMany as any).mockResolvedValue([mockRule, mockRule2]);

      const result = await caller.list({ limit: 20 });

      expect(result.items).toHaveLength(2);
      expect(result.items[0].name).toBe('High Score Leads');
      expect(result.nextCursor).toBeUndefined();
    });

    it('should filter by isActive', async () => {
      (prismaMock.routingRule.findMany as any).mockResolvedValue([mockRule]);

      const result = await caller.list({ isActive: true });

      expect(result.items).toHaveLength(1);
      expect(prismaMock.routingRule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isActive: true }),
        })
      );
    });

    it('should return cursor for pagination', async () => {
      const rules = Array.from({ length: 21 }, (_, i) => ({
        ...mockRule,
        id: `rule-${i}`,
        priority: i,
      }));
      (prismaMock.routingRule.findMany as any).mockResolvedValue(rules);

      const result = await caller.list({ limit: 20 });

      expect(result.items).toHaveLength(20);
      expect(result.nextCursor).toBe('rule-20');
    });
  });

  describe('get', () => {
    it('should return a single rule by ID', async () => {
      (prismaMock.routingRule.findFirst as any).mockResolvedValue(mockRule);

      const result = await caller.get({ id: 'rule-1' });

      expect(result).toBeDefined();
      expect(result!.name).toBe('High Score Leads');
    });

    it('should return null for non-existent ID', async () => {
      (prismaMock.routingRule.findFirst as any).mockResolvedValue(null);

      const result = await caller.get({ id: 'non-existent' });

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create a rule with conditions and actions', async () => {
      (prismaMock.routingRule.create as any).mockResolvedValue(mockRule);

      const result = await caller.create({
        name: 'High Score Leads',
        description: 'Route high-score leads to senior team',
        conditions: [{ field: 'leadScore', operator: 'greater_than', value: 80 }],
        actions: [{ type: 'assign_to_team', target: 'senior-sales' }],
      });

      expect(result.name).toBe('High Score Leads');
      expect(prismaMock.routingRule.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'High Score Leads',
            createdBy: TEST_UUIDS.user1,
          }),
        })
      );
    });

    it('should reject invalid input (empty name)', async () => {
      await expect(
        caller.create({
          name: '',
          conditions: [{ field: 'leadScore', operator: 'greater_than', value: 80 }],
          actions: [{ type: 'assign_to_team', target: 'sales' }],
        })
      ).rejects.toThrow();
    });

    it('should reject invalid input (no conditions)', async () => {
      await expect(
        caller.create({
          name: 'Test Rule',
          conditions: [],
          actions: [{ type: 'assign_to_team', target: 'sales' }],
        })
      ).rejects.toThrow();
    });
  });

  describe('update', () => {
    it('should update rule fields', async () => {
      (prismaMock.routingRule.findFirst as any).mockResolvedValue(mockRule);
      (prismaMock.routingRule.update as any).mockResolvedValue({
        ...mockRule,
        name: 'Updated Name',
      });

      const result = await caller.update({ id: 'rule-1', name: 'Updated Name' });

      expect(result.name).toBe('Updated Name');
    });

    it('should throw NOT_FOUND for non-existent rule', async () => {
      (prismaMock.routingRule.findFirst as any).mockResolvedValue(null);

      await expect(caller.update({ id: 'non-existent', name: 'Test' })).rejects.toThrow(
        'Routing rule not found'
      );
    });
  });

  describe('delete', () => {
    it('should delete a rule by ID', async () => {
      (prismaMock.routingRule.findFirst as any).mockResolvedValue(mockRule);
      (prismaMock.routingRule.delete as any).mockResolvedValue(mockRule);

      const result = await caller.delete({ id: 'rule-1' });

      expect(result.id).toBe('rule-1');
    });

    it('should throw NOT_FOUND for non-existent rule', async () => {
      (prismaMock.routingRule.findFirst as any).mockResolvedValue(null);

      await expect(caller.delete({ id: 'non-existent' })).rejects.toThrow('Routing rule not found');
    });
  });

  describe('reorder', () => {
    it('should batch update priorities', async () => {
      // Mock tenant ownership verification
      (prismaMock.routingRule.count as any).mockResolvedValue(2);
      (prismaMock.$transaction as any).mockResolvedValue([
        { ...mockRule, priority: 1 },
        { ...mockRule2, priority: 0 },
      ]);

      const result = await caller.reorder({
        rules: [
          { id: 'rule-1', priority: 1 },
          { id: 'rule-2', priority: 0 },
        ],
      });

      expect(result.success).toBe(true);
      expect(prismaMock.routingRule.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { in: ['rule-1', 'rule-2'] },
          }),
        })
      );
    });

    it('should reject reorder when rules belong to another tenant', async () => {
      (prismaMock.routingRule.count as any).mockResolvedValue(1); // Only 1 of 2 owned

      await expect(
        caller.reorder({
          rules: [
            { id: 'rule-1', priority: 1 },
            { id: 'rule-2', priority: 0 },
          ],
        })
      ).rejects.toThrow('One or more routing rules do not belong to this tenant');
    });
  });

  describe('toggle', () => {
    it('should toggle isActive boolean', async () => {
      (prismaMock.routingRule.findFirst as any).mockResolvedValue(mockRule);
      (prismaMock.routingRule.update as any).mockResolvedValue({
        ...mockRule,
        isActive: false,
      });

      const result = await caller.toggle({ id: 'rule-1', isActive: false });

      expect(result.isActive).toBe(false);
    });
  });

  describe('getAssignments', () => {
    it('should return recent RoutingAudit entries', async () => {
      const mockAudit = {
        id: 'audit-1',
        ticketId: 'ticket-1',
        reason: 'rule_match',
        ruleId: 'rule-1',
        ruleName: 'High Score Leads',
        fromUserId: null,
        fromUserName: null,
        toUserId: TEST_UUIDS.user1,
        toUserName: 'Test User',
        details: { leadId: TEST_UUIDS.lead1 },
        createdAt: new Date(),
      };
      (prismaMock.routingAudit.findMany as any).mockResolvedValue([mockAudit]);

      const result = await caller.getAssignments({ limit: 20 });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].reason).toBe('rule_match');
      expect(result.items[0].rule?.name).toBe('High Score Leads');
    });
  });

  describe('getAgentWorkload', () => {
    it('should return agents with capacity data', async () => {
      const mockAgent = {
        id: 'avail-1',
        userId: TEST_UUIDS.user1,
        userName: 'Agent 1',
        status: 'ONLINE',
        currentCapacity: 3,
        maxCapacity: 10,
        shiftStart: new Date('2024-01-01T09:00:00Z'),
        shiftEnd: new Date('2024-01-01T17:00:00Z'),
        lastActiveAt: null,
        statusMessage: null,
        updatedAt: new Date(),
      };
      (prismaMock.agentAvailability.findMany as any).mockResolvedValue([mockAgent]);
      (prismaMock.agentSkill.findMany as any).mockResolvedValue([
        {
          id: 'skill-1',
          userId: TEST_UUIDS.user1,
          skillName: 'Sales',
          proficiency: 4,
          tenantId: TEST_UUIDS.tenant,
        },
      ]);

      const result = await caller.getAgentWorkload();

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('ONLINE');
      expect(result[0].skills).toHaveLength(1);
      expect(result[0].skills[0].skillName).toBe('Sales');
    });
  });

  describe('getLeadQueue', () => {
    it('should return unassigned leads', async () => {
      const mockLead = {
        id: TEST_UUIDS.lead1,
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        score: 85,
        source: 'WEBSITE',
        status: 'NEW',
        estimatedValue: 5000,
        createdAt: new Date(),
      };
      (prismaMock.lead.findMany as any).mockResolvedValue([mockLead]);

      const result = await caller.getLeadQueue({});

      expect(result).toHaveLength(1);
      expect(result[0].score).toBe(85);
    });

    it('should filter by minimum score', async () => {
      (prismaMock.lead.findMany as any).mockResolvedValue([]);

      await caller.getLeadQueue({ scoreMin: 90 });

      expect(prismaMock.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            score: { gte: 90 },
            status: 'NEW',
          }),
        })
      );
    });
  });

  describe('assignLead', () => {
    it('should create RoutingAudit entry and update lead ownerId', async () => {
      const mockLead = {
        id: TEST_UUIDS.lead1,
        tenantId: TEST_UUIDS.tenant,
      };
      const mockAudit = {
        id: 'audit-1',
        tenantId: TEST_UUIDS.tenant,
        ticketId: TEST_UUIDS.lead1,
        reason: 'manual',
        ruleId: null,
        ruleName: null,
        fromUserId: null,
        fromUserName: null,
        toUserId: TEST_UUIDS.user1,
        toUserName: '',
        details: { leadId: TEST_UUIDS.lead1 },
        createdAt: new Date(),
      };

      (prismaMock.$transaction as any).mockImplementation(async (fn: (tx: any) => Promise<any>) => {
        return fn({
          lead: {
            findFirst: async () => mockLead,
            update: async () => ({}),
          },
          routingAudit: { create: async () => mockAudit },
        });
      });

      const result = await caller.assignLead({
        leadId: TEST_UUIDS.lead1,
        userId: TEST_UUIDS.user1,
        reason: 'manual',
      });

      expect(result.reason).toBe('manual');
    });

    it('should reject assignment for lead not in tenant', async () => {
      (prismaMock.$transaction as any).mockImplementation(async (fn: (tx: any) => Promise<any>) => {
        return fn({
          lead: {
            findFirst: async () => null, // Lead not found in tenant
            update: async () => ({}),
          },
          routingAudit: { create: async () => ({}) },
        });
      });

      await expect(
        caller.assignLead({
          leadId: 'foreign-lead',
          userId: TEST_UUIDS.user1,
          reason: 'manual',
        })
      ).rejects.toThrow('Lead not found');
    });
  });

  describe('toggle', () => {
    it('should throw NOT_FOUND when rule does not exist', async () => {
      (prismaMock.routingRule.findFirst as any).mockResolvedValue(null);

      await expect(caller.toggle({ id: 'nonexistent-rule', isActive: false })).rejects.toThrow(
        'Routing rule not found'
      );
    });
  });

  describe('getAssignments', () => {
    it('should return paginated assignments with cursor', async () => {
      const audits = Array.from({ length: 21 }, (_, i) => ({
        id: `audit-${i}`,
        tenantId: TEST_UUIDS.tenant,
        ticketId: `ticket-${i}`,
        ruleId: null,
        ruleName: null,
        fromUserId: null,
        fromUserName: null,
        toUserId: TEST_UUIDS.user1,
        toUserName: 'Alice',
        reason: 'manual',
        details: null,
        createdAt: new Date(),
      }));
      (prismaMock.routingAudit.findMany as any).mockResolvedValue(audits);

      const result = await caller.getAssignments({ limit: 20 });

      expect(result.items).toHaveLength(20);
      expect(result.nextCursor).toBe('audit-20');
    });

    it('should accept cursor for pagination', async () => {
      (prismaMock.routingAudit.findMany as any).mockResolvedValue([
        {
          id: 'audit-cursor',
          tenantId: TEST_UUIDS.tenant,
          ticketId: 'ticket-1',
          ruleId: 'rule-1',
          ruleName: 'Test Rule',
          fromUserId: null,
          fromUserName: null,
          toUserId: TEST_UUIDS.user1,
          toUserName: 'Alice',
          reason: 'rule_match',
          details: null,
          createdAt: new Date(),
        },
      ]);

      const result = await caller.getAssignments({ limit: 20, cursor: 'prev-audit' });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].rule).toEqual({ name: 'Test Rule' });
      expect(result.nextCursor).toBeUndefined();
    });
  });

  describe('getAgentWorkload', () => {
    it('should return skills=[] when agent has no skills', async () => {
      const mockAgent = {
        userId: TEST_UUIDS.user1,
        userName: 'Agent NoSkills',
        status: 'ONLINE',
        currentCapacity: 2,
        maxCapacity: 10,
        tenantId: TEST_UUIDS.tenant,
        user: { id: TEST_UUIDS.user1, name: 'Agent NoSkills', email: 'a@b.com' },
      };
      (prismaMock.agentAvailability.findMany as any).mockResolvedValue([mockAgent]);
      (prismaMock.agentSkill.findMany as any).mockResolvedValue([]);

      const result = await caller.getAgentWorkload();

      expect(result[0].skills).toEqual([]);
    });
  });

  describe('getAssignments (branch coverage)', () => {
    it('should show rule=null when audit has no ruleId and ruleName is null', async () => {
      (prismaMock.routingAudit.findMany as any).mockResolvedValue([
        {
          id: 'audit-norule',
          tenantId: TEST_UUIDS.tenant,
          ticketId: 'ticket-1',
          ruleId: null,
          ruleName: null,
          fromUserId: null,
          fromUserName: null,
          toUserId: TEST_UUIDS.user1,
          toUserName: 'Alice',
          reason: 'manual',
          details: null,
          createdAt: new Date(),
        },
      ]);

      const result = await caller.getAssignments({ limit: 20 });
      expect(result.items[0].rule).toBeNull();
    });

    it('should show Unknown when audit has ruleId but no ruleName', async () => {
      (prismaMock.routingAudit.findMany as any).mockResolvedValue([
        {
          id: 'audit-unknownrule',
          tenantId: TEST_UUIDS.tenant,
          ticketId: 'ticket-1',
          ruleId: 'rule-1',
          ruleName: null,
          fromUserId: null,
          fromUserName: null,
          toUserId: TEST_UUIDS.user1,
          toUserName: 'Alice',
          reason: 'rule_match',
          details: null,
          createdAt: new Date(),
        },
      ]);

      const result = await caller.getAssignments({ limit: 20 });
      expect(result.items[0].rule).toEqual({ name: 'Unknown' });
    });
  });

  describe('getLeadQueue', () => {
    it('should filter by source when provided', async () => {
      (prismaMock.lead.findMany as any).mockResolvedValue([]);

      await caller.getLeadQueue({ source: 'WEBSITE' });

      expect(prismaMock.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            source: 'WEBSITE',
          }),
        })
      );
    });
  });

  // ── IFC-030: Auto-routing and suggestions ──

  describe('autoRouteLead', () => {
    it('should throw when LeadRoutingService not configured', async () => {
      const ctx = createTestContext({
        services: { ...createTestContext().services!, leadRouting: undefined as any },
      });
      const callerWithCtx = routingRouter.createCaller(ctx);

      await expect(callerWithCtx.autoRouteLead({ leadId: TEST_UUIDS.lead1 })).rejects.toThrow(
        'LeadRoutingService not configured'
      );
    });

    it('should call leadRouting service and return routing result', async () => {
      const ctx = createTestContext();
      const callerWithCtx = routingRouter.createCaller(ctx);

      (ctx.services!.leadRouting as any).routeLead.mockResolvedValue({
        leadId: TEST_UUIDS.lead1,
        assigneeId: TEST_UUIDS.user1,
        assigneeName: 'Alice Agent',
        auditId: 'audit-001',
        reason: 'rule_match',
        routingMethod: 'rule_match',
        matchedSkill: null,
        ruleId: 'rule-1',
        score: 0.8,
        executionTimeMs: 5,
        events: [],
      });

      const result = await callerWithCtx.autoRouteLead({
        leadId: TEST_UUIDS.lead1,
      });

      expect(result.assignedUserId).toBe(TEST_UUIDS.user1);
      expect(result.assignedUserName).toBe('Alice Agent');
      expect(result.routingMethod).toBe('rule_match');
      expect(result.auditId).toBe('audit-001');
    });

    it('should pass forceReroute flag through to service', async () => {
      const ctx = createTestContext();
      const callerWithCtx = routingRouter.createCaller(ctx);

      (ctx.services!.leadRouting as any).routeLead.mockResolvedValue({
        leadId: TEST_UUIDS.lead1,
        assigneeId: TEST_UUIDS.user1,
        assigneeName: 'Alice Agent',
        auditId: 'audit-002',
        reason: 'load_balance',
        routingMethod: 'load_balance',
        matchedSkill: null,
        ruleId: null,
        score: 0.5,
        executionTimeMs: 3,
        events: [],
      });

      await callerWithCtx.autoRouteLead({
        leadId: TEST_UUIDS.lead1,
        forceReroute: true,
      });

      expect((ctx.services!.leadRouting as any).routeLead).toHaveBeenCalledWith(
        expect.objectContaining({ forceReroute: true })
      );
    });
  });

  describe('suggestLeadAssignee', () => {
    it('should return candidates from service', async () => {
      const ctx = createTestContext();
      const callerWithCtx = routingRouter.createCaller(ctx);

      (ctx.services!.leadRouting as any).suggestAssignees.mockResolvedValue([
        {
          agentId: TEST_UUIDS.user1,
          name: 'Alice',
          skills: [],
          currentLoad: 2,
          maxCapacity: 10,
          status: 'ONLINE',
        },
      ]);

      const result = await callerWithCtx.suggestLeadAssignee({
        leadId: TEST_UUIDS.lead1,
      });

      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0].agentId).toBe(TEST_UUIDS.user1);
    });

    it('should pass scoreTier and limit to service', async () => {
      const ctx = createTestContext();
      const callerWithCtx = routingRouter.createCaller(ctx);

      (ctx.services!.leadRouting as any).suggestAssignees.mockResolvedValue([]);

      await callerWithCtx.suggestLeadAssignee({
        leadId: TEST_UUIDS.lead1,
        scoreTier: 'HOT',
        limit: 3,
      });

      expect((ctx.services!.leadRouting as any).suggestAssignees).toHaveBeenCalledWith(
        TEST_UUIDS.tenant,
        'HOT',
        3
      );
    });
  });
});
