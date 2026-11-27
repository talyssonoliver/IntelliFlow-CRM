import { describe, it, expect } from 'vitest';
import { Contact } from '../Contact';

/** MVP-003 (#28): fields cleared in the edit form are applied: text emptied, the phone removed. */
function contact(phone?: string) {
  return Contact.create({
    email: 'owner@pilates.example.invalid',
    firstName: 'Studio Pilates Demo',
    lastName: 'Unknown',
    ownerId: 'owner-1',
    tenantId: 'tenant-1',
    title: 'Owner',
    company: 'Studio Pilates Demo',
    ...(phone ? { phone } : {}),
  }).value;
}

describe('Contact.updateContactInfo clearing fields (MVP-003 #28)', () => {
  it('removes the phone number when it is cleared (null)', () => {
    const c = contact('+447700900123');
    c.clearDomainEvents();
    expect(c.updateContactInfo({ phone: null }, 'user-1').isSuccess).toBe(true);
    expect(c.phone).toBeUndefined();
    const [event] = c.getDomainEvents() as Array<{ updatedFields?: string[] }>;
    expect(event?.updatedFields).toEqual(['phone']);
  });

  it('changes nothing when a contact without a phone has it cleared', () => {
    const c = contact();
    c.clearDomainEvents();
    expect(c.updateContactInfo({ phone: null }, 'user-1').isSuccess).toBe(true);
    expect(c.getDomainEvents()).toHaveLength(0);
  });

  it('empties cleared text fields, and leaves fields not sent alone', () => {
    const c = contact('+447700900123');
    c.updateContactInfo({ lastName: '', title: '', company: '' }, 'user-1');
    expect(c.lastName).toBe('');
    expect(c.title).toBe('');
    expect(c.company).toBe('');
    expect(c.phone?.toValue()).toBe('+447700900123');
  });

  it('still sets a new phone number', () => {
    const c = contact();
    expect(c.updateContactInfo({ phone: '+447700900456' }, 'user-1').isSuccess).toBe(true);
    expect(c.phone?.toValue()).toBe('+447700900456');
  });
});
