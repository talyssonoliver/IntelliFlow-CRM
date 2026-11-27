/**
 * lead.logActivity — occurredAt (#1223 UI-005).
 *
 * An import of past emails used to be stamped with the import time and carried
 * the real date in the title. logActivity now takes the real time, refuses a
 * future one, and never moves lastContactedAt backwards.
 */

import { describe, it, expect, vi } from 'vitest';
import { leadRouter } from '../lead.router';
import { prismaMock, createTestContext, mockLead, TEST_UUIDS } from '../../../test/setup';

vi.mock('../../notifications/notifications.router', () => ({
  createNotification: vi.fn(() => Promise.resolve({})),
}));

vi.mock('@intelliflow/adapters', () => ({
  detectScoreBias: vi.fn().mockResolvedValue(null),
}));

function captureTransaction() {
  const captured: { activity?: any; lead?: any; contact?: any } = {};
  prismaMock.$transaction.mockImplementation(async (fn: any) => {
    const tx = {
      leadActivity: {
        create: vi.fn(async (args: any) => {
          captured.activity = args.data;
          return { id: 'activity-1', ...args.data };
        }),
      },
      lead: {
        update: vi.fn(async (args: any) => {
          captured.lead = args;
          return mockLead;
        }),
        updateMany: vi.fn(async (args: any) => {
          captured.contact = args;
          return { count: 1 };
        }),
      },
    };
    return fn(tx);
  });
  return captured;
}

describe('lead.logActivity occurredAt', () => {
  it('stamps the activity with occurredAt', async () => {
    prismaMock.lead.findUnique.mockResolvedValue(mockLead as any);
    const captured = captureTransaction();

    await leadRouter.createCaller(createTestContext()).logActivity({
      leadId: TEST_UUIDS.lead1,
      type: 'EMAIL',
      title: 'Outreach email sent',
      occurredAt: '2026-09-27T09:30:00.000Z' as unknown as Date,
    });

    expect(captured.activity.timestamp).toEqual(new Date('2026-09-27T09:30:00.000Z'));
  });

  it('moves lastContactedAt only forward, compared in the UPDATE itself', async () => {
    prismaMock.lead.findUnique.mockResolvedValue(mockLead as any);
    const captured = captureTransaction();
    const at = new Date('2026-10-07T08:00:00.000Z');

    await leadRouter.createCaller(createTestContext()).logActivity({
      leadId: TEST_UUIDS.lead1,
      type: 'EMAIL',
      title: 'Follow-up email sent',
      occurredAt: at,
    });

    // updatedAt only on the plain update: lastContactedAt is not set from a stale read.
    expect(captured.lead.data).not.toHaveProperty('lastContactedAt');
    expect(captured.lead.data.updatedAt).toBeInstanceOf(Date);
    // The conditional update writes it only where the stored value is null or older.
    expect(captured.contact.data).toEqual({ lastContactedAt: at });
    expect(captured.contact.where).toMatchObject({
      id: TEST_UUIDS.lead1,
      OR: [{ lastContactedAt: null }, { lastContactedAt: { lt: at } }],
    });
    // Tenant-scoped like the plain update.
    expect(captured.contact.where).toMatchObject(
      Object.fromEntries(Object.entries(captured.lead.where).filter(([k]) => k !== 'id')) as Record<
        string,
        unknown
      >
    );
  });

  it('defaults to now when occurredAt is omitted', async () => {
    prismaMock.lead.findUnique.mockResolvedValue(mockLead as any);
    const captured = captureTransaction();
    const before = Date.now();

    await leadRouter.createCaller(createTestContext()).logActivity({
      leadId: TEST_UUIDS.lead1,
      type: 'CALL',
      title: 'Call',
    });

    const stamped = (captured.activity.timestamp as Date).getTime();
    expect(stamped).toBeGreaterThanOrEqual(before);
    expect(captured.contact.data.lastContactedAt).toEqual(captured.activity.timestamp);
  });

  it('stores the direction of an email in its metadata, and none when not given', async () => {
    prismaMock.lead.findUnique.mockResolvedValue(mockLead as any);
    const captured = captureTransaction();

    await leadRouter.createCaller(createTestContext()).logActivity({
      leadId: TEST_UUIDS.lead1,
      type: 'EMAIL',
      title: 'Reply received: pricing',
      direction: 'inbound',
    });
    expect(captured.activity.metadata).toEqual({ direction: 'inbound' });

    await leadRouter.createCaller(createTestContext()).logActivity({
      leadId: TEST_UUIDS.lead1,
      type: 'NOTE',
      title: 'Note',
    });
    expect(captured.activity).not.toHaveProperty('metadata');
  });

  it('stores inbound for a "Reply received" email logged without a direction (MVP-001)', async () => {
    prismaMock.lead.findUnique.mockResolvedValue(mockLead as any);
    const captured = captureTransaction();

    await leadRouter.createCaller(createTestContext()).logActivity({
      leadId: TEST_UUIDS.lead1,
      type: 'EMAIL',
      title: 'Reply received: "We did not get your email"',
    });
    expect(captured.activity.metadata).toEqual({ direction: 'inbound' });

    // An explicit direction still wins, and an ordinary email stays without one.
    await leadRouter.createCaller(createTestContext()).logActivity({
      leadId: TEST_UUIDS.lead1,
      type: 'EMAIL',
      title: 'Reply received: x',
      direction: 'outbound',
    });
    expect(captured.activity.metadata).toEqual({ direction: 'outbound' });

    await leadRouter.createCaller(createTestContext()).logActivity({
      leadId: TEST_UUIDS.lead1,
      type: 'EMAIL',
      title: 'Outreach email sent',
    });
    expect(captured.activity).not.toHaveProperty('metadata');
  });

  it('writes no machine id into the title or description (register row 42)', async () => {
    prismaMock.lead.findUnique.mockResolvedValue(mockLead as any);
    const captured = captureTransaction();
    const id = 'c' + 'mw5j72u40001p5ug01kf3vot';

    await leadRouter.createCaller(createTestContext()).logActivity({
      leadId: TEST_UUIDS.lead1,
      type: 'EMAIL',
      title: `Price follow-up sent. COA ledger row ${id}.`,
      description: `Reply in their thread. COA ledger row ${id}.`,
    });

    expect(captured.activity.title).toBe('Price follow-up sent.');
    expect(captured.activity.description).toBe('Reply in their thread.');
    expect(JSON.stringify(captured.activity)).not.toContain(id);
  });

  it('gives a title that is nothing but an id a neutral one, never the id', async () => {
    prismaMock.lead.findUnique.mockResolvedValue(mockLead as any);
    const captured = captureTransaction();
    const id = 'c' + 'mw5j72u40001p5ug01kf3vot';

    await leadRouter.createCaller(createTestContext()).logActivity({
      leadId: TEST_UUIDS.lead1,
      type: 'NOTE',
      title: id,
    });

    expect(captured.activity.title).toBe('Activity');
    expect(JSON.stringify(captured.activity)).not.toContain(id);
  });

  it('rejects an unknown direction', async () => {
    prismaMock.lead.findUnique.mockResolvedValue(mockLead as any);
    captureTransaction();
    await expect(
      leadRouter.createCaller(createTestContext()).logActivity({
        leadId: TEST_UUIDS.lead1,
        type: 'EMAIL',
        title: 'Email',
        direction: 'sideways' as never,
      })
    ).rejects.toThrow();
  });

  it('rejects an occurredAt in the future', async () => {
    prismaMock.lead.findUnique.mockResolvedValue(mockLead as any);
    captureTransaction();

    await expect(
      leadRouter.createCaller(createTestContext()).logActivity({
        leadId: TEST_UUIDS.lead1,
        type: 'EMAIL',
        title: 'From the future',
        occurredAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      })
    ).rejects.toThrow(/future/);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
