/**
 * PG-199 (ADR-082): the domain model catalog must never drift from what ai-worker
 * actually prices and routes.
 *
 * - every catalog price equals MODEL_PRICING (USD per 1k) × 1e6, rounded
 * - every `${purpose}-${tier}` alias in MODEL_PRICING prices like its default model
 * - every catalog chat model has a `catalog-<id>` LiteLLM stanza routing to the same
 *   provider model as the alias it mirrors
 * - CALLER_DEFAULT_TIERS covers every literal tier a caller passes for a purpose
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { parse } from 'yaml';
import {
  CALLER_DEFAULT_TIERS,
  DEFAULT_MODEL,
  LLM_PURPOSES,
  LLM_TIERS,
  MODEL_CATALOG,
  getCatalogEntry,
  type LLMPurpose,
  type LLMTier,
} from '@intelliflow/domain';
import { MODEL_PRICING, calculateCost } from '../../config/ai.config';

const SRC = resolve(__dirname, '../..');
const LITELLM_CONFIG = resolve(__dirname, '../../../../../infra/litellm/config.yaml');

type Pricing = Record<string, { input: number; output: number }>;
const PRICING = MODEL_PRICING as unknown as Pricing;
const micro = (usdPer1k: number) => Math.round(usdPer1k * 1e6);

interface LiteLlmEntry {
  model_name: string;
  litellm_params: { model: string };
}
const modelList = (parse(readFileSync(LITELLM_CONFIG, 'utf8')) as { model_list: LiteLlmEntry[] })
  .model_list;
const providerModel = (alias: string) =>
  modelList.find((m) => m.model_name === alias)?.litellm_params.model;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
    return /\.ts$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : [];
  });
}

describe('model catalog ⇄ MODEL_PRICING', () => {
  it.each(MODEL_CATALOG.map((m) => [m.id, m] as const))(
    '%s is priced exactly as MODEL_PRICING',
    (_id, m) => {
      const pricing = PRICING[m.pricingKey];
      expect(pricing, `MODEL_PRICING["${m.pricingKey}"]`).toBeDefined();
      expect(m.priceMicroUsdPer1k).toEqual({
        input: micro(pricing.input),
        output: micro(pricing.output),
      });
    }
  );

  it('prices every purpose/tier alias like the catalog model behind it', () => {
    for (const purpose of LLM_PURPOSES) {
      for (const tier of LLM_TIERS) {
        const id = DEFAULT_MODEL[purpose][tier];
        const alias = `${purpose}-${tier}`;
        if (id === undefined) {
          expect(PRICING[alias], `${alias} has a price but no default model`).toBeUndefined();
          continue;
        }
        const entry = getCatalogEntry(id)!;
        expect(
          { input: micro(PRICING[alias].input), output: micro(PRICING[alias].output) },
          alias
        ).toEqual(entry.priceMicroUsdPer1k);
      }
    }
  });
});

describe('model catalog ⇄ infra/litellm/config.yaml', () => {
  it('routes every default alias to the model its catalog entry stands for', () => {
    const seen = new Map<string, string>();
    for (const purpose of LLM_PURPOSES) {
      for (const tier of LLM_TIERS) {
        const id = DEFAULT_MODEL[purpose][tier];
        if (!id) continue;
        const model = providerModel(`${purpose}-${tier}`);
        expect(model, `${purpose}-${tier} stanza`).toBeDefined();
        if (seen.has(id))
          expect(model, `${id} is the same provider model everywhere`).toBe(seen.get(id));
        seen.set(id, model!);
      }
    }
  });

  it.each(MODEL_CATALOG.filter((m) => m.kind === 'chat').map((m) => [m.id] as const))(
    'has a catalog-%s stanza routing to the same provider model as its alias',
    (id) => {
      const stanza = providerModel(`catalog-${id}`);
      expect(stanza, `catalog-${id} stanza`).toBeDefined();
      const alias = LLM_PURPOSES.flatMap((p) => LLM_TIERS.map((t) => [p, t] as const)).find(
        ([p, t]) => DEFAULT_MODEL[p][t] === id
      )!;
      expect(stanza).toBe(providerModel(`${alias[0]}-${alias[1]}`));
    }
  );
});

describe('CALLER_DEFAULT_TIERS ⇄ ai-worker call sites', () => {
  const files = sourceFiles(SRC);

  it('covers every literal (purpose, tier) passed to createLLM / createLLMForTenant', () => {
    const found: [LLMPurpose, LLMTier, string][] = [];
    const call = /createLLM(?:ForTenant)?\(\s*'(\w+)'\s*,\s*'(\w+)'/g;
    for (const file of files) {
      for (const m of readFileSync(file, 'utf8').matchAll(call)) {
        found.push([m[1] as LLMPurpose, m[2] as LLMTier, file]);
      }
    }
    expect(found.length).toBeGreaterThan(10);
    for (const [purpose, tier, file] of found) {
      expect(CALLER_DEFAULT_TIERS[purpose], `${purpose}/${tier} in ${file}`).toContain(tier);
    }
  });

  it('covers the agents, which run their purpose on the free tier by default', () => {
    const agentDir = join(SRC, 'agents');
    const purposes = readdirSync(agentDir)
      .filter((n) => n.endsWith('.agent.ts'))
      .flatMap((n) =>
        readFileSync(join(agentDir, n), 'utf8')
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.startsWith("purpose: '") && line.endsWith("',"))
          .map((line) => line.slice("purpose: '".length, -"',".length))
      );
    expect(purposes.length).toBeGreaterThan(0);
    for (const purpose of [...purposes, 'reasoning']) {
      expect(CALLER_DEFAULT_TIERS[purpose as LLMPurpose]).toContain('free');
    }
  });
});

describe('calculateCost for OpenRouter free variants (PG-199)', () => {
  it('prices an explicit `:free` model at zero, without a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(calculateCost('openai/gpt-oss-120b:free', 5000, 5000)).toBe(0);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('calculateCost with an unknown pricing key (PG-199)', () => {
  it('still prices it as gpt-3.5-turbo but warns once per key instead of staying silent', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const first = calculateCost('pg199-unknown-model', 1000, 1000);
    calculateCost('pg199-unknown-model', 1000, 1000);
    expect(first).toBeCloseTo(PRICING['gpt-3.5-turbo'].input + PRICING['gpt-3.5-turbo'].output);
    const mentions = warn.mock.calls.filter((c) => String(c[0]).includes('pg199-unknown-model'));
    expect(mentions).toHaveLength(1);
    warn.mockRestore();
  });
});
