import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { StructuredOutputParser } from 'langchain/output_parsers';
import { z } from 'zod';
import { aiConfig } from '../config/ai.config';
import { costTracker } from '../utils/cost-tracker';
import { leadScoreSchema } from '@intelliflow/validators';
import pino from 'pino';

const logger = pino({
  name: 'scoring-chain',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Lead data input for scoring
 */
export const leadInputSchema = z.object({
  email: z.string().email(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  company: z.string().optional(),
  title: z.string().optional(),
  phone: z.string().optional(),
  source: z.string(),
  metadata: z.record(z.unknown()).optional(),
});

export type LeadInput = z.infer<typeof leadInputSchema>;

/**
 * Scoring result with confidence and reasoning
 */
export type ScoringResult = z.infer<typeof leadScoreSchema>;

/**
 * Lead Scoring Chain
 * Uses LangChain to score leads based on multiple factors with structured output
 */
export class LeadScoringChain {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly model: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly parser: StructuredOutputParser<any>;
  private readonly prompt: PromptTemplate;

  constructor() {
    // Initialize the appropriate model based on configuration
    if (aiConfig.provider === 'openai') {
      this.model = new ChatOpenAI({
        modelName: aiConfig.openai.model,
        temperature: aiConfig.openai.temperature,
        maxTokens: aiConfig.openai.maxTokens,
        timeout: aiConfig.openai.timeout,
        openAIApiKey: aiConfig.openai.apiKey,
        callbacks: aiConfig.features.enableChainLogging
          ? [
              {
                handleLLMEnd: async (output) => {
                  // Track token usage and cost
                  const usage = output.llmOutput?.tokenUsage;
                  if (usage && aiConfig.costTracking.enabled) {
                    costTracker.recordUsage({
                      model: aiConfig.openai.model,
                      inputTokens: usage.promptTokens || 0,
                      outputTokens: usage.completionTokens || 0,
                      operationType: 'lead_scoring',
                    });
                  }
                },
              },
            ]
          : undefined,
      });
    } else {
      // Ollama support - would use dynamic import at runtime:
      // const { ChatOllama } = await import('@langchain/community/chat_models/ollama');
      // this.model = new ChatOllama({ baseUrl, model, temperature });
      throw new Error('Ollama support requires dynamic import - not yet implemented');
    }

    // Create structured output parser
    this.parser = StructuredOutputParser.fromZodSchema(leadScoreSchema);

    // Define the scoring prompt
    this.prompt = new PromptTemplate({
      template: `You are an expert lead scoring AI for a CRM system. Analyze the provided lead information and assign a score from 0-100 based on the lead's quality and conversion potential.

Consider the following factors:
1. Contact Information Completeness (0-25 points)
   - Email quality and domain
   - Phone number availability
   - Professional title
   - Company information

2. Engagement Indicators (0-25 points)
   - Source quality (direct website > referral > social > cold call)
   - Email domain (corporate email > free email)

3. Qualification Signals (0-25 points)
   - Job title indicates decision-making authority
   - Company size and industry indicators
   - Professional email domain

4. Data Quality (0-25 points)
   - Completeness of profile
   - Consistency of information
   - Recency indicators

Lead Information:
{lead_info}

IMPORTANT: Provide your analysis in the following format:
{format_instructions}

Be thorough but concise. Each factor should have a clear impact score and reasoning.`,
      inputVariables: ['lead_info'],
      partialVariables: {
        format_instructions: this.parser.getFormatInstructions(),
      },
    });
  }

  /**
   * Score a lead and return structured results
   */
  async scoreLead(lead: LeadInput): Promise<ScoringResult> {
    const startTime = Date.now();

    try {
      logger.info({ leadEmail: lead.email }, 'Starting lead scoring');

      // Format lead information for the prompt
      const leadInfo = this.formatLeadInfo(lead);

      // Generate the prompt
      const formattedPrompt = await this.prompt.format({
        lead_info: leadInfo,
      });

      // Call the LLM
      const response = await this.model.invoke(formattedPrompt);

      // Parse the structured output
      const result = (await this.parser.parse(response.content as string)) as Omit<
        ScoringResult,
        'modelVersion'
      >;

      // Add model version
      const scoringResult: ScoringResult = {
        ...result,
        modelVersion: `${aiConfig.provider}:${aiConfig.provider === 'openai' ? aiConfig.openai.model : aiConfig.ollama.model}:v1`,
      };

      const duration = Date.now() - startTime;

      logger.info(
        {
          leadEmail: lead.email,
          score: scoringResult.score,
          confidence: scoringResult.confidence,
          duration,
        },
        'Lead scoring completed'
      );

      return scoringResult;
    } catch (error) {
      logger.error(
        {
          leadEmail: lead.email,
          error: error instanceof Error ? error.message : String(error),
        },
        'Lead scoring failed'
      );

      // Return a default low-confidence score on error
      return {
        score: 0,
        confidence: 0,
        factors: [
          {
            name: 'error',
            impact: 0,
            reasoning: `Scoring failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        modelVersion: 'error:v1',
      };
    }
  }

  /**
   * Batch score multiple leads
   */
  async scoreLeads(leads: LeadInput[]): Promise<ScoringResult[]> {
    logger.info({ count: leads.length }, 'Starting batch lead scoring');

    // Process leads sequentially to avoid rate limits
    // In production, consider using a queue system like BullMQ
    const results: ScoringResult[] = [];

    for (const lead of leads) {
      const result = await this.scoreLead(lead);
      results.push(result);

      // Add delay to respect rate limits
      if (aiConfig.performance.rateLimitPerMinute) {
        const delayMs = (60 * 1000) / aiConfig.performance.rateLimitPerMinute;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return results;
  }

  /**
   * Format lead information for the prompt
   */
  private formatLeadInfo(lead: LeadInput): string {
    const parts: string[] = [];

    if (lead.email) {
      parts.push(`Email: ${lead.email}`);
      const domain = lead.email.split('@')[1];
      parts.push(`Email Domain: ${domain}`);
    }

    if (lead.firstName || lead.lastName) {
      const name = [lead.firstName, lead.lastName].filter(Boolean).join(' ');
      parts.push(`Name: ${name}`);
    }

    if (lead.company) {
      parts.push(`Company: ${lead.company}`);
    }

    if (lead.title) {
      parts.push(`Title: ${lead.title}`);
    }

    if (lead.phone) {
      parts.push(`Phone: Available`);
    }

    parts.push(`Source: ${lead.source}`);

    if (lead.metadata) {
      parts.push(`Additional Data: ${JSON.stringify(lead.metadata)}`);
    }

    return parts.join('\n');
  }

  /**
   * Validate scoring result meets quality thresholds
   */
  validateScoringResult(result: ScoringResult): {
    valid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];

    // Check confidence threshold
    if (result.confidence < 0.5) {
      issues.push(`Low confidence score: ${result.confidence}`);
    }

    // Check if factors were provided
    if (result.factors.length === 0) {
      issues.push('No scoring factors provided');
    }

    // Check if factors have reasoning
    const factorsWithoutReasoning = result.factors.filter(
      (f) => !f.reasoning || f.reasoning.length < 10
    );
    if (factorsWithoutReasoning.length > 0) {
      issues.push(`${factorsWithoutReasoning.length} factors lack detailed reasoning`);
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }
}

/**
 * Global scoring chain instance
 */
export const leadScoringChain = new LeadScoringChain();
