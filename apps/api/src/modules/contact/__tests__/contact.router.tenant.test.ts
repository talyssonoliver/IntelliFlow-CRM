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
 * access preflight (`assertContactInTenant`) — a findFirst with `createTenantWhereClause` (the SAME
 * tenant+owner/team/admin predicate the reads use), BEFORE delegating to the singleton ContactService
 * (whose repository findById is not tenant/owner-scoped, on the global container prisma). A contact
 * outside the caller's access scope is filtered by that WHERE → findFirst returns null → NOT_FOUND,
 * and the mutation service is never invoked. The tests below exercise the REAL preflight (the actual
 * prismaWithTenant lookup + its WHERE), NOT the IFC-265 false-isolation trap (which mocked the service
 * to fail and proved nothing).
 *
 * These complement contact.router.security.test.ts (R-02..R-06: search / logActivity /
 * bulkEmail / bulkExport / stats / getById / getByEmail).
 *
 * Mirrors the existing harness (createTestContext + prismaMock + service mocks).
 */
import { describe, it, expect, vi } from 'vitest';
import { contactRouter } from '../contact.router';
import { prismaMock, createTestContext, TEST_UUIDS, generateTestUUID } from '../../../test/setup';

// A valid UUID outside the caller's access scope (other tenant/owner).
const FOREIGN_CONTACT_ID = generateTestUUID('foreign-tenant-contact');

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

  // bulkDelete: the preflight findMany applies createTenantWhereClause (#420-class)
  // BEFORE delegating to the non-tenant-scoped ContactService.deleteContact, so the
  // WHERE is the real access gate. We assert that WHERE is tenant-scoped (genuine —
  // not just a mocked-empty result), then that cross-tenant ids consequently fail.
  // See R-04b in contact.router.security.test.ts for the ownerId/tenantId assertions.
  describe('bulkDelete', () => {
    it('scopes the preflight WHERE by tenant and never deletes cross-tenant ids', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);
      // The tenant-scoped WHERE excludes foreign ids → findMany returns nothing.
      prismaMock.contact.findMany.mockResolvedValue([]);

      const result = await caller.bulkDelete({ ids: [FOREIGN_CONTACT_ID, generateTestUUID('f2')] });

      // Genuine contract: the preflight WHERE carries the caller's tenantId.
      const where = prismaMock.contact.findMany.mock.calls[0][0]?.where as Record<string, unknown>;
      expect(where).toHaveProperty('tenantId', TEST_UUIDS.tenant);

      expect(result.successful).toEqual([]);
      expect(result.failed).toHaveLength(2);
      expect(result.failed.every((f) => /not found/i.test(f.error))).toBe(true);
      expect(ctx.services!.contact!.deleteContact).not.toHaveBeenCalled();
    });
  });

  // #420: the four service-delegated mutations now run assertContactInTenant —
  // a findFirst with createTenantWhereClause (the SAME predicate the reads use),
  // BEFORE delegating to the non-tenant-scoped service. A contact outside the
  // caller's access scope (other tenant, other owner, or absent) is filtered out
  // by that WHERE → findFirst returns null → NOT_FOUND, and the mutation service
  // is never invoked. These exercise the REAL preflight (the actual prismaWithTenant
  // lookup), not a mocked-to-fail service (the IFC-265 false-isolation trap).
  describe('update (access preflight, #420)', () => {
    it('denies a contact outside the caller access scope with NOT_FOUND', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);
      const updateSpy = vi.fn().mockResolvedValue(ok(domainContact()));
      ctx.services!.contact!.updateContactInfo = updateSpy;
      prismaMock.contact.findFirst.mockResolvedValue(null);

      await expect(caller.update({ id: FOREIGN_CONTACT_ID, title: 'Hijack' })).rejects.toThrow(
        expect.objectContaining({ code: 'NOT_FOUND' })
      );
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it('scopes the preflight lookup by tenant AND owner for a non-admin caller', async () => {
      const ctx = createTestContext(); // default role USER → owner-scoped
      const caller = contactRouter.createCaller(ctx);
      ctx.services!.contact!.updateContactInfo = vi.fn().mockResolvedValue(ok(domainContact()));
      prismaMock.contact.findFirst.mockResolvedValue(null);

      await caller.update({ id: FOREIGN_CONTACT_ID, title: 'x' }).catch(() => {});

      const where = prismaMock.contact.findFirst.mock.calls[0]?.[0]?.where as Record<
        string,
        unknown
      >;
      expect(where).toMatchObject({ id: FOREIGN_CONTACT_ID, tenantId: TEST_UUIDS.tenant });
      // regular user: lookup is restricted to their own contacts (cannot reach a
      // same-tenant contact owned by another user)
      expect(where.ownerId).toBe(TEST_UUIDS.user1);
    });
  });

  describe('updateEmail (access preflight, #420)', () => {
    it('denies a contact outside the caller access scope with NOT_FOUND', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);
      const emailSpy = vi.fn().mockResolvedValue(ok(domainContact()));
      ctx.services!.contact!.updateContactEmail = emailSpy;
      prismaMock.contact.findFirst.mockResolvedValue(null);

      await expect(
        caller.updateEmail({ id: FOREIGN_CONTACT_ID, email: 'hijack@example.com' })
      ).rejects.toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
      expect(emailSpy).not.toHaveBeenCalled();
    });
  });

  describe('unlinkFromAccount (access preflight, #420)', () => {
    it('denies a contact outside the caller access scope with NOT_FOUND', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);
      const unlinkSpy = vi.fn().mockResolvedValue(ok(domainContact()));
      ctx.services!.contact!.disassociateFromAccount = unlinkSpy;
      prismaMock.contact.findFirst.mockResolvedValue(null);

      await expect(caller.unlinkFromAccount({ contactId: FOREIGN_CONTACT_ID })).rejects.toThrow(
        expect.objectContaining({ code: 'NOT_FOUND' })
      );
      expect(unlinkSpy).not.toHaveBeenCalled();
    });
  });

  // linkToAccount: associateWithAccount tenant-scopes the account but loads the
  // contact via the non-tenant-scoped service findById; the preflight denies a
  // contact outside the caller's access scope before the association.
  describe('linkToAccount (access preflight, #420)', () => {
    it('denies a contact outside the caller access scope with NOT_FOUND', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);
      const linkSpy = vi.fn().mockResolvedValue(ok(domainContact()));
      ctx.services!.contact!.associateWithAccount = linkSpy;
      prismaMock.contact.findFirst.mockResolvedValue(null);

      await expect(
        caller.linkToAccount({ contactId: FOREIGN_CONTACT_ID, accountId: TEST_UUIDS.account1 })
      ).rejects.toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
      expect(linkSpy).not.toHaveBeenCalled();
    });
  });
});
