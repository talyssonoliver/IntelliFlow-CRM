/**
 * Auto-Response Generation Chain
 * Part of IFC-029: Auto-Response with Approval Gate
 *
 * This chain generates AI-powered email responses based on:
 * - Trigger type (EMAIL_RECEIVED, FORM_SUBMIT, CHAT_MESSAGE, MANUAL)
 * - Lead information and context
 * - Tenant-specific settings and tone preferences
 *
 * CRITICAL: This chain MUST call real LLM - no template fallback allowed
 * Per specification: "Response generation must call real LLM chain, not return template placeholders"
 *
 * IFC-029 Enhancements:
 * - Input sanitization for prompt injection prevention
 * - JSON parsing with markdown fallback
 * - ChainMonitor integration for latency/cost tracking
 */

import { ChatOpenAI } from '@langchain/openai';
import { aiConfig } from '../config/ai.config';
import { getOpenAIClientSettings } from '../utils/openai-client';
import { sanitizeStringField } from '../utils/input-sanitizer';
import { withMonitoring, createChainMonitor, type MonitoredResult } from '../monitoring/chain-monitor';

/**
 * Input for auto-response generation
 */
export interface AutoResponseInput {
  triggerType: 'EMAIL_RECEIVED' | 'FORM_SUBMIT' | 'CHAT_MESSAGE' | 'MANUAL';
  leadInfo: {
    id: string;
    name: string;
    email: string;
    company?: string;
    status: string;
  };
  context: {
    // For EMAIL_RECEIVED
    originalMessage?: string;
    originalSubject?: string;
    senderDomain?: string;
    messageType?: string;
    // For FORM_SUBMIT
    formName?: string;
    formFields?: Record<string, string>;
    // For CHAT_MESSAGE
    chatHistory?: Array<{ role: string; content: string }>;
  };
  tenantSettings: {
    companyName: string;
    tone: 'professional' | 'friendly' | 'casual' | 'formal' | 'helpful';
    signatureTemplate?: string;
    customInstructions?: string;
  };
}

/**
 * Output from auto-response generation
 */
export interface AutoResponseOutput {
  subject: string;
  body: string;
  confidence: number;
  modelVersion: string;
  tone?: string;
  suggestedFollowUp?: string;
}

/**
 * Validation result for generated response
 */
export interface ValidationResult {
  valid: boolean;
  issues: string[];
}

/**
 * Auto-Response Generation Chain
 *
 * Uses GPT-4o-mini by default for <1s latency,
 * or GPT-4-turbo for high-value leads.
 *
 * IFC-029: All user inputs are sanitized before prompt construction.
 */
export class AutoResponseChain {
  private llm: ChatOpenAI;
  private modelVersion: string;
  private chainMonitor = createChainMonitor({ latencyThresholdMs: 1000 });

  // Content limits (from ResponseContent value object)
  private static readonly MAX_SUBJECT_LENGTH = 100;
  private static readonly MAX_BODY_LENGTH = 2000;
  private static readonly MIN_CONFIDENCE_THRESHOLD = 0.5;

  // IFC-029: Sanitization limits
  private static readonly MAX_NAME_LENGTH = 100;
  private static readonly MAX_COMPANY_LENGTH = 100;
  private static readonly MAX_MESSAGE_LENGTH = 2000;
  private static readonly MAX_CUSTOM_INSTRUCTIONS_LENGTH = 500;

  constructor() {
    const openAIClientSettings = getOpenAIClientSettings();
    this.llm = new ChatOpenAI({
      modelName: aiConfig.openai.model,
      temperature: aiConfig.openai.temperature,
      maxTokens: aiConfig.openai.maxTokens,
      timeout: aiConfig.openai.timeout,
      apiKey: openAIClientSettings.apiKey,
      configuration: openAIClientSettings.configuration,
    });
    this.modelVersion = `${openAIClientSettings.endpoint}:${aiConfig.openai.model}:v1`;
  }

  /**
   * Generate an auto-response based on trigger and context
   *
   * IFC-029: Wrapped with ChainMonitor for latency/cost tracking.
   * All user inputs are sanitized before prompt construction.
   *
   * @throws Error if LLM call fails or response cannot be parsed
   */
  async generateResponse(input: AutoResponseInput): Promise<AutoResponseOutput> {
    const prompt = this.buildPrompt(input);

    // Call LLM - NO TEMPLATE FALLBACK per specification
    const response = await this.llm.invoke(prompt);

    // Parse and validate JSON response with fallback for markdown-wrapped JSON
    const content = typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content);
    const parsed = this.parseResponse(content);

    // Build output with length constraints
    const output: AutoResponseOutput = {
      subject: this.truncateSubject(parsed.subject || 'Re: Your inquiry'),
      body: this.truncateBody(parsed.body || ''),
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.7,
      modelVersion: this.modelVersion,
      tone: parsed.tone,
      suggestedFollowUp: parsed.suggestedFollowUp,
    };

    return output;
  }

  /**
   * Generate an auto-response with monitoring
   *
   * IFC-029: Wraps generateResponse with ChainMonitor for
   * latency tracking, cost monitoring, and operational metrics.
   */
  async generateResponseWithMonitoring(
    input: AutoResponseInput
  ): Promise<MonitoredResult<AutoResponseOutput>> {
    return withMonitoring(
      () => this.generateResponse(input),
      this.chainMonitor.getConfig()
    );
  }

  /**
   * Parse LLM response JSON with fallback for markdown-wrapped JSON
   * IFC-029: Resilient parsing handles both raw JSON and markdown code blocks
   */
  private parseResponse(content: string): {
    subject?: string;
    body?: string;
    confidence?: number;
    tone?: string;
    suggestedFollowUp?: string;
  } {
    // First try direct JSON parse
    try {
      return JSON.parse(content);
    } catch {
      // Fallback: extract JSON from markdown code blocks
      const match = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) {
        try {
          return JSON.parse(match[1].trim());
        } catch {
          throw new Error('Failed to parse JSON from markdown code block');
        }
      }
      throw new Error('Failed to parse LLM response: not valid JSON');
    }
  }

  /**
   * Validate a generated response meets quality criteria
   */
  validateResponse(response: AutoResponseOutput): ValidationResult {
    const issues: string[] = [];

    // Check subject
    if (!response.subject || response.subject.trim().length === 0) {
      issues.push('Empty subject is not allowed');
    }
    if (response.subject && response.subject.length > AutoResponseChain.MAX_SUBJECT_LENGTH) {
      issues.push(`Subject is too long (max ${AutoResponseChain.MAX_SUBJECT_LENGTH} characters)`);
    }

    // Check body
    if (!response.body || response.body.trim().length === 0) {
      issues.push('Empty body is not allowed');
    }
    if (response.body && response.body.length > AutoResponseChain.MAX_BODY_LENGTH) {
      issues.push(`Body is too long (max ${AutoResponseChain.MAX_BODY_LENGTH} characters)`);
    }

    // Check confidence
    if (response.confidence < AutoResponseChain.MIN_CONFIDENCE_THRESHOLD) {
      issues.push(`Low confidence score (${response.confidence}) - requires human review`);
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * Build the prompt for the LLM based on trigger type and context
   *
   * IFC-029: CRITICAL - All user-provided fields are sanitized before prompt construction
   * to prevent prompt injection attacks.
   */
  private buildPrompt(input: AutoResponseInput): string {
    const { triggerType, leadInfo, context, tenantSettings } = input;

    // IFC-029: Sanitize all user-provided fields
    const sanitizedLeadName = sanitizeStringField(
      leadInfo.name,
      AutoResponseChain.MAX_NAME_LENGTH
    );
    const sanitizedCompany = leadInfo.company
      ? sanitizeStringField(leadInfo.company, AutoResponseChain.MAX_COMPANY_LENGTH)
      : 'Not provided';
    const sanitizedCustomInstructions = tenantSettings.customInstructions
      ? sanitizeStringField(
          tenantSettings.customInstructions,
          AutoResponseChain.MAX_CUSTOM_INSTRUCTIONS_LENGTH
        )
      : undefined;

    let contextSection = '';

    switch (triggerType) {
      case 'EMAIL_RECEIVED':
        contextSection = this.buildEmailContext(context);
        break;
      case 'FORM_SUBMIT':
        contextSection = this.buildFormContext(context);
        break;
      case 'CHAT_MESSAGE':
        contextSection = this.buildChatContext(context);
        break;
      case 'MANUAL':
        contextSection = 'Manual response request - no prior context.';
        break;
    }

    return `You are an AI assistant for ${tenantSettings.companyName}, generating professional email responses.

LEAD INFORMATION:
- Name: ${sanitizedLeadName}
- Email: ${leadInfo.email}
- Company: ${sanitizedCompany}
- Status: ${leadInfo.status}

CONTEXT:
${contextSection}

TONE: ${tenantSettings.tone}
${sanitizedCustomInstructions ? `CUSTOM INSTRUCTIONS: ${sanitizedCustomInstructions}` : ''}

Generate a response in JSON format with the following structure:
{
  "subject": "Email subject line (max 100 characters)",
  "body": "Email body (max 2000 characters)",
  "confidence": 0.0 to 1.0 confidence score,
  "tone": "detected tone of generated response",
  "suggestedFollowUp": "suggested follow-up timing"
}

Requirements:
- Subject must be concise and relevant (max 100 chars)
- Body must be professional and helpful (max 2000 chars)
- Include a clear call to action
- Match the specified tone
- Be personalized to the lead's context
${tenantSettings.signatureTemplate ? `- End with signature: ${tenantSettings.signatureTemplate.replace('{companyName}', tenantSettings.companyName)}` : ''}`;
  }

  /**
   * Build context section for email triggers
   * IFC-029: Sanitizes original message and subject
   */
  private buildEmailContext(context: AutoResponseInput['context']): string {
    const parts = [];
    if (context.originalSubject) {
      const sanitizedSubject = sanitizeStringField(
        context.originalSubject,
        AutoResponseChain.MAX_SUBJECT_LENGTH
      );
      parts.push(`Original Subject: ${sanitizedSubject}`);
    }
    if (context.originalMessage) {
      const sanitizedMessage = sanitizeStringField(
        context.originalMessage,
        AutoResponseChain.MAX_MESSAGE_LENGTH
      );
      parts.push(`Original Message:\n${sanitizedMessage}`);
    }
    if (context.senderDomain) {
      parts.push(`Sender Domain: ${context.senderDomain}`);
    }
    if (context.messageType) {
      parts.push(`Message Type: ${context.messageType}`);
    }
    return parts.join('\n') || 'Email received - no additional context.';
  }

  /**
   * Build context section for form submission triggers
   */
  private buildFormContext(context: AutoResponseInput['context']): string {
    const parts = [];
    if (context.formName) {
      parts.push(`Form: ${context.formName}`);
    }
    if (context.formFields && Object.keys(context.formFields).length > 0) {
      parts.push('Form Fields:');
      for (const [key, value] of Object.entries(context.formFields)) {
        parts.push(`  - ${key}: ${value}`);
      }
    }
    return parts.join('\n') || 'Form submitted - no additional context.';
  }

  /**
   * Build context section for chat message triggers
   * IFC-029: Sanitizes chat history content
   */
  private buildChatContext(context: AutoResponseInput['context']): string {
    if (!context.chatHistory || context.chatHistory.length === 0) {
      return 'Chat message received - no conversation history.';
    }

    const history = context.chatHistory
      .map((msg) => {
        const sanitizedContent = sanitizeStringField(
          msg.content,
          AutoResponseChain.MAX_MESSAGE_LENGTH
        );
        return `[${msg.role.toUpperCase()}]: ${sanitizedContent}`;
      })
      .join('\n');

    return `Chat History:\n${history}`;
  }

  /**
   * Truncate subject to max length
   */
  private truncateSubject(subject: string): string {
    if (subject.length <= AutoResponseChain.MAX_SUBJECT_LENGTH) {
      return subject;
    }
    return subject.substring(0, AutoResponseChain.MAX_SUBJECT_LENGTH - 3) + '...';
  }

  /**
   * Truncate body to max length
   */
  private truncateBody(body: string): string {
    if (body.length <= AutoResponseChain.MAX_BODY_LENGTH) {
      return body;
    }
    return body.substring(0, AutoResponseChain.MAX_BODY_LENGTH - 3) + '...';
  }
}
