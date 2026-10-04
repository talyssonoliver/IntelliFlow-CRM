/**
 * Ticket Automation Rule CRUD Tests (ticketRouting.listRules/createRule/updateRule/deleteRule/toggleRule)
 *
 * Rules live in routing_rules with ruleType = 'TICKET'. These tests drive the router against an
 * in-memory routingRule store so tenant isolation and the ticket/lead separation are exercised
 * behaviourally, not just by asserting on query arguments.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ticketRoutingRouter } from '../ticket-routing.router';
import { prismaMock, createTestContext, TEST_UUIDS } from '../../../test/setup';

const TENANT = TEST_UUIDS.tenant;
const OTHER_TENANT = 'other-tenant-id';

interface StoredRule {
  id: string;
  tenantId: string;
  ruleType: 'LEAD' | 'TICKET';
  name: string;
  description: string | null;
  priority: number;
  isActive: boolean;
  conditions: unknown;
  actions: unknown;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const billingConditions = [{ field: 'ticketCategory', operator: 'equals', value: 'BILLING' }];
const skillActions = [{ type: 'assign_to_skill', target: 'billing' }];

function rule(overrides: Partial<StoredRule>): StoredRule {
  return {
    id: 'rule-1',
    tenantId: TENANT,
    ruleType: 'TICKET',
    name: 'Billing to billing skill',
    description: null,
    priority: 5,
    isActive: true,
    conditions: billingConditions,
    actions: skillActions,
    createdBy: TEST_UUIDS.user1,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

type Where = Partial<Pick<StoredRule, 'id' | 'tenantId' | 'ruleType' | 'isActive'>>;
type Mock = ReturnType<typeof vi.fn>;

function matches(row: StoredRule, where: Where): boolean {
  return (Object.keys(where) as Array<keyof Where>).every((k) => row[k] === where[k]);
}

function table(): Record<string, Mock> {
  return prismaMock.routingRule as unknown as Record<string, Mock>;
}

/** Wire prismaMock.routingRule to an in-memory table that honours where-filters. */
function useStore(initial: StoredRule[]) {
  const rows = [...initial];
  const t = table();
  t.findMany.mockImplementation(async ({ where }: { where: Where }) =>
    rows.filter((r) => matches(r, where)).sort((a, b) => b.priority - a.priority)
  );
  t.findFirst.mockImplementation(
    async ({ where }: { where: Where }) => rows.find((r) => matches(r, where)) ?? null
  );
  t.create.mockImplementation(async ({ data }: { data: Partial<StoredRule> }) => {
    const created = rule({ id: `new-${rows.length}`, ...data });
    rows.push(created);
    return created;
  });
  t.update.mockImplementation(
    async ({ where, data }: { where: Where; data: Partial<StoredRule> }) => {
      const found = rows.find((r) => matches(r, where));
      if (!found) throw new Error('P2025');
      Object.assign(found, data);
      return found;
    }
  );
  t.delete.mockImplementation(async ({ where }: { where: Where }) => {
    const idx = rows.findIndex((r) => matches(r, where));
    if (idx === -1) throw new Error('P2025');
    return rows.splice(idx, 1)[0];
  });
  return rows;
}

describe('ticketRouting rule CRUD', () => {
  let caller: ReturnType<typeof ticketRoutingRouter.createCaller>;

  beforeEach(() => {
    caller = ticketRoutingRouter.createCaller(createTestContext());
  });

  describe('listRules', () => {
    it('returns only this tenant ticket rules, never lead rules or other tenants', async () => {
      useStore([
        rule({ id: 'ticket-mine', priority: 1 }),
        rule({ id: 'ticket-high', priority: 9, name: 'High' }),
        rule({ id: 'lead-mine', ruleType: 'LEAD', name: 'Lead rule' }),
        rule({ id: 'ticket-theirs', tenantId: OTHER_TENANT, name: 'Theirs' }),
      ]);

      const result = await caller.listRules({});

      expect(result.map((r) => r.id)).toEqual(['ticket-high', 'ticket-mine']);
      expect(prismaMock.routingRule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: TENANT, ruleType: 'TICKET' } })
      );
    });

    it('filters by isActive', async () => {
      useStore([rule({ id: 'on', name: 'On' }), rule({ id: 'off', name: 'Off', isActive: false })]);

      expect((await caller.listRules({ isActive: false })).map((r) => r.id)).toEqual(['off']);
      expect((await caller.listRules({ isActive: true })).map((r) => r.id)).toEqual(['on']);
    });

    it('maps stored rows to the DTO and degrades unparseable JSON to empty lists', async () => {
      useStore([
        rule({ id: 'good', description: 'd' }),
        rule({
          id: 'legacy',
          name: 'Legacy',
          conditions: { score: { operator: 'gte', value: 90 } },
          actions: 'nope',
        }),
      ]);

      const result = await caller.listRules({});
      const good = result.find((r) => r.id === 'good');
      const legacy = result.find((r) => r.id === 'legacy');

      expect(good).toEqual({
        id: 'good',
        name: 'Billing to billing skill',
        description: 'd',
        priority: 5,
        isActive: true,
        conditions: billingConditions,
        actions: skillActions,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      });
      expect(good).not.toHaveProperty('tenantId');
      expect(legacy?.conditions).toEqual([]);
      expect(legacy?.actions).toEqual([]);
    });
  });

  describe('createRule', () => {
    it('stores a TICKET rule for the caller tenant with defaults applied', async () => {
      const rows = useStore([]);

      const created = await caller.createRule({
        name: 'Critical to Alice',
        conditions: [{ field: 'ticketPriority', operator: 'gte', value: 'HIGH' }],
        actions: [{ type: 'assign_to_user', target: 'user-alice' }],
      });

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        tenantId: TENANT,
        ruleType: 'TICKET',
        priority: 0,
        isActive: true,
        description: null,
        createdBy: TEST_UUIDS.user1,
      });
      expect(created.conditions).toEqual([
        { field: 'ticketPriority', operator: 'gte', value: 'HIGH' },
      ]);
    });

    it('rejects lead vocabulary before touching the database', async () => {
      useStore([]);

      await expect(
        caller.createRule({
          name: 'Lead shaped',
          conditions: [{ field: 'leadScore', operator: 'equals', value: '90' }],
          actions: [{ type: 'assign_to_user', target: 'u' }],
        } as never)
      ).rejects.toThrow();
      expect(prismaMock.routingRule.create).not.toHaveBeenCalled();
    });

    it('maps a duplicate name to CONFLICT', async () => {
      useStore([]);
      table().create.mockRejectedValue({ code: 'P2002' });

      await expect(
        caller.createRule({
          name: 'Dup',
          conditions: billingConditions as never,
          actions: skillActions as never,
        })
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });

    it('surfaces unexpected database errors as internal errors', async () => {
      useStore([]);
      const boom = new Error('db down');
      table().create.mockRejectedValue(boom);

      await expect(
        caller.createRule({
          name: 'X',
          conditions: billingConditions as never,
          actions: skillActions as never,
        })
      ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR', message: 'db down' });
    });
  });

  describe('updateRule', () => {
    it('changes only the provided fields', async () => {
      const rows = useStore([rule({ id: 'r1' })]);

      const updated = await caller.updateRule({ id: 'r1', name: 'Renamed' });

      expect(updated.name).toBe('Renamed');
      expect(rows[0]).toMatchObject({ priority: 5, isActive: true, conditions: billingConditions });
    });

    it('scopes the write by tenant and rule type', async () => {
      useStore([rule({ id: 'r1' })]);

      await caller.updateRule({ id: 'r1', priority: 7 });

      expect(prismaMock.routingRule.update).toHaveBeenCalledWith({
        where: { id: 'r1', tenantId: TENANT, ruleType: 'TICKET' },
        data: { priority: 7 },
      });
    });

    it('cannot touch another tenant rule or a lead rule', async () => {
      const rows = useStore([
        rule({ id: 'theirs', tenantId: OTHER_TENANT, name: 'Theirs' }),
        rule({ id: 'lead', ruleType: 'LEAD', name: 'Lead' }),
      ]);

      await expect(caller.updateRule({ id: 'theirs', name: 'Hijack' })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      await expect(caller.updateRule({ id: 'lead', name: 'Hijack' })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      expect(rows.map((r) => r.name)).toEqual(['Theirs', 'Lead']);
    });

    it('maps a duplicate name to CONFLICT', async () => {
      useStore([rule({ id: 'r1' })]);
      table().update.mockRejectedValue({ code: 'P2002' });

      await expect(caller.updateRule({ id: 'r1', name: 'Dup' })).rejects.toMatchObject({
        code: 'CONFLICT',
      });
    });
  });

  describe('deleteRule', () => {
    it('deletes an own ticket rule', async () => {
      const rows = useStore([rule({ id: 'r1' })]);

      expect(await caller.deleteRule({ id: 'r1' })).toEqual({ id: 'r1' });
      expect(rows).toHaveLength(0);
    });

    it('cannot delete another tenant rule or a lead rule', async () => {
      const rows = useStore([
        rule({ id: 'theirs', tenantId: OTHER_TENANT, name: 'Theirs' }),
        rule({ id: 'lead', ruleType: 'LEAD', name: 'Lead' }),
      ]);

      await expect(caller.deleteRule({ id: 'theirs' })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      await expect(caller.deleteRule({ id: 'lead' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(rows).toHaveLength(2);
    });
  });

  describe('toggleRule', () => {
    it('flips isActive on an own ticket rule', async () => {
      const rows = useStore([rule({ id: 'r1' })]);

      const result = await caller.toggleRule({ id: 'r1', isActive: false });

      expect(result.isActive).toBe(false);
      expect(rows[0].isActive).toBe(false);
    });

    it('cannot toggle another tenant rule or a lead rule', async () => {
      const rows = useStore([
        rule({ id: 'theirs', tenantId: OTHER_TENANT, name: 'Theirs' }),
        rule({ id: 'lead', ruleType: 'LEAD', name: 'Lead' }),
      ]);

      await expect(caller.toggleRule({ id: 'theirs', isActive: false })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      await expect(caller.toggleRule({ id: 'lead', isActive: false })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      expect(rows.every((r) => r.isActive)).toBe(true);
    });
  });
});
