import { describe, it, expect } from 'vitest';
import { dealSearchSubtitle, leadSearchText, type LeadSearchRow } from '../global-search-hits';

const row = (overrides: Partial<LeadSearchRow>): LeadSearchRow => ({
  id: 'lead-1',
  email: 'hello@example.invalid',
  firstName: null,
  lastName: null,
  company: null,
  ...overrides,
});

describe('leadSearchText (MVP-008: name first, email second)', () => {
  it('shows a person lead by name, with company and email underneath', () => {
    expect(
      leadSearchText(row({ firstName: 'Jane', lastName: 'Example', company: 'Example Corp' }))
    ).toEqual({ title: 'Jane Example', subtitle: 'Example Corp · hello@example.invalid' });
  });

  it('shows a company-only lead by company name, with the email underneath', () => {
    expect(leadSearchText(row({ company: 'Blue Fern Studio' }))).toEqual({
      title: 'Blue Fern Studio',
      subtitle: 'hello@example.invalid',
    });
  });

  it('shows a person without a company by name, with the email underneath', () => {
    expect(leadSearchText(row({ firstName: 'Jane' }))).toEqual({
      title: 'Jane',
      subtitle: 'hello@example.invalid',
    });
  });

  it('falls back to the email only when there is no name or company, without repeating it', () => {
    expect(leadSearchText(row({ firstName: '  ', company: '' }))).toEqual({
      title: 'hello@example.invalid',
      subtitle: null,
    });
  });
});

describe('dealSearchSubtitle', () => {
  it('shows the stage and the value in pounds, never dollars', () => {
    expect(dealSearchSubtitle('PROPOSAL', 12500)).toBe('PROPOSAL · £12,500');
  });

  it('reads a decimal string and a missing value as pounds', () => {
    expect(dealSearchSubtitle('NEGOTIATION', '900.00')).toBe('NEGOTIATION · £900');
    expect(dealSearchSubtitle('QUALIFICATION', null)).toBe('QUALIFICATION · £0');
  });
});
