# Context Pack: IFC-143

## Task Details
- **Task ID**: IFC-143
- **Title**: Perform threat modeling and abuse-case analysis for multi-tenancy and agent tool-calling; design mitigations; schedule penetration test; implement cookie consent mechanism
- **Sprint**: 11
- **Owner**: Security Lead + AI Specialist (STOA-Security)

## Prerequisites Reviewed

### 1. Zero Trust Security Architecture
**File**: `docs/security/zero-trust-design.md`

The system implements a 4-layer zero trust model:
- **Layer 1 (UI)**: Client-side validation, CSP headers
- **Layer 2 (API Auth)**: JWT validation, session management
- **Layer 3 (API Authorization)**: RBAC/ABAC with permission middleware
- **Layer 4 (Database)**: Row-Level Security (RLS) via Supabase

### 2. Agent Tool-Calling Architecture
**File**: `docs/planning/adr/ADR-006-agent-tools.md`

Agent tool-calling uses a hybrid LangChain + tRPC approach:
- Tools are wrapped as LangChain StructuredTool instances
- All calls route through tRPC for type safety and authorization
- Approval middleware intercepts high-risk actions
- Human-in-the-loop workflow for confidence scores < threshold

### 3. Prompt Sanitization
**File**: `apps/api/src/shared/prompt-sanitizer.ts`

Existing guardrails include:
- Pattern-based detection of prompt injection attempts
- System prompt protection
- Instruction override detection
- Context separation enforcement

### 4. Multi-Tenancy Architecture
**File**: `docs/security/multi-tenancy.md`

Tenant isolation is enforced via:
- `tenantId` on all entities (see Prisma schema)
- RLS policies at database level
- Middleware tenant context injection
- Request-scoped tenant isolation

### 5. OWASP Security Checklist
**File**: `docs/security/owasp-checklist.md`

Comprehensive checklist covering:
- A01: Broken Access Control (RLS, RBAC, IDOR prevention)
- A02: Cryptographic Failures (TLS 1.3, Vault secrets)
- A03: Injection (Prisma ORM, Zod validation)
- A04: Insecure Design (threat modeling gap identified)
- A05-A10: Additional security controls

### 6. Audit Matrix
**File**: `audit-matrix.yml`

Security tooling configured:
- Tier 1: gitleaks, pnpm-audit, snyk, trivy-image, semgrep
- Tier 2: codeql-analysis, bearer, osv-scanner
- Tier 3: owasp-zap, langfuse-audit, garak (AI security)

### 7. Database Schema Security
**File**: `packages/db/prisma/schema.prisma`

Security models implemented:
- `Tenant` model with status (ACTIVE, SUSPENDED, TRIAL)
- `SecurityEvent` with severity levels
- `AuditLogEntry` with full context (actor, action, before/after)
- `Permission`, `RBACRole`, `UserRoleAssignment` for RBAC
- `AgentAction` with approval workflow states

## Key Security Concerns Identified

### Multi-Tenancy Threats
1. **Tenant Isolation Bypass**: Manipulated tenantId in requests
2. **Cross-Tenant Data Leakage**: Improper RLS policy configuration
3. **Tenant Enumeration**: User enumeration via error messages
4. **Privilege Escalation**: Role assignment manipulation

### Agent Tool-Calling Threats
1. **Prompt Injection**: Malicious instructions in user input
2. **Tool Abuse**: Unauthorized tool invocation
3. **Confidence Score Manipulation**: Bypassing human approval
4. **Data Exfiltration**: Using agent to extract sensitive data
5. **Action Rollback Abuse**: Manipulating rollback functionality

### Cookie Consent Requirements
- GDPR compliance for EU users
- Cookie categorization (necessary, analytics, marketing)
- Consent persistence and revocation
- Third-party cookie disclosure

## Dependencies Status
- **IFC-125** (Security audit infrastructure): PLANNED
- **IFC-136** (AI guardrails foundation): DONE
- **IFC-139** (Prompt injection prevention): DONE

## Artifacts to Produce
1. `docs/security/threat-model.puml` - STRIDE threat model diagram
2. `docs/security/abuse-cases.md` - Abuse case documentation
3. `artifacts/reports/pen-test-report.pdf` - Penetration test schedule (scope document)
4. `artifacts/logs/mitigation-backlog.csv` - Prioritized mitigation tasks
5. `artifacts/misc/cookie-consent-component.tsx` - Cookie consent UI component
