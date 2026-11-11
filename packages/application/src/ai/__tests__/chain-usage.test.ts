import { describe, expect, it, vi } from 'vitest';
import { describeChainUsage, type ChainUsageSources } from '../chain-usage';

const NOW = new Date('2026-11-11T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const WINDOW_START = new Date(NOW.getTime() - 30 * DAY);

function sources(over: Partial<ChainUsageSources> = {}): ChainUsageSources {
  return {
    recorded: vi.fn(async () => ({})),
    derived: vi.fn(async () => null),
    ...over,
  };
}

describe('describeChainUsage', () => {
  it('reports every chain type, empty and labelled "none", when nothing is known', async () => {
    const result = await describeChainUsage(sources(), 30, NOW);

    expect(Object.keys(result).sort()).toEqual([
      'EMAIL_WRITER',
      'FOLLOWUP',
      'QUALIFICATION',
      'SCORING',
    ]);
    expect(result.FOLLOWUP).toEqual({
      runs: 0,
      lastRunAt: null,
      successRate: null,
      avgLatencyMs: null,
      spend: null,
      inputTokens: 0,
      outputTokens: 0,
      countedSince: WINDOW_START,
      source: 'none',
      derivedFrom: null,
    });
  });

  it('reports recorded runs, counted since the first run when that is inside the window', async () => {
    const firstRunAt = new Date('2026-11-10T09:00:00Z');
    const lastRunAt = new Date('2026-11-11T11:00:00Z');
    const recorded = vi.fn(async () => ({
      SCORING: {
        runs: 4,
        successes: 3,
        firstRunAt,
        lastRunAt,
        avgLatencyMs: 812.4,
        costUsd: 0.0123,
        inputTokens: 4000,
        outputTokens: 800,
      },
    }));

    const result = await describeChainUsage(sources({ recorded }), 30, NOW);

    expect(recorded).toHaveBeenCalledWith(WINDOW_START);
    expect(result.SCORING).toEqual({
      runs: 4,
      lastRunAt,
      successRate: 0.75,
      avgLatencyMs: 812,
      spend: { amount: 0.0123, currency: 'USD' },
      inputTokens: 4000,
      outputTokens: 800,
      countedSince: firstRunAt,
      source: 'recorded',
      derivedFrom: null,
    });
  });

  it('derives runs from existing rows only for types with no recorded runs', async () => {
    const lastRunAt = new Date('2026-11-09T10:00:00Z');
    const derived = vi.fn(async (type: string) =>
      type === 'SCORING'
        ? { runs: 12, lastRunAt, derivedFrom: 'Lead Scored by AI activities' }
        : null
    );

    const result = await describeChainUsage(sources({ derived }), 30, NOW);

    expect(result.SCORING).toMatchObject({
      runs: 12,
      lastRunAt,
      successRate: null,
      spend: null,
      source: 'derived',
      derivedFrom: 'Lead Scored by AI activities',
    });
    expect(result.QUALIFICATION.source).toBe('none');
  });

  it('prefers recorded runs over derived counts', async () => {
    const derived = vi.fn(async () => ({ runs: 99, lastRunAt: NOW, derivedFrom: 'x' }));
    const result = await describeChainUsage(
      sources({
        recorded: async () => ({
          SCORING: {
            runs: 1,
            successes: 1,
            firstRunAt: NOW,
            lastRunAt: NOW,
            avgLatencyMs: 10,
            costUsd: 0,
            inputTokens: 1,
            outputTokens: 1,
          },
        }),
        derived,
      }),
      30,
      NOW
    );

    expect(result.SCORING.source).toBe('recorded');
    expect(derived).not.toHaveBeenCalledWith('SCORING', expect.anything());
  });
});
