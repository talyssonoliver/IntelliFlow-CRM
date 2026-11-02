/**
 * PG-203 DSAR — a processing restriction follows a contact to a new email
 * (spec R4 "restriction follows the record"; plan revision 2 item 2).
 */
import { describe, it, expect, vi } from 'vitest';
import { Contact } from '@intelliflow/domain';
import { ContactService } from '../ContactService';

function setup(followEmail = vi.fn().mockResolvedValue(undefined)) {
  const created = Contact.create({
    email: 'ada@example.invalid',
    firstName: 'Ada',
    lastName: 'Lovelace',
    ownerId: 'owner-1',
    tenantId: 'tenant-1',
  } as never);
  if (created.isFailure) throw created.error;
  const contact = created.value;
  const contactRepository: Record<string, any> = {
    findById: vi.fn().mockResolvedValue(contact),
    findByEmailInTenant: vi.fn().mockResolvedValue(null),
    save: vi.fn().mockResolvedValue(undefined),
  };
  const service = new ContactService(
    contactRepository as never,
    {} as never,
    {} as never,
    { publishAll: vi.fn().mockResolvedValue(undefined), publish: vi.fn() } as never,
    { followEmail }
  );
  return { service, contact, contactRepository, followEmail };
}

describe('ContactService.updateContactEmail and processing restrictions', () => {
  it('extends the restriction to the new address before saving the contact', async () => {
    const { service, contact, contactRepository, followEmail } = setup();
    const result = await service.updateContactEmail(
      contact.id.value,
      'ada.new@example.invalid',
      'user-1',
      'tenant-1'
    );
    expect(result.isSuccess).toBe(true);
    expect(followEmail).toHaveBeenCalledWith(
      'tenant-1',
      'ada@example.invalid',
      'ada.new@example.invalid'
    );
    expect(followEmail.mock.invocationCallOrder[0]).toBeLessThan(
      contactRepository.save.mock.invocationCallOrder[0]
    );
  });

  it('does not change the email when the restriction could not follow it', async () => {
    const { service, contact, contactRepository } = setup(
      vi.fn().mockRejectedValue(new Error('db down'))
    );
    const result = await service.updateContactEmail(
      contact.id.value,
      'ada.new@example.invalid',
      'user-1',
      'tenant-1'
    );
    expect(result.isFailure).toBe(true);
    expect(result.error.message).toBe('Failed to carry the processing restriction');
    expect(contactRepository.save).not.toHaveBeenCalled();
  });

  it('works unchanged for services built without the port (existing call sites)', async () => {
    const created = Contact.create({
      email: 'bob@example.invalid',
      firstName: 'Bob',
      lastName: 'Byte',
      ownerId: 'owner-1',
      tenantId: 'tenant-1',
    } as never);
    if (created.isFailure) throw created.error;
    const repo: Record<string, any> = {
      findById: vi.fn().mockResolvedValue(created.value),
      findByEmailInTenant: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const service = new ContactService(
      repo as never,
      {} as never,
      {} as never,
      {
        publishAll: vi.fn().mockResolvedValue(undefined),
        publish: vi.fn(),
      } as never
    );
    const result = await service.updateContactEmail(
      created.value.id.value,
      'bob.new@example.invalid',
      'user-1',
      'tenant-1'
    );
    expect(result.isSuccess).toBe(true);
  });
});
