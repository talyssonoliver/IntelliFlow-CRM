/**
 * Per-tenant metering: lead -> contact conversions must respect the `contacts` quota.
 */

import { describe, it, expect, vi } from 'vitest';
import { leadRouter } from '../lead.router';
import { createTestContext, mockServices, prismaMock, TEST_UUIDS } from '../../../test/setup';
import { overQuota, quotaRejection, underQuota } from '../../../test/quota';

const conversion = {
  leadId: TEST_UUIDS.lead1,
  contactId: TEST_UUIDS.contact1,
  accountId: null,
  convertedBy: TEST_UUIDS.user1,
  convertedAt: new Date(),
};

describe('lead conversion quota guards', () => {
  describe('convert', () => {
    it('rejects when the tenant is at its contact limit', async () => {
      const convertLead = vi.fn();
      const ctx = createTestContext({
        services: {
          ...mockServices,
          lead: { convertLead } as never,
          quota: overQuota('contacts', 500, 500) as never,
        },
      });

      await expect(
        leadRouter.createCaller(ctx).convert({ leadId: TEST_UUIDS.lead1, createAccount: false })
      ).rejects.toMatchObject(quotaRejection('contacts', 500, 500));
      expect(convertLead).not.toHaveBeenCalled();
    });

    it('converts when under the limit', async () => {
      const quota = underQuota();
      const convertLead = vi
        .fn()
        .mockResolvedValue({ isSuccess: true, isFailure: false, value: conversion });
      const ctx = createTestContext({
        services: { ...mockServices, lead: { convertLead } as never, quota: quota as never },
      });

      const result = await leadRouter
        .createCaller(ctx)
        .convert({ leadId: TEST_UUIDS.lead1, createAccount: false });

      expect(result.contactId).toBe(TEST_UUIDS.contact1);
      expect(quota.assertWithinQuota).toHaveBeenCalledWith(TEST_UUIDS.tenant, 'contacts', 1);
    });
  });

  describe('convertToDeal', () => {
    const dealInput = { leadId: TEST_UUIDS.lead1, dealValue: 1000, createContact: true };
    const dealOutput = {
      leadId: TEST_UUIDS.lead1,
      opportunityId: TEST_UUIDS.opportunity1,
      contactId: TEST_UUIDS.contact1,
      accountId: TEST_UUIDS.account1,
      stage: 'PROSPECTING',
      probability: 10,
      convertedBy: TEST_UUIDS.user1,
      convertedAt: new Date(),
      conversionSnapshot: {},
    };

    it('rejects when it would create a contact past the limit', async () => {
      const execute = vi.fn();
      const ctx = createTestContext({
        services: {
          ...mockServices,
          convertLeadToDeal: { execute } as never,
          quota: overQuota('contacts', 2000, 2000) as never,
        },
      });

      await expect(leadRouter.createCaller(ctx).convertToDeal(dealInput)).rejects.toMatchObject(
        quotaRejection('contacts', 2000, 2000)
      );
      expect(execute).not.toHaveBeenCalled();
    });

    it('does not consume contact quota when no contact is created', async () => {
      const quota = overQuota('contacts', 2000, 2000);
      const execute = vi
        .fn()
        .mockResolvedValue({ isSuccess: true, isFailure: false, value: dealOutput });
      const ctx = createTestContext({
        services: {
          ...mockServices,
          convertLeadToDeal: { execute } as never,
          quota: quota as never,
        },
      });

      await leadRouter.createCaller(ctx).convertToDeal({ ...dealInput, createContact: false });

      expect(quota.assertWithinQuota).not.toHaveBeenCalled();
      expect(execute).toHaveBeenCalledTimes(1);
    });
  });

  describe('bulkConvert', () => {
    const ids = [TEST_UUIDS.lead1, TEST_UUIDS.lead2];

    it('rejects when the whole batch would pass the limit, before touching the database', async () => {
      const transaction = vi.fn();
      (prismaMock as any).$transaction = transaction;
      const ctx = createTestContext({
        services: { ...mockServices, quota: overQuota('contacts', 499, 500) as never },
      });

      await expect(
        leadRouter.createCaller(ctx).bulkConvert({ ids, createAccounts: false })
      ).rejects.toMatchObject(quotaRejection('contacts', 499, 500));
      expect(transaction).not.toHaveBeenCalled();
    });

    it('asks for headroom equal to the batch size and proceeds when under the limit', async () => {
      const quota = underQuota();
      (prismaMock as any).$transaction = vi.fn().mockResolvedValue({
        successful: [],
        failed: [],
        totalProcessed: ids.length,
      });
      const ctx = createTestContext({ services: { ...mockServices, quota: quota as never } });

      await leadRouter.createCaller(ctx).bulkConvert({ ids, createAccounts: false });

      expect(quota.assertWithinQuota).toHaveBeenCalledWith(TEST_UUIDS.tenant, 'contacts', 2);
      expect((prismaMock as any).$transaction).toHaveBeenCalledTimes(1);
    });
  });
});
