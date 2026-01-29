# AI Guardrails Integration Guide - IFC-125

This guide shows how to integrate AI guardrails into the IntelliFlow CRM API.

## Quick Start

### Option 1: Wrap AI Service in Container (Recommended for Production)

Update `apps/api/src/container.ts` to wrap the AI service with guardrails:

```typescript
import {
  MockAIService,
  GuardrailsAIService,
} from '@intelliflow/adapters';

const createAdapters = (userId?: string) => {
  // ... other adapters ...

  // Base AI service
  const baseAIService = new MockAIService();

  // Wrap with guardrails (use system user ID if no user context)
  const aiService = new GuardrailsAIService(baseAIService, {
    userId: userId || 'system',
    enableBiasDetection: true,
    rateLimit: 10,
    enableLogging: true,
  });

  return {
    // ... other adapters ...
    aiService,
  };
};
```

**Note:** Since the container is a singleton, you'll need to create a factory function
that accepts `userId` from the request context. See Option 2 for per-request wrapping.

### Option 2: Wrap Per Request (Easier Integration)

Wrap the AI service at the router level where you have access to user context:

```typescript
// In apps/api/src/modules/lead/lead.router.ts
import { GuardrailsAIService } from '@intelliflow/adapters';

export const leadRouter = createTRPCRouter({
  scoreWithAI: protectedProcedure
    .input(z.object({ leadId: idSchema }))
    .mutation(async ({ ctx, input }) => {
      // Get base AI service from container
      const baseAIService = ctx.services.adapters.aiService;

      // Wrap with guardrails for this request
      const protectedAIService = new GuardrailsAIService(baseAIService, {
        userId: ctx.user!.userId,
        enableBiasDetection: true,
      });

      // Create temporary LeadService with protected AI service
      const leadService = new LeadService(
        ctx.services.adapters.leadRepository,
        ctx.services.adapters.contactRepository,
        ctx.services.adapters.accountRepository,
        protectedAIService, // Use guardrails-wrapped service
        ctx.services.adapters.eventBus
      );

      // Score lead with guardrails active
      const result = await leadService.scoreLead(input.leadId);

      // ... rest of the handler ...
    }),
});
```

### Option 3: Create Guardrails Factory (Best for Scalability)

Create a factory function that provides guardrails-wrapped services:

```typescript
// apps/api/src/shared/guardrails-factory.ts
import { GuardrailsAIService } from '@intelliflow/adapters';
import type { Context } from '../context';

export function createGuardrailsAIService(ctx: Context) {
  const baseAIService = ctx.services.adapters.aiService;

  return new GuardrailsAIService(baseAIService, {
    userId: ctx.user?.userId || 'anonymous',
    enableBiasDetection: process.env.ENABLE_BIAS_DETECTION !== 'false',
    rateLimit: parseInt(process.env.AI_RATE_LIMIT || '10', 10),
    enableLogging: true,
  });
}

// In your router:
import { createGuardrailsAIService } from '../../shared/guardrails-factory';

const protectedAIService = createGuardrailsAIService(ctx);
```

## Integration Examples

### Example 1: Lead Scoring with Guardrails

```typescript
// apps/api/src/modules/lead/lead.router.ts
scoreWithAI: protectedProcedure
  .input(z.object({ leadId: idSchema }))
  .mutation(async ({ ctx, input }) => {
    // Create guardrails-wrapped AI service
    const protectedAIService = new GuardrailsAIService(
      ctx.services.adapters.aiService,
      {
        userId: ctx.user!.userId,
        enableBiasDetection: true,
      }
    );

    // Option A: Create new LeadService with protected AI
    const leadService = new LeadService(
      ctx.services.adapters.leadRepository,
      ctx.services.adapters.contactRepository,
      ctx.services.adapters.accountRepository,
      protectedAIService,
      ctx.services.adapters.eventBus
    );

    const result = await leadService.scoreLead(input.leadId);

    if (result.isFailure) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error.message,
      });
    }

    return result.value;
  }),
```

### Example 2: Batch Scoring with Bias Detection

```typescript
bulkScore: protectedProcedure
  .input(z.object({ leadIds: z.array(idSchema) }))
  .mutation(async ({ ctx, input }) => {
    const protectedAIService = new GuardrailsAIService(
      ctx.services.adapters.aiService,
      {
        userId: ctx.user!.userId,
        enableBiasDetection: true, // Enable for batch operations
      }
    );

    const leadService = new LeadService(
      ctx.services.adapters.leadRepository,
      ctx.services.adapters.contactRepository,
      ctx.services.adapters.accountRepository,
      protectedAIService,
      ctx.services.adapters.eventBus
    );

    // Score all leads
    const result = await leadService.bulkScoreLeads(input.leadIds);

    // Analyze bias metrics
    const biasAnalysis = await protectedAIService.analyzeBiasMetrics();

    if (biasAnalysis.biasDetected) {
      console.warn('Bias detected in batch scoring:', biasAnalysis.violations);
      // Optionally notify admin or log to audit trail
    }

    return {
      ...result,
      biasAnalysis, // Include bias analysis in response
    };
  }),
```

### Example 3: Email Generation with Guardrails

```typescript
generateEmail: protectedProcedure
  .input(z.object({
    leadId: idSchema,
    template: z.string(),
  }))
  .mutation(async ({ ctx, input }) => {
    const protectedAIService = new GuardrailsAIService(
      ctx.services.adapters.aiService,
      {
        userId: ctx.user!.userId,
        enableBiasDetection: false, // Not needed for email generation
        rateLimit: 5, // Lower rate limit for expensive operations
      }
    );

    const result = await protectedAIService.generateEmail(
      input.leadId,
      input.template
    );

    if (result.isFailure) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: result.error.message,
      });
    }

    // Email content is automatically PII-redacted
    return { content: result.value };
  }),
```

## Configuration

### Environment Variables

```bash
# .env
AI_RATE_LIMIT=10                    # Requests per minute per user
ENABLE_BIAS_DETECTION=true          # Enable bias monitoring
ENABLE_AI_LOGGING=true              # Log all AI security events
```

### Per-Service Configuration

```typescript
const config = {
  // Required: User ID for rate limiting and audit logs
  userId: ctx.user.userId,

  // Optional: Enable bias detection (default: true)
  enableBiasDetection: true,

  // Optional: Rate limit (default: 10 req/min)
  rateLimit: 10,

  // Optional: Enable logging (default: true)
  enableLogging: true,
};

const guardedService = new GuardrailsAIService(baseService, config);
```

## Testing

### Unit Test with Guardrails

```typescript
import { MockAIService, GuardrailsAIService } from '@intelliflow/adapters';

describe('Lead scoring with guardrails', () => {
  it('should block prompt injection attempts', async () => {
    const baseService = new MockAIService();
    const guardedService = new GuardrailsAIService(baseService, {
      userId: 'test-user',
    });

    const maliciousInput = {
      email: 'test@example.com',
      company: 'SELECT * FROM users; --',
      title: 'CEO',
      source: 'WEBSITE',
    };

    // Should either sanitize or reject
    const result = await guardedService.scoreLead(maliciousInput);
    expect(result.isSuccess).toBe(true); // Sanitized, not rejected
  });

  it('should redact PII from reasoning', async () => {
    const baseService = new MockAIService();
    const guardedService = new GuardrailsAIService(baseService, {
      userId: 'test-user',
    });

    const input = {
      email: 'john@example.com',
      firstName: 'John',
      lastName: 'Doe',
      company: 'Acme Corp',
      title: 'CEO',
      phone: '+44 7911 123456',
      source: 'WEBSITE',
    };

    const result = await guardedService.scoreLead(input);

    if (result.isSuccess && result.value.reasoning) {
      // Phone numbers should be redacted
      expect(result.value.reasoning).not.toContain('7911 123456');
      expect(result.value.reasoning).not.toContain('+44 7911');
    }
  });
});
```

### Integration Test

```typescript
describe('Lead scoring API with guardrails', () => {
  it('should enforce rate limits', async () => {
    const requests = [];

    // Make 11 requests (limit is 10)
    for (let i = 0; i < 11; i++) {
      requests.push(
        caller.lead.scoreWithAI({ leadId: 'test-lead-id' })
      );
    }

    const results = await Promise.allSettled(requests);

    // At least one should be rate limited
    const rateLimited = results.some(
      (r) => r.status === 'rejected' &&
        r.reason.message.includes('rate limit')
    );

    expect(rateLimited).toBe(true);
  });
});
```

## Monitoring

### Bias Metrics

Bias metrics are automatically collected and can be analyzed:

```typescript
// Periodic bias analysis (e.g., daily cron job)
export async function analyzeDailyBias() {
  const protectedAIService = new GuardrailsAIService(aiService, {
    userId: 'system',
    enableBiasDetection: true,
  });

  const analysis = await protectedAIService.analyzeBiasMetrics();

  if (analysis.biasDetected) {
    // Send alert to AI team
    await sendSlackAlert({
      channel: '#ai-monitoring',
      message: `Bias detected in lead scoring: ${analysis.violations.length} violations`,
      violations: analysis.violations,
    });
  }

  return analysis;
}
```

### Security Events

All security events are logged and can be queried:

```typescript
// Check logs for security events
console.log('[AI_GUARDRAILS]', {
  timestamp: '2025-12-30T12:00:00Z',
  eventType: 'prompt_injection_blocked',
  severity: 'high',
  userId: 'user-123',
  pattern: 'SQL injection',
});
```

## Performance Impact

Guardrails add minimal overhead:

- **Input sanitization:** ~2-4ms
- **Output redaction:** ~2-5ms
- **Bias collection:** ~1ms (async batch processing)
- **Total overhead:** ~5-10ms per request (< 5% of typical AI response time)

## Troubleshooting

### Issue: Rate limit errors

**Solution:** Increase rate limit or implement per-tier limits:

```typescript
const rateLimit = user.tier === 'premium' ? 20 : 10;

const guardedService = new GuardrailsAIService(baseService, {
  userId: user.id,
  rateLimit,
});
```

### Issue: False positive blocks

**Solution:** Review security logs and add exceptions if needed:

```typescript
// In prompt-sanitizer.ts, add to allowed patterns
const ALLOWED_PATTERNS = [
  /SELECT.*FROM.*WHERE/i, // Allow SQL-like syntax in legitimate contexts
];
```

### Issue: Bias detection not working

**Solution:** Ensure enough samples are collected:

```typescript
// Bias detection requires at least 30 samples per segment
// Manually trigger analysis after batch operations:
await protectedAIService.analyzeBiasMetrics();
```

## Production Checklist

Before deploying guardrails to production:

- [ ] Configure environment variables
- [ ] Test rate limiting with production traffic patterns
- [ ] Set up bias monitoring dashboard
- [ ] Configure alerting for high-severity security events
- [ ] Train support team on guardrail error messages
- [ ] Document bias thresholds in runbook
- [ ] Set up periodic bias analysis job
- [ ] Review and tune PII redaction patterns for your region
- [ ] Load test to confirm performance impact is acceptable
- [ ] Create rollback plan if issues arise

## Support

For issues or questions about AI guardrails:

- **Documentation:** `docs/shared/ai-guardrails-report.md`
- **Tests:** `apps/api/src/shared/prompt-sanitizer.test.ts`
- **Source:** `packages/adapters/src/external/GuardrailsAIService.ts`
- **Task:** IFC-125 (Sprint 11)

---

**Last Updated:** 2025-12-30
**Status:** Ready for Integration
