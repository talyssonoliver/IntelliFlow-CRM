/**
 * Records each run of a versioned ai-worker chain in chain_runs, for the AI Chains page usage
 * stats (chainVersion.getUsageStats).
 *
 * A run is one call of the chain: from the model invocation to its result or failure, with every
 * model call it made (a provider fallback, a raw retry) summed into it. The row says which saved
 * version's prompt was used, or null for the built-in prompt, with the same rule the chain
 * applies (savedPromptFitsChain).
 *
 * Recording never changes a run: it does not throw, and a failed insert is logged and dropped.
 * Until the worker wires a writer at startup (setChainRunWriter), nothing is recorded.
 */

import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { LLMResult } from '@langchain/core/outputs';
import pino from 'pino';
import {
  BUILTIN_CHAINS,
  savedPromptFitsChain,
  type WorkerChainKey,
} from '@intelliflow/application';
import { calculateCost, resolvePricingKey } from '../config/ai.config.js';
import { getVersionLoader } from '../versioning/chain-version-loader.js';

const logger = pino({ name: 'chain-run-recorder', level: process.env.LOG_LEVEL || 'info' });

export interface ChainRunRow {
  tenantId: string;
  chainType: string;
  workerChain: WorkerChainKey;
  versionId: string | null;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  success: boolean;
  errorClass: string | null;
}

export type ChainRunWriter = (row: ChainRunRow) => Promise<void>;

let writer: ChainRunWriter | null = null;

/** Where runs are written; null stops recording. Set once at worker startup. */
export function setChainRunWriter(next: ChainRunWriter | null): void {
  writer = next;
}

/** A writer that inserts into chain_runs through the worker's Prisma client. */
export function chainRunWriterFromPrisma(prisma: {
  chainRun: { create(args: { data: ChainRunRow }): Promise<unknown> };
}): ChainRunWriter {
  return async (row) => {
    await prisma.chainRun.create({ data: row });
  };
}

/** Sums token usage over every model call of one run and keeps the model that served it. */
export class RunUsageHandler extends BaseCallbackHandler {
  name = 'RunUsageHandler';
  inputTokens = 0;
  outputTokens = 0;
  model: string | null = null;
  private invokedModel: string | null = null;

  handleChatModelStart(
    _llm: unknown,
    _messages: unknown,
    _runId: string,
    _parentRunId?: string,
    extraParams?: Record<string, unknown>
  ): void {
    const params = extraParams?.['invocation_params'] as { model?: unknown } | undefined;
    if (typeof params?.model === 'string') this.invokedModel = params.model;
  }

  handleLLMEnd(output: LLMResult): void {
    type Counts = { promptTokens?: number; completionTokens?: number };
    const usage =
      (output.llmOutput?.tokenUsage as Counts | undefined) ??
      (output.llmOutput?.estimatedTokenUsage as Counts | undefined);
    const generation = output.generations?.[0]?.[0] as
      | {
          message?: {
            response_metadata?: { model_name?: unknown };
            usage_metadata?: { input_tokens?: number; output_tokens?: number };
          };
        }
      | undefined;
    const meta = generation?.message?.usage_metadata;
    this.inputTokens += usage?.promptTokens ?? meta?.input_tokens ?? 0;
    this.outputTokens += usage?.completionTokens ?? meta?.output_tokens ?? 0;
    const served = generation?.message?.response_metadata?.model_name;
    this.model = typeof served === 'string' ? served : this.invokedModel;
  }
}

/** The saved version whose prompt this chain used for the tenant, or null (built-in). */
function usedVersionId(key: WorkerChainKey, tenantId: string): string | null {
  const chain = BUILTIN_CHAINS[key];
  const loaded = getVersionLoader().peekLoaded(chain.chainType, tenantId);
  if (!loaded || loaded.versionId.startsWith('fallback-')) return null;
  return savedPromptFitsChain(chain, loaded.config.prompt) ? loaded.versionId : null;
}

/**
 * Price the served model by its own pricing key (a dated snapshot or an OpenRouter id maps to its
 * deployment, as in the scoring chain). Free variants cost nothing, and a model with no price here
 * (a local Ollama model, an unknown deployment) is recorded at 0 rather than at another model's
 * rates.
 */
function costOf(model: string | null, inputTokens: number, outputTokens: number): number {
  if (!model || model.trim().toLowerCase().endsWith(':free')) return 0;
  const key = resolvePricingKey(model);
  if (!key) return 0;
  try {
    return calculateCost(key, inputTokens, outputTokens);
  } catch {
    return 0;
  }
}

async function write(row: ChainRunRow): Promise<void> {
  if (!writer) return;
  try {
    await writer(row);
  } catch (error) {
    logger.warn(
      { workerChain: row.workerChain, errorClass: error instanceof Error ? error.name : 'Unknown' },
      'Chain run not recorded'
    );
  }
}

/**
 * Run one chain call and record it. `run` receives the callbacks to pass to its model calls.
 * The result or error of `run` is returned or rethrown unchanged.
 */
export async function recordedChainRun<T>(
  key: WorkerChainKey,
  tenantId: string | undefined,
  run: (callbacks: BaseCallbackHandler[]) => Promise<T>
): Promise<T> {
  if (!tenantId || !writer) return run([]);
  const usage = new RunUsageHandler();
  const started = Date.now();
  // Read before the model call: the chain has just built its prompt from the loaded version, and a
  // cache entry that expires or is reloaded during the call must not change the attribution.
  const versionId = usedVersionId(key, tenantId);
  const finish = (success: boolean, error?: unknown): Promise<void> =>
    write({
      tenantId,
      chainType: BUILTIN_CHAINS[key].chainType,
      workerChain: key,
      versionId,
      model: usage.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costUsd: costOf(usage.model, usage.inputTokens, usage.outputTokens),
      latencyMs: Date.now() - started,
      success,
      errorClass: success ? null : (error instanceof Error ? error.name : 'Unknown').slice(0, 60),
    });
  try {
    const result = await run([usage]);
    // Fire and forget: the run's result never waits on, or fails with, the insert.
    finish(true).catch(() => undefined);
    return result;
  } catch (error) {
    finish(false, error).catch(() => undefined);
    throw error;
  }
}
