/**
 * The chain configuration a tenant's AI chains actually run with, for the AI Chains page
 * (chainVersion.getEffective). Never empty: with no saved version a chain type shows its
 * built-in configuration as "Built-in v1".
 *
 * Per worker chain, the prompt is the saved version's when it fits that chain (the same rule the
 * ai-worker applies), otherwise the chain's built-in prompt. The worker uses only a saved
 * version's prompt, never its model or temperature, so the model shown is the tenant's pinned
 * model for the chain's purpose, else the model recorded on the type's last run, else unknown
 * here (the worker picks it from its own provider settings), with or without a saved version.
 */

import { CHAIN_TYPES, type ChainType } from '@intelliflow/domain';
import {
  BUILTIN_CHAINS,
  autoResponsePromptForDisplay,
  builtinPromptText,
  chainsForType,
  savedPromptFitsChain,
  type ChainPurpose,
  type WorkerChainKey,
} from './builtin-chain-prompts';

export const BUILTIN_VERSION_LABEL = 'Built-in v1';

export interface EffectiveChainRow {
  key: WorkerChainKey;
  name: string;
  purpose: ChainPurpose;
  /** The temperature the chain runs at, or null for the platform default. */
  temperature: number | null;
  prompt: string;
  promptSource: 'builtin' | 'saved';
}

export interface EffectiveChain {
  chainType: ChainType;
  source: 'builtin' | 'saved';
  label: string;
  savedVersionId: string | null;
  model: string | null;
  /** 'saved' is never returned: the worker does not use a saved version's model (kept for the UI type). */
  modelSource: 'saved' | 'tenant-pin' | 'last-run' | 'platform-default';
  /** Always null: each chain runs at its own temperature (see chains). */
  temperature: number | null;
  maxTokens: number | null;
  chains: EffectiveChainRow[];
}

/** A tenant's saved, active version of a chain type, as ChainVersionService returns it. */
export interface SavedChainVersion {
  id: string;
  prompt: string;
  model: string;
  temperature: number;
  maxTokens: number | null;
  description?: string | null;
}

/** A tenant's model settings for one purpose (TenantAIConfig), when it has a row. */
export interface TenantPurposeConfig {
  modelId: string | null;
  temperature: number | null;
  maxTokens: number | null;
}

export interface EffectiveChainSources {
  /** The tenant's active version of a chain type, or null. */
  savedVersion(chainType: ChainType): Promise<SavedChainVersion | null>;
  /** The tenant's settings for a model purpose, or null. */
  purposeConfig(purpose: ChainPurpose): Promise<TenantPurposeConfig | null>;
  /** The model recorded on the type's latest run, or null when none is recorded. */
  lastRunModel(chainType: ChainType): Promise<string | null>;
}

async function describeType(
  chainType: ChainType,
  sources: EffectiveChainSources,
  purposeConfigs: Map<ChainPurpose, TenantPurposeConfig | null>
): Promise<EffectiveChain> {
  const saved = await sources.savedVersion(chainType);
  const chains = chainsForType(chainType);

  const rows: EffectiveChainRow[] = chains.map((chain) => {
    const config = purposeConfigs.get(chain.purpose) ?? null;
    const fits = saved !== null && savedPromptFitsChain(chain, saved.prompt);
    let prompt = builtinPromptText(chain.key);
    if (fits && saved) {
      prompt =
        chain.key === 'AUTO_RESPONSE' ? autoResponsePromptForDisplay(saved.prompt) : saved.prompt;
    }
    return {
      key: chain.key,
      name: chain.name,
      purpose: chain.purpose,
      temperature: config?.temperature ?? chain.temperature,
      prompt,
      promptSource: fits ? 'saved' : 'builtin',
    };
  });

  // The worker takes only a saved version's prompt: the model comes from the tenant's pin for the
  // purpose, else the provider default, and each chain runs at its own temperature. So the model
  // shown is chosen the same way with or without a saved version (the first chain's purpose
  // decides the pinned model shown for the type).
  const primary = purposeConfigs.get(chains[0]!.purpose) ?? null;
  let model: string | null = primary?.modelId ?? null;
  let modelSource: EffectiveChain['modelSource'] = model ? 'tenant-pin' : 'platform-default';
  if (!model) {
    model = await sources.lastRunModel(chainType);
    if (model) modelSource = 'last-run';
  }
  const common = {
    chainType,
    savedVersionId: saved?.id ?? null,
    model,
    modelSource,
    temperature: null,
    maxTokens: primary?.maxTokens ?? null,
    chains: rows,
  };

  // "Saved" only when a chain really runs the saved prompt; a saved version that fits none of the
  // type's chains is named in the label, and its id is kept so the page can link to it.
  if (saved && rows.some((row) => row.promptSource === 'saved')) {
    return { ...common, source: 'saved', label: saved.description?.trim() || 'Saved version' };
  }
  return {
    ...common,
    source: 'builtin',
    label: saved
      ? `${BUILTIN_VERSION_LABEL} (the saved version fits none of these chains)`
      : BUILTIN_VERSION_LABEL,
  };
}

/** Every chain type's effective configuration for one tenant. */
export async function describeEffectiveChains(
  sources: EffectiveChainSources
): Promise<Record<ChainType, EffectiveChain>> {
  const purposes = [...new Set(Object.values(BUILTIN_CHAINS).map((chain) => chain.purpose))];
  const purposeConfigs = new Map<ChainPurpose, TenantPurposeConfig | null>(
    await Promise.all(
      purposes.map(async (purpose) => [purpose, await sources.purposeConfig(purpose)] as const)
    )
  );
  const entries = await Promise.all(
    CHAIN_TYPES.map(
      async (type) => [type, await describeType(type, sources, purposeConfigs)] as const
    )
  );
  return Object.fromEntries(entries) as Record<ChainType, EffectiveChain>;
}
