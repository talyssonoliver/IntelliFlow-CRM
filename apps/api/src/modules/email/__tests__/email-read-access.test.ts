/**
 * canReadEmailRecord: register #64, personal mail is private. The same rule serves the email view
 * (getEmail, getThread) and the attachment proxy; its cases mirror the shared predicate of
 * packages/db/src/email-visibility.ts (fix/personal-mail-private).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const people = vi.hoisted(() => ({ lead: vi.fn(), contact: vi.fn() }));

import { canReadEmailRecord, type ReadableEmail } from '../email-read-access';

const ME = 'user-me';
const ctx = (role = 'USER') =>
  ({
    prismaWithTenant: { lead: { findFirst: people.lead }, contact: { findFirst: people.contact } },
    tenant: { tenantId: 'tenant-1', userId: ME, role, canAccessAllTenantData: role === 'ADMIN' },
  }) as never;

const mail = (over: Partial<ReadableEmail> = {}): ReadableEmail => ({
  userId: null,
  mailboxId: 'mbx-1',
  contactId: null,
  metadata: {},
  mailbox: { scope: 'USER', userId: 'user-a' },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  people.lead.mockResolvedValue(null);
  people.contact.mockResolvedValue(null);
});

describe('canReadEmailRecord', () => {
  it("hides one user's personal mailbox from another, and shows it to its owner", async () => {
    expect(await canReadEmailRecord(ctx(), mail())).toBe(false);
    expect(await canReadEmailRecord(ctx(), mail({ mailbox: { scope: 'USER', userId: ME } }))).toBe(
      true
    );
  });

  it('has no admin override for personal mail', async () => {
    expect(await canReadEmailRecord(ctx('ADMIN'), mail())).toBe(false);
  });

  it('shows company-mailbox mail to the tenant, whoever sent it', async () => {
    expect(
      await canReadEmailRecord(
        ctx(),
        mail({ userId: 'other', mailbox: { scope: 'TENANT', userId: null } })
      )
    ).toBe(true);
  });

  it('shows personal mail logged to a lead or contact the reader can see, scoped as createTenantWhereClause', async () => {
    people.lead.mockResolvedValue({ id: 'lead-1' });
    expect(await canReadEmailRecord(ctx(), mail({ metadata: { leadId: 'lead-1' } }))).toBe(true);
    const where = people.lead.mock.calls[0][0].where;
    // A member sees their own leads: the scope comes from createTenantWhereClause.
    expect(where).toMatchObject({ id: 'lead-1', tenantId: 'tenant-1', ownerId: ME });
    people.lead.mockResolvedValue(null);
    expect(await canReadEmailRecord(ctx(), mail({ metadata: { leadId: 'lead-1' } }))).toBe(false);
    people.contact.mockResolvedValue({ id: 'c-1' });
    expect(await canReadEmailRecord(ctx(), mail({ contactId: 'c-1' }))).toBe(true);
  });

  it('lets an admin see all leads, so mail logged to any lead is visible to them', async () => {
    people.lead.mockResolvedValue({ id: 'lead-1' });
    expect(await canReadEmailRecord(ctx('ADMIN'), mail({ metadata: { leadId: 'lead-1' } }))).toBe(
      true
    );
    expect(people.lead.mock.calls[0][0].where).not.toHaveProperty('ownerId');
  });

  it('handles mail with no mailbox: unowned is shared, owned is its owner only', async () => {
    const none = { mailboxId: null, mailbox: null };
    expect(await canReadEmailRecord(ctx(), mail({ ...none, userId: null }))).toBe(true);
    expect(await canReadEmailRecord(ctx(), mail({ ...none, userId: ME }))).toBe(true);
    expect(await canReadEmailRecord(ctx(), mail({ ...none, userId: 'other' }))).toBe(false);
    expect(
      await canReadEmailRecord(ctx(), mail({ ...none, metadata: { mailboxOwnerId: ME } }))
    ).toBe(true);
    expect(
      await canReadEmailRecord(ctx(), mail({ ...none, metadata: { mailboxOwnerId: 'other' } }))
    ).toBe(false);
  });

  it('keeps a draft with its writer, even in the company mailbox', async () => {
    const draft = { metadata: { isDraft: true }, mailbox: { scope: 'TENANT', userId: null } };
    expect(await canReadEmailRecord(ctx(), mail({ ...draft, userId: 'other' }))).toBe(false);
    expect(await canReadEmailRecord(ctx(), mail({ ...draft, userId: ME }))).toBe(true);
    // Not even logged to a visible lead makes someone else's draft readable.
    people.lead.mockResolvedValue({ id: 'lead-1' });
    expect(
      await canReadEmailRecord(
        ctx(),
        mail({ metadata: { isDraft: true, leadId: 'lead-1' }, userId: 'other' })
      )
    ).toBe(false);
  });
});
