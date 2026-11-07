/**
 * Claude through the official Anthropic SDK, as a LangChain chat model (AI_PROVIDER=anthropic).
 *
 * The chains use two things from a chat model: `invoke` and `withStructuredOutput(zodSchema)`.
 * This class provides both on top of `client.messages.create`:
 *
 * - No temperature, top_p or top_k is ever sent. Claude Haiku 5.5 and Sonnet 5.5 answer 400 to
 *   any non-default value, and API version 2026-10-21 rejects them on every model. The
 *   `temperature` the factory passes to other providers is not accepted here.
 * - Structured output uses the API's structured outputs (`output_config.format`, built by the
 *   SDK's `zodOutputFormat`), not a forced tool call: forced `tool_choice` is a 400 on
 *   Sonnet 5.5. The answer is parsed with the caller's own zod schema, so a lenient schema stays
 *   lenient (the scoring chain checks usable scores itself, #1218).
 * - A refusal, a truncated answer, a rate limit or a spend-limit error is thrown, never turned
 *   into an empty or zero result, so callers record a failure rather than a score (#1231).
 * - Each call logs its input and output tokens, and reports them to LangChain callbacks and
 *   usage metadata, for spend reporting and metering.
 *
 * The client is created on the first call, so importing a chain never needs a key.
 */
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import {
  BaseChatModel,
  type BaseChatModelCallOptions,
  type BaseChatModelParams,
} from '@langchain/core/language_models/chat_models';
import type { BaseLanguageModelInput } from '@langchain/core/language_models/base';
import { AIMessage, type BaseMessage } from '@langchain/core/messages';
import type { ChatResult } from '@langchain/core/outputs';
import { RunnableLambda, type Runnable } from '@langchain/core/runnables';
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import type { z } from 'zod';
import { createLogger } from '../utils/logger.js';
import type { AnthropicEffort } from './anthropic-config.js';

const logger = createLogger('anthropic-chat');

type OutputFormat = ReturnType<typeof zodOutputFormat>;

export interface AnthropicChatCallOptions extends BaseChatModelCallOptions {
  /** Set by withStructuredOutput: the structured-output format for this call. */
  outputFormat?: OutputFormat;
}

export interface AnthropicChatModelParams extends BaseChatModelParams {
  model: string;
  maxTokens: number;
  /** Request timeout in milliseconds. */
  timeout: number;
  effort: AnthropicEffort;
  /** SDK retries on 408/409/429/5xx and connection errors. */
  maxRetries?: number;
  /** For tests: a client double. Production builds the SDK client from ANTHROPIC_API_KEY. */
  client?: Pick<Anthropic, 'messages'>;
}

/** What a completed but unusable response cost: the shape recordModelUsage reads. */
export interface BilledUsage {
  usage_metadata: { input_tokens: number; output_tokens: number; total_tokens: number };
  response_metadata: { model_name: string; stop_reason: string | null };
}

/**
 * The model stopped without a usable answer (refusal, or cut off at max_tokens). Anthropic
 * still bills those tokens, so the error carries them as `billedResult`; the tracing wrapper
 * meters it before the error goes on, and spend limits count it like any other call.
 */
export class AnthropicIncompleteResponseError extends Error {
  readonly stopReason: string;
  readonly billedResult: BilledUsage;
  constructor(stopReason: string, billedResult: BilledUsage, detail?: string) {
    const suffix = detail ? ', ' + detail : '';
    super(`Claude returned no usable answer (stop_reason=${stopReason}${suffix})`);
    this.name = 'AnthropicIncompleteResponseError';
    this.stopReason = stopReason;
    this.billedResult = billedResult;
  }
}

/** Text of a LangChain message, from a string or from its text parts. */
function messageText(message: BaseMessage): string {
  const { content } = message;
  if (typeof content === 'string') return content;
  return content.map(partText).join('');
}

function partText(part: string | { type: string; text?: unknown }): string {
  if (typeof part === 'string') return part;
  return part.type === 'text' ? String(part.text) : '';
}

/** LangChain messages to the Messages API shape: system text apart, then user/assistant turns. */
export function toAnthropicMessages(messages: BaseMessage[]): {
  system?: string;
  messages: Anthropic.MessageParam[];
} {
  const system: string[] = [];
  const turns: Anthropic.MessageParam[] = [];
  for (const message of messages) {
    const type = message.getType();
    const text = messageText(message);
    if (type === 'system') system.push(text);
    else if (type === 'ai') turns.push({ role: 'assistant', content: text });
    else turns.push({ role: 'user', content: text });
  }
  return { ...(system.length > 0 ? { system: system.join('\n\n') } : {}), messages: turns };
}

export class AnthropicChatModel extends BaseChatModel<AnthropicChatCallOptions> {
  readonly model: string;
  readonly maxTokens: number;
  readonly timeout: number;
  readonly effort: AnthropicEffort;
  readonly maxRetries: number;
  private client: Pick<Anthropic, 'messages'> | undefined;

  constructor(params: AnthropicChatModelParams) {
    super(params);
    this.model = params.model;
    this.maxTokens = params.maxTokens;
    this.timeout = params.timeout;
    this.effort = params.effort;
    this.maxRetries = params.maxRetries ?? 1;
    this.client = params.client;
  }

  _llmType(): string {
    return 'anthropic';
  }

  private getClient(): Pick<Anthropic, 'messages'> {
    this.client ??= new Anthropic({
      apiKey: process.env['ANTHROPIC_API_KEY'],
      timeout: this.timeout,
      maxRetries: this.maxRetries,
    });
    return this.client;
  }

  async _generate(
    messages: BaseMessage[],
    options: this['ParsedCallOptions'],
    runManager?: CallbackManagerForLLMRun
  ): Promise<ChatResult> {
    const { system, messages: turns } = toAnthropicMessages(messages);
    const response = await this.getClient().messages.create(
      {
        model: this.model,
        max_tokens: this.maxTokens,
        messages: turns,
        ...(system ? { system } : {}),
        output_config: {
          effort: this.effort,
          ...(options.outputFormat ? { format: options.outputFormat } : {}),
        },
      },
      { signal: options.signal }
    );

    const usage = response.usage;
    logger.info(
      {
        provider: 'anthropic',
        model: response.model,
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        cacheReadInputTokens: usage.cache_read_input_tokens ?? 0,
        cacheCreationInputTokens: usage.cache_creation_input_tokens ?? 0,
        stopReason: response.stop_reason,
      },
      'Claude call'
    );

    const totalTokens = usage.input_tokens + usage.output_tokens;
    const billed: BilledUsage = {
      response_metadata: { model_name: response.model, stop_reason: response.stop_reason },
      usage_metadata: {
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        total_tokens: totalTokens,
      },
    };

    if (response.stop_reason === 'refusal') {
      const category = response.stop_details?.category;
      throw new AnthropicIncompleteResponseError(
        'refusal',
        billed,
        category ? `category=${category}` : undefined
      );
    }
    if (response.stop_reason === 'max_tokens') {
      throw new AnthropicIncompleteResponseError('max_tokens', billed);
    }

    // Read text blocks by type: with adaptive thinking a response can start with thinking blocks.
    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');
    await runManager?.handleLLMNewToken(text);

    const message = new AIMessage({ content: text, ...billed });
    return {
      generations: [{ text, message }],
      llmOutput: {
        tokenUsage: {
          promptTokens: usage.input_tokens,
          completionTokens: usage.output_tokens,
          totalTokens,
        },
      },
    };
  }

  /**
   * Structured output through `output_config.format`. The call goes through `this.invoke`, so
   * the tracing and metering wrappers that patch `invoke` see structured calls too.
   */
  override withStructuredOutput<
    RunOutput extends Record<string, unknown> = Record<string, unknown>,
  >(
    outputSchema: unknown,
    config?: { includeRaw?: boolean }
  ): Runnable<BaseLanguageModelInput, RunOutput> {
    if (config?.includeRaw) {
      throw new Error('AnthropicChatModel.withStructuredOutput does not support includeRaw');
    }
    const schema = outputSchema as z.ZodType<RunOutput>;
    const outputFormat = zodOutputFormat(schema as never);
    return RunnableLambda.from(async (input: BaseLanguageModelInput, runConfig) => {
      const message = await this.invoke(input, { ...runConfig, outputFormat });
      return schema.parse(JSON.parse(messageText(message))) as RunOutput;
    }) as unknown as Runnable<BaseLanguageModelInput, RunOutput>;
  }
}
