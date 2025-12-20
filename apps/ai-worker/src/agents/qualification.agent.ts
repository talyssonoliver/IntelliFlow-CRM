import { z } from 'zod';
import { BaseAgent, AgentTask, BaseAgentConfig } from './base.agent';
import { StructuredOutputParser } from '@langchain/core/output_parsers';
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
  email: z.string().email(),
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
  private readonly parser: StructuredOutputParser<any>;

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
      ...config,
    });

    this.parser = StructuredOutputParser.fromZodSchema(qualificationOutputSchema);
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

    // Invoke the LLM
    const messages = [this.createSystemMessage(systemPrompt), this.createHumanMessage(prompt)];

    const response = await this.invokeLLM(messages);

    // Parse structured output
    try {
      const result = (await this.parser.parse(response)) as QualificationOutput;

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
      this.parser.getFormatInstructions(),
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

    let dataCompleteness = 0;
    const fields = [
      lead.firstName,
      lead.lastName,
      lead.company,
      lead.title,
      lead.phone,
      lead.companyData,
    ];
    dataCompleteness = fields.filter(Boolean).length / fields.length;

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
 * Global qualification agent instance
 */
export const qualificationAgent = new LeadQualificationAgent();
