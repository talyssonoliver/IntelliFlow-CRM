/**
 * PG-199 — pure page model: draft ⇄ payload, USD ⇄ cents, dirty compare,
 * downgrade detection and server issue mapping (AC-002, AC-004, AC-010, AC-011).
 */
import { describe, it, expect } from 'vitest';
import { MODEL_CONFIG_LIMITS } from '@intelliflow/domain';
import {
  buildResetPayload,
  buildUpdatePayload,
  centsToUsdText,
  describeDowngrade,
  draftDowngrades,
  draftToInput,
  formatModelPrice,
  formatPeriod,
  formatUsd,
  isBelowSpend,
  mapServerIssues,
  modelOptionsFor,
  parseUsdToCents,
  resetDowngrades,
  toDraft,
  validateDraft,
} from '../model-config-model';
import { CATALOG, modelConfigDto, purposeRow } from '../../__tests__/model-config-fixtures';

const T0 = '2026-10-01T09:00:00.000Z';

describe('USD ⇄ cents', () => {
  it('maps "" to no ceiling, "0" to a blocking zero and dollars to cents', () => {
    expect(parseUsdToCents('')).toEqual({ ok: true, cents: null });
    expect(parseUsdToCents('   ')).toEqual({ ok: true, cents: null });
    expect(parseUsdToCents('0')).toEqual({ ok: true, cents: 0 });
    expect(parseUsdToCents('12.5')).toEqual({ ok: true, cents: 1250 });
    expect(parseUsdToCents(' 3 ')).toEqual({ ok: true, cents: 300 });
    expect(parseUsdToCents('0.07')).toEqual({ ok: true, cents: 7 });
  });

  it('rejects more than two decimals, negatives, text and amounts above the limit', () => {
    for (const bad of ['12.345', '-1', 'abc', '1e3', '20000.01']) {
      expect(parseUsdToCents(bad).ok).toBe(false);
    }
    expect(parseUsdToCents('20000')).toEqual({ ok: true, cents: 2_000_000 });
  });

  it('formats cents back to text and to a currency label', () => {
    expect(centsToUsdText(null)).toBe('');
    expect(centsToUsdText(0)).toBe('0.00');
    expect(centsToUsdText(1250)).toBe('12.50');
    expect(formatUsd(1250)).toBe('$12.50');
    expect(formatUsd(0.5)).toBe('$0.01');
  });
});

describe('labels', () => {
  it('prices a model per million tokens (input + output), free when zero', () => {
    expect(formatModelPrice(0)).toBe('Free');
    expect(formatModelPrice(130)).toBe('$0.13 / 1M tokens');
    expect(formatModelPrice(18000)).toBe('$18.00 / 1M tokens');
  });

  it('labels the UTC month', () => {
    expect(formatPeriod('2026-10')).toBe('October 2026 (UTC)');
    expect(formatPeriod('2027-01')).toBe('January 2027 (UTC)');
    expect(formatPeriod('garbage')).toBe('garbage (UTC)');
  });

  it('lists the models routed for a purpose, cheapest first', () => {
    expect(modelOptionsFor('scoring', CATALOG).map((m) => m.id)).toEqual([
      'llama-3.1-8b-instant',
      'gpt-4o-mini',
      'mistral-small',
    ]);
    expect(modelOptionsFor('rag', CATALOG).every((m) => m.kind === 'embedding')).toBe(true);
  });
});

describe('draft', () => {
  it('turns a row into an editable draft', () => {
    expect(
      toDraft(
        purposeRow('scoring', {
          modelId: 'gpt-4o-mini',
          fallbackModelIds: ['llama-3.1-8b-instant'],
          temperature: 0.4,
          maxTokens: 2048,
          monthlyCostCeilingCents: 1250,
        })
      )
    ).toEqual({
      purpose: 'scoring',
      modelId: 'gpt-4o-mini',
      fallbackModelIds: ['llama-3.1-8b-instant'],
      temperature: 0.4,
      maxTokens: '2048',
      ceilingUsd: '12.50',
    });
    expect(toDraft(purposeRow('email'))).toMatchObject({ maxTokens: '', ceilingUsd: '' });
  });

  it('validates max tokens and the ceiling against the limits', () => {
    const base = toDraft(purposeRow('scoring'));
    expect(validateDraft(base, MODEL_CONFIG_LIMITS)).toEqual({});
    expect(validateDraft({ ...base, maxTokens: '0' }, MODEL_CONFIG_LIMITS)).toHaveProperty(
      'maxTokens'
    );
    expect(validateDraft({ ...base, maxTokens: '1.5' }, MODEL_CONFIG_LIMITS)).toHaveProperty(
      'maxTokens'
    );
    expect(validateDraft({ ...base, maxTokens: '32769' }, MODEL_CONFIG_LIMITS)).toHaveProperty(
      'maxTokens'
    );
    expect(validateDraft({ ...base, ceilingUsd: '1.234' }, MODEL_CONFIG_LIMITS)).toEqual({
      ceilingUsd: 'Use dollars with at most two decimals, e.g. 25 or 12.50.',
    });
  });

  it('maps a valid draft to the API input, without a tier', () => {
    const input = draftToInput({
      purpose: 'email',
      modelId: null,
      fallbackModelIds: [],
      temperature: null,
      maxTokens: '',
      ceilingUsd: '0',
    });
    expect(input).toEqual({
      purpose: 'email',
      modelId: null,
      fallbackModelIds: [],
      temperature: null,
      maxTokens: null,
      monthlyCostCeilingCents: 0,
    });
    expect(input).not.toHaveProperty('tier');
  });
});

describe('save payload', () => {
  const data = modelConfigDto({ scoring: { modelId: 'gpt-4o-mini', updatedAt: T0 } });
  const drafts = data.purposes.map((row) => toDraft(row));

  it('sends only changed purposes, with `expected` for exactly those', () => {
    const edited = drafts.map((d) => (d.purpose === 'email' ? { ...d, maxTokens: '900' } : d));
    const payload = buildUpdatePayload(data.purposes, edited, false);
    expect(payload).toEqual({
      purposes: [
        {
          purpose: 'email',
          modelId: null,
          fallbackModelIds: [],
          temperature: null,
          maxTokens: 900,
          monthlyCostCeilingCents: null,
        },
      ],
      expected: { email: null },
    });
    expect(payload).not.toHaveProperty('acknowledgeDowngrade');
  });

  it('acknowledges a downgrade only when asked to', () => {
    const edited = drafts.map((d) =>
      d.purpose === 'scoring' ? { ...d, modelId: 'llama-3.1-8b-instant' } : d
    );
    const payload = buildUpdatePayload(data.purposes, edited, true);
    expect(payload.acknowledgeDowngrade).toBe(true);
    expect(payload.expected).toEqual({ scoring: T0 });
  });

  it('finds every downgrade in the changed drafts with the domain rule', () => {
    const edited = drafts.map((d) =>
      d.purpose === 'scoring' ? { ...d, modelId: 'llama-3.1-8b-instant' } : d
    );
    const downgrades = draftDowngrades(data.purposes, edited);
    expect(downgrades).toHaveLength(1);
    expect(downgrades[0]).toMatchObject({
      purpose: 'scoring',
      slot: 'primary',
      from: 'gpt-4o-mini',
      to: 'llama-3.1-8b-instant',
    });
    expect(draftDowngrades(data.purposes, drafts)).toEqual([]);
  });

  it('upgrades never need a confirm', () => {
    const edited = drafts.map((d) =>
      d.purpose === 'scoring' ? { ...d, modelId: 'mistral-small' } : d
    );
    expect(draftDowngrades(data.purposes, edited)).toEqual([]);
  });

  it('describes a downgrade with purpose, slot, models and prices', () => {
    expect(
      describeDowngrade({
        purpose: 'scoring',
        slot: 'primary',
        from: 'gpt-4o-mini',
        to: 'llama-3.1-8b-instant',
        fromPrice: 750,
        toPrice: 130,
      })
    ).toBe(
      'Scoring primary: gpt-4o-mini ($0.75 / 1M tokens) → llama-3.1-8b-instant ($0.13 / 1M tokens)'
    );
    expect(
      describeDowngrade({
        purpose: 'reasoning',
        slot: 1,
        from: null,
        to: 'gpt-oss-20b-free',
        fromPrice: undefined,
        toPrice: 0,
      })
    ).toBe('Reasoning fallback 2: none (unknown price) → gpt-oss-20b-free (Free)');
  });
});

describe('reset payload', () => {
  it('sends every purpose token and lists what reset makes cheaper', () => {
    const data = modelConfigDto({
      reasoning: { modelId: 'claude-sonnet-4-5', updatedAt: T0 },
      email: { maxTokens: 500, updatedAt: T0 },
    });
    const downgrades = resetDowngrades(data.purposes);
    expect(downgrades.map((d) => d.purpose)).toEqual(['reasoning']);
    expect(buildResetPayload(data.purposes, true)).toEqual({
      expected: {
        scoring: null,
        qualification: null,
        email: T0,
        reasoning: T0,
        structured: null,
        rag: null,
      },
      acknowledgeDowngrade: true,
    });
    expect(buildResetPayload(data.purposes, false)).not.toHaveProperty('acknowledgeDowngrade');
  });
});

describe('server issues and spend', () => {
  it('maps zod issue paths of the sent purposes onto their fields', () => {
    const message = JSON.stringify([
      {
        path: ['purposes', 1, 'fallbackModelIds', 0],
        message: 'A fallback cannot be the primary model',
      },
      { path: ['purposes', 0, 'maxTokens'], message: 'Too big' },
      { path: ['expected'], message: 'ignored' },
    ]);
    expect(mapServerIssues(message, ['email', 'reasoning'])).toEqual({
      reasoning: { 'fallbackModelIds.0': 'A fallback cannot be the primary model' },
      email: { maxTokens: 'Too big' },
    });
    expect(mapServerIssues('not json', ['email'])).toEqual({});
    expect(mapServerIssues('{"a":1}', ['email'])).toEqual({});
  });

  it('warns when the new ceiling is already reached by month-to-date spend', () => {
    const draft = { ...toDraft(purposeRow('email')), ceilingUsd: '1.00' };
    expect(isBelowSpend(draft, 150)).toBe(true);
    expect(isBelowSpend(draft, 100)).toBe(true);
    expect(isBelowSpend(draft, 99.5)).toBe(false);
    expect(isBelowSpend({ ...draft, ceilingUsd: '' }, 150)).toBe(false);
    expect(isBelowSpend({ ...draft, ceilingUsd: 'x' }, 150)).toBe(false);
    expect(isBelowSpend(draft, null)).toBe(false);
  });
});
