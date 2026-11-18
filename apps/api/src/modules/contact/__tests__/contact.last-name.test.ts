/**
 * MVP-003: the last name is optional on a contact through the API, the first name is not. A contact
 * created from a lead with only a company is named after the company (empty last name), and the
 * owner has to be able to save and rename it.
 */

import { describe, it, expect, vi } from 'vitest';
import { contactRouter } from '../contact.router';
import { prismaMock, createTestContext, mockServices, TEST_UUIDS } from '../../../test/setup';
import { underQuota } from '../../../test/quota';

vi.mock('../../../lib/load-bullmq', () => ({
  loadBullMQ: vi.fn(async () => ({
    Queue: class MockQueue {
      on() {
        return this;
      }
      add = vi.fn().mockResolvedValue({ id: 'job-stub' });
      close = vi.fn().mockResolvedValue(undefined);
    },
    QueueEvents: class MockQueueEvents {
      on() {
        return this;
      }
      close = vi.fn().mockResolvedValue(undefined);
    },
  })),
}));

const email = 'owner@pilates.example.invalid';
const ok = (value: unknown) => ({ isSuccess: true, isFailure: false, value });

function domainContact(overrides: Record<string, unknown> = {}) {
  return {
    id: { value: TEST_UUIDS.contact1 },
    email: { value: email },
    firstName: 'Pilates Living',
    lastName: '',
    title: null,
    phone: null,
    department: null,
    status: 'ACTIVE',
    accountId: null,
    leadId: null,
    ownerId: TEST_UUIDS.user1,
    tenantId: TEST_UUIDS.tenant,
    hasAccount: false,
    isConvertedFromLead: false,
    lastContactedAt: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    getDomainEvents: () => [],
    clearDomainEvents: () => undefined,
    ...overrides,
  };
}

describe('contact.create without a last name (MVP-003)', () => {
  function setup() {
    const createContact = vi.fn().mockResolvedValue(ok(domainContact()));
    const ctx = createTestContext({
      services: {
        ...mockServices,
        contact: { createContact } as never,
        quota: underQuota() as never,
      },
    });
    return { createContact, caller: contactRouter.createCaller(ctx) };
  }

  it.each([
    ['omitted', {}],
    ['empty', { lastName: '' }],
  ])('creates the contact with only a first name when the last name is %s', async (_l, extra) => {
    const { createContact, caller } = setup();
    const result = await caller.create({ email, firstName: 'Pilates Living', ...extra });
    expect(result.firstName).toBe('Pilates Living');
    expect(result.lastName).toBe('');
    expect(createContact).toHaveBeenCalledWith(
      expect.objectContaining({ firstName: 'Pilates Living', lastName: '' })
    );
  });

  it('still requires a first name', async () => {
    const { createContact, caller } = setup();
    await expect(caller.create({ email, firstName: '', lastName: 'Lima' })).rejects.toThrow();
    await expect(caller.create({ email, lastName: 'Lima' } as never)).rejects.toThrow();
    expect(createContact).not.toHaveBeenCalled();
  });
});

describe('contact.update the last name (MVP-003)', () => {
  function setup(updated = domainContact()) {
    prismaMock.contact.findFirst.mockResolvedValue({
      id: TEST_UUIDS.contact1,
      tenantId: TEST_UUIDS.tenant,
    } as never);
    const updateContactInfo = vi.fn().mockResolvedValue(ok(updated));
    const getContactById = vi.fn().mockResolvedValue(ok(updated));
    const ctx = createTestContext({
      services: { ...mockServices, contact: { updateContactInfo, getContactById } as never },
    });
    return { updateContactInfo, caller: contactRouter.createCaller(ctx) };
  }

  it('lets a contact named "Unknown Unknown" be renamed to a company with no last name', async () => {
    const { updateContactInfo, caller } = setup();
    const result = await caller.update({
      id: TEST_UUIDS.contact1,
      firstName: 'Pilates Living',
      lastName: '',
    });
    expect(result.lastName).toBe('');
    // The empty last name reaches the service: it is applied, not dropped as "no value".
    expect(updateContactInfo.mock.calls[0][1]).toMatchObject({
      firstName: 'Pilates Living',
      lastName: '',
    });
  });

  it('leaves the last name alone when it is not part of the update', async () => {
    const { updateContactInfo, caller } = setup(domainContact({ lastName: 'Lima' }));
    await caller.update({ id: TEST_UUIDS.contact1, firstName: 'Ana' });
    expect(updateContactInfo.mock.calls[0][1]).not.toHaveProperty('lastName');
  });

  it('still refuses an empty first name', async () => {
    const { updateContactInfo, caller } = setup();
    await expect(caller.update({ id: TEST_UUIDS.contact1, firstName: '' })).rejects.toThrow();
    expect(updateContactInfo).not.toHaveBeenCalled();
  });
});
