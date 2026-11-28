import { describe, it, expect } from 'vitest';
import { Money } from '@intelliflow/domain';
import { CURRENCY_CODES } from '../components/currencies';

describe('report currencies and Money agree (codex 27/11)', () => {
  it('Money accepts every currency a tenant can pick, so deals save in it', () => {
    const rejected = CURRENCY_CODES.map((c) => c.code).filter(
      (code) => Money.create(10, code).isFailure
    );
    expect(rejected).toEqual([]);
  });

  it('keeps US dollars in cents and Chilean pesos whole', () => {
    expect(Money.create(12.5, 'USD').value.cents).toBe(1250);
    expect(Money.create(1500, 'CLP').value.cents).toBe(1500);
  });
});
