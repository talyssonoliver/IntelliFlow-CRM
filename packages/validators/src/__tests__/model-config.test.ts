/**
 * PG-199 model config validators (ADR-082).
 */
import { describe, it, expect } from 'vitest';
import {
  purposeConfigInputSchema,
  updateModelConfigSchema,
  resetModelConfigSchema,
} from '../model-config';

const row = (overrides: Record<string, unknown> = {}) => ({
  purpose: 'reasoning',
  modelId: 'claude-sonnet-4-5',
  fallbackModelIds: ['claude-haiku-4-5'],
  temperature: 0.4,
  maxTokens: 2000,
  monthlyCostCeilingCents: 5000,
  ...overrides,
});

function issues(input: unknown) {
  const result = updateModelConfigSchema.safeParse(input);
  return result.success ? [] : result.error.issues;
}

describe('purposeConfigInputSchema', () => {
  it('accepts a full row and strips unknown keys (tier is not editable)', () => {
    const parsed = purposeConfigInputSchema.parse(row({ tier: 'premium', extra: 1 }));
    expect(parsed).toEqual(row());
    expect('tier' in parsed).toBe(false);
  });

  it('accepts nulls for unset values (defaults apply) and a 0 ceiling (block now)', () => {
    expect(
      purposeConfigInputSchema.safeParse(
        row({
          modelId: null,
          fallbackModelIds: [],
          temperature: null,
          maxTokens: null,
          monthlyCostCeilingCents: 0,
        })
      ).success
    ).toBe(true);
  });

  it.each([
    ['temperature below 0', { temperature: -0.1 }],
    ['temperature above 2', { temperature: 2.01 }],
    ['maxTokens 0', { maxTokens: 0 }],
    ['maxTokens above 32768', { maxTokens: 32769 }],
    ['maxTokens fractional', { maxTokens: 10.5 }],
    ['ceiling negative', { monthlyCostCeilingCents: -1 }],
    ['ceiling above 2,000,000', { monthlyCostCeilingCents: 2_000_001 }],
    ['ceiling fractional', { monthlyCostCeilingCents: 1.5 }],
    ['ceiling as empty string', { monthlyCostCeilingCents: '' }],
    ['four fallbacks', { fallbackModelIds: ['gpt-oss-20b-free', 'claude-haiku-4-5', 'a', 'b'] }],
    ['unknown purpose', { purpose: 'billing' }],
  ])('rejects %s', (_label, overrides) => {
    expect(purposeConfigInputSchema.safeParse(row(overrides)).success).toBe(false);
  });

  it('rejects a model outside the catalog', () => {
    const r = purposeConfigInputSchema.safeParse(row({ modelId: 'gpt-2' }));
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['modelId']);
  });

  it('rejects a catalog model not routed for the purpose', () => {
    const r = purposeConfigInputSchema.safeParse(
      row({ purpose: 'scoring', modelId: 'claude-sonnet-4-5', fallbackModelIds: [] })
    );
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['modelId']);
  });

  it('rejects a fallback not allowed for the purpose, at its index', () => {
    const r = purposeConfigInputSchema.safeParse(
      row({ fallbackModelIds: ['claude-haiku-4-5', 'gpt-4o'] })
    );
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['fallbackModelIds', 1]);
  });

  it('rejects the pinned primary inside the fallbacks', () => {
    const r = purposeConfigInputSchema.safeParse(row({ fallbackModelIds: ['claude-sonnet-4-5'] }));
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toMatch(/primary/i);
  });

  it('leaves the unpinned primary check to the server, where the stored tier is known', () => {
    // An unpinned row runs its stored tier's default, which the schema cannot see; the router
    // rejects a fallback equal to that effective primary inside the update transaction.
    const r = purposeConfigInputSchema.safeParse(
      row({ modelId: null, fallbackModelIds: ['claude-sonnet-4-5'] })
    );
    expect(r.success).toBe(true);
  });

  it('rejects duplicate fallbacks at the second one', () => {
    const r = purposeConfigInputSchema.safeParse(
      row({
        modelId: 'claude-sonnet-4-5',
        fallbackModelIds: ['claude-haiku-4-5', 'claude-haiku-4-5'],
      })
    );
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]).toMatchObject({
      path: ['fallbackModelIds', 1],
      message: 'Duplicate fallback model: items 1 and 2',
    });
  });

  describe('rag is locked (Q5)', () => {
    const rag = (o: Record<string, unknown> = {}) =>
      row({
        purpose: 'rag',
        modelId: null,
        fallbackModelIds: [],
        temperature: null,
        maxTokens: null,
        ...o,
      });

    it('accepts a ceiling-only change', () => {
      expect(
        purposeConfigInputSchema.safeParse(rag({ monthlyCostCeilingCents: 300 })).success
      ).toBe(true);
    });

    it.each([
      ['modelId', { modelId: 'text-embedding-3-small' }],
      ['fallbackModelIds', { fallbackModelIds: ['nomic-embed-text'] }],
      ['temperature', { temperature: 0.2 }],
      ['maxTokens', { maxTokens: 100 }],
    ])('rejects a %s change', (field, overrides) => {
      const r = purposeConfigInputSchema.safeParse(rag(overrides));
      expect(r.success).toBe(false);
      expect(r.error?.issues.some((i) => i.path[0] === field && /locked/i.test(i.message))).toBe(
        true
      );
    });
  });
});

describe('updateModelConfigSchema', () => {
  it('accepts edited purposes with per-purpose expected timestamps', () => {
    const parsed = updateModelConfigSchema.parse({
      purposes: [row(), row({ purpose: 'scoring', modelId: null, fallbackModelIds: [] })],
      expected: { reasoning: '2026-10-19T10:00:00.000Z', scoring: null },
    });
    expect(parsed.purposes).toHaveLength(2);
    expect(parsed.acknowledgeDowngrade).toBeUndefined();
  });

  it('accepts acknowledgeDowngrade only as true', () => {
    expect(
      updateModelConfigSchema.safeParse({
        purposes: [row()],
        expected: {},
        acknowledgeDowngrade: true,
      }).success
    ).toBe(true);
    expect(
      updateModelConfigSchema.safeParse({
        purposes: [row()],
        expected: {},
        acknowledgeDowngrade: false,
      }).success
    ).toBe(false);
  });

  it('rejects duplicate purposes at the second offender (DoD: duplicate agent keys)', () => {
    const found = issues({
      purposes: [row(), row({ purpose: 'scoring', modelId: null, fallbackModelIds: [] }), row()],
      expected: {},
    });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      path: ['purposes', 2],
      message: 'Duplicate purpose: items 1 and 3',
    });
  });

  it('rejects an empty or oversized purposes list', () => {
    expect(issues({ purposes: [], expected: {} }).length).toBeGreaterThan(0);
    expect(
      issues({ purposes: Array.from({ length: 7 }, () => row()), expected: {} }).length
    ).toBeGreaterThan(0);
  });

  it('rejects an expected value that is not an ISO timestamp', () => {
    expect(
      issues({ purposes: [row()], expected: { reasoning: 'yesterday' } }).length
    ).toBeGreaterThan(0);
  });

  it('reports row-level problems under purposes.<index>', () => {
    const found = issues({
      purposes: [row({ fallbackModelIds: ['claude-sonnet-4-5'] })],
      expected: {},
    });
    expect(found[0]?.path.slice(0, 3)).toEqual(['purposes', 0, 'fallbackModelIds']);
  });
});

describe('resetModelConfigSchema', () => {
  it('accepts expected timestamps and an optional acknowledgement', () => {
    expect(resetModelConfigSchema.safeParse({ expected: { scoring: null } }).success).toBe(true);
    expect(
      resetModelConfigSchema.safeParse({ expected: {}, acknowledgeDowngrade: true }).success
    ).toBe(true);
  });
});
