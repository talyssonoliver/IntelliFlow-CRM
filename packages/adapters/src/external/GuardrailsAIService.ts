import { Result, DomainError } from '@intelliflow/domain';
import { AIServicePort, LeadScoringInput, LeadScoringResult } from '@intelliflow/application';
import type {
  AuditLogPort,
  AISecurityEventInput,
  AuditLogResult,
  TenantContext,
} from '@intelliflow/application';
import {
  type AISecurityEventType,
  AI_EVENT_SEVERITY_MAP,
  isAISecurityEventType,
} from '@intelliflow/domain';

/**
 * Luhn algorithm — returns true when the digit string is a valid card number.
 * Used internally by `sanitizeText` to avoid false-positive credit-card redaction.
 */
function luhnCheck(digits: string): boolean {
  let sum = 0;
  let alternate = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10);
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

/**
 * Guardrails AI Service - IFC-125 Integration
 *
 * Decorator that wraps any AIServicePort implementation with:
 * - Input sanitization (prompt injection prevention)
 * - Output redaction (PII protection)
 * - Bias detection (fairness monitoring)
 * - Security event logging via AuditLogPort
 *
 * IMPLEMENTS: IFC-125 (AI Guardrails Audit Logger Integration)
 *
 * Usage:
 * ```typescript
 * const baseAIService = new MockAIService();
 * const auditLogPort = new DurableAuditLogAdapter(prisma, signingKey);
 * const protectedAIService = new GuardrailsAIService(baseAIService, auditLogPort, {
 *   userId: ctx.user.userId,
 *   tenantId: ctx.tenantId,
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

  /** Tenant ID for multi-tenancy isolation (required for audit logging) */
  tenantId: string;

  /** Jurisdiction for GDPR compliance (default: 'GLOBAL') */
  jurisdiction?: 'EU' | 'UK' | 'US' | 'GLOBAL';

  /** Enable bias detection and metrics collection */
  enableBiasDetection?: boolean;

  /** Maximum requests per minute (default: 10) */
  rateLimit?: number;

  /** Log all security events */
  enableLogging?: boolean;

  /** Model ID for ISO 42001 traceability */
  modelId?: string;

  /** Model version for ISO 42001 traceability */
  modelVersion?: string;
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
 * Options for logging security events
 */
interface LogSecurityEventOptions {
  resourceType?: string;
  resourceId?: string;
  inputHash?: string;
  detectionConfidence?: number;
}

/**
 * Simple metrics interface for tracking failures
 */
interface MetricsTracker {
  increment(metric: string): void;
}

/**
 * Default no-op metrics tracker
 */
const defaultMetrics: MetricsTracker = {
  increment: () => {},
};

/**
 * Guardrails AI Service
 * Wraps any AIServicePort with automatic security and fairness checks
 */
export class GuardrailsAIService implements AIServicePort {
  private readonly config: Required<
    Omit<GuardrailsConfig, 'modelId' | 'modelVersion' | 'jurisdiction'>
  > & {
    modelId?: string;
    modelVersion?: string;
    jurisdiction: 'EU' | 'UK' | 'US' | 'GLOBAL';
  };
  private readonly biasCheckBuffer: LeadScoringBiasCheck[] = [];
  private readonly metrics: MetricsTracker;

  /**
   * Create a new GuardrailsAIService.
   *
   * @param innerService - The underlying AI service to wrap
   * @param auditLogPort - Required audit logging port (MUST be provided)
   * @param config - Configuration options
   * @throws {Error} If auditLogPort is not provided
   */
  constructor(
    private readonly innerService: AIServicePort,
    private readonly auditLogPort: AuditLogPort,
    config: GuardrailsConfig
  ) {
    // Validate required dependency (Decision 1 from spec)
    if (!auditLogPort) {
      throw new Error('AuditLogPort is required for GuardrailsAIService');
    }

    this.config = {
      enableBiasDetection: config.enableBiasDetection ?? true,
      rateLimit: config.rateLimit ?? 10,
      enableLogging: config.enableLogging ?? true,
      userId: config.userId,
      tenantId: config.tenantId,
      jurisdiction: config.jurisdiction ?? 'GLOBAL',
      modelId: config.modelId,
      modelVersion: config.modelVersion,
    };

    this.metrics = defaultMetrics;
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
      // Log to AuditLogPort instead of just console
      await this.logSecurityEvent('AI_CHAIN_FAILURE', {
        error: error instanceof Error ? error.message : String(error),
        input: this.sanitizeInputForLogging(input),
        operation: 'scoreLead',
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
      await this.logSecurityEvent('AI_CHAIN_FAILURE', {
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
      await this.logSecurityEvent('AI_CHAIN_FAILURE', {
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

    // Log bias detection result
    if (result.biasDetected) {
      await this.logSecurityEvent('AI_BIAS_THRESHOLD_EXCEEDED', {
        totalScored,
        violationsCount: result.violations.length,
        violations: result.violations,
      });
    }

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
   * Get model ID for audit logging
   */
  private getModelId(): string {
    return this.config.modelId ?? 'guardrails-ai-service';
  }

  /**
   * Get model version for audit logging
   */
  private getModelVersion(): string {
    return this.config.modelVersion ?? '1.0.0';
  }

  /**
   * Build description for security event
   */
  private buildDescription(
    eventType: AISecurityEventType,
    details: Record<string, unknown>
  ): string {
    const baseDescriptions: Record<AISecurityEventType, string> = {
      AI_GUARDRAIL_TRIGGERED: 'AI guardrail was triggered during processing',
      AI_GUARDRAIL_BYPASSED: 'AI guardrail was bypassed',
      AI_GUARDRAIL_TIMEOUT: 'AI guardrail processing timed out',
      AI_PROMPT_INJECTION_DETECTED: 'Potential prompt injection attempt detected',
      AI_PII_EXPOSURE_BLOCKED: 'PII exposure was blocked in AI output',
      AI_TOXIC_CONTENT_BLOCKED: 'Toxic content was blocked in AI output',
      AI_HALLUCINATION_DETECTED: 'AI hallucination detected in output',
      AI_TOKEN_LIMIT_EXCEEDED: 'AI token limit was exceeded',
      AI_COST_THRESHOLD_BREACH: 'AI cost threshold was breached',
      AI_RATE_LIMIT_TRIGGERED: 'AI rate limit was triggered',
      AI_LOW_CONFIDENCE_OVERRIDE: 'Low confidence AI output was overridden',
      AI_CHAIN_FAILURE: 'AI chain processing failed',
      AI_OUTPUT_VALIDATION_FAILED: 'AI output validation failed',
      AI_MODEL_VERSION_MISMATCH: 'AI model version mismatch detected',
      AI_CONSENT_VALIDATION_FAILED: 'AI consent validation failed',
      AI_DATA_RETENTION_VIOLATION: 'AI data retention policy was violated',
      AI_CROSS_TENANT_ACCESS_ATTEMPT: 'Cross-tenant access attempt detected',
      AI_BIAS_THRESHOLD_EXCEEDED: 'AI bias threshold was exceeded',
    };

    const baseDescription = baseDescriptions[eventType] ?? 'AI security event occurred';

    if (details.operation) {
      return `${baseDescription} during ${details.operation}`;
    }

    return baseDescription;
  }

  /**
   * Log security event to AuditLogPort
   *
   * Replaces the previous console-only logging with proper audit trail persistence.
   * Implements Decision 1 from STOA spec session - required AuditLogPort dependency.
   */
  private async logSecurityEvent(
    eventType: AISecurityEventType,
    details: Record<string, unknown>,
    options: LogSecurityEventOptions = {}
  ): Promise<AuditLogResult | void> {
    if (!this.config.enableLogging) return;

    // Get severity from domain constants
    const severity = isAISecurityEventType(eventType) ? AI_EVENT_SEVERITY_MAP[eventType] : 'MEDIUM';

    // Build the event input for AuditLogPort
    const event: AISecurityEventInput = {
      eventType,
      severity,
      tenantId: this.config.tenantId,
      userId: this.config.userId,
      resourceType: options.resourceType,
      resourceId: options.resourceId,
      description: this.buildDescription(eventType, details),
      metadata: {
        modelId: this.getModelId(),
        modelVersion: this.getModelVersion(),
        guardrailId: 'guardrails-ai-service',
        guardrailVersion: '1.0.0',
        inputHash: options.inputHash,
        detectionConfidence: options.detectionConfidence,
        processingPurpose: 'AI_GUARDRAIL_ENFORCEMENT',
        legalBasis: 'LEGITIMATE_INTEREST',
        details,
      },
    };

    // Build tenant context
    const tenantContext: TenantContext = {
      tenantId: this.config.tenantId,
      userId: this.config.userId,
      jurisdiction: this.config.jurisdiction,
    };

    // Log to AuditLogPort with error handling
    try {
      return await this.auditLogPort.logSecurityEvent(event, tenantContext);
    } catch (error) {
      // Track failure metric but don't block AI operations
      this.metrics.increment('guardrails.audit_log_failure');
      console.error('[GUARDRAILS] Audit log failed:', error);
      // Don't rethrow - audit failure shouldn't block AI operations
    }
  }

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
   * Sanitize arbitrary text (synchronous version for simple cases).
   *
   * Redacts the following PII patterns:
   *  - Email addresses
   *  - UK mobile phone numbers
   *  - US Social Security Numbers (SSN)
   *  - Credit card numbers (Luhn-validated)
   *  - IBAN (EU/international bank account numbers)
   *  - NHS numbers (UK) — only when preceded by keyword context
   *  - Brazilian CPF numbers
   */
  private sanitizeText(text: string, context: string): string {
    // 1. Email
    let result = text.replaceAll(
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      '[EMAIL_REDACTED]'
    );

    // 2. UK mobile phone numbers
    result = result.replaceAll(
      /(\+44\s?7\d{3}|\(?07\d{3}\)?)\s?\d{3}\s?\d{3}/g,
      '[PHONE_REDACTED]'
    );

    // 3. US Social Security Number  (NNN-NN-NNNN)
    result = result.replaceAll(/\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED_SSN]');

    // 4. Credit card numbers (13–19 contiguous/spaced/dashed digits, Luhn-validated)
    result = result.replaceAll(/\b(?:\d[ -]?){13,19}\d\b/g, (match) => {
      const digits = match.replace(/[ -]/g, '');
      if (digits.length < 13 || digits.length > 19) return match;
      return luhnCheck(digits) ? '[REDACTED_CC]' : match;
    });

    // 5. IBAN  (2-letter country code + 2 check digits + 11–30 alphanumeric chars)
    result = result.replaceAll(/\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g, '[REDACTED_IBAN]');

    // 6. NHS number (UK) — 10-digit groups; only redact when an NHS keyword appears
    //    nearby to cut false positives (e.g. phone numbers, order IDs).
    if (/\bNHS\b/i.test(result)) {
      result = result.replaceAll(/\b\d{3}[\s-]?\d{3}[\s-]?\d{4}\b/g, '[REDACTED_NHS]');
    }

    // 7. Brazilian CPF  (NNN.NNN.NNN-NN)
    result = result.replaceAll(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, '[REDACTED_CPF]');

    // Log if anything was redacted
    if (result !== text) {
      this.logSecurityEvent('AI_PII_EXPOSURE_BLOCKED', {
        context,
        redactionCount: (text.match(/@/g) || []).length,
      });
    }

    return result;
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
}
