/**
 * PG-199 test fixtures: a `modelConfig.get` response built from the real domain
 * catalog and defaults (the same mapping the router does), so tests never drift
 * from the allow-list.
 */
import {
  LLM_PURPOSES,
  MODEL_CATALOG,
  MODEL_CONFIG_LIMITS,
  defaultModelsFor,
  priceOf,
  type LLMPurpose,
} from '@intelliflow/domain';
import type { CatalogModel, ModelConfigData, PurposeRow } from '../components/model-config-model';

export const CATALOG: CatalogModel[] = MODEL_CATALOG.map((entry) => ({
  id: entry.id,
  kind: entry.kind,
  purposes: [...entry.purposes],
  price: priceOf(entry.id) ?? 0,
  priceMicroUsdPer1k: { ...entry.priceMicroUsdPer1k },
  onOpenRouter: Boolean(entry.providers.openrouter),
  dimensions: entry.dimensions ?? null,
  deprecated: entry.deprecated === true,
}));

export function purposeRow(purpose: LLMPurpose, overrides: Partial<PurposeRow> = {}): PurposeRow {
  return {
    purpose,
    modelId: null,
    fallbackModelIds: [],
    temperature: null,
    maxTokens: null,
    monthlyCostCeilingCents: null,
    updatedAt: null,
    defaultModelIds: defaultModelsFor(purpose),
    spentCents: 0,
    blocked: false,
    retired: false,
    locked: purpose === 'rag',
    activeModel: null,
    ...overrides,
  };
}

export function modelConfigDto(
  rows: Partial<Record<LLMPurpose, Partial<PurposeRow>>> = {},
  extra: Partial<Omit<ModelConfigData, 'purposes'>> = {}
): ModelConfigData {
  return {
    purposes: LLM_PURPOSES.map((purpose) => purposeRow(purpose, rows[purpose])),
    catalog: CATALOG,
    limits: MODEL_CONFIG_LIMITS,
    period: '2026-10',
    canManage: true,
    ...extra,
  };
}
