import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PrismaClient } from '@intelliflow/db';
import { PrismaSetupInstalmentRepository } from '../PrismaSetupInstalmentRepository';
import type { SetupInstalmentSpec } from '@intelliflow/application';

const OPP = 'opp_1';
const TENANT = 'tenant_1';

const mockPrisma = {
  setupInstalment: {
    createMany: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
} as unknown as PrismaClient;

function plan(): SetupInstalmentSpec[] {
  return [
    { n: 1, amountCents: 16700, currency: 'GBP', status: 'due', dueAt: new Date('2026-06-01Z') },
    { n: 2, amountCents: 16700, currency: 'GBP', status: 'due', dueAt: new Date('2026-06-08Z') },
  ];
}

describe('PrismaSetupInstalmentRepository', () => {
  let repo: PrismaSetupInstalmentRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new PrismaSetupInstalmentRepository(mockPrisma);
  });

  describe('createForOpportunity', () => {
    it('createMany with mapped status + skipDuplicates', async () => {
      (mockPrisma.setupInstalment.createMany as any).mockResolvedValue({ count: 2 });
      await repo.createForOpportunity({
        opportunityId: OPP,
        tenantId: TENANT,
        instalments: plan(),
      });

      const arg = (mockPrisma.setupInstalment.createMany as any).mock.calls[0][0];
      expect(arg.skipDuplicates).toBe(true);
      expect(arg.data).toHaveLength(2);
      expect(arg.data[0]).toMatchObject({
        opportunityId: OPP,
        tenantId: TENANT,
        n: 1,
        amountCents: 16700,
        currency: 'GBP',
        status: 'DUE', // lowercase 'due' -> Prisma enum 'DUE'
      });
    });

    it('skips the DB call entirely for an empty plan', async () => {
      await repo.createForOpportunity({ opportunityId: OPP, tenantId: TENANT, instalments: [] });
      expect(mockPrisma.setupInstalment.createMany).not.toHaveBeenCalled();
    });
  });

  describe('findByOpportunity', () => {
    it('queries tenant-scoped, ordered by n, and maps the status back to lowercase', async () => {
      (mockPrisma.setupInstalment.findMany as any).mockResolvedValue([
        {
          n: 1,
          amountCents: 16700,
          currency: 'GBP',
          status: 'PAID',
          dueAt: new Date('2026-06-01Z'),
          paidAt: new Date('2026-06-02Z'),
          stripeInvoiceId: 'in_1',
        },
      ]);

      const rows = await repo.findByOpportunity(OPP, TENANT);

      expect((mockPrisma.setupInstalment.findMany as any).mock.calls[0][0]).toEqual({
        where: { opportunityId: OPP, tenantId: TENANT },
        orderBy: { n: 'asc' },
      });
      expect(rows[0]).toEqual({
        n: 1,
        amountCents: 16700,
        currency: 'GBP',
        status: 'paid',
        dueAt: new Date('2026-06-01Z'),
        paidAt: new Date('2026-06-02Z'),
        stripeInvoiceId: 'in_1',
      });
    });

    it('maps every DB status value (DUE/PAID/OVERDUE)', async () => {
      (mockPrisma.setupInstalment.findMany as any).mockResolvedValue([
        {
          n: 1,
          amountCents: 1,
          currency: 'GBP',
          status: 'DUE',
          dueAt: null,
          paidAt: null,
          stripeInvoiceId: null,
        },
        {
          n: 2,
          amountCents: 1,
          currency: 'GBP',
          status: 'OVERDUE',
          dueAt: null,
          paidAt: null,
          stripeInvoiceId: null,
        },
      ]);
      const rows = await repo.findByOpportunity(OPP, TENANT);
      expect(rows.map((r) => r.status)).toEqual(['due', 'overdue']);
    });
  });

  describe('setStripeInvoiceId', () => {
    it('updateMany scoped by opportunity + tenant + n', async () => {
      (mockPrisma.setupInstalment.updateMany as any).mockResolvedValue({ count: 1 });
      await repo.setStripeInvoiceId({
        opportunityId: OPP,
        tenantId: TENANT,
        n: 1,
        stripeInvoiceId: 'in_xyz',
      });
      expect((mockPrisma.setupInstalment.updateMany as any).mock.calls[0][0]).toEqual({
        where: { opportunityId: OPP, tenantId: TENANT, n: 1 },
        data: { stripeInvoiceId: 'in_xyz' },
      });
    });
  });
});
