import { Result, DomainError } from '@intelliflow/domain';
import {
  AIServicePort,
  LeadScoringInput,
  LeadScoringResult,
  type AIServiceCallOptions,
} from '@intelliflow/application';
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

  /**
   * Maximum requests per minute per tenant and actor
   * (default: DEFAULT_GUARDRAILS_RATE_LIMIT_PER_MIN)
   */
  rateLimit?: number;

  /** Log all security events */
  enableLogging?: boolean;

  /** Model ID for ISO 42001 traceability */
  modelId?: string;

  /** Model version for ISO 42001 traceability */
  modelVersion?: string;
}

/**
 * Per-tenant AI requests per minute when the deployment sets no limit. The API
 * runs every call as the system actor, so this bucket is shared by every user of
 * a tenant: it must sit above a normal bulk action (bulk scoring, an import),
 * or that action fails with AI_RATE_LIMITED. 120 is a starting point; the right
 * number should come from real usage (#1043).
 */
export const DEFAULT_GUARDRAILS_RATE_LIMIT_PER_MIN = 120;

/**
 * A configured limit (the API passes Number(AI_GUARDRAILS_RATE_LIMIT_PER_MIN)).
 * Anything but a positive integer (unset, NaN, 0, negative, fractional) falls
 * back to the default: a bad value must neither disable the limit nor block
 * every call.
 */
function rateLimitOrDefault(value: number | undefined): number {
  return Number.isInteger(value) && (value as number) > 0
    ? (value as number)
    : DEFAULT_GUARDRAILS_RATE_LIMIT_PER_MIN;
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
  /** The call's real tenant (opts.tenantId); falls back to config.tenantId. */
  tenantId?: string;
  /** The requesting user (opts.userId); falls back to the configured system actor. */
  userId?: string;
}

/** Generic message per operation; the distinct code says what actually failed. */
const GENERIC_FAILURE_MESSAGE = {
  scoreLead: 'AI service request failed security validation',
  qualifyLead: 'AI qualification failed security validation',
  generateEmail: 'Email generation failed security validation',
} as const;

const PROMPT_GUARD_CODES = new Set([
  'AI_PROMPT_STRUCTURE_INVALID',
  'AI_PROMPT_REJECTED',
  'AI_RATE_LIMITED',
]);

/**
 * Map a caught error to a failure code. An invalid prompt structure is a bug in
 * our own call (e.g. a bad configured actor id), not an attack, so it gets its
 * own code and a console error instead of hiding behind the generic one.
 */
function failureCodeFor(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code !== 'string' || !PROMPT_GUARD_CODES.has(code)) return 'AI_GUARDRAILS_ERROR';
  return code === 'AI_PROMPT_STRUCTURE_INVALID' ? 'AI_GUARDRAILS_CONFIG_ERROR' : code;
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
      rateLimit: rateLimitOrDefault(config.rateLimit),
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
   * Score a lead with guardrails. IFC-212 follow-up: forwards opts (tenantId,
   * leadId) to the underlying AIServicePort so queue-backed adapters tag the
   * worker payload with the real keys instead of the literal default fallback.
   */
  async scoreLead(
    input: LeadScoringInput,
    opts?: AIServiceCallOptions
  ): Promise<Result<LeadScoringResult, DomainError>> {
    try {
      // Step 1: Sanitize input
      const sanitizedInput = await this.sanitizeInput(input, opts);

      // Step 2: Call underlying AI service (forward opts so queue adapters
      //         receive the real tenantId / leadId).
      const result = await this.innerService.scoreLead(sanitizedInput, opts);

      if (result.isFailure) {
        return result;
      }

      // Step 3: Redact PII from output
      const safeResult = this.sanitizeOutput(result.value, opts);

      // Step 4: Collect bias metrics (if enabled)
      if (this.config.enableBiasDetection) {
        this.collectBiasMetrics(input, safeResult);
      }

      return Result.ok(safeResult);
    } catch (error) {
      return this.failCall('scoreLead', error, opts, {
        input: this.sanitizeInputForLogging(input),
      });
    }
  }

  /**
   * Qualify a lead with guardrails. IFC-212 follow-up: forwards opts to the
   * underlying AIServicePort.
   */
  async qualifyLead(
    input: LeadScoringInput,
    opts?: AIServiceCallOptions
  ): Promise<Result<boolean, DomainError>> {
    try {
      // Step 1: Sanitize input
      const sanitizedInput = await this.sanitizeInput(input, opts);

      // Step 2: Call underlying AI service (forward opts).
      const result = await this.innerService.qualifyLead(sanitizedInput, opts);

      return result;
    } catch (error) {
      return this.failCall('qualifyLead', error, opts);
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
      return this.failCall('generateEmail', error, undefined, { leadId });
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
   * Audit a failed call (under the call's real tenant) and return the generic
   * user-facing message with a distinct code. The real error stays in the audit
   * details, and a config error is also written to the console.
   */
  private async failCall<T>(
    operation: keyof typeof GENERIC_FAILURE_MESSAGE,
    error: unknown,
    opts: AIServiceCallOptions | undefined,
    extra: Record<string, unknown> = {}
  ): Promise<Result<T, DomainError>> {
    const errorCode = failureCodeFor(error);
    const message = error instanceof Error ? error.message : String(error);
    if (errorCode === 'AI_GUARDRAILS_CONFIG_ERROR') {
      console.error(`[GUARDRAILS] ${errorCode} in ${operation}:`, message);
    }

    await this.logSecurityEvent(
      'AI_CHAIN_FAILURE',
      { error: message, errorCode, operation, ...extra },
      {
        tenantId: opts?.tenantId,
        userId: opts?.userId,
        resourceType: opts?.leadId ? 'lead' : undefined,
        resourceId: opts?.leadId,
      }
    );

    return Result.fail({
      message: GENERIC_FAILURE_MESSAGE[operation],
      code: errorCode,
    } as DomainError);
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

    const tenantId = options.tenantId ?? this.config.tenantId;
    const userId = options.userId ?? this.config.userId;

    // Build the event input for AuditLogPort
    const event: AISecurityEventInput = {
      eventType,
      severity,
      tenantId,
      userId,
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
      tenantId,
      userId,
      jurisdiction: this.config.jurisdiction,
    };

    // Log to AuditLogPort with error handling
    try {
      return await this.auditLogPort.logSecurityEvent(event, tenantContext);
    } catch (error) {
      // Don't rethrow - audit failure shouldn't block AI operations
      this.reportAuditLogFailure(error);
    }
  }

  /** Track an audit-log failure without blocking AI operations. */
  private reportAuditLogFailure(error: unknown): void {
    this.metrics.increment('guardrails.audit_log_failure');
    console.error('[GUARDRAILS] Audit log failed:', error);
  }

  /**
   * Sanitize lead scoring input
   */
  private async sanitizeInput(
    input: LeadScoringInput,
    opts?: AIServiceCallOptions
  ): Promise<LeadScoringInput> {
    // Import sanitizer from the canonical domain module (QUAL-015: was a
    // locally-duplicated ../shared/prompt-sanitizer.js that had diverged
    // from apps/api's copy; both now live in @intelliflow/domain).
    const { sanitizationPipeline } = await import('@intelliflow/domain');

    // Build prompt from input
    const promptText = this.buildPromptFromInput(input);

    // Sanitize the prompt as the requesting user (else the system actor). The
    // rate-limit bucket stays per tenant: keyed on the configured actor, not the
    // user, so a tenant's budget is shared by its users.
    const tenantId = opts?.tenantId ?? this.config.tenantId;
    await sanitizationPipeline({
      text: promptText,
      userId: opts?.userId ?? this.config.userId,
      context: { operation: 'lead_scoring', leadEmail: input.email },
      rateLimitKey: `${tenantId}:${this.config.userId}`,
      maxRequestsPerMinute: this.config.rateLimit,
    });

    // Return original input (sanitization validated it's safe)
    // In a real implementation, we might parse sanitized.text back
    // For now, if sanitization passes, we trust the input
    return input;
  }

  /**
   * Sanitize AI output
   */
  private sanitizeOutput(
    result: LeadScoringResult,
    opts?: AIServiceCallOptions
  ): LeadScoringResult {
    // For numeric outputs, no sanitization needed
    // But we redact PII from reasoning if present
    if (result.reasoning) {
      const sanitized = this.sanitizeText(result.reasoning, 'reasoning', opts);
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
  private sanitizeText(text: string, context: string, opts?: AIServiceCallOptions): string {
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
      // sanitizeText is synchronous, so the audit write is fire-and-forget; a rejection
      // (e.g. while building the event, before the port call) is reported like any audit failure.
      this.logSecurityEvent(
        'AI_PII_EXPOSURE_BLOCKED',
        { context, redactionCount: (text.match(/@/g) || []).length },
        {
          tenantId: opts?.tenantId,
          userId: opts?.userId,
          resourceType: opts?.leadId ? 'lead' : undefined,
          resourceId: opts?.leadId,
        }
      ).catch((error: unknown) => this.reportAuditLogFailure(error));
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
