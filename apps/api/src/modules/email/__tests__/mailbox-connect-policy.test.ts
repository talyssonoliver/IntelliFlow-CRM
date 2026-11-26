/** Customer issue register #58: the allowlist and the personal-mailbox rules, as pure functions. */
import { describe, expect, it } from 'vitest';
import {
  OWNER_TENANT_ID,
  assertMailboxAllowed,
  assertPersonalConfirmed,
  isConsumerMailAddress,
  mailboxAllowlist,
} from '../mailbox-connect-policy';

describe('isConsumerMailAddress', () => {
  it.each([
    'a@gmail.com',
    'a@googlemail.com',
    'a@outlook.com',
    'a@hotmail.com',
    'a@live.com',
    'a@yahoo.com',
    'a@yahoo.co.uk',
    'a@icloud.com',
    'a@aol.com',
    'a@proton.me',
    'A@GMAIL.COM',
  ])('%s is personal', (address) => {
    expect(isConsumerMailAddress(address)).toBe(true);
  });

  it.each(['talysson@leangency.com', 'a@yahoo.example.com', 'a@mygmail.com', 'nodomain', ''])(
    '%s is not',
    (address) => {
      expect(isConsumerMailAddress(address)).toBe(false);
    }
  );
});

describe('mailboxAllowlist', () => {
  it('the owner tenant has only the professional mailbox, with no configuration', () => {
    expect(mailboxAllowlist(OWNER_TENANT_ID, {})).toEqual(['talysson@leangency.com']);
  });

  it('an environment list replaces it, per tenant', () => {
    const key = `MAILBOX_CONNECT_ALLOWLIST_${OWNER_TENANT_ID.toUpperCase()}`;
    expect(mailboxAllowlist(OWNER_TENANT_ID, { [key]: ' A@x.com, b@y.com ' })).toEqual([
      'a@x.com',
      'b@y.com',
    ]);
    // There is no wildcard: nothing environment-side can open the owner tenant to any address.
    expect(() => assertMailboxAllowed(OWNER_TENANT_ID, 'x@y.com', { [key]: '*' })).toThrow(
      /MAILBOX_NOT_ALLOWED/
    );
  });

  it('a customer tenant has none unless it sets one', () => {
    expect(mailboxAllowlist('tenant-of-a-customer', {})).toBeNull();
    expect(
      mailboxAllowlist('tenant-of-a-customer', {
        MAILBOX_CONNECT_ALLOWLIST_TENANT_OF_A_CUSTOMER: 'ops@customer.example',
      })
    ).toEqual(['ops@customer.example']);
  });
});

describe('assertMailboxAllowed', () => {
  it('refuses the owner personal Gmail (the 22/11 incident) with a clear message', () => {
    expect(() =>
      assertMailboxAllowed(OWNER_TENANT_ID, 'talyssondasilvaoliveira@gmail.com', {})
    ).toThrow(/MAILBOX_NOT_ALLOWED: Only talysson@leangency.com can be connected/);
  });

  it('refuses a missing address on a tenant with a list, and allows the listed one in any case', () => {
    expect(() => assertMailboxAllowed(OWNER_TENANT_ID, null, {})).toThrow(/MAILBOX_NOT_ALLOWED/);
    expect(() => assertMailboxAllowed(OWNER_TENANT_ID, 'Talysson@Leangency.com', {})).not.toThrow();
  });

  it('does not touch a tenant without a list', () => {
    expect(() =>
      assertMailboxAllowed('tenant-of-a-customer', 'anyone@gmail.com', {})
    ).not.toThrow();
  });
});

describe('assertPersonalConfirmed', () => {
  it('asks, with the exact notice and the scope, until the user confirms', () => {
    expect(() => assertPersonalConfirmed('me@gmail.com', false, 'USER')).toThrow(
      'PERSONAL_MAILBOX:USER: This looks like a personal mailbox. Aurora will import mail with your leads and contacts. Continue?'
    );
    expect(() => assertPersonalConfirmed('me@gmail.com', true, 'USER')).not.toThrow();
  });

  it('never asks for a business address', () => {
    expect(() => assertPersonalConfirmed('me@leangency.com', undefined, 'TENANT')).not.toThrow();
  });
});
