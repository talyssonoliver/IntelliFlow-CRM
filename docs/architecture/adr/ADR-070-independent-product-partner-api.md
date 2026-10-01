# ADR-070: IntelliFlow Is an Independent Product; the Leangency Portal Integrates Through a Partner API

**Status:** Accepted (owner decision 2026-09-30)

**Date:** 2026-09-30

**Deciders:** Product Owner (ruling 2026-09-30), Architecture Team

**Technical Story:** Cross-repo audit of `IntelliFlow-CRM@0fe0074` and
`leangency-portal@9fe6216` (2026-09-30). Portal-side record:
`leangency-portal/docs/architecture-ledger/adr-032-crm-partner-integration.md`.

## Context and Problem Statement

Two products exist: IntelliFlow (this repo, a CRM with its own sign-ups, auth,
tenants, plans and billing) and the Leangency Portal (the agency's client hub:
CMS, public sites, marketing insights, delivery/PM). A proposal circulated to
merge them into one platform with IntelliFlow as the core and the Portal as an
experience layer on top, sharing identity, tenancy and a monorepo.

The audit found that the two repos share **nothing** for identity or tenancy
today, and that the existing integration is fragile:

| Link (direction)                                    | Mechanism                                                                    | Finding                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Portal → CRM lead hand-off                          | tRPC `inbound.createLead` (`apps/api/src/modules/inbound/inbound.router.ts`) | `publicProcedure` + one shared bearer (`PORTAL_INTERNAL_SECRET`, compared with `!==`); tenant and acting user fixed by `LEANGENCY_TENANT_ID` / `LEANGENCY_SYSTEM_USER_ID` (`:155-165`), so every Portal lead lands in one tenant; `submissionPayload` accepted (`:63`) and dropped; a repeat submission from a known email returns the old lead. |
| Portal → CRM support ticket                         | tRPC `inbound.logSupportTicket`                                              | **Procedure does not exist.** Production returns 404; every forward fails silently. The Portal test passes because it mocks `fetch`.                                                                                                                                                                                                             |
| Portal → CRM PM events                              | `POST /api/internal/pm/events` (`apps/api/src/modules/pm-events/`)           | Stores envelope + payload hash only (`process-pm-event.ts:77-86`), no tenant column, nothing reads it. Zero events received since 2026-08-07.                                                                                                                                                                                                    |
| CRM → Portal tenant provisioning + delivery/billing | `HttpPortalDeliverySyncAdapter.ts`, `events-worker/main.ts:727-844`          | Routed by free-text `Opportunity.tenantSlug` (`schema.prisma:894`, no FK); `409 slug_conflict` treated as success (`:63-64`); Stripe-subscription push is fire-and-forget (`billing.router.ts:1557-1595`). ADR-065 is still "Proposed" while the code is shipped.                                                                                |
| Shared contracts                                    | none                                                                         | Every payload is hand-written twice; no contract tests on either side.                                                                                                                                                                                                                                                                           |

Two internal findings are prerequisites for any external product model:

- **Two tenancy roots.** `Tenant` (isolation, 164/180 models carry `tenantId`)
  and `Workspace` (`schema.prisma:3366`, holds `PlanTier`). Nothing outside
  `seed.ts` writes `Workspace`, so `PrismaTenantModuleRepository.ts:73-80`
  resolves every real tenant to `STARTER`. No ADR explains the split.
- **Entitlements are bypassable.** `subscription.toggleModule` is an
  `adminProcedure` writing the caller's own `TenantModule` override
  (`subscription.router.ts:81-109`); every sign-up becomes ADMIN of a new tenant
  (`context.ts:437-468`); only the four LEGAL routers use
  `moduleTenantProcedure` (`trpc.ts:355-391`); the rest is `<ModuleGate>` in the
  UI. `APIKey` (`schema.prisma:4561`) has no reader.

The question: is IntelliFlow the core of a merged platform, a module beneath the
Portal, or an independent product the Portal integrates with?

## Decision Drivers

- The owner's ruling (2026-09-30): IntelliFlow was built to acquire **its own
  customers**; the Portal serves **agency clients**, who get access to the
  agency's product stack (IntelliFlow first). Portal customers get IntelliFlow;
  IntelliFlow customers do not get the Portal.
- Agency clients receive a **free tier** of IntelliFlow with the goal of
  converting them to paid; the agency's own costs (AI tokens, outbound email,
  workers) must stay observable and capped per tenant.
- No second login for a Portal user opening their CRM, without sharing a session
  store between the products.
- Neither side may know the other's implementation details (Portal PRs #211 and
  #277 document production breakage from exactly that).
- Both repos are small enough to fix the seam now; a monorepo merge would freeze
  two independently evolving products together.

## Considered Options

- **Option A — One platform, IntelliFlow as the core.** Shared Supabase Auth,
  shared tenant model, `leangency-portal` moves into this monorepo as
  `apps/portal`.
- **Option B — Portal above, IntelliFlow as a module of the Portal.** Portal
  owns identity, tenants and plans; the CRM only enforces what the Portal
  pushes.
- **Option C — Two independent products, one partner integration.** IntelliFlow
  keeps its own identity, tenants, plans, billing and metering. It exposes a
  **partner API** through which the Portal provisions tenants for agency
  clients, grants plans, issues one-click login links and reads usage.

## Decision Outcome

Chosen option: **C**, because it is the only one consistent with IntelliFlow
having direct customers of its own, and because it removes the three largest
items from the other plans (shared identity, shared tenant key, repo merge)
without giving up single-click access or cost control.

### What IntelliFlow owns (unchanged, plus provenance)

- Identity: Supabase Auth, `User`, `protectedProcedure` / `tenantProcedure`.
- Tenancy: `Tenant` (cuid). **New provenance columns:**
  `Tenant.source ∈ {DIRECT, PARTNER}`, `Tenant.partnerId`, `Tenant.externalRef`
  (the Portal's `tenants.id` UUID for partner-sourced tenants). `Workspace` /
  `WorkspaceMember` are retired; `plan` moves onto `Tenant`.
- Plans, entitlements and metering: `PlanTier` + `MODULE_PLAN_MAP` +
  `TenantModule`, enforced server-side and fail-closed for **every** gated
  module (not only LEGAL). `toggleModule` becomes platform-admin only. A partner
  may **assign** a plan to tenants it sourced, including a comped "Partner Free"
  tier. Per-tenant quotas: contacts, seats, outbound emails per month (counter
  on `EmailRecord`), AI spend (per-tenant LiteLLM virtual key with a hard
  budget, `ai.config.ts` default provider is already LiteLLM).
- Leads: system of record for every tenant; `Lead` gains
  `utmSource/utmMedium/utmCampaign/utmContent`, `clickId`, `referrer` so that
  partner-forwarded leads keep their attribution instead of arriving as
  `source: 'WEBSITE'`.

### The partner API (new, `apps/api/src/modules/partner/`)

Authenticated by a **per-partner API key with scopes** (`APIKey` gets its
reader; the symmetric `PORTAL_INTERNAL_SECRET` is retired once the Portal has
migrated):

| Procedure                                                    | Purpose                                                                                                                          |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `partner.provisionTenant({ externalRef, name, plan })`       | creates a `Tenant` with `source: PARTNER`; idempotent on `(partnerId, externalRef)`                                              |
| `partner.setPlan({ tenantId, plan })`                        | partner-granted tier; only for tenants the partner sourced                                                                       |
| `partner.inviteMember({ tenantId, email, role })`            | creates/attaches the `User` membership                                                                                           |
| `partner.issueLoginLink({ tenantId, email })`                | Supabase admin `generateLink` (magic link) → the Portal redirects; the CRM never trusts a Portal session                         |
| `partner.getUsage({ tenantId })`                             | contacts, seats, emails, AI spend vs. quota, for the Portal's upsell widget                                                      |
| `inbound.createLead` / `logCallBooking` / `logSupportTicket` | become tenant-aware via `externalRef`; `logSupportTicket` is implemented; `submissionPayload` is persisted as lead metadata      |
| webhooks → partner                                           | `tenant.plan_changed`, `usage.threshold_reached`, plus the existing delivery/billing push (ADR-065), signed with the partner key |

Contracts are published as a versioned `@intelliflow/partner-sdk` (built from
`packages/sdk` / `packages/api-client`) with zod schemas and **contract tests on
both sides**. The missing `logSupportTicket` is exactly the class of defect a
contract test catches.

### What IntelliFlow does not do

- It does not import Portal identity, sessions or tenant keys.
- It does not host CMS, public sites, marketing insights or delivery/PM.
- It does not join the Portal's repository.

### Relationship to Leangency's own CRM usage

Leangency remains an ordinary **direct** tenant (tenant #1) in which its clients
are `Account`s and deal-won still triggers Portal-tenant creation (ADR-065). The
Portal then provisions the client's **own** IntelliFlow tenant via
`partner.provisionTenant`. Both are true and neither conflicts.

### Positive Consequences

- IntelliFlow's product surface (auth, plans, metering) serves direct and agency
  customers with one implementation; no second entitlement system.
- Cost control is a per-tenant quota inside the product, observable per tenant,
  independent of who sourced the tenant.
- The seam is a versioned contract with tests instead of two hand-written
  payloads and a shared secret.
- A second agency product can reuse the same partner pattern.

### Negative Consequences

- Users of both products exist twice (by email), linked only through the partner
  membership; profile changes do not propagate automatically.
- `issueLoginLink` relies on Supabase magic links, so link lifetime and
  single-use semantics are Supabase's, not ours.
- Supersedes the direction implied by ADR-065's "Leangency 14-day flow" naming:
  the Portal is a partner, not a privileged sibling. ADR-065's field-ownership
  matrix stays valid.

## Implementation Order

0. **Stop the bleeding** (independent small PRs): implement
   `inbound.logSupportTicket`; treat `409 slug_conflict` as a failure; route the
   Stripe-subscription push through `domain_events`; persist
   `submissionPayload`; timing-safe secret comparison. (Portal side: retry
   starvation in `handoff-retry`, phase-regression guard in
   `delivery-sync.ts:93`.)
1. Tenant provenance columns; retire `Workspace`; plan on `Tenant`; fail-closed
   `moduleTenantProcedure` on every gated module; `toggleModule` platform-admin
   only; `APIKey` reader with scopes.
2. Metering: contacts/seats guards, email counter, per-tenant LiteLLM budget;
   "Partner Free" tier.
3. `partner` router + `@intelliflow/partner-sdk` + contract tests; `inbound`
   made tenant-aware; `Lead` attribution fields.
4. Portal migrates to the SDK (Portal ADR-032); retire `PORTAL_INTERNAL_SECRET`,
   `LEANGENCY_TENANT_ID`, `LEANGENCY_SYSTEM_USER_ID`, `Opportunity.tenantSlug`.
5. Consume `PortalPmDelivery` into Account timeline/billing projections
   (currently write-only), through the partner channel.

## Quality Gates for the Seam

| Gate                                                      | Target |
| --------------------------------------------------------- | ------ |
| Env-bound tenant routing (`LEANGENCY_TENANT_ID`)          | 0      |
| Cross-product calls outside the partner SDK               | 0      |
| Cross-product writes without an idempotency key           | 0      |
| Gated modules enforced server-side                        | 100%   |
| Partner-sourced tenants with a quota record               | 100%   |
| Contract-test coverage of partner procedures and webhooks | 100%   |

## Links

- ADR-004 (multi-tenancy), ADR-025 (tenantId normalisation, still Proposed),
  ADR-029 (billing), ADR-039 (SAML SSO; not used for the partner link), ADR-041
  (email provider), ADR-065 (CRM → Portal delivery & billing sync).
- Portal: `docs/architecture-ledger/adr-032-crm-partner-integration.md`,
  `docs/pm/crm-pm-event-receiver-contract.md` (line 130 contradicts the code:
  the receiver stores no tenant).
