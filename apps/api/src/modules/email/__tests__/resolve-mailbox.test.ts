/**
 * Inbound mail is routed only by an exact recipient match against an ACTIVE
 * connected mailbox. These tests pin that: no domain matching, no fallback
 * bucket, and no guessing when an address belongs to more than one place.
 */

import { describe, it, expect, vi } from 'vitest';
import { resolveMailboxForInboundEmail } from '../inbound.router';

type Row = { id: string; tenantId: string; fromAddress: string; accountAddress: string | null };

function makePrisma(rows: Row[]) {
  const findMany = vi.fn().mockResolvedValue(rows);
  return { prisma: { emailMailbox: { findMany }, user: { findMany: vi.fn() } }, findMany };
}

const box = (
  id: string,
  tenantId: string,
  fromAddress: string,
  accountAddress: string | null = null
): Row => ({
  id,
  tenantId,
  fromAddress,
  accountAddress,
});

describe('resolveMailboxForInboundEmail', () => {
  it('routes to the tenant and mailbox whose address is a recipient', async () => {
    const { prisma } = makePrisma([box('mb-1', 'tenant-a', 'sales@a.example.invalid')]);

    const match = await resolveMailboxForInboundEmail(['sales@a.example.invalid'], prisma);

    expect(match).toEqual({ kind: 'matched', tenantId: 'tenant-a', mailboxId: 'mb-1' });
  });

  it('asks only for ACTIVE mailboxes, by exact address, case-insensitively, in one query', async () => {
    const { prisma, findMany } = makePrisma([]);

    await resolveMailboxForInboundEmail(
      [' Sales@A.example.invalid ', 'sales@a.example.invalid'],
      prisma
    );

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0][0].where).toEqual({
      status: 'ACTIVE',
      OR: [
        { fromAddress: { in: ['sales@a.example.invalid'], mode: 'insensitive' } },
        { accountAddress: { in: ['sales@a.example.invalid'], mode: 'insensitive' } },
      ],
    });
  });

  it('matches an OAuth mailbox by its account address', async () => {
    const { prisma } = makePrisma([
      box('mb-2', 'tenant-a', 'alias@a.example.invalid', 'Owner@A.example.invalid'),
    ]);

    const match = await resolveMailboxForInboundEmail(['owner@a.example.invalid'], prisma);

    expect(match).toEqual({ kind: 'matched', tenantId: 'tenant-a', mailboxId: 'mb-2' });
  });

  it('never routes by domain: two customers on one shared domain get nothing they were not sent', async () => {
    // Tenant A connected ann@, tenant B connected bob@, both on the same public domain.
    const { prisma } = makePrisma([]);

    const match = await resolveMailboxForInboundEmail(['carol@mail.example.invalid'], prisma);

    expect(match).toEqual({ kind: 'unmatched' });
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('routes each of two shared-domain customers to their own tenant only', async () => {
    const a = makePrisma([box('mb-a', 'tenant-a', 'ann@mail.example.invalid')]);
    const b = makePrisma([box('mb-b', 'tenant-b', 'bob@mail.example.invalid')]);

    expect(await resolveMailboxForInboundEmail(['ann@mail.example.invalid'], a.prisma)).toEqual({
      kind: 'matched',
      tenantId: 'tenant-a',
      mailboxId: 'mb-a',
    });
    expect(await resolveMailboxForInboundEmail(['bob@mail.example.invalid'], b.prisma)).toEqual({
      kind: 'matched',
      tenantId: 'tenant-b',
      mailboxId: 'mb-b',
    });
  });

  it('is ambiguous when one address is connected in two tenants', async () => {
    const { prisma } = makePrisma([
      box('mb-a', 'tenant-a', 'shared@x.example.invalid'),
      box('mb-b', 'tenant-b', 'shared@x.example.invalid'),
    ]);

    const match = await resolveMailboxForInboundEmail(['shared@x.example.invalid'], prisma);

    expect(match).toEqual({ kind: 'ambiguous' });
  });

  it('is ambiguous when the recipients are mailboxes in different tenants', async () => {
    const { prisma } = makePrisma([
      box('mb-a', 'tenant-a', 'ann@a.example.invalid'),
      box('mb-b', 'tenant-b', 'bob@b.example.invalid'),
    ]);

    const match = await resolveMailboxForInboundEmail(
      ['ann@a.example.invalid', 'bob@b.example.invalid'],
      prisma
    );

    expect(match).toEqual({ kind: 'ambiguous' });
  });

  it('is ambiguous when one address is connected twice in the same tenant', async () => {
    const { prisma } = makePrisma([
      box('mb-1', 'tenant-a', 'team@a.example.invalid'),
      box('mb-2', 'tenant-a', 'team@a.example.invalid'),
    ]);

    const match = await resolveMailboxForInboundEmail(['team@a.example.invalid'], prisma);

    expect(match).toEqual({ kind: 'ambiguous' });
  });

  it('takes the first recipient that is a mailbox when several in one tenant match', async () => {
    const { prisma } = makePrisma([
      box('mb-2', 'tenant-a', 'second@a.example.invalid'),
      box('mb-1', 'tenant-a', 'first@a.example.invalid'),
    ]);

    const match = await resolveMailboxForInboundEmail(
      ['nobody@a.example.invalid', 'first@a.example.invalid', 'second@a.example.invalid'],
      prisma
    );

    expect(match).toEqual({ kind: 'matched', tenantId: 'tenant-a', mailboxId: 'mb-1' });
  });

  it('is unmatched, without a query, when no recipient is a usable address', async () => {
    const { prisma, findMany } = makePrisma([]);

    const match = await resolveMailboxForInboundEmail(
      ['not-an-email', '', '@x', 'a@', 'a@b@c'],
      prisma
    );

    expect(match).toEqual({ kind: 'unmatched' });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('lets a database error through, so the provider retries instead of the mail being lost', async () => {
    const findMany = vi.fn().mockRejectedValue(new Error('db down'));

    await expect(
      resolveMailboxForInboundEmail(['sales@a.example.invalid'], { emailMailbox: { findMany } })
    ).rejects.toThrow('db down');
  });
});
