# ADR-071: Inherited Tenant Membership: Portal Users of a Client Tenant Can Open and Work in That Client's CRM

**Status:** Accepted (owner ruling 2026-10-01)

**Date:** 2026-10-01

**Deciders:** Product Owner (ruling 2026-10-01), Architecture Team

**Technical Story:** nutri-gyn "not a member" incident (2026-10-01). Contract:
`docs/architecture/contracts/inherited-membership.v1.md`. Extends ADR-070
(partner API). Portal-side record: `leangency-portal` (open-crm, provision,
partner assertion signer).

## Context and Problem Statement

ADR-070 made IntelliFlow an independent product with its own identity and
tenants; the Portal provisions one CRM tenant per agency client and issues
one-click login links (`partner.issueLoginLink`). The owner ruled on 2026-10-01:
**"The CRM must inherit the customer tenants as well."** Every Portal user of a
client tenant must be able to open that client's CRM from "Abrir CRM" and work
inside it, including agency staff who are Portal owners of that client (the
agency owner already has his own DIRECT CRM account and tenant).

What breaks today (verified in code at `48d30a982`):

- **One user, one tenant.** The active tenant is the single column
  `users.tenantId` (`apps/api/src/context.ts` `resolveDbUserWith`, 60 s
  `USER_SESSION_CACHE`); `User.email` is globally unique; there is no membership
  table (`Team`/`TeamMember` are intra-tenant).
- **The nutri-gyn incident.** A Portal user of nutri-gyn who already had an
  IntelliFlow identity (a direct account, or a member of another tenant) clicked
  "Abrir CRM". `issueLoginLink` requires `users.tenantId === input.tenantId`, so
  it answered "not a member". `ensureAuthUser` never adopts an existing Auth
  identity (`CONFLICT EMAIL_IN_USE`), `inviteMember` rejects users of other
  tenants, and `assertNotOperatorEmail` bans `PLATFORM_ADMIN_EMAILS`. The agency
  owner can never be let into a client tenant at all.
- **The login link is a bearer of identity.** The partner API key alone decides
  who is signed in as whom. That was acceptable while links only reached the
  user's single home tenant; it is not acceptable once a link can place a person
  in a tenant that is not theirs.

## Decision Drivers

- The owner's ruling above, and "every portal user of a client gets in" (owner
  to ADMIN, every other portal role to MEMBER).
- Agency staff in a client tenant are **pinned** (owner decision): no
  platform-admin, no billing/subscription/profile mutations, no switching
  tenants.
- Build Phase 1 (membership, assertion, pinned staff) and Phase 2 (tenant
  switcher) now.
- Security ranks over fit over cost (design review).
- Additive, backward-compatible, reversible by flag (Class A, ADR-069).

## Considered Options

- **A. Alias identities**: a separate IntelliFlow identity per (person, tenant).
  Cheap and isolating, but the owner would hold N logins and email is globally
  unique. Not used.
- **B. Membership table plus Portal-signed assertion** (chosen, with grafts from
  A: single-use grants, pinned staff, audit).
- **C. Move to Portal-owned identity.** Rejected by ADR-070.

## Decision Outcome

Chosen option: **B**.

1. **Membership table.**
   `tenant_memberships(userId, tenantId, role, source, pinned, grantedByPartnerId, expiresAt, revokedAt)`,
   unique on `(userId, tenantId)`. `users.tenantId` stays the **home tenant**;
   the home tenant is an implicit membership (rows are written lazily; no
   backfill required).
2. **Active-tenant resolution.** `ctx.user.tenantId` becomes the **active**
   tenant: the home tenant by default; another tenant only when (a) the request
   carries `x-active-tenant: <tenantId>` and a live, non-pinned membership
   exists, or (b) the session is a pinned staff session (tenant fixed
   server-side, header ignored). The session cache key becomes
   `(userId, activeTenantId, sessionId)`. All tenant-scoped readers (about 61
   sites in 15 files) read the active tenant from context; none read the header.
3. **Portal-signed assertion.** `partner.issueLoginLink` additionally takes an
   Ed25519 (EdDSA) compact JWT signed by the Portal (`iss` partner slug, `aud`
   `intelliflow-crm`, `sub` email, `tenant`, `kind` member|staff, `role`, `exp`
   at most 60 s, single-use `jti`), verified with `partners.assertionPublicKey`.
   With `PARTNER_REQUIRE_ASSERTION` on, the partner API key alone can no longer
   mint a link.
4. **JIT members.** `kind=member`: the identity is created just in time if
   absent and given a membership. An existing identity is attached only if it is
   already inside the partner's own footprint (home tenant sourced by this
   partner, or a live membership granted by this partner); otherwise
   `ACCOUNT_IN_OTHER_TENANT`. An existing non-partner identity is never adopted.
5. **Pinned staff sessions.** `kind=staff`: the identity must already exist
   **and** have its home in `partners.ownerTenantId` (the agency's own CRM
   tenant, set by an operator script), else `STAFF_NOT_PROVISIONED`. A pinned
   membership (expiring in 24 h, refreshed per link) and a single-use **login
   grant** are written. The session that claims the grant is bound to the client
   tenant for its whole life: platform-admin forced off, the home-only path
   registry applies, no tenant switching, staff exempt from seat counting.
   Operator emails are admitted **only** through this path.
6. **Tenant switcher (Phase 2).** `user.listTenants` returns the caller's
   non-pinned memberships (home included); the web sends `x-active-tenant`.
   There is no `setActiveTenant` mutation: the header is the only selector and
   is validated on every request.
7. **Lifecycle.** `partner.removeMember`, `partner.setMemberRole`,
   `partner.listMembers` (idempotent, never drop the last ADMIN, audited). The
   Portal calls them from its remove/downgrade hooks.

## Security Boundary

| Actor / compromise                              | Can                                                                                                                                                                                                    | Cannot                                                                                                                                                                                                                                                                  |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Stolen partner API key** (flag on)            | provision tenants, set plans, invite new emails, list/remove members and change non-pinned roles in tenants it sourced                                                                                 | mint any login link (needs a Portal signature), create a pinned/staff membership, touch a direct (non-partner) tenant, adopt an existing identity, change a pinned membership's role                                                                                    |
| **Stolen partner key, flag off** (rollout only) | pre-ADR-071 behaviour: links for users whose home tenant is the named tenant                                                                                                                           | anything cross-tenant or staff-related (those paths exist only with an assertion)                                                                                                                                                                                       |
| **Portal compromised** (signing + partner key)  | mint member links into any partner-sourced tenant for new or partner-footprint emails; mint pinned staff sessions for identities homed in the agency's own tenant, into partner-sourced client tenants | enter a direct or non-partner tenant, reach the agency's home-tenant data through a staff link (a claimed session is pinned; an unclaimed link session is blocked), become platform admin, touch billing, adopt a foreign identity, replay a captured assertion or link |
| **Leaked login link** (member)                  | sign in as that member once, inside their memberships                                                                                                                                                  | more than the member could already do                                                                                                                                                                                                                                   |
| **Leaked login link** (staff)                   | claim the pin first (and be pinned to the client tenant), or do nothing: a fresh OTP session that has not claimed its grant is blocked with `PIN_PENDING`                                              | reach the staff member's home tenant                                                                                                                                                                                                                                    |

Mitigations that carry the boundary: 60 s assertion lifetime with 5 s leeway;
`jti` single-use store (unique key on `partner_login_grants`); Ed25519 only
(`alg` pinned; `none` and HS\* are rejected); the trust anchors
(`assertionPublicKey`, `ownerTenantId`) are set only by operator scripts in
production, never through the partner API; every grant, attach, claim, revoke
and denial writes an audit row; staff memberships expire on their own (24 h) so
a missed Portal removal sync is bounded.

## Rollout Flags

- `PARTNER_REQUIRE_ASSERTION` (`0` | `1` | comma list of partner slugs):
  per-partner enforcement. The old key-only link path stays until flipped.
- `INHERITED_MEMBERSHIP_ENABLED` (`0` | `1`): `x-active-tenant`,
  `user.listTenants`, grants. Off: behaviour identical to today.
- Order: ship schema (inert), then API behind flags, then Portal signs
  assertions and ships the pages, then operator sets `assertionPublicKey` and
  `ownerTenantId` (owner's yes), then flip per partner. Rollback is flipping the
  flags off; no schema revert (tables are additive).

## Consequences

**Positive:** the nutri-gyn class of failure goes away; the agency owner works
in client tenants without a second account; the partner key is demoted from "can
sign in as anyone" to "provisions"; revocation and audit exist.

**Negative / costs:** every tenant reader must use the active tenant (census
plus a guard test); a pinned session needs a claim step in the web callback;
staff access depends on a 24 h membership refresh; the session cache key grows;
one operator-script step per partner; the `PIN_PENDING` rule can reject a
legitimate same-minute OTP login of the same staff member (they sign in again).

**Not changed:** `users.tenantId` semantics for home, ADR-070 key scopes,
Supabase as the identity provider.

## Links

ADR-004 (multi-tenancy), ADR-070 (partner API), ADR-069 (migration risk classes;
this change is Class A). Contract:
`docs/architecture/contracts/inherited-membership.v1.md`.
