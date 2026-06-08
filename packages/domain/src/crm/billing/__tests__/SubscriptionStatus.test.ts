import { describe, it, expect } from 'vitest';
import {
  toDbSubscriptionStatus,
  mapStripeToPortalSubscriptionStatus,
  type StripeSubscriptionStatusValue,
} from '../SubscriptionStatus';

describe('toDbSubscriptionStatus', () => {
  it.each<[StripeSubscriptionStatusValue, string]>([
    ['incomplete', 'INCOMPLETE'],
    ['incomplete_expired', 'INCOMPLETE_EXPIRED'],
    ['trialing', 'TRIALING'],
    ['active', 'ACTIVE'],
    ['past_due', 'PAST_DUE'],
    ['canceled', 'CANCELED'],
    ['unpaid', 'UNPAID'],
    ['paused', 'PAUSED'],
  ])('maps %s -> %s', (stripe, db) => {
    expect(toDbSubscriptionStatus(stripe)).toBe(db);
  });

  it('defaults unknown status to INCOMPLETE', () => {
    expect(toDbSubscriptionStatus('something_new')).toBe('INCOMPLETE');
  });
});

describe('mapStripeToPortalSubscriptionStatus', () => {
  it.each<[StripeSubscriptionStatusValue, string]>([
    ['active', 'active'],
    ['trialing', 'active'], // a trial is a live engagement
    ['past_due', 'past_due'],
    ['unpaid', 'past_due'],
    ['canceled', 'canceled'],
    ['incomplete_expired', 'canceled'],
    ['paused', 'paused'],
    ['incomplete', 'none'],
  ])('maps %s -> portal %s', (stripe, portal) => {
    expect(mapStripeToPortalSubscriptionStatus(stripe)).toBe(portal);
  });

  it('defaults unknown status to none', () => {
    expect(mapStripeToPortalSubscriptionStatus('zzz')).toBe('none');
  });
});
