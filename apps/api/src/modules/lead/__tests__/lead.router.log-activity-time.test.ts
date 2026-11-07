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
  const captured: { activity?: any; lead?: any } = {};
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
          captured.lead = args.data;
          return mockLead;
        }),
      },
    };
    return fn(tx);
  });
  return captured;
}

describe('lead.logActivity occurredAt', () => {
  it('stamps the activity with occurredAt and keeps a later lastContactedAt', async () => {
    const later = new Date('2026-11-01T12:00:00.000Z');
    prismaMock.lead.findUnique.mockResolvedValue({ ...mockLead, lastContactedAt: later } as any);
    const captured = captureTransaction();

    await leadRouter.createCaller(createTestContext()).logActivity({
      leadId: TEST_UUIDS.lead1,
      type: 'EMAIL',
      title: 'Outreach email sent',
      occurredAt: '2026-09-27T09:30:00.000Z' as unknown as Date,
    });

    expect(captured.activity.timestamp).toEqual(new Date('2026-09-27T09:30:00.000Z'));
    expect(captured.lead.lastContactedAt).toEqual(later);
  });

  it('moves lastContactedAt forward when occurredAt is newer', async () => {
    prismaMock.lead.findUnique.mockResolvedValue({
      ...mockLead,
      lastContactedAt: new Date('2026-09-01T00:00:00.000Z'),
    } as any);
    const captured = captureTransaction();
    const at = new Date('2026-10-07T08:00:00.000Z');

    await leadRouter.createCaller(createTestContext()).logActivity({
      leadId: TEST_UUIDS.lead1,
      type: 'EMAIL',
      title: 'Follow-up email sent',
      occurredAt: at,
    });

    expect(captured.activity.timestamp).toEqual(at);
    expect(captured.lead.lastContactedAt).toEqual(at);
  });

  it('defaults to now when occurredAt is omitted', async () => {
    prismaMock.lead.findUnique.mockResolvedValue({ ...mockLead, lastContactedAt: null } as any);
    const captured = captureTransaction();
    const before = Date.now();

    await leadRouter.createCaller(createTestContext()).logActivity({
      leadId: TEST_UUIDS.lead1,
      type: 'CALL',
      title: 'Call',
    });

    const stamped = (captured.activity.timestamp as Date).getTime();
    expect(stamped).toBeGreaterThanOrEqual(before);
    expect(captured.lead.lastContactedAt).toEqual(captured.activity.timestamp);
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
