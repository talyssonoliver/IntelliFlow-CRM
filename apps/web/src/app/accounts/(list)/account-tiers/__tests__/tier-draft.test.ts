import { describe, it, expect } from 'vitest';
import {
  draftFromView,
  draftSignature,
  draftToPayload,
  newBenefitRow,
  newTierDraft,
  parseRevenueInput,
  validateDraft,
  type AccountTiersViewLike,
} from '../tier-draft';

const view = (): AccountTiersViewLike => ({
  tiers: [
    {
      key: 'ENTERPRISE',
      label: 'Enterprise',
      minRevenue: 10_000_000,
      colorToken: 'purple',
      benefits: ['Dedicated CSM', 'SLA 4h'],
    },
    { key: 'SMB', label: 'SMB', minRevenue: 100_000, colorToken: 'green', benefits: ['SLA 4h'] },
    { key: 'STARTUP', label: 'Startup', minRevenue: 0, colorToken: 'not-a-colour', benefits: [] },
  ],
  defaultTierKey: null,
  notifyOwnerOnUpgrade: true,
  notifyOwnerOnDowngrade: false,
  updatedAt: '2026-10-07T08:00:00.000Z',
});

describe('account tiers draft model (PG-196)', () => {
  it('builds benefit rows as the union of tier benefits and links them by id', () => {
    const draft = draftFromView(view());
    expect(draft.benefits.map((b) => b.name)).toEqual(['Dedicated CSM', 'SLA 4h']);
    const [enterprise, smb, startup] = draft.tiers;
    expect(enterprise.benefitIds).toHaveLength(2);
    expect(smb.benefitIds).toEqual([draft.benefits[1].id]);
    expect(startup.colorToken).toBe('slate');
    expect(enterprise.minRevenue).toBe('10000000');
  });

  it('turns a draft back into the update payload', () => {
    const draft = draftFromView(view());
    expect(draftToPayload(draft, '2026-10-07T08:00:00.000Z')).toEqual({
      tiers: [
        {
          key: 'ENTERPRISE',
          label: 'Enterprise',
          minRevenue: 10_000_000,
          colorToken: 'purple',
          benefits: ['Dedicated CSM', 'SLA 4h'],
        },
        {
          key: 'SMB',
          label: 'SMB',
          minRevenue: 100_000,
          colorToken: 'green',
          benefits: ['SLA 4h'],
        },
        { key: 'STARTUP', label: 'Startup', minRevenue: 0, colorToken: 'slate', benefits: [] },
      ],
      defaultTierKey: null,
      notifyOwnerOnUpgrade: true,
      notifyOwnerOnDowngrade: false,
      expectedUpdatedAt: '2026-10-07T08:00:00.000Z',
    });
  });

  it('omits the key of a tier added in this edit', () => {
    const draft = draftFromView(view());
    draft.tiers.push({ ...newTierDraft(draft), label: 'Key Accounts', minRevenue: '50,000,000' });
    const payload = draftToPayload(draft, null);
    expect(payload.tiers[3]).not.toHaveProperty('key');
    expect(payload.tiers[3].minRevenue).toBe(50_000_000);
  });

  it('gives a new tier the first unused colour and an empty minimum', () => {
    const draft = draftFromView(view());
    const added = newTierDraft(draft);
    expect(added.colorToken).toBe('red');
    expect(added.minRevenue).toBe('');
    expect(added.label).toBe('Tier 4');
    expect(newBenefitRow().name).toBe('');
  });

  it('parses revenue input with thousands separators', () => {
    expect(parseRevenueInput('1,000,000')).toBe(1_000_000);
    expect(parseRevenueInput(' 12.5 ')).toBe(12.5);
    expect(parseRevenueInput('')).toBeNaN();
  });

  it('signature changes only when the payload changes', () => {
    const draft = draftFromView(view());
    const before = draftSignature(draft);
    expect(draftSignature({ ...draft })).toBe(before);
    expect(draftSignature({ ...draft, notifyOwnerOnDowngrade: true })).not.toBe(before);
  });

  it('is valid for a well-formed draft', () => {
    expect(validateDraft(draftFromView(view()))).toEqual({
      valid: true,
      tierErrors: {},
      benefitErrors: {},
      formErrors: [],
    });
  });

  it('reports duplicate names on the second row', () => {
    const draft = draftFromView(view());
    draft.tiers[1] = { ...draft.tiers[1], label: 'enterprise' };
    const result = validateDraft(draft);
    expect(result.valid).toBe(false);
    expect(result.tierErrors[draft.tiers[1].id]).toContain(
      'Tier names must be unique: rows 1 and 2 are both "enterprise"'
    );
  });

  it('reports a missing tier at 0 as a form error', () => {
    const draft = draftFromView(view());
    draft.tiers[2] = { ...draft.tiers[2], minRevenue: '5' };
    expect(validateDraft(draft).formErrors).toContain(
      'One tier must start at 0 so every account has a tier'
    );
  });

  it('reports a non-numeric minimum on its row', () => {
    const draft = draftFromView(view());
    draft.tiers[1] = { ...draft.tiers[1], minRevenue: 'lots' };
    expect(validateDraft(draft).tierErrors[draft.tiers[1].id]?.length).toBeGreaterThan(0);
  });

  it('reports an empty benefit name on the benefit row', () => {
    const draft = draftFromView(view());
    draft.benefits[1] = { ...draft.benefits[1], name: '   ' };
    const result = validateDraft(draft);
    expect(result.benefitErrors[draft.benefits[1].id]).toEqual(['Benefit is required']);
  });

  it('reports a duplicate benefit within one tier on the tier row', () => {
    const draft = draftFromView(view());
    draft.benefits[1] = { ...draft.benefits[1], name: 'dedicated csm' };
    const result = validateDraft(draft);
    expect(result.tierErrors[draft.tiers[0].id]).toContain(
      'Row 1 lists the benefit "dedicated csm" twice'
    );
  });
});
