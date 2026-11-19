/**
 * MVP-003 (#28): a field cleared in the contact edit form reaches the service and is applied:
 * text fields as "", the phone as null (removed). A field not sent stays out (unchanged).
 */
import { describe, it, expect, vi } from 'vitest';
import { contactRouter } from '../contact.router';
import { buildContactInfoUpdates } from '../contact-info-updates';
import { prismaMock, createTestContext, mockServices, TEST_UUIDS } from '../../../test/setup';

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

const ok = (value: unknown) => ({ isSuccess: true, isFailure: false, value });

function domainContact() {
  return {
    id: { value: TEST_UUIDS.contact1 },
    email: { value: 'owner@pilates.example.invalid' },
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
  };
}

function setup() {
  prismaMock.contact.findFirst.mockResolvedValue({
    id: TEST_UUIDS.contact1,
    tenantId: TEST_UUIDS.tenant,
  } as never);
  const updateContactInfo = vi.fn().mockResolvedValue(ok(domainContact()));
  const getContactById = vi.fn().mockResolvedValue(ok(domainContact()));
  const ctx = createTestContext({
    services: { ...mockServices, contact: { updateContactInfo, getContactById } as never },
  });
  return { updateContactInfo, caller: contactRouter.createCaller(ctx) };
}

describe('contact.update with cleared fields (MVP-003 #28)', () => {
  it('removes a cleared phone and empties cleared text fields of each kind', async () => {
    const { updateContactInfo, caller } = setup();
    await caller.update({
      id: TEST_UUIDS.contact1,
      phone: '',
      title: '',
      city: '',
      linkedInUrl: '',
    } as never);
    const sent = updateContactInfo.mock.calls[0][1];
    expect(sent).toMatchObject({ title: '', city: '', linkedInUrl: '' });
    expect(sent).toHaveProperty('phone', null);
  });

  it('leaves out fields that were not sent', async () => {
    const { updateContactInfo, caller } = setup();
    await caller.update({ id: TEST_UUIDS.contact1, company: 'Pilates Living' });
    const sent = updateContactInfo.mock.calls[0][1];
    expect(sent).toEqual({ company: 'Pilates Living' });
  });
});

describe('buildContactInfoUpdates (MVP-003 #28)', () => {
  it('passes a removed phone on as null, and a number as its value', () => {
    expect(buildContactInfoUpdates({ phone: null })).toEqual({ phone: null });
    expect(buildContactInfoUpdates({ phone: { toValue: () => '+447700900123' } })).toEqual({
      phone: '+447700900123',
    });
    expect(buildContactInfoUpdates({})).toEqual({});
  });

  it('keeps "" for cleared text fields', () => {
    expect(buildContactInfoUpdates({ department: '', zipCode: '' })).toEqual({
      department: '',
      zipCode: '',
    });
  });
});
