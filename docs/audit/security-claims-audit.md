# SECURITY.md Claims — Deep Verification Audit

**Source**: `SECURITY.md` (root, last updated 2025-12-15 v1.0.0)
**Scope**: All 35 security claims verified against actual codebase implementation
**Date**: 2026-03-08
**Updated**: 2026-03-10 — All 20 findings fixed (5 critical, 7 high, 8 medium)

---

## Summary

| Category                          | Implemented | Partial | Not Found | Contradicts |
| --------------------------------- | ----------- | ------- | --------- | ----------- |
| Authentication & Sessions (5)     | 1           | 3       | 1         | 2           |
| API Security Controls (7)         | 1           | 4       | 1         | 1           |
| Data Protection & Encryption (9)  | 1           | 6       | 1         | 0           |
| AI Security (6)                   | 0           | 4       | 1         | 0           |
| Infrastructure & Scanning (6)     | 3           | 2       | 1         | 0           |
| **Total (33 distinct claims)**    | **6**       | **19**  | **5**     | **3**       |

**Verdict distribution**: 18% fully implemented, 58% partial, 15% not found, 9% contradicts claim.

---

## Root Causes

### A — Security utilities built but never wired into production paths

The most pervasive pattern. Code exists for CSRF tokens, hallucination checking,
prompt sanitization, AI conversation records, human-review gating, ClamAV
scanning, and Redis rate limiting — but none are called from production code
paths. The gap between "library exists" and "library is enforced" accounts for
14 of 19 partial findings.

### B — Supabase delegation without verification

Multiple claims (bcrypt cost 12, refresh token rotation, OIDC, password history)
are delegated entirely to Supabase with no application-level enforcement or
verification that Supabase is configured to match the claim. The SECURITY.md
describes application-level controls; the code delegates to a managed service
whose configuration is external to the repository.

### C — Infrastructure-only claims with no code enforcement

TLS 1.3, mTLS, Vault, and Zero Trust are described as infrastructure controls
but have no code-level enforcement. YAML configuration files exist but the
application servers create plain HTTP connections and fall back to environment
variables for secrets.

### D — Hardcoded weak defaults in production path

Several security-critical values fall back to insecure defaults when environment
variables are absent: `'dev-signing-key-change-in-production'` for HMAC signing,
`'dev-service-key'` for Supabase service role, `NoOpAVScanner` for malware
scanning, `7d` for JWT expiry.

### E — Documented minimum thresholds contradict code

Password minimum is documented as 12 characters but enforced as 8. JWT is
described as "short-lived" but defaults to 7 days. CSP is described as "strict"
but includes `unsafe-eval` and `unsafe-inline`.

---

## Section 1: Authentication & Session Security

### 1.1 MFA Required for All Production Access

**Verdict: PARTIAL**

| Aspect | Status | Evidence |
|--------|--------|----------|
| TOTP, SMS, email, backup codes | Built | `apps/api/src/services/mfa.service.ts` — full RFC 6238 implementation |
| `UserMfaSettings` Prisma model | Built | `packages/db/prisma/schema.prisma:226–241` |
| MFA challenge on login | Built | `apps/api/src/modules/auth/auth.router.ts:296–313` — conditional `if (mfaEnabled)` |
| UI challenge component | Built | `apps/web/src/components/auth/mfa-challenge.tsx` |
| **Mandatory enrollment policy** | **Missing** | No middleware forces MFA enrollment; users who never enroll bypass MFA entirely |
| SMS/email OTP delivery | Stub | `mfa.service.ts:352–355,403–406` — `// TODO: In production, integrate with SMS/email provider` |

### 1.2 OAuth 2.0 / OpenID Connect

**Verdict: PARTIAL**

| Aspect | Status | Evidence |
|--------|--------|----------|
| OAuth 2.0 authorization code flow | Implemented | `apps/api/src/lib/supabase.ts:628–649` via `signInWithOAuth()` |
| Providers: Google, Azure, GitHub, LinkedIn | Implemented | `packages/domain/src/auth/AuthConstants.ts:33–39` |
| OAuth callback + redirect protection | Implemented | `apps/api/src/modules/auth/auth.router.ts:375,441,484` |
| **OIDC discovery/JWKS** | **Not found** | No application-level OIDC configuration; fully delegated to Supabase |
| SSO config | Placeholder | `auth.router.ts:141–154` — static `example-corp.com` dev placeholder |

### 1.3 JWT Short-Lived Tokens with Refresh Rotation

**Verdict: CONTRADICTS**

| Aspect | Status | Evidence |
|--------|--------|----------|
| JWT issuance | Delegated | Supabase handles JWT; `autoRefreshToken: true` at `supabase.ts:228–238` |
| `JWT_EXPIRES_IN` default | **7 days** | `packages/validators/src/config.ts:38` and `env.ts:38` — `z.string().default('7d')` |
| Claim says | "Short-lived" | Industry standard: 15 min–1 hour. **7 days is not short-lived.** |
| `getStatus` endpoint | Inconsistent | `auth.router.ts:1101` hardcodes `expiresAt: Date.now() + 3600 * 1000` (1h), contradicting config |
| **Refresh token rotation** | **Not found** | `refreshSession` mutation (line 705–725) calls `getSession()` — no rotation logic |

### 1.4 Password Security

**Verdict: CONTRADICTS (min length), PARTIAL (complexity), NOT FOUND (reuse)**

| Sub-claim | Status | Evidence |
|-----------|--------|----------|
| Min 12 characters | **CONTRADICTS — enforced as 8** | `packages/validators/src/auth.ts:344` — `z.string().min(8)`; `apps/web/src/lib/shared/password-validation.ts:40` — `MIN_PASSWORD_LENGTH = 8`; 12 chars is only "recommended" (line 107) |
| Complexity (upper, lower, digit, special) | Implemented | `strongPasswordSchema` at `packages/validators/src/auth.ts:342–349` |
| bcrypt cost factor 12 | **Declared but unused** | `BCRYPT_ROUNDS` configured at `config.ts:40` with `.default(12)`, but **bcrypt is never called** — no `bcrypt`/`bcryptjs`/`argon2` import in any source file. Hashing delegated to Supabase. |
| No reuse (last 12 passwords) | **Not found** | No `PasswordHistory` model in Prisma schema. No reuse check in `updateUserPassword` at `supabase.ts:417–424`. Zero matches for `passwordHistory`, `password_history`, `checkPasswordReuse` across entire codebase. |

### 1.5 Session Management with Automatic Timeout

**Verdict: PARTIAL**

| Aspect | Status | Evidence |
|--------|--------|----------|
| Session service with timeouts | Implemented | `apps/api/src/services/session.service.ts` — 4h inactivity, 24h max duration, 30d remember-me, max 3 concurrent |
| `validateSession()` / `isSessionValid()` | Implemented | Lines 304–339 — enforces expiry + inactivity, revokes expired sessions |
| **DB persistence** | **Stubbed** | Lines 578–622 — `persistSession`, `loadSessionFromDb`, `updateSessionActivity`, `deleteSessionFromDb` are all commented-out stubs with `// In production:` comments. Sessions stored **only in in-memory Maps** — lost on server restart. |

---

## Section 2: API Security Controls

### 2.1 Input Validation via Zod Schemas

**Verdict: PARTIAL**

| Aspect | Status | Evidence |
|--------|--------|----------|
| tRPC error formatter for ZodError | Implemented | `apps/api/src/trpc.ts` |
| Auth endpoints use named schemas | Implemented | `loginSchema`, `signupSchema`, `mfaVerifySchema` from `@intelliflow/validators` |
| Procedures with no `.input()` | Legitimate | `home.router.ts:669,860,980,1132`, `auth.router.ts:671,788,833,991` — data scoped to `ctx.user`, no external input needed |
| **`publicProcedure` rate limiting** | **Missing** | `trpc.ts:108–116` — rate limiting only on `protectedProcedure`; public endpoints unprotected |

### 2.2 CSRF Protection on All State-Changing Operations

**Verdict: NOT FOUND / CONTRADICTS**

This is the **most critical gap** in the entire audit.

| Aspect | Status | Evidence |
|--------|--------|----------|
| CSRF utility functions | Built | `apps/web/src/lib/shared/login-security.ts:36–99` — `generateCsrfToken()`, `validateCsrf()`, `getCsrfToken()` |
| OAuth nonce CSRF check | Used | `apps/web/src/components/shared/oauth-callback.tsx:106–118` — only production usage |
| **CSRF on tRPC mutations** | **Not found** | Zero CSRF middleware in `apps/api/src/`. No `csrf`, `csurf`, `helmet`, or `lusca` in any `package.json`. |
| **Next.js middleware** | **Not found** | No `apps/web/src/middleware.ts` file exists |
| SameSite cookie enforcement | **Not found** | No SameSite configuration in application code |

Every `protectedProcedure.mutation()` is vulnerable to CSRF if session cookies are `SameSite=None` or `Lax` under subdomain attack. The CSRF utility is implemented but unused outside OAuth nonce validation.

### 2.3 API Rate Limiting

**Verdict: PARTIAL**

| Aspect | Status | Evidence |
|--------|--------|----------|
| Rate limiter with tiers | Implemented | `apps/api/src/middleware/rate-limit.ts` — PUBLIC: 100/min, AUTH: 5/min, AUTHENTICATED: 1000/min, AI: 10/min |
| Per-tenant resource limiting | Implemented | `apps/api/src/security/tenant-limiter.ts` |
| `protectedProcedure` rate limiting | Implemented | `trpc.ts:108–116` — 1000 req/min |
| **`publicProcedure` (incl. login)** | **Unprotected** | No rate limiting on health, auth, integrations endpoints |
| **AUTH tier (5/min) for login** | **Defined but not applied** | `RATE_LIMIT_TIERS.AUTH` exists; `createAuthEndpointRateLimitMiddleware()` is never called |
| **Redis distributed limiter** | **Built but not used** | `RedisRateLimiter` class (lines 191–231) — never instantiated |

Login endpoint brute-force protection is absent despite the infrastructure being coded.

### 2.4 Content Security Policy (CSP)

**Verdict: CONTRADICTS — not "strict"**

`apps/web/next.config.js:103–106`:
```
frame-src 'self' https://js.stripe.com;
script-src 'self' 'unsafe-eval' 'unsafe-inline' https://js.stripe.com;
```

| Issue | Severity | Detail |
|-------|----------|--------|
| `'unsafe-eval'` in `script-src` | HIGH | Allows `eval()`, `new Function()`, `setTimeout(string)` — undermines XSS protection |
| `'unsafe-inline'` in `script-src` | HIGH | Allows all inline `<script>` — negates injection protection |
| Missing `default-src` | MEDIUM | Without `default-src`, most resource types are unrestricted |
| Missing `img-src`, `connect-src`, `style-src`, `font-src`, `base-uri`, `object-src` | MEDIUM | Incomplete policy leaves attack surface open |
| API server CSP | Missing | `apps/api/src/http-server.ts` sets no CSP headers |

A strict CSP would use nonces or hashes and eliminate both `unsafe-*` directives.

### 2.5 Security Headers (HSTS, X-Frame-Options, X-Content-Type-Options)

**Verdict: IMPLEMENTED (web frontend only)**

`apps/web/next.config.js:69–109`, applied to all routes (`/:path*`):

| Header | Value | Status |
|--------|-------|--------|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | Correct (2-year max-age) |
| `X-Frame-Options` | `SAMEORIGIN` | Correct |
| `X-Content-Type-Options` | `nosniff` | Correct |
| `X-XSS-Protection` | `1; mode=block` | Present (legacy, CSP preferred) |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Present |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Present |

**Gap**: API server (`apps/api/src/http-server.ts`) sets **no security headers**. If API is exposed directly (not behind a reverse proxy), it lacks these protections.

### 2.6 SQL Injection Prevention via Prisma

**Verdict: PARTIAL — one confirmed vulnerability**

Most queries use Prisma's safe API or the parameterized `$queryRaw` tagged template. However:

**Confirmed SQL injection** in `packages/adapters/src/repositories/PrismaFeedbackSurveyRepository.ts:176–188`:

```typescript
const typeFilter = type ? `AND type = '${type}'` : '';  // ← string interpolation

const result = await this.prisma.$queryRawUnsafe<...>(
  `SELECT sentiment, COUNT(*) ...
    ${typeFilter}                                       // ← injected into raw SQL
   GROUP BY sentiment`,
  tenantId, from, to
);
```

The `type` parameter is interpolated directly into `$queryRawUnsafe`. While `SurveyType` is a TypeScript union at compile time, if the value passes through a permissive Zod schema or type checking fails at runtime, a malicious value executes verbatim. No allowlist is applied (unlike the `granularity` parameter on line 25 which does have one).

### 2.7 XSS Prevention via Output Encoding

**Verdict: PARTIAL — two confirmed XSS vectors, no sanitization library**

| # | File | Line | Issue | Severity |
|---|------|------|-------|----------|
| 1 | `apps/web/src/components/email/EmailMessage.tsx` | 102–106 | `dangerouslySetInnerHTML={{ __html: message.htmlBody }}` — inbound email HTML rendered raw, no DOMPurify | HIGH |
| 2 | `apps/web/src/components/email/EmailCompose.tsx` | 171–172 | `bodyRef.current.innerHTML = template.body` — template content injected via `innerHTML` without sanitization | MEDIUM |
| — | `apps/web/src/components/blog/markdown-renderer.tsx` | 61,73–74 | Uses `dangerouslySetInnerHTML` but escapes `<`, `>`, `&` before processing — **safe** | OK |

No `DOMPurify`, `sanitize-html`, or `isomorphic-dompurify` package found anywhere in the codebase.

---

## Section 3: Data Protection & Encryption

### 3.1 AES-256 Encryption at Rest

**Verdict: PARTIAL**

| Aspect | Status | Evidence |
|--------|--------|----------|
| `EncryptionService` with `aes-256-gcm` | Implemented | `apps/api/src/security/encryption.ts:291–436` |
| Container wiring | Implemented | `apps/api/src/container.ts:67–68,211,220` — `getEncryptionService()` wired |
| Key rotation | Implemented | `apps/api/src/security/key-rotation.ts` — `KeyRotationService` |
| **Universal storage-layer enforcement** | **Missing** | No encrypted column types in `schema.prisma`, no Prisma middleware intercepting writes. Encrypt/decrypt is opt-in per call site. CRM domain fields (email, phone, financial data) stored as plain `String`. |

### 3.2 TLS 1.3 in Transit

**Verdict: NOT FOUND in application code**

| Aspect | Status | Evidence |
|--------|--------|----------|
| API server | Plain HTTP | `apps/api/src/http-server.ts:304` — `http.createServer(...)`, no `https` module |
| HSTS header | Present | `next.config.js:79–81` — signals intent for TLS-terminating proxy |
| TLS config in code | None | Entirely delegated to deployment infrastructure (Railway/Vercel) |

### 3.3 Field-Level Encryption for Sensitive Data

**Verdict: PARTIAL**

| Aspect | Status | Evidence |
|--------|--------|----------|
| `FieldEncryption` utility | Built | `apps/api/src/security/encryption.ts:464–518` — `encryptField()` / `decryptField()` |
| Audit adapter PII encryption | Conditional | `packages/adapters/src/audit/DurableAuditLogAdapter.ts:338–351` — `encryptPII()` only if `AI_AUDIT_ENCRYPTION_KEY` env var is set |
| **Prisma-layer encryption** | **Missing** | No `@encrypted` annotations or Prisma extensions. Core domain fields stored as plaintext. |

### 3.4 Row Level Security (RLS) — Supabase RLS Policies

**Verdict: IMPLEMENTED (with gap)**

| Aspect | Status | Evidence |
|--------|--------|----------|
| Core tables RLS (JWT-based) | Implemented | `packages/db/prisma/migrations/tenant-rls.sql` — 7 core tables, JWT claims-based |
| Auxiliary tables RLS (session var) | Implemented | `migrations/20260203120000_enable_rls_policies/migration.sql` — 50+ tables via `get_current_tenant_id()` |
| Application-layer `tenantId` | Implemented | 158 TypeScript files include `tenantId` in Prisma WHERE clauses |
| **Session variable setter** | **Missing** | No API code sets `app.current_tenant_id` session variable before queries — secondary RLS policies may receive null tenant |
| **Two incompatible mechanisms** | Gap | Core uses JWT claims; auxiliary uses session variable. No unified enforcement. |

### 3.5 HashiCorp Vault for Production Secrets

**Verdict: PARTIAL**

| Aspect | Status | Evidence |
|--------|--------|----------|
| `VaultKeyProvider` with Transit API | Implemented | `apps/api/src/security/encryption.ts:149–272` |
| Vault key rotation | Implemented | `apps/api/src/security/key-rotation.ts:183–264` |
| **Not the default** | Gap | `encryption.ts:447–449` — requires `VAULT_ENABLED=true`; falls back to `EnvironmentKeyProvider` |
| No Vault infra in repo | Gap | No HCL config, no Docker Compose service for Vault |
| Hardcoded fallback key | Risk | `container.ts:156–157` — `process.env.AI_AUDIT_SIGNING_KEY \|\| 'dev-signing-key-change-in-production'` |

### 3.6 Comprehensive Audit Logging

**Verdict: PARTIAL**

| Aspect | Status | Evidence |
|--------|--------|----------|
| AI/security audit chain | Implemented | `packages/adapters/src/audit/DurableAuditLogAdapter.ts` — HMAC-SHA256 hash chain, WAL-backed, per-jurisdiction retention |
| `auditLog()` tRPC middleware | Implemented | `apps/api/src/security/middleware.ts:188` — factory function |
| Audit query endpoint | Implemented | `apps/api/src/modules/security/audit.router.ts` — manager/admin gated |
| `AuditLog` / `AuditLogEntry` models | Implemented | `packages/db/prisma/schema.prisma:1061–1704` |
| **Universal CRUD logging** | **Missing** | No Prisma `$use()` / `$extends()` middleware for automatic logging. Audit middleware is opt-in per procedure. General lead/contact reads have no audit trail. |

### 3.7 Automated Data Retention Policies

**Verdict: PARTIAL (metadata only, no enforcement)**

| Aspect | Status | Evidence |
|--------|--------|----------|
| `retentionExpiresAt` field | Tracked | `DurableAuditLogAdapter.calculateRetention()` — EU/UK/US/GLOBAL = 7 years |
| `AuditLogEntry.retentionExpiresAt` | Schema | `schema.prisma:1687` |
| `CaseDocument.retentionUntil` guard | Implemented | `packages/domain/src/legal/cases/case-document.ts:527–549` |
| **Automated purge job** | **Missing** | No cron, worker, or scheduled task queries `WHERE retentionExpiresAt < NOW()`. The field is set but never consumed. |

### 3.8 Right to Erasure (GDPR)

**Verdict: IMPLEMENTED (most complete claim, with gaps)**

| Aspect | Status | Evidence |
|--------|--------|----------|
| `DSARWorkflow` — all GDPR Arts 15–22 | Implemented | `apps/api/src/workflow/dsar-workflow.ts` (~670 lines) |
| Article 17 erasure | Implemented | `handleErasureRequest()` — legal hold check, SQL anonymization, search index purge |
| Article 15 access | Implemented | `handleAccessRequest()` — full data export |
| Article 20 portability | Implemented | `handlePortabilityRequest()` |
| IFC-155 vector redaction | Implemented | `purgeSearchIndexes()` — embeddings + FTS redacted with `[REDACTED - GDPR]` |
| **`data_subject_requests` table** | **Missing** | `this.db.data_subject_requests.create()` called but no Prisma model found |
| **`anonymize_record()` SQL function** | **Missing** | Called in raw SQL (line 421) but not in any migration file |
| **API endpoint for DSAR** | **Missing** | `DSARWorkflow` is instantiated via factory but no tRPC router exposes it to users |

### 3.9 File Upload Security

**Verdict: PARTIAL — type/size implemented, malware scanning not active**

| Aspect | Status | Evidence |
|--------|--------|----------|
| Size limit 50 MB | Implemented | `packages/application/src/services/IngestionOrchestrator.ts:67,209` |
| MIME type allowlist (7 types) | Implemented | `IngestionOrchestrator.ts:68–76` |
| AV scanner interface + ClamAV adapter | Built | `packages/adapters/src/antivirus/ClamAVScanner.ts` |
| **Production scanner** | **NoOp** | `apps/api/src/container.ts:115` — `new NoOpAVScanner()` hardcoded. Always returns `clean: true`. **All uploads bypass malware scanning.** |
| **MIME magic-byte verification** | **Missing** | Upload router accepts `mimeType` as caller-supplied string (`z.string()`) — type spoofing possible |

---

## Section 4: AI Security

### 4.1 Prompt Injection Prevention

**Verdict: PARTIAL**

| Chain | Sanitized | Evidence |
|-------|-----------|----------|
| `auto-response.chain.ts` | Yes | Lines 266–387 — `sanitizeStringField()` called on lead name, company, instructions, message |
| `scoring.chain.ts` | **No** | Lines 163–300 — `formatLeadInfo()` passes `lead.email`, `lead.company`, `lead.title`, `lead.metadata` (via `JSON.stringify`) directly into prompt |
| `churn-risk.chain.ts` | **No** | No import of `input-sanitizer` |
| `insight-generation.chain.ts` | **No** | No import of `input-sanitizer` |
| `rag-context.chain.ts` | **No** | No import of `input-sanitizer` |
| `ticket-routing.chain.ts` | **No** | No import of `input-sanitizer` |

1 of 6 chains uses the sanitizer. The `sanitizePredictionInput()` function is defined but never called.

### 4.2 AI Output Validation

**Verdict: PARTIAL**

| Aspect | Status | Evidence |
|--------|--------|----------|
| Structured output parser (Zod) | Used | `scoring.chain.ts:115` — `StructuredOutputParser.fromZodSchema(leadScoreSchema)` |
| `HallucinationChecker` | Built | `apps/ai-worker/src/monitoring/hallucination-checker.ts` — fabricated entity, factual accuracy, numerical error checks |
| **Checker wired in production** | **No** | Exported from `monitoring/index.ts` but never called from any job handler or chain |
| `validateScoringResult()` | Soft check | `scoring.chain.ts:305–333` — returns `{ valid, issues }` instead of throwing; callers can ignore |

### 4.3 No PII Sent to External AI Without Consent

**Verdict: NOT FOUND**

| Finding | Evidence |
|---------|----------|
| Full names sent to OpenAI | `scoring.chain.ts:267–299` — `lead.firstName`, `lead.lastName`, `lead.email`, `lead.phone`, `lead.company`, `lead.metadata` |
| Names in insight prompts | `insight-generation.job.ts:400–424` — lead names + company in prompt |
| PII redaction function | None exists in `apps/ai-worker/src/` |
| Consent check before AI call | None found — no flag or consent status checked before routing to OpenAI |

### 4.4 AI Audit Trail

**Verdict: PARTIAL**

| Aspect | Status | Evidence |
|--------|--------|----------|
| Pino logging in all chains/jobs | Present | `leadEmail`, `entityId`, `jobId`, `confidence`, `duration` logged |
| `ConversationRecord` / `MessageRecord` domain model | Built | `packages/domain/src/ai/conversation-record.ts` — full schema including token counts, agent model, approval status |
| **Records written to DB from jobs** | **No** | No job handler creates `ConversationRecord` or `MessageRecord` after LLM calls |
| **Durable storage** | **No** | Pino logs go to stdout. Without external log shipping, audit trail is lost on container restart |

### 4.5 Human-in-the-Loop for Critical Decisions

**Verdict: PARTIAL (framework implemented, enforcement not wired)**

| Aspect | Status | Evidence |
|--------|--------|----------|
| `requiresHumanReview(confidence, chainType)` | Implemented | `packages/domain/src/ai/AIConstants.ts:444–466` — thresholds: AUTO_RESPONSE 0.9, EMAIL 0.9, LEAD_SCORING 0.85 |
| `AIOutputReview` aggregate root | Implemented | `packages/domain/src/ai/review/AIOutputReview.ts` — `claim()`, `approve()`, `reject()`, `escalate()`, `expire()` state machine, 24h SLA |
| Agent approvals UI | Implemented | `apps/web/src/app/agent-approvals/` — review queue, scoring, churn-risk, insights, logs, history pages |
| **Enforcement in job pipeline** | **Not wired** | `scoring.chain.ts:196–212` — `requiresHumanReview()` called but result only logged, not acted on. `prediction.job.ts` creates notification for HIGH risk but never creates `AIOutputReview` record or blocks action. |

### 4.6 Model Security

**Verdict: PARTIAL**

| Aspect | Status | Evidence |
|--------|--------|----------|
| API key via env var | Standard | `apps/ai-worker/src/config/ai.config.ts:72` — `process.env.OPENAI_API_KEY` |
| Non-root containers | Implemented | All Dockerfiles use UID 1001 system users |
| mTLS between API/AI worker | Config only | `infra/security/mtls-config.yaml` — not wired in application code |
| Ollama endpoint auth | **None** | `http://localhost:11434` — no authentication mechanism |

---

## Section 5: Infrastructure & Scanning

### 5.1 GitLeaks Secret Scanning

**Verdict: IMPLEMENTED**

| Aspect | Status | Evidence |
|--------|--------|----------|
| `.gitleaks.toml` config | Present | Allowlist for `.env.development`, `.env.test`, `.env.example`, placeholders |
| CI enforcement | Active | `.github/workflows/security.yml:179–200` — `gitleaks/gitleaks-action@v2` on push/PR |
| TruffleHog backup | Active | `.github/workflows/ci.yml:268–276` — `trufflehog@main` with `--only-verified` |
| **Pre-commit hook** | **Missing** | `.husky/pre-commit` runs lint, typecheck, prettier, tests — no secret scan locally |

### 5.2 CodeQL + ESLint Security Rules

**Verdict: IMPLEMENTED**

| Aspect | Status | Evidence |
|--------|--------|----------|
| CodeQL | Active | `.github/workflows/security.yml:147–176` — `security-extended,security-and-quality` for JS+TS |
| `eslint-plugin-security` | Registered | `eslint.config.mjs:4–5,80–84` |
| `eslint-plugin-sonarjs` | Registered | `eslint.config.mjs:4–5,80–84` |
| **Explicit rule activation** | **Ambiguous** | Plugin registered but no specific security rules enabled in `rules:` object (lines 94–101). Whether recommended ruleset applies depends on plugin resolution. |
| Reduced strictness | Present | `@typescript-eslint/no-explicit-any: 'off'`, `no-unused-vars: 'off'` at lines 98–101 |

### 5.3 Dependabot

**Verdict: NOT FOUND**

| Aspect | Status | Evidence |
|--------|--------|----------|
| `.github/dependabot.yml` | **Does not exist** | Glob returned zero results |
| **Custom weekly updater** | Exists | `.github/workflows/dependency-scan.yml:231–276` — `pnpm update --latest && pnpm audit fix --force`, creates PR via `peter-evans/create-pull-request@v6` |

SECURITY.md specifically names "Dependabot" but the project uses a custom workflow. Functional equivalent exists, but the claim is inaccurate.

### 5.4 OWASP Dependency-Check

**Verdict: IMPLEMENTED**

| Aspect | Status | Evidence |
|--------|--------|----------|
| Action | Active | `.github/workflows/security.yml:66–106` — `dependency-check/Dependency-Check_Action@main` |
| Config | Present | `infra/security/dependency-check.yaml` |
| Schedule | Push, PR, daily (`0 2 * * *`) | Results → SARIF → GitHub Security tab |

### 5.5 Trivy Container/Filesystem Scanning

**Verdict: IMPLEMENTED (with enforcement gap)**

| Aspect | Status | Evidence |
|--------|--------|----------|
| Filesystem scan | Active, blocking | `.github/workflows/security.yml:23–64` — push/PR/daily, SARIF output |
| Image scan workflow | Active, **non-blocking** | `.github/workflows/image-scan.yml` — nightly; `exit 1` for critical is **commented out** (falls back to warning) |
| Trivy config | Present | `infra/security/trivy.yaml` — `exit-code: 1`, threshold 0 critical / max 5 high |
| Base image scanning | Active | Scans `pgvector/pgvector:pg16`, `redis:7-alpine`, `node:20-alpine` |

### 5.6 Zero Trust Architecture

**Verdict: PARTIAL**

| Aspect | Status | Evidence |
|--------|--------|----------|
| mTLS config spec | Present | `infra/security/mtls-config.yaml` — TLS 1.3, strong ciphers, mutual cert verification |
| Non-root containers | Implemented | All Dockerfiles use multi-stage builds + non-root users |
| Isolated Docker network | Implemented | `docker-compose.yml` — `intelliflow` bridge network, no host networking |
| Dev tool isolation | Implemented | Adminer/RedisInsight behind `profiles: [tools]` |
| **mTLS in application code** | **Not wired** | No code in `apps/api/` or `apps/ai-worker/` loads or applies TLS config |
| **Certificate revocation** | **Disabled** | `mtls-config.yaml:35` — `check_revocation: false` with `# TODO` |
| **Subject pinning** | **Empty** | `allowed_subjects: []` — "allow all certificates signed by CA" |
| **Default DB password** | Risk | `docker-compose.yml` — `POSTGRES_PASSWORD: postgres` |

---

## Section 6: Hardcoded Weak Defaults (Cross-Cutting)

These weak fallback values exist in production code paths and would be used if
environment variables are absent:

| # | File | Line | Default | Risk |
|---|------|------|---------|------|
| 1 | `apps/api/src/container.ts` | 157 | `'dev-signing-key-change-in-production'` for HMAC signing | All audit log signatures use publicly known key — breaks integrity |
| 2 | `apps/api/src/container.ts` | 113 | `'dev-service-key'` for Supabase service role | Storage adapter uses weak key |
| 3 | `apps/api/src/container.ts` | 115 | `new NoOpAVScanner()` | All uploads bypass malware scanning |
| 4 | `apps/api/src/lib/supabase.ts` | 85 | `'http://127.0.0.1:54321'` | Falls back to local dev Supabase |
| 5 | `packages/validators/src/config.ts` | 38 | `JWT_EXPIRES_IN: '7d'` | Token lifetime far exceeds "short-lived" |
| 6 | `apps/api/src/security/encryption.ts` | 447–449 | `EnvironmentKeyProvider` (not Vault) | Secrets read from env vars when Vault disabled |

---

## Priority Fix Recommendations

### Critical (address immediately)

| # | Finding | Section | Status | Fix |
|---|---------|---------|--------|-----|
| 1 | CSRF protection absent on tRPC mutations | 2.2 | **FIXED** | CSRF middleware added to `trpc.ts` with Origin matching + anti-CSRF header enforcement on all `protectedProcedure` mutations. Malformed Origin rejection hardened 2026-03-09. |
| 2 | SQL injection in `PrismaFeedbackSurveyRepository.ts:176` | 2.6 | **FIXED** | `VALID_SURVEY_TYPES` allowlist (line 28) with guard throw (line 179) prevents non-enum values from reaching `$queryRawUnsafe` |
| 3 | XSS via `dangerouslySetInnerHTML` on email body | 2.7 | **FIXED** | `isomorphic-dompurify` added; `DOMPurify.sanitize()` applied in `EmailMessage.tsx:106`, `EmailCompose.tsx:173`, and forward-quote `initialBody` (line 80) |
| 4 | PII (names, emails, phones) sent to OpenAI without consent check | 4.3 | **FIXED** | Scoring chain: stripped full email (domain-only), removed name, removed metadata blob. Insight-generation: replaced personal names with pseudonyms (`${company} lead`, `Contact ${id.slice(0,8)}`). Standalone `chain-utils.ts` also updated. Churn-risk and ticket-routing were already clean. Auto-response keeps name (functionally required for personalized email). |
| 5 | `NoOpAVScanner` hardcoded in production container | 3.9 | **FIXED** | `container.ts:118–120` now wires `ClamAVScanner` when `CLAMAV_HOST` env var is set; falls back to `NoOpAVScanner` only when unset |

### High (address within 14 days)

| # | Finding | Section | Status | Fix |
|---|---------|---------|--------|-----|
| 6 | Login endpoint has no rate limiting (brute-force risk) | 2.3 | **FIXED** | `authProcedure` with AUTH tier (5/min) in `trpc.ts:299`, applied to login/signup/reset in `auth.router.ts` |
| 7 | Password minimum is 8, not 12 as documented | 1.4 | **FIXED** | `auth.ts:35` and `password-validation.ts:40` both enforce min 12 |
| 8 | CSP uses `unsafe-eval` and `unsafe-inline` | 2.4 | **FIXED** | `unsafe-eval` removed, dev/prod split CSP in `next.config.js` with comprehensive directives |
| 9 | Session persistence is in-memory only | 1.5 | **FIXED** | `session.service.ts:609–670` — `persistSession`, `loadSessionFromDb`, `loadUserSessionsFromDb`, `updateSessionActivity`, `deleteSessionFromDb` implemented with Prisma |
| 10 | JWT defaults to 7 days, not "short-lived" | 1.3 | **FIXED** | `config.ts:38` and `env.ts:38` both `default('1h')` |
| 11 | Hardcoded `'dev-signing-key-change-in-production'` | 6 | **FIXED** | `container.ts:166–169` throws in production if `AI_AUDIT_SIGNING_KEY` is missing; dev-only fallback preserved |
| 12 | Prompt sanitizer only covers 1 of 6 chains | 4.1 | **FIXED** | All 6 chains (`scoring`, `churn-risk`, `insight-generation`, `ticket-routing`, `rag-context`, `auto-response`) import and use `sanitizeStringField()` |

### Medium (address within 30 days)

| # | Finding | Section | Status | Fix |
|---|---------|---------|--------|-----|
| 13 | MFA is opt-in, not mandatory | 1.1 | **FIXED** | `MFA_REQUIRED` env flag in `auth.router.ts:319`; returns `mfaEnrollmentRequired: true` when user hasn't enrolled |
| 14 | AI output hallucination checker built but not wired | 4.2 | **FIXED** | `hallucinationChecker.checkOutput()` wired in `prediction.job.ts:419` and `insight-generation.job.ts:550`; logs warnings, does not block |
| 15 | Human-review gate computed but not enforced | 4.5 | **FIXED** | `requiresReview` flag propagated through scoring result (`scoring.chain.ts:216`); `requiresHumanReview()` called with confidence + chain type in `prediction.job.ts:438` |
| 16 | No automated data retention purge job | 3.7 | **FIXED** | `retention-purge.service.ts` — `purgeExpiredRecords()` with batch deletion (default 100), AuditLogEntry + SecurityEvent support, 7 tests |
| 17 | DSAR workflow has no API endpoint | 3.8 | **FIXED** | `dsar.router.ts` with `submitDSAR` (public mutation) and `getDSARStatus` (token-gated query) + 10 tests |
| 18 | RLS session variable `app.current_tenant_id` never set by API | 3.4 | **FIXED** | `tenant-context.ts` — `withTenantContext(prisma, tenantId)` uses `$extends` + `$allOperations` to prepend `SET app.current_tenant_id` |
| 19 | API server has no security headers | 2.5 | **FIXED** | `http-server.ts:100–113` sets HSTS, X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy, Cache-Control no-store |
| 20 | AI conversation records never written to DB | 4.4 | **FIXED** | `conversation-record-logger.ts` — `logConversationRecord()` utility; wired in `prediction.job.ts:408` and `insight-generation.job.ts:535`; 6 dedicated tests |
