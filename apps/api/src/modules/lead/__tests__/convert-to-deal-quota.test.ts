import { describe, expect, it, vi } from 'vitest';
import { convertWithContactQuota, type ContactQuotaHooks } from '../convert-to-deal-quota';
import { overQuota, underQuota } from '../../../test/quota';

const quotaCtx = (quota: unknown) => ({ services: { quota } }) as never;
const input = { tenantId: 't1', createContact: true };

/** A conversion that creates a new contact: it calls the hook, then finishes. */
const createsContact = vi.fn(async (hooks: ContactQuotaHooks) => {
  await hooks.beforeCreateContact();
  return 'created';
});
/** A conversion that links an existing contact: it never calls the hook. */
const linksContact = vi.fn(async () => 'linked');

describe('convertWithContactQuota', () => {
  it('takes no lock and charges nothing when no contact is asked for', async () => {
    const quota = overQuota('contacts', 10, 10);
    const out = await convertWithContactQuota(
      quotaCtx(quota),
      { ...input, createContact: false },
      createsContact
    );
    expect(out).toBe('created');
    expect(quota.withinQuota).not.toHaveBeenCalled();
    expect(quota.assertWithinQuota).not.toHaveBeenCalled();
  });

  it('holds the contact lock and asserts one contact when the conversion creates one', async () => {
    const quota = underQuota();
    expect(await convertWithContactQuota(quotaCtx(quota), input, createsContact)).toBe('created');
    expect(quota.withinQuota).toHaveBeenCalledWith('t1', 'contacts', 0, expect.any(Function));
    expect(quota.assertWithinQuota).toHaveBeenCalledWith('t1', 'contacts', 1);
  });

  it('refuses a new contact past the limit', async () => {
    const quota = overQuota('contacts', 10, 10);
    await expect(
      convertWithContactQuota(quotaCtx(quota), input, createsContact)
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });

  it('lets a conversion that links an existing contact through at the limit', async () => {
    const quota = overQuota('contacts', 10, 10);
    expect(await convertWithContactQuota(quotaCtx(quota), input, linksContact)).toBe('linked');
    expect(quota.withinQuota).toHaveBeenCalledWith('t1', 'contacts', 0, expect.any(Function));
    expect(quota.assertWithinQuota).not.toHaveBeenCalled();
  });
});
