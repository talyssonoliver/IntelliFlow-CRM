import { describe, it, expect, vi } from 'vitest';
import { createTenantAiSpendRecorder } from './tenant-ai-spend';
import { tenantContextStore } from '../tracing/tenant-context';

function setup(
  tenantId: string | undefined,
  increment = vi.fn().mockResolvedValue(undefined),
  extra: { maxCarryCents?: number } = {}
) {
  const logger = { warn: vi.fn() };
  const record = createTenantAiSpendRecorder({
    quota: { increment },
    getTenantId: () => tenantId,
    logger,
    ...extra,
  });
  return { record, increment, logger };
}

describe('createTenantAiSpendRecorder', () => {
  it('records whole cents for the job tenant under aiSpendCentsPerMonth', async () => {
    const { record, increment } = setup('tenant-1');
    await record({ cost: 0.05 });
    expect(increment).toHaveBeenCalledTimes(1);
    expect(increment).toHaveBeenCalledWith('tenant-1', 'aiSpendCentsPerMonth', 5);
  });

  it('accumulates sub-cent costs instead of rounding them away', async () => {
    const { record, increment } = setup('tenant-1');
    for (let i = 0; i < 8; i++) await record({ cost: 0.001 }); // 0.1 cent each
    expect(increment).not.toHaveBeenCalled();
    await record({ cost: 0.001 });
    await record({ cost: 0.001 });
    await record({ cost: 0.001 });
    expect(increment).toHaveBeenCalledTimes(1);
    expect(increment).toHaveBeenCalledWith('tenant-1', 'aiSpendCentsPerMonth', 1);
  });

  it('keeps separate carries per tenant', async () => {
    const increment = vi.fn().mockResolvedValue(undefined);
    let tenant = 'a';
    const record = createTenantAiSpendRecorder({
      quota: { increment },
      getTenantId: () => tenant,
      logger: { warn: vi.fn() },
    });
    await record({ cost: 0.006 }); // a: 0.6 cent held
    tenant = 'b';
    await record({ cost: 0.006 }); // b: 0.6 cent held, not a's carry
    expect(increment).not.toHaveBeenCalled();
    await record({ cost: 0.006 }); // b: 1.2 cents -> writes 1
    expect(increment).toHaveBeenCalledTimes(1);
    expect(increment).toHaveBeenCalledWith('b', 'aiSpendCentsPerMonth', 1);
  });

  it.each([undefined, 'unknown', '__scheduled__', '__system__'])(
    'ignores spend with no billable tenant (%s)',
    async (tenantId) => {
      const { record, increment } = setup(tenantId);
      await record({ cost: 5 });
      expect(increment).not.toHaveBeenCalled();
    }
  );

  it('records a single large cost in full, without clamping to maxCarryCents', async () => {
    const { record, increment } = setup('tenant-1');
    await record({ cost: 1500 }); // 150,000 cents, above the 100,000 default carry bound
    expect(increment).toHaveBeenCalledWith('tenant-1', 'aiSpendCentsPerMonth', 150_000);
  });

  it('still bounds the cents held back after failed writes', async () => {
    const increment = vi.fn().mockRejectedValue(new Error('db down'));
    const { record } = setup('tenant-1', increment, { maxCarryCents: 10 });
    await record({ cost: 0.5 }); // 50 cents fail; carry is clamped to 10
    increment.mockResolvedValue(undefined);
    await record({ cost: 0.01 });
    expect(increment).toHaveBeenLastCalledWith('tenant-1', 'aiSpendCentsPerMonth', 11);
  });

  it('ignores zero, negative and NaN costs', async () => {
    const { record, increment } = setup('tenant-1');
    await record({ cost: 0 });
    await record({ cost: -1 });
    await record({ cost: Number.NaN });
    expect(increment).not.toHaveBeenCalled();
  });

  it('warns with tenant and key on failure, never rejects, and retries the cents next call', async () => {
    const increment = vi
      .fn()
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValue(undefined);
    const { record, logger } = setup('tenant-1', increment);

    await expect(record({ cost: 0.03 })).resolves.toBeUndefined();
    expect(increment).toHaveBeenLastCalledWith('tenant-1', 'aiSpendCentsPerMonth', 3);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1', key: 'aiSpendCentsPerMonth', cents: 3 }),
      expect.stringContaining('USAGE_NOT_RECORDED')
    );

    // The 3 failed cents ride along with the next call's 1 cent.
    await record({ cost: 0.01 });
    expect(increment).toHaveBeenLastCalledWith('tenant-1', 'aiSpendCentsPerMonth', 4);
  });

  it('reads the tenant from the job AsyncLocalStorage context', async () => {
    const increment = vi.fn().mockResolvedValue(undefined);
    const record = createTenantAiSpendRecorder({
      quota: { increment },
      getTenantId: () => tenantContextStore.getStore()?.tenantId,
      logger: { warn: vi.fn() },
    });

    await tenantContextStore.run({ tenantId: 'tenant-alpha' }, () => record({ cost: 0.5 }));
    await record({ cost: 0.5 }); // outside any job: no tenant

    expect(increment).toHaveBeenCalledTimes(1);
    expect(increment).toHaveBeenCalledWith('tenant-alpha', 'aiSpendCentsPerMonth', 50);
  });
});
