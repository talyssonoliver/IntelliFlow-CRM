import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/purpose-ceiling.js', () => ({
  notePurposeSpend: vi.fn(),
  notePurposeSpendTotal: vi.fn(),
}));
import { createTenantAiActionsRecorder } from './tenant-ai-spend';
import {
  _allowanceCache,
  assertWithinAiActions,
  setAiActionsAllowanceReader,
} from '../lib/ai-actions-allowance';

function setup(tenantId: string | undefined, increment = vi.fn().mockResolvedValue(undefined)) {
  const logger = { warn: vi.fn() };
  const record = createTenantAiActionsRecorder({
    quota: { increment },
    getTenantId: () => tenantId,
    logger,
    maxUnwrittenActions: 5,
  });
  return { record, increment, logger };
}

describe('createTenantAiActionsRecorder', () => {
  beforeEach(() => {
    setAiActionsAllowanceReader(null);
    _allowanceCache.clear();
  });

  it('counts one action under aiActionsPerMonth for the job tenant', async () => {
    const { record, increment } = setup('tenant-1');
    await record();
    expect(increment).toHaveBeenCalledTimes(1);
    expect(increment).toHaveBeenCalledWith('tenant-1', 'aiActionsPerMonth', 1);
  });

  it('counts a free model call like a paid one: it looks at the event, never at the cost', async () => {
    const { record, increment } = setup('tenant-1');
    await record();
    await record();
    expect(increment).toHaveBeenCalledTimes(2);
  });

  it('counts every call of a chain, one action each', async () => {
    const { record, increment } = setup('tenant-1');
    for (let i = 0; i < 4; i++) await record();
    expect(increment).toHaveBeenCalledTimes(4);
    expect(increment.mock.calls.every((c) => c[2] === 1)).toBe(true);
  });

  it.each([undefined, 'unknown', '__scheduled__', '__system__'])(
    'counts nothing without a billable tenant (%s)',
    async (tenantId) => {
      const { record, increment } = setup(tenantId);
      await record();
      expect(increment).not.toHaveBeenCalled();
    }
  );

  it('warns, never rejects, and writes the missed action with the next call', async () => {
    const increment = vi
      .fn()
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValue(undefined);
    const { record, logger } = setup('tenant-1', increment);

    await expect(record()).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1', key: 'aiActionsPerMonth', actions: 1 }),
      expect.stringContaining('USAGE_NOT_RECORDED')
    );
    await record();
    expect(increment).toHaveBeenLastCalledWith('tenant-1', 'aiActionsPerMonth', 2);
    await record();
    expect(increment).toHaveBeenLastCalledWith('tenant-1', 'aiActionsPerMonth', 1);
  });

  it('bounds the actions held back after repeated failures', async () => {
    const increment = vi.fn().mockRejectedValue(new Error('db down'));
    const { record } = setup('tenant-1', increment);
    for (let i = 0; i < 20; i++) await record();
    increment.mockResolvedValue(undefined);
    await record();
    expect(increment).toHaveBeenLastCalledWith('tenant-1', 'aiActionsPerMonth', 6);
  });

  it('adds the action to the enforcement balance at once, so a burst cannot run past the cap', async () => {
    setAiActionsAllowanceReader({
      getLimits: vi.fn().mockResolvedValue({ aiActionsPerMonth: 2 }),
      getKeyUsage: vi.fn().mockResolvedValue(0),
    });
    await assertWithinAiActions('tenant-1'); // loads used 0 of 2
    const { record } = setup('tenant-1');
    await record();
    await record();
    await expect(assertWithinAiActions('tenant-1')).rejects.toMatchObject({ limit: 2, used: 2 });
  });
});
