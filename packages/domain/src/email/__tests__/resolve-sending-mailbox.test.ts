import { describe, expect, it } from 'vitest';
import { resolveSendingMailbox, type SendingMailboxCandidate } from '../resolve-sending-mailbox';

const own = (status: SendingMailboxCandidate['status']): SendingMailboxCandidate => ({
  id: 'own',
  status,
});
const tenant = (status: SendingMailboxCandidate['status']): SendingMailboxCandidate => ({
  id: 'tenant',
  status,
});

describe('resolveSendingMailbox', () => {
  it('uses the sender’s own active mailbox first', () => {
    expect(
      resolveSendingMailbox({
        userMailbox: own('ACTIVE'),
        tenantMailbox: tenant('ACTIVE'),
        allowFallback: true,
        isAdmin: true,
      })
    ).toEqual({ mailbox: own('ACTIVE') });
  });

  it('falls back to the tenant mailbox when the user has none and fallback is on', () => {
    expect(
      resolveSendingMailbox({
        userMailbox: null,
        tenantMailbox: tenant('ACTIVE'),
        allowFallback: true,
        isAdmin: false,
      })
    ).toEqual({ mailbox: tenant('ACTIVE') });
  });

  it('lets an admin send through the tenant mailbox even with fallback off', () => {
    expect(
      resolveSendingMailbox({
        userMailbox: null,
        tenantMailbox: tenant('ACTIVE'),
        allowFallback: false,
        isAdmin: true,
      })
    ).toEqual({ mailbox: tenant('ACTIVE') });
  });

  it('refuses a member without a mailbox when fallback is off', () => {
    expect(
      resolveSendingMailbox({
        userMailbox: null,
        tenantMailbox: tenant('ACTIVE'),
        allowFallback: false,
        isAdmin: false,
      })
    ).toEqual({ refusal: 'NO_MAILBOX' });
  });

  it.each(['ERROR', 'DISCONNECTED'] as const)(
    'refuses with MAILBOX_ERROR when the user’s own mailbox is %s (never falls back)',
    (status) => {
      expect(
        resolveSendingMailbox({
          userMailbox: own(status),
          tenantMailbox: tenant('ACTIVE'),
          allowFallback: true,
          isAdmin: true,
        })
      ).toEqual({ refusal: 'MAILBOX_ERROR' });
    }
  );

  it('refuses with NO_MAILBOX when nothing is connected', () => {
    expect(
      resolveSendingMailbox({
        userMailbox: null,
        tenantMailbox: null,
        allowFallback: true,
        isAdmin: true,
      })
    ).toEqual({ refusal: 'NO_MAILBOX' });
  });

  it('does not use a tenant mailbox that is not active', () => {
    expect(
      resolveSendingMailbox({
        userMailbox: null,
        tenantMailbox: tenant('ERROR'),
        allowFallback: true,
        isAdmin: true,
      })
    ).toEqual({ refusal: 'NO_MAILBOX' });
  });
});
