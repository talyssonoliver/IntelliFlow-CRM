/**
 * Contact Router — Tenant Isolation (IFC-265, T-04)
 *
 * Cross-tenant negative/scoping tests for the procedures NOT already covered by
 * `contact.router.security.test.ts` (which covers search / logActivity /
 * bulkEmail / bulkExport / stats / getById / getByEmail — R-02..R-06).
 *
 * Covered here: create, update, delete, addNote, bulkDelete, linkToAccount,
 * unlinkFromAccount, updateEmail. Each asserts that a caller is confined to its
 * own tenant — either by the procedure stamping/forwarding the caller's
 * tenant/owner to the domain service, or by a cross-tenant id being filtered out
 * (RLS via prismaWithTenant) and surfacing as NOT_FOUND / failed.
 *
 * Mirrors the existing harness (createTestContext + prismaMock + service mocks).
 */
import { describe, it, expect, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { contactRouter } from '../contact.router';
import { prismaMock, createTestContext, TEST_UUIDS, generateTestUUID } from '../../../test/setup';

// A valid UUID that belongs to a DIFFERENT tenant (never visible to the caller).
const FOREIGN_CONTACT_ID = generateTestUUID('foreign-tenant-contact');
const FOREIGN_ACCOUNT_ID = generateTestUUID('foreign-tenant-account');

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
const fail = (message: string) => ({ isSuccess: false, isFailure: true, error: { message } });

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

  // update: forwards the caller userId to the domain service; a cross-tenant id
  // the service cannot resolve surfaces as NOT_FOUND.
  describe('update', () => {
    it('forwards the caller userId to the update service', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);
      const updateSpy = vi.fn().mockResolvedValue(ok(domainContact()));
      ctx.services!.contact!.updateContactInfo = updateSpy;
      ctx.services!.contact!.getContactById = vi.fn().mockResolvedValue(ok(domainContact()));

      await caller.update({ id: TEST_UUIDS.contact1, title: 'Renamed' });

      expect(updateSpy).toHaveBeenCalled();
      expect(updateSpy.mock.calls[0]).toContain(TEST_UUIDS.user1);
    });

    it('rejects a cross-tenant contact id with NOT_FOUND', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);
      ctx.services!.contact!.updateContactInfo = vi
        .fn()
        .mockResolvedValue(fail(`Contact not found: ${FOREIGN_CONTACT_ID}`));

      await expect(caller.update({ id: FOREIGN_CONTACT_ID, title: 'Hijack' })).rejects.toThrow(
        expect.objectContaining({ code: 'NOT_FOUND' })
      );
    });
  });

  // delete: looks up via prismaWithTenant (RLS); a cross-tenant id is filtered
  // out (findUnique → null) and yields NOT_FOUND before any mutation.
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

  // linkToAccount: forwards the caller userId + tenantId to the domain service.
  describe('linkToAccount', () => {
    it('forwards the caller userId + tenantId to associateWithAccount', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);
      const linkSpy = vi.fn().mockResolvedValue(ok(domainContact()));
      ctx.services!.contact!.associateWithAccount = linkSpy;

      await caller.linkToAccount({
        contactId: TEST_UUIDS.contact1,
        accountId: TEST_UUIDS.account1,
      });

      const args = linkSpy.mock.calls[0];
      expect(args).toContain(TEST_UUIDS.user1);
      expect(args).toContain(TEST_UUIDS.tenant);
    });

    it('rejects linking a cross-tenant account', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);
      ctx.services!.contact!.associateWithAccount = vi
        .fn()
        .mockResolvedValue(fail(`Account not found: ${FOREIGN_ACCOUNT_ID}`));

      await expect(
        caller.linkToAccount({ contactId: TEST_UUIDS.contact1, accountId: FOREIGN_ACCOUNT_ID })
      ).rejects.toThrow(TRPCError);
    });
  });

  // unlinkFromAccount: forwards the caller userId; a cross-tenant id → NOT_FOUND.
  describe('unlinkFromAccount', () => {
    it('forwards the caller userId to disassociateFromAccount', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);
      const unlinkSpy = vi.fn().mockResolvedValue(ok(domainContact()));
      ctx.services!.contact!.disassociateFromAccount = unlinkSpy;

      await caller.unlinkFromAccount({ contactId: TEST_UUIDS.contact1 });

      expect(unlinkSpy.mock.calls[0]).toContain(TEST_UUIDS.user1);
    });

    it('rejects a cross-tenant contact id with NOT_FOUND', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);
      ctx.services!.contact!.disassociateFromAccount = vi
        .fn()
        .mockResolvedValue(fail(`Contact not found: ${FOREIGN_CONTACT_ID}`));

      await expect(caller.unlinkFromAccount({ contactId: FOREIGN_CONTACT_ID })).rejects.toThrow(
        expect.objectContaining({ code: 'NOT_FOUND' })
      );
    });
  });

  // updateEmail: forwards the caller userId; a cross-tenant id → NOT_FOUND.
  describe('updateEmail', () => {
    it('forwards the caller userId to updateContactEmail', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);
      const emailSpy = vi.fn().mockResolvedValue(ok(domainContact()));
      ctx.services!.contact!.updateContactEmail = emailSpy;

      await caller.updateEmail({ id: TEST_UUIDS.contact1, email: 'updated@example.com' });

      expect(emailSpy.mock.calls[0]).toContain(TEST_UUIDS.user1);
    });

    it('rejects a cross-tenant contact id with NOT_FOUND', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);
      ctx.services!.contact!.updateContactEmail = vi
        .fn()
        .mockResolvedValue(fail(`Contact not found: ${FOREIGN_CONTACT_ID}`));

      await expect(
        caller.updateEmail({ id: FOREIGN_CONTACT_ID, email: 'hijack@example.com' })
      ).rejects.toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
    });
  });
});
