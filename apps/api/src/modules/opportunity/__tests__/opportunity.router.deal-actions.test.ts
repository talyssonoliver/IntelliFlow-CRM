/**
 * Opportunity Router — Deal Action Backends (#421, IFC-280 deferred)
 *
 * Tests clone / archive / unarchive / addProduct / updateProduct /
 * removeProduct. File-upload (attachFile/listFiles/removeFile) is tested in
 * deal-files.test.ts since it's extracted into its own module.
 */

import { TEST_UUIDS } from '../../../test/setup';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Result } from '@intelliflow/domain';
import { NotFoundError } from '@intelliflow/application';

vi.mock('../../../security/audit-logger', () => ({
  getAuditLogger: vi.fn(() => ({
    logAction: vi.fn().mockResolvedValue('audit-id'),
    logBulkOperation: vi.fn().mockResolvedValue('audit-id'),
    logPermissionDenied: vi.fn().mockResolvedValue('audit-id'),
  })),
}));

import { opportunityRouter } from '../opportunity.router';
import { createTestContext, prismaMock } from '../../../test/setup';

const archivedStateError = (code: 'OPPORTUNITY_ALREADY_ARCHIVED' | 'OPPORTUNITY_NOT_ARCHIVED') => ({
  code,
  message:
    code === 'OPPORTUNITY_ALREADY_ARCHIVED'
      ? 'Opportunity has already been archived'
      : 'Only archived opportunities can be unarchived',
});

const createMockDomainOpportunity = (overrides: Record<string, unknown> = {}) => ({
  id: { value: TEST_UUIDS.opportunity1 },
  name: 'Deal',
  value: { amount: 50000, currency: 'GBP' },
  probability: { value: 10 },
  stage: 'PROSPECTING',
  expectedCloseDate: new Date('2026-06-30'),
  accountId: TEST_UUIDS.account1,
  contactId: TEST_UUIDS.contact1,
  ownerId: TEST_UUIDS.user1,
  tenantId: TEST_UUIDS.tenant,
  weightedValue: { amount: 5000, currency: 'GBP' },
  isClosed: false,
  isWon: false,
  isLost: false,
  closedAt: undefined,
  archivedAt: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date(),
  getDomainEvents: () => [],
  clearDomainEvents: () => {},
  ...overrides,
});

describe('Opportunity Router - Deal Actions (#421)', () => {
  beforeEach(() => {
    (prismaMock.$extends as ReturnType<typeof vi.fn>).mockReturnValue(prismaMock);
  });

  describe('clone', () => {
    it('clones a deal via the service and returns the mapped response', async () => {
      const ctx = createTestContext();
      const cloned = createMockDomainOpportunity({
        id: { value: TEST_UUIDS.opportunity2 },
        name: 'Deal (Copy)',
      });
      ctx.services!.opportunity!.cloneOpportunity = vi.fn().mockResolvedValue(Result.ok(cloned));

      const caller = opportunityRouter.createCaller(ctx);
      const result = await caller.clone({ id: TEST_UUIDS.opportunity1 });

      expect(result.id).toBe(TEST_UUIDS.opportunity2);
      expect(result.name).toBe('Deal (Copy)');
      expect(ctx.services!.opportunity!.cloneOpportunity).toHaveBeenCalledWith(
        TEST_UUIDS.opportunity1,
        TEST_UUIDS.user1,
        TEST_UUIDS.tenant
      );
    });

    it('returns NOT_FOUND when the source deal does not exist', async () => {
      const ctx = createTestContext();
      ctx.services!.opportunity!.cloneOpportunity = vi
        .fn()
        .mockResolvedValue(
          Result.fail(new NotFoundError(`Opportunity not found: ${TEST_UUIDS.nonExistent}`))
        );

      const caller = opportunityRouter.createCaller(ctx);
      await expect(caller.clone({ id: TEST_UUIDS.nonExistent })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });

  describe('archive', () => {
    it('archives a deal via the service', async () => {
      const ctx = createTestContext();
      const archived = createMockDomainOpportunity({ archivedAt: new Date() });
      ctx.services!.opportunity!.archiveOpportunity = vi
        .fn()
        .mockResolvedValue(Result.ok(archived));

      const caller = opportunityRouter.createCaller(ctx);
      const result = await caller.archive({ id: TEST_UUIDS.opportunity1 });

      expect(result.id).toBe(TEST_UUIDS.opportunity1);
      expect(ctx.services!.opportunity!.archiveOpportunity).toHaveBeenCalledWith(
        TEST_UUIDS.opportunity1,
        TEST_UUIDS.user1,
        TEST_UUIDS.tenant
      );
    });

    it('returns CONFLICT when the deal is already archived', async () => {
      const ctx = createTestContext();
      ctx.services!.opportunity!.archiveOpportunity = vi
        .fn()
        .mockResolvedValue(Result.fail(archivedStateError('OPPORTUNITY_ALREADY_ARCHIVED') as any));

      const caller = opportunityRouter.createCaller(ctx);
      await expect(caller.archive({ id: TEST_UUIDS.opportunity1 })).rejects.toMatchObject({
        code: 'CONFLICT',
      });
    });

    it('returns NOT_FOUND for a non-existent deal', async () => {
      const ctx = createTestContext();
      ctx.services!.opportunity!.archiveOpportunity = vi
        .fn()
        .mockResolvedValue(
          Result.fail(new NotFoundError(`Opportunity not found: ${TEST_UUIDS.nonExistent}`))
        );

      const caller = opportunityRouter.createCaller(ctx);
      await expect(caller.archive({ id: TEST_UUIDS.nonExistent })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });

  describe('unarchive', () => {
    it('unarchives a deal via the service', async () => {
      const ctx = createTestContext();
      const unarchived = createMockDomainOpportunity({ archivedAt: null });
      ctx.services!.opportunity!.unarchiveOpportunity = vi
        .fn()
        .mockResolvedValue(Result.ok(unarchived));

      const caller = opportunityRouter.createCaller(ctx);
      const result = await caller.unarchive({ id: TEST_UUIDS.opportunity1 });

      expect(result.id).toBe(TEST_UUIDS.opportunity1);
      expect(ctx.services!.opportunity!.unarchiveOpportunity).toHaveBeenCalledWith(
        TEST_UUIDS.opportunity1,
        TEST_UUIDS.user1,
        TEST_UUIDS.tenant
      );
    });

    it('returns CONFLICT when the deal is not archived', async () => {
      const ctx = createTestContext();
      ctx.services!.opportunity!.unarchiveOpportunity = vi
        .fn()
        .mockResolvedValue(Result.fail(archivedStateError('OPPORTUNITY_NOT_ARCHIVED') as any));

      const caller = opportunityRouter.createCaller(ctx);
      await expect(caller.unarchive({ id: TEST_UUIDS.opportunity1 })).rejects.toMatchObject({
        code: 'CONFLICT',
      });
    });
  });

  describe('addProduct', () => {
    it('returns NOT_FOUND when the deal does not exist', async () => {
      const ctx = createTestContext();
      (prismaMock.opportunity.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const caller = opportunityRouter.createCaller(ctx);
      await expect(
        caller.addProduct({
          opportunityId: TEST_UUIDS.nonExistent,
          name: 'Widget',
          quantity: 1,
          unitPrice: 10,
        })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('creates the product with a server-computed totalPrice', async () => {
      const ctx = createTestContext();
      (prismaMock.opportunity.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: TEST_UUIDS.opportunity1,
      });
      (prismaMock.dealProduct.create as ReturnType<typeof vi.fn>).mockImplementation(
        async ({ data }: any) => ({ id: 'cproduct01', ...data })
      );

      const caller = opportunityRouter.createCaller(ctx);
      const result = await caller.addProduct({
        opportunityId: TEST_UUIDS.opportunity1,
        name: 'Widget',
        quantity: 3,
        unitPrice: 19.99,
      });

      expect(result.totalPrice).toBeCloseTo(59.97, 2);
      expect(prismaMock.dealProduct.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            opportunityId: TEST_UUIDS.opportunity1,
            tenantId: TEST_UUIDS.tenant,
            name: 'Widget',
            quantity: 3,
          }),
        })
      );
    });

    // Tenant-isolation defense-in-depth (#421 security fix): the deal-existence
    // check must scope by tenantId, not just opportunityId — matching
    // updateProduct/removeProduct/removeFile immediately adjacent in this
    // module. Without it, the documented pooled-connection SET race lets a
    // caller in tenant A plant a product on a tenant-B deal.
    it('scopes the deal-existence check by tenantId, not just opportunityId', async () => {
      const ctx = createTestContext();
      (prismaMock.opportunity.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: TEST_UUIDS.opportunity1,
      });
      (prismaMock.dealProduct.create as ReturnType<typeof vi.fn>).mockImplementation(
        async ({ data }: any) => ({ id: 'cproduct01', ...data })
      );

      const caller = opportunityRouter.createCaller(ctx);
      await caller.addProduct({
        opportunityId: TEST_UUIDS.opportunity1,
        name: 'Widget',
        quantity: 1,
        unitPrice: 10,
      });

      expect(prismaMock.opportunity.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: TEST_UUIDS.opportunity1,
            tenantId: TEST_UUIDS.tenant,
          }),
        })
      );
    });
  });

  describe('updateProduct', () => {
    it('returns NOT_FOUND when the product does not exist', async () => {
      const ctx = createTestContext();
      (prismaMock.dealProduct.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const caller = opportunityRouter.createCaller(ctx);
      await expect(caller.updateProduct({ id: TEST_UUIDS.nonExistent })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('recomputes totalPrice from the effective quantity when only quantity changes', async () => {
      const ctx = createTestContext();
      (prismaMock.dealProduct.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'cproduct01',
        opportunityId: TEST_UUIDS.opportunity1,
        quantity: 1,
        unitPrice: 10,
      });
      (prismaMock.dealProduct.update as ReturnType<typeof vi.fn>).mockImplementation(
        async ({ data }: any) => ({ id: 'cproduct01', ...data })
      );

      const caller = opportunityRouter.createCaller(ctx);
      const result = await caller.updateProduct({ id: 'cproduct01', quantity: 4 });

      // unitPrice stays the existing 10 (not supplied) -> 4 * 10 = 40
      expect(result.totalPrice).toBe(40);
    });
  });

  describe('attachFile / listFiles / removeFile (router wiring)', () => {
    const sampleContent = Buffer.from('hello world').toString('base64');

    it('attachFile delegates to the storage pipeline and persists a DealFile', async () => {
      const ctx = createTestContext();
      (prismaMock.opportunity.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: TEST_UUIDS.opportunity1,
      });
      (
        ctx.adapters!.storageService!.uploadToQuarantine as ReturnType<typeof vi.fn>
      ).mockResolvedValue('quarantine/key');
      (ctx.adapters!.avScanner!.scan as ReturnType<typeof vi.fn>).mockResolvedValue({
        clean: true,
        threatName: null,
        scanDuration: 1,
        engine: 'test',
      });
      (ctx.adapters!.storageService!.moveToPrimary as ReturnType<typeof vi.fn>).mockResolvedValue(
        'primary/key'
      );
      (prismaMock.dealFile.create as ReturnType<typeof vi.fn>).mockImplementation(
        async ({ data }: any) => ({ id: 'cfileone01', uploadedAt: new Date(), ...data })
      );

      const caller = opportunityRouter.createCaller(ctx);
      const result = await caller.attachFile({
        opportunityId: TEST_UUIDS.opportunity1,
        name: 'doc.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 11,
        content: sampleContent,
      });

      expect(result.url).toBe('primary/key');
      expect(prismaMock.dealFile.create).toHaveBeenCalled();
    });

    it('listFiles returns each file with a signed download URL', async () => {
      const ctx = createTestContext();
      (prismaMock.opportunity.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: TEST_UUIDS.opportunity1,
      });
      (prismaMock.dealFile.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 'cfileone01', name: 'doc.pdf', url: 'primary/key' },
      ]);
      (ctx.adapters!.storageService!.getSignedUrl as ReturnType<typeof vi.fn>).mockResolvedValue(
        'https://signed.example.invalid/doc.pdf'
      );

      const caller = opportunityRouter.createCaller(ctx);
      const result = await caller.listFiles({ opportunityId: TEST_UUIDS.opportunity1 });

      expect(result.files).toHaveLength(1);
      expect(result.files[0].downloadUrl).toBe('https://signed.example.invalid/doc.pdf');
    });

    it('removeFile deletes the file and returns success', async () => {
      const ctx = createTestContext();
      (prismaMock.dealFile.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'cfileone01',
        opportunityId: TEST_UUIDS.opportunity1,
      });

      const caller = opportunityRouter.createCaller(ctx);
      const result = await caller.removeFile({ id: 'cfileone01' });

      expect(result).toEqual({ success: true, id: 'cfileone01' });
      expect(prismaMock.dealFile.delete).toHaveBeenCalledWith({ where: { id: 'cfileone01' } });
    });
  });

  describe('removeProduct', () => {
    it('returns NOT_FOUND when the product does not exist', async () => {
      const ctx = createTestContext();
      (prismaMock.dealProduct.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const caller = opportunityRouter.createCaller(ctx);
      await expect(caller.removeProduct({ id: TEST_UUIDS.nonExistent })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('deletes the product and returns success', async () => {
      const ctx = createTestContext();
      (prismaMock.dealProduct.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'cproduct01',
        opportunityId: TEST_UUIDS.opportunity1,
      });
      (prismaMock.dealProduct.delete as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'cproduct01',
      });

      const caller = opportunityRouter.createCaller(ctx);
      const result = await caller.removeProduct({ id: 'cproduct01' });

      expect(result).toEqual({ success: true, id: 'cproduct01' });
      expect(prismaMock.dealProduct.delete).toHaveBeenCalledWith({ where: { id: 'cproduct01' } });
    });
  });
});
