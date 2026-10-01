/**
 * Per-tenant metering: lead -> contact conversions must respect the `contacts` quota.
 */

import { describe, it, expect, vi } from 'vitest';
import { QuotaExceededError } from '@intelliflow/domain';
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
      expect(quota.withinQuota).toHaveBeenCalledWith(
        TEST_UUIDS.tenant,
        'contacts',
        1,
        expect.any(Function)
      );
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

    const leadRow = (id: string, status: string) => ({
      id,
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: `${id}@example.com`,
      company: 'Analytical',
      title: null,
      phone: null,
      source: 'WEBSITE',
      status,
      score: 0,
      ownerId: TEST_UUIDS.user1,
      tenantId: TEST_UUIDS.tenant,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    function runTransaction(leads: Array<ReturnType<typeof leadRow>>) {
      const tx = {
        lead: {
          findMany: vi.fn().mockResolvedValue(leads),
          updateMany: vi.fn().mockResolvedValue({ count: leads.length }),
        },
        leadActivity: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
        contact: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
        account: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
      };
      (prismaMock as any).$transaction = vi.fn(async (fn: (t: unknown) => unknown) => fn(tx));
      return tx;
    }

    it('charges only the eligible leads, not every requested id', async () => {
      const quota = underQuota();
      // 3 ids requested: one convertible, one already converted, one missing.
      const tx = runTransaction([leadRow(ids[0]!, 'QUALIFIED'), leadRow(ids[1]!, 'CONVERTED')]);
      const ctx = createTestContext({ services: { ...mockServices, quota: quota as never } });

      const result = await leadRouter.createCaller(ctx).bulkConvert({
        ids: [ids[0]!, ids[1]!, '00000000-0000-4000-8000-0000000000aa'],
        createAccounts: false,
      });

      expect(result.successful).toEqual([ids[0]]);
      expect(quota.assertWithinQuota).toHaveBeenCalledTimes(1);
      expect(quota.assertWithinQuota).toHaveBeenCalledWith(TEST_UUIDS.tenant, 'contacts', 1);
      // The whole conversion runs under the per-tenant contact lock.
      expect(quota.withinQuota).toHaveBeenCalledWith(
        TEST_UUIDS.tenant,
        'contacts',
        0,
        expect.any(Function)
      );
      expect(tx.contact.createMany).toHaveBeenCalledTimes(1);
    });

    it('does not reject a batch that converts nothing, even when the tenant is full', async () => {
      const quota = overQuota('contacts', 2000, 2000);
      const tx = runTransaction([leadRow(ids[0]!, 'CONVERTED'), leadRow(ids[1]!, 'CONVERTED')]);
      const ctx = createTestContext({ services: { ...mockServices, quota: quota as never } });

      const result = await leadRouter.createCaller(ctx).bulkConvert({ ids, createAccounts: false });

      expect(result.successful).toEqual([]);
      expect(result.failed).toHaveLength(2);
      expect(tx.contact.createMany).not.toHaveBeenCalled();
    });

    it('rolls the conversion back when the eligible leads do not fit', async () => {
      const quota = underQuota();
      quota.assertWithinQuota.mockRejectedValue(new QuotaExceededError('contacts', 1999, 2000, 2));
      const tx = runTransaction([leadRow(ids[0]!, 'QUALIFIED'), leadRow(ids[1]!, 'QUALIFIED')]);
      const ctx = createTestContext({ services: { ...mockServices, quota: quota as never } });

      await expect(
        leadRouter.createCaller(ctx).bulkConvert({ ids, createAccounts: false })
      ).rejects.toMatchObject(quotaRejection('contacts', 1999, 2000));
      expect(tx.lead.updateMany).not.toHaveBeenCalled();
      expect(tx.contact.createMany).not.toHaveBeenCalled();
    });
  });
});
