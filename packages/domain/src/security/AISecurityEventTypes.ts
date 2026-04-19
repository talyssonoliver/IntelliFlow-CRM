/**
 * AI Security Event Types
 *
 * Domain constants for AI-specific security event types used in guardrails audit logging.
 *
 * IMPLEMENTS: IFC-125 (AI Guardrails Audit Logger Integration)
 *
 * These event types cover:
 * - Guardrail operations (trigger, bypass, timeout)
 * - Content safety (prompt injection, PII, toxic content, hallucination)
 * - Resource limits (tokens, cost, rate limiting)
 * - Confidence & quality (override, chain failure, validation)
 * - Compliance (consent, retention, cross-tenant, bias)
 *
 * @see docs/architecture/adr/ADR-007-data-governance.md
 * @see docs/security/owasp-checklist.md
 */

/**
 * Security severity levels for AI events
 * Aligned with apps/api/src/security/types.ts SecuritySeverity
 */
export type SecuritySeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/**
 * All AI security event types as a const array.
 * Using `as const` ensures:
 * - Array is readonly (immutable)
 * - Type inference extracts literal string union
 * - Runtime freeze behavior via TypeScript
 */
export const AI_SECURITY_EVENT_TYPES = [
  // Guardrail Events (3)
  'AI_GUARDRAIL_TRIGGERED',
  'AI_GUARDRAIL_BYPASSED',
  'AI_GUARDRAIL_TIMEOUT',

  // Content Safety Events (4)
  'AI_PROMPT_INJECTION_DETECTED',
  'AI_PII_EXPOSURE_BLOCKED',
  'AI_TOXIC_CONTENT_BLOCKED',
  'AI_HALLUCINATION_DETECTED',

  // Resource Limit Events (3)
  'AI_TOKEN_LIMIT_EXCEEDED',
  'AI_COST_THRESHOLD_BREACH',
  'AI_RATE_LIMIT_TRIGGERED',

  // Confidence & Quality Events (4)
  'AI_LOW_CONFIDENCE_OVERRIDE',
  'AI_CHAIN_FAILURE',
  'AI_OUTPUT_VALIDATION_FAILED',
  'AI_MODEL_VERSION_MISMATCH',

  // Compliance Events (4)
  'AI_CONSENT_VALIDATION_FAILED',
  'AI_DATA_RETENTION_VIOLATION',
  'AI_CROSS_TENANT_ACCESS_ATTEMPT',
  'AI_BIAS_THRESHOLD_EXCEEDED',
] as const;

// Runtime freeze to prevent modification
Object.freeze(AI_SECURITY_EVENT_TYPES);

/**
 * Union type of all AI security event types.
 * Derived from the const array for single source of truth.
 */
export type AISecurityEventType = (typeof AI_SECURITY_EVENT_TYPES)[number];

/**
 * Severity mapping for each AI security event type.
 *
 * Severity classification based on:
 * - CRITICAL: Immediate security threat, potential data breach
 * - HIGH: Significant security concern, compliance risk
 * - MEDIUM: Moderate concern, monitoring required
 * - LOW: Informational, minor deviation from expected behavior
 */
export const AI_EVENT_SEVERITY_MAP: Record<AISecurityEventType, SecuritySeverity> = {
  // Guardrail Events
  AI_GUARDRAIL_TRIGGERED: 'MEDIUM',
  AI_GUARDRAIL_BYPASSED: 'HIGH',
  AI_GUARDRAIL_TIMEOUT: 'MEDIUM',

  // Content Safety Events
  AI_PROMPT_INJECTION_DETECTED: 'CRITICAL',
  AI_PII_EXPOSURE_BLOCKED: 'HIGH',
  AI_TOXIC_CONTENT_BLOCKED: 'HIGH',
  AI_HALLUCINATION_DETECTED: 'MEDIUM',

  // Resource Limit Events
  AI_TOKEN_LIMIT_EXCEEDED: 'LOW',
  AI_COST_THRESHOLD_BREACH: 'MEDIUM',
  AI_RATE_LIMIT_TRIGGERED: 'LOW',

  // Confidence & Quality Events
  AI_LOW_CONFIDENCE_OVERRIDE: 'MEDIUM',
  AI_CHAIN_FAILURE: 'HIGH',
  AI_OUTPUT_VALIDATION_FAILED: 'MEDIUM',
  AI_MODEL_VERSION_MISMATCH: 'LOW',

  // Compliance Events
  AI_CONSENT_VALIDATION_FAILED: 'HIGH',
  AI_DATA_RETENTION_VIOLATION: 'HIGH',
  AI_CROSS_TENANT_ACCESS_ATTEMPT: 'CRITICAL',
  AI_BIAS_THRESHOLD_EXCEEDED: 'HIGH',
};

// Runtime freeze to prevent modification
Object.freeze(AI_EVENT_SEVERITY_MAP);

/**
 * Type guard to check if a value is a valid AI security event type.
 *
 * @param value - The value to check
 * @returns True if the value is a valid AISecurityEventType
 *
 * @example
 * ```typescript
 * const eventType: unknown = 'AI_PROMPT_INJECTION_DETECTED';
 * if (isAISecurityEventType(eventType)) {
 *   // eventType is now typed as AISecurityEventType
 *   const severity = AI_EVENT_SEVERITY_MAP[eventType];
 * }
 * ```
 */
export function isAISecurityEventType(value: unknown): value is AISecurityEventType {
  if (typeof value !== 'string') {
    return false;
  }
  return (AI_SECURITY_EVENT_TYPES as readonly string[]).includes(value);
}

/**
 * Get the severity level for an AI security event type.
 *
 * @param eventType - The event type to look up
 * @returns The severity level, or 'MEDIUM' as default for unknown types
 */
export function getAIEventSeverity(eventType: string): SecuritySeverity {
  if (isAISecurityEventType(eventType)) {
    return AI_EVENT_SEVERITY_MAP[eventType];
  }
  return 'MEDIUM';
}
