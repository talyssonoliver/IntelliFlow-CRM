/**
 * Per-tenant metering: contact.create must respect the `contacts` quota.
 */

import { describe, it, expect, vi } from 'vitest';
import { contactRouter } from '../contact.router';
import { createTestContext, mockServices, TEST_UUIDS } from '../../../test/setup';
import { overQuota, quotaRejection, underQuota } from '../../../test/quota';

vi.mock('../../../lib/load-bullmq', () => ({
  loadBullMQ: vi.fn(async () => ({
    Queue: class MockQueue {
      add = vi.fn().mockResolvedValue({ id: 'job-stub' });
      close = vi.fn().mockResolvedValue(undefined);
    },
    QueueEvents: class MockQueueEvents {
      close = vi.fn().mockResolvedValue(undefined);
    },
  })),
}));

const input = { email: 'new@example.com', firstName: 'Bob', lastName: 'Williams' };

function domainContact() {
  return {
    id: { value: TEST_UUIDS.contact1 },
    email: { value: input.email },
    firstName: input.firstName,
    lastName: input.lastName,
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

describe('contact.create quota guard', () => {
  it('rejects with QUOTA_EXCEEDED when the tenant is at its contact limit', async () => {
    const createContact = vi.fn();
    const ctx = createTestContext({
      services: {
        ...mockServices,
        contact: { createContact } as never,
        quota: overQuota('contacts', 500, 500) as never,
      },
    });

    await expect(contactRouter.createCaller(ctx).create(input)).rejects.toMatchObject(
      quotaRejection('contacts', 500, 500)
    );
    expect(createContact).not.toHaveBeenCalled();
  });

  it('creates the contact when under the limit, checking the contacts key for this tenant', async () => {
    const quota = underQuota();
    const createContact = vi
      .fn()
      .mockResolvedValue({ isSuccess: true, isFailure: false, value: domainContact() });
    const ctx = createTestContext({
      services: { ...mockServices, contact: { createContact } as never, quota: quota as never },
    });

    const result = await contactRouter.createCaller(ctx).create(input);

    expect(result.email).toBe(input.email);
    expect(quota.assertWithinQuota).toHaveBeenCalledWith(TEST_UUIDS.tenant, 'contacts', 1);
    expect(createContact).toHaveBeenCalledTimes(1);
  });
});
