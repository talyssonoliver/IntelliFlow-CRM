import { describe, it, expect } from 'vitest';
import {
  buildConvertToDealPayload,
  canQualifyLead,
  getConvertErrorDescription,
  parseDealValue,
  validateDealValue,
  validateQualifyReason,
} from '../lead-conversion';

describe('canQualifyLead', () => {
  it.each(['NEW', 'CONTACTED'])('allows %s', (status) => {
    expect(canQualifyLead(status)).toBe(true);
  });
  it.each(['QUALIFIED', 'NEGOTIATING', 'UNQUALIFIED', 'CONVERTED', 'LOST'])(
    'does not allow %s',
    (status) => {
      expect(canQualifyLead(status)).toBe(false);
    }
  );
});

describe('validateQualifyReason', () => {
  it('rejects short reasons, counting trimmed characters', () => {
    expect(validateQualifyReason('')).toMatch(/at least 10/);
    expect(validateQualifyReason('   short   ')).toMatch(/at least 10/);
  });
  it('accepts 10 to 500 characters', () => {
    expect(validateQualifyReason('a'.repeat(10))).toBeNull();
    expect(validateQualifyReason('a'.repeat(500))).toBeNull();
  });
  it('rejects more than 500 characters', () => {
    expect(validateQualifyReason('a'.repeat(501))).toMatch(/at most 500/);
  });
});

describe('deal value', () => {
  it('parses whole pounds, ignoring commas and spaces', () => {
    expect(parseDealValue('5000')).toBe(5000);
    expect(parseDealValue(' 12,500 ')).toBe(12500);
  });
  it.each(['0', '-5', '12.5', 'abc', '', '1e3'])('rejects %j', (raw) => {
    expect(parseDealValue(raw)).toBeNull();
  });
  it('explains what is wrong', () => {
    expect(validateDealValue('')).toMatch(/Enter the deal value/);
    expect(validateDealValue('0')).toMatch(/greater than zero/);
    expect(validateDealValue('250')).toBeNull();
  });
});

describe('buildConvertToDealPayload', () => {
  const base = { dealValue: '5,000', dealName: '', accountName: '', expectedCloseDate: '' };

  it('sends only the required fields when the optional ones are empty', () => {
    expect(buildConvertToDealPayload('lead-1', base)).toEqual({
      leadId: 'lead-1',
      dealValue: 5000,
      createContact: true,
    });
  });

  it('includes trimmed optional fields and the close date', () => {
    const payload = buildConvertToDealPayload('lead-1', {
      dealValue: '750',
      dealName: '  Renewal  ',
      accountName: ' Acme ',
      expectedCloseDate: '2027-02-01',
    });
    expect(payload).toEqual({
      leadId: 'lead-1',
      dealValue: 750,
      createContact: true,
      dealName: 'Renewal',
      accountName: 'Acme',
      expectedCloseDate: new Date('2027-02-01T00:00:00.000Z'),
    });
  });

  it('returns null for an invalid value', () => {
    expect(buildConvertToDealPayload('lead-1', { ...base, dealValue: '0' })).toBeNull();
  });
});

describe('getConvertErrorDescription', () => {
  it('maps known messages and passes others through', () => {
    expect(getConvertErrorDescription('Only qualified leads can be converted to deals')).toMatch(
      /QUALIFIED/
    );
    expect(getConvertErrorDescription('Lead was already converted')).toMatch(/already/);
    expect(getConvertErrorDescription('Lead not found: x')).toMatch(/deleted/);
    expect(getConvertErrorDescription('Something else')).toBe('Something else');
  });
});
