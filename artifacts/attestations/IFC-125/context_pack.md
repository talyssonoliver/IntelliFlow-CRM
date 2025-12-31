# Context Pack: IFC-125 - AI Guardrails Implementation

**Task ID:** IFC-125
**Sprint:** 11
**Section:** AI Foundation
**Owner:** AI Specialist + Security (STOA-Security)
**Created:** 2025-12-30

## Task Overview

Implement comprehensive AI guardrails to protect against:
1. **Prompt Injection Attacks** - Prevent malicious prompt manipulation
2. **Data Leakage** - Redact sensitive information from AI outputs
3. **AI Bias** - Monitor and detect bias in AI responses

## Dependencies Verified

- ✅ **IFC-005** (DONE) - AI Scoring Pipeline
- ✅ **IFC-008** (DONE) - AI Integration Foundation

## Pre-requisites Review

Verified the following exist:
- ✅ `audit-matrix.yml` - Security audit configuration
- ✅ `docs/planning/adr/ADR-007-data-governance.md` - Data governance rules
- ✅ `apps/ai-worker/src/chains/scoring.chain.ts` - Existing AI chains
- ✅ AI models integrated (OpenAI, Ollama support)

## Implementation Plan

### 1. Prompt Sanitization (`prompt-sanitizer.ts`)

**Purpose:** Prevent prompt injection attacks by:
- Detecting and removing injection patterns (system prompts, role manipulation)
- Validating input length and format
- Escaping special characters
- Detecting encoded payloads (base64, unicode, etc.)

**Key Functions:**
```typescript
- sanitizePrompt(input: string): string
- detectInjectionPatterns(input: string): InjectionDetection
- validatePromptSafety(input: string): SafetyValidation
```

**Patterns to Detect:**
- System prompt override attempts ("Ignore previous instructions", "You are now...")
- Role manipulation ("Act as admin", "You have root access")
- Delimiter injection (attempting to break out of context)
- Encoded payloads (base64, hex, unicode escapes)
- SQL/command injection patterns
- PII extraction attempts

### 2. Output Redaction

**Purpose:** Prevent data leakage by:
- Redacting PII (emails, phone numbers, SSN, credit cards)
- Removing API keys, tokens, passwords
- Filtering internal system information
- Sanitizing database query results

**Key Functions:**
```typescript
- redactSensitiveData(output: string): RedactedOutput
- detectPII(text: string): PIIDetection[]
- redactPattern(text: string, pattern: RegExp, replacement: string): string
```

### 3. Bias Detection (`bias-detector.ts`)

**Purpose:** Monitor AI outputs for bias:
- Demographic bias (gender, race, age, religion)
- Geographic bias (nationality, region)
- Socioeconomic bias
- Language/accent bias
- Accessibility bias

**Metrics Tracked:**
- Sentiment analysis by demographic group
- Representation analysis (who gets mentioned/recommended)
- Language fairness (inclusive vs exclusive language)
- Stereotype detection

**Output:** `bias-metrics.csv` with:
```csv
timestamp,model,prompt_category,bias_type,severity,confidence,flagged_terms,context
```

### 4. Incident Logging

All security events logged with:
- Timestamp (ISO 8601)
- Event type (injection_attempt, data_leakage, bias_detected)
- Severity (low, medium, high, critical)
- Input/output samples (sanitized)
- Remediation action taken
- User/session context

## Architecture Integration

### Integration Points

1. **AI Worker** (`apps/ai-worker/src/`)
   - Wrap all AI chain inputs with `sanitizePrompt()`
   - Wrap all AI outputs with `redactSensitiveData()`
   - Run `detectBias()` on final outputs

2. **API Layer** (`apps/api/src/`)
   - Apply sanitization middleware to AI endpoints
   - Log incidents to audit trail
   - Return sanitized responses to clients

3. **Monitoring**
   - Real-time bias metrics collection
   - Alerting on high-severity incidents
   - Dashboard integration for security team

### Error Handling

- **Injection detected:** Reject request with 400 Bad Request
- **High bias score:** Flag for human review, allow with warning
- **Data leakage:** Redact automatically, log incident
- **Sanitization failure:** Fail-safe (reject request)

## Success Criteria (Definition of Done)

1. ✅ Prompt sanitization implemented with comprehensive pattern detection
2. ✅ Output redaction for all major PII types
3. ✅ Bias detection metrics collected
4. ✅ All incidents logged to audit trail
5. ✅ Artifacts created:
   - `apps/api/src/shared/prompt-sanitizer.ts`
   - `artifacts/metrics/bias-metrics.csv`
   - `docs/shared/ai-guardrails-report.md`
6. ✅ Zero test errors (`pnpm test`)
7. ✅ Integration with existing AI chains verified

## Testing Strategy

### Unit Tests
- Test each sanitization pattern individually
- Test redaction for each PII type
- Test bias detection algorithms
- Test false positive/negative rates

### Integration Tests
- Test full pipeline: input → sanitize → AI → redact → output
- Test with real AI responses
- Test incident logging integration

### Security Tests
- Attempt known injection attacks
- Verify all patterns caught
- Ensure no bypass methods exist

### Performance Tests
- Sanitization latency < 10ms
- No significant impact on AI response times
- Scalability under load

## Known Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| False positives blocking valid inputs | High | Tunable sensitivity thresholds, allow-lists |
| Performance degradation | Medium | Optimize regex, cache patterns, async processing |
| Bypass via novel encoding | High | Regular pattern updates, ML-based detection |
| Bias metrics privacy concerns | Medium | Aggregate only, no PII in metrics |

## References

- OWASP LLM Top 10: https://owasp.org/www-project-top-10-for-large-language-model-applications/
- Prompt Injection Taxonomy: https://github.com/FonduAI/awesome-prompt-injection
- NIST AI Risk Management Framework
- Project ADR-007: Data Governance

## Dependencies

- `zod` - Schema validation
- `@anthropic-ai/sdk` or `openai` - AI providers
- Existing audit logging system

## Deliverables Checklist

- [ ] `apps/api/src/shared/prompt-sanitizer.ts` - Core sanitization logic
- [ ] `apps/api/src/shared/prompt-sanitizer.test.ts` - Unit tests (>90% coverage)
- [ ] `apps/api/src/shared/bias-detector.ts` - Bias detection implementation
- [ ] `apps/api/src/shared/bias-detector.test.ts` - Bias detection tests
- [ ] `artifacts/metrics/bias-metrics.csv` - Sample bias metrics
- [ ] `docs/shared/ai-guardrails-report.md` - Comprehensive documentation
- [ ] Integration with existing chains verified
- [ ] All tests passing
- [ ] `.specify/specifications/IFC-125.md` - Specification document
- [ ] `.specify/planning/IFC-125.md` - Planning document

---

**Context Pack Version:** 1.0
**Author:** Claude Code
**Review Status:** Pending
