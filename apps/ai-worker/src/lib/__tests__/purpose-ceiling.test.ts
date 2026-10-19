/**
 * purpose-ceiling.test.ts — PG-199 (owner Q2): a purpose that has spent its monthly
 * ceiling is blocked before the model call; other purposes keep working.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  assertWithinCeiling,
  setPurposeSpendReader,
  getPurposeSpendReader,
  notePurposeSpend,
  isPurposeCeilingReached,
  PurposeCeilingReachedError,
  PURPOSE_CEILING_REACHED,
  _spendCache,
  __resetPurposeCeilingWarnings,
} from '../purpose-ceiling.js';

const OCT = new Date('2026-10-31T23:59:59.999Z');
const NOV = new Date('2026-11-01T00:00:00.000Z');

function reader(spend: Record<string, number>) {
  return { getSpend: vi.fn().mockResolvedValue(spend) };
}

describe('purpose ceiling (PG-199)', () => {
  beforeEach(() => {
    _spendCache.clear();
    setPurposeSpendReader(null);
    __resetPurposeCeilingWarnings();
    vi.useRealTimers();
  });

  afterEach(() => {
    setPurposeSpendReader(null);
    vi.useRealTimers();
  });

  it('never blocks without a ceiling and never reads spend', async () => {
    const r = reader({ email: 10_000_000 });
    setPurposeSpendReader(r);
    await expect(assertWithinCeiling('t1', 'email', null)).resolves.toBeUndefined();
    await expect(assertWithinCeiling('t1', 'email', undefined)).resolves.toBeUndefined();
    expect(r.getSpend).not.toHaveBeenCalled();
  });

  it('blocks outright at a 0 ceiling, even for free models, without reading spend', async () => {
    const r = reader({});
    setPurposeSpendReader(r);
    await expect(assertWithinCeiling('t1', 'reasoning', 0)).rejects.toBeInstanceOf(
      PurposeCeilingReachedError
    );
    expect(r.getSpend).not.toHaveBeenCalled();
  });

  it('passes below the ceiling and blocks at it (spend is in hundredths of a cent)', async () => {
    setPurposeSpendReader(reader({ scoring: 49_999 }));
    await expect(assertWithinCeiling('t1', 'scoring', 500, OCT)).resolves.toBeUndefined();

    _spendCache.clear();
    setPurposeSpendReader(reader({ scoring: 50_000 }));
    const err = await assertWithinCeiling('t1', 'scoring', 500, OCT).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PurposeCeilingReachedError);
    expect(err).toMatchObject({
      code: PURPOSE_CEILING_REACHED,
      purpose: 'scoring',
      ceilingCents: 500,
      spentCents: 500,
      message: 'monthly AI ceiling reached for scoring',
    });
  });

  it('reads only the checked purpose for the UTC month', async () => {
    const r = reader({ email: 0 });
    setPurposeSpendReader(r);
    await assertWithinCeiling('t1', 'email', 100, OCT);
    expect(r.getSpend).toHaveBeenCalledWith('t1', '2026-10', ['email']);
  });

  it('caches spend for 30 s per (tenant, purpose, period)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-10T10:00:00Z'));
    const r = reader({ email: 10 });
    setPurposeSpendReader(r);
    await assertWithinCeiling('t1', 'email', 100);
    await assertWithinCeiling('t1', 'email', 100);
    expect(r.getSpend).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date('2026-10-10T10:00:31Z'));
    await assertWithinCeiling('t1', 'email', 100);
    expect(r.getSpend).toHaveBeenCalledTimes(2);
  });

  it('does not carry a cached block across midnight UTC into a new month', async () => {
    const r = { getSpend: vi.fn().mockResolvedValueOnce({ email: 999_999 }).mockResolvedValue({}) };
    setPurposeSpendReader(r);
    await expect(assertWithinCeiling('t1', 'email', 100, OCT)).rejects.toBeInstanceOf(
      PurposeCeilingReachedError
    );
    await expect(assertWithinCeiling('t1', 'email', 100, NOV)).resolves.toBeUndefined();
    expect(r.getSpend).toHaveBeenLastCalledWith('t1', '2026-11', ['email']);
  });

  it('counts spend noted in this process during the cache window (burst protection)', async () => {
    setPurposeSpendReader(reader({ email: 9_000 }));
    await assertWithinCeiling('t1', 'email', 100, OCT); // 9000 < 10000
    notePurposeSpend('t1', 'email', 1_500, OCT); // in-flight calls recorded locally
    await expect(assertWithinCeiling('t1', 'email', 100, OCT)).rejects.toBeInstanceOf(
      PurposeCeilingReachedError
    );
  });

  it('notes spend only into an existing cache entry for the same period', () => {
    notePurposeSpend('t1', 'email', 500, OCT);
    expect(_spendCache.size).toBe(0);
  });

  it('fails open with one warning when no spend reader is registered', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(assertWithinCeiling('t1', 'email', 100, OCT)).resolves.toBeUndefined();
    await expect(assertWithinCeiling('t1', 'email', 100, OCT)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/spend_reader_missing/);
    warn.mockRestore();
  });

  it('fails open with a logged reason when the spend read fails (DB unreachable)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    setPurposeSpendReader({ getSpend: vi.fn().mockRejectedValue(new Error('db down')) });
    await expect(assertWithinCeiling('t1', 'email', 100, OCT)).resolves.toBeUndefined();
    expect(String(warn.mock.calls[0][0])).toMatch(/spend_read_failed/);
    warn.mockRestore();
  });

  it('exposes the registered reader', () => {
    const r = reader({});
    setPurposeSpendReader(r);
    expect(getPurposeSpendReader()).toBe(r);
  });

  describe('isPurposeCeilingReached', () => {
    it('recognises the error directly, by code, and through a cause chain', () => {
      const direct = new PurposeCeilingReachedError('email', 100, 120);
      expect(isPurposeCeilingReached(direct)).toBe(true);
      expect(isPurposeCeilingReached({ code: PURPOSE_CEILING_REACHED })).toBe(true);
      expect(
        isPurposeCeilingReached(new Error('Failed to generate embedding', { cause: direct }))
      ).toBe(true);
      expect(isPurposeCeilingReached(new Error('other'))).toBe(false);
      expect(isPurposeCeilingReached(null)).toBe(false);
    });
  });
});
