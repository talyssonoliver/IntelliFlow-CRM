import { z } from 'zod';

// Simple logger - in production, integrate with existing logging infrastructure
const logger = {
  info: (data: unknown, msg: string) => console.log(`[INFO] ${msg}`, data),
  warn: (data: unknown, msg: string) => console.warn(`[WARN] ${msg}`, data),
  error: (data: unknown, msg: string) => console.error(`[ERROR] ${msg}`, data),
};

/**
 * Prompt Sanitizer - IFC-125
 *
 * Canonical implementation (QUAL-015): this module is the single source of
 * truth for prompt/PII sanitization. It previously existed as two
 * independently-maintained copies (`apps/api/src/shared/prompt-sanitizer.ts`
 * and `packages/adapters/src/shared/prompt-sanitizer.ts`) that had diverged.
 * Both call sites now import from `@intelliflow/domain`.
 *
 * Provides guardrails against:
 * - Prompt injection attacks
 * - Data leakage
 * - Malicious input
 * - PII exposure
 */

// ============================================
// VALIDATION SCHEMAS
// ============================================

/**
 * Safe prompt input schema
 * Enforces length limits and content validation
 */
export const safePromptSchema = z.object({
  text: z
    .string()
    .min(1, 'Prompt cannot be empty')
    .max(4000, 'Prompt exceeds maximum length (4000 characters)')
    .refine(
      (text) => {
        // Reject prompts with excessive repetition (potential attack)
        // Skip check for truncated content (ends with ...)
        if (text.endsWith('...')) {
          return true;
        }
        const uniqueChars = new Set(text.toLowerCase()).size;
        return uniqueChars / text.length > 0.1; // At least 10% unique characters
      },
      { message: 'Prompt contains suspicious repetition' }
    ),
  context: z.record(z.string(), z.unknown()).optional(),
  userId: z.string().uuid('Invalid user ID'),
  maxTokens: z.number().int().min(1).max(2000).default(500),
});

export type SafePrompt = z.infer<typeof safePromptSchema>;

/**
 * Sanitized output schema
 * Ensures AI responses don't leak sensitive data
 */
export const sanitizedOutputSchema = z.object({
  content: z.string(),
  redactedFields: z.array(z.string()).default([]),
  containsPII: z.boolean().default(false),
  safe: z.boolean(),
});

export type SanitizedOutput = z.infer<typeof sanitizedOutputSchema>;

// ============================================
// DANGEROUS PATTERNS
// ============================================

/**
 * Patterns that indicate potential attacks
 */
const DANGEROUS_PATTERNS = [
  // SQL Injection
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b.*\b(FROM|INTO|WHERE|TABLE)\b)/gi,

  // Command Injection
  // NOTE (QUAL-015): the two prior copies differed here - apps/api excluded
  // both `\r` and `\n` from the filler gap; packages/adapters excluded only
  // `\n`. Verified empirically that `[^\n]` is the strict superset: since
  // `[^\r\n]` only ever matches a subset of what `[^\n]` matches (fewer
  // excluded chars = broader match), every payload the `\r`+`\n`-excluding
  // version caught is also caught here, PLUS `\r`-delimited payloads such as
  // `"; \rrm -rf /"` that the stricter-looking `[^\r\n]` variant actually
  // missed (a bare `\r` breaks its filler-gap match before reaching the
  // command word). Keep `[^\n]` - it is the true union of both copies'
  // detection coverage. See packages/domain/src/security/__tests__/prompt-sanitizer.test.ts.
  /(;|\||&|`|\$\(|\$\{|&&|\|\|)[^\n]{0,200}(rm|cat|chmod|wget|curl|bash|sh|python|node|eval)/gi,

  // XSS Patterns
  /(<script|<iframe|javascript:|onerror=|onload=|eval\(|alert\()/gi,

  // Prompt Injection Keywords
  /(ignore (previous|all) (instructions|prompts)|system prompt|override|disregard|bypass|jailbreak)/gi,

  // Path Traversal
  /(\.\.\/|\.\.\\|%2e%2e%2f|%2e%2e\\)/gi,

  // Sensitive File Access
  /(\/etc\/passwd|\/etc\/shadow|\.env|config\.json|credentials|secret|api[_-]?key)/gi,
];

/**
 * PII patterns to detect and redact
 */
const PII_PATTERNS = {
  // UK Phone Numbers
  phone: /(\+44\s?7\d{3}|\(?07\d{3}\)?)\s?\d{3}\s?\d{3}/g,

  // Email addresses
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,

  // UK Postcodes
  postcode: /\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/gi,

  // National Insurance Numbers
  nino: /\b[A-Z]{2}\d{6}[A-D]\b/g,

  // Credit Card Numbers (simple pattern)
  creditCard: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
};

// ============================================
// SANITIZATION FUNCTIONS
// ============================================

/**
 * Sanitize user input before sending to AI model
 */
export function sanitizePrompt(input: unknown): {
  sanitized: SafePrompt;
  issues: string[];
} {
  const issues: string[] = [];

  // Validate input structure
  const validation = safePromptSchema.safeParse(input);
  if (!validation.success) {
    throw new Error(`Invalid prompt structure: ${validation.error.message}`);
  }

  const prompt = validation.data;

  // Check for dangerous patterns
  for (const pattern of DANGEROUS_PATTERNS) {
    // Bugfix (QUAL-015): DANGEROUS_PATTERNS entries carry the `g` flag, which
    // makes `.test()` stateful via `lastIndex`. These regex objects are
    // module-scoped and reused across every call, so without resetting
    // `lastIndex` a pattern that matched near the end of one prompt could
    // silently fail to match a later, shorter prompt - a false negative that
    // undermines detection reliability. Present in both original duplicate
    // copies; fixed here in the canonical module.
    pattern.lastIndex = 0;
    if (pattern.test(prompt.text)) {
      const issue = `Blocked dangerous pattern: ${pattern.source.slice(0, 50)}...`;
      issues.push(issue);
      logger.warn(
        {
          userId: prompt.userId,
          pattern: pattern.source,
        },
        'Prompt injection attempt detected'
      );
    }
  }

  // If any dangerous patterns detected, block the request
  if (issues.length > 0) {
    throw new Error(`Prompt contains dangerous patterns: ${issues.join(', ')}`);
  }

  // Remove control characters (C0 range 0x00-0x1F plus DEL 0x7F). Done as a
  // code-unit filter rather than a control-char regex so the module trips no
  // lint suppression for the no-control-regex rule — behavior is identical to
  // the previous /[\x00-\x1F\x7F]/g replace.
  const sanitized: SafePrompt = {
    ...prompt,
    text: prompt.text
      .split('')
      .filter((ch) => {
        const code = ch.charCodeAt(0);
        return code > 0x1f && code !== 0x7f;
      })
      .join(''),
  };

  return { sanitized, issues };
}

/**
 * Sanitize AI output before returning to user
 */
export function sanitizeOutput(output: string, userId: string): SanitizedOutput {
  let sanitized = output;
  const redactedFields: string[] = [];
  let containsPII = false;

  // Detect and redact PII
  for (const [fieldName, pattern] of Object.entries(PII_PATTERNS)) {
    // See lastIndex bugfix note in sanitizePrompt() - these are also
    // module-scoped global-flag regexes reused across calls.
    pattern.lastIndex = 0;
    const matches = pattern.exec(sanitized);
    if (matches) {
      containsPII = true;
      redactedFields.push(fieldName);

      // Redact with masked version
      sanitized = sanitized.replaceAll(pattern, (match) => {
        // For emails, preserve first 2 chars and domain suffix
        if (fieldName === 'email') {
          const atIndex = match.indexOf('@');
          if (atIndex > 0) {
            const localPart = match.slice(0, atIndex);
            const domain = match.slice(atIndex);
            const domainParts = domain.split('.');
            const tld = domainParts.at(-1);
            const maskedLocal =
              localPart.slice(0, 2) + '*'.repeat(Math.max(localPart.length - 2, 0));
            const maskedDomain = domainParts.length > 1 ? '***.' + tld : '***';
            return maskedLocal + '@' + maskedDomain;
          }
        }
        // For other PII, show first 2 and last 2 chars
        const masked =
          match.slice(0, 2) + '*'.repeat(Math.max(match.length - 4, 0)) + match.slice(-2);
        logger.warn(
          {
            userId,
            fieldName,
            originalLength: match.length,
          },
          'PII redacted from AI output'
        );
        return masked;
      });
    }
  }

  // Check for dangerous patterns in output (AI might be manipulated to output them)
  for (const pattern of DANGEROUS_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(sanitized)) {
      logger.error(
        {
          userId,
          pattern: pattern.source,
        },
        'AI output contains dangerous pattern - blocking response'
      );

      // Return safe error message instead
      return {
        content:
          'The AI response was blocked due to security concerns. Please try rephrasing your question.',
        redactedFields: ['entire_response'],
        containsPII: false,
        safe: false,
      };
    }
  }

  return {
    content: sanitized,
    redactedFields,
    containsPII,
    safe: true,
  };
}

/**
 * Rate limiting per user
 * Prevents abuse and excessive AI costs
 */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

/**
 * Reset rate limit for a user (for testing)
 */
export function resetRateLimit(userId?: string): void {
  if (userId) {
    rateLimitMap.delete(userId);
  } else {
    rateLimitMap.clear();
  }
}

export function checkRateLimit(userId: string, maxRequestsPerMinute = 10): boolean {
  const now = Date.now();
  const userLimit = rateLimitMap.get(userId);

  if (!userLimit || userLimit.resetAt < now) {
    // Reset limit
    rateLimitMap.set(userId, {
      count: 1,
      resetAt: now + 60000, // 1 minute from now
    });
    return true;
  }

  if (userLimit.count >= maxRequestsPerMinute) {
    logger.warn(
      {
        userId,
        count: userLimit.count,
        maxRequestsPerMinute,
      },
      'Rate limit exceeded for AI requests'
    );
    return false;
  }

  // Increment counter
  userLimit.count++;
  return true;
}

/**
 * Content length validation
 * Prevents excessively long prompts that waste tokens
 */
export function validateContentLength(
  text: string,
  maxLength = 4000
): { valid: boolean; truncated?: string } {
  if (text.length <= maxLength) {
    return { valid: true };
  }

  // Truncate to max length with ellipsis
  const truncated = text.slice(0, maxLength - 3) + '...';

  logger.info(
    {
      originalLength: text.length,
      maxLength,
      truncatedLength: truncated.length,
    },
    'Content truncated due to length'
  );

  return {
    valid: false,
    truncated,
  };
}

/**
 * Complete sanitization pipeline
 * Use this for all user-generated prompts before AI calls
 */
export async function sanitizationPipeline(input: {
  text: string;
  userId: string;
  context?: Record<string, unknown>;
}): Promise<SafePrompt> {
  // Rate limit check
  if (!checkRateLimit(input.userId)) {
    throw new Error('Rate limit exceeded. Please wait before making more AI requests.');
  }

  // Content length validation
  const lengthCheck = validateContentLength(input.text);
  const textToUse = lengthCheck.valid ? input.text : lengthCheck.truncated!;

  // Sanitize prompt
  const { sanitized } = sanitizePrompt({
    text: textToUse,
    userId: input.userId,
    context: input.context,
    maxTokens: 500,
  });

  return sanitized;
}
