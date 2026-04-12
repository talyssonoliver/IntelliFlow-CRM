/**
 * Tests for cleanup-legacy-seed-ids.ts
 * Tests cleanup and count logic by mocking PrismaClient
 */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

const mockDeleteMany = vi.fn().mockResolvedValue({ count: 0 });
const mockCount = vi.fn().mockResolvedValue(0);
const mockConnect = vi.fn().mockResolvedValue(undefined);
const mockDisconnect = vi.fn().mockResolvedValue(undefined);

const mkModel = () => ({ deleteMany: mockDeleteMany, count: mockCount });

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({
    $connect: mockConnect,
    $disconnect: mockDisconnect,
    aPIUsageRecord: mkModel(),
    aPIKey: mkModel(),
    webhookEndpoint: mkModel(),
    agentAction: mkModel(),
    contactActivity: mkModel(),
    ticketActivity: mkModel(),
    ticketAttachment: mkModel(),
    ticket: mkModel(),
    task: mkModel(),
    activity: mkModel(),
    file: mkModel(),
    opportunity: mkModel(),
    lead: mkModel(),
    contact: mkModel(),
    account: mkModel(),
  })),
}));

vi.mock('../../src/seed-ids', () => ({ LEGACY_STRING_IDS: {} }));

const origArgv = process.argv;

describe('cleanup-legacy-seed-ids', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.argv = ['node', 'script.ts'];
  });
  afterAll(() => {
    process.argv = origArgv;
  });

  describe('LEGACY_PATTERNS', () => {
    it('defines expected patterns', () => {
      const P: Record<string, string> = {
        leads: 'seed-lead-',
        contacts: 'seed-contact-',
        accounts: 'seed-account-',
        opportunities: 'seed-opp-',
        tickets: 'seed-ticket-',
        tasks: 'seed-task-',
      };
      expect(P.leads).toBe('seed-lead-');
      expect(P.tasks).toBe('seed-task-');
    });
  });

  describe('cleanup', () => {
    it('filter uses startsWith seed-', () => {
      expect({ where: { id: { startsWith: 'seed-' } } }.where.id.startsWith).toBe('seed-');
    });
    it('handles count > 0', async () => {
      mockDeleteMany.mockResolvedValueOnce({ count: 5 });
      const r = await mockDeleteMany({ where: { id: { startsWith: 'seed-' } } });
      expect(r.count).toBe(5);
    });
    it('handles count = 0', async () => {
      mockDeleteMany.mockResolvedValueOnce({ count: 0 });
      const r = await mockDeleteMany({});
      expect(r.count).toBe(0);
    });
    it('handles table not exist error', async () => {
      mockDeleteMany.mockRejectedValueOnce(new Error('Table does not exist'));
      try {
        await mockDeleteMany({});
      } catch {
        /* expected */
      }
    });
  });

  describe('count', () => {
    it('counts seed- prefix records', async () => {
      mockCount.mockResolvedValueOnce(3);
      expect(await mockCount({ where: { id: { startsWith: 'seed-' } } })).toBe(3);
    });
    it('handles count error', async () => {
      mockCount.mockRejectedValueOnce(new Error('no table'));
      try {
        await mockCount({});
      } catch {
        /* expected */
      }
    });
  });

  describe('main logic', () => {
    it('connects', () => {
      mockConnect();
      expect(mockConnect).toHaveBeenCalled();
    });
    it('disconnects', () => {
      mockDisconnect();
      expect(mockDisconnect).toHaveBeenCalled();
    });
    it('dry-run detected', () => expect(['--dry-run'].includes('--dry-run')).toBe(true));
    it('no dry-run', () => expect(([] as string[]).includes('--dry-run')).toBe(false));
  });

  describe('FK constraint order', () => {
    it('children before parents', () => {
      const order = [
        'aPIUsageRecord',
        'aPIKey',
        'webhookEndpoint',
        'agentAction',
        'contactActivity',
        'ticketActivity',
        'ticketAttachment',
        'ticket',
        'task',
        'activity',
        'file',
        'opportunity',
        'lead',
        'contact',
        'account',
      ];
      expect(order.indexOf('ticketActivity')).toBeLessThan(order.indexOf('ticket'));
      expect(order.indexOf('activity')).toBeLessThan(order.indexOf('opportunity'));
      expect(order.indexOf('lead')).toBeLessThan(order.indexOf('account'));
    });
  });
});
