import { z } from 'zod';
import { BaseAgent, AgentTask, BaseAgentConfig } from './base.agent';
import { ensurePromptBudget } from '../utils/prompt-budget.js';
import { replayConversation } from '../utils/conversation-replay.js';
import pino from 'pino';

const logger = pino({
  name: 'qualification-agent',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Lead qualification input schema
 */
export const qualificationInputSchema = z.object({
  leadId: z.string(),
  email: z.email(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  company: z.string().optional(),
  title: z.string().optional(),
  phone: z.string().optional(),
  source: z.string(),
  score: z.number().int().min(0).max(100).optional(),
  recentActivities: z.array(z.string()).optional(),
  companyData: z
    .object({
      industry: z.string().optional(),
      size: z.string().optional(),
      revenue: z.string().optional(),
      location: z.string().optional(),
    })
    .optional(),
});

export type QualificationInput = z.infer<typeof qualificationInputSchema>;

/**
 * Lead qualification output schema
 */
export const qualificationOutputSchema = z.object({
  qualified: z.boolean(),
  qualificationLevel: z.enum(['HIGH', 'MEDIUM', 'LOW', 'UNQUALIFIED']),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  strengths: z.array(z.string()),
  concerns: z.array(z.string()),
  recommendedActions: z.array(
    z.object({
      action: z.string(),
      priority: z.enum(['HIGH', 'MEDIUM', 'LOW']),
      reasoning: z.string(),
    })
  ),
  nextSteps: z.array(z.string()),
  estimatedConversionProbability: z.number().min(0).max(1),
});

export type QualificationOutput = z.infer<typeof qualificationOutputSchema>;

/**
 * Lead Qualification Agent
 * Analyzes leads to determine if they should be qualified for sales follow-up
 * Provides detailed reasoning and recommended next steps
 */
export class LeadQualificationAgent extends BaseAgent<QualificationInput, QualificationOutput> {
  private readonly structuredModel: { invoke(input: unknown): Promise<unknown> };

  constructor(config?: Partial<BaseAgentConfig>) {
    super({
      name: 'Lead Qualification Specialist',
      role: 'Expert Lead Qualification Analyst',
      goal: 'Analyze leads comprehensively and determine qualification status with detailed reasoning',
      backstory: `You are a seasoned sales qualification expert with 15+ years of experience in B2B sales.
You excel at analyzing lead data, identifying buying signals, and determining sales readiness.
You understand BANT (Budget, Authority, Need, Timeline) criteria and modern sales frameworks.
Your recommendations are data-driven, actionable, and focused on conversion optimization.`,
      maxIterations: 3,
      allowDelegation: false,
      verbose: true,
      purpose: 'qualification',
      // ADR-049: enable blocking reflection gate for output quality assurance.
      // usesPlanning remains false — LLM-driven plan override needs product design first.
      usesReflection: true,
      ...config,
    });

    this.structuredModel = (this.model as any).withStructuredOutput(qualificationOutputSchema);
  }

  /**
   * Execute lead qualification task
   */
  protected async executeTask(
    task: AgentTask<QualificationInput, QualificationOutput>
  ): Promise<QualificationOutput> {
    const lead = task.input;

    logger.info(
      {
        leadId: lead.leadId,
        company: lead.company,
        title: lead.title,
      },
      'Starting lead qualification'
    );

    // Build the qualification prompt
    const prompt = this.buildQualificationPrompt(lead);

    // Get the system prompt
    const systemPrompt = this.generateSystemPrompt();

    // M6: conversation-history replay — prepend prior turns when sessionId is available.
    // tenantId is sourced from AgentContext.userId (the authenticated caller's tenant),
    // mirroring the FollowupAgent pattern.
    const sessionId = task.context?.sessionId;
    const tenantId = task.context?.userId;
    let historyMessages: import('@langchain/core/messages').BaseMessage[] = [];
    if (sessionId && tenantId) {
      try {
        const replay = await replayConversation({ tenantId, sessionId });
        historyMessages = replay.messages;
      } catch (replayError) {
        logger.warn(
          {
            leadId: lead.leadId,
            sessionId,
            error: replayError instanceof Error ? replayError.message : String(replayError),
          },
          'Failed to load conversation history — proceeding without it'
        );
      }
    }

    // Invoke the LLM with structured output
    const messages = [
      this.createSystemMessage(systemPrompt),
      ...historyMessages,
      this.createHumanMessage(prompt),
    ];

    const budgeted = ensurePromptBudget(messages, { maxTokens: 6000 });
    if (budgeted.truncated) {
      logger.warn(
        {
          agentName: this.config.name,
          droppedCount: budgeted.droppedCount,
          remaining: budgeted.messages.length,
        },
        'Prompt history truncated to fit token budget'
      );
    }
    const response = await this.invokeLLM(budgeted.messages);

    // Parse structured output
    try {
      const result = (await this.structuredModel.invoke(response)) as QualificationOutput;

      logger.info(
        {
          leadId: lead.leadId,
          qualified: result.qualified,
          qualificationLevel: result.qualificationLevel,
          confidence: result.confidence,
        },
        'Lead qualification completed'
      );

      return result;
    } catch (parseError) {
      logger.error(
        {
          leadId: lead.leadId,
          error: parseError instanceof Error ? parseError.message : String(parseError),
          response: response.substring(0, 200),
        },
        'Failed to parse qualification response'
      );

      // Return a conservative fallback result
      return {
        qualified: false,
        qualificationLevel: 'UNQUALIFIED',
        confidence: 0.1,
        reasoning: 'Unable to complete qualification analysis due to parsing error',
        strengths: [],
        concerns: ['Analysis incomplete - requires manual review'],
        recommendedActions: [
          {
            action: 'Manual review required',
            priority: 'HIGH',
            reasoning: 'Automated qualification failed',
          },
        ],
        nextSteps: ['Assign to sales manager for manual qualification'],
        estimatedConversionProbability: 0,
      };
    }
  }

  /**
   * Build company data section for prompt
   */
  private buildCompanyDataSection(
    companyData: NonNullable<QualificationInput['companyData']>
  ): string[] {
    const lines: string[] = ['\nCOMPANY DATA:'];
    if (companyData.industry) lines.push(`Industry: ${companyData.industry}`);
    if (companyData.size) lines.push(`Size: ${companyData.size}`);
    if (companyData.revenue) lines.push(`Revenue: ${companyData.revenue}`);
    if (companyData.location) lines.push(`Location: ${companyData.location}`);
    return lines;
  }

  /**
   * Build activities section for prompt
   */
  private buildActivitiesSection(activities: string[]): string[] {
    const lines: string[] = ['\nRECENT ACTIVITIES:'];
    for (const [index, activity] of activities.entries()) {
      lines.push(`${index + 1}. ${activity}`);
    }
    return lines;
  }

  /**
   * Build the qualification prompt
   */
  private buildQualificationPrompt(lead: QualificationInput): string {
    const sections: string[] = [];

    // Lead info header
    sections.push(
      '=== LEAD QUALIFICATION REQUEST ===\n',
      'LEAD INFORMATION:',
      `ID: ${lead.leadId}`,
      `Email: ${lead.email}`
    );

    // Optional contact fields
    if (lead.firstName || lead.lastName) {
      const name = [lead.firstName, lead.lastName].filter(Boolean).join(' ');
      sections.push(`Name: ${name}`);
    }
    if (lead.company) sections.push(`Company: ${lead.company}`);
    if (lead.title) sections.push(`Title: ${lead.title}`);
    sections.push(`Source: ${lead.source}`);
    if (lead.score !== undefined) sections.push(`Current Score: ${lead.score}/100`);
    if (lead.phone) sections.push('Phone: Available');

    // Company data section
    if (lead.companyData) {
      sections.push(...this.buildCompanyDataSection(lead.companyData));
    }

    // Activities section
    if (lead.recentActivities && lead.recentActivities.length > 0) {
      sections.push(...this.buildActivitiesSection(lead.recentActivities));
    }

    // Qualification criteria and output format
    sections.push(
      '\n=== QUALIFICATION CRITERIA ===\n',
      'Analyze this lead using the following framework:',
      '\n1. BANT Assessment:',
      '   - Budget: Does the lead likely have budget authority?',
      '   - Authority: Is this person a decision-maker?',
      '   - Need: Is there evidence of product/service need?',
      '   - Timeline: Are there urgency indicators?',
      '\n2. Engagement Quality:',
      '   - How engaged is this lead?',
      '   - Quality of the lead source',
      '   - Recent activity patterns',
      '\n3. Profile Completeness:',
      '   - Availability of key contact information',
      '   - Quality of professional details',
      '\n4. Conversion Potential:',
      '   - Overall likelihood to convert',
      '   - Risk factors or red flags',
      '\n=== REQUIRED OUTPUT ===\n',
      'Respond with a structured JSON object matching the qualification output schema.',
      '\nIMPORTANT GUIDELINES:',
      '- Be specific and data-driven in your reasoning',
      '- Identify both strengths AND concerns',
      '- Provide actionable recommended actions',
      '- Suggest concrete next steps for the sales team',
      '- Base your confidence score on available data quality'
    );

    return sections.join('\n');
  }

  /**
   * Calculate confidence based on qualification output
   */
  protected async calculateConfidence(
    task: AgentTask<QualificationInput, QualificationOutput>,
    output: QualificationOutput
  ): Promise<number> {
    // The agent provides its own confidence score
    // We validate it's reasonable based on data completeness
    const lead = task.input;

    const fields = [
      lead.firstName,
      lead.lastName,
      lead.company,
      lead.title,
      lead.phone,
      lead.companyData,
    ];
    const dataCompleteness = fields.filter(Boolean).length / fields.length;

    // Adjust confidence based on data completeness
    // If we have less than 50% data, cap confidence at 0.7
    if (dataCompleteness < 0.5 && output.confidence > 0.7) {
      return 0.7;
    }

    return output.confidence;
  }
}

/**
 * Create a qualification task
 */
export function createQualificationTask(
  input: QualificationInput,
  context?: {
    userId?: string;
    sessionId?: string;
  }
): AgentTask<QualificationInput, QualificationOutput> {
  return {
    id: `qual-${input.leadId}-${Date.now()}`,
    description: `Qualify lead ${input.leadId}`,
    input,
    expectedOutput: qualificationOutputSchema,
    context,
  };
}

/**
 * Lazily create the global qualification agent instance.
 *
 * This prevents import-time crashes when AI provider configuration is valid for
 * the running app but not for this specific agent path (e.g. Ollama in web-only
 * workflows that don't execute qualification tasks).
 */
let _qualificationAgent: LeadQualificationAgent | null = null;

export function getQualificationAgent(): LeadQualificationAgent {
  _qualificationAgent ??= new LeadQualificationAgent();
  return _qualificationAgent;
}

/**
 * Backward-compatible global agent export.
 * It initializes on first property access instead of module import.
 */
export const qualificationAgent = new Proxy({} as LeadQualificationAgent, {
  get(_target, prop, receiver) {
    const agent = getQualificationAgent();
    const value = Reflect.get(agent, prop, receiver);
    return typeof value === 'function' ? value.bind(agent) : value;
  },
});
