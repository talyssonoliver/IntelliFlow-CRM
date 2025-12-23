# OWASP Top 10 Security Checklist

**Document Version**: 1.0
**Last Updated**: 2025-12-22
**Related Task**: IFC-008 (Security Assessment)
**Review Frequency**: Quarterly
**Owner**: Security Team

## Introduction

This document provides a comprehensive security checklist based on the OWASP Top 10 (2021) for the IntelliFlow CRM application. All items must be verified before production deployment and reviewed quarterly.

**OWASP Top 10 (2021)**:
1. Broken Access Control (A01)
2. Cryptographic Failures (A02)
3. Injection (A03)
4. Insecure Design (A04)
5. Security Misconfiguration (A05)
6. Vulnerable and Outdated Components (A06)
7. Identification and Authentication Failures (A07)
8. Software and Data Integrity Failures (A08)
9. Security Logging and Monitoring Failures (A09)
10. Server-Side Request Forgery (SSRF) (A10)

---

## A01: Broken Access Control

**Risk**: Unauthorized access to resources, privilege escalation, data exposure.

### Checklist Items

#### Row-Level Security (RLS)

- [ ] **RLS enabled in Supabase for all tables**
  - Location: `infra/supabase/migrations/`
  - Verification: Query `pg_policies` table to confirm policies exist
  - Status: ✅ Planned (ENV-006-AI, Sprint 0)

- [ ] **RLS policies tested for all user roles**
  - Test: User A cannot access User B's data
  - Test: Sales rep cannot access admin functions
  - Test: Anonymous users cannot access authenticated resources
  - Location: `tests/integration/security/rls.test.ts`

#### Authorization Checks

- [ ] **Authorization middleware on all API routes**
  - Location: `apps/api/src/middleware/auth.ts`
  - Pattern: Check user permissions before executing business logic
  - Code example:
    ```typescript
    if (!ctx.user.hasPermission('leads:read')) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }
    ```

- [ ] **Frontend route protection**
  - Location: `apps/web/src/middleware.ts`
  - Verify: Protected routes redirect unauthenticated users
  - Verify: Role-based access control (RBAC) enforced

- [ ] **API endpoints follow least privilege principle**
  - Review: Each endpoint only grants necessary permissions
  - Review: No overly permissive wildcard permissions
  - Documentation: `docs/security/permissions-matrix.md`

#### Object-Level Authorization

- [ ] **Verify ownership on all CRUD operations**
  - Example: `UPDATE leads WHERE id = ? AND user_id = ?`
  - Location: All repository implementations in `packages/adapters/src/repositories/`

- [ ] **Prevent Insecure Direct Object References (IDOR)**
  - Test: User cannot access `/api/leads/123` if lead belongs to another user
  - Test: Use non-sequential UUIDs instead of incremental IDs
  - Status: ✅ Using UUIDs (Prisma default)

#### Function-Level Authorization

- [ ] **All tRPC procedures have authorization checks**
  - Pattern: Use tRPC middleware for role checks
  - Example:
    ```typescript
    .procedure
      .use(requireRole('admin'))
      .mutation(async ({ ctx, input }) => { ... })
    ```

- [ ] **Admin endpoints require elevated privileges**
  - Verify: Admin routes check `isAdmin` flag
  - Verify: No admin functionality exposed in public APIs

#### CORS Configuration

- [ ] **CORS headers properly configured**
  - Location: `apps/api/src/server.ts`
  - Allowed origins: Only production domains (no wildcards)
  - Credentials: Only allow credentials from trusted origins
  - Example:
    ```typescript
    cors({
      origin: process.env.ALLOWED_ORIGINS?.split(','),
      credentials: true,
      maxAge: 86400
    })
    ```

#### Access Control Testing

- [ ] **Automated access control tests**
  - Location: `tests/integration/security/access-control.test.ts`
  - Coverage: Test all roles and permission combinations
  - CI: Runs on every PR

---

## A02: Cryptographic Failures

**Risk**: Exposure of sensitive data due to weak or missing encryption.

### Checklist Items

#### Data at Rest

- [ ] **Database encryption enabled**
  - Supabase: TDE (Transparent Data Encryption) enabled
  - Backup encryption: Enabled for all backups
  - Status: ✅ Supabase provides encryption by default

- [ ] **Sensitive fields encrypted in database**
  - Fields: Credit card numbers, SSN, API keys
  - Method: Use Prisma field-level encryption or application-level encryption
  - Key storage: HashiCorp Vault (EXC-SEC-001)

- [ ] **Secrets stored securely**
  - ✅ Environment variables for non-sensitive config
  - ✅ Vault for API keys, database passwords, encryption keys
  - ❌ Never commit secrets to Git (enforced by git-secrets)

#### Data in Transit

- [ ] **TLS 1.3 enforced for all connections**
  - API: `apps/api/src/server.ts` - HTTPS only
  - Web: Next.js production build forces HTTPS
  - Database: Supabase connections use SSL
  - Redis: Upstash connections use TLS

- [ ] **Certificate validation enabled**
  - No `rejectUnauthorized: false` in code
  - No self-signed certificates in production
  - Certificate expiry monitoring enabled

- [ ] **mTLS for service-to-service communication**
  - Location: `infra/security/mtls-config.yaml`
  - Status: ✅ Configured (IFC-008)
  - Verification: Test inter-service calls require valid client certs

#### Cryptographic Standards

- [ ] **Strong algorithms used**
  - Hashing: bcrypt (password hashing), SHA-256 (file integrity)
  - Encryption: AES-256-GCM (symmetric), RSA-2048+ (asymmetric)
  - ❌ Avoid: MD5, SHA-1, DES, RC4

- [ ] **Secure random number generation**
  - Use: `crypto.randomBytes()` (Node.js)
  - ❌ Avoid: `Math.random()` for security purposes

- [ ] **Password hashing best practices**
  - Algorithm: bcrypt with cost factor ≥12
  - Location: Auth service (Supabase handles this)
  - Verify: No plain text passwords stored

#### Key Management

- [ ] **Encryption keys stored in Vault**
  - Location: HashiCorp Vault (EXC-SEC-001)
  - Rotation: Keys rotated every 90 days
  - Access: Only authorized services can retrieve keys

- [ ] **No hardcoded secrets in code**
  - Verification: Run `gitleaks` in CI pipeline
  - Verification: `git-secrets` pre-commit hook
  - Status: ✅ Configured (.github/workflows/security.yml)

---

## A03: Injection

**Risk**: SQL injection, NoSQL injection, command injection, LDAP injection.

### Checklist Items

#### SQL Injection Prevention

- [ ] **Use Prisma ORM for all database queries**
  - ✅ Prisma provides automatic parameterization
  - ✅ No raw SQL queries (or use `prisma.$queryRaw` with parameters)
  - Example:
    ```typescript
    // ✅ Safe
    await prisma.lead.findMany({ where: { email } });

    // ❌ Unsafe
    await prisma.$executeRawUnsafe(`SELECT * FROM leads WHERE email = '${email}'`);

    // ✅ Safe raw query
    await prisma.$queryRaw`SELECT * FROM leads WHERE email = ${email}`;
    ```

- [ ] **Input validation on all user inputs**
  - Location: `packages/validators/src/`
  - Pattern: Zod schemas validate all inputs before DB queries
  - Example:
    ```typescript
    const CreateLeadSchema = z.object({
      email: z.string().email(),
      name: z.string().min(1).max(255),
    });
    ```

#### NoSQL Injection Prevention

- [ ] **Validate and sanitize all MongoDB/Redis inputs**
  - Redis: Use ioredis with parameterized commands
  - Vector DB: Validate embeddings before insertion
  - ❌ Avoid: String concatenation in queries

#### Command Injection Prevention

- [ ] **No shell command execution with user input**
  - Pattern: Use libraries instead of shell commands
  - Example: Use `node-postgres` instead of `psql` CLI
  - If unavoidable: Use `child_process.execFile()` with argument array (not string)

- [ ] **Validate file paths for file operations**
  - Pattern: Use path.resolve() and check for directory traversal
  - Example:
    ```typescript
    import path from 'path';

    const safePath = path.resolve(uploadDir, path.basename(fileName));
    if (!safePath.startsWith(uploadDir)) {
      throw new Error('Invalid file path');
    }
    ```

#### LDAP Injection Prevention

- [ ] **Escape LDAP special characters**
  - Not applicable (no LDAP integration currently)
  - Future: Use LDAP libraries with built-in escaping

#### XPath Injection Prevention

- [ ] **Use JSON instead of XML where possible**
  - Status: ✅ All APIs use JSON
  - If XML needed: Use XPath libraries with parameterized queries

---

## A04: Insecure Design

**Risk**: Fundamental flaws in application architecture and threat modeling.

### Checklist Items

#### Threat Modeling

- [ ] **Threat model documented**
  - Location: `docs/security/threat-model.md`
  - Status: ❌ Not yet created (TODO: IFC-008)
  - Contents: Data flow diagrams, trust boundaries, threat analysis (STRIDE)

- [ ] **Architecture Decision Records (ADRs) for security decisions**
  - Location: `docs/planning/adr/`
  - Examples: ADR for authentication strategy, data encryption, API design

#### Secure Development Lifecycle

- [ ] **Security requirements defined**
  - Location: Sprint_plan.csv - Security section
  - Review: Security requirements in every sprint
  - Gate: Security review required before production deployment

- [ ] **Security reviews in design phase**
  - Process: Architect reviews all major features for security
  - Checklist: OWASP checklist used in design reviews
  - Documentation: Security review notes in ADRs

#### Defense in Depth

- [ ] **Multiple layers of security controls**
  - Layer 1: Input validation (Zod schemas)
  - Layer 2: Authentication (Supabase Auth)
  - Layer 3: Authorization (RLS + RBAC)
  - Layer 4: Network security (mTLS, VPC)
  - Layer 5: Monitoring (SIEM, anomaly detection)

- [ ] **Fail securely**
  - Pattern: Default to deny access on errors
  - Example: Authentication failure → redirect to login (not grant access)
  - Example: Authorization error → return 403 (not 200 with empty data)

#### Rate Limiting & DoS Prevention

- [ ] **Rate limiting on all public APIs**
  - Location: `apps/api/src/middleware/rate-limit.ts`
  - Implementation: Upstash Redis with sliding window
  - Limits: 100 req/min per IP, 1000 req/min per authenticated user
  - Status: ✅ Planned (ENV-012-AI, Sprint 0)

- [ ] **Resource quotas enforced**
  - Upload limits: Max 10MB per file
  - Query limits: Max 1000 records per request
  - Pagination: Enforced on all list endpoints

#### Business Logic Security

- [ ] **Validate business logic workflows**
  - Example: Cannot convert lead to opportunity without qualification
  - Example: Cannot delete account with active opportunities
  - Location: Domain layer validation (`packages/domain/src/`)

- [ ] **Prevent race conditions**
  - Pattern: Use database transactions for multi-step operations
  - Pattern: Optimistic locking with version numbers
  - Example:
    ```typescript
    await prisma.$transaction(async (tx) => {
      const lead = await tx.lead.findUnique({ where: { id } });
      if (lead.version !== input.version) {
        throw new ConflictError('Lead was modified');
      }
      await tx.lead.update({ where: { id }, data: { version: lead.version + 1, ...input } });
    });
    ```

---

## A05: Security Misconfiguration

**Risk**: Insecure default configurations, unnecessary features enabled, verbose errors.

### Checklist Items

#### Secure Defaults

- [ ] **Production environment variables set**
  - Location: `.env.production` (not committed)
  - Required: `NODE_ENV=production`
  - Required: `DATABASE_URL` (production database)
  - Required: Error reporting disabled for users

- [ ] **Default passwords changed**
  - Database: Use strong random passwords from Vault
  - Admin accounts: Require password change on first login
  - No default credentials in production

#### Unnecessary Features Disabled

- [ ] **Disable debug modes in production**
  - `NODE_ENV=production` (disables verbose errors)
  - No `/debug` or `/admin` endpoints without authentication
  - Sourcemaps not exposed in production

- [ ] **Remove unused dependencies**
  - Run: `pnpm audit` to identify unused packages
  - Review: `package.json` for unnecessary dependencies
  - CI: Fail build if high-severity vulnerabilities found

- [ ] **Disable directory listing**
  - Next.js: No `public/` directory listing
  - API: No directory browsing on file uploads

#### Error Handling

- [ ] **Generic error messages for users**
  - ✅ User sees: "An error occurred. Please try again."
  - ✅ Logs contain: Full error details with stack trace
  - ❌ User should NOT see: Stack traces, SQL errors, file paths

- [ ] **Centralized error handling**
  - Location: `apps/api/src/middleware/error-handler.ts`
  - Pattern: Catch all errors, log details, return generic message
  - Example:
    ```typescript
    try {
      // Business logic
    } catch (error) {
      logger.error('Lead creation failed', { error, userId: ctx.user.id });
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create lead' });
    }
    ```

#### Security Headers

- [ ] **HTTP security headers configured**
  - Location: `apps/web/next.config.js`
  - Headers:
    ```typescript
    headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-XSS-Protection', value: '1; mode=block' },
      { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
      { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline'" },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'geolocation=(), microphone=(), camera=()' }
    ]
    ```

- [ ] **Verify headers in production**
  - Tool: https://securityheaders.com/
  - Target: Grade A
  - CI: Automated check in E2E tests

#### Patch Management

- [ ] **Dependencies updated regularly**
  - Frequency: Weekly `pnpm update` for patches
  - Frequency: Monthly review of major version updates
  - Tool: Dependabot alerts enabled

- [ ] **Security patches applied within 7 days**
  - Critical: Within 24 hours
  - High: Within 7 days
  - Medium: Within 30 days
  - Process: Monitor `pnpm audit` output

---

## A06: Vulnerable and Outdated Components

**Risk**: Using components with known vulnerabilities.

### Checklist Items

#### Dependency Scanning

- [ ] **Automated dependency scanning**
  - Tool: `pnpm audit` in CI pipeline
  - Tool: Snyk / GitHub Dependabot
  - Frequency: Every PR and nightly builds
  - Status: ✅ Configured (.github/workflows/security.yml)

- [ ] **No critical/high vulnerabilities in production**
  - CI: Fail build if critical vulnerabilities found
  - Process: Review and upgrade or mitigate before deploying

#### Dependency Management

- [ ] **Use exact versions for production dependencies**
  - Pattern: Use `pnpm install --frozen-lockfile` in CI
  - Review: Lock file committed to Git
  - ❌ Avoid: `^` or `~` for critical dependencies in production

- [ ] **Minimize dependency count**
  - Review: Justify each new dependency
  - Prefer: Native Node.js APIs over third-party libraries
  - Check: Bundle size impact

#### Software Bill of Materials (SBOM)

- [ ] **SBOM generated for releases**
  - Tool: `cyclonedx` or `syft`
  - Format: SPDX or CycloneDX
  - Location: `artifacts/sbom/sbom.json`
  - Purpose: Vulnerability tracking and compliance

#### Third-Party Services

- [ ] **Vendor security assessment**
  - Supabase: Review security certifications (SOC 2, ISO 27001)
  - OpenAI: Review data processing agreement (DPA)
  - Upstash: Review security practices
  - Location: `docs/governance/ai-vendor-assessments/`

---

## A07: Identification and Authentication Failures

**Risk**: Broken authentication, session management flaws, credential stuffing.

### Checklist Items

#### Authentication

- [ ] **Use Supabase Auth for authentication**
  - ✅ Industry-standard authentication provider
  - ✅ Supports MFA, social login, magic links
  - Location: `apps/web/src/app/auth/`

- [ ] **Enforce strong password policies**
  - Minimum: 12 characters
  - Require: Uppercase, lowercase, number, special character
  - Check: Against common password lists (pwned passwords)
  - Supabase: Configure in Supabase dashboard

- [ ] **Multi-Factor Authentication (MFA) available**
  - Status: ✅ Supported by Supabase
  - Enforcement: Required for admin accounts
  - Methods: TOTP, SMS (TOTP preferred)

#### Session Management

- [ ] **Secure session cookies**
  - Attributes: `Secure`, `HttpOnly`, `SameSite=Strict`
  - Expiry: 24 hours (configurable)
  - Refresh: Automatic token refresh before expiry

- [ ] **Session invalidation on logout**
  - Server-side: Revoke session token
  - Client-side: Clear all cookies and local storage
  - Verify: Cannot use old session after logout

- [ ] **Concurrent session limits**
  - Limit: 5 concurrent sessions per user
  - Behavior: Oldest session invalidated when limit reached
  - Dashboard: User can view/revoke active sessions

#### Account Security

- [ ] **Account lockout after failed login attempts**
  - Threshold: 5 failed attempts in 15 minutes
  - Lockout: 15 minutes or until email verification
  - Notification: Email sent to account owner

- [ ] **Password reset flow secure**
  - Token: Single-use, expires in 1 hour
  - Delivery: Sent to registered email only
  - Verification: Requires old password OR email verification

- [ ] **Prevent user enumeration**
  - Login: Same response for "invalid email" and "invalid password"
  - Registration: Generic message for existing emails
  - Password reset: Success message even if email doesn't exist

#### API Authentication

- [ ] **API keys for service accounts**
  - Generation: Cryptographically random (32+ bytes)
  - Storage: Hashed in database (like passwords)
  - Rotation: Mandatory every 90 days
  - Scope: Least privilege permissions

- [ ] **JWT tokens properly validated**
  - Verify: Signature, expiry, issuer, audience
  - Algorithm: RS256 (not HS256 for public APIs)
  - Location: `apps/api/src/middleware/auth.ts`

---

## A08: Software and Data Integrity Failures

**Risk**: Insecure CI/CD, unsigned code, tampered data.

### Checklist Items

#### Code Integrity

- [ ] **Signed commits required**
  - Enforcement: GitHub branch protection rules
  - Developers: Configure GPG signing
  - Verification: All commits show "Verified" badge

- [ ] **Code review required for all changes**
  - Requirement: 1+ approvals for PRs
  - No direct commits to main branch
  - Status: ✅ Configured in GitHub

#### CI/CD Security

- [ ] **Secrets not exposed in CI logs**
  - Pattern: Use GitHub Secrets for sensitive values
  - Verification: Review CI logs for accidentally printed secrets
  - Tool: `gitleaks` scans CI logs

- [ ] **Build artifacts signed**
  - Docker images: Sign with Docker Content Trust
  - NPM packages: Use `npm publish --provenance`
  - Verification: Consumers verify signatures

- [ ] **Supply chain security**
  - Pattern: Use lock files (`pnpm-lock.yaml`)
  - Pattern: Verify package checksums
  - Tool: Sigstore/cosign for artifact signing

#### Data Integrity

- [ ] **Database backups verified**
  - Frequency: Daily backups
  - Verification: Monthly restore tests
  - Encryption: All backups encrypted at rest

- [ ] **Integrity checks for critical data**
  - Pattern: Store hash of sensitive records
  - Example: Hash of contract terms in agreements
  - Verification: Compare hash on read

- [ ] **Audit logging for data changes**
  - Pattern: Append-only audit log
  - Content: Who, what, when, why (if provided)
  - Retention: 7 years (compliance requirement)

#### Deserialization Security

- [ ] **Validate all deserialized data**
  - Pattern: Use Zod schemas to validate JSON
  - ❌ Avoid: `eval()`, `Function()`, `vm.runInContext()`
  - Example:
    ```typescript
    const data = JSON.parse(input);
    const validated = LeadSchema.parse(data);  // Throws if invalid
    ```

- [ ] **No pickle/marshal for untrusted data**
  - Not applicable (Node.js)
  - Python (if used): Never unpickle user input

---

## A09: Security Logging and Monitoring Failures

**Risk**: Undetected breaches, inability to investigate incidents.

### Checklist Items

#### Logging

- [ ] **Comprehensive logging implemented**
  - Location: `packages/observability/src/logging.ts`
  - Events: Authentication, authorization, input validation failures, errors
  - Format: Structured JSON logs
  - Status: ✅ Planned (ENV-011-AI, Sprint 0)

- [ ] **Sensitive data not logged**
  - ❌ Never log: Passwords, API keys, credit cards, SSNs
  - ✅ Log: User ID, action, timestamp, IP address, result
  - Pattern: Sanitize objects before logging

- [ ] **Correlation IDs for request tracing**
  - Pattern: Generate correlation ID at entry point
  - Propagation: Include in all logs and external calls
  - Location: `apps/api/src/tracing/correlation.ts`

#### Monitoring

- [ ] **Security events monitored**
  - Events: Failed logins, authorization failures, unusual traffic
  - Tool: Sentry for errors, custom dashboard for security events
  - Alerting: PagerDuty for critical security events

- [ ] **Real-time alerting configured**
  - Alert: 10+ failed logins from single IP in 1 minute
  - Alert: Admin privilege escalation
  - Alert: Unusual data access patterns
  - Alert: High error rate (>5% of requests)

#### SIEM Integration

- [ ] **Logs forwarded to SIEM**
  - Status: ❌ Not yet implemented (TODO: Future sprint)
  - Candidates: Splunk, Elastic Security, Datadog
  - Purpose: Centralized security monitoring

#### Incident Response

- [ ] **Incident response plan documented**
  - Location: `docs/operations/incident-response.md`
  - Contents: Roles, escalation, communication, forensics
  - Status: ✅ Planned (IFC-008)

- [ ] **Log retention policy**
  - Application logs: 90 days
  - Audit logs: 7 years (compliance)
  - Security events: 1 year
  - Storage: Encrypted, access-controlled

#### Monitoring Tools

- [ ] **Application Performance Monitoring (APM)**
  - Tool: OpenTelemetry + Sentry
  - Metrics: Response times, error rates, throughput
  - Location: `packages/observability/src/tracing.ts`

- [ ] **Uptime monitoring**
  - Tool: UptimeRobot / Pingdom
  - Frequency: Check every 1 minute
  - Alerts: Notify on-call engineer if down >5 minutes

---

## A10: Server-Side Request Forgery (SSRF)

**Risk**: Attacker tricks server into making requests to internal resources.

### Checklist Items

#### Input Validation

- [ ] **Validate and sanitize URLs**
  - Pattern: Parse URL and check domain against allowlist
  - Example:
    ```typescript
    const allowedDomains = ['api.openai.com', 'api.supabase.io'];
    const url = new URL(input);
    if (!allowedDomains.includes(url.hostname)) {
      throw new Error('Invalid domain');
    }
    ```

- [ ] **No user-controlled URLs in server requests**
  - Review: All `fetch()`, `axios()`, etc. calls
  - Pattern: Use configuration for external URLs, not user input

#### Network Segmentation

- [ ] **Internal services not accessible from public internet**
  - Pattern: Use private VPC for database, Redis, internal APIs
  - Verification: Attempt to access internal IPs from public IP

- [ ] **Egress filtering**
  - Pattern: Whitelist allowed external domains
  - Example: Only allow connections to OpenAI, Supabase, AWS
  - Implementation: Network firewall rules

#### Metadata Service Protection

- [ ] **Block access to cloud metadata services**
  - AWS: Block 169.254.169.254
  - Azure: Block 169.254.169.254
  - GCP: Block metadata.google.internal
  - Implementation: Network ACLs or application-level checks

#### Webhook Security

- [ ] **Validate webhook URLs**
  - Pattern: Allowlist for webhook destinations
  - Pattern: Verify webhook signatures (HMAC)
  - Pattern: No webhooks to private IPs

- [ ] **Webhook retry limits**
  - Max retries: 3
  - Backoff: Exponential (1s, 2s, 4s)
  - Timeout: 5 seconds per request

---

## Additional Security Controls

### XSS Protection

- [ ] **Content Security Policy (CSP) configured**
  - See A05 - Security Headers section above
  - Policy: Strict CSP with nonce for inline scripts

- [ ] **React escapes output by default**
  - ✅ React auto-escapes JSX expressions
  - ❌ Avoid: `dangerouslySetInnerHTML` unless absolutely necessary
  - If needed: Use DOMPurify to sanitize HTML

- [ ] **Sanitize user-generated content**
  - Tool: DOMPurify for HTML sanitization
  - Example: User bio, comments, rich text fields
  - Location: `packages/ui/src/lib/sanitize.ts`

### CSRF Protection

- [ ] **CSRF tokens for state-changing operations**
  - Pattern: Use SameSite=Strict cookies (primary defense)
  - Pattern: Custom header (X-Requested-With) for AJAX
  - Pattern: CSRF token for forms (if using traditional forms)

- [ ] **Verify Origin/Referer headers**
  - Pattern: Check Origin header matches expected domain
  - Fallback: Check Referer if Origin not present
  - Location: `apps/api/src/middleware/csrf.ts`

### API Security

- [ ] **API versioning implemented**
  - Pattern: `/api/v1/leads`, `/api/v2/leads`
  - Purpose: Backwards compatibility, gradual deprecation

- [ ] **API documentation kept up-to-date**
  - Tool: Auto-generated from tRPC routers
  - Access: Internal only (not public)

- [ ] **Input size limits**
  - Body size: 10MB max
  - Query parameters: 2KB max
  - Headers: 8KB max (Node.js default)

### Data Validation

- [ ] **Comprehensive input validation**
  - All inputs: Validated with Zod schemas
  - Location: `packages/validators/src/`
  - Pattern: Validate type, format, range, length

- [ ] **Output encoding**
  - HTML: React auto-encodes
  - JSON: Use `JSON.stringify()`
  - URL: Use `encodeURIComponent()`
  - SQL: Use Prisma (auto-parameterized)

### File Upload Security

- [ ] **File upload validation**
  - Validate: File extension, MIME type, size
  - Max size: 10MB
  - Allowed types: Images (JPEG, PNG), PDFs, CSV
  - Location: `apps/api/src/modules/upload/`

- [ ] **Store uploaded files securely**
  - Storage: S3 with private ACL (not public)
  - Access: Signed URLs with expiry
  - Scan: Antivirus scan before storage (future)

- [ ] **Prevent path traversal in uploads**
  - Pattern: Generate random filename (UUID)
  - Pattern: Validate path does not contain `..` or `/`

---

## Security Testing

### Automated Testing

- [ ] **Security tests in CI pipeline**
  - Dependency scan: `pnpm audit`
  - Secret scan: `gitleaks`
  - SAST: Semgrep / ESLint security rules
  - DAST: OWASP ZAP (planned)

- [ ] **Architecture tests enforce security boundaries**
  - Location: `tests/architecture/`
  - Example: Domain layer cannot depend on infrastructure
  - CI: Fail build if violations found

### Manual Testing

- [ ] **Penetration testing performed**
  - Frequency: Annually
  - Scope: Full application (web, API, infrastructure)
  - Status: ❌ Not yet performed (TODO: Pre-production)

- [ ] **Security code review**
  - Process: Security team reviews high-risk code
  - Focus: Authentication, authorization, cryptography
  - Trigger: Major security-related features

### Bug Bounty

- [ ] **Bug bounty program planned**
  - Status: ❌ Not yet launched (TODO: Post-MVP)
  - Platform: HackerOne / Bugcrowd
  - Scope: Production application

---

## Compliance

- [ ] **GDPR compliance verified**
  - Data minimization: Collect only necessary data
  - Right to be forgotten: Data deletion implemented
  - Data portability: Export functionality exists
  - Privacy policy: Published and up-to-date

- [ ] **ISO 42001 gap analysis completed**
  - Location: `docs/planning/iso42001-gap-analysis.md`
  - Status: ✅ Created (IFC-008)

- [ ] **SOC 2 readiness assessed**
  - Status: ❌ Not yet started (TODO: Pre-production)

---

## Verification & Sign-off

### Sprint 0 (Foundation Phase)

- [ ] Security assessment completed (IFC-008)
- [ ] Security documentation created
- [ ] Security tools configured (gitleaks, pnpm audit)
- [ ] mTLS configuration defined

**Sign-off**: ___________________ Date: ___________

### Pre-Production

- [ ] All critical/high priority items completed
- [ ] Penetration testing passed
- [ ] Security code review completed
- [ ] Incident response plan tested

**Sign-off**: ___________________ Date: ___________

### Quarterly Reviews

**Q1 2026**: ___________________ Date: ___________
**Q2 2026**: ___________________ Date: ___________
**Q3 2026**: ___________________ Date: ___________
**Q4 2026**: ___________________ Date: ___________

---

## References

- **OWASP Top 10 2021**: https://owasp.org/Top10/
- **OWASP Cheat Sheet Series**: https://cheatsheetseries.owasp.org/
- **CWE Top 25**: https://cwe.mitre.org/top25/
- **NIST Cybersecurity Framework**: https://www.nist.gov/cyberframework
- **IntelliFlow Security Policy**: `docs/security/security-policy.md`

---

**Document Status**: ✅ Created
**Last Review**: 2025-12-22
**Next Review**: 2026-03-22 (Quarterly)
**Owner**: Security Team
**Approver**: CTO
