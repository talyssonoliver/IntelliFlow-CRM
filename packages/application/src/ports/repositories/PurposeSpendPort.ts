/**
 * Purpose Spend Port (PG-199, ADR-082)
 *
 * Month-to-date AI spend per tenant and AI purpose, in hundredths of a cent, kept in
 * tenant_usage_counters under `aiSpendCentiCents:<purpose>` (domain `purposeSpendKey`).
 * Deliberately separate from QuotaRepositoryPort: those keys are not quota keys.
 */

import type { LLMPurpose } from '@intelliflow/domain';

export interface PurposeSpendPort {
  /**
   * Atomically add `centiCents` (rounded up, ignored when <= 0) to the purpose's counter for
   * the period; returns the new value, clamped at the INTEGER maximum.
   */
  addSpend(
    tenantId: string,
    purpose: LLMPurpose,
    period: string,
    centiCents: number
  ): Promise<number>;

  /** Spend for each requested purpose in the period; 0 for a purpose with no counter yet. */
  getSpend(
    tenantId: string,
    period: string,
    purposes: readonly LLMPurpose[]
  ): Promise<Partial<Record<LLMPurpose, number>>>;
}
