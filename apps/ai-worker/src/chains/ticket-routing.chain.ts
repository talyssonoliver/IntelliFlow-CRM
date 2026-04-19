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

import { PromptTemplate } from '@langchain/core/prompts';
import { z } from 'zod';
import { aiConfig } from '../config/ai.config';
import { sanitizeStringField } from '../utils/input-sanitizer';
import { createLLM, createLLMForTenant } from '../lib/llm-factory';
import { getVersionLoader, CHAIN_TYPE_MAP } from '../versioning/chain-version-loader';
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
  private readonly model: { constructor: { name: string } };
  private structuredModel: { invoke(input: unknown): Promise<unknown> };
  private readonly prompt: PromptTemplate;
  private readonly tenantId?: string;

  constructor(options?: { tenantId?: string }) {
    this.tenantId = options?.tenantId;
    validateProviderForProduction();

    // Initialize LLM via factory — hardcoded 'gpt-4o-mini' replaced by purpose-tier routing
    const llm = createLLM('structured', 'free', {
      temperature: 0.1,
      maxTokens: 400,
      timeout: aiConfig.openai.timeout,
    });
    this.model = llm;
    this.structuredModel = (llm as any).withStructuredOutput(llmOutputSchema);

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

Respond with a structured JSON object containing inferredCategory, assigneeId, reason, confidence, and escalationRisk.`,
      inputVariables: ['subject', 'description', 'priority', 'categories', 'agentList'],
    });
  }

  /**
   * Resolve tenant-versioned prompt override (falls back to default on any error).
   */
  private async resolveVersionedPrompt(): Promise<string | null> {
    if (!this.tenantId) return null;
    try {
      const config = await getVersionLoader().getChainConfig(CHAIN_TYPE_MAP.TICKET_ROUTING, {
        tenantId: this.tenantId,
      });
      return config.prompt ?? null;
    } catch {
      logger.warn(
        {
          chainType: 'TICKET_ROUTING',
          tenantId: this.tenantId,
          reason: 'no active version, using default',
        },
        'VersionLoader: failed to load versioned config'
      );
      return null;
    }
  }

  /**
   * Route a ticket using AI classification + agent matching.
   */
  async routeTicket(input: TicketRoutingInput): Promise<TicketRoutingResult> {
    const startTime = Date.now();

    try {
      // Lazy tenant-tier resolution: if tenantId is set, re-resolve model at invoke time.
      if (this.tenantId) {
        const tenantModel = await createLLMForTenant('structured', 'free', {
          tenantId: this.tenantId,
          temperature: 0.1,
          maxTokens: 400,
          timeout: aiConfig.openai.timeout,
        });
        this.structuredModel = (tenantModel as any).withStructuredOutput(llmOutputSchema);
      }

      const agentList = input.agentCandidates
        .map(
          (a) =>
            `- ID: ${a.agentId}, Name: ${a.name}, Skills: [${a.skills.join(', ')}], Load: ${a.currentLoad}/${a.maxCapacity}, Status: ${a.status}`
        )
        .join('\n');

      // Resolve tenant-versioned prompt if tenantId is available; fall back to default
      const versionedText = await this.resolveVersionedPrompt();
      const activePrompt = versionedText
        ? new PromptTemplate({
            template: versionedText,
            inputVariables: this.prompt.inputVariables,
          })
        : this.prompt;

      // Fix #12: sanitize user-provided subject and description before prompt injection.
      const formattedPrompt = await activePrompt.format({
        subject: sanitizeStringField(input.subject, 500),
        description: input.description
          ? sanitizeStringField(input.description, 2000)
          : 'No description provided',
        priority: input.priority,
        categories: TICKET_CATEGORIES.join(', '),
        agentList,
      });

      // Use structured output model — returns typed object directly (no parse step)
      const parsed = (await this.structuredModel.invoke(formattedPrompt)) as LLMOutput;

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
        modelVersion: `${this.model.constructor.name}/${'structured-free'}`,
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
    const text =
      `${sanitizeStringField(input.subject, 500)} ${sanitizeStringField(input.description || '', 2000)}`.toLowerCase();

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
export type {
  TicketRoutingInput,
  TicketRoutingResult,
  AgentCandidate,
} from '@intelliflow/validators';
