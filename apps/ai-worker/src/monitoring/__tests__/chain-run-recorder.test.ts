import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LLMResult } from '@langchain/core/outputs';
import {
  RunUsageHandler,
  recordedChainRun,
  setChainRunWriter,
  type ChainRunRow,
} from '../chain-run-recorder';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { AIMessage, type BaseMessage } from '@langchain/core/messages';
import type { ChatResult } from '@langchain/core/outputs';
import { configureVersionLoader, loadVersionedPrompt } from '../../versioning/chain-version-loader';
import { calculateCost, resolvePricingKey } from '../../config/ai.config';

const TENANT = '11111111-1111-4111-8111-111111111111';

/** A model call's end event, as LangChain reports it. */
function llmEnd(model: string, input: number, output: number): LLMResult {
  return {
    generations: [[{ text: '', message: { response_metadata: { model_name: model } } } as never]],
    llmOutput: { tokenUsage: { promptTokens: input, completionTokens: output } },
  };
}

function capture() {
  const rows: ChainRunRow[] = [];
  setChainRunWriter(async (row) => {
    rows.push(row);
  });
  return rows;
}

/** A chat model that reports its served model and token usage the way providers do. */
class UsageReportingModel extends BaseChatModel {
  _llmType(): string {
    return 'usage-reporting-fake';
  }

  async _generate(_messages: BaseMessage[]): Promise<ChatResult> {
    const message = new AIMessage({
      content: 'routed',
      response_metadata: { model_name: 'anthropic/claude-haiku-5-5' },
      usage_metadata: { input_tokens: 120, output_tokens: 30, total_tokens: 150 },
    });
    return { generations: [{ text: 'routed', message }] };
  }
}

function savedScoringVersion() {
  configureVersionLoader({
    findActiveVersion: vi.fn(async () => ({
      version: {
        id: 'v-scoring',
        chainType: 'SCORING' as const,
        status: 'ACTIVE' as const,
        prompt: 'Score:\n{lead_info}',
        model: 'm',
        temperature: 0.2,
        maxTokens: 100,
        additionalParams: null,
      },
      selectedBy: 'direct' as const,
    })),
    getActiveVersion: vi.fn(),
  });
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  setChainRunWriter(null);
  configureVersionLoader(undefined);
});

describe('recordedChainRun', () => {
  it('records one row per run with the summed usage and the served model', async () => {
    const rows = capture();

    const result = await recordedChainRun('TICKET_ROUTING', TENANT, null, async ([handler]) => {
      (handler as RunUsageHandler).handleLLMEnd(llmEnd('anthropic/claude-haiku-5-5', 100, 20));
      (handler as RunUsageHandler).handleLLMEnd(llmEnd('anthropic/claude-haiku-5-5', 50, 10));
      return 'routed';
    });
    await flush();

    expect(result).toBe('routed');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tenantId: TENANT,
      chainType: 'FOLLOWUP',
      workerChain: 'TICKET_ROUTING',
      versionId: null,
      model: 'anthropic/claude-haiku-5-5',
      inputTokens: 150,
      outputTokens: 30,
      success: true,
      errorClass: null,
    });
    expect(rows[0]!.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('records a failed run and rethrows the same error', async () => {
    const rows = capture();
    const failure = new TypeError('provider down');

    await expect(
      recordedChainRun('SENTIMENT_ANALYSIS', TENANT, null, async () => {
        throw failure;
      })
    ).rejects.toBe(failure);
    await flush();

    expect(rows[0]).toMatchObject({
      chainType: 'EMAIL_WRITER',
      workerChain: 'SENTIMENT_ANALYSIS',
      success: false,
      errorClass: 'TypeError',
    });
  });

  it('prices free models at zero', async () => {
    const rows = capture();

    await recordedChainRun('CHURN_RISK', TENANT, null, async ([handler]) => {
      (handler as RunUsageHandler).handleLLMEnd(llmEnd('nvidia/nemotron-3-ultra:free', 900, 300));
    });
    await flush();

    expect(rows[0]).toMatchObject({ model: 'nvidia/nemotron-3-ultra:free', costUsd: 0 });
  });

  it('prices the served model by its own key, never at another model’s rates', async () => {
    const rows = capture();
    const run = (model: string) =>
      recordedChainRun('CHURN_RISK', TENANT, null, async ([handler]) => {
        (handler as RunUsageHandler).handleLLMEnd(llmEnd(model, 1000, 1000));
      });

    await run('anthropic/claude-haiku-5-5'); // vendor-prefixed MODEL_PRICING key
    await run('gpt-4o-mini-2024-07-18'); // dated snapshot of a known deployment
    await run('llama2'); // local Ollama model: no price here
    await flush();

    expect(rows.map((row) => row.costUsd)).toEqual([
      calculateCost('claude-haiku-5-5', 1000, 1000),
      calculateCost(resolvePricingKey('gpt-4o-mini-2024-07-18')!, 1000, 1000),
      0,
    ]);
    expect(resolvePricingKey('gpt-4o-mini-2024-07-18')).toBeDefined();
    expect(rows[0]!.costUsd).toBeGreaterThan(0);
    expect(rows[1]!.costUsd).not.toBe(calculateCost('gpt-3.5-turbo', 1000, 1000));
  });

  it('records the version the chain read when it chose its prompt, whatever the cache does later', async () => {
    const rows = capture();
    savedScoringVersion();
    const chosen = await loadVersionedPrompt('SCORING', TENANT);
    expect(chosen).toEqual({ prompt: 'Score:\n{lead_info}', versionId: 'v-scoring' });

    await recordedChainRun('LEAD_SCORING', TENANT, chosen.versionId, async () => {
      // The cache entry expires or is replaced while the model call runs.
      configureVersionLoader(undefined);
      return 'ok';
    });

    expect(rows[0]).toMatchObject({ workerChain: 'LEAD_SCORING', versionId: 'v-scoring' });
  });

  it('reads no version id from the built-in fallback', async () => {
    await expect(loadVersionedPrompt('SCORING', TENANT)).resolves.toMatchObject({
      versionId: null,
    });
  });

  it('has the model and token counts in the row as soon as a real model call resolves', async () => {
    const rows = capture();
    const model = new UsageReportingModel({});

    await recordedChainRun('TICKET_ROUTING', TENANT, null, (callbacks) =>
      model.invoke('route this', { callbacks })
    );

    // No flush: LangChain must have run the handler inline, before the row was built.
    expect(new RunUsageHandler().awaitHandlers).toBe(true);
    expect(rows[0]).toMatchObject({
      model: 'anthropic/claude-haiku-5-5',
      inputTokens: 120,
      outputTokens: 30,
    });
    expect(rows[0]!.costUsd).toBe(calculateCost('claude-haiku-5-5', 120, 30));
  });

  it('records nothing without a tenant or before a writer is set', async () => {
    const rows = capture();
    await recordedChainRun('LEAD_SCORING', undefined, null, async () => 'ok');
    setChainRunWriter(null);
    await recordedChainRun('LEAD_SCORING', TENANT, null, async () => 'ok');
    await flush();

    expect(rows).toEqual([]);
  });

  it('never lets a failed insert change the run', async () => {
    setChainRunWriter(async () => {
      throw new Error('db down');
    });

    await expect(recordedChainRun('LEAD_SCORING', TENANT, null, async () => 'ok')).resolves.toBe(
      'ok'
    );
    await flush();
  });
});
