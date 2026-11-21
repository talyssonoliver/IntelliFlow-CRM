# ADR-089: WAHA tenant isolation: one container, one session and one API key per tenant

- **Status:** Proposed (the technical decision rests on the spike below; the
  hosting spend is the owner's to approve, see "Cost")
- **Date:** 2026-11-21
- **Task:** IFC-322 (feeds IFC-326 the WAHA adapter and IFC-331 the deployment)
- **Relates to:** `docs/architecture/whatsapp-channel-design.md` sections 2, 4
  and 5; IFC-320 (`WhatsAppTransportPort`, PR #1515)
- **Evidence:** `artifacts/misc/waha-isolation-spike.json`, produced by
  `infra/waha/isolation-spike.mjs` against `infra/waha/compose.yaml`

## Context and problem statement

Transport B of the WhatsApp channel is WAHA, a container that speaks WhatsApp
Web for a paired phone number. Aurora is multi-tenant, so one tenant must never
be able to list, read, send from or stop another tenant's WhatsApp session. The
design doc left one question open for this row: **a WAHA container per tenant,
or one container with a session and an API key per tenant?** It also asked for
WAHA's edition, licence and monthly cost per tenant, because an earlier study
suspected the free edition allowed one session only.

## Decision drivers

- Zero cross-tenant calls that succeed (the row target), proved by a test that
  can be run again, not by reading docs.
- WAHA is never on a public address.
- Nothing purchased without the owner (IFC-034 or a named ruling).
- Fits the IFC-320 port: `WhatsAppConnectionRef` carries `accountId` (the WAHA
  session name) and `credential` (the API key of that tenant's session), and
  adapters must not be able to address another tenant.
- Low enough hosting cost per tenant that a small customer is viable.

## Facts about WAHA (retrieved 2026-11-21)

| Fact                                 | Finding                                                                                                                                                                                                                                                                                                                                                                                | Source                                                                                                            |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Edition                              | **Core.** There is no separate paid Plus any more: from version 2026.6.1 the former Plus features, "unlimited sessions" among them, are in the free `devlikeapro/waha` image, and `waha-plus` and its portal key are not needed. The running container confirms it: `GET /api/version` returns `"tier":"CORE","engine":"NOWEB"`.                                                       | waha.devlike.pro/docs/how-to/waha-plus/; GitHub README of `devlikeapro/waha`; the spike's own `/api/version` call |
| Licence                              | **Apache-2.0** (the repository `LICENSE` file and GitHub's licence field both say so; repository last pushed 2026-11-11). Commercial use and hosting for customers are allowed; keep the licence notice and state changes.                                                                                                                                                             | github.com/devlikeapro/waha; raw `LICENSE` on branch `core`                                                       |
| Sessions                             | Several sessions with different `name`s run "inside the single docker container"; no session limit is stated anywhere we read.                                                                                                                                                                                                                                                         | GitHub README of `devlikeapro/waha`; waha-plus page                                                               |
| API keys                             | `WAHA_API_KEY` is an **admin** key (stored as `sha512:<hash>` is the documented recommended form). The Keys API (`POST /api/keys`) mints keys with `isAdmin` and a `session`: "Admin keys can access all sessions", "Session keys are scoped to a single session". A key can also carry `actions` (`read`, `send`, `control`, `setting`, `app`, `delete`; `delete` defaults to false). | waha.devlike.pro/docs/how-to/security/                                                                            |
| Dashboard and Swagger                | Can be switched off (`WAHA_DASHBOARD_ENABLED=false`, `WHATSAPP_SWAGGER_ENABLED=false`); the docs warn "Do not expose WhatsApp API on public networks!".                                                                                                                                                                                                                                | waha.devlike.pro/docs/how-to/security/                                                                            |
| Image                                | `devlikeapro/waha:noweb-2026.10.1`, 757 MB, published 2026-10-28, digest `sha256:0d64cce14a922f61bb9a620474086d1f5695f2522e7e1088704e6eca3a085d0c` (pinned in the compose file by tag and digest).                                                                                                                                                                                     | hub.docker.com/r/devlikeapro/waha (tags API)                                                                      |
| Terms of use of WhatsApp             | Unchanged from the design doc: WAHA is an unofficial client; the customer-facing notice and the ban risk stay as section 2 of the design doc says. This ADR does not change that.                                                                                                                                                                                                      | design doc                                                                                                        |
| Docs read through a summarising tool | The docs were read through a tool that returns summaries, so every behaviour that matters was also **re-tested live** (below); the docs are cited for edition, licence and design intent only.                                                                                                                                                                                         |                                                                                                                   |

## The spike (what was run)

`node infra/waha/isolation-spike.mjs` starts WAHA 2026.10.1 NOWEB from
`infra/waha/compose.yaml`, builds a random admin key at runtime (no key or
number is in any file), creates two tenants' sessions and one session key each,
then attacks with **tenant A's key only**. The sessions are created and started
but **never paired**: they sit at `SCAN_QR_CODE`, because no real WhatsApp
number was used or needed. Authorisation runs before the engine, so the
isolation results do not depend on pairing; what pairing changes is memory (see
Cost).

Result, run 2026-11-21, WAHA 2026.10.1 (full per-call record in the JSON):

| Tenant A's key tries to...                                                                                                               | HTTP result                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **list** sessions (`GET /api/sessions`, also `?all=true`)                                                                                | 200, and the list contains **only A's own session** (B is not in it)        |
| **read** B (session, `/me`, chats, messages, contacts, pairing QR, screenshot)                                                           | 403 on all seven                                                            |
| **send from** B (`/api/sendText`, `/api/sendSeen` with `session` = B)                                                                    | 403, 403                                                                    |
| **stop**, restart, log out, delete, or re-point the webhook of B                                                                         | 403 on all five                                                             |
| read the key list, mint an admin key, mint a key for B, create a new session                                                             | 403 on all four                                                             |
| use A's key in the query string against B                                                                                                | 403                                                                         |
| Controls: A reads A, B reads B, no key, admin lists                                                                                      | 200, 200, 401, 200 (so the 403s are not a broken key)                       |
| Afterwards, as admin: B still exists, still `SCAN_QR_CODE`, no webhook was added, key count unchanged                                    | yes                                                                         |
| Exposure: port bindings; the same port on a non-loopback address of the host; no key; a wrong key; the dashboard and `/` without a login | `127.0.0.1:3322` only; connection refused; 401; 401; dashboard 404, `/` 404 |

**21 cross-tenant calls, 0 succeeded** (19 refused with 403, 2 list calls
answered 200 with A's own session only). Exit code 0 requires that, the positive
controls, an untouched B and a loopback-only port.

## Considered options

1. **One WAHA container per tenant** (one admin key per container, one session).
2. **One container, a session and a session-scoped API key per tenant** (this
   ADR).
3. One container with one shared key and Aurora-side filtering. Rejected up
   front: that is the DeskcommCRM mistake the design doc names; one leaked or
   mis-scoped call crosses tenants and the filter is hand-written.

## Decision outcome

Chosen option 2. WAHA Core's session keys **do** isolate tenants inside one
container: in the spike, tenant A's key could not list, read, send from, stop,
restart, log out, delete or reconfigure tenant B's session, nor mint or list
keys, and B was untouched. The container is Apache-2.0, free, with no session
cap, so the single container needs no purchase. Container per tenant stays the
**fallback**, switched to automatically if the spike script ever fails.

Rules that make the decision safe (these are requirements for IFC-326 and
IFC-331):

1. **Two kinds of key, never mixed.** The admin key (`WAHA_API_KEY`) lives only
   in the provisioning path (create or delete a session, mint its key). It is
   never in a `WhatsAppConnectionRef`, never in an adapter client, never in the
   browser. The per-tenant session key is what
   `WhatsAppConnectionRef.credential` carries, encrypted at rest like the other
   connection secrets (design doc section 5).
2. **The adapter client is bound to one tenant.** `accountId` (session name) is
   fixed from the connection row and the client sets `session` itself. A caller
   cannot pass a different session. Defence in depth: even if it did, WAHA
   answers 403 (the spike).
3. **Session name is not the tenant id.** Use an unguessable per-connection name
   (for example a random suffix), so a name leak is not an address.
4. **Restrict the runtime key.** Mint with `actions` limited to what the adapter
   needs (`read`, `send`; `control` only for the pairing flow, no `delete`, no
   `setting`). The spike tested the default actions (`delete` false), not a
   narrowed set; IFC-326 adds that test.
5. **No public address.** Production has no `ports:` mapping at all, only the
   private network between the API/workers and WAHA; the dashboard and Swagger
   are off (as in the compose file). The compose file here binds `127.0.0.1`
   only, for the spike.
6. **Re-run on every change.** The spike script is the isolation regression
   test. Run it on every WAHA version bump and in IFC-331's acceptance; if
   `crossTenantSucceeded` is not 0, fall back to container per tenant.
7. Webhooks: each session's webhook and HMAC key are set by Aurora at creation,
   and the tenant still comes from the connection found by the path token, never
   from the body (design doc section 5).

### Negative consequences and what the spike does not prove

- **Shared fate.** One container is one process: a crash, an out-of-memory kill
  or an upgrade interrupts every tenant's WhatsApp until it restarts (sessions
  persist on the volume; IFC-331 must show a restart does not drop pairing).
  That is an availability risk, not a confidentiality one.
- **The admin key is the keys to every tenant.** It must be separate from tenant
  secrets, rotated, and only in the provisioning path.
- **Authorisation isolation, not process isolation.** A bug or a remote-code
  flaw in WAHA would cross tenants in one container. That is why the version is
  pinned by digest and why the spike runs on every bump. If the owner needs
  process isolation for a regulated customer, that customer gets option 1.
- **Paired sessions were not measured.** No real number was used, so memory per
  paired, chatting session is unmeasured; the cost below states its assumption.
  A per-container session ceiling is therefore not set here; IFC-331 sets it
  after measuring a paired session.
- **Tested on one version and one engine** (2026.10.1, NOWEB), on Docker Desktop
  on Windows. Authorisation is application-level, so the platform should not
  matter, but IFC-331 re-runs it on the real host.

## Cost (nothing purchased; the owner decides)

Railway published prices, read 2026-11-21 from docs.railway.com/pricing/plans
and railway.com/pricing (neither page carries its own date): memory **$10 per GB
per month**, CPU **$20 per vCPU per month**, volume **$0.15 per GB per month**,
egress $0.05 per GB; plans Hobby **$5/month with $5 of usage included**, Pro
**$20/month with $20 included** (per workspace, shared by every service, not a
per-tenant cost).

Measured with `docker stats` in the spike (memory limit 1 GiB, three samples
each, identical):

| State                                | Memory        | CPU (of one core) |
| ------------------------------------ | ------------- | ----------------- |
| Idle WAHA NOWEB, no sessions         | 321.9 MiB     | 0.05 to 0.06%     |
| Two sessions started, unpaired       | 339.6 MiB     | 0.06 to 0.10%     |
| Per added unpaired session (derived) | about 8.9 MiB | negligible        |

Cost per container: 0.314 GiB x $10 = **about $3.15/month** memory, plus about
$0.02 CPU, plus a small volume (1 GB, $0.15): **about $3.3/month** just to
exist.

Per tenant per month:

| Option                           | Unpaired floor (measured)  | With a paired session at 200 MB (**unverified** assumption from the design doc) |
| -------------------------------- | -------------------------- | ------------------------------------------------------------------------------- |
| Container per tenant             | $3.3 + $0.09 = about $3.4  | $3.3 + $2.0 = **about $5.3**                                                    |
| One shared container, 10 tenants | $0.33 + $0.09 = about $0.4 | $0.33 + $2.0 = **about $2.3**                                                   |

So the shared container is roughly **$3 per tenant per month cheaper**, about
55% at ten tenants. Cost alone would not decide this, because the gap is small;
isolation evidence and fewer containers to run are the reasons. These are usage
costs on top of the Railway plan fee. Both options are within the $5 or $20 of
credit a plan already includes for the first few tenants. **MANUAL (row):** the
owner approves the Railway spend before IFC-331 deploys anything; the free tier
of everything else is unchanged. The paid "Community" support tier on WAHA's
site is optional and is **not** needed.

## Positive consequences

- Isolation is proved by a re-runnable script, not by trust.
- No spend and no licence cost; Apache-2.0.
- One container to patch, monitor and back up.

## Links

- `infra/waha/compose.yaml`, `infra/waha/isolation-spike.mjs`,
  `artifacts/misc/waha-isolation-spike.json`
- `docs/architecture/whatsapp-channel-design.md` sections 2, 4 and 5;
  `packages/application/src/ports/external/WhatsAppTransportPort.ts` (IFC-320)
- WAHA docs: https://waha.devlike.pro/docs/how-to/waha-plus/ and
  https://waha.devlike.pro/docs/how-to/security/ (read 2026-11-21);
  https://github.com/devlikeapro/waha (Apache-2.0)
- Railway pricing: https://docs.railway.com/pricing/plans and
  https://railway.com/pricing (read 2026-11-21)
