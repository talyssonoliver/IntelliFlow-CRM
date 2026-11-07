/**
 * Inbound mail is routed only by an exact recipient match against the
 * provider-proven account address of an ACTIVE Google or Microsoft mailbox.
 * These tests pin that: no domain matching, no fallback bucket, no typed-in
 * SMTP address, and no guessing when an address belongs to more than one place.
 */

import { describe, it, expect, vi } from 'vitest';
import { deliveryRecipients, resolveMailboxForInboundEmail } from '../inbound.router';

type Row = { id: string; tenantId: string; accountAddress: string | null };

function makePrisma(rows: Row[]) {
  const findMany = vi.fn().mockResolvedValue(rows);
  return { prisma: { emailMailbox: { findMany }, user: { findMany: vi.fn() } }, findMany };
}

const box = (id: string, tenantId: string, accountAddress: string): Row => ({
  id,
  tenantId,
  accountAddress,
});

describe('resolveMailboxForInboundEmail', () => {
  it('routes to the tenant and mailbox whose account address is a recipient', async () => {
    const { prisma } = makePrisma([box('mb-1', 'tenant-a', 'sales@a.example.invalid')]);

    const match = await resolveMailboxForInboundEmail(['sales@a.example.invalid'], prisma);

    expect(match).toEqual({ kind: 'matched', tenantId: 'tenant-a', mailboxId: 'mb-1' });
  });

  it('asks only for ACTIVE OAuth mailboxes by proven address, case-insensitively, in one query', async () => {
    const { prisma, findMany } = makePrisma([]);

    await resolveMailboxForInboundEmail(
      [' Sales@A.example.invalid ', 'sales@a.example.invalid'],
      prisma
    );

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0][0].where).toEqual({
      status: 'ACTIVE',
      // An SMTP mailbox's address is typed in, not proven: it never routes inbound mail.
      kind: { in: ['GMAIL', 'MICROSOFT'] },
      accountAddress: { in: ['sales@a.example.invalid'], mode: 'insensitive' },
    });
  });

  it('matches the stored address whatever its case', async () => {
    const { prisma } = makePrisma([box('mb-2', 'tenant-a', 'Owner@A.example.invalid')]);

    const match = await resolveMailboxForInboundEmail(['owner@a.example.invalid'], prisma);

    expect(match).toEqual({ kind: 'matched', tenantId: 'tenant-a', mailboxId: 'mb-2' });
  });

  it('never routes by domain: an address no mailbox has gets nothing', async () => {
    const { prisma } = makePrisma([]);

    const match = await resolveMailboxForInboundEmail(['carol@mail.example.invalid'], prisma);

    expect(match).toEqual({ kind: 'unmatched' });
    expect(prisma.user.findMany).not.toHaveBeenCalled();
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

describe('deliveryRecipients', () => {
  const parsed = {
    headers: {
      to: [{ address: 'to@a.example.invalid' }],
      cc: [{ address: 'cc@a.example.invalid' }],
    },
  };

  it('uses the signed delivery envelope, the only place a Bcc recipient appears', () => {
    const envelope = JSON.stringify({ to: ['bcc@a.example.invalid'], from: 'x@b.example.invalid' });

    expect(deliveryRecipients(parsed, envelope)).toEqual(['bcc@a.example.invalid']);
  });

  it('accepts an envelope whose "to" is a single address', () => {
    expect(deliveryRecipients(parsed, JSON.stringify({ to: 'one@a.example.invalid' }))).toEqual([
      'one@a.example.invalid',
    ]);
  });

  it.each([
    ['no envelope', undefined],
    ['an envelope that is not JSON', 'not json'],
    ['an envelope without recipients', JSON.stringify({ from: 'x@b.example.invalid' })],
  ])('falls back to the To and Cc headers with %s', (_label, envelope) => {
    expect(deliveryRecipients(parsed, envelope)).toEqual([
      'to@a.example.invalid',
      'cc@a.example.invalid',
    ]);
  });

  it('returns nothing when there is neither an envelope nor a header recipient', () => {
    expect(deliveryRecipients({ headers: {} }, undefined)).toEqual([]);
  });
});
