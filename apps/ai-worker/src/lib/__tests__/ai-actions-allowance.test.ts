import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AI_ACTIONS_EXHAUSTED,
  AiActionsExhaustedError,
  __resetAiActionsAllowanceWarnings,
  _allowanceCache,
  assertWithinAiActions,
  isAiActionsExhausted,
  recordAiAction,
  setAiActionRecorder,
  noteAiActions,
  setAiActionsAllowanceReader,
} from '../ai-actions-allowance';

const NOW = new Date('2026-11-23T10:00:00Z');

function reader(limit: number | null, used: number) {
  return {
    getLimits: vi.fn().mockResolvedValue({ aiActionsPerMonth: limit }),
    getKeyUsage: vi.fn().mockResolvedValue(used),
  };
}

describe('assertWithinAiActions', () => {
  beforeEach(() => {
    setAiActionsAllowanceReader(null);
    __resetAiActionsAllowanceWarnings();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('lets a call through while the plan has actions left', async () => {
    setAiActionsAllowanceReader(reader(1000, 999));
    await expect(assertWithinAiActions('t1', NOW)).resolves.toBeUndefined();
  });

  it('refuses the call after the last action, with the used and limit in the reason', async () => {
    setAiActionsAllowanceReader(reader(1000, 1000));
    const err = await assertWithinAiActions('t1', NOW).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AiActionsExhaustedError);
    expect(err).toMatchObject({ code: AI_ACTIONS_EXHAUSTED, used: 1000, limit: 1000 });
    expect((err as Error).message).toContain('1000 of 1000');
  });

  it('never limits an unlimited plan (null): Enterprise, Custom and the owner workspace', async () => {
    setAiActionsAllowanceReader(reader(null, 5_000_000));
    await expect(assertWithinAiActions('t1', NOW)).resolves.toBeUndefined();
  });

  it('uses the limit QuotaService resolves, so a tenant override applies', async () => {
    const r = reader(50, 50); // an override lowered the plan default
    setAiActionsAllowanceReader(r);
    await expect(assertWithinAiActions('t1', NOW)).rejects.toMatchObject({ limit: 50 });
    expect(r.getLimits).toHaveBeenCalledWith('t1');
    expect(r.getKeyUsage).toHaveBeenCalledWith('t1', 'aiActionsPerMonth');
  });

  it('blocks a plan with the allowance set to 0 (AI off)', async () => {
    setAiActionsAllowanceReader(reader(0, 0));
    await expect(assertWithinAiActions('t1', NOW)).rejects.toBeInstanceOf(AiActionsExhaustedError);
  });

  it.each([undefined, 'unknown', '__scheduled__', '__system__'])(
    'does not look anything up for a job without a real tenant (%s)',
    async (tenantId) => {
      const r = reader(0, 0);
      setAiActionsAllowanceReader(r);
      await expect(assertWithinAiActions(tenantId, NOW)).resolves.toBeUndefined();
      expect(r.getLimits).not.toHaveBeenCalled();
    }
  );

  it('counts actions this process recorded inside the cache window', async () => {
    const r = reader(3, 1);
    setAiActionsAllowanceReader(r);
    await assertWithinAiActions('t1', NOW); // used 1 of 3
    noteAiActions('t1', 1, NOW); // 2
    await assertWithinAiActions('t1', NOW); // 2 + 1 <= 3
    noteAiActions('t1', 1, NOW); // 3
    await expect(assertWithinAiActions('t1', NOW)).rejects.toBeInstanceOf(AiActionsExhaustedError);
    expect(r.getKeyUsage).toHaveBeenCalledTimes(1); // one read served all three checks
  });

  it('re-reads after the cache window, and never reads a lower balance than it counted', async () => {
    const r = reader(10, 4);
    setAiActionsAllowanceReader(r);
    await assertWithinAiActions('t1', NOW);
    noteAiActions('t1', 3, NOW); // 7
    r.getKeyUsage.mockResolvedValue(5); // the persisted total lags the local count
    await assertWithinAiActions('t1', new Date(NOW.getTime() + 16_000));
    expect(r.getKeyUsage).toHaveBeenCalledTimes(2);
    expect(_allowanceCache.get('t1')?.used).toBe(7);
  });

  it('starts a fresh balance in a new UTC month', async () => {
    const r = reader(5, 5);
    setAiActionsAllowanceReader(r);
    await expect(assertWithinAiActions('t1', NOW)).rejects.toBeInstanceOf(AiActionsExhaustedError);
    r.getKeyUsage.mockResolvedValue(0);
    await expect(
      assertWithinAiActions('t1', new Date('2026-12-01T00:00:01Z'))
    ).resolves.toBeUndefined();
  });

  it('fails open, with one logged reason, when the allowance cannot be read', async () => {
    setAiActionsAllowanceReader({
      getLimits: vi.fn().mockRejectedValue(new Error('db down')),
      getKeyUsage: vi.fn(),
    });
    await expect(assertWithinAiActions('t1', NOW)).resolves.toBeUndefined();
    await expect(assertWithinAiActions('t1', NOW)).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(vi.mocked(console.warn).mock.calls[0]![0]).toContain('allowance read failed');
  });

  it('fails open, loudly, when no reader was wired', async () => {
    await expect(assertWithinAiActions('t1', NOW)).resolves.toBeUndefined();
    expect(vi.mocked(console.warn).mock.calls[0]![0]).toContain('no reader registered');
  });
});

describe('recordAiAction', () => {
  afterEach(() => {
    setAiActionRecorder(null);
    vi.restoreAllMocks();
  });

  it('writes one action through the registered recorder per call', () => {
    const recorder = vi.fn().mockResolvedValue(undefined);
    setAiActionRecorder(recorder);
    recordAiAction();
    recordAiAction();
    expect(recorder).toHaveBeenCalledTimes(2);
  });

  it('does nothing before a recorder is wired, and never throws when a write fails', async () => {
    expect(() => recordAiAction()).not.toThrow();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    setAiActionRecorder(() => Promise.reject(new Error('db down')));
    expect(() => recordAiAction()).not.toThrow();
    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
    expect(String(warn.mock.calls[0]![0])).toContain('USAGE_NOT_RECORDED');
  });
});

describe('AiActionsExhaustedError job semantics', () => {
  it('is named UnrecoverableError so BullMQ never retries it, and is an expected outcome', () => {
    const err = new AiActionsExhaustedError(1000, 1000);
    expect(err.name).toBe('UnrecoverableError');
    expect(err.expected).toBe(true);
    expect(err.message).toContain('Monthly AI actions limit reached');
  });
});

describe('isAiActionsExhausted', () => {
  it('recognises the error, and one wrapped as a cause', () => {
    const err = new AiActionsExhaustedError(1, 1);
    expect(isAiActionsExhausted(err)).toBe(true);
    expect(isAiActionsExhausted(new Error('x', { cause: err }))).toBe(true);
    expect(isAiActionsExhausted(new Error('x'))).toBe(false);
    expect(isAiActionsExhausted(undefined)).toBe(false);
  });
});
