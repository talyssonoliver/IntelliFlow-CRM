/**
 * Ticket Routing Chain (IFC-067)
 *
 * AI-powered ticket classification and agent assignment.
 * Classifies tickets into TICKET_CATEGORIES and selects the optimal agent
 * based on skills, load, and availability.
 *
 * Features:
 * - Category classification via LLM (gpt-4o-mini)
 * - Agent skill matching against TICKET_CATEGORY_SKILL_MAP
 * - Fallback heuristic when LLM unavailable
 * - Post-parse validation (hallucination guard)
 * - Production guard to prevent mock provider usage
 *
 * @module chains/ticket-routing
 */

import { ChatOpenAI } from '@langchain/openai';
import { ChatOllama } from '@langchain/ollama';
import { PromptTemplate } from '@langchain/core/prompts';
import { StructuredOutputParser } from '@langchain/core/output_parsers';
import type { BaseMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { aiConfig } from '../config/ai.config';
import { costTracker } from '../utils/cost-tracker';
import { getOpenAIClientSettings } from '../utils/openai-client';
import { sanitizeStringField } from '../utils/input-sanitizer';
import pino from 'pino';

import {
  TICKET_CATEGORIES,
  TICKET_CATEGORY_SKILL_MAP,
  type TicketCategory,
} from '@intelliflow/domain';

import {
  type TicketRoutingInput,
  type TicketRoutingResult,
  type AgentCandidate,
} from '@intelliflow/validators';

/**
 * Interface for LLM model invocation
 */
interface LLMModel {
  invoke(input: BaseMessage[] | string): Promise<{ content: string | unknown[] }>;
}

const logger = pino({
  name: 'ticket-routing-chain',
  level: process.env.LOG_LEVEL || 'info',
});

// =============================================================================
// Production Guard (IFC-067)
// =============================================================================

function validateProviderForProduction(): void {
  const isProduction = process.env.NODE_ENV === 'production';
  const isMockProvider = aiConfig.provider === 'mock';

  if (isProduction && isMockProvider) {
    throw new Error(
      'SECURITY: Mock AI provider cannot be used in production environment. ' +
        'Configure AI_PROVIDER to use "openai" or "ollama" for production workloads.'
    );
  }
}

// =============================================================================
// LLM Output Schema (internal — parsed then mapped to TicketRoutingResult)
// =============================================================================

const llmOutputSchema = z.object({
  inferredCategory: z.enum(TICKET_CATEGORIES),
  assigneeId: z.string(),
  reason: z.string(),
  confidence: z.number().min(0).max(1),
  escalationRisk: z.enum(['low', 'medium', 'high']),
});

type LLMOutput = z.infer<typeof llmOutputSchema>;

// =============================================================================
// Keyword Mapping for Fallback Heuristic
// =============================================================================

const CATEGORY_KEYWORDS: Record<TicketCategory, string[]> = {
  BILLING: ['invoice', 'charge', 'refund', 'subscription', 'payment', 'billing', 'price', 'cost'],
  TECHNICAL: [
    'crash',
    'error',
    'bug',
    'performance',
    'slow',
    'broken',
    'auth',
    'login',
    'password',
    'api',
  ],
  SALES: ['pricing', 'demo', 'upgrade', 'plan', 'enterprise', 'discount', 'quote'],
  GENERAL: ['question', 'feedback', 'how-to', 'help', 'info', 'general'],
  FEATURE_REQUEST: ['wish', 'want', 'improve', 'feature', 'request', 'suggest', 'enhancement'],
  BUG_REPORT: ['broken', 'not working', 'regression', 'defect', 'issue', 'fail'],
};

// =============================================================================
// Ticket Routing Chain
// =============================================================================

export class TicketRoutingChain {
  private readonly model: LLMModel;
  private readonly parser: StructuredOutputParser<typeof llmOutputSchema>;
  private readonly prompt: PromptTemplate;

  constructor() {
    validateProviderForProduction();

    if (aiConfig.provider === 'openai') {
      const openAIClientSettings = getOpenAIClientSettings();
      this.model = new ChatOpenAI({
        modelName: 'gpt-4o-mini',
        temperature: 0.1,
        maxTokens: 400,
        timeout: aiConfig.openai.timeout,
        apiKey: openAIClientSettings.apiKey,
        configuration: openAIClientSettings.configuration,
        callbacks: aiConfig.features.enableChainLogging
          ? [
              {
                handleLLMEnd: async (output) => {
                  const usage = output.llmOutput?.tokenUsage;
                  if (usage && aiConfig.costTracking.enabled) {
                    costTracker.recordUsage({
                      model: 'gpt-4o-mini',
                      inputTokens: usage.promptTokens || 0,
                      outputTokens: usage.completionTokens || 0,
                      operationType: 'ticket_routing',
                    });
                  }
                },
              },
            ]
          : undefined,
      });
    } else if (aiConfig.provider === 'ollama') {
      this.model = new ChatOllama({
        baseUrl: aiConfig.ollama.baseUrl,
        model: aiConfig.ollama.model,
        temperature: 0.1,
      });

      logger.info(
        {
          baseUrl: aiConfig.ollama.baseUrl,
          model: aiConfig.ollama.model,
        },
        'Initialized Ollama provider for ticket routing'
      );
    } else if (aiConfig.provider === 'mock') {
      this.model = {
        invoke: async () => ({ content: this.getMockResponse() }),
      };
    } else {
      throw new Error(`Unsupported AI provider: ${aiConfig.provider}`);
    }

    this.parser = StructuredOutputParser.fromZodSchema(llmOutputSchema);

    this.prompt = new PromptTemplate({
      template: `You are a ticket routing specialist for a CRM system.
Classify the support ticket into one of these categories: {categories}

TICKET:
Subject: {subject}
Description: {description}
Priority: {priority}

AVAILABLE AGENTS:
{agentList}

INSTRUCTIONS:
1. Classify the ticket into the most appropriate category.
2. Select the best agent based on their skills and current load.
3. Provide a confidence score (0-1) for your classification.
4. Assess escalation risk (low/medium/high).
5. Explain your reasoning briefly.

IMPORTANT: The assigneeId MUST be one of the agent IDs listed above.

{formatInstructions}`,
      inputVariables: ['subject', 'description', 'priority', 'categories', 'agentList'],
      partialVariables: {
        formatInstructions: this.parser.getFormatInstructions(),
      },
    });
  }

  /**
   * Route a ticket using AI classification + agent matching.
   */
  async routeTicket(input: TicketRoutingInput): Promise<TicketRoutingResult> {
    const startTime = Date.now();

    try {
      const agentList = input.agentCandidates
        .map(
          (a) =>
            `- ID: ${a.agentId}, Name: ${a.name}, Skills: [${a.skills.join(', ')}], Load: ${a.currentLoad}/${a.maxCapacity}, Status: ${a.status}`
        )
        .join('\n');

      // Fix #12: sanitize user-provided subject and description before prompt injection.
      const formattedPrompt = await this.prompt.format({
        subject: sanitizeStringField(input.subject, 500),
        description: input.description
          ? sanitizeStringField(input.description, 2000)
          : 'No description provided',
        priority: input.priority,
        categories: TICKET_CATEGORIES.join(', '),
        agentList,
      });

      const response = await this.model.invoke(formattedPrompt);
      const content =
        typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

      const parsed: LLMOutput = await this.parser.parse(content);

      // Post-parse validation: ensure assigneeId is in the candidate roster
      const validCandidate = input.agentCandidates.find((a) => a.agentId === parsed.assigneeId);

      if (!validCandidate) {
        logger.warn(
          {
            llmAssigneeId: parsed.assigneeId,
            candidates: input.agentCandidates.map((a) => a.agentId),
          },
          'LLM returned unrecognised assigneeId — triggering fallback'
        );
        return this.generateFallbackResult(input, Date.now() - startTime);
      }

      const executionTimeMs = Date.now() - startTime;

      return {
        inferredCategory: parsed.inferredCategory,
        assigneeId: parsed.assigneeId,
        assigneeName: validCandidate.name,
        reason: parsed.reason,
        matchedSkills: validCandidate.skills.filter(
          (s) => s === TICKET_CATEGORY_SKILL_MAP[parsed.inferredCategory]
        ),
        confidence: parsed.confidence,
        escalationRisk: parsed.escalationRisk,
        routingMethod: 'skill_match',
        executionTimeMs,
        modelVersion: aiConfig.provider === 'openai' ? 'gpt-4o-mini' : aiConfig.provider,
        isFallback: false,
      };
    } catch (error) {
      logger.error({ error, ticketId: input.ticketId }, 'LLM routing failed — using fallback');
      return this.generateFallbackResult(input, Date.now() - startTime);
    }
  }

  /**
   * Fallback heuristic when LLM is unavailable.
   * Uses keyword matching for category + lowest-load agent selection.
   */
  generateFallbackResult(input: TicketRoutingInput, executionTimeMs: number): TicketRoutingResult {
    // Fix #12: sanitize before keyword matching to prevent control-char injection
    const text = `${sanitizeStringField(input.subject, 500)} ${sanitizeStringField(input.description || '', 2000)}`.toLowerCase();

    // Keyword-based category inference
    let inferredCategory: TicketCategory = 'GENERAL';
    let bestScore = 0;

    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      const score = keywords.filter((kw) => text.includes(kw)).length;
      if (score > bestScore) {
        bestScore = score;
        inferredCategory = category as TicketCategory;
      }
    }

    // Select lowest-load ONLINE agent
    const eligible = input.agentCandidates
      .filter((a) => a.status === 'ONLINE' || a.status === 'BUSY')
      .filter((a) => a.currentLoad < a.maxCapacity)
      .sort((a, b) => a.currentLoad / a.maxCapacity - b.currentLoad / b.maxCapacity);

    const selectedAgent: AgentCandidate = eligible[0] || input.agentCandidates[0];

    return {
      inferredCategory,
      assigneeId: selectedAgent.agentId,
      assigneeName: selectedAgent.name,
      reason: `Fallback heuristic: keyword match for ${inferredCategory}`,
      matchedSkills: selectedAgent.skills.filter(
        (s) => s === TICKET_CATEGORY_SKILL_MAP[inferredCategory]
      ),
      confidence: 0.3,
      escalationRisk: input.priority === 'CRITICAL' ? 'high' : 'low',
      routingMethod: 'load_balance',
      executionTimeMs,
      modelVersion: 'fallback:heuristic:v1',
      isFallback: true,
    };
  }

  /**
   * Deterministic mock response for testing.
   */
  private getMockResponse(): string {
    return JSON.stringify({
      inferredCategory: 'TECHNICAL',
      assigneeId: 'agent-1',
      reason: 'Mock routing: technical issue detected',
      confidence: 0.92,
      escalationRisk: 'low',
    });
  }
}

// =============================================================================
// Singleton Export
// =============================================================================

let _ticketRoutingChain: TicketRoutingChain | null = null;

export function getTicketRoutingChain(): TicketRoutingChain {
  _ticketRoutingChain ??= new TicketRoutingChain();
  return _ticketRoutingChain;
}

function createLazyTicketRoutingProxy(): TicketRoutingChain {
  return new Proxy({} as TicketRoutingChain, {
    get(_target, prop) {
      const chain = getTicketRoutingChain();
      const key = prop as keyof TicketRoutingChain;
      const value = chain[key];
      return typeof value === 'function' ? value.bind(chain) : value;
    },
  });
}

export const ticketRoutingChain = createLazyTicketRoutingProxy();

// Re-export types and schemas for convenience
export { ticketRoutingInputSchema, ticketRoutingResultSchema } from '@intelliflow/validators';
export type { TicketRoutingInput, TicketRoutingResult, AgentCandidate } from '@intelliflow/validators';
