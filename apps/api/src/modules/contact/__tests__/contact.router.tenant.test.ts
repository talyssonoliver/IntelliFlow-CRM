/**
 * Contact Router — Tenant Isolation (IFC-265, T-04)
 *
 * Cross-tenant tests for the contact mutation procedures whose tenant boundary
 * is enforced AT THE ROUTER and is therefore genuinely unit-testable:
 *   - create     — stamps the caller's ownerId + tenantId (client cannot target another tenant)
 *   - delete     — ctx.prismaWithTenant.findUnique (RLS) → cross-tenant id → NOT_FOUND, no mutation
 *   - addNote    — ctx.prismaWithTenant.findUnique (RLS) → cross-tenant id → NOT_FOUND, no note
 *   - bulkDelete — ctx.prismaWithTenant.findMany  (RLS) → cross-tenant ids → all `failed`
 *
 * #420 (this fix): update / updateEmail / unlinkFromAccount / linkToAccount now run a router-level
 * tenant preflight (`assertContactInTenant`) — an explicit tenantId comparison via the
 * request-scoped client, BEFORE delegating to the singleton ContactService (whose
 * repository findById is not tenant-scoped). The tests below exercise the REAL preflight:
 * a cross-tenant row (RLS bypass) OR a null (RLS-filtered) lookup must yield NOT_FOUND and
 * the mutation service must never be invoked. NOT the IFC-265 false-isolation trap (which
 * mocked the service to fail and proved nothing).
 *
 * These complement contact.router.security.test.ts (R-02..R-06: search / logActivity /
 * bulkEmail / bulkExport / stats / getById / getByEmail).
 *
 * Mirrors the existing harness (createTestContext + prismaMock + service mocks).
 */
import { describe, it, expect, vi } from 'vitest';
import { contactRouter } from '../contact.router';
import { prismaMock, createTestContext, TEST_UUIDS, generateTestUUID } from '../../../test/setup';

// A valid UUID that belongs to a DIFFERENT tenant (never visible to the caller).
const FOREIGN_CONTACT_ID = generateTestUUID('foreign-tenant-contact');
const FOREIGN_TENANT_ID = generateTestUUID('foreign-tenant');

/** Minimal domain-Contact shape consumed by mapContactToResponse. */
const domainContact = (overrides: Record<string, unknown> = {}) => ({
  id: { value: TEST_UUIDS.contact1 },
  email: { value: 'contact@example.com' },
  firstName: 'Jane',
  lastName: 'Smith',
  title: 'CTO',
  phone: null,
  department: 'Engineering',
  status: 'ACTIVE',
  accountId: null,
  leadId: null,
  ownerId: TEST_UUIDS.user1,
  tenantId: TEST_UUIDS.tenant,
  hasAccount: false,
  isConvertedFromLead: false,
  lastContactedAt: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  getDomainEvents: () => [],
  clearDomainEvents: () => {},
  ...overrides,
});

const ok = (value: unknown) => ({ isSuccess: true, isFailure: false, value });

describe('Contact Router — Tenant Isolation (IFC-265, T-04)', () => {
  // create: the owner/tenant are stamped from the caller's context — a client
  // cannot create a contact under another tenant by crafting the input.
  describe('create', () => {
    it('stamps the caller ownerId + tenantId (cannot create for another tenant)', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);
      ctx.services!.contact!.createContact = vi.fn().mockResolvedValue(ok(domainContact()));

      await caller.create({ email: 'new@example.com', firstName: 'Bob', lastName: 'Lee' });

      expect(ctx.services!.contact!.createContact).toHaveBeenCalledWith(
        expect.objectContaining({ ownerId: TEST_UUIDS.user1, tenantId: TEST_UUIDS.tenant })
      );
    });
  });

  // delete: tenant-scoped findUnique (RLS); a cross-tenant id is filtered out
  // (→ null) and yields NOT_FOUND before the delete service is ever called.
  describe('delete', () => {
    it('rejects a cross-tenant contact id with NOT_FOUND (RLS filters it out)', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);
      prismaMock.contact.findUnique.mockResolvedValue(null);

      await expect(caller.delete({ id: FOREIGN_CONTACT_ID })).rejects.toThrow(
        expect.objectContaining({ code: 'NOT_FOUND' })
      );
      expect(ctx.services!.contact!.deleteContact).not.toHaveBeenCalled();
    });
  });

  // addNote: tenant-scoped findUnique (RLS) → cross-tenant id → NOT_FOUND, no note written.
  describe('addNote', () => {
    it('rejects a cross-tenant contact id with NOT_FOUND and writes no note', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);
      prismaMock.contact.findUnique.mockResolvedValue(null);

      await expect(
        caller.addNote({ contactId: FOREIGN_CONTACT_ID, content: 'cross-tenant note' })
      ).rejects.toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
      expect(prismaMock.contactNote.create).not.toHaveBeenCalled();
    });
  });

  // bulkDelete: batched fetch via prismaWithTenant (RLS) — cross-tenant ids never
  // come back, so they land in `failed` and are never deleted.
  describe('bulkDelete', () => {
    it('reports cross-tenant ids as failed and deletes none of them', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);
      // RLS returns no rows for foreign-tenant ids.
      prismaMock.contact.findMany.mockResolvedValue([]);

      const result = await caller.bulkDelete({ ids: [FOREIGN_CONTACT_ID, generateTestUUID('f2')] });

      expect(result.successful).toEqual([]);
      expect(result.failed).toHaveLength(2);
      expect(result.failed.every((f) => /not found/i.test(f.error))).toBe(true);
      expect(ctx.services!.contact!.deleteContact).not.toHaveBeenCalled();
    });
  });

  // #420: update — router preflight (assertContactInTenant) denies cross-tenant
  // BEFORE the (non-tenant-scoped) service mutation. Exercises the real preflight,
  // not a mocked service failure.
  describe('update (tenant preflight, #420)', () => {
    it('rejects a contact whose tenantId differs from the caller (RLS bypass) with NOT_FOUND', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);
      const updateSpy = vi.fn().mockResolvedValue(ok(domainContact()));
      ctx.services!.contact!.updateContactInfo = updateSpy;
      // Simulate a foreign-tenant row reaching the lookup (e.g. RLS not applied):
      // the explicit tenantId comparison must still reject it.
      prismaMock.contact.findUnique.mockResolvedValue({
        id: FOREIGN_CONTACT_ID,
        tenantId: FOREIGN_TENANT_ID,
      } as never);

      await expect(caller.update({ id: FOREIGN_CONTACT_ID, title: 'Hijack' })).rejects.toThrow(
        expect.objectContaining({ code: 'NOT_FOUND' })
      );
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it('rejects a contact filtered out by RLS (null lookup) with NOT_FOUND', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);
      const updateSpy = vi.fn().mockResolvedValue(ok(domainContact()));
      ctx.services!.contact!.updateContactInfo = updateSpy;
      prismaMock.contact.findUnique.mockResolvedValue(null);

      await expect(caller.update({ id: FOREIGN_CONTACT_ID, title: 'Hijack' })).rejects.toThrow(
        expect.objectContaining({ code: 'NOT_FOUND' })
      );
      expect(updateSpy).not.toHaveBeenCalled();
    });
  });

  // #420: updateEmail — same router preflight before the service email change.
  describe('updateEmail (tenant preflight, #420)', () => {
    it('rejects a cross-tenant contact (tenantId mismatch) with NOT_FOUND', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);
      const emailSpy = vi.fn().mockResolvedValue(ok(domainContact()));
      ctx.services!.contact!.updateContactEmail = emailSpy;
      prismaMock.contact.findUnique.mockResolvedValue({
        id: FOREIGN_CONTACT_ID,
        tenantId: FOREIGN_TENANT_ID,
      } as never);

      await expect(
        caller.updateEmail({ id: FOREIGN_CONTACT_ID, email: 'hijack@example.com' })
      ).rejects.toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
      expect(emailSpy).not.toHaveBeenCalled();
    });

    it('rejects a contact filtered out by RLS (null lookup) with NOT_FOUND', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);
      const emailSpy = vi.fn().mockResolvedValue(ok(domainContact()));
      ctx.services!.contact!.updateContactEmail = emailSpy;
      prismaMock.contact.findUnique.mockResolvedValue(null);

      await expect(
        caller.updateEmail({ id: FOREIGN_CONTACT_ID, email: 'hijack@example.com' })
      ).rejects.toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
      expect(emailSpy).not.toHaveBeenCalled();
    });
  });

  // #420: unlinkFromAccount — same router preflight before the service disassociation.
  describe('unlinkFromAccount (tenant preflight, #420)', () => {
    it('rejects a cross-tenant contact (tenantId mismatch) with NOT_FOUND', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);
      const unlinkSpy = vi.fn().mockResolvedValue(ok(domainContact()));
      ctx.services!.contact!.disassociateFromAccount = unlinkSpy;
      prismaMock.contact.findUnique.mockResolvedValue({
        id: FOREIGN_CONTACT_ID,
        tenantId: FOREIGN_TENANT_ID,
      } as never);

      await expect(caller.unlinkFromAccount({ contactId: FOREIGN_CONTACT_ID })).rejects.toThrow(
        expect.objectContaining({ code: 'NOT_FOUND' })
      );
      expect(unlinkSpy).not.toHaveBeenCalled();
    });

    it('rejects a contact filtered out by RLS (null lookup) with NOT_FOUND', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);
      const unlinkSpy = vi.fn().mockResolvedValue(ok(domainContact()));
      ctx.services!.contact!.disassociateFromAccount = unlinkSpy;
      prismaMock.contact.findUnique.mockResolvedValue(null);

      await expect(caller.unlinkFromAccount({ contactId: FOREIGN_CONTACT_ID })).rejects.toThrow(
        expect.objectContaining({ code: 'NOT_FOUND' })
      );
      expect(unlinkSpy).not.toHaveBeenCalled();
    });
  });

  // #420: linkToAccount — associateWithAccount tenant-scopes the account but loads
  // the contact via the non-tenant-scoped service findById; the router preflight
  // denies a cross-tenant contactId before the association.
  describe('linkToAccount (tenant preflight, #420)', () => {
    it('rejects a cross-tenant contact (tenantId mismatch) with NOT_FOUND', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);
      const linkSpy = vi.fn().mockResolvedValue(ok(domainContact()));
      ctx.services!.contact!.associateWithAccount = linkSpy;
      prismaMock.contact.findUnique.mockResolvedValue({
        id: FOREIGN_CONTACT_ID,
        tenantId: FOREIGN_TENANT_ID,
      } as never);

      await expect(
        caller.linkToAccount({ contactId: FOREIGN_CONTACT_ID, accountId: TEST_UUIDS.account1 })
      ).rejects.toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
      expect(linkSpy).not.toHaveBeenCalled();
    });

    it('rejects a contact filtered out by RLS (null lookup) with NOT_FOUND', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);
      const linkSpy = vi.fn().mockResolvedValue(ok(domainContact()));
      ctx.services!.contact!.associateWithAccount = linkSpy;
      prismaMock.contact.findUnique.mockResolvedValue(null);

      await expect(
        caller.linkToAccount({ contactId: FOREIGN_CONTACT_ID, accountId: TEST_UUIDS.account1 })
      ).rejects.toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
      expect(linkSpy).not.toHaveBeenCalled();
    });
  });
});
