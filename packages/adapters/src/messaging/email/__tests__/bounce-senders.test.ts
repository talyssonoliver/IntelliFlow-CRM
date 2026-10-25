import { describe, expect, it } from 'vitest';
import {
  isBounceSenderAddress,
  isBounceSenderLocalPart,
  isExchangeSenderLocalPart,
} from '../bounce-senders';

describe('bounce senders (#970)', () => {
  it.each(['postmaster', 'MAILER-DAEMON', 'MicrosoftExchange329e71ec88ae4615bbc36ab6ce41109e'])(
    'recognises %s',
    (local) => {
      expect(isBounceSenderLocalPart(local)).toBe(true);
    }
  );

  it.each([
    'colleague',
    'MicrosoftExchangeSupport',
    'postmaster2',
    'mailer-daemon.evil',
    // Exchange's NDR sender carries exactly 32 hex characters (N-4).
    'microsoftexchange',
    'MicrosoftExchange1a2b',
    'MicrosoftExchange329e71ec88ae4615bbc36ab6ce41109e0',
  ])('refuses %s', (local) => {
    expect(isBounceSenderLocalPart(local)).toBe(false);
  });

  it('reads the local part of an address', () => {
    expect(
      isBounceSenderAddress(
        'MicrosoftExchange329e71ec88ae4615bbc36ab6ce41109e@contoso.example.invalid'
      )
    ).toBe(true);
    expect(isExchangeSenderLocalPart('MicrosoftExchange329e71ec88ae4615bbc36ab6ce41109e')).toBe(
      true
    );
    expect(isExchangeSenderLocalPart('postmaster')).toBe(false);
    expect(isBounceSenderAddress('friend@contoso.example.invalid')).toBe(false);
    expect(isBounceSenderAddress('@contoso.example.invalid')).toBe(false);
    expect(isBounceSenderAddress('postmaster')).toBe(false);
  });
});
