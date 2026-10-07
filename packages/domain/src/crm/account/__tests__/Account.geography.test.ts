/**
 * PG-197: Account geography (BR-1, BR-2) — optional country/region/postalCode,
 * normalised on write; update semantics undefined = unchanged, null = clear.
 */

import { describe, it, expect } from 'vitest';
import { Account, InvalidGeographyError } from '../Account';
import { AccountId } from '../AccountId';
import { AccountUpdatedEvent } from '../AccountEvents';

const base = { name: 'Acme', ownerId: 'owner-1', tenantId: 'tenant-1' };

function createAccount(geo: {
  country?: string | null;
  region?: string | null;
  postalCode?: string | null;
}) {
  return Account.create({ ...base, ...geo });
}

describe('Account geography', () => {
  describe('create', () => {
    it('creates without geography — all three are null', () => {
      const account = createAccount({}).value;
      expect(account.country).toBeNull();
      expect(account.region).toBeNull();
      expect(account.postalCode).toBeNull();
    });

    it('normalises country to upper case', () => {
      const result = createAccount({ country: ' gb ' });
      expect(result.isSuccess).toBe(true);
      expect(result.value.country).toBe('GB');
    });

    it.each(['UK', 'ZZ', 'XK'])('rejects the non-ISO country %s', (country) => {
      const result = createAccount({ country });
      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidGeographyError);
      expect(result.error.code).toBe('INVALID_GEOGRAPHY');
    });

    it('collapses region whitespace and keeps its case', () => {
      expect(createAccount({ region: '  Greater   London ' }).value.region).toBe('Greater London');
    });

    it('normalises the postal code display form', () => {
      expect(createAccount({ postalCode: 'sw1a  1aa' }).value.postalCode).toBe('SW1A 1AA');
    });

    it('turns empty strings into null', () => {
      const account = createAccount({ country: '', region: '   ', postalCode: '' }).value;
      expect(account.country).toBeNull();
      expect(account.region).toBeNull();
      expect(account.postalCode).toBeNull();
    });

    it('rejects a region over 100 characters and a postal code over 20', () => {
      expect(createAccount({ region: 'x'.repeat(101) }).isFailure).toBe(true);
      expect(createAccount({ postalCode: '1'.repeat(21) }).isFailure).toBe(true);
      expect(createAccount({ region: 'x'.repeat(100), postalCode: '1'.repeat(20) }).isSuccess).toBe(
        true
      );
    });

    it('serialises geography in toJSON', () => {
      const json = createAccount({
        country: 'us',
        region: 'CA',
        postalCode: '94105',
      }).value.toJSON();
      expect(json).toMatchObject({ country: 'US', region: 'CA', postalCode: '94105' });
    });
  });

  describe('updateAccountInfo', () => {
    function existing() {
      const account = createAccount({
        country: 'GB',
        region: 'London',
        postalCode: 'SW1A 1AA',
      }).value;
      account.clearDomainEvents();
      return account;
    }

    it('clears a field with null and reports it in AccountUpdatedEvent', () => {
      const account = existing();
      const result = account.updateAccountInfo({ country: null }, 'user-1');
      expect(result.isSuccess).toBe(true);
      expect(account.country).toBeNull();
      const events = account.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(AccountUpdatedEvent);
      expect((events[0] as AccountUpdatedEvent).updatedFields).toEqual(['country']);
    });

    it('leaves geography unchanged when undefined', () => {
      const account = existing();
      account.updateAccountInfo({ name: 'Acme Ltd' }, 'user-1');
      expect(account.country).toBe('GB');
      expect(account.region).toBe('London');
      expect(account.postalCode).toBe('SW1A 1AA');
      expect((account.getDomainEvents()[0] as AccountUpdatedEvent).updatedFields).toEqual(['name']);
    });

    it('normalises updated values and only reports actual changes', () => {
      const account = existing();
      account.updateAccountInfo(
        { country: 'gb', region: 'Greater  London', postalCode: 'ec1a 1bb' },
        'user-1'
      );
      expect(account.region).toBe('Greater London');
      expect(account.postalCode).toBe('EC1A 1BB');
      expect((account.getDomainEvents()[0] as AccountUpdatedEvent).updatedFields).toEqual([
        'region',
        'postalCode',
      ]);
    });

    it('emits no event when nothing changes', () => {
      const account = existing();
      account.updateAccountInfo({ country: 'GB' }, 'user-1');
      expect(account.getDomainEvents()).toHaveLength(0);
    });

    it('rejects an invalid country without mutating the aggregate', () => {
      const account = existing();
      const result = account.updateAccountInfo({ name: 'Changed', country: 'UK' }, 'user-1');
      expect(result.isFailure).toBe(true);
      expect(account.name).toBe('Acme');
      expect(account.country).toBe('GB');
      expect(account.getDomainEvents()).toHaveLength(0);
    });

    it('never changes the owner (BR-2)', () => {
      const account = existing();
      account.updateAccountInfo({ country: 'US' }, 'user-1');
      expect(account.ownerId).toBe('owner-1');
    });
  });

  describe('reconstitute', () => {
    it('accepts null geography from persistence', () => {
      const now = new Date();
      const account = Account.reconstitute(AccountId.generate(), {
        ...base,
        country: null,
        region: null,
        postalCode: null,
        createdAt: now,
        updatedAt: now,
      });
      expect(account.country).toBeNull();
      expect(account.region).toBeNull();
      expect(account.postalCode).toBeNull();
    });

    it('treats absent geography as null', () => {
      const now = new Date();
      const account = Account.reconstitute(AccountId.generate(), {
        ...base,
        createdAt: now,
        updatedAt: now,
      });
      expect(account.country).toBeNull();
      expect(account.toJSON()).toMatchObject({ country: null, region: null, postalCode: null });
    });
  });
});
