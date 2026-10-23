/**
 * PG-203 — enqueueLeadScoring, extracted from lead.router create so the public
 * booking flow queues AI scoring exactly like an in-app lead (owner Q8/Q9).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const add = vi.fn();
const close = vi.fn();
const Queue = vi.fn(function (this: Record<string, unknown>, name: string, opts: unknown) {
  this.name = name;
  this.opts = opts;
  this.add = add;
  this.close = close;
});

vi.mock('../../../lib/load-bullmq', () => ({ loadBullMQ: vi.fn(async () => ({ Queue })) }));
vi.mock('@intelliflow/platform/queues/types', () => ({
  QUEUE_NAMES: { AI_SCORING: 'ai-scoring' },
}));

import { enqueueLeadScoring } from '../lead-scoring-enqueue';
import { loadBullMQ } from '../../../lib/load-bullmq';

const input = {
  leadId: 'lead-1',
  tenantId: 'tenant-1',
  lead: {
    email: 'ada@example.invalid',
    source: 'BOOKING',
    firstName: 'Ada',
    lastName: 'Lovelace',
    company: undefined,
    title: undefined,
    phone: undefined,
  },
  correlationId: 'lead-create-lead-1',
};

const allowAll = {
  status: vi.fn(async () => ({ restricted: false, blocksMarketing: false, since: null })),
};

describe('enqueueLeadScoring', () => {
  beforeEach(() => {
    add.mockReset().mockResolvedValue(undefined);
    close.mockReset().mockResolvedValue(undefined);
    Queue.mockClear();
  });

  it('adds a score-lead job to the AI scoring queue with the lead payload and an OTel carrier', async () => {
    await enqueueLeadScoring(input, allowAll);
    expect(Queue).toHaveBeenCalledWith(
      'ai-scoring',
      expect.objectContaining({
        connection: expect.objectContaining({ host: expect.any(String), port: expect.any(Number) }),
      })
    );
    expect(add).toHaveBeenCalledWith('score-lead', {
      leadId: 'lead-1',
      tenantId: 'tenant-1',
      lead: input.lead,
      correlationId: 'lead-create-lead-1',
      _otelCarrier: expect.any(Object),
    });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('never throws: a queue failure is logged without PII and swallowed', async () => {
    add.mockRejectedValueOnce(new Error('redis down'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(enqueueLeadScoring(input, allowAll)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(warn.mock.calls[0]);
    expect(logged).toContain('lead-1');
    expect(logged).not.toContain('ada@example.invalid');
    warn.mockRestore();
  });

  it('swallows a failure to load BullMQ too', async () => {
    vi.mocked(loadBullMQ).mockRejectedValueOnce(new Error('no bullmq'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(enqueueLeadScoring(input, allowAll)).resolves.toBeUndefined();
    warn.mockRestore();
  });

  it('never queues a person with an active processing restriction (PG-203, owner Q18)', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const restricted = {
      status: vi.fn(async () => ({ restricted: true, blocksMarketing: false, since: new Date() })),
    };
    await enqueueLeadScoring(input, restricted);
    expect(restricted.status).toHaveBeenCalledWith('tenant-1', 'ada@example.invalid');
    expect(Queue).not.toHaveBeenCalled();
    expect(JSON.stringify(info.mock.calls)).not.toContain('ada@example.invalid');
    info.mockRestore();
  });

  it('does not queue when the restriction check itself fails (fails closed)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    await enqueueLeadScoring(input, { status: vi.fn().mockRejectedValue(new Error('db down')) });
    expect(Queue).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('[lead-scoring] Restriction check failed; not scoring', {
      leadId: 'lead-1',
      error: 'Error',
    });
    warn.mockRestore();
    info.mockRestore();
  });
});
