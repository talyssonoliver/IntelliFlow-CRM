import { z } from 'zod';
import { BaseAgent, AgentTask, BaseAgentConfig } from './base.agent';
import { StructuredOutputParser } from '@langchain/core/output_parsers';
import pino from 'pino';
import {
  emailWriterOutputSchema,
  type EmailWriterOutput,
  emailWriterPurposeSchema,
  qualificationLevelSchema,
  agentUrgencySchema,
  communicationToneSchema,
  emailLengthSchema,
} from '@intelliflow/validators';

const logger = pino({
  name: 'email-writer-agent',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Email generation input schema
 * Uses domain constants via validator schemas for consistency
 */
export const emailWriterInputSchema = z.object({
  recipientEmail: z.string().email(),
  recipientName: z.string(),
  recipientCompany: z.string().optional(),
  recipientTitle: z.string().optional(),
  purpose: emailWriterPurposeSchema,
  context: z.object({
    leadScore: z.number().min(0).max(100).optional(),
    qualificationLevel: qualificationLevelSchema.optional(),
    previousInteractions: z.array(z.string()).optional(),
    specificTopics: z.array(z.string()).optional(),
    urgency: agentUrgencySchema.optional(),
  }),
  senderName: z.string(),
  senderTitle: z.string().optional(),
  senderCompany: z.string().optional(),
  tone: communicationToneSchema.optional(),
  maxLength: emailLengthSchema.optional(),
});

export type EmailWriterInput = z.infer<typeof emailWriterInputSchema>;

// Re-export output schema and type from validators for backward compatibility
export { emailWriterOutputSchema, type EmailWriterOutput } from '@intelliflow/validators';

/**
 * Email Writer Agent
 * Generates personalized, professional emails for lead outreach and follow-up
 * Uses context from lead qualification and previous interactions
 */
export class EmailWriterAgent extends BaseAgent<EmailWriterInput, EmailWriterOutput> {
  private readonly parser: StructuredOutputParser<any>;

  constructor(config?: Partial<BaseAgentConfig>) {
    super({
      name: 'Email Writer Specialist',
      role: 'Professional Email Communication Expert',
      goal: 'Generate personalized, compelling emails that drive engagement and conversions',
      backstory: `You are an expert email copywriter with extensive experience in B2B sales communication.
You understand the psychology of email engagement and craft messages that are personalized,
compelling, and action-oriented. You excel at matching tone to context and creating emails
that feel personal while remaining professional. Your emails consistently achieve high open
and response rates.`,
      maxIterations: 3,
      allowDelegation: false,
      verbose: true,
      ...config,
    });

    this.parser = StructuredOutputParser.fromZodSchema(emailWriterOutputSchema);
  }

  /**
   * Execute email writing task
   */
  protected async executeTask(
    task: AgentTask<EmailWriterInput, EmailWriterOutput>
  ): Promise<EmailWriterOutput> {
    const input = task.input;

    logger.info(
      {
        recipientEmail: input.recipientEmail,
        purpose: input.purpose,
        recipientCompany: input.recipientCompany,
      },
      'Starting email generation'
    );

    // Build the email generation prompt
    const prompt = this.buildEmailPrompt(input);

    // Get the system prompt
    const systemPrompt = this.generateSystemPrompt();

    // Invoke the LLM
    const messages = [this.createSystemMessage(systemPrompt), this.createHumanMessage(prompt)];

    const response = await this.invokeLLM(messages);

    // Parse structured output
    try {
      const result = (await this.parser.parse(response)) as EmailWriterOutput;

      // Determine if human review is needed
      const reviewReasons = this.checkForHumanReview(input, result);
      if (reviewReasons.length > 0) {
        result.requiresHumanReview = true;
        result.reviewReasons = reviewReasons;
      }

      logger.info(
        {
          recipientEmail: input.recipientEmail,
          purpose: input.purpose,
          confidence: result.confidence,
          requiresHumanReview: result.requiresHumanReview,
        },
        'Email generation completed'
      );

      return result;
    } catch (parseError) {
      logger.error(
        {
          recipientEmail: input.recipientEmail,
          error: parseError instanceof Error ? parseError.message : String(parseError),
          response: response.substring(0, 200),
        },
        'Failed to parse email generation response'
      );

      // Return a fallback result requiring human review
      return {
        subject: 'Draft: Follow-up',
        body: 'This email requires human composition due to a generation error.',
        callToAction: 'Please compose manually',
        confidence: 0.1,
        reasoning: 'Unable to generate email due to parsing error',
        alternativeSubjects: [],
        personalizationElements: [],
        requiresHumanReview: true,
        reviewReasons: ['Generation failed - manual composition required'],
      };
    }
  }

  /**
   * Check if human review is needed
   */
  private checkForHumanReview(input: EmailWriterInput, result: EmailWriterOutput): string[] {
    const reasons: string[] = [];

    // Low confidence requires review
    if (result.confidence < 0.5) {
      reasons.push('Low confidence score - AI uncertain about email quality');
    }

    // High urgency emails need human approval
    if (input.context.urgency === 'HIGH') {
      reasons.push('High urgency communication requires human approval');
    }

    // Re-engagement emails are sensitive
    if (input.purpose === 'RE_ENGAGEMENT') {
      reasons.push('Re-engagement email requires careful human review');
    }

    // Unqualified leads need extra care
    if (input.context.qualificationLevel === 'UNQUALIFIED') {
      reasons.push('Email to unqualified lead needs human judgment');
    }

    return reasons;
  }

  /**
   * Build the email generation prompt
   * S7778: Refactored to use array initialization and variadic push
   */
  private buildEmailPrompt(input: EmailWriterInput): string {
    // S7778: Initialize array with static sections
    const sections: string[] = [
      '=== EMAIL GENERATION REQUEST ===\n',
      'RECIPIENT INFORMATION:',
      `Name: ${input.recipientName}`,
      `Email: ${input.recipientEmail}`,
    ];

    // Add optional recipient fields
    if (input.recipientCompany) sections.push(`Company: ${input.recipientCompany}`);
    if (input.recipientTitle) sections.push(`Title: ${input.recipientTitle}`);

    // Email purpose and context header
    sections.push(`\nEMAIL PURPOSE: ${input.purpose}`, '\nCONTEXT:');

    // Add optional context fields
    if (input.context.leadScore !== undefined) {
      sections.push(`Lead Score: ${input.context.leadScore}/100`);
    }
    if (input.context.qualificationLevel) {
      sections.push(`Qualification Level: ${input.context.qualificationLevel}`);
    }
    if (input.context.urgency) {
      sections.push(`Urgency: ${input.context.urgency}`);
    }

    // S7728: Use for...of instead of forEach for previous interactions
    if (input.context.previousInteractions && input.context.previousInteractions.length > 0) {
      sections.push('\nPrevious Interactions:');
      let i = 1;
      for (const interaction of input.context.previousInteractions) {
        sections.push(`  ${i}. ${interaction}`);
        i++;
      }
    }

    // S7728: Use for...of instead of forEach for topics
    if (input.context.specificTopics && input.context.specificTopics.length > 0) {
      sections.push('\nTopics to Address:');
      let i = 1;
      for (const topic of input.context.specificTopics) {
        sections.push(`  ${i}. ${topic}`);
        i++;
      }
    }

    // Sender information - S7778: Use variadic push
    sections.push('\nSENDER INFORMATION:', `Name: ${input.senderName}`);
    if (input.senderTitle) sections.push(`Title: ${input.senderTitle}`);
    if (input.senderCompany) sections.push(`Company: ${input.senderCompany}`);

    // Style preferences and guidelines - S7778: Use variadic push
    sections.push(
      '\nSTYLE PREFERENCES:',
      `Tone: ${input.tone || 'PROFESSIONAL'}`,
      `Length: ${input.maxLength || 'MEDIUM'}`,
      '\n=== GUIDELINES ===\n',
      '1. Personalize the email based on recipient information',
      '2. Include a clear, specific call to action',
      '3. Keep the subject line compelling and under 50 characters',
      '4. Match the tone to the relationship stage and context',
      '5. Include specific details that show this is not a generic template',
      '6. Suggest optimal send timing based on purpose and urgency',
      '7. Provide 2-3 alternative subject lines',
      '\n=== REQUIRED OUTPUT ===\n',
      this.parser.getFormatInstructions()
    );

    return sections.join('\n');
  }

  /**
   * Calculate confidence based on input completeness and output quality
   */
  protected async calculateConfidence(
    task: AgentTask<EmailWriterInput, EmailWriterOutput>,
    output: EmailWriterOutput
  ): Promise<number> {
    const input = task.input;

    // Start with the AI's self-reported confidence
    let confidence = output.confidence;

    // Adjust based on input completeness
    const inputFields = [
      input.recipientName,
      input.recipientCompany,
      input.recipientTitle,
      input.context.leadScore,
      input.context.qualificationLevel,
    ];
    const inputCompleteness = inputFields.filter(Boolean).length / inputFields.length;

    // If we have less than 60% of context, cap confidence
    if (inputCompleteness < 0.6 && confidence > 0.7) {
      confidence = 0.7;
    }

    // Penalize for missing personalization
    if (output.personalizationElements.length < 2 && confidence > 0.6) {
      confidence = 0.6;
    }

    return confidence;
  }
}

/**
 * Create an email writing task
 */
export function createEmailWriterTask(
  input: EmailWriterInput,
  context?: {
    userId?: string;
    sessionId?: string;
  }
): AgentTask<EmailWriterInput, EmailWriterOutput> {
  return {
    id: `email-${input.recipientEmail.split('@')[0]}-${Date.now()}`,
    description: `Generate ${input.purpose} email for ${input.recipientName}`,
    input,
    expectedOutput: emailWriterOutputSchema,
    context,
  };
}

/**
 * Global email writer agent instance
 */
export const emailWriterAgent = new EmailWriterAgent();
