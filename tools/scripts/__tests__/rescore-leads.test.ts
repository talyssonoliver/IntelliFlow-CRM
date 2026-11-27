import { describe, it, expect, vi } from 'vitest';
import { newInputsPresent, parseArgs, redactAddresses, run } from '../rescore-leads';

const row = (id: string, email: string) => ({
  id,
  email,
  firstName: null,
  lastName: null,
  company: null,
  title: null,
  phone: null,
  source: 'EMAIL',
  ownerId: 'o1',
  score: 30,
  scoringStatus: 'NEEDS_REVIEW',
  scoredAt: null,
});

function fakePrisma(rows: ReturnType<typeof row>[], restricted: string[] = []) {
  return {
    processingRestriction: {
      findMany: vi.fn().mockResolvedValue(restricted.map((subjectEmail) => ({ subjectEmail }))),
    },
    lead: {
      findMany: vi.fn().mockResolvedValueOnce(rows).mockResolvedValueOnce([]),
      findFirst: vi.fn().mockResolvedValue({ status: 'NEW', lastContactedAt: null }),
    },
    leadActivity: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn() },
  };
}

describe('rescore-leads', () => {
  it('is a dry run unless --apply is given', () => {
    expect(parseArgs(['--tenant', 't1'])).toMatchObject({ isApply: false, tenantFilter: 't1' });
    expect(parseArgs(['--tenant', 't1', '--apply', '--lead', 'l1'])).toMatchObject({
      isApply: true,
      leadFilter: 'l1',
    });
    expect(parseArgs(['--tenant', 't1', '--only-low-confidence']).onlyLowConfidence).toBe(true);
  });

  it('names the new inputs a lead has', () => {
    expect(newInputsPresent('Lead Status: NEW')).toEqual([]);
    expect(
      newInputsPresent(
        ['Email Tracking: 1 tracked emails sent', 'Stated Need: a site', 'Landing Page: /x'].join(
          '\n'
        )
      )
    ).toEqual(['email tracking', 'qualification answers', 'campaign or landing page']);
  });

  it('redacts email addresses in free text before printing', () => {
    expect(redactAddresses('Stated Need: write to pat@example.invalid please')).toBe(
      'Stated Need: write to [address] please'
    );
  });

  it('reads and skips but never queues in a dry run, even with a queue passed', async () => {
    const prisma = fakePrisma([row('a', 'pat@example.invalid'), row('b', 'gone@erased.invalid')]);
    const queue = { add: vi.fn(), close: vi.fn() };
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const totals = await run(prisma as never, parseArgs(['--tenant', 't1']), queue);
    log.mockRestore();
    expect(totals).toEqual({ seen: 2, skipped: 1, queued: 0 });
    expect(queue.add).not.toHaveBeenCalled();
    expect(prisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 't1' } })
    );
  });

  it('with --apply skips a restricted person and queues one scoring job per other lead', async () => {
    const prisma = fakePrisma(
      [row('a', 'pat@example.invalid'), row('b', 'Held@Example.invalid')],
      ['held@example.invalid']
    );
    const queue = { add: vi.fn().mockResolvedValue(undefined), close: vi.fn() };
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const totals = await run(
      prisma as never,
      parseArgs(['--tenant', 't1', '--apply', '--only-low-confidence']),
      queue
    );
    log.mockRestore();
    expect(totals).toEqual({ seen: 2, skipped: 1, queued: 1 });
    expect(queue.add).toHaveBeenCalledTimes(1);
    const [name, data, options] = queue.add.mock.calls[0]!;
    expect(name).toBe('score-lead');
    expect(data).toMatchObject({ leadId: 'a', tenantId: 't1', ownerId: 'o1' });
    expect(options.jobId).toMatch(/^lead-ai\.SCORE\.a\.[0-9a-f]{16}\.rescore[0-9a-z]+$/);
    expect(prisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 't1', scoringStatus: { in: ['NEEDS_REVIEW', 'NONE', 'FAILED'] } },
      })
    );
  });
});
