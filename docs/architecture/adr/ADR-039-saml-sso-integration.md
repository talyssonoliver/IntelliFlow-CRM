# ADR-039: SAML SSO Integration for Enterprise Identity Providers

**Status:** Accepted

**Date:** 2026-02-25

**Deciders:** Security Lead, Frontend Lead, Backend Architect

**Technical Story:** PG-124

## Context and Problem Statement

IntelliFlow CRM currently supports OAuth 2.0/OIDC social login (Google,
Microsoft) via Supabase Auth PKCE flow. Enterprise customers require SAML 2.0
SSO integration with their corporate identity providers (Okta, Azure AD,
OneLogin, etc.) for centralized access management. How should we implement SAML
SSO while maintaining the existing OAuth infrastructure?

## Decision Drivers

- Enterprise customers require SAML 2.0 for corporate IdP integration
- Must coexist with existing OAuth 2.0/OIDC flow (Google, Microsoft)
- Supabase Auth supports SAML via their SSO API
- Security: assertions must be validated (signature, audience, timestamps)
- Performance: SSO login must complete in <2s
- UX: Clear separation between social login (consumer) and enterprise SSO
- Admin configurability: SSO providers must be manageable per-tenant

## Considered Options

- **Option 1**: Supabase Auth SAML SSO (native integration)
- **Option 2**: Custom SAML middleware (passport-saml / saml2-js)
- **Option 3**: Third-party SSO gateway (Auth0, WorkOS)

## Decision Outcome

Chosen option: **"Supabase Auth SAML SSO"** (Option 1), because Supabase
provides native SAML SSO support via their Management API, integrating
seamlessly with the existing PKCE auth flow and minimizing infrastructure
changes.

### Positive Consequences

- Reuses existing Supabase Auth infrastructure and PKCE callback
- Single auth provider for both OAuth and SAML
- Managed SAML assertion parsing and validation
- Provider configuration via Supabase dashboard or Management API
- No additional dependencies or infrastructure

### Negative Consequences

- Dependent on Supabase SAML feature availability and limitations
- Less control over SAML assertion parsing details
- Provider configuration requires Supabase Management API access

## Implementation Notes

### SSO Page Flow

1. User navigates to `/sso` (linked from login page "Enterprise SSO")
2. User enters their work email domain
3. System looks up configured SAML provider for that domain
4. Redirects to IdP with SAML AuthnRequest
5. IdP authenticates user, sends SAML Response to callback
6. Existing `/auth/callback` handles the response via Supabase
7. Session created, user redirected to dashboard

### Key Files

- `apps/web/src/app/(public)/sso/page.tsx` — Enterprise SSO entry page
- `apps/web/src/lib/auth/sso-handler.ts` — SSO domain lookup + redirect logic
- `infra/monitoring/provider-config.json` — Provider configuration schema

### Validation Criteria

- [ ] SAML SSO flow completes in <2s
- [ ] Error rate <1%
- [ ] SSO page reachable from login page
- [ ] Provider domain lookup works correctly
- [ ] Existing OAuth flows unaffected

## Links

- Refines [ADR-020](ADR-020-public-site-auth.md)
- Related [ADR-009](ADR-009-zero-trust-security.md)
- [Supabase SAML SSO Docs](https://supabase.com/docs/guides/auth/enterprise-sso/auth-sso-saml)
