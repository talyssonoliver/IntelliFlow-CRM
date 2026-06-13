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
 * These complement contact.router.security.test.ts (R-02..R-06: search / logActivity /
 * bulkEmail / bulkExport / stats / getById / getByEmail).
 *
 * NOT covered here on purpose: update / updateEmail / unlinkFromAccount / linkToAccount.
 * Those delegate to the singleton ContactService, whose contactRepository.findById(id)
 * takes no tenant argument and has NO router-level scoped preflight — their cross-tenant
 * denial cannot be honestly unit-tested without a production change. A forwarding-only
 * assertion would be a false isolation test. The gap (and the proposed router preflight)
 * is tracked in gh issue #420 + debt-ledger CONTACT-MUTATION-TENANT-SCOPE-001.
 *
 * Mirrors the existing harness (createTestContext + prismaMock + service mocks).
 */
import { describe, it, expect, vi } from 'vitest';
import { contactRouter } from '../contact.router';
import { prismaMock, createTestContext, TEST_UUIDS, generateTestUUID } from '../../../test/setup';

// A valid UUID that belongs to a DIFFERENT tenant (never visible to the caller).
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
});
