import { describe, expect, it, vi } from 'vitest';
import {
  BUILTIN_CHAIN_TEMPLATES,
  autoResponsePromptForDisplay,
  promptSlots,
  savedPromptFitsChain,
  BUILTIN_CHAINS,
} from '../builtin-chain-prompts';
import {
  BUILTIN_VERSION_LABEL,
  describeEffectiveChains,
  type EffectiveChainSources,
  type SavedChainVersion,
} from '../effective-chains';

function sources(over: Partial<EffectiveChainSources> = {}): EffectiveChainSources {
  return {
    savedVersion: vi.fn(async () => null),
    purposeConfig: vi.fn(async () => null),
    lastRunModel: vi.fn(async () => null),
    ...over,
  };
}

const saved = (prompt: string, extra: Partial<SavedChainVersion> = {}): SavedChainVersion => ({
  id: 'v-1',
  prompt,
  model: 'claude-haiku-5-5',
  temperature: 0.2,
  maxTokens: 800,
  description: 'Sharper scoring',
  ...extra,
});

describe('promptSlots', () => {
  it('reads slots and treats doubled braces as literal text', () => {
    expect(promptSlots('Lead: {lead_info} and {{"json": true}}')).toEqual(['lead_info']);
    expect(promptSlots('{a} {b} {a}')).toEqual(['a', 'b']);
    expect(promptSlots('no slots')).toEqual([]);
  });

  it('rejects unmatched braces', () => {
    expect(promptSlots('open { only')).toBeNull();
    expect(promptSlots('close } only')).toBeNull();
  });

  it('reads every built-in template as exactly its chain inputs', () => {
    for (const [key, template] of Object.entries(BUILTIN_CHAIN_TEMPLATES)) {
      const chain = BUILTIN_CHAINS[key as keyof typeof BUILTIN_CHAIN_TEMPLATES];
      expect(savedPromptFitsChain(chain, template), key).toBe(true);
    }
  });
});

describe('describeEffectiveChains', () => {
  it('shows every chain type as "Built-in v1" with each chain’s real prompt when nothing is saved', async () => {
    const result = await describeEffectiveChains(sources());

    expect(Object.keys(result).sort()).toEqual([
      'EMAIL_WRITER',
      'FOLLOWUP',
      'QUALIFICATION',
      'SCORING',
    ]);
    for (const chain of Object.values(result)) {
      expect(chain).toMatchObject({
        source: 'builtin',
        label: BUILTIN_VERSION_LABEL,
        savedVersionId: null,
        model: null,
        modelSource: 'platform-default',
      });
      expect(chain.chains.every((row) => row.promptSource === 'builtin')).toBe(true);
    }
    expect(result.SCORING.chains.map((row) => row.key)).toEqual(['LEAD_SCORING', 'CHURN_RISK']);
    expect(result.SCORING.chains[0]!.prompt).toBe(BUILTIN_CHAIN_TEMPLATES.LEAD_SCORING);
    expect(result.SCORING.chains[1]).toMatchObject({ temperature: 0.3, purpose: 'scoring' });
    expect(result.EMAIL_WRITER.chains[1]!.prompt).toBe(autoResponsePromptForDisplay());
  });

  it('applies a saved version only to the chains its prompt fits', async () => {
    const result = await describeEffectiveChains(
      sources({
        savedVersion: async (type) =>
          type === 'SCORING' ? saved('Score this:\n{lead_info}') : null,
      })
    );

    expect(result.SCORING).toMatchObject({
      source: 'saved',
      label: 'Sharper scoring',
      savedVersionId: 'v-1',
      model: 'claude-haiku-5-5',
      modelSource: 'saved',
      temperature: 0.2,
      maxTokens: 800,
    });
    expect(result.SCORING.chains[0]).toMatchObject({
      key: 'LEAD_SCORING',
      promptSource: 'saved',
      prompt: 'Score this:\n{lead_info}',
    });
    expect(result.SCORING.chains[1]).toMatchObject({ key: 'CHURN_RISK', promptSource: 'builtin' });
    expect(result.QUALIFICATION.source).toBe('builtin');
  });

  it('uses a saved EMAIL_WRITER prompt as the auto-response custom instructions', async () => {
    const result = await describeEffectiveChains(
      sources({
        savedVersion: async (type) =>
          type === 'EMAIL_WRITER' ? saved('Always offer a demo.') : null,
      })
    );

    const [sentiment, autoResponse] = result.EMAIL_WRITER.chains;
    expect(sentiment).toMatchObject({ key: 'SENTIMENT_ANALYSIS', promptSource: 'builtin' });
    expect(autoResponse).toMatchObject({ key: 'AUTO_RESPONSE', promptSource: 'saved' });
    expect(autoResponse!.prompt).toContain('CUSTOM INSTRUCTIONS: Always offer a demo.');
  });

  it("shows the tenant's pinned model and settings for a built-in type", async () => {
    const result = await describeEffectiveChains(
      sources({
        purposeConfig: async (purpose) =>
          purpose === 'scoring'
            ? { modelId: 'claude-haiku-5-5', temperature: 0.5, maxTokens: 600 }
            : null,
      })
    );

    expect(result.SCORING).toMatchObject({
      model: 'claude-haiku-5-5',
      modelSource: 'tenant-pin',
      maxTokens: 600,
    });
    expect(result.SCORING.chains.map((row) => row.temperature)).toEqual([0.5, 0.5]);
    expect(result.FOLLOWUP.modelSource).toBe('platform-default');
  });

  it('falls back to the model recorded on the last run', async () => {
    const result = await describeEffectiveChains(
      sources({ lastRunModel: async (type) => (type === 'FOLLOWUP' ? 'nemotron-3-ultra' : null) })
    );

    expect(result.FOLLOWUP).toMatchObject({ model: 'nemotron-3-ultra', modelSource: 'last-run' });
  });
});
