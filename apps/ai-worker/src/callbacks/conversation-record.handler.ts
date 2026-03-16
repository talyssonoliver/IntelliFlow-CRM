/**
 * ConversationRecordCallbackHandler
 *
 * LangChain callback handler that writes MessageRecord and ToolCallRecord
 * rows to the database as agents execute, so the Agent Logs page
 * (/agent-approvals/logs) shows real conversation transcripts.
 *
 * Wired into BaseAgent.invokeLLM() — every agent automatically gets
 * conversation logging without any per-agent changes.
 *
 * @module ai-worker/callbacks/conversation-record-handler
 */

import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { Serialized } from '@langchain/core/load/serializable';
import { randomUUID } from 'node:crypto';
import pino from 'pino';

const logger = pino({ name: 'conversation-record-handler', level: process.env.LOG_LEVEL || 'info' });

// Lazy Prisma import (same pattern as agent-status.ts)
let prismaPromise: Promise<any> | null = null;
async function getPrisma() {
  prismaPromise ??= import('@intelliflow/db').then((m) => m.prisma);
  return prismaPromise;
}

export interface ConversationRecordHandlerOptions {
  /** The sessionId used by agent-status.ts: `agent-status:{tenantId}:{agentType}` */
  sessionId: string;
  tenantId: string;
  /** Model name for attribution */
  model?: string;
}

/**
 * LangChain callback handler that persists LLM interactions to the DB.
 *
 * Captures:
 * - LLM start (input messages → MessageRecord with role USER/SYSTEM)
 * - LLM end (response → MessageRecord with role ASSISTANT)
 * - LLM error (error message → MessageRecord with role ASSISTANT)
 * - Tool start (→ ToolCallRecord with status RUNNING)
 * - Tool end (→ updates ToolCallRecord to SUCCESS)
 * - Tool error (→ updates ToolCallRecord to FAILED)
 */
export class ConversationRecordCallbackHandler extends BaseCallbackHandler {
  name = 'ConversationRecordCallbackHandler';

  private sessionId: string;
  private tenantId: string;
  private model: string | undefined;
  private conversationId: string | null = null;

  // Track in-flight tool calls by runId
  private toolCallIds = new Map<string, string>();

  constructor(options: ConversationRecordHandlerOptions) {
    super();
    this.sessionId = options.sessionId;
    this.tenantId = options.tenantId;
    this.model = options.model;
  }

  /**
   * Resolve the conversationRecord.id from the sessionId (lazy, cached).
   */
  private async getConversationId(): Promise<string | null> {
    if (this.conversationId) return this.conversationId;

    try {
      const prisma = await getPrisma();
      const record = await prisma.conversationRecord.findUnique({
        where: { sessionId: this.sessionId },
        select: { id: true },
      });
      this.conversationId = record?.id ?? null;
      return this.conversationId;
    } catch {
      return null;
    }
  }

  private async addMessage(role: string, content: string): Promise<void> {
    try {
      const conversationId = await this.getConversationId();
      if (!conversationId) return;

      const prisma = await getPrisma();
      await prisma.messageRecord.create({
        data: {
          id: randomUUID(),
          conversationId,
          tenantId: this.tenantId,
          role,
          content: content.slice(0, 10_000), // cap at 10k chars
          contentType: 'text',
          modelUsed: this.model ?? null,
        },
      });
      await prisma.conversationRecord.update({
        where: { id: conversationId },
        data: { messageCount: { increment: 1 }, lastMessageAt: new Date() },
      });
    } catch (error) {
      logger.debug({ error: String(error) }, 'Failed to write message record');
    }
  }

  // ---------------------------------------------------------------------------
  // LLM callbacks
  // ---------------------------------------------------------------------------

  async handleLLMStart(
    _llm: Serialized,
    prompts: string[],
    _runId: string
  ): Promise<void> {
    const content = prompts.join('\n---\n').slice(0, 5000);
    if (content) {
      await this.addMessage('USER', content);
    }
  }

  async handleLLMEnd(
    output: { generations: Array<Array<{ text: string }>> },
    _runId: string
  ): Promise<void> {
    const text = output.generations?.[0]?.[0]?.text;
    if (text) {
      await this.addMessage('ASSISTANT', text);
    }
  }

  async handleLLMError(error: Error, _runId: string): Promise<void> {
    await this.addMessage('ASSISTANT', `[LLM Error] ${error.message}`);
  }

  // ---------------------------------------------------------------------------
  // Tool callbacks
  // ---------------------------------------------------------------------------

  async handleToolStart(
    _tool: Serialized,
    input: string,
    runId: string
  ): Promise<void> {
    try {
      const conversationId = await this.getConversationId();
      if (!conversationId) return;

      const toolName = (_tool as any)?.id?.[_tool.id?.length - 1] ?? 'unknown_tool';
      const toolCallId = randomUUID();
      this.toolCallIds.set(runId, toolCallId);

      const prisma = await getPrisma();
      await prisma.toolCallRecord.create({
        data: {
          id: toolCallId,
          conversationId,
          tenantId: this.tenantId,
          toolName,
          toolInput: this.safeJson(input),
          toolOutput: null,
          status: 'RUNNING',
          startedAt: new Date(),
        },
      });
      await prisma.conversationRecord.update({
        where: { id: conversationId },
        data: { toolCallCount: { increment: 1 } },
      });
    } catch (error) {
      logger.debug({ error: String(error) }, 'Failed to record tool start');
    }
  }

  async handleToolEnd(output: string, runId: string): Promise<void> {
    const toolCallId = this.toolCallIds.get(runId);
    if (!toolCallId) return;
    this.toolCallIds.delete(runId);

    try {
      const prisma = await getPrisma();
      await prisma.toolCallRecord.update({
        where: { id: toolCallId },
        data: {
          toolOutput: this.safeJson(output),
          status: 'SUCCESS',
          completedAt: new Date(),
        },
      });
    } catch (error) {
      logger.debug({ error: String(error) }, 'Failed to record tool end');
    }
  }

  async handleToolError(error: Error, runId: string): Promise<void> {
    const toolCallId = this.toolCallIds.get(runId);
    if (!toolCallId) return;
    this.toolCallIds.delete(runId);

    try {
      const prisma = await getPrisma();
      await prisma.toolCallRecord.update({
        where: { id: toolCallId },
        data: {
          toolOutput: { error: error.message },
          status: 'FAILED',
          completedAt: new Date(),
        },
      });
    } catch (error2) {
      logger.debug({ error: String(error2) }, 'Failed to record tool error');
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private safeJson(value: unknown): unknown {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return { raw: value.slice(0, 5000) };
      }
    }
    return value ?? null;
  }
}
