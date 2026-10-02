# Inherited Membership Contract v1 (ADR-071)

Version 1.0 (SDK `CONTRACT_VERSION` 1.1.0). Every lane codes against this file
and against `@intelliflow/partner-sdk` (`packages/partner-sdk/src/schemas.ts`,
`client.ts`), which is the machine-checked form of sections c, e and f. If the
two disagree, the SDK wins and this file is fixed.

Owner decisions (final, 2026-10-01): staff sessions in a client tenant are
PINNED; every portal user of a client gets in (portal owner -> ADMIN, every
other portal role -> MEMBER); Phase 1 and Phase 2 (tenant switcher) are built
together.

Vocabulary: **home tenant** = `users.tenantId`. **Active tenant** = the tenant a
request acts in (`ctx.user.tenantId` after this change). **Partner footprint**
of partner P = identities whose home tenant has `tenants.partnerId = P`, or that
hold a live membership with `grantedByPartnerId = P`.

---

## a. Database (Class A, additive)

Migration directory:
`packages/db/prisma/migrations/20261001120000_tenant_memberships/` (name
`tenant_memberships`). Class A: only new tables, new nullable columns, new
enums; no rewrite, no drop. No backfill: the home tenant is an implicit
membership (a row is written lazily the first time a user is attached elsewhere,
with `source=HOME`).

```prisma
enum MembershipSource {
  HOME            // lazily written row mirroring users.tenantId
  PORTAL_MEMBER   // kind=member assertion
  PORTAL_STAFF    // kind=staff assertion (pinned = true, expiring)
  OWNER_INVITE    // tenant admin invited an existing identity
  PARTNER_CREATED // identity created by partner.provisionTenant / inviteMember
}

enum MembershipAuditAction {
  LINK_ISSUED
  GRANT_CLAIMED
  MEMBER_ATTACHED
  MEMBER_REMOVED
  ROLE_CHANGED
  DENIED
}

model TenantMembership {
  id                 String           @id @default(cuid())
  userId             String
  user               User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  tenantId           String
  tenant             Tenant           @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  role               UserRole         @default(USER) // only ADMIN | USER are ever written
  source             MembershipSource
  grantedByPartnerId String?
  grantedByPartner   Partner?         @relation("MembershipGrantedBy", fields: [grantedByPartnerId], references: [id], onDelete: SetNull)
  pinned             Boolean          @default(false)
  expiresAt          DateTime?        // staff: now + 24h, refreshed on every link
  revokedAt          DateTime?
  createdAt          DateTime         @default(now())
  updatedAt          DateTime         @updatedAt

  @@unique([userId, tenantId])
  @@index([tenantId, revokedAt])
  @@index([userId])
  @@map("tenant_memberships")
}

// One row per issued login link. Doubles as the assertion replay store (unique jti) and as the
// pinned-session registry (claimedSessionId).
model PartnerLoginGrant {
  id               String    @id @default(cuid()) // the `grant` URL parameter
  partnerId        String
  partner          Partner   @relation(fields: [partnerId], references: [id], onDelete: Cascade)
  userId           String
  user             User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  tenantId         String
  tenant           Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  kind             String    // 'member' | 'staff' | 'legacy' (key-only path, flag off)
  role             UserRole
  pinned           Boolean   @default(false)
  jti              String?   // null for kind=legacy
  issuedAt         DateTime  @default(now())
  expiresAt        DateTime  // issuedAt + the OTP lifetime (60 min): the claim window
  claimedAt        DateTime?
  claimedSessionId String?   // Supabase JWT `session_id`
  sessionExpiresAt DateTime? // claimedAt + 12h for pinned grants

  @@unique([partnerId, jti])
  @@index([userId, claimedSessionId])
  @@index([expiresAt])
  @@map("partner_login_grants")
}

model TenantMembershipAudit {
  id        String                @id @default(cuid())
  tenantId  String
  userId    String?
  partnerId String?
  action    MembershipAuditAction
  actor     String                // 'partner:<slug>' | 'user:<id>' | 'system'
  detail    Json?                 // { reason?, role?, kind?, jti?, grantId? } - never an assertion or token
  createdAt DateTime              @default(now())

  @@index([tenantId, createdAt])
  @@index([userId, createdAt])
  @@map("tenant_membership_audits")
}

// Partner additions (nullable, trust anchors set ONLY by operator scripts, see d)
//   assertionPublicKey String?  // Ed25519 SPKI PEM
//   ownerTenantId      String?  // the agency's own CRM tenant (home of its staff)
//   ownerTenant        Tenant?  @relation("PartnerOwnerTenant", fields: [ownerTenantId], references: [id], onDelete: SetNull)
//   memberships        TenantMembership[] @relation("MembershipGrantedBy")
//   loginGrants        PartnerLoginGrant[]
// Back-relations on User (memberships, loginGrants) and Tenant (memberships, loginGrants,
// ownerOfPartners) are added accordingly.
```

Migration SQL requirements:

- `CHECK ("role" IN ('ADMIN','USER'))` and
  `CHECK (("pinned" = false) OR ("source" = 'PORTAL_STAFF'))` on
  `tenant_memberships`; `CHECK ("kind" IN ('member','staff','legacy'))` on
  grants.
- RLS: enable on all three new tables with NO policy and
  `REVOKE ALL ... FROM anon, authenticated` (same as `partners`,
  `partner_api_keys` in `20260930120000_tenant_provenance_partner`). These
  tables are read before a tenant context exists; the API connects as owner.
  Also `REVOKE` on the two new `partners` columns is not needed (the table is
  already fully revoked).
- Raw SQL: take `pg_advisory_xact_lock` through `$executeRaw`; digit-stripping
  uses `'[^0-9]'`. Seat counting happens inside the same transaction as the
  membership insert, under
  `pg_advisory_xact_lock(hashtext('seats:' || tenantId))`.

Live membership predicate (single definition, one helper `isLiveMembership`):
`revokedAt IS NULL AND (expiresAt IS NULL OR expiresAt > now())`.

Seat counting: `seats.used` = users whose home is the tenant, plus live
memberships with `pinned = false AND source <> 'HOME'`, each user counted once.
Pinned staff memberships never count. `QUOTA_EXCEEDED` is raised when a new
member would exceed `seats.limit`.

---

## b. Assertion JWT

Compact JWS (`header.payload.signature`, base64url, no padding), signed by the
Portal.

Header (exact, strict):
`{ "alg": "EdDSA", "typ": "intelliflow-assertion+jwt" }`. No `kid`, no `jwk`, no
`x5c`. A key rotation is: operator script overwrites `assertionPublicKey`,
Portal env is swapped in the same minute; in-flight assertions (<= 60 s) may
fail once and are re-issued.

Claims (strict, no extras; zod: `assertionClaimsSchema`):

| claim    | rule                                                                                                  |
| -------- | ----------------------------------------------------------------------------------------------------- |
| `iss`    | the partner slug (`partners.slug`), e.g. `leangency`                                                  |
| `aud`    | literal `intelliflow-crm`                                                                             |
| `sub`    | the person's email, lower-cased, trimmed                                                              |
| `tenant` | exactly one of `{ externalRef: <Portal tenants.id uuid> }` or `{ tenantId: <IntelliFlow tenant id> }` |
| `kind`   | `member` or `staff`                                                                                   |
| `role`   | `ADMIN` or `MEMBER`                                                                                   |
| `iat`    | seconds since epoch                                                                                   |
| `exp`    | seconds since epoch; `0 < exp - iat <= 60`                                                            |
| `jti`    | `[A-Za-z0-9_-]{16,64}`, random (>= 128 bits), never reused                                            |

Verification, in this order; the first failure throws `FORBIDDEN` with reason
`ASSERTION_INVALID` (detail goes to the audit row, never to the response). All
checks run before any user lookup (no oracle).

1. `assertion` present, <= 4096 bytes, exactly three segments. If absent:
   allowed only when the partner is not enforced (flag, section d) AND the path
   is key-only member/legacy; otherwise `ASSERTION_REQUIRED`.
2. Header decodes and equals the strict header above (`alg` must be `EdDSA`;
   `none`, `HS*`, `RS*`, `ES*` rejected).
3. `partners.assertionPublicKey` is set for the calling partner (the one the API
   key belongs to); else `ASSERTION_INVALID`.
4. Ed25519 signature verifies over
   `base64url(header) + '.' + base64url(payload)`.
5. Payload parses with `assertionClaimsSchema`.
6. `iss === callingPartner.slug` (a key for partner A can never carry an
   assertion for B).
7. Time: `iat <= now + 5s`, `exp >= now - 5s`, and `exp - now <= 60 + 5s`.
8. `sub === input.email.trim().toLowerCase()`.
9. `tenant` resolves (via `tenants.externalRef` with `partnerId = caller`, or
   `tenants.id` with `partnerId = caller`) to exactly `input.tenantId`. A tenant
   not sourced by the partner: `ASSERTION_INVALID`.
10. Replay: insert a `partner_login_grants` row with `(partnerId, jti)`. A
    unique violation is `ASSERTION_INVALID` (replayed). The insert happens only
    after steps 1-9 pass, and in the same transaction as the membership write
    and link mint decision (rolled back on failure so a legitimate retry with a
    NEW assertion works; the same assertion is never retried).

Signing (Portal): `jose` `SignJWT` or Node `crypto.sign(null, data, privateKey)`
with the Ed25519 PKCS8 key; `jti = base64url(randomBytes(18))`; `exp = iat + 30`
by default (<= 60).

---

## c. tRPC procedures

Wire format is unchanged from ADR-070 (no transformer; `POST /api/trpc/<proc>`
body = raw input; queries `GET ...?input=<json>`). Partner procedures
authenticate with the partner API key (`Authorization: Bearer pk_...`); `user.*`
procedures with the user session.

Errors: tRPC code in `error.data.code`; the machine reason is BOTH the message
prefix `<REASON>: <human text>` AND `error.data.reason` (the shared
`errorFormatter` in `apps/api/src/trpc.ts` copies `error.cause.reason` to
`data.reason`). The SDK exposes `PartnerApiError.reason`. The legacy
`EMAIL_IN_USE` stays only on the flag-off key-only path.

| reason                    | tRPC code   | meaning / where                                                                                                                                    |
| ------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ACCOUNT_IN_OTHER_TENANT` | `CONFLICT`  | kind=member: the identity exists and is not in the partner footprint. Never adopted. (An operator email is `RESERVED_EMAIL`.)                      |
| `STAFF_NOT_PROVISIONED`   | `FORBIDDEN` | kind=staff: no identity, or its home tenant is not `partners.ownerTenantId` (or `ownerTenantId` unset), or flag `INHERITED_MEMBERSHIP_ENABLED` off |
| `NOT_A_MEMBER`            | `FORBIDDEN` | legacy key-only path: email has no live membership/home in the tenant; `x-active-tenant` names a tenant with no live non-pinned membership         |
| `QUOTA_EXCEEDED`          | `FORBIDDEN` | seats limit reached (staff exempt). `data.quota` is also populated by the existing formatter                                                       |
| `ASSERTION_INVALID`       | `FORBIDDEN` | any verification failure in section b (including replay)                                                                                           |
| `ASSERTION_REQUIRED`      | `FORBIDDEN` | assertion missing while enforced, or for kind=staff                                                                                                |
| `LAST_ADMIN`              | `CONFLICT`  | removeMember / setMemberRole would leave the tenant with no live ADMIN                                                                             |
| `RESERVED_EMAIL`          | `CONFLICT`  | operator email (`PLATFORM_ADMIN_EMAILS`) on any path except kind=staff                                                                             |
| `HOME_ONLY`               | `FORBIDDEN` | a pinned session called a procedure on the home-only list                                                                                          |
| `PIN_PENDING`             | `FORBIDDEN` | an unclaimed OTP session inside a pinned grant window called anything but `user.claimLoginGrant`                                                   |
| `GRANT_INVALID`           | `FORBIDDEN` | grant unknown, expired, already claimed, or belongs to another user                                                                                |

### partner.issueLoginLink (mutation, scope `auth:login-link`)

Input (SDK `issueLoginLinkInputSchema`):

```ts
{ tenantId: string; email: string; redirectTo?: string /*url*/; assertion?: string /*<=4096*/ }
```

Output (`issueLoginLinkOutputSchema`):
`{ url: string; expiresAt: string; pinned?: boolean; role?: 'ADMIN'|'MEMBER' }`.

Behaviour:

- Legacy path (no assertion, partner not enforced, flag may be off): exactly the
  pre-ADR-071 behaviour (`users.tenantId === input.tenantId` or a live
  membership for the tenant, else `NOT_A_MEMBER`); writes a `kind='legacy'`
  grant row (no jti, `pinned=false`) for audit only. Operator emails:
  `RESERVED_EMAIL`.
- With assertion: verify (section b), then by `claims.kind`:
  - `member`: if the identity does not exist -> create it JIT (Supabase
    `createUser`, `email_confirm: true`, `User` row with home =
    `input.tenantId`, role mapped) after the seat check. If it exists and is in
    the partner footprint -> upsert a non-pinned membership
    (`source=PORTAL_MEMBER`, role mapped, clear `revokedAt`,
    `grantedByPartnerId`). Otherwise `ACCOUNT_IN_OTHER_TENANT`. Operator email
    -> `RESERVED_EMAIL`.
  - `staff`: requires `INHERITED_MEMBERSHIP_ENABLED`. Identity must exist AND
    `users.tenantId = partners.ownerTenantId`, else `STAFF_NOT_PROVISIONED`.
    Upsert a membership (`source=PORTAL_STAFF`, `pinned=true`, `role` mapped,
    `expiresAt = now + 24h`). Operator emails allowed here only. No seat
    counted.
  - Then write the grant (`kind`, `pinned = (kind==='staff')`, `jti`,
    `expiresAt = now + the OTP lifetime, 60 min`), mint the link via Supabase
    `generateLink` (magic link, `hashed_token`), audit `LINK_ISSUED`.
- `tenantId` must belong to the partner (`tenants.partnerId`), as today.
- Link URL:
  `${APP_URL}/auth/callback?token_hash=<hash>&type=magiclink&tenant=<tenantId>&grant=<grantId>`
  plus `&next=<redirectTo path>` when given. `tenant` and `grant` are hints
  only; the server validates both on use. `pinned` in the output is
  informational (the web asks `listTenants`).
- `expiresAt` = min(Supabase OTP expiry, grant `expiresAt`).

### partner.removeMember (mutation, scope `members:write`)

Input `{ tenantId: string; email: string }` -> output `{ removed: boolean }`.
Tenant must be partner-sourced. Idempotent: no live membership ->
`{ removed: false }`. Home-tenant users (`users.tenantId = tenantId`) are not
deleted: the membership row is revoked (`revokedAt = now`, written first if
absent) and the user can no longer act in the tenant (active-tenant resolution
treats a revoked home membership as no access; the identity is moved to no
tenant only by an operator). `LAST_ADMIN` if the target is the only live ADMIN.
Pinned staff memberships: removable. Revoking also closes grants:
`sessionExpiresAt = now` for that (user, tenant). Audit `MEMBER_REMOVED`.
Session cache for the user is invalidated.

### partner.setMemberRole (mutation, scope `members:write`)

Input `{ tenantId: string; email: string; role: 'ADMIN'|'MEMBER' }` -> output
`{ userId: string; role: 'ADMIN'|'MEMBER'; changed: boolean }`. Idempotent
(`changed:false` if same). No live membership -> `NOT_A_MEMBER`. Pinned
memberships: `FORBIDDEN` with reason `HOME_ONLY` (message
`HOME_ONLY: pinned memberships are managed by assertion`). Demoting the last
ADMIN -> `LAST_ADMIN`. Updates `users.role` too when the tenant is the user's
home. Audit `ROLE_CHANGED`.

### partner.listMembers (query, scope `tenants:read`)

Input `{ tenantId: string }` -> output
`{ tenantId, members: [{ userId, email, name|null, role, source, pinned, expiresAt|null, createdAt }] }`
(ISO strings). Includes home users (as `source='HOME'` or their existing partner
source), live memberships and pinned staff (staff are visible to the client, per
default). Revoked and expired rows excluded.

### user.listTenants (query, session auth; SDK `SESSION_PROCEDURES`)

Input none. Output
`{ activeTenantId, homeTenantId, pinned, tenants: [{ tenantId, name, slug, role, source, pinned, isHome, isActive }] }`.
Non-pinned session: home tenant plus live **non-pinned** memberships (pinned
staff memberships are NOT listed: staff reach client tenants only through the
Portal). Pinned session: exactly one entry (the active tenant). Available only
when `INHERITED_MEMBERSHIP_ENABLED` (else returns the home tenant alone).

### user.claimLoginGrant (mutation, session auth)

Input `{ grant: string }` -> output
`{ tenantId, pinned, sessionExpiresAt|null }`. Must be the first call the web
makes after `verifyOtp`. Rules: grant exists, `userId = ctx user`,
`expiresAt > now`, `claimedAt IS NULL` (atomic
`UPDATE ... WHERE claimedAt IS NULL`), the membership is still live. Sets
`claimedAt`, `claimedSessionId = JWT session_id`, and for pinned grants
`sessionExpiresAt = now + 12h`. Member grants (`pinned=false`) may be claimed
too (it returns the tenant for the initial `x-active-tenant`) but nothing is
enforced if they are not. Audit `GRANT_CLAIMED`. Errors `GRANT_INVALID`. Allowed
during `PIN_PENDING`.

### Active-tenant resolution (`apps/api/src/context.ts`) and `x-active-tenant`

Per request, after authentication, in this order:

1. Read JWT claims `sub`, `session_id`, `amr` (Supabase).
2. **Pinned session**: a grant exists with `userId = sub`,
   `claimedSessionId = session_id`, `pinned = true`, `sessionExpiresAt > now`,
   and the membership is live -> active tenant = `grant.tenantId`, role =
   membership role, `isPlatformAdmin = false`, `pinned = true`. The
   `x-active-tenant` header is ignored. If `sessionExpiresAt <= now` or the
   membership is no longer live -> `UNAUTHORIZED`.
3. **PIN_PENDING**: otherwise, if `amr` contains a `method: 'otp'` entry whose
   timestamp falls in `[grant.issuedAt - 5s, grant.expiresAt]` of a
   `pinned = true` grant of this user whose `claimedSessionId` is not this
   `session_id` (unclaimed, or claimed by another session) -> only
   `user.claimLoginGrant` is allowed; everything else fails `PIN_PENDING`. This
   is evaluated by data (so it stays blocked after the grant expires), and is
   what stops a leaked staff link from landing in the staff member's home
   tenant.
4. **Header**: `x-active-tenant` absent or equal to `users.tenantId` -> home.
   Otherwise it must match a live, non-pinned membership of this user, else
   `FORBIDDEN NOT_A_MEMBER`. Requires `INHERITED_MEMBERSHIP_ENABLED`; with the
   flag off a non-home header is `NOT_A_MEMBER`. The result: active tenant =
   header tenant, role = membership role, `isPlatformAdmin = false` while acting
   outside home.
5. The session cache key is `(userId, activeTenantId, sessionId)` (TTL 60 s).
   Revocation and claim delete the user's cache keys (best effort); the TTL
   bounds staleness to 60 s.
6. Tenant-scoped Prisma (`createTenantScopedPrisma`) binds
   `app.current_tenant_id` to the ACTIVE tenant. Readers use `ctx.user.tenantId`
   (active) and, where the real home is needed, the new `ctx.user.homeTenantId`.
   Context additions: `activeTenantId`, `homeTenantId`, `pinned: boolean`,
   `membershipRole`.

### Pinned-session rules (the home-only path registry)

The path registry `security/home-only.ts`, applied in `isAuthed` to every
authenticated procedure, rejects with `FORBIDDEN HOME_ONLY`: always when
`ctx.pinned` is true; and, for a non-pinned member acting in a non-home tenant,
only for the entries marked (P) (profile and billing, which belong to the home
account). Applied to these routers/procedures (the census is verified by a test
with one case per entry; new procedures in these areas default to homeOnly):

- `billing.*` (P), `subscription.*` (P) including `toggleModule`, plan or Stripe
  mutations;
- every platform-admin or operator procedure (`isPlatformAdmin` is false anyway,
  belt and braces);
- `user.update*` / `user.delete*` / email, password, MFA, preferences, API-key
  and session management for the signed-in user (profile) (P);
- `tenant.update` / `tenant.delete` / tenant settings and plan, ownership
  transfer;
- `apiKey.*` / partner credential management;
- `team` administration is NOT homeOnly (staff may work normally inside the
  client tenant).

Pinned sessions additionally: no `user.listTenants` entries other than the
active tenant, header ignored, seat-exempt, and every mutation they make is
attributed to the staff user (audit as usual). Non-pinned members acting in a
non-home tenant are subject only to the (P) items.

---

## d. Env, flags and operator scripts

| name                               | where   | meaning                                                                                                                                                                                                               |
| ---------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PARTNER_REQUIRE_ASSERTION`        | API     | `0` (default) / `1`, `true`, `yes`, `on`, `enabled`, `all` (all partners) / comma list of partner slugs (a list containing an "all" word enforces for all). Enforced partners: key-only link -> `ASSERTION_REQUIRED`. |
| `INHERITED_MEMBERSHIP_ENABLED`     | API+web | `0` (default) / `1`. Gates `x-active-tenant`, `user.listTenants`, `kind=staff`, pinned sessions, JIT attach of existing identities.                                                                                   |
| `PORTAL_CRM_ASSERTION_PRIVATE_KEY` | Portal  | Ed25519 PKCS8 PEM (literal `\n` allowed). Never in the CRM. Public half stored on the Partner row.                                                                                                                    |
| `partners.assertionPublicKey`      | DB      | Ed25519 SPKI PEM, nullable. Set only by `tools/scripts/set-partner-assertion-key.ts`.                                                                                                                                 |
| `partners.ownerTenantId`           | DB      | agency's own tenant, nullable. Set only by `tools/scripts/set-partner-owner-tenant.ts`.                                                                                                                               |

Operator scripts (operator-run, never exposed over HTTP; need the owner's yes in
production):

- `tools/scripts/set-partner-assertion-key.ts --partner <slug> --public-key <file|-> [--apply]`:
  validates an Ed25519 public key (PEM SPKI, or PKCS8/raw 32-byte base64url
  which it converts), prints the fingerprint (sha256 of SPKI DER, hex first 16)
  and the current value; dry-run by default; `--apply` writes. Local test DB
  only unless the operator points `DATABASE_URL` elsewhere deliberately.
- `tools/scripts/set-partner-owner-tenant.ts --partner <slug> --tenant <tenantId> [--apply]`:
  checks the tenant exists and is not partner-sourced (`partnerId IS NULL`,
  `source=DIRECT`); prints before/after; dry-run by default.

Rollout order and rollback: see ADR-071. Both flags default off; with both off
every code path is byte-for-byte the current behaviour. Rollback = flags off;
tables stay.

---

## e. Portal side

Which signal makes the kind (decided in the Portal's `open-crm`, never by the
browser):

- `kind = 'staff'`: the caller's session is a **verified agency-admin session**
  (the server proves the email is in `admin_users` through the Portal's own
  admin check, the same check that guards admin routes), acting on a client
  tenant. Role claim: `ADMIN`.
- `kind = 'member'`: the caller is a `portal_users` row of that tenant
  (`tenant_slug`). Role mapping: `owner` -> `ADMIN`; `client`, `member`, and
  every other role -> `MEMBER`.
- A person who is in both (the agency owner is `admin_users` and a
  `portal_users` owner of the client) is `staff` (the stricter, pinned mode).
  Not in either -> the Portal refuses before calling the CRM (`not_a_member`).
- The assertion is signed server-side per click (`exp = iat + 30s`) with
  `PORTAL_CRM_ASSERTION_PRIVATE_KEY`; the tenant claim uses
  `externalRef = tenants.id`.
- `sub` is the lower-cased session email; the Portal never lets a user pick
  another email.

JIT behaviour: no eager invites. A member's CRM identity and membership are
created at their first "Abrir CRM" click (CRM does it inside `issueLoginLink`).
`provision.ts` keeps excluding `admin_users` from owner selection (the tenant
owner identity is a client person), and `provisionTenant` still creates the
`ownerEmail` identity.

Removal and role sync hooks (call after the Portal's own write succeeds;
failures are queued and retried, never fatal to the Portal action):

- portal user removed or deactivated ->
  `partner.removeMember({ tenantId, email })`
- portal role changed (including owner -> member) -> `partner.setMemberRole`
- admin removed from `admin_users` -> nothing to call; staff memberships expire
  in 24 h, and the Portal may call `removeMember` for tenants it knows the
  person opened.
- Only for tenants that have a CRM mapping (`crm_tenant_id`).

Error mapping on the Portal page: `NOT_A_MEMBER` -> `not_a_member`;
`ACCOUNT_IN_OTHER_TENANT`, `RESERVED_EMAIL` -> `identity_conflict`;
`STAFF_NOT_PROVISIONED` -> `staff_not_provisioned`; `QUOTA_EXCEEDED` ->
`seats_full`; `ASSERTION_*`, network, 5xx -> `unavailable`.

---

## f. `@intelliflow/partner-sdk` additions (CONTRACT_VERSION 1.1.0)

All in `packages/partner-sdk/src/schemas.ts` and `client.ts`, re-exported from
`index.ts`. `contract/partner-contract.v1.json` is regenerated
(`pnpm --filter @intelliflow/partner-sdk contract:generate`) and now also
carries `sessionProcedures`, `assertion` and `errorReasons`.

Constants: `MEMBER_ROLES`, `MEMBERSHIP_SOURCES`, `MEMBERSHIP_ERROR_REASONS`,
`ACTIVE_TENANT_HEADER` (`'x-active-tenant'`), `ASSERTION_ALG`, `ASSERTION_TYP`,
`ASSERTION_AUDIENCE`, `ASSERTION_MAX_TTL_SECONDS` (60),
`ASSERTION_CLOCK_LEEWAY_SECONDS` (5).

Schemas: `memberRoleSchema`, `membershipSourceSchema`,
`membershipErrorReasonSchema`, `assertionHeaderSchema`, `assertionTenantSchema`,
`assertionClaimsSchema` (type `AssertionClaims`), `issueLoginLinkInputSchema`
(+`assertion?`), `issueLoginLinkOutputSchema` (+`pinned?`, `role?`),
`removeMemberInput/OutputSchema`, `setMemberRoleInput/OutputSchema`,
`listMembersInput/OutputSchema`, `listTenantsInput/OutputSchema`,
`claimLoginGrantInput/OutputSchema`.

Registry: `PROCEDURES` gains `partner.removeMember` (mutation, `members:write`),
`partner.setMemberRole` (mutation, `members:write`), `partner.listMembers`
(query, `tenants:read`); `SESSION_PROCEDURES` holds `user.listTenants` and
`user.claimLoginGrant` (no scope, no client method: the web calls them through
the app tRPC client).

Client: `createPartnerClient(...)` now also exposes `removeMember`,
`setMemberRole`, `listMembers`. `PartnerApiError` gains
`reason: MembershipErrorReason | null`, derived from `error.data.reason` or the
`<REASON>:` message prefix by exported `toErrorReason`. No new partner scopes
were added (existing keys keep working).
