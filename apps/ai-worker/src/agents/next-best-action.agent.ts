/**
 * Next Best Action Agent (IFC-039)
 *
 * AI agent that recommends the optimal next action for leads and opportunities.
 * Uses RAG context, sentiment analysis, and historical data to generate
 * personalized, actionable recommendations.
 *
 * Features:
 * - Multi-factor scoring for action prioritization
 * - RAG-enhanced context retrieval
 * - Sentiment-aware recommendations
 * - Success probability estimation
 * - Human-readable reasoning
 *
 * @module agents/next-best-action
 */

import { z } from 'zod';
import { BaseAgent, AgentTask, AgentResult } from './base.agent';
import { RAGContextChain, ragContextChain } from '../chains/rag-context.chain';
import { SentimentAnalysisChain, getSentimentChain } from '../chains/sentiment.chain';
import pino from 'pino';

// Import domain constants (DRY architecture compliance)
import {
  NBA_ACTION_TYPES,
  NBA_ACTION_PRIORITIES,
  type NBAActionType,
  type NBAActionPriority,
} from '@intelliflow/domain';

// Re-export with original names for backward compatibility
export const ACTION_TYPES = NBA_ACTION_TYPES;
export const ACTION_PRIORITIES = NBA_ACTION_PRIORITIES;
export type ActionType = NBAActionType;
export type ActionPriority = NBAActionPriority;

const logger = pino({
  name: 'next-best-action-agent',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Lead/Opportunity context for NBA
 */
export const nbaContextSchema = z.object({
  entityType: z.enum(['lead', 'opportunity', 'contact']),
  entityId: z.string().uuid(),
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),

  // Entity data
  name: z.string().optional(),
  email: z.string().email().optional(),
  company: z.string().optional(),
  title: z.string().optional(),
  score: z.number().min(0).max(100).optional(),
  stage: z.string().optional(),
  value: z.number().optional(),

  // Historical context
  lastContactDate: z.string().datetime().optional(),
  totalInteractions: z.number().optional(),
  daysSinceLastContact: z.number().optional(),

  // Recent communications
  recentMessages: z.array(z.object({
    content: z.string(),
    direction: z.enum(['inbound', 'outbound']),
    timestamp: z.string().datetime(),
    channel: z.enum(['email', 'call', 'meeting', 'chat', 'other']),
  })).optional(),

  // Optional overrides
  urgencyOverride: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional(),
  excludeActions: z.array(z.enum(ACTION_TYPES)).optional(),
});

export type NBAContext = z.infer<typeof nbaContextSchema>;

/**
 * Recommended action schema
 */
export const recommendedActionSchema = z.object({
  action: z.enum(ACTION_TYPES),
  priority: z.enum(ACTION_PRIORITIES),
  successProbability: z.number().min(0).max(1),

  // Description
  title: z.string(),
  description: z.string(),
  reasoning: z.string(),

  // Timing
  suggestedTiming: z.string(),
  deadline: z.string().datetime().optional(),

  // Template/content suggestions
  contentSuggestion: z.string().optional(),
  templateId: z.string().optional(),

  // Related data
  relatedLeads: z.array(z.object({
    id: z.string(),
    name: z.string(),
    outcome: z.enum(['WON', 'LOST', 'PENDING']),
    similarity: z.number().min(0).max(1),
  })).optional(),

  // Confidence
  confidence: z.number().min(0).max(1),
});

export type RecommendedAction = z.infer<typeof recommendedActionSchema>;

/**
 * NBA result schema
 */
export const nbaResultSchema = z.object({
  recommendations: z.array(recommendedActionSchema),
  entitySummary: z.string(),
  sentimentAnalysis: z.object({
    sentiment: z.string(),
    urgency: z.string(),
    primaryEmotion: z.string(),
  }).optional(),
  ragContextUsed: z.boolean(),
  executionTimeMs: z.number(),
  modelVersion: z.string(),
});

export type NBAResult = z.infer<typeof nbaResultSchema>;

// =============================================================================
// Next Best Action Agent
// =============================================================================

/**
 * Next Best Action Agent Configuration
 */
const NBA_AGENT_CONFIG = {
  name: 'NextBestActionAgent',
  role: 'Sales Action Advisor',
  goal: 'Recommend the most effective next action to advance leads and opportunities',
  backstory: `You are an expert sales advisor with deep experience in B2B sales cycles.
You analyze customer context, sentiment, and historical patterns to recommend
the single most impactful action a sales rep should take next. Your recommendations
are data-driven, time-sensitive, and include clear reasoning.`,
  maxIterations: 3,
  allowDelegation: false,
  verbose: true,
};

/**
 * Next Best Action Agent
 *
 * Generates personalized, context-aware action recommendations for sales teams.
 */
export class NextBestActionAgent extends BaseAgent<NBAContext, NBAResult> {
  private ragChain: RAGContextChain;
  private sentimentChain: SentimentAnalysisChain | null = null;

  constructor(
    customRagChain?: RAGContextChain,
    customSentimentChain?: SentimentAnalysisChain
  ) {
    super(NBA_AGENT_CONFIG);
    this.ragChain = customRagChain || ragContextChain;
    if (customSentimentChain) {
      this.sentimentChain = customSentimentChain;
    }

    logger.info('Next Best Action Agent initialized');
  }

  /**
   * Execute the NBA task
   */
  protected async executeTask(task: AgentTask<NBAContext, NBAResult>): Promise<NBAResult> {
    const startTime = Date.now();
    const context = task.input;

    logger.info(
      {
        entityType: context.entityType,
        entityId: context.entityId,
      },
      'Generating next best action recommendations'
    );

    // Step 1: Retrieve relevant context via RAG
    let ragContextUsed = false;
    let ragContent = '';

    try {
      const ragResult = await this.ragChain.retrieveContext({
        query: this.buildContextQuery(context),
        tenantId: context.tenantId,
        userId: context.userId,
        userRoles: [],
        sources: ['documents', 'notes', 'conversations'],
        maxResults: 3,
        minRelevance: 0.7,
        contextWindow: '7d',
        searchType: 'hybrid',
      });

      if (ragResult.success && ragResult.context.length > 0) {
        ragContextUsed = true;
        ragContent = this.ragChain.formatContextForPrompt(ragResult.context);
      }
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'RAG context retrieval failed, proceeding without'
      );
    }

    // Step 2: Analyze sentiment from recent messages
    let sentimentAnalysis: NBAResult['sentimentAnalysis'] | undefined;

    if (context.recentMessages && context.recentMessages.length > 0) {
      try {
        if (!this.sentimentChain) {
          this.sentimentChain = getSentimentChain();
        }

        const latestMessage = context.recentMessages[0];
        const sentimentResult = await this.sentimentChain.analyze({
          text: latestMessage.content,
          source: latestMessage.channel === 'email' ? 'email' :
                  latestMessage.channel === 'chat' ? 'chat' : 'other',
        });

        sentimentAnalysis = {
          sentiment: sentimentResult.sentiment,
          urgency: sentimentResult.urgency,
          primaryEmotion: sentimentResult.primaryEmotion,
        };
      } catch (error) {
        logger.warn(
          { error: error instanceof Error ? error.message : String(error) },
          'Sentiment analysis failed, proceeding without'
        );
      }
    }

    // Step 3: Generate recommendations using LLM
    const recommendations = await this.generateRecommendations(
      context,
      ragContent,
      sentimentAnalysis
    );

    // Step 4: Build entity summary
    const entitySummary = this.buildEntitySummary(context);

    const result: NBAResult = {
      recommendations,
      entitySummary,
      sentimentAnalysis,
      ragContextUsed,
      executionTimeMs: Date.now() - startTime,
      modelVersion: 'nba-agent:v1',
    };

    logger.info(
      {
        recommendationCount: recommendations.length,
        topAction: recommendations[0]?.action,
        topPriority: recommendations[0]?.priority,
        executionTimeMs: result.executionTimeMs,
      },
      'NBA recommendations generated'
    );

    return result;
  }

  /**
   * Build a query string for RAG context retrieval
   */
  private buildContextQuery(context: NBAContext): string {
    const parts = [];

    if (context.company) {
      parts.push(`company ${context.company}`);
    }
    if (context.stage) {
      parts.push(`sales stage ${context.stage}`);
    }
    if (context.entityType === 'opportunity') {
      parts.push('deal closing strategies');
    } else if (context.entityType === 'lead') {
      parts.push('lead qualification next steps');
    }

    return parts.join(' ') || 'sales best practices next action';
  }

  /**
   * Generate action recommendations
   */
  private async generateRecommendations(
    context: NBAContext,
    ragContent: string,
    sentimentAnalysis?: NBAResult['sentimentAnalysis']
  ): Promise<RecommendedAction[]> {
    // Build prompt for recommendation generation
    const systemPrompt = this.generateSystemPrompt();
    const humanPrompt = this.buildRecommendationPrompt(context, ragContent, sentimentAnalysis);

    const messages = [
      this.createSystemMessage(systemPrompt),
      this.createHumanMessage(humanPrompt),
    ];

    try {
      const response = await this.invokeLLM(messages);
      return this.parseRecommendations(response, context);
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'LLM recommendation generation failed'
      );

      // Return fallback recommendations based on heuristics
      return this.generateFallbackRecommendations(context, sentimentAnalysis);
    }
  }

  /**
   * Build the recommendation prompt
   */
  private buildRecommendationPrompt(
    context: NBAContext,
    ragContent: string,
    sentimentAnalysis?: NBAResult['sentimentAnalysis']
  ): string {
    let prompt = `Generate next best action recommendations for this ${context.entityType}:

ENTITY CONTEXT:
- Type: ${context.entityType}
- Name: ${context.name || 'Unknown'}
- Company: ${context.company || 'Unknown'}
- Title: ${context.title || 'Unknown'}
- Score: ${context.score ?? 'Not scored'}
- Stage: ${context.stage || 'Unknown'}
- Value: ${context.value ? `$${context.value.toLocaleString()}` : 'Unknown'}
- Days since last contact: ${context.daysSinceLastContact ?? 'Unknown'}
- Total interactions: ${context.totalInteractions ?? 0}
`;

    if (sentimentAnalysis) {
      prompt += `
SENTIMENT ANALYSIS:
- Overall: ${sentimentAnalysis.sentiment}
- Urgency: ${sentimentAnalysis.urgency}
- Primary emotion: ${sentimentAnalysis.primaryEmotion}
`;
    }

    if (ragContent) {
      prompt += `
${ragContent}
`;
    }

    if (context.excludeActions && context.excludeActions.length > 0) {
      prompt += `
EXCLUDED ACTIONS (do not recommend): ${context.excludeActions.join(', ')}
`;
    }

    prompt += `
Generate 3 ranked recommendations in JSON format:
[
  {
    "action": "ACTION_TYPE",
    "priority": "HIGH|MEDIUM|LOW",
    "successProbability": 0.0-1.0,
    "title": "Short action title",
    "description": "What to do and why",
    "reasoning": "Data-driven reasoning",
    "suggestedTiming": "When to take action",
    "contentSuggestion": "Template or talking points if applicable",
    "confidence": 0.0-1.0
  }
]

Valid ACTION_TYPES: ${ACTION_TYPES.join(', ')}
`;

    return prompt;
  }

  /**
   * Parse LLM response into recommendations
   */
  private parseRecommendations(
    response: string,
    context: NBAContext
  ): RecommendedAction[] {
    try {
      // Try to extract JSON from response
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error('No JSON array found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate and transform each recommendation
      return parsed.map((rec: any, index: number) => ({
        action: this.validateActionType(rec.action),
        priority: this.validatePriority(rec.priority),
        successProbability: Math.min(1, Math.max(0, rec.successProbability || 0.5)),
        title: rec.title || `Recommendation ${index + 1}`,
        description: rec.description || 'Take this action to advance the relationship.',
        reasoning: rec.reasoning || 'Based on standard sales practices.',
        suggestedTiming: rec.suggestedTiming || 'Within the next 24-48 hours',
        contentSuggestion: rec.contentSuggestion,
        confidence: Math.min(1, Math.max(0, rec.confidence || 0.7)),
      }));
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to parse LLM recommendations'
      );
      return this.generateFallbackRecommendations(context);
    }
  }

  /**
   * Generate fallback recommendations using heuristics
   */
  private generateFallbackRecommendations(
    context: NBAContext,
    sentimentAnalysis?: NBAResult['sentimentAnalysis']
  ): RecommendedAction[] {
    const recommendations: RecommendedAction[] = [];

    // Logic-based recommendations based on context
    const daysSinceContact = context.daysSinceLastContact ?? 999;
    const urgency = sentimentAnalysis?.urgency || context.urgencyOverride || 'MEDIUM';
    const sentiment = sentimentAnalysis?.sentiment || 'NEUTRAL';

    // High urgency or negative sentiment - prioritize human touch
    if (urgency === 'CRITICAL' || urgency === 'HIGH' || sentiment.includes('NEGATIVE')) {
      recommendations.push({
        action: 'CALL',
        priority: 'HIGH',
        successProbability: 0.75,
        title: 'Personal outreach call',
        description: 'Make a direct phone call to address concerns and build relationship.',
        reasoning: 'High urgency or negative sentiment detected - personal contact builds trust faster.',
        suggestedTiming: 'Within the next 4 hours',
        contentSuggestion: 'Open with empathy, acknowledge their concerns, focus on solutions.',
        confidence: 0.8,
      });
    }

    // Cold or cooling lead - re-engagement
    if (daysSinceContact > 14) {
      recommendations.push({
        action: 'RE_ENGAGE',
        priority: daysSinceContact > 30 ? 'HIGH' : 'MEDIUM',
        successProbability: daysSinceContact > 30 ? 0.4 : 0.6,
        title: 'Re-engagement campaign',
        description: `No contact in ${daysSinceContact} days - send a value-add email to restart conversation.`,
        reasoning: 'Extended periods without contact reduce engagement. Re-establish presence.',
        suggestedTiming: 'Send today during business hours',
        contentSuggestion: 'Share relevant industry insight or case study, keep it brief.',
        confidence: 0.75,
      });
    }

    // Lead with low score - nurture
    if (context.score !== undefined && context.score < 40) {
      recommendations.push({
        action: 'NURTURE',
        priority: 'LOW',
        successProbability: 0.5,
        title: 'Add to nurture sequence',
        description: 'Lead score is low - add to automated nurture sequence to warm up.',
        reasoning: 'Low-score leads benefit from consistent, value-driven content over time.',
        suggestedTiming: 'Add to sequence this week',
        contentSuggestion: 'Educational content series on common pain points.',
        confidence: 0.7,
      });
    }

    // Opportunity in late stage - close action
    if (context.entityType === 'opportunity' && context.stage &&
        ['NEGOTIATION', 'PROPOSAL_SENT', 'CONTRACT_REVIEW'].includes(context.stage.toUpperCase())) {
      recommendations.push({
        action: 'CLOSE_DEAL',
        priority: 'HIGH',
        successProbability: 0.7,
        title: 'Push for close',
        description: 'Opportunity is in late stage - focus on overcoming final objections.',
        reasoning: 'Late-stage deals require active closing efforts to convert.',
        suggestedTiming: 'Schedule call within 24 hours',
        contentSuggestion: 'Prepare objection responses, have executive sponsor ready if needed.',
        confidence: 0.8,
      });
    }

    // Default follow-up if nothing else
    if (recommendations.length === 0) {
      recommendations.push({
        action: 'FOLLOW_UP',
        priority: 'MEDIUM',
        successProbability: 0.6,
        title: 'Standard follow-up',
        description: 'Send a follow-up message to maintain momentum.',
        reasoning: 'Regular touchpoints keep opportunities active.',
        suggestedTiming: 'Within the next 48 hours',
        contentSuggestion: 'Reference last conversation, provide next steps.',
        confidence: 0.7,
      });
    }

    // Sort by priority and limit to 3
    const priorityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    return recommendations
      .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
      .slice(0, 3);
  }

  /**
   * Validate and normalize action type
   */
  private validateActionType(action: string): ActionType {
    const normalized = action?.toUpperCase()?.replace(/[^A-Z_]/g, '');
    return ACTION_TYPES.includes(normalized as ActionType)
      ? (normalized as ActionType)
      : 'FOLLOW_UP';
  }

  /**
   * Validate and normalize priority
   */
  private validatePriority(priority: string): ActionPriority {
    const normalized = priority?.toUpperCase()?.trim();
    return ACTION_PRIORITIES.includes(normalized as ActionPriority)
      ? (normalized as ActionPriority)
      : 'MEDIUM';
  }

  /**
   * Build entity summary string
   */
  private buildEntitySummary(context: NBAContext): string {
    const parts = [];

    if (context.name) parts.push(context.name);
    if (context.company) parts.push(`at ${context.company}`);
    if (context.title) parts.push(`(${context.title})`);
    if (context.stage) parts.push(`- Stage: ${context.stage}`);
    if (context.value) parts.push(`- Value: $${context.value.toLocaleString()}`);
    if (context.score !== undefined) parts.push(`- Score: ${context.score}`);

    return parts.join(' ') || `${context.entityType} ${context.entityId}`;
  }

  /**
   * Calculate confidence score for the result
   */
  protected async calculateConfidence(
    task: AgentTask<NBAContext, NBAResult>,
    output: NBAResult
  ): Promise<number> {
    // Base confidence on available data quality
    let confidence = 0.5;

    const context = task.input;

    // More data = higher confidence
    if (context.name) confidence += 0.05;
    if (context.company) confidence += 0.05;
    if (context.email) confidence += 0.05;
    if (context.score !== undefined) confidence += 0.1;
    if (context.recentMessages && context.recentMessages.length > 0) confidence += 0.1;
    if (output.ragContextUsed) confidence += 0.1;
    if (output.sentimentAnalysis) confidence += 0.05;

    return Math.min(1, confidence);
  }
}

// =============================================================================
// Factory & Export
// =============================================================================

/**
 * Create a new NBA agent instance
 */
export function createNBAAgent(
  customRagChain?: RAGContextChain,
  customSentimentChain?: SentimentAnalysisChain
): NextBestActionAgent {
  return new NextBestActionAgent(customRagChain, customSentimentChain);
}

/**
 * Convenience function to get recommendations
 */
export async function getNextBestActions(
  context: NBAContext
): Promise<AgentResult<NBAResult>> {
  const agent = createNBAAgent();
  return agent.execute({
    id: `nba-${context.entityId}`,
    description: `Generate NBA for ${context.entityType} ${context.entityId}`,
    input: context,
    expectedOutput: nbaResultSchema,
  });
}
