/**
 * Contact quota for lead.convertToDeal.
 *
 * A conversion that asks for a contact links an existing contact with the lead's email when
 * there is one (ConvertLeadToDealUseCase), and only otherwise creates a new one. The quota is
 * charged for the new contact only, and at the point the use case decides to create it: the
 * tenant's contact lock is held for the whole conversion (as bulkConvert does), and the use
 * case's `beforeCreateContact` hook asserts one unit inside it. Deciding and charging in the
 * same place means no contact can be created on a stale "it already exists" answer, and a tenant
 * at its contact limit can still convert a lead for someone already known.
 */

import { assertQuota, withQuotaLock, type QuotaContext } from '../../shared/quota-guard';

export interface ContactQuotaHooks {
  beforeCreateContact: () => Promise<void>;
}

/** Run the conversion under the contact quota, charging only for a contact it creates. */
export async function convertWithContactQuota<T>(
  ctx: QuotaContext,
  input: { tenantId: string; createContact: boolean },
  run: (hooks: ContactQuotaHooks) => Promise<T>
): Promise<T> {
  if (!input.createContact) return run({ beforeCreateContact: async () => {} });
  return withQuotaLock(ctx, input.tenantId, 'contacts', 0, () =>
    run({ beforeCreateContact: () => assertQuota(ctx, input.tenantId, 'contacts', 1) })
  );
}
