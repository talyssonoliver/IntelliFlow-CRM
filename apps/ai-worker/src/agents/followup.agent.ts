import { z } from 'zod';
import { BaseAgent, AgentTask, BaseAgentConfig } from './base.agent';
import { StructuredOutputParser } from '@langchain/core/output_parsers';
import pino from 'pino';
import {
  followupOutputSchema,
  type FollowupOutput,
  leadFollowupStatusSchema,
  qualificationLevelSchema,
  interactionTypeSchema,
} from '@intelliflow/validators';

const logger = pino({
  name: 'followup-agent',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Follow-up strategy input schema
 * Uses domain constants via validator schemas for consistency
 */
export const followupInputSchema = z.object({
  leadId: z.string(),
  leadEmail: z.string().email(),
  leadName: z.string(),
  leadCompany: z.string().optional(),
  leadTitle: z.string().optional(),
  currentStatus: leadFollowupStatusSchema,
  qualificationLevel: qualificationLevelSchema,
  leadScore: z.number().min(0).max(100),
  interactionHistory: z.array(
    z.object({
      type: interactionTypeSchema,
      timestamp: z.string(),
      description: z.string(),
      outcome: z.string().optional(),
    })
  ),
  daysSinceLastContact: z.number(),
  assignedSalesRep: z.string().optional(),
  dealValue: z.number().optional(),
  targetCloseDate: z.string().optional(),
});

export type FollowupInput = z.infer<typeof followupInputSchema>;

// Re-export output schema and type from validators for backward compatibility
export { followupOutputSchema, type FollowupOutput } from '@intelliflow/validators';

/**
 * Follow-up Agent
 * Analyzes lead interaction history and determines optimal follow-up strategy
 * Provides actionable recommendations with timing and communication approach
 */
export class FollowupAgent extends BaseAgent<FollowupInput, FollowupOutput> {
  private readonly parser: StructuredOutputParser<any>;

  constructor(config?: Partial<BaseAgentConfig>) {
    super({
      name: 'Follow-up Strategy Specialist',
      role: 'Sales Follow-up and Engagement Expert',
      goal: 'Determine optimal follow-up strategies that maximize conversion while respecting lead preferences',
      backstory: `You are a senior sales strategist with deep expertise in lead nurturing and follow-up optimization.
You understand the psychology of B2B sales cycles and know exactly when to push, when to wait, and when to
change tactics. Your recommendations are data-driven, considering engagement patterns, timing science, and
the specific context of each lead. You excel at balancing persistence with professionalism.`,
      maxIterations: 3,
      allowDelegation: false,
      verbose: true,
      ...config,
    });

    this.parser = StructuredOutputParser.fromZodSchema(followupOutputSchema);
  }

  /**
   * Execute follow-up strategy task
   */
  protected async executeTask(
    task: AgentTask<FollowupInput, FollowupOutput>
  ): Promise<FollowupOutput> {
    const input = task.input;

    logger.info(
      {
        leadId: input.leadId,
        currentStatus: input.currentStatus,
        daysSinceLastContact: input.daysSinceLastContact,
        qualificationLevel: input.qualificationLevel,
      },
      'Starting follow-up strategy analysis'
    );

    // Build the follow-up strategy prompt
    const prompt = this.buildFollowupPrompt(input);

    // Get the system prompt
    const systemPrompt = this.generateSystemPrompt();

    // Invoke the LLM
    const messages = [this.createSystemMessage(systemPrompt), this.createHumanMessage(prompt)];

    const response = await this.invokeLLM(messages);

    // Parse structured output
    try {
      const result = (await this.parser.parse(response)) as FollowupOutput;

      logger.info(
        {
          leadId: input.leadId,
          shouldFollowUp: result.shouldFollowUp,
          recommendedAction: result.recommendedAction,
          urgency: result.urgency,
          confidence: result.confidence,
        },
        'Follow-up strategy analysis completed'
      );

      return result;
    } catch (parseError) {
      logger.error(
        {
          leadId: input.leadId,
          error: parseError instanceof Error ? parseError.message : String(parseError),
          response: response.substring(0, 200),
        },
        'Failed to parse follow-up strategy response'
      );

      // Return a conservative fallback result
      return {
        shouldFollowUp: true,
        urgency: 'MEDIUM',
        recommendedAction: 'ESCALATE_TO_MANAGER',
        reasoning: 'Unable to complete analysis - escalating for human review',
        confidence: 0.1,
        suggestedTiming: {
          optimalDay: 'TUESDAY',
          optimalTimeSlot: 'MORNING',
          reasonForTiming: 'Default timing - analysis incomplete',
        },
        nextSteps: [
          {
            action: 'Manager review required - analysis failed',
            deadline: 'Today',
            owner: input.assignedSalesRep || 'Sales Manager',
          },
        ],
        riskFactors: ['Analysis incomplete - manual review required'],
        opportunitySignals: [],
      };
    }
  }

  /**
   * Build the follow-up strategy prompt
   */
  private buildFollowupPrompt(input: FollowupInput): string {
    const sections: string[] = [];

    // Header & Lead information
    const leadInfo: string[] = [
      '=== FOLLOW-UP STRATEGY REQUEST ===\n',
      'LEAD INFORMATION:',
      `ID: ${input.leadId}`,
      `Name: ${input.leadName}`,
      `Email: ${input.leadEmail}`
    ];
    if (input.leadCompany) leadInfo.push(`Company: ${input.leadCompany}`);
    if (input.leadTitle) leadInfo.push(`Title: ${input.leadTitle}`);
    sections.push(...leadInfo);

    // Current status
    const currentStatus: string[] = [
      '\nCURRENT STATUS:',
      `Pipeline Stage: ${input.currentStatus}`,
      `Qualification Level: ${input.qualificationLevel}`,
      `Lead Score: ${input.leadScore}/100`,
      `Days Since Last Contact: ${input.daysSinceLastContact}`
    ];
    if (input.assignedSalesRep) currentStatus.push(`Assigned To: ${input.assignedSalesRep}`);
    if (input.dealValue) currentStatus.push(`Deal Value: $${input.dealValue.toLocaleString()}`);
    if (input.targetCloseDate) currentStatus.push(`Target Close: ${input.targetCloseDate}`);
    sections.push(...currentStatus);

    // Interaction history
    const interactionHistory: string[] = ['\nINTERACTION HISTORY:'];
    if (input.interactionHistory.length === 0) {
      interactionHistory.push('No previous interactions recorded.');
    } else {
      for (let i = 0; i < input.interactionHistory.length; i++) {
        const interaction = input.interactionHistory[i];
        const interactionLines = [
          `\n${i + 1}. ${interaction.type} (${interaction.timestamp})`,
          `   Description: ${interaction.description}`
        ];
        if (interaction.outcome) interactionLines.push(`   Outcome: ${interaction.outcome}`);
        interactionHistory.push(...interactionLines);
      }
    }
    sections.push(...interactionHistory);

    // Analysis guidelines
    const analysisGuidelines: string[] = [
      '\n=== ANALYSIS GUIDELINES ===\n',
      'Consider the following in your analysis:',
      '1. Engagement pattern - Are they becoming more or less engaged?',
      '2. Time since last contact - Is it too soon or too long?',
      '3. Lead stage - What action is appropriate for this pipeline stage?',
      '4. Qualification level - How much effort is justified?',
      '5. Communication channel preference - What worked before?',
      '6. Timing optimization - Best days/times for this type of lead',
      '7. Risk factors - What could cause this deal to slip?',
      '8. Opportunity signals - What positive signs exist?'
    ];
    sections.push(...analysisGuidelines);

    // Decision criteria
    const decisionCriteria: string[] = [
      '\nDECISION CRITERIA:',
      '- IMMEDIATE: Critical urgency, deal at risk of being lost',
      '- HIGH: Should contact within 24 hours',
      '- MEDIUM: Contact within 2-3 days',
      '- LOW: Can wait up to a week',
      '- DEFER: Put in nurture campaign, revisit later'
    ];
    sections.push(...decisionCriteria);

    // Output format
    const outputFormat: string[] = [
      '\n=== REQUIRED OUTPUT ===\n',
      this.parser.getFormatInstructions()
    ];
    sections.push(...outputFormat);

    return sections.join('\n');
  }

  /**
   * Calculate confidence based on data completeness and clarity
   */
  protected async calculateConfidence(
    task: AgentTask<FollowupInput, FollowupOutput>,
    output: FollowupOutput
  ): Promise<number> {
    const input = task.input;

    // Start with the AI's self-reported confidence
    let confidence = output.confidence;

    // Factor in data quality
    const hasHistory = input.interactionHistory.length > 0;
    const hasCompanyInfo = !!input.leadCompany;
    const hasRecentContact = input.daysSinceLastContact < 30;

    // Reduce confidence if missing key data
    if (!hasHistory && confidence > 0.6) {
      confidence = 0.6;
    }

    if (!hasCompanyInfo && confidence > 0.75) {
      confidence = 0.75;
    }

    // Boost confidence for recent contacts (more reliable data)
    if (hasRecentContact && hasHistory && confidence < 0.9) {
      confidence = Math.min(confidence + 0.1, 0.9);
    }

    return confidence;
  }
}

/**
 * Create a follow-up strategy task
 */
export function createFollowupTask(
  input: FollowupInput,
  context?: {
    userId?: string;
    sessionId?: string;
  }
): AgentTask<FollowupInput, FollowupOutput> {
  return {
    id: `followup-${input.leadId}-${Date.now()}`,
    description: `Determine follow-up strategy for lead ${input.leadName}`,
    input,
    expectedOutput: followupOutputSchema,
    context,
  };
}

/**
 * Global follow-up agent instance
 */
export const followupAgent = new FollowupAgent();
