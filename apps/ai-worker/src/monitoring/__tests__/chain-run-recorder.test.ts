import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LLMResult } from '@langchain/core/outputs';
import {
  RunUsageHandler,
  recordedChainRun,
  setChainRunWriter,
  type ChainRunRow,
} from '../chain-run-recorder';
import { configureVersionLoader } from '../../versioning/chain-version-loader';

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

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  setChainRunWriter(null);
  configureVersionLoader(undefined);
});

describe('recordedChainRun', () => {
  it('records one row per run with the summed usage and the served model', async () => {
    const rows = capture();

    const result = await recordedChainRun('TICKET_ROUTING', TENANT, async ([handler]) => {
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
      recordedChainRun('SENTIMENT_ANALYSIS', TENANT, async () => {
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

    await recordedChainRun('CHURN_RISK', TENANT, async ([handler]) => {
      (handler as RunUsageHandler).handleLLMEnd(llmEnd('nvidia/nemotron-3-ultra:free', 900, 300));
    });
    await flush();

    expect(rows[0]).toMatchObject({ model: 'nvidia/nemotron-3-ultra:free', costUsd: 0 });
  });

  it('names the saved version only when its prompt fits the chain', async () => {
    const rows = capture();
    const savedPrompt = 'Score:\n{lead_info}';
    configureVersionLoader({
      findActiveVersion: vi.fn(async () => ({
        version: {
          id: 'v-scoring',
          chainType: 'SCORING' as const,
          status: 'ACTIVE' as const,
          prompt: savedPrompt,
          model: 'm',
          temperature: 0.2,
          maxTokens: 100,
          additionalParams: null,
        },
        selectedBy: 'direct' as const,
      })),
      getActiveVersion: vi.fn(),
    });
    const { getVersionLoader } = await import('../../versioning/chain-version-loader');
    await getVersionLoader().getChainConfig('SCORING', { tenantId: TENANT });

    await recordedChainRun('LEAD_SCORING', TENANT, async () => 'ok');
    await recordedChainRun('CHURN_RISK', TENANT, async () => 'ok');
    await flush();

    expect(rows.map((row) => [row.workerChain, row.versionId])).toEqual([
      ['LEAD_SCORING', 'v-scoring'],
      ['CHURN_RISK', null],
    ]);
  });

  it('records nothing without a tenant or before a writer is set', async () => {
    const rows = capture();
    await recordedChainRun('LEAD_SCORING', undefined, async () => 'ok');
    setChainRunWriter(null);
    await recordedChainRun('LEAD_SCORING', TENANT, async () => 'ok');
    await flush();

    expect(rows).toEqual([]);
  });

  it('never lets a failed insert change the run', async () => {
    setChainRunWriter(async () => {
      throw new Error('db down');
    });

    await expect(recordedChainRun('LEAD_SCORING', TENANT, async () => 'ok')).resolves.toBe('ok');
    await flush();
  });
});
