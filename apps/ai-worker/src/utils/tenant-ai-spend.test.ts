import { describe, it, expect, vi } from 'vitest';
import { createTenantAiSpendRecorder, createPurposeSpendRecorder } from './tenant-ai-spend';
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

// ---------------------------------------------------------------------------
// PG-199: per-purpose spend (hundredths of a cent), next to the tenant aggregate
// ---------------------------------------------------------------------------

describe('createPurposeSpendRecorder (PG-199)', () => {
  function purposeSetup(
    tenantId: string | undefined,
    addSpend = vi.fn().mockResolvedValue(1),
    now = () => new Date('2026-10-19T12:00:00Z')
  ) {
    const logger = { warn: vi.fn() };
    const record = createPurposeSpendRecorder({
      spend: { addSpend },
      getTenantId: () => tenantId,
      logger,
      now,
    });
    return { record, addSpend, logger };
  }

  it('writes the call cost to the purpose counter for the UTC month, in centicents', async () => {
    const { record, addSpend } = purposeSetup('tenant-1');
    await record({ cost: 0.0123, metadata: { purpose: 'reasoning' } });
    expect(addSpend).toHaveBeenCalledWith('tenant-1', 'reasoning', '2026-10', 123);
  });

  it('accumulates sub-centicent costs per (tenant, purpose) instead of dropping them', async () => {
    const { record, addSpend } = purposeSetup('tenant-1');
    await record({ cost: 0.00004, metadata: { purpose: 'rag' } }); // 0.4 centicent
    expect(addSpend).not.toHaveBeenCalled();
    await record({ cost: 0.00007, metadata: { purpose: 'rag' } }); // +0.7 -> 1.1
    expect(addSpend).toHaveBeenCalledWith('tenant-1', 'rag', '2026-10', 1);
  });

  it('ignores usage without a known purpose, a non-billable tenant or no cost', async () => {
    const a = purposeSetup('tenant-1');
    await a.record({ cost: 0.5, metadata: { purpose: 'billing' } });
    await a.record({ cost: 0.5 });
    await a.record({ cost: 0, metadata: { purpose: 'email' } });
    expect(a.addSpend).not.toHaveBeenCalled();

    const b = purposeSetup('unknown');
    await b.record({ cost: 0.5, metadata: { purpose: 'email' } });
    const c = purposeSetup(undefined);
    await c.record({ cost: 0.5, metadata: { purpose: 'email' } });
    expect(b.addSpend).not.toHaveBeenCalled();
    expect(c.addSpend).not.toHaveBeenCalled();
  });

  it('keeps the spend for the next call and warns when the write fails', async () => {
    const addSpend = vi.fn().mockRejectedValueOnce(new Error('db down')).mockResolvedValue(1);
    const { record, logger } = purposeSetup('tenant-1', addSpend);
    await record({ cost: 0.01, metadata: { purpose: 'email' } }); // 100 centicents, fails
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1', purpose: 'email', centiCents: 100 }),
      expect.stringContaining('USAGE_NOT_RECORDED')
    );
    await record({ cost: 0.0001, metadata: { purpose: 'email' } }); // +1
    expect(addSpend).toHaveBeenLastCalledWith('tenant-1', 'email', '2026-10', 101);
  });

  it('starts a fresh carry in a new month', async () => {
    let now = new Date('2026-10-31T23:59:59Z');
    const { record, addSpend } = purposeSetup('tenant-1', vi.fn().mockResolvedValue(1), () => now);
    await record({ cost: 0.00005, metadata: { purpose: 'rag' } }); // 0.5, carried in October
    now = new Date('2026-11-01T00:00:01Z');
    await record({ cost: 0.00005, metadata: { purpose: 'rag' } }); // 0.5 in November
    expect(addSpend).not.toHaveBeenCalled();
  });
});
