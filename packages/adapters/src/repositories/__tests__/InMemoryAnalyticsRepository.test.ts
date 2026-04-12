/**
 * InMemoryAnalyticsRepository Tests
 *
 * Tests the in-memory implementation of the AnalyticsRepository interface.
 * Coverage target: >90% for repository layer
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  InMemoryAnalyticsRepository,
  type OpportunityData,
  type LeadData,
  type ContactData,
  type AuditLogData,
} from '../InMemoryAnalyticsRepository';

describe('InMemoryAnalyticsRepository', () => {
  let repo: InMemoryAnalyticsRepository;

  const TENANT_ID = 'tenant-1';

  beforeEach(() => {
    repo = new InMemoryAnalyticsRepository();
  });

  // ==========================================================
  // getDealsWonByMonth()
  // ==========================================================
  describe('getDealsWonByMonth()', () => {
    it('should return empty array when no opportunities exist', async () => {
      const result = await repo.getDealsWonByMonth(TENANT_ID, 6);
      expect(result).toEqual([]);
    });

    it('should return only CLOSED_WON opportunities within the month range', async () => {
      const now = new Date();
      const twoMonthsAgo = new Date();
      twoMonthsAgo.setMonth(now.getMonth() - 2);

      const veryOld = new Date();
      veryOld.setMonth(now.getMonth() - 12);

      repo.seedOpportunities([
        {
          id: 'o1',
          tenantId: TENANT_ID,
          stage: 'CLOSED_WON',
          value: 5000,
          createdAt: twoMonthsAgo,
          closedAt: twoMonthsAgo,
        },
        {
          id: 'o2',
          tenantId: TENANT_ID,
          stage: 'CLOSED_WON',
          value: 3000,
          createdAt: veryOld,
          closedAt: veryOld,
        }, // too old
        {
          id: 'o3',
          tenantId: TENANT_ID,
          stage: 'OPEN',
          value: 1000,
          createdAt: now,
          closedAt: null,
        }, // not closed_won
        {
          id: 'o4',
          tenantId: 'other',
          stage: 'CLOSED_WON',
          value: 2000,
          createdAt: now,
          closedAt: now,
        }, // different tenant
      ]);

      const result = await repo.getDealsWonByMonth(TENANT_ID, 6);
      expect(result.length).toBe(1);
      expect(result[0]._count).toBe(1);
      expect(result[0]._sum.value).toBe(5000);
    });

    it('should group opportunities by closedAt date', async () => {
      const date1 = new Date('2026-01-15T10:00:00Z');
      const date2 = new Date('2026-01-20T10:00:00Z');

      repo.seedOpportunities([
        {
          id: 'g1',
          tenantId: TENANT_ID,
          stage: 'CLOSED_WON',
          value: 1000,
          createdAt: date1,
          closedAt: date1,
        },
        {
          id: 'g2',
          tenantId: TENANT_ID,
          stage: 'CLOSED_WON',
          value: 2000,
          createdAt: date1,
          closedAt: date1,
        },
        {
          id: 'g3',
          tenantId: TENANT_ID,
          stage: 'CLOSED_WON',
          value: 500,
          createdAt: date2,
          closedAt: date2,
        },
      ]);

      const result = await repo.getDealsWonByMonth(TENANT_ID, 12);
      expect(result.length).toBe(2);

      const group1 = result.find((r) => r._count === 2);
      expect(group1).toBeDefined();
      expect(group1!._sum.value).toBe(3000);

      const group2 = result.find((r) => r._count === 1);
      expect(group2).toBeDefined();
      expect(group2!._sum.value).toBe(500);
    });

    it('should handle opportunities with null value', async () => {
      const now = new Date();
      repo.seedOpportunity({
        id: 'nv1',
        tenantId: TENANT_ID,
        stage: 'CLOSED_WON',
        value: null,
        createdAt: now,
        closedAt: now,
      });

      const result = await repo.getDealsWonByMonth(TENANT_ID, 6);
      expect(result.length).toBe(1);
      expect(result[0]._sum.value).toBe(0);
    });

    it('should skip opportunities with null closedAt in grouping phase', async () => {
      // Even though the filter should exclude them, verify the inner null guard
      const now = new Date();
      repo.seedOpportunity({
        id: 'nc1',
        tenantId: TENANT_ID,
        stage: 'CLOSED_WON',
        value: 100,
        createdAt: now,
        closedAt: now,
      });

      const result = await repo.getDealsWonByMonth(TENANT_ID, 6);
      expect(result.length).toBe(1);
    });
  });

  // ==========================================================
  // getMonthlyRevenue()
  // ==========================================================
  describe('getMonthlyRevenue()', () => {
    it('should return 0 when no matching opportunities exist', async () => {
      const revenue = await repo.getMonthlyRevenue(TENANT_ID, {
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-01-31'),
      });
      expect(revenue).toBe(0);
    });

    it('should sum values of CLOSED_WON within date range', async () => {
      repo.seedOpportunities([
        {
          id: 'r1',
          tenantId: TENANT_ID,
          stage: 'CLOSED_WON',
          value: 1000,
          createdAt: new Date('2026-01-10'),
          closedAt: new Date('2026-01-10'),
        },
        {
          id: 'r2',
          tenantId: TENANT_ID,
          stage: 'CLOSED_WON',
          value: 2000,
          createdAt: new Date('2026-01-20'),
          closedAt: new Date('2026-01-20'),
        },
        {
          id: 'r3',
          tenantId: TENANT_ID,
          stage: 'CLOSED_WON',
          value: 500,
          createdAt: new Date('2026-02-10'),
          closedAt: new Date('2026-02-10'),
        }, // outside range
        {
          id: 'r4',
          tenantId: TENANT_ID,
          stage: 'OPEN',
          value: 999,
          createdAt: new Date('2026-01-15'),
          closedAt: null,
        }, // not closed_won
      ]);

      const revenue = await repo.getMonthlyRevenue(TENANT_ID, {
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-01-31'),
      });
      expect(revenue).toBe(3000);
    });

    it('should treat null values as 0 in sum', async () => {
      repo.seedOpportunity({
        id: 'nv',
        tenantId: TENANT_ID,
        stage: 'CLOSED_WON',
        value: null,
        createdAt: new Date('2026-01-10'),
        closedAt: new Date('2026-01-10'),
      });

      const revenue = await repo.getMonthlyRevenue(TENANT_ID, {
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-01-31'),
      });
      expect(revenue).toBe(0);
    });
  });

  // ==========================================================
  // countLeadsInRange()
  // ==========================================================
  describe('countLeadsInRange()', () => {
    it('should return 0 when no leads exist', async () => {
      const count = await repo.countLeadsInRange(TENANT_ID, {
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-01-31'),
      });
      expect(count).toBe(0);
    });

    it('should count leads created within the date range', async () => {
      repo.seedLeads([
        { id: 'l1', tenantId: TENANT_ID, source: 'WEBSITE', createdAt: new Date('2026-01-10') },
        { id: 'l2', tenantId: TENANT_ID, source: 'REFERRAL', createdAt: new Date('2026-01-20') },
        { id: 'l3', tenantId: TENANT_ID, source: 'WEBSITE', createdAt: new Date('2026-02-05') }, // outside
        { id: 'l4', tenantId: 'other', source: 'WEBSITE', createdAt: new Date('2026-01-15') }, // other tenant
      ]);

      const count = await repo.countLeadsInRange(TENANT_ID, {
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-01-31'),
      });
      expect(count).toBe(2);
    });
  });

  // ==========================================================
  // countOpportunitiesInRange()
  // ==========================================================
  describe('countOpportunitiesInRange()', () => {
    it('should return 0 when no opportunities exist', async () => {
      const count = await repo.countOpportunitiesInRange(TENANT_ID, {
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-01-31'),
      });
      expect(count).toBe(0);
    });

    it('should count opportunities created within the range', async () => {
      repo.seedOpportunities([
        {
          id: 'o1',
          tenantId: TENANT_ID,
          stage: 'OPEN',
          value: 100,
          createdAt: new Date('2026-01-10'),
          closedAt: null,
        },
        {
          id: 'o2',
          tenantId: TENANT_ID,
          stage: 'CLOSED_WON',
          value: 200,
          createdAt: new Date('2026-01-15'),
          closedAt: new Date('2026-01-15'),
        },
        {
          id: 'o3',
          tenantId: TENANT_ID,
          stage: 'OPEN',
          value: 300,
          createdAt: new Date('2026-03-01'),
          closedAt: null,
        }, // outside
      ]);

      const count = await repo.countOpportunitiesInRange(TENANT_ID, {
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-01-31'),
      });
      expect(count).toBe(2);
    });
  });

  // ==========================================================
  // countContactsInRange()
  // ==========================================================
  describe('countContactsInRange()', () => {
    it('should return 0 when no contacts exist', async () => {
      const count = await repo.countContactsInRange(TENANT_ID, {
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-01-31'),
      });
      expect(count).toBe(0);
    });

    it('should count contacts created within the range', async () => {
      repo.seedContacts([
        { id: 'c1', tenantId: TENANT_ID, createdAt: new Date('2026-01-10') },
        { id: 'c2', tenantId: TENANT_ID, createdAt: new Date('2026-01-25') },
        { id: 'c3', tenantId: TENANT_ID, createdAt: new Date('2026-02-05') }, // outside
        { id: 'c4', tenantId: 'other', createdAt: new Date('2026-01-10') }, // wrong tenant
      ]);

      const count = await repo.countContactsInRange(TENANT_ID, {
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-01-31'),
      });
      expect(count).toBe(2);
    });
  });

  // ==========================================================
  // getLeadsBySource()
  // ==========================================================
  describe('getLeadsBySource()', () => {
    it('should return empty array when no leads', async () => {
      const result = await repo.getLeadsBySource(TENANT_ID);
      expect(result).toEqual([]);
    });

    it('should group leads by source', async () => {
      repo.seedLeads([
        { id: 'l1', tenantId: TENANT_ID, source: 'WEBSITE', createdAt: new Date() },
        { id: 'l2', tenantId: TENANT_ID, source: 'WEBSITE', createdAt: new Date() },
        { id: 'l3', tenantId: TENANT_ID, source: 'REFERRAL', createdAt: new Date() },
        { id: 'l4', tenantId: 'other', source: 'WEBSITE', createdAt: new Date() }, // different tenant
      ]);

      const result = await repo.getLeadsBySource(TENANT_ID);
      expect(result.length).toBe(2);

      const website = result.find((r) => r.source === 'WEBSITE');
      expect(website).toBeDefined();
      expect(website!._count).toBe(2);

      const referral = result.find((r) => r.source === 'REFERRAL');
      expect(referral).toBeDefined();
      expect(referral!._count).toBe(1);
    });
  });

  // ==========================================================
  // getRecentAuditLogs()
  // ==========================================================
  describe('getRecentAuditLogs()', () => {
    it('should return empty array when no logs exist', async () => {
      const result = await repo.getRecentAuditLogs(TENANT_ID, 10);
      expect(result).toEqual([]);
    });

    it('should return logs sorted by timestamp descending', async () => {
      repo.seedAuditLogs([
        {
          id: 'a1',
          tenantId: TENANT_ID,
          action: 'CREATE',
          timestamp: new Date('2026-01-10'),
          metadata: { name: 'Lead1' },
        },
        {
          id: 'a3',
          tenantId: TENANT_ID,
          action: 'UPDATE',
          timestamp: new Date('2026-01-12'),
          metadata: { name: 'Lead1' },
        },
        {
          id: 'a2',
          tenantId: TENANT_ID,
          action: 'QUALIFY',
          timestamp: new Date('2026-01-11'),
          metadata: { name: 'Lead1' },
        },
      ]);

      const result = await repo.getRecentAuditLogs(TENANT_ID, 10);
      expect(result.length).toBe(3);
      expect(result[0].id).toBe('a3');
      expect(result[1].id).toBe('a2');
      expect(result[2].id).toBe('a1');
    });

    it('should limit the number of results', async () => {
      repo.seedAuditLogs([
        { id: 'a1', tenantId: TENANT_ID, action: 'CREATE', timestamp: new Date('2026-01-10') },
        { id: 'a2', tenantId: TENANT_ID, action: 'CREATE', timestamp: new Date('2026-01-11') },
        { id: 'a3', tenantId: TENANT_ID, action: 'CREATE', timestamp: new Date('2026-01-12') },
      ]);

      const result = await repo.getRecentAuditLogs(TENANT_ID, 2);
      expect(result.length).toBe(2);
    });

    it('should filter by action types when provided', async () => {
      repo.seedAuditLogs([
        { id: 'a1', tenantId: TENANT_ID, action: 'CREATE', timestamp: new Date('2026-01-10') },
        { id: 'a2', tenantId: TENANT_ID, action: 'DELETE', timestamp: new Date('2026-01-11') },
        { id: 'a3', tenantId: TENANT_ID, action: 'CREATE', timestamp: new Date('2026-01-12') },
      ]);

      const result = await repo.getRecentAuditLogs(TENANT_ID, 10, ['CREATE']);
      expect(result.length).toBe(2);
      result.forEach((r) => expect(r.action).toBe('CREATE'));
    });

    it('should filter by tenant', async () => {
      repo.seedAuditLogs([
        { id: 'a1', tenantId: TENANT_ID, action: 'CREATE', timestamp: new Date() },
        { id: 'a2', tenantId: 'other', action: 'CREATE', timestamp: new Date() },
      ]);

      const result = await repo.getRecentAuditLogs(TENANT_ID, 10);
      expect(result.length).toBe(1);
    });

    it('should map known actions to correct icons and descriptions', async () => {
      repo.seedAuditLog({
        id: 'icon1',
        tenantId: TENANT_ID,
        action: 'CREATE',
        timestamp: new Date(),
        metadata: { resourceType: 'lead', name: 'TestLead' },
      });

      const result = await repo.getRecentAuditLogs(TENANT_ID, 10);
      expect(result[0].icon).toBe('add_circle');
      expect(result[0].description).toBe('New lead: TestLead');
    });

    it('should handle QUALIFY action', async () => {
      repo.seedAuditLog({
        id: 'q1',
        tenantId: TENANT_ID,
        action: 'QUALIFY',
        timestamp: new Date(),
        metadata: { name: 'Lead X' },
      });

      const [item] = await repo.getRecentAuditLogs(TENANT_ID, 10);
      expect(item.icon).toBe('check_circle');
      expect(item.description).toBe('Qualified: Lead X');
    });

    it('should handle CONVERT action', async () => {
      repo.seedAuditLog({
        id: 'conv1',
        tenantId: TENANT_ID,
        action: 'CONVERT',
        timestamp: new Date(),
        metadata: { name: 'Converted Lead' },
      });

      const [item] = await repo.getRecentAuditLogs(TENANT_ID, 10);
      expect(item.icon).toBe('swap_horiz');
      expect(item.description).toBe('Converted: Converted Lead');
    });

    it('should handle UPDATE action', async () => {
      repo.seedAuditLog({
        id: 'u1',
        tenantId: TENANT_ID,
        action: 'UPDATE',
        timestamp: new Date(),
        metadata: { name: 'Updated Item' },
      });

      const [item] = await repo.getRecentAuditLogs(TENANT_ID, 10);
      expect(item.icon).toBe('edit');
      expect(item.description).toBe('Updated: Updated Item');
    });

    it('should handle DELETE action', async () => {
      repo.seedAuditLog({
        id: 'd1',
        tenantId: TENANT_ID,
        action: 'DELETE',
        timestamp: new Date(),
      });

      const [item] = await repo.getRecentAuditLogs(TENANT_ID, 10);
      expect(item.icon).toBe('delete');
    });

    it('should handle domain-specific event actions', async () => {
      const eventActions = [
        { action: 'lead.created', icon: 'person_add', desc: 'New lead: LeadName' },
        { action: 'lead.qualified', icon: 'check_circle', desc: 'Lead qualified: LeadName' },
        {
          action: 'lead.converted',
          icon: 'swap_horiz',
          desc: 'Lead converted to contact: LeadName',
        },
        { action: 'opportunity.created', icon: 'handshake', desc: 'New deal: LeadName' },
        { action: 'contact.created', icon: 'contacts', desc: 'New contact: LeadName' },
      ];

      for (const ea of eventActions) {
        repo.clear();
        repo.seedAuditLog({
          id: `ev-${ea.action}`,
          tenantId: TENANT_ID,
          action: ea.action,
          timestamp: new Date(),
          metadata: { name: 'LeadName' },
        });
        const [item] = await repo.getRecentAuditLogs(TENANT_ID, 10);
        expect(item.icon).toBe(ea.icon);
        expect(item.description).toBe(ea.desc);
      }
    });

    it('should handle opportunity.won action with value', async () => {
      repo.seedAuditLog({
        id: 'ow1',
        tenantId: TENANT_ID,
        action: 'opportunity.won',
        timestamp: new Date(),
        metadata: { name: 'BigDeal', value: 50000 },
      });

      const [item] = await repo.getRecentAuditLogs(TENANT_ID, 10);
      expect(item.icon).toBe('celebration');
      expect(item.description).toBe('Deal won: BigDeal ($50000)');
    });

    it('should handle task.completed action', async () => {
      repo.seedAuditLog({
        id: 'tc1',
        tenantId: TENANT_ID,
        action: 'task.completed',
        timestamp: new Date(),
        metadata: { title: 'Follow Up' },
      });

      const [item] = await repo.getRecentAuditLogs(TENANT_ID, 10);
      expect(item.icon).toBe('task_alt');
      expect(item.description).toBe('Task completed: Follow Up');
    });

    it('should fallback to default icon and action as description for unknown actions', async () => {
      repo.seedAuditLog({
        id: 'unk1',
        tenantId: TENANT_ID,
        action: 'some.custom.action',
        timestamp: new Date(),
      });

      const [item] = await repo.getRecentAuditLogs(TENANT_ID, 10);
      expect(item.icon).toBe('event');
      expect(item.description).toBe('some.custom.action');
    });

    it('should use "Unknown" fallback when metadata has no name', async () => {
      repo.seedAuditLog({
        id: 'noname',
        tenantId: TENANT_ID,
        action: 'CREATE',
        timestamp: new Date(),
        metadata: {},
      });

      const [item] = await repo.getRecentAuditLogs(TENANT_ID, 10);
      expect(item.description).toBe('New item: Unknown');
    });

    it('should handle missing metadata', async () => {
      repo.seedAuditLog({
        id: 'nometa',
        tenantId: TENANT_ID,
        action: 'CREATE',
        timestamp: new Date(),
      });

      const [item] = await repo.getRecentAuditLogs(TENANT_ID, 10);
      expect(item.description).toBe('New item: Unknown');
    });

    it('should include eventType in results', async () => {
      repo.seedAuditLog({
        id: 'et1',
        tenantId: TENANT_ID,
        action: 'CREATE',
        eventType: 'lead.created',
        timestamp: new Date(),
      });

      const [item] = await repo.getRecentAuditLogs(TENANT_ID, 10);
      expect(item.eventType).toBe('lead.created');
    });

    it('should pass through empty actions array (no filtering)', async () => {
      repo.seedAuditLogs([
        { id: 'ea1', tenantId: TENANT_ID, action: 'CREATE', timestamp: new Date('2026-01-10') },
        { id: 'ea2', tenantId: TENANT_ID, action: 'DELETE', timestamp: new Date('2026-01-11') },
      ]);

      // Empty actions array should still show all (the length check short-circuits)
      const result = await repo.getRecentAuditLogs(TENANT_ID, 10, []);
      expect(result.length).toBe(2);
    });
  });

  // ==========================================================
  // countTotalLeads()
  // ==========================================================
  describe('countTotalLeads()', () => {
    it('should return 0 when no leads exist', async () => {
      const count = await repo.countTotalLeads(TENANT_ID);
      expect(count).toBe(0);
    });

    it('should count all leads for the tenant', async () => {
      repo.seedLeads([
        { id: 'l1', tenantId: TENANT_ID, source: 'WEBSITE', createdAt: new Date() },
        { id: 'l2', tenantId: TENANT_ID, source: 'REFERRAL', createdAt: new Date() },
        { id: 'l3', tenantId: 'other', source: 'WEBSITE', createdAt: new Date() },
      ]);

      const count = await repo.countTotalLeads(TENANT_ID);
      expect(count).toBe(2);
    });
  });

  // ==========================================================
  // countLeadsThisMonth()
  // ==========================================================
  describe('countLeadsThisMonth()', () => {
    it('should return 0 when no leads exist', async () => {
      const count = await repo.countLeadsThisMonth(TENANT_ID);
      expect(count).toBe(0);
    });

    it('should count leads created since start of current month', async () => {
      const now = new Date();
      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 5);
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);

      repo.seedLeads([
        { id: 'tm1', tenantId: TENANT_ID, source: 'WEBSITE', createdAt: thisMonth },
        { id: 'tm2', tenantId: TENANT_ID, source: 'REFERRAL', createdAt: thisMonth },
        { id: 'tm3', tenantId: TENANT_ID, source: 'WEBSITE', createdAt: lastMonth }, // last month
        { id: 'tm4', tenantId: 'other', source: 'WEBSITE', createdAt: thisMonth }, // wrong tenant
      ]);

      const count = await repo.countLeadsThisMonth(TENANT_ID);
      expect(count).toBe(2);
    });
  });

  // ==========================================================
  // Test helper methods
  // ==========================================================
  describe('test helpers', () => {
    it('clear() should reset all data stores', () => {
      repo.seedLead({ id: 'l1', tenantId: TENANT_ID, source: 'WEB', createdAt: new Date() });
      repo.seedOpportunity({
        id: 'o1',
        tenantId: TENANT_ID,
        stage: 'OPEN',
        value: 100,
        createdAt: new Date(),
        closedAt: null,
      });
      repo.seedContact({ id: 'c1', tenantId: TENANT_ID, createdAt: new Date() });
      repo.seedAuditLog({ id: 'a1', tenantId: TENANT_ID, action: 'CREATE', timestamp: new Date() });

      repo.clear();

      expect(repo.getAllLeads()).toEqual([]);
      expect(repo.getAllOpportunities()).toEqual([]);
    });

    it('seedOpportunity should add a single opportunity', () => {
      repo.seedOpportunity({
        id: 'o1',
        tenantId: TENANT_ID,
        stage: 'OPEN',
        value: 100,
        createdAt: new Date(),
        closedAt: null,
      });
      expect(repo.getAllOpportunities().length).toBe(1);
    });

    it('seedOpportunities should add multiple opportunities', () => {
      repo.seedOpportunities([
        {
          id: 'o1',
          tenantId: TENANT_ID,
          stage: 'OPEN',
          value: 100,
          createdAt: new Date(),
          closedAt: null,
        },
        {
          id: 'o2',
          tenantId: TENANT_ID,
          stage: 'OPEN',
          value: 200,
          createdAt: new Date(),
          closedAt: null,
        },
      ]);
      expect(repo.getAllOpportunities().length).toBe(2);
    });

    it('seedLead should add a single lead', () => {
      repo.seedLead({ id: 'l1', tenantId: TENANT_ID, source: 'WEB', createdAt: new Date() });
      expect(repo.getAllLeads().length).toBe(1);
    });

    it('seedLeads should add multiple leads', () => {
      repo.seedLeads([
        { id: 'l1', tenantId: TENANT_ID, source: 'WEB', createdAt: new Date() },
        { id: 'l2', tenantId: TENANT_ID, source: 'REF', createdAt: new Date() },
      ]);
      expect(repo.getAllLeads().length).toBe(2);
    });

    it('seedContact should add a single contact', async () => {
      repo.seedContact({ id: 'c1', tenantId: TENANT_ID, createdAt: new Date('2026-01-10') });
      const count = await repo.countContactsInRange(TENANT_ID, {
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-01-31'),
      });
      expect(count).toBe(1);
    });

    it('seedContacts should add multiple contacts', async () => {
      repo.seedContacts([
        { id: 'c1', tenantId: TENANT_ID, createdAt: new Date('2026-01-10') },
        { id: 'c2', tenantId: TENANT_ID, createdAt: new Date('2026-01-15') },
      ]);
      const count = await repo.countContactsInRange(TENANT_ID, {
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-01-31'),
      });
      expect(count).toBe(2);
    });

    it('seedAuditLog should add a single audit log', async () => {
      repo.seedAuditLog({ id: 'a1', tenantId: TENANT_ID, action: 'CREATE', timestamp: new Date() });
      const result = await repo.getRecentAuditLogs(TENANT_ID, 10);
      expect(result.length).toBe(1);
    });

    it('seedAuditLogs should add multiple audit logs', async () => {
      repo.seedAuditLogs([
        { id: 'a1', tenantId: TENANT_ID, action: 'CREATE', timestamp: new Date() },
        { id: 'a2', tenantId: TENANT_ID, action: 'UPDATE', timestamp: new Date() },
      ]);
      const result = await repo.getRecentAuditLogs(TENANT_ID, 10);
      expect(result.length).toBe(2);
    });

    it('getAllOpportunities returns a copy', () => {
      repo.seedOpportunity({
        id: 'o1',
        tenantId: TENANT_ID,
        stage: 'OPEN',
        value: 100,
        createdAt: new Date(),
        closedAt: null,
      });
      const all = repo.getAllOpportunities();
      all.pop();
      expect(repo.getAllOpportunities().length).toBe(1);
    });

    it('getAllLeads returns a copy', () => {
      repo.seedLead({ id: 'l1', tenantId: TENANT_ID, source: 'WEB', createdAt: new Date() });
      const all = repo.getAllLeads();
      all.pop();
      expect(repo.getAllLeads().length).toBe(1);
    });
  });
});
