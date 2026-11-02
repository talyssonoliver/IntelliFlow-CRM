import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  hasSmtpAccount,
  NO_SMTP_ACCOUNT,
  SMTP_ACCOUNT_FIELDS,
  smtpAccountConfig,
  smtpAccountDiffers,
  smtpAccountDto,
  smtpAccountFields,
  smtpAccountInputShape,
  smtpAccountSummary,
} from '../smtp-account';

const USER = 'me@mail.example.invalid';
const SECRET = 'x'.repeat(12);
const stored = smtpAccountFields(USER, SECRET);
const input = z.object(smtpAccountInputShape);

describe('smtpAccountInputShape', () => {
  it('covers exactly the account fields', () => {
    expect(Object.keys(smtpAccountInputShape)).toEqual([...SMTP_ACCOUNT_FIELDS]);
  });

  it('trims the user name', () => {
    expect(input.parse({ smtpUsername: `  ${USER} ` }).smtpUsername).toBe(USER);
  });

  it.each([
    ['empty', '   '],
    ['too long', 'x'.repeat(321)],
    ['carrying a line break', `${USER}\r\nBcc: other@mail.example.invalid`],
  ])('rejects a user name that is %s', (_name, smtpUsername) => {
    expect(input.safeParse({ smtpUsername }).success).toBe(false);
  });

  it('keeps the three meanings of the secret apart: absent, null and a new value', () => {
    expect(input.parse({ smtpUsername: USER }).smtpPassword).toBeUndefined();
    expect(input.parse({ ...stored, smtpPassword: null }).smtpPassword).toBeNull();
    expect(input.parse(stored).smtpPassword).toBe(SECRET);
  });

  it('rejects an empty secret instead of treating it as a clear', () => {
    expect(input.safeParse({ ...stored, smtpPassword: '' }).success).toBe(false);
  });
});

describe('NO_SMTP_ACCOUNT', () => {
  it('is all null and cannot be changed', () => {
    expect(NO_SMTP_ACCOUNT.smtpUsername).toBeNull();
    expect(NO_SMTP_ACCOUNT.smtpPassword).toBeNull();
    expect(Object.isFrozen(NO_SMTP_ACCOUNT)).toBe(true);
  });
});

describe('smtpAccountFields', () => {
  it('maps each value to its own field', () => {
    expect(stored.smtpUsername).toBe(USER);
    expect(stored.smtpPassword).toBe(SECRET);
  });

  it('keeps an undefined secret, which means keep the stored one', () => {
    expect(smtpAccountFields(USER, undefined).smtpPassword).toBeUndefined();
  });
});

describe('smtpAccountSummary', () => {
  it('reports the secret only as a boolean', () => {
    expect(smtpAccountSummary(USER, true)).toEqual({ smtpUsername: USER, hasSmtpPassword: true });
  });
});

describe('smtpAccountDto', () => {
  it('never returns the secret', () => {
    expect(JSON.stringify(smtpAccountDto(stored, true))).not.toContain(SECRET);
  });

  it('shows the user name when allowed', () => {
    expect(smtpAccountDto(stored, true)).toEqual({ smtpUsername: USER, hasSmtpPassword: true });
  });

  it('hides the user name but keeps the boolean when not allowed', () => {
    expect(smtpAccountDto(stored, false)).toEqual({ smtpUsername: null, hasSmtpPassword: true });
  });

  it('reports no secret for an account without one', () => {
    expect(smtpAccountDto(NO_SMTP_ACCOUNT, true).hasSmtpPassword).toBe(false);
  });
});

describe('smtpAccountDiffers', () => {
  it('is false for the same user name', () => {
    expect(smtpAccountDiffers({ smtpUsername: USER }, { smtpUsername: USER })).toBe(false);
  });

  it('is true when a stored secret would be used for another account', () => {
    expect(smtpAccountDiffers({ smtpUsername: USER }, { smtpUsername: `a${USER}` })).toBe(true);
  });

  it('is true when there was no stored user name', () => {
    expect(smtpAccountDiffers({ smtpUsername: null }, { smtpUsername: USER })).toBe(true);
  });
});

describe('hasSmtpAccount', () => {
  it('is true when both fields are set', () => {
    expect(hasSmtpAccount(stored)).toBe(true);
  });

  it.each([
    ['user name', { ...stored, smtpUsername: null }],
    ['secret', { ...stored, smtpPassword: null }],
  ])('is false without a %s', (_name, incomplete) => {
    expect(hasSmtpAccount(incomplete)).toBe(false);
  });
});

describe('smtpAccountConfig', () => {
  it('passes the stored values through', () => {
    expect(smtpAccountConfig(stored)).toEqual({ username: USER, password: SECRET });
  });

  it('uses empty strings for unset fields', () => {
    expect(smtpAccountConfig(NO_SMTP_ACCOUNT)).toEqual({ username: '', password: '' });
  });
});
