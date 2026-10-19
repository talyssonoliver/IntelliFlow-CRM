/**
 * Model config rules (PG-199, ADR-082): effective model, price ranking and the
 * Never-Downgrade check shared by the API router and the web Save dialog.
 */

import { getCatalogEntry, type LLMPurpose, type LLMTier } from './catalog';
import { CALLER_DEFAULT_TIERS, DEFAULT_MODEL } from './defaults';

/** A purpose's model choice: an optional pin plus its ordered fallbacks. */
export interface PurposeModelPick {
  modelId: string | null;
  fallbackModelIds: readonly string[];
}

export interface ModelDowngrade {
  purpose: LLMPurpose;
  /** 'primary', or the index of the fallback entry. */
  slot: 'primary' | number;
  /** null when the purpose was (or becomes) unpinned. */
  from: string | null;
  to: string | null;
  /** undefined when the current model is not in the catalog. */
  fromPrice: number | undefined;
  toPrice: number;
}

/** Ranking price: input + output micro-USD per 1k (owner Q7). */
export function priceOf(id: string): number | undefined {
  const entry = getCatalogEntry(id);
  return entry ? entry.priceMicroUsdPer1k.input + entry.priceMicroUsdPer1k.output : undefined;
}

export function isModelAllowedForPurpose(purpose: LLMPurpose, id: string): boolean {
  return getCatalogEntry(id)?.purposes.includes(purpose) ?? false;
}

/** The pinned model, else the tier's default; null when neither decides. */
export function effectiveModel(
  purpose: LLMPurpose,
  tier: LLMTier | null,
  modelId: string | null
): string | null {
  if (modelId) return modelId;
  if (!tier) return null;
  return DEFAULT_MODEL[purpose][tier] ?? null;
}

/** Distinct default models an unpinned purpose can run on, across its callers. */
export function defaultModelsFor(purpose: LLMPurpose): string[] {
  const ids: string[] = [];
  for (const tier of CALLER_DEFAULT_TIERS[purpose]) {
    const id = DEFAULT_MODEL[purpose][tier];
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

function defaultPrices(purpose: LLMPurpose): number[] {
  return defaultModelsFor(purpose).map((id) => priceOf(id) ?? 0);
}

/**
 * The price a change is compared against. An unpinned purpose counts as its most
 * expensive caller default, so a pick that is cheaper for any caller confirms.
 */
export function currentPrimaryPrice(
  purpose: LLMPurpose,
  modelId: string | null
): number | undefined {
  if (modelId) return priceOf(modelId);
  return Math.max(0, ...defaultPrices(purpose));
}

/** Strictly cheaper is a downgrade; equal is lateral; an unknown current always confirms. */
export function isDowngrade(currentPrice: number | undefined, nextId: string): boolean {
  const next = priceOf(nextId);
  if (next === undefined) return true;
  if (currentPrice === undefined) return true;
  return next < currentPrice;
}

function primaryDowngrade(
  purpose: LLMPurpose,
  before: PurposeModelPick,
  after: PurposeModelPick
): ModelDowngrade | null {
  if (before.modelId === after.modelId) return null;
  const fromPrice = currentPrimaryPrice(purpose, before.modelId);
  if (after.modelId === null) {
    // Back to defaults: cheaper for any caller counts.
    const toPrice = Math.min(...defaultPrices(purpose));
    const cheaper = fromPrice === undefined || toPrice < fromPrice;
    return cheaper
      ? { purpose, slot: 'primary', from: before.modelId, to: null, fromPrice, toPrice }
      : null;
  }
  if (!isDowngrade(fromPrice, after.modelId)) return null;
  return {
    purpose,
    slot: 'primary',
    from: before.modelId,
    to: after.modelId,
    fromPrice,
    toPrice: priceOf(after.modelId) ?? 0,
  };
}

/**
 * Every pick in `after` that lowers the price versus `before`: the primary, and
 * each new or changed fallback cheaper than the effective primary after the change.
 * Unchanged fallbacks never re-prompt.
 */
export function findDowngrades(
  purpose: LLMPurpose,
  before: PurposeModelPick,
  after: PurposeModelPick
): ModelDowngrade[] {
  const downgrades: ModelDowngrade[] = [];
  const primary = primaryDowngrade(purpose, before, after);
  if (primary) downgrades.push(primary);

  const primaryPrice = currentPrimaryPrice(purpose, after.modelId);
  after.fallbackModelIds.forEach((id, index) => {
    const previous = before.fallbackModelIds[index] ?? null;
    if (previous === id) return;
    if (!isDowngrade(primaryPrice, id)) return;
    downgrades.push({
      purpose,
      slot: index,
      from: previous,
      to: id,
      fromPrice: primaryPrice,
      toPrice: priceOf(id) ?? 0,
    });
  });
  return downgrades;
}
