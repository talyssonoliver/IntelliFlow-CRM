import { describe, expect, it } from 'vitest';
import { ContactMergedEvent } from '../ContactMergedEvent';
import { DomainEvent } from '@intelliflow/domain';

describe('ContactMergedEvent', () => {
  const basePayload = {
    primaryId: 'contact-1',
    mergedContactId: 'contact-2',
    tenantId: 'tenant-A',
    mergedBy: 'user-42',
    mergedAt: new Date('2026-04-20T12:00:00Z'),
    fieldsUpdated: ['title', 'phone'],
  };

  it('exposes static EVENT_TYPE equal to "contact.merged"', () => {
    expect(ContactMergedEvent.EVENT_TYPE).toBe('contact.merged');
  });

  it('instance eventType matches static EVENT_TYPE', () => {
    const evt = new ContactMergedEvent(basePayload);
    expect(evt.eventType).toBe('contact.merged');
  });

  it('extends DomainEvent base class', () => {
    const evt = new ContactMergedEvent(basePayload);
    expect(evt).toBeInstanceOf(DomainEvent);
  });

  it('preserves payload properties on the event', () => {
    const evt = new ContactMergedEvent(basePayload);
    expect(evt.payload.primaryId).toBe('contact-1');
    expect(evt.payload.mergedContactId).toBe('contact-2');
    expect(evt.payload.tenantId).toBe('tenant-A');
    expect(evt.payload.mergedBy).toBe('user-42');
    expect(evt.payload.fieldsUpdated).toEqual(['title', 'phone']);
    expect(evt.payload.mergedAt).toBeInstanceOf(Date);
  });

  it('NF-007: truncates fieldsUpdated > 50 entries and sets truncated flag', () => {
    const manyFields = Array.from({ length: 60 }, (_, i) => `field_${i}`);
    const evt = new ContactMergedEvent({
      ...basePayload,
      fieldsUpdated: manyFields,
    });
    expect(evt.payload.fieldsUpdated).toHaveLength(50);
    expect(evt.payload.truncated).toBe(true);
    expect(evt.payload.fieldsUpdated[0]).toBe('field_0');
    expect(evt.payload.fieldsUpdated[49]).toBe('field_49');
  });

  it('does NOT set truncated flag when fieldsUpdated has <= 50 entries', () => {
    const evt = new ContactMergedEvent(basePayload);
    expect(evt.payload.truncated).toBeUndefined();
  });

  it('toPayload() serialises mergedAt as ISO string', () => {
    const evt = new ContactMergedEvent(basePayload);
    const payload = evt.toPayload();
    expect(payload.mergedAt).toBe('2026-04-20T12:00:00.000Z');
  });

  it('toJSON() returns event metadata + payload with no circular refs', () => {
    const evt = new ContactMergedEvent(basePayload);
    const json = evt.toJSON();
    expect(json.eventType).toBe('contact.merged');
    expect(json.eventId).toBe(evt.eventId);
    expect(json.payload).toMatchObject({
      primaryId: 'contact-1',
      mergedContactId: 'contact-2',
      tenantId: 'tenant-A',
    });
    // serialisation safety — JSON.stringify must not throw
    expect(() => JSON.stringify(json)).not.toThrow();
  });
});
