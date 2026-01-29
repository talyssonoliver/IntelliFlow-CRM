import { Result, DomainError } from '@intelliflow/domain';
import {
  AIServicePort,
  LeadScoringInput,
  LeadScoringResult,
} from '@intelliflow/application';

/**
 * Guardrails AI Service - IFC-125 Integration
 *
 * Decorator that wraps any AIServicePort implementation with:
 * - Input sanitization (prompt injection prevention)
 * - Output redaction (PII protection)
 * - Bias detection (fairness monitoring)
 * - Security event logging
 *
 * Usage:
 * ```typescript
 * const baseAIService = new MockAIService();
 * const protectedAIService = new GuardrailsAIService(baseAIService, {
 *   userId: ctx.user.userId,
 *   enableBiasDetection: true,
 * });
 * ```
 */

/**
 * Types for guardrails (defined here to avoid circular dependencies)
 * The actual implementations are lazy-loaded at runtime from apps/api
 */
export interface SafePrompt {
  text: string;
  userId: string;
  context?: Record<string, unknown>;
  maxTokens: number;
}

export interface SanitizedOutput {
  content: string;
  redactedFields: string[];
  containsPII: boolean;
  safe: boolean;
}

/**
 * Configuration for guardrails
 */
export interface GuardrailsConfig {
  /** User ID for rate limiting and audit logging */
  userId: string;

  /** Enable bias detection and metrics collection */
  enableBiasDetection?: boolean;

  /** Maximum requests per minute (default: 10) */
  rateLimit?: number;

  /** Log all security events */
  enableLogging?: boolean;
}

/**
 * Bias check data for lead scoring
 */
export interface LeadScoringBiasCheck {
  leadId: string;
  score: number;
  metadata: {
    emailDomain?: string;
    jobTitle?: string;
    company?: string;
    source?: string;
  };
}

/**
 * Guardrails AI Service
 * Wraps any AIServicePort with automatic security and fairness checks
 */
export class GuardrailsAIService implements AIServicePort {
  private readonly config: Required<GuardrailsConfig>;
  private readonly biasCheckBuffer: LeadScoringBiasCheck[] = [];

  constructor(
    private readonly innerService: AIServicePort,
    config: GuardrailsConfig
  ) {
    this.config = {
      enableBiasDetection: config.enableBiasDetection ?? true,
      rateLimit: config.rateLimit ?? 10,
      enableLogging: config.enableLogging ?? true,
      userId: config.userId,
    };
  }

  /**
   * Score a lead with guardrails
   */
  async scoreLead(input: LeadScoringInput): Promise<Result<LeadScoringResult, DomainError>> {
    try {
      // Step 1: Sanitize input
      const sanitizedInput = await this.sanitizeInput(input);

      // Step 2: Call underlying AI service
      const result = await this.innerService.scoreLead(sanitizedInput);

      if (result.isFailure) {
        return result;
      }

      // Step 3: Redact PII from output
      const safeResult = this.sanitizeOutput(result.value);

      // Step 4: Collect bias metrics (if enabled)
      if (this.config.enableBiasDetection) {
        this.collectBiasMetrics(input, safeResult);
      }

      return Result.ok(safeResult);
    } catch (error) {
      this.logSecurityEvent('ai_service_error', 'high', {
        error: error instanceof Error ? error.message : String(error),
        input: this.sanitizeInputForLogging(input),
      });

      return Result.fail({
        message: 'AI service request failed security validation',
        code: 'AI_GUARDRAILS_ERROR',
      } as DomainError);
    }
  }

  /**
   * Qualify a lead with guardrails
   */
  async qualifyLead(input: LeadScoringInput): Promise<Result<boolean, DomainError>> {
    try {
      // Step 1: Sanitize input
      const sanitizedInput = await this.sanitizeInput(input);

      // Step 2: Call underlying AI service
      const result = await this.innerService.qualifyLead(sanitizedInput);

      return result;
    } catch (error) {
      this.logSecurityEvent('ai_service_error', 'high', {
        error: error instanceof Error ? error.message : String(error),
        operation: 'qualifyLead',
      });

      return Result.fail({
        message: 'AI qualification failed security validation',
        code: 'AI_GUARDRAILS_ERROR',
      } as DomainError);
    }
  }

  /**
   * Generate email with guardrails
   */
  async generateEmail(leadId: string, template: string): Promise<Result<string, DomainError>> {
    try {
      // Step 1: Sanitize template (prevent prompt injection via template)
      const sanitizedTemplate = await this.sanitizeText(template, 'email_template');

      // Step 2: Call underlying AI service
      const result = await this.innerService.generateEmail(leadId, sanitizedTemplate);

      if (result.isFailure) {
        return result;
      }

      // Step 3: Redact PII from generated email
      const safeEmail = this.sanitizeText(result.value, 'generated_email');

      return Result.ok(safeEmail);
    } catch (error) {
      this.logSecurityEvent('ai_service_error', 'high', {
        error: error instanceof Error ? error.message : String(error),
        operation: 'generateEmail',
        leadId,
      });

      return Result.fail({
        message: 'Email generation failed security validation',
        code: 'AI_GUARDRAILS_ERROR',
      } as DomainError);
    }
  }

  /**
   * Get bias detection statistics
   * Call this periodically (e.g., end of day) to analyze fairness
   */
  async analyzeBiasMetrics(): Promise<{
    totalScored: number;
    biasDetected: boolean;
    violations: Array<{ segment: string; severity: string }>;
  }> {
    if (!this.config.enableBiasDetection || this.biasCheckBuffer.length === 0) {
      return {
        totalScored: 0,
        biasDetected: false,
        violations: [],
      };
    }

    // Import bias detector from shared utilities
    const { detectScoreBias } = await import('../shared/bias-detector.js');

    const result = detectScoreBias(this.biasCheckBuffer);

    const totalScored = this.biasCheckBuffer.length;

    // Clear buffer after analysis
    this.biasCheckBuffer.length = 0;

    return {
      totalScored,
      biasDetected: result.biasDetected,
      violations: result.violations.map((v: { segment: string; severity: string }) => ({
        segment: v.segment,
        severity: v.severity,
      })),
    };
  }

  // ============================================
  // PRIVATE HELPER METHODS
  // ============================================

  /**
   * Sanitize lead scoring input
   */
  private async sanitizeInput(input: LeadScoringInput): Promise<LeadScoringInput> {
    // Import sanitizer from shared utilities
    const { sanitizationPipeline } = await import('../shared/prompt-sanitizer.js');

    // Build prompt from input
    const promptText = this.buildPromptFromInput(input);

    // Sanitize the prompt
    const sanitized = await sanitizationPipeline({
      text: promptText,
      userId: this.config.userId,
      context: { operation: 'lead_scoring', leadEmail: input.email },
    });

    // Return original input (sanitization validated it's safe)
    // In a real implementation, we might parse sanitized.text back
    // For now, if sanitization passes, we trust the input
    return input;
  }

  /**
   * Sanitize AI output
   */
  private sanitizeOutput(result: LeadScoringResult): LeadScoringResult {
    // For numeric outputs, no sanitization needed
    // But we redact PII from reasoning if present
    if (result.reasoning) {
      const sanitized = this.sanitizeText(result.reasoning, 'reasoning');
      return {
        ...result,
        reasoning: sanitized,
      };
    }

    return result;
  }

  /**
   * Sanitize arbitrary text (synchronous version for simple cases)
   */
  private sanitizeText(text: string, context: string): string {
    // Simple synchronous redaction for common PII patterns
    // For full sanitization, use the async sanitizeOutput from prompt-sanitizer

    // Redact emails
    const emailRedacted = text.replace(
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      '[EMAIL_REDACTED]'
    );

    // Redact UK phone numbers
    const phoneRedacted = emailRedacted.replace(
      /(\+44\s?7\d{3}|\(?07\d{3}\)?)\s?\d{3}\s?\d{3}/g,
      '[PHONE_REDACTED]'
    );

    // Log if PII was found
    if (phoneRedacted !== text) {
      this.logSecurityEvent('pii_redacted', 'medium', {
        context,
        redactionCount: (text.match(/@/g) || []).length,
      });
    }

    return phoneRedacted;
  }

  /**
   * Build prompt text from lead input for sanitization
   */
  private buildPromptFromInput(input: LeadScoringInput): string {
    const parts: string[] = [];

    if (input.email) parts.push(`Email: ${input.email}`);
    if (input.firstName) parts.push(`First Name: ${input.firstName}`);
    if (input.lastName) parts.push(`Last Name: ${input.lastName}`);
    if (input.company) parts.push(`Company: ${input.company}`);
    if (input.title) parts.push(`Title: ${input.title}`);
    if (input.phone) parts.push(`Phone: ${input.phone}`);
    if (input.source) parts.push(`Source: ${input.source}`);

    return parts.join(', ');
  }

  /**
   * Sanitize input for logging (remove sensitive data)
   */
  private sanitizeInputForLogging(input: LeadScoringInput): Record<string, unknown> {
    return {
      email: input.email ? `${input.email[0]}***@***` : undefined,
      company: input.company,
      title: input.title,
      source: input.source,
      // Omit firstName, lastName, phone from logs
    };
  }

  /**
   * Collect bias metrics from scoring result
   */
  private collectBiasMetrics(input: LeadScoringInput, result: LeadScoringResult): void {
    const emailDomain = input.email.split('@')[1] || 'unknown';

    this.biasCheckBuffer.push({
      leadId: input.email, // Use email as ID for bias tracking
      score: result.score,
      metadata: {
        emailDomain,
        jobTitle: input.title,
        company: input.company,
        source: input.source,
      },
    });

    // Auto-analyze if buffer is large enough
    if (this.biasCheckBuffer.length >= 100) {
      this.analyzeBiasMetrics().catch((err) => {
        console.error('Bias analysis failed:', err);
      });
    }
  }

  /**
   * Log security event
   */
  private logSecurityEvent(
    eventType: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    details: Record<string, unknown>
  ): void {
    if (!this.config.enableLogging) return;

    const event = {
      timestamp: new Date().toISOString(),
      eventType,
      severity,
      userId: this.config.userId,
      ...details,
    };

    // In production, send to proper logging infrastructure
    console.warn('[AI_GUARDRAILS]', event);

    // TODO: Integrate with existing audit logger
    // import { logSecurityEvent } from '../../../../apps/api/src/shared/prompt-sanitizer';
    // logSecurityEvent({ userId: this.config.userId, eventType, severity, details });
  }
}
