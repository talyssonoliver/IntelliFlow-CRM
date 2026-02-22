# Auth & Public Pages - Dependency Chain Analysis

**Generated**: 2026-02-03 **Purpose**: Ensure complete authentication flows and
public pages with no orphaned tasks

---

## Executive Summary

The **Auth & Public Pages** domain covers authentication flows, public marketing
pages, and onboarding. Most auth infrastructure is complete but some flows need
verification.

| Feature            | Backend | Frontend   | Status   |
| ------------------ | ------- | ---------- | -------- |
| Sign In            | IFC-006 | PG-015     | COMPLETE |
| Sign Up            | IFC-006 | PG-016     | COMPLETE |
| Sign Up Success    | IFC-006 | PG-017     | COMPLETE |
| Password Reset     | IFC-006 | PG-018-021 | COMPLETE |
| MFA/2FA            | IFC-098 | PG-021-022 | COMPLETE |
| Email Verification | IFC-006 | PG-023     | COMPLETE |
| Public Pages       | N/A     | PG-001-014 | COMPLETE |
| Onboarding         | IFC-076 | PG-126     | BACKLOG  |

---

## Full Dependency Diagram

```
                    ┌─────────────────────────────────────────────────────────────────────────┐
                    │                     AUTH & PUBLIC PAGES DOMAIN                           │
                    │           Authentication, Public Marketing, Onboarding                   │
                    └─────────────────────────────────────────────────────────────────────────┘

    ╔═══════════════════════════════════════════════════════════════════════════════════════════╗
    ║  LAYER 1: AUTH INFRASTRUCTURE                                             ✅ COMPLETE    ║
    ╚═══════════════════════════════════════════════════════════════════════════════════════════╝

    ┌─────────────────────────┐    ┌─────────────────────────┐    ┌─────────────────────────┐
    │       IFC-006           │    │       IFC-098           │    │       IFC-127           │
    │  Supabase Auth          │    │   RBAC/ABAC System      │    │  Tenant Isolation       │
    │                         │    │                         │    │                         │
    │  - Auth flow setup      │    │  - Role definitions     │    │  - RLS policies         │
    │  - Real-time subs       │    │  - Permission grants    │    │  - Application layer    │
    │  - pgvector enabled     │    │  - MFA configuration    │    │  - Session tokens       │
    │                         │    │                         │    │                         │
    │  Status: COMPLETED ✅   │    │  Status: COMPLETED ✅   │    │  Status: COMPLETED ✅   │
    │  Sprint: 3              │    │  Sprint: 5              │    │  Sprint: 10             │
    └─────────────────────────┘    └─────────────────────────┘    └─────────────────────────┘

    ╔═══════════════════════════════════════════════════════════════════════════════════════════╗
    ║  LAYER 2: AUTH tRPC ROUTERS                                               ✅ COMPLETE    ║
    ╚═══════════════════════════════════════════════════════════════════════════════════════════╝

                              ┌─────────────────────────────────────────┐
                              │     apps/api/src/modules/auth/          │
                              │                                         │
                              │  auth.router.ts:                        │
                              │  - auth.signIn                          │
                              │  - auth.signUp (IFC-120: Supabase)      │
                              │  - auth.signOut                         │
                              │  - auth.requestPasswordReset (IFC-120)  │
                              │  - auth.resetPassword (IFC-120)         │
                              │  - auth.verifyEmail (IFC-120: replaced) │
                              │  - auth.resendVerification (IFC-120)    │
                              │  - auth.refreshToken                    │
                              │  - auth.getSession                      │
                              │                                         │
                              │  Status: COMPLETED ✅                   │
                              └─────────────────────────────────────────┘

    ╔═══════════════════════════════════════════════════════════════════════════════════════════╗
    ║  LAYER 3: AUTH FRONTEND PAGES                                             ✅ COMPLETE    ║
    ╚═══════════════════════════════════════════════════════════════════════════════════════════╝

    ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
    │   PG-015    │  │   PG-016    │  │   PG-017    │  │  PG-018-021 │  │   PG-023    │
    │  Sign In    │  │  Sign Up    │  │   Logout    │  │  Password   │  │   Email     │
    │             │  │  (IFC-120)  │  │             │  │   Reset     │  │   Verify    │
    │ /login      │  │ /signup     │  │ (redirect)  │  │ /forgot     │  │ /verify-    │
    │             │  │             │  │             │  │ /reset/cb   │  │ email/cb    │
    │ COMPLETED ✅│  │ COMPLETED ✅│  │ COMPLETED ✅│  │ COMPLETED ✅│  │ COMPLETED ✅│
    └──────┬──────┘  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘
           │
           │ PG-015 ──► PG-024
           ▼
    ┌─────────────┐
    │   PG-024    │
    │ SSO Callback│
    │             │
    │ /auth/      │
    │  callback   │
    │ COMPLETED ✅│
    └─────────────┘

    ╔═══════════════════════════════════════════════════════════════════════════════════════════╗
    ║  MFA/2FA FLOW                                                            ✅ COMPLETE     ║
    ╚═══════════════════════════════════════════════════════════════════════════════════════════╝

    ┌─────────────────────────────┐         ┌─────────────────────────────┐         ┌─────────────────────────────┐
    │        IFC-098              │         │       PG-021                │         │       PG-022                │
    │   RBAC / MFA Backend        │         │   MFA Setup Page            │         │   MFA Verify Page           │
    │                             │         │                             │         │                             │
    │  - TOTP setup               │         │  - 5-step wizard            │         │  - Standalone verify page   │
    │  - Backup codes             │ ───────►│  - QR code, SMS, Email      │ ───────►│  - URL param validation     │
    │  - Recovery flow            │         │  - 41 page tests (96% cov)  │         │  - Open redirect prevention │
    │                             │         │                             │         │                             │
    │  Status: COMPLETED ✅       │         │  Status: COMPLETED ✅       │         │  Status: COMPLETED ✅       │
    │  Sprint: 5                  │         │  Sprint: 13                 │         │  Sprint: 13                 │
    └─────────────────────────────┘         └─────────────────────────────┘         └─────────────────────────────┘
```

---

## Public Marketing Pages

```
    ╔═══════════════════════════════════════════════════════════════════════════════════════════╗
    ║  PUBLIC PAGES (No Backend Required)                                       ✅ COMPLETE    ║
    ╚═══════════════════════════════════════════════════════════════════════════════════════════╝

    ┌─────────────────────────────────────────────────────────────────────────────────────────┐
    │  MARKETING PAGES (PG-001 to PG-008)                                                      │
    └─────────────────────────────────────────────────────────────────────────────────────────┘

    ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
    │   PG-001    │  │   PG-002    │  │   PG-003    │  │   PG-004    │  │   PG-005    │
    │   Home      │  │  Features   │  │  Pricing    │  │   About     │  │  Contact    │
    │             │  │             │  │             │  │             │  │             │
    │ /           │  │ /features   │  │ /pricing    │  │ /about      │  │ /contact    │
    │ COMPLETED ✅│  │ COMPLETED ✅│  │ COMPLETED ✅│  │ COMPLETED ✅│  │ COMPLETED ✅│
    └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘

    ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
    │   PG-006    │  │   PG-007    │  │   PG-008    │
    │  Partners   │  │   Press     │  │  Security   │
    │             │  │             │  │             │
    │ /partners   │  │ /press      │  │ /security   │
    │ COMPLETED ✅│  │ COMPLETED ✅│  │ COMPLETED ✅│
    └─────────────┘  └─────────────┘  └─────────────┘

    ┌─────────────────────────────────────────────────────────────────────────────────────────┐
    │  CONTENT PAGES (PG-009 to PG-014)                                                        │
    └─────────────────────────────────────────────────────────────────────────────────────────┘

    ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
    │   PG-009    │  │   PG-010    │  │   PG-011    │  │   PG-012    │  │   PG-013    │
    │   Blog      │  │  Careers    │  │   Status    │  │  Privacy    │  │   Terms     │
    │             │  │             │  │             │  │             │  │             │
    │ /blog       │  │ /careers    │  │ /status     │  │ /privacy    │  │ /terms      │
    │ COMPLETED ✅│  │ COMPLETED ✅│  │ COMPLETED ✅│  │ COMPLETED ✅│  │ COMPLETED ✅│
    └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘

    ┌─────────────┐
    │   PG-014    │
    │  Cookie     │
    │  Policy     │
    │ /cookies    │
    │ COMPLETED ✅│
    └─────────────┘
```

---

## Billing & Subscription Pages

```
    ╔═══════════════════════════════════════════════════════════════════════════════════════════╗
    ║  BILLING PAGES (PG-025 to PG-031)                                        ⚠️ PARTIAL     ║
    ╚═══════════════════════════════════════════════════════════════════════════════════════════╝

    ┌─────────────────────────────┐
    │  ✅ PG-025: Billing Portal  │
    │                             │
    │  Dependencies:              │
    │  - Stripe integration       │         ┌─────────────────────────────┐
    │  - pricing.calculator.ts    │ ───────►│  Billing Pages              │
    │  - stripe-integration.ts    │         │                             │
    │                             │         │  PG-026: Plans              │
    │  Status: COMPLETED          │         │  PG-027: Usage              │
    │  Sprint: 14                 │         │  PG-028: Invoices           │
    │                             │         │  PG-029: Payment Methods    │
    └─────────────────────────────┘         │  PG-030: Upgrade            │
                                            │  PG-031: Downgrade          │
                                            │                             │
                                            │  Status: BACKLOG            │
                                            └─────────────────────────────┘
```

---

## Onboarding Flow

```
    ╔═══════════════════════════════════════════════════════════════════════════════════════════╗
    ║  ONBOARDING FLOW                                                         ⚠️ BACKLOG     ║
    ╚═══════════════════════════════════════════════════════════════════════════════════════════╝

    ┌─────────────────────────────┐         ┌─────────────────────────────┐
    │        IFC-076              │         │       PG-126                │
    │   Onboarding Backend        │         │   Onboarding UI             │
    │                             │         │                             │
    │  - Wizard state tracking    │         │  - Guided tours             │
    │  - Progress persistence     │ ───────►│  - Setup wizard             │
    │  - Template defaults        │         │  - Tooltips                 │
    │                             │         │  - Progress tracking        │
    │  Status: BACKLOG            │         │                             │
    │  Sprint: 13                 │         │  Status: BACKLOG            │
    │                             │         │  Sprint: 26                 │
    └─────────────────────────────┘         └─────────────────────────────┘
```

---

## Developer Portal Pages

```
    ╔═══════════════════════════════════════════════════════════════════════════════════════════╗
    ║  DEVELOPER PAGES (PG-032 to PG-042)                                 ⏳ IN PROGRESS       ║
    ╚═══════════════════════════════════════════════════════════════════════════════════════════╝

    ┌─────────────────────────────────────────────────────────────────────────────────────────┐
    │  DOCUMENTATION & API                                                                     │
    └─────────────────────────────────────────────────────────────────────────────────────────┘

    ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
    │   PG-032    │  │   PG-033    │  │   PG-034    │  │   PG-035    │  │   PG-036    │
    │  Docs Hub   │  │  API Docs   │  │  Tutorials  │  │   Guides    │  │ Webhooks    │
    │             │  │  (Scalar)   │  │             │  │             │  │             │
    │ /docs       │  │ /docs/api   │  │ /tutorials  │  │ /guides     │  │ /api        │
    │ ✅ DONE     │  │ ✅ DONE     │  │ BACKLOG     │  │ BACKLOG     │  │ BACKLOG     │
    └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘

    ┌─────────────────────────────────────────────────────────────────────────────────────────┐
    │  SDK & TOOLS                                                                             │
    └─────────────────────────────────────────────────────────────────────────────────────────┘

    ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
    │   PG-037    │  │   PG-038    │  │   PG-039    │  │   PG-040    │  │   PG-041    │
    │   SDKs      │  │  Webhooks   │  │  Sandbox    │  │  Changelog  │  │  Community  │
    │             │  │   Docs      │  │             │  │             │  │             │
    │ /sdks       │  │ /webhooks   │  │ /sandbox    │  │ /changelog  │  │ /community  │
    │ BACKLOG     │  │ BACKLOG     │  │ BACKLOG     │  │ BACKLOG     │  │ BACKLOG     │
    └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘

    ┌─────────────┐
    │   PG-042    │
    │  Support    │
    │  Portal     │
    │ /support    │
    │ BACKLOG     │
    └─────────────┘

    Backend Dependencies:
    - IFC-042: tRPC API Client SDK Docs ✅
    - IFC-144: Webhook Integration ✅
    - IFC-076: Settings Backend ⚠️
```

---

## Support & Legal Pages

```
    ╔═══════════════════════════════════════════════════════════════════════════════════════════╗
    ║  SUPPORT & LEGAL PAGES (PG-043 to PG-050)                                ⚠️ BACKLOG     ║
    ╚═══════════════════════════════════════════════════════════════════════════════════════════╝

    ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
    │   PG-043    │  │   PG-044    │  │   PG-045    │  │   PG-046    │
    │  Help Center│  │    FAQs     │  │   Submit    │  │   Ticket    │
    │             │  │             │  │   Ticket    │  │   Status    │
    │ /help       │  │ /faq        │  │ /support/new│  │ /tickets    │
    │ BACKLOG     │  │ BACKLOG     │  │ BACKLOG     │  │ BACKLOG     │
    └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘

    ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
    │   PG-047    │  │   PG-048    │  │   PG-049    │  │   PG-050    │
    │   DPA       │  │   SLA       │  │   GDPR      │  │  Security   │
    │             │  │             │  │   Export    │  │   Whitepaper│
    │ /dpa        │  │ /sla        │  │ /gdpr       │  │ /security   │
    │ BACKLOG     │  │ BACKLOG     │  │ BACKLOG     │  │ BACKLOG     │
    └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘

    Backend Dependencies:
    - IFC-140: Data Governance (DSAR) ✅
    - IFC-124: Audit Logging ✅
```

---

## Summary: Auth & Public Pages Status

```
    ┌─────────────────────────────────────────────────────────────────────────────────────────┐
    │  COMPLETION STATUS BY CATEGORY                                                           │
    └─────────────────────────────────────────────────────────────────────────────────────────┘

    ┌────────────────────────┬─────────────┬─────────────┬─────────────────────────────────────┐
    │ Category               │ Backend     │ Frontend    │ Notes                               │
    ├────────────────────────┼─────────────┼─────────────┼─────────────────────────────────────┤
    │ Auth (Sign In/Up/Succ) │ ✅ Complete │ ✅ Complete │ IFC-006, PG-015-017                 │
    │ Password Reset         │ ✅ Complete │ ✅ Complete │ IFC-006, PG-018-021                 │
    │ MFA/2FA                │ ✅ Complete │ ✅ Complete │ IFC-098, PG-021-022 ✅               │
    │ SSO Callback           │ ✅ Complete │ ✅ Complete │ PG-024 (PKCE via OAuthCallback)     │
    │ Email Verification     │ ✅ Complete │ ✅ Complete │ IFC-006, PG-023 ✅                   │
    │ Marketing Pages        │ N/A         │ ✅ Complete │ PG-001-014 (static)                 │
    │ Billing                │ ⚠️ Partial  │ ⚠️ Backlog  │ Stripe integration partial          │
    │ Onboarding             │ ⚠️ Backlog  │ ⚠️ Backlog  │ IFC-076, PG-126                     │
    │ Developer Portal       │ ✅ Complete │ ⚠️ Backlog  │ Backend done, pages backlog         │
    │ Support                │ ⚠️ Partial  │ ⚠️ Backlog  │ Need ticket system                  │
    └────────────────────────┴─────────────┴─────────────┴─────────────────────────────────────┘
```

---

## Missing Tasks - Auth Domain

No new tasks required for Auth domain - all chains are tracked:

| Feature    | Backend           | Frontend                        | Status  |
| ---------- | ----------------- | ------------------------------- | ------- |
| MFA        | IFC-098 ✅        | PG-021-022 ✅                   | Tracked |
| Onboarding | IFC-076 (Backlog) | PG-126 (Backlog)                | Tracked |
| Billing    | Partial           | PG-025 ✅, PG-026-031 (Backlog) | Tracked |

**Total New Tasks Required: 0**

- All auth/public page chains are already tracked
- Backlog items have proper dependencies
