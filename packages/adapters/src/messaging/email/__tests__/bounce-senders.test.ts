import { describe, expect, it } from 'vitest';
import { isBounceSenderAddress, isBounceSenderLocalPart } from '../bounce-senders';

describe('bounce senders (#970)', () => {
  it.each([
    'postmaster',
    'MAILER-DAEMON',
    'MicrosoftExchange329e71ec88ae4615bbc36ab6ce41109e',
    'microsoftexchange',
  ])('recognises %s', (local) => {
    expect(isBounceSenderLocalPart(local)).toBe(true);
  });

  it.each(['colleague', 'MicrosoftExchangeSupport', 'postmaster2', 'mailer-daemon.evil'])(
    'refuses %s',
    (local) => {
      expect(isBounceSenderLocalPart(local)).toBe(false);
    }
  );

  it('reads the local part of an address', () => {
    expect(isBounceSenderAddress('MicrosoftExchange1a2b@contoso.example.invalid')).toBe(true);
    expect(isBounceSenderAddress('friend@contoso.example.invalid')).toBe(false);
    expect(isBounceSenderAddress('@contoso.example.invalid')).toBe(false);
    expect(isBounceSenderAddress('postmaster')).toBe(false);
  });
});
