/**
 * Contact Automation Helpers - PG-182
 *
 * Unit tests for the hygiene transforms and guard helpers that the runtime
 * paths use to honor the contact-settings toggles.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  assertCanCreateTag,
  assertCanDeleteContact,
  assertRequiredContactFields,
  capitalizeName,
  normalizePhone,
  notifyContactReassignment,
} from '../contact-automation';

const ON = { normalizePhoneNumbers: true } as const;
const OFF = { normalizePhoneNumbers: false } as const;

describe('normalizePhone', () => {
  it('returns input unchanged when toggle is off', () => {
    expect(normalizePhone(' (555) 123-4567 ', OFF)).toBe(' (555) 123-4567 ');
  });

  it('strips non-digits and preserves leading +', () => {
    expect(normalizePhone('+44 (0) 20 7946 0958', ON)).toBe('+4402079460958');
  });

  it('returns null for empty input after trim', () => {
    expect(normalizePhone('   ', ON)).toBe(null);
  });

  it('passes null through', () => {
    expect(normalizePhone(null, ON)).toBe(null);
  });
});

describe('capitalizeName', () => {
  const CAP_ON = { autoCapitalizeNames: true } as const;
  const CAP_OFF = { autoCapitalizeNames: false } as const;

  it('title-cases a simple name', () => {
    expect(capitalizeName('john smith', CAP_ON)).toBe('John Smith');
  });

  it('preserves hyphenation', () => {
    expect(capitalizeName('jean-luc picard', CAP_ON)).toBe('Jean-Luc Picard');
  });

  it('preserves apostrophes', () => {
    expect(capitalizeName("o'neil", CAP_ON)).toBe("O'Neil");
  });

  it('skips transform when toggle is off', () => {
    expect(capitalizeName('JOHN SMITH', CAP_OFF)).toBe('JOHN SMITH');
  });

  it('passes null/undefined through', () => {
    expect(capitalizeName(null, CAP_ON)).toBe(null);
    expect(capitalizeName(undefined, CAP_ON)).toBe(undefined);
  });
});

describe('assertCanDeleteContact', () => {
  it('no-op when toggle is off', () => {
    expect(() =>
      assertCanDeleteContact({ activeOpportunities: 5 }, { preventDeleteWithOpenDeals: false })
    ).not.toThrow();
  });

  it('allows delete when there are zero active deals', () => {
    expect(() =>
      assertCanDeleteContact({ activeOpportunities: 0 }, { preventDeleteWithOpenDeals: true })
    ).not.toThrow();
  });

  it('throws PRECONDITION_FAILED when there are active deals and toggle is on', () => {
    expect(() =>
      assertCanDeleteContact({ activeOpportunities: 2 }, { preventDeleteWithOpenDeals: true })
    ).toThrow(/associated opportunities/i);
  });
});

describe('assertCanCreateTag', () => {
  it('no-op when restriction is off', () => {
    expect(() =>
      assertCanCreateTag({ user: { role: 'USER' } }, { restrictTagCreationToAdmins: false })
    ).not.toThrow();
  });

  it('allows ADMIN through', () => {
    expect(() =>
      assertCanCreateTag({ user: { role: 'ADMIN' } }, { restrictTagCreationToAdmins: true })
    ).not.toThrow();
  });

  it('allows OWNER through', () => {
    expect(() =>
      assertCanCreateTag({ user: { role: 'OWNER' } }, { restrictTagCreationToAdmins: true })
    ).not.toThrow();
  });

  it('forbids regular USER when restriction is on', () => {
    expect(() =>
      assertCanCreateTag({ user: { role: 'USER' } }, { restrictTagCreationToAdmins: true })
    ).toThrow(/restricted to workspace admins/i);
  });
});

describe('assertRequiredContactFields', () => {
  const required = new Set(['email', 'phone'] as const);

  it('create: throws when a required field is missing', () => {
    expect(() =>
      assertRequiredContactFields({ email: 'a@b.com', phone: '' }, required, 'create')
    ).toThrow(/phone/);
  });

  it('create: passes when all required fields are present', () => {
    expect(() =>
      assertRequiredContactFields({ email: 'a@b.com', phone: '+4412345' }, required, 'create')
    ).not.toThrow();
  });

  it('update: only checks fields present in payload', () => {
    // phone is required but user is updating only email — skipping phone is fine
    expect(() =>
      assertRequiredContactFields({ email: 'a@b.com' }, required, 'update')
    ).not.toThrow();
  });

  it('update: rejects explicit blank on a required field', () => {
    expect(() => assertRequiredContactFields({ phone: '' }, required, 'update')).toThrow(/phone/);
  });

  it('update: treats explicit undefined as "do not touch"', () => {
    // Regression: `field in payload` was true even for undefined values,
    // which used to produce a spurious BAD_REQUEST on partial updates.
    expect(() =>
      assertRequiredContactFields({ phone: undefined }, required, 'update')
    ).not.toThrow();
  });

  it('update: rejects explicit null on a required field', () => {
    expect(() => assertRequiredContactFields({ phone: null }, required, 'update')).toThrow(/phone/);
  });
});

describe('notifyContactReassignment', () => {
  const args = {
    tenantId: 'tenant-1',
    contactId: 'contact-1',
    contactName: 'Jane Doe',
    previousOwnerId: 'user-a',
    nextOwnerId: 'user-b',
    actingUserId: 'user-admin',
  };

  it('no-op when the flag is off', async () => {
    const create = vi.fn(async () => ({}));
    await notifyContactReassignment(args, { notifyOnOwnerChange: false }, create);
    expect(create).not.toHaveBeenCalled();
  });

  it('no-op when previous and next owner are the same', async () => {
    const create = vi.fn(async () => ({}));
    await notifyContactReassignment(
      { ...args, previousOwnerId: 'same', nextOwnerId: 'same' },
      { notifyOnOwnerChange: true },
      create
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('notifies both owners when flag is on and owners differ', async () => {
    const create = vi.fn(async () => ({}));
    await notifyContactReassignment(args, { notifyOnOwnerChange: true }, create as any);
    expect(create).toHaveBeenCalledTimes(2);
    const calls = create.mock.calls as unknown as Array<
      [{ userId: string; type: string; entityType: string; entityId: string }]
    >;
    const recipients = calls.map((c) => c[0].userId).sort();
    expect(recipients).toEqual(['user-a', 'user-b']);
    for (const call of calls) {
      expect(call[0].type).toBe('contact_reassigned');
      expect(call[0].entityType).toBe('contact');
      expect(call[0].entityId).toBe('contact-1');
    }
  });
});
