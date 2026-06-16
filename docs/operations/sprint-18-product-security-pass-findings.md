# Sprint 18 — Product-Code Security Pass (findings)

Date: 2026-06-16 · Branch: `fix/product-security-pass` · Persona:
security-lead + domain-expert (`/stoa-security`)

Scope: fix the legal signature IP-spoof (#445), verify the home-cache
cross-tenant claim (#263), and triage the 21 SonarCloud security **hotspots**
(TO_REVIEW). Out of scope: the 125 reliability "bugs" (quality, not security).

---

## A) #445 — Legal signature IP spoof (CONFIRMED → FIXED)

`apps/api/src/modules/legal/documents.router.ts` `sign` mutation read the audit
IP from the **leftmost** `x-forwarded-for` hop (`.split(',')[0]`), which is
client-spoofable — an attacker could forge the IP recorded against an
e-signature.

Two defects were present at the same site:

1. **Spoofable hop** — leftmost instead of the rightmost (edge-set, trusted)
   hop.
2. **Latent always-`unknown` bug** — `ctx.req` is a Fetch `Request` (its
   `headers` is a `Headers` object and it has no `.socket`), but the code used
   Express-style bracket access `req.headers['x-forwarded-for']` and
   `req.socket.remoteAddress`. Both are always `undefined` on a Fetch Request,
   so the recorded IP was in practice always `'unknown'`.

**Fix:** read via `req.headers.get('x-forwarded-for')` and route through
`pickTrustedForwardedIp()` (the #261/#447 helper), falling back to `x-real-ip`
then `'unknown'` — mirroring `security/middleware.ts:extractIpAddress`. This
both closes the spoof and restores a real trusted client IP in the audit trail.

Tests: `documents.router.caller.test.ts` `sign` — rightmost-hop, x-real-ip
fallback, and no-header `'unknown'` cases.

### Class sweep (grep of all product XFF sites)

| Site                                                | Status                                                                                                                                                                                   |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `security/middleware.ts:extractIpAddress`           | already fixed (#447) — uses `pickTrustedForwardedIp`                                                                                                                                     |
| `modules/auth/auth.router.ts` (4 sites)             | already fixed (#447) — `pickTrustedForwardedIp`                                                                                                                                          |
| `modules/public-feedback/public-feedback.router.ts` | already correct — `extractClientIp` (rightmost)                                                                                                                                          |
| `web/src/app/api/webhooks/rate-limiter.ts`          | already correct — `ips.at(-1)` (rightmost)                                                                                                                                               |
| `middleware/rate-limit.ts:427`                      | **intentional leftmost** — high-volume anonymous limiter; rightmost is the shared edge IP and would collapse all traffic into one bucket (documented in `client-ip.ts`). Left unchanged. |
| `modules/legal/documents.router.ts:480`             | **FIXED here (#445)**                                                                                                                                                                    |
| `modules/agent/conversation.router.ts:144`          | **FIXED here (same class)** — stored the whole raw `x-forwarded-for` string (incl. spoofable leftmost) as the conversation audit IP; now records the trusted rightmost hop. Test added.  |

---

## B) #263 — Home cache cross-tenant leak (VERIFIED → NOT LIVE, recommend close)

`HomeCacheService` (`apps/api/src/modules/home/home.cache.ts`) keys the cache by
`home:summary:<userId>` — tenantId is deliberately omitted.

**Verdict: not exploitable.** The key cannot collide across tenants because:

- `userId` values are globally-unique CUIDs.
- `User.tenantId` is a single scalar FK (`packages/db` schema) — a user belongs
  to exactly **one** tenant. There is no membership join allowing a userId to
  span tenants (`WorkspaceMember`/`TeamMember` are intra-tenant only).
- The session `tenantId` is **derived from the user record**
  (`security/tenant-context.ts:77` — `tenantId: user.tenantId`), not
  independently selectable. A user cannot present a different tenant for the
  same userId.

So `userId` deterministically maps to one tenant; the cached value is that
user's own summary, and event-driven invalidation (also keyed by userId) is
correctly scoped. Adding tenantId to the key would be over-engineering **and
risky** — invalidation events carry only userId, so a tenant-prefixed key could
not be reconstructed for deletion and would leak stale entries (the existing
docstring already warns of this).

**Action:** close #263 as not-live. Regression tests added to
`home.cache.test.ts` lock the invariant (distinct users never read each other's
summary; invalidation is per-user).

---

## C) 21 SonarCloud security hotspots — TRIAGE (all SAFE; owner marks "Safe" in UI)

Assessed each on current `main`. **None are genuine, exploitable issues** — all
are false-positives or safe-by-context. No code changed (L1: don't over-fix /
suppress without evidence). Owner action: mark each "Safe" in the SonarCloud
Security Hotspots UI (needs the token).

### Regex / DoS (7) — all linear, no catastrophic backtracking

| File:line                                                                 | Regex                                    | Why safe                                       |
| ------------------------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------- |
| `apps/project-tracker/lib/task-coverage.ts:104`                           | `/(\d+(?:\.\d+)?)\s*%/`                  | linear; non-overlapping; internal tooling      |
| `apps/web/.../report-settings/components/ScheduledDeliverySection.tsx:37` | `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`           | 3 disjoint negated classes; bounded form field |
| `apps/web/src/components/accounts/ContactAddSheet.tsx:86`                 | same email regex                         | linear; bounded input                          |
| `apps/web/src/components/email/InlineCompose.tsx:10`                      | same email regex                         | linear; bounded input                          |
| `apps/web/src/components/email/InlineCompose.tsx:73`                      | `/<[^>]*>/g`                             | negated class, single-pass linear              |
| `apps/web/src/components/email/InlineCompose.tsx:99`                      | `/<[^>]*>/g`                             | same                                           |
| `apps/web/src/lib/legal/legal-content-parser.ts:27`                       | `/[^a-z0-9]+/g`, `/^-+\|-+$/g` (slugify) | single-pass linear replacements                |

### Weak crypto / Math.random (4) — all non-security

| File:line                                              | Use                                                                | Why safe               |
| ------------------------------------------------------ | ------------------------------------------------------------------ | ---------------------- |
| `apps/ai-worker/src/monitoring/latency-monitor.ts:215` | telemetry sampling probability                                     | not a token/secret     |
| `apps/ai-worker/src/monitoring/latency-monitor.ts:249` | telemetry sampling probability                                     | not a token/secret     |
| `apps/web/src/app/providers.tsx:106`                   | OTel correlation-id **fallback** (primary = `crypto.randomUUID()`) | not an auth credential |
| `apps/web/src/lib/status/incident-creator.ts:29`       | SRE incident-id **fallback** (primary = `crypto.randomUUID()`)     | not a secret           |

### Insecure http:// (2) — dead test-only branches

| File:line                                   | Why safe                                                              |
| ------------------------------------------- | --------------------------------------------------------------------- |
| `apps/ai-worker/src/lib/llm-factory.ts:293` | `'http://mock-litellm'` inside `provider === 'mock'` (test path only) |
| `apps/ai-worker/src/lib/llm-factory.ts:419` | same mock embeddings branch                                           |

### PATH / command (8) — internal dev dashboard, fixed dirs, no user input

All in `apps/project-tracker` (localhost:3002 developer dashboard, never
deployed to customers). All use `execFileSync`/`spawnSync` with **array args**
(no shell expansion) and a fixed `PROJECT_ROOT`/`cwd` derived from
`process.cwd()`. Spot-verified `artifacts/history/route.ts` (`git ls-files`,
hardcoded args) and `claude-session-spawner.ts:154` (taskId validated against
the CSV allowlist before spawn; existing NOSONAR rationale).

| File:line                                                                        |
| -------------------------------------------------------------------------------- |
| `apps/project-tracker/app/api/artifacts/history/route.ts:210`                    |
| `apps/project-tracker/app/api/artifacts/history/route.ts:232`                    |
| `apps/project-tracker/app/api/code-analysis/route.ts:166`                        |
| `apps/project-tracker/app/api/governance/platform-health/regenerate/route.ts:36` |
| `apps/project-tracker/app/api/sprint/completion/route.ts:61`                     |
| `apps/project-tracker/app/api/sprint/completion/route.ts:72`                     |
| `apps/project-tracker/app/api/sprint/completion/route.ts:84`                     |
| `apps/project-tracker/lib/claude-session-spawner.ts:154`                         |
