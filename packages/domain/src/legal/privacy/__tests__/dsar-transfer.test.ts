/**
 * IFC-317 — Art 20(2) transfer rules: the state a link is in, and which requests may be sent on.
 */
import { describe, it, expect } from 'vitest';
import { DSAR_REQUEST_TYPES, DSAR_STATUSES } from '../dsar';
import {
  DSAR_TRANSFER_EVENT_KINDS,
  DSAR_TRANSFER_LIMITS,
  dsarTransferIsLive,
  dsarTransferState,
  transferMayBeCreated,
} from '../dsar-transfer';

const NOW = new Date('2026-11-28T10:00:00Z');
const FUTURE = new Date(NOW.getTime() + 1000);
const PAST = new Date(NOW.getTime() - 1000);

describe('dsarTransferState', () => {
  it('is ACTIVE while unused, unrevoked and before its expiry', () => {
    const t = { usedAt: null, revokedAt: null, expiresAt: FUTURE };
    expect(dsarTransferState(t, NOW)).toBe('ACTIVE');
    expect(dsarTransferIsLive(t, NOW)).toBe(true);
  });

  it('is EXPIRED at the expiry instant and after (the link is dead at expiresAt)', () => {
    expect(dsarTransferState({ usedAt: null, revokedAt: null, expiresAt: NOW }, NOW)).toBe(
      'EXPIRED'
    );
    expect(dsarTransferState({ usedAt: null, revokedAt: null, expiresAt: PAST }, NOW)).toBe(
      'EXPIRED'
    );
  });

  it('lets used and revoked win over expiry: they happened first', () => {
    expect(dsarTransferState({ usedAt: PAST, revokedAt: null, expiresAt: PAST }, NOW)).toBe(
      'DOWNLOADED'
    );
    expect(dsarTransferState({ usedAt: null, revokedAt: PAST, expiresAt: PAST }, NOW)).toBe(
      'REVOKED'
    );
    expect(dsarTransferIsLive({ usedAt: PAST, revokedAt: null, expiresAt: FUTURE }, NOW)).toBe(
      false
    );
    expect(dsarTransferIsLive({ usedAt: null, revokedAt: PAST, expiresAt: FUTURE }, NOW)).toBe(
      false
    );
  });
});

describe('transferMayBeCreated', () => {
  it('allows only a verified or completed PORTABILITY request', () => {
    const allowed = DSAR_REQUEST_TYPES.flatMap((type) =>
      DSAR_STATUSES.filter((status) => transferMayBeCreated({ type, status })).map(
        (status) => `${type}/${status}`
      )
    );
    expect(allowed).toEqual(['PORTABILITY/VERIFIED', 'PORTABILITY/COMPLETED']);
  });
});

describe('limits and kinds', () => {
  it('keeps a seven-day link and the five recorded steps', () => {
    expect(DSAR_TRANSFER_LIMITS.linkHours).toBe(7 * 24);
    expect([...DSAR_TRANSFER_EVENT_KINDS]).toEqual([
      'CREATED',
      'SENT',
      'DOWNLOADED',
      'EXPIRED',
      'REVOKED',
    ]);
  });
});
