# PG-207 spec discussion — Module Settings: Email

Sprint 18 · branch `feat/pg-207-email-settings` · base `3d285c261` · lead:
Frontend-Lead (lane persona) · agents: Frontend-Lead, Backend-Architect,
Security-Lead, Domain-Expert, Test-Engineer
(`.specify/sprints/sprint-18/context/PG-207/PG-207-agent-selection.json`).

Inputs: exploration `context/PG-207/PG-207-spec-exploration.md` (Phase 0.75,
four Explore subagents with tool calls); owner rulings Q1-Q9
`context/PG-207/PG-207-owner-ruling.md`; structured audits
`context/PG-207/PG-207-hydrated-context.json`.

Rounds 1 (ANALYSIS) and 2 (PROPOSAL) ran together in one subagent pass per
agent: each agent produced its Round 1 section from tool-verified reading, then
its Round 2 section. The agents did not see each other's output; the lead
synthesis below reconciles them. Owner rulings Q6-Q9 were asked after Round 2
because the rounds surfaced them.

---

## Round 1 — ANALYSIS (condensed; every point carries the agent's citation)

### Frontend-Lead

- Stubs: `apps/web/src/app/email/email-settings/page.tsx:1-18`,
  `apps/web/src/app/email/signatures/page.tsx:1-16`.
- `ModuleSettingsShell` props
  `apps/web/src/components/shared/module-settings-shell.tsx:43-79`; sections in
  a `<fieldset disabled={isSaving}>` (`:169`); `canSave` is the only dirty hook
  (`:56,151`). Consumer precedent
  `apps/web/src/app/cases/(list)/case-settings/CaseSettingsContent.tsx:157-190,266-288`.
- Email layout `apps/web/src/app/email/_layout-shell.tsx:53-63`:
  `<main overflow-hidden>` with no padding and no scroller, so tall settings
  pages would be clipped unless they bring their own `overflow-y-auto` +
  padding.
- `apps/web/src/components/shared/password-input.tsx:35-62,93,118` is dark-theme
  hard-coded and controlled (login use): not reusable for a write-only secret on
  a light card.
- `packages/ui/src/components/rich-text-editor.tsx:287-309,333-336,359-363` is
  uncontrolled after mount, emits JSON, HTML only via `onCreate` →
  `editor.getHTML()`; image button uses `window.prompt`.
- `apps/web/src/components/email/EmailCompose.tsx:95-101,117,534`: `initialBody`
  read only on first mount; `:316-325` template insert overwrites the body;
  `:370-383` auto-save skips bodies equal to `initialBody`.
  `apps/web/src/app/email/compose/_compose-client.tsx:36-71` mounts EmailCompose
  without waiting for the original email (pre-existing).
- Role gating precedent: server-returned `canEdit`
  (`apps/web/src/app/contacts/(list)/contact-types/ContactTypesContent.tsx:64,153,172,193,232`).
- `apps/web/src/components/email/__tests__/EmailCompose.test.tsx:5-9` builds its
  trpc mock from `createMockEmailTrpc`; a new hook inside EmailCompose would
  break it.

### Backend-Architect

- `sendEmail` `apps/api/src/modules/email/inbound.router.ts:663-787`:
  `fromEmail = ctx.user.email` (`:689`), quota `:695`, send without
  replyTo/tracking/metadata `:742-752`, provider messageId discarded, no error
  text stored (`:766-772`). Module singleton `:34-44` (SendGrid key only; mock
  otherwise).
- `packages/adapters/src/messaging/email/outbound.ts`: `EmailProvider` `:56-61`;
  `replyTo`/tracking on the schema `:36,45-46`; SendGrid maps tracking +
  `custom_args` `:394-398`; Resend maps reply_to + message id `:463,486`;
  failover loop only over the service's own providers `:546-565`; per-instance
  rate limiter `:115-123,533`.
- `EmailRecord` has no provider message id column
  (`packages/db/prisma/schema.prisma:3958-3997`).
- Raw-body route precedent: Stripe in `apps/api/src/http-server.ts:411-467,502`.
- Root `package.json:254` pins `nodemailer >=10.0.9` as an override only; 10.1.7
  was published 2026-10-18 (under the two-week bar); 10.0.15 published
  2026-10-05.
- Newest migration on origin/main: `20261017130000_availability`.

### Security-Lead

- `ENCRYPTED_FIELDS` `packages/db/src/field-encryption.ts:33-36`; silent
  plaintext without key `packages/db/src/client.ts:157-162`.
- Anti-pattern to avoid:
  `apps/api/src/modules/documents/email-inbound.router.ts:117-130` (returns true
  when the secret is unset, `===` compare, HMAC over re-stringified JSON). Good
  pattern: `inbound.router.ts:239-260`.
- `isPublicIpAddress` `packages/domain/src/workflow/node-catalog.ts:580-624`
  misses 192.0.0.0/24, 192.0.2.0/24, 198.18.0.0/15, 198.51.100.0/24,
  203.0.113.0/24, 2001:db8::/32, 64:ff9b::/96, 2002::/16 and hex
  `::ffff:7f00:1`.
- `resolveAndPin`
  `apps/api/src/workflow/dispatchers/custom-action-dispatcher.ts:35-81` is
  HTTP-specific (rewrites the URL), no port handling.
- `adminTenantProcedure` (`apps/api/src/trpc.ts:567-571`) lacks CSRF/rate-limit
  middleware of `protectedProcedure` (`:244-249`).
- `isomorphic-dompurify` only in `apps/web` (`apps/web/package.json:52`).
- Gitleaks rules `.gitleaks/shared.toml:17-46,85-92`.

### Domain-Expert

- `packages/domain/src/` has no email folder; helpers need
  `packages/domain/src/email/` + barrel + rebuild
  (`packages/domain/CLAUDE.md:42-48`).
- `EmailRecord` already has `bouncedAt`, `openCount`, `clickCount`
  (`schema.prisma:3960-3985`).
- IFC-221 (`Sprint_plan.csv:468`, Backlog) = pixel endpoint + link wrapping +
  `EmailTracking`.
- Suppression check must run before `reserveQuota` (`inbound.router.ts:695`).

### Test-Engineer

- `prismaWithTenant` is the raw mock under Vitest
  (`apps/api/src/test/setup.ts:397`): encryption must be proven with a static
  test + a real-DB round trip.
- `inbound.quota-guard.test.ts:12-19` / `inbound.router.b11.test.ts:22-31`
  replace `@intelliflow/adapters` with a literal object; any new adapter import
  in `inbound.router.ts` is `undefined` there.
- `field-encryption.test.ts:63-66` asserts the annotation count.
- DNS-mock precedent
  `apps/api/src/workflow/dispatchers/__tests__/custom-action-dispatcher.test.ts:3-8,141,167`;
  runtime keys precedent `packages/adapters/.../dkim-signer.test.ts:6,23`.

---

## Round 2 — PROPOSAL (condensed)

- **Frontend-Lead**: email-settings on `ModuleSettingsShell` (own scroll/padding
  wrapper), bento cards, new `SecretField` (tri-state keep/replace/remove,
  `autoComplete="new-password"`), Test connection disabled while dirty, snapshot
  `isDirty`, `canEdit` read-only gating, axe-tested; signatures page on the
  ContactTypes pattern (My / Org cards, Default badges in text,
  `SignatureDialog` with RichTextEditor via `onCreate`, `promptForImage` no-op,
  `next/dynamic`), EmptyState `signatures` with custom copy; compose prefill
  resolved in `_compose-client.tsx` and passed as an `initialSignatureHtml`
  prop, rendered only after the queries settle, never injected after mount.
  `TagsTab via forwardRef` and `colorToken CHECK` are N/A (no tags, no colour
  tokens).
- **Backend-Architect**: `TenantEmailSettings` singleton, `EmailSignature`
  (USER/ORG, partial-unique defaults, lower(name) unique per owner scope),
  `EmailSuppression` (counts + `suppressedAt`), `EmailEventReceipt`
  (idempotency), `EmailRecord.provider` + `providerMessageId`; three Class A
  migrations; top-level routers `emailSettings` / `emailSignatures` on
  `tenantProcedure` + in-handler admin check; `SmtpProvider` with
  `nodemailer@10.0.15`, DNS pinning, port allow-list, timeouts, sanitised
  errors; per-call transport resolution in a new module so existing module-level
  mocks keep working; suppression before quota.
- **Security-Lead**: SEC-01..70 (encryption + refuse without key, write-only
  DTO, no secrets in logs/audit/errors, coded nodemailer errors, save-time +
  connect-time SSRF with pinning and extended ranges, ports, timeouts, TLS-only
  and no `rejectUnauthorized:false`, CRLF/header injection, `sanitize-html`
  server-side + prefill, fail-closed webhook verification, RBAC, suppression PII
  retention/audit, gitleaks-safe fixtures).
- **Domain-Expert**: US-EM1..7, AC-EM-001..036; pure helpers `evaluateBounce`,
  `partitionRecipients`, `resolveReplyTo`, `resolveDefaultSignature`; defaults
  table (tracking OFF, hard-bounce suppress ON, threshold 3, notify OFF);
  dependency-chain + PRD outline; follow-ups (IFC-221 broadened, IMAP sync, DSN
  parsing).
- **Test-Engineer**: 12 new test files + regression list + slot-wrapped commands
  under Node 22.

### Divergences found and how they were settled

| #   | Topic                          | Positions                                                                           | Settled by                                                                                                                                                     |
| --- | ------------------------------ | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1  | Suppressed recipients          | Domain: block whole send · Backend: drop and send rest                              | Owner Q9: **drop and send rest**                                                                                                                               |
| V2  | Platform send path             | Backend: add Resend to the singleton                                                | Owner Q6: **user mail never from the platform domain**; fix in PG-207                                                                                          |
| V3  | Bounce source                  | Backend/Security: SendGrid + Resend webhooks                                        | Owner Q6-Q8: user mail leaves from the user's mailbox → **read DSNs from that mailbox**; provider webhooks dropped                                             |
| V4  | Tracking defaults              | Domain: OFF (privacy) · Backend: ON (current schema default)                        | Lead: **OFF** — opt-in privacy stance (playbook §7); no live provider honours the flag today, so OFF changes no current behaviour                              |
| V5  | `notifySender` default         | Domain: OFF · Backend: ON                                                           | Lead: **OFF** — playbook §7 "notify defaults OFF unless explicit product reason"; BOUNCED status is visible in the mailbox list regardless                     |
| V6  | Who reads settings             | Backend: admin-only · Security/Frontend: members read a secret-free DTO             | Lead: **members read** the secret-free tenant DTO with `canEdit`; suppression list admin-only (PII)                                                            |
| V7  | Ports                          | Backend: SMTP 25/465/587/2525, IMAP 143/993 · Security: SMTP 465/587/2525, IMAP 993 | Lead: **SMTP 465/587/2525, IMAP 993** (TLS-only; 25 is relay, 143 plaintext-first)                                                                             |
| V8  | From-domain alignment (SEC-22) | Security: From must match SMTP username domain                                      | Lead: **dropped** — usernames are often not addresses; the receiving SMTP/OAuth server enforces sender identity. Kept: validated address, CRLF/`<>"` rejection |
| V9  | IMAP client                    | none proposed                                                                       | Lead: `imapflow` (dependency, pinned ≥ 14 days old) for SMTP-mailbox DSN reading; Gmail/Graph mailboxes use the existing adapters' `searchMessages`            |

---

## Lead synthesis after owner rulings Q1-Q9 (input to Round 3)

- **L1 Mailboxes, not a tenant SMTP blob.** A `EmailMailbox` row per connected
  sending mailbox: `scope USER` (one per user) or `scope TENANT` (one per
  tenant, admin-managed company fallback); `kind SMTP | GMAIL | MICROSOFT`. SMTP
  kind stores SMTP + IMAP connection fields with encrypted passwords; OAuth
  kinds store encrypted access/refresh tokens, expiry, scopes and the account
  address. Status ACTIVE / ERROR / DISCONNECTED with a coded last error.
- **L2 Send resolution** (sendEmail and the `forward` action of processEmail —
  both send user mail through the mock today): the user's ACTIVE mailbox → else
  the tenant mailbox → else refuse with PRECONDITION_FAILED "Connect your
  mailbox in Email Settings". Never the platform provider, never the mock. A
  mailbox send error records FAILED with a coded, sanitised error and no
  fallback (Q4).
- **L3 Tenant settings singleton** `TenantEmailSettings`:
  `trackOpens`/`trackClicks` (default false, category 2 → IFC-221 broadened),
  `replyToAddress` (nullable override applied on every transport),
  `hardBounceAction` (SUPPRESS|NONE, default SUPPRESS), `softBounceThreshold`
  (1-10, default 3), `notifySenderOnBounce` (default false, category 1 via a
  `notifyEmailBounced` helper + `email_bounced` notification type).
- **L4 Bounce reader** (Q8): a scheduler in the API process (precedent
  `apps/api/src/agent/approval-sweep-scheduler.ts`) scans each ACTIVE mailbox
  every N minutes for DSNs since its cursor: SMTP kind over IMAP (`imapflow`),
  Gmail via `GmailAdapter.searchMessages`, Microsoft via
  `OutlookAdapter.searchMessages`. A pure `parseDsn` (domain) extracts
  Final-Recipient, Status class (5.x.x hard / 4.x.x soft) and the original
  Message-ID; matching uses the Message-ID that IntelliFlow sets on every
  outgoing message (stored as `EmailRecord.messageIdHeader`), with idempotency
  via `EmailEventReceipt (mailboxId, dsnMessageId)`.
- **L5 Suppression** (Q9): `EmailSuppression` per tenant + lower(email);
  enforced on to/cc/bcc before quota; suppressed addresses dropped and returned
  as `skipped`; all suppressed → nothing sent, PRECONDITION_FAILED listing them.
  Admins list/add/remove; removal in `$transaction` with audit (counts only).
- **L6 OAuth connect** (Q7 B, absorbs PG-084's send side):
  `emailMailbox.oauthStart` returns the provider authorization URL with a
  signed, expiring, single-use state; an API callback route exchanges the code,
  stores encrypted tokens and redirects to `/email/email-settings`. Scopes:
  Gmail `gmail.send` + `gmail.readonly` + `openid email`; Microsoft
  `Mail.Send` + `Mail.Read` + `offline_access` + `User.Read`. Missing client
  credentials in an environment → the Connect button is shown disabled with
  "Google sign-in is not configured" (no fake success).
- **L7 Signatures** as Round 2 (USER/ORG, defaults, `sanitize-html` server-side,
  prefill in compose only).
- **L8 Pages**: `/email/email-settings` (My mailbox, Company mailbox [admin],
  Tracking, Reply-to, Bounce rules, Suppression list [admin], Signatures link)
  and `/email/signatures`.

Round 3 is asked to challenge L1-L8.

## Runner requirements (projects-8c, received during Round 3) — to become ACs with tests

R-1 secrets encrypted at rest with the repo's field-encryption helper, never
plaintext, never returned (UI shows only connected state) · R-2 never logged,
even on error paths; redaction through the logger with a test · R-3 minimum
OAuth scopes (send + read only for the bounce scan), validated state/PKCE,
revoke + delete on disconnect · R-4 a user sends only through their own mailbox
or the admin-set tenant fallback; cross-tenant negative test · R-5 bounce reader
reads only bounce-shaped messages and stores no other mail content · R-6 sending
fails visibly until a mailbox is connected; never SENT unless sent, through any
path · R-7 tests stub nodemailer, imapflow and OAuth (no network, no paid AI) ·
R-8 no secret-shaped fixtures (runtime-built) · new deps through `pnpm audit` /
OSV.

---

## Round 3 — CHALLENGE

### Frontend-Lead (C-FE)

- C-FE1 One route stays: `/email/email-settings` (sidebar
  `apps/web/src/components/sidebar/configs/email.ts:10`,
  `EmailSettingsPanel.tsx:14`). No conflicting connected-accounts surface
  exists: `/settings/integrations`
  (`apps/web/src/app/settings/integrations/page.tsx:60-72`) is a
  connector-health page whose connect handler toasts "coming soon";
  `components/integrations/` does not exist. "My mailbox" is self-contained with
  immediate actions and does not feed `canSave`; only Company mailbox fields,
  Reply-to, Tracking and Bounce rules use the shell's Save
  (`module-settings-shell.tsx:144-170,189`). Reset touches tenant settings only
  and never disconnects a mailbox. Non-admins: My mailbox + Signatures link +
  read-only tenant cards ("Managed by your admin"); Save/Reset hidden via
  `saveAction`/`resetAction`; read-only line naming the company fallback address
  when one exists.
- C-FE2 OAuth return: `useSearchParams` inside Suspense (precedent
  `apps/web/src/app/settings/account/page.tsx:1-9`); whitelist `connected` ∈
  {google, microsoft} and a fixed error-code table; never render raw query text;
  persistent `role="status"`/`role="alert"`; `router.replace` to clear the
  query; API redirect target hard-coded (no `returnTo`).
- C-FE3 Compose errors are swallowed: `EmailCompose.tsx:204-206` bare catch →
  generic message (`:178-180`); `InlineCompose.tsx:127-129` generic toast. UI
  callers of `sendEmail`: `EmailCompose.tsx:124` (mounted by
  `_compose-client.tsx` and `ContactQuickActions.tsx:122`) and
  `InlineCompose.tsx:63`. `processEmail` has one caller, `EmailPage.tsx:96`
  (archive/delete/spam); UI forward goes to `/email/compose?mode=forward`
  (`EmailPage.tsx:190`), so the server-side forward action has no UI caller.
  Fix: server puts a stable machine code (NO_MAILBOX, MAILBOX_ERROR,
  ALL_SUPPRESSED) in the error data; shared `getEmailSendError(err)` maps it;
  inline banner with a link to Email Settings; draft kept; `skipped` shown in a
  toast + aria-live after a partial send.
- C-FE4 BOUNCED/FAILED are invisible: no `status` in `EmailItemData`
  (`EmailListItem.tsx:8-19`); Sent filter is
  `status in [SENT, DELIVERED, OPENED, CLICKED]` (`inbound.router.ts:183-184`).
  Fix: add BOUNCED + FAILED to Sent, `status` to the list DTO, text+icon badge
  in row and message header (WCAG 1.4.1).
- C-FE5 Own scroll wrapper (`_layout-shell.tsx:53-63`); `next/dynamic` for the
  suppression table and custom SMTP form; one h1, cards
  `section aria-labelledby` with h2; presets Select (Gmail/Outlook/Custom) say
  app passwords are needed; disabled Connect shows the reason as visible text;
  one aria-live region; disconnect confirm says what the fallback becomes.

### Security-Lead (C-SEC)

- C-SEC0 The OAuth adapters have no production caller:
  `getAuthorizationUrl`/`exchangeCodeForTokens` are unused outside tests; the
  only wiring is health-check stubs
  (`apps/api/src/modules/integrations/integrations.router.ts:293-339`, fake
  refresh token `:210-215`). State, callback, token storage and revoke must be
  built.
- C-SEC1 Adapter defaults are unsafe: Gmail requests `gmail.modify` +
  `gmail.labels` (`packages/adapters/src/email/gmail/client.ts:305-310`) with
  `prompt=consent` (`:325-326`); Outlook `Mail.ReadWrite`
  (`outlook/client.ts:317`). Pass explicit scopes; test the exact list. DSN
  reading needs bodies: Gmail `gmail.readonly` (restricted scope → Google
  security assessment is a launch dependency) queried with
  `q=from:(mailer-daemon OR postmaster)`; Microsoft `Mail.Read` with a `$filter`
  on the sender. `gmail.metadata` / `Mail.ReadBasic` cannot see the failed
  recipient or original Message-ID.
- C-SEC2 State: HMAC-signed `{tenantId,userId,scope,nonce,exp≤10m}`, nonce
  single-use in Redis (`SET NX EX` / `GETDEL`; Redis via
  `apps/api/src/middleware/rate-limit.ts:191-203`), bound to a short-lived
  HttpOnly SameSite=Lax cookie because the callback is a plain GET outside the
  Bearer tRPC context; S256 PKCE (adapters send no `code_challenge`,
  `gmail/client.ts:318-344`); redirect URI from env only; post-connect redirect
  hard-coded.
- C-SEC3 Account binding: verify id_token / userinfo (`email_verified`), store
  `accountAddress`; From = that address, never `ctx.user.email`
  (`inbound.router.ts:689`). Empty refresh token is stored as `''`
  (`gmail/client.ts:356`) → treat as ERROR. Rotation-safe refresh write;
  `invalid_grant` → DISCONNECTED. Revoke puts the token in the query string
  (`gmail/client.ts:405`) → POST body; disconnect = revoke (best effort) +
  delete tokens + DISCONNECTED.
- C-SEC4 Mailbox mutations on `verifiedTenantProcedure` + in-handler admin check
  for TENANT scope (CSRF/rate-limit gap of `adminTenantProcedure`,
  `trpc.ts:567-571` vs `:244-249`).
- C-SEC5 Spoofed DSNs: accept only
  `multipart/report; report-type=delivery-status` whose original Message-ID
  matches an `EmailRecord` sent from this mailbox and tenant within 30 days, and
  whose failed recipient is one of that record's recipients. Parse caps (size,
  parts, depth), never render, store only status + diagnostic ≤ 200 chars. IMAP
  993 implicit TLS, read-only open, no flag changes. TCP SSRF pin variant +
  extended ranges, at save and at every connect. Scheduler work per mailbox on
  the tenant-scoped client, per-mailbox lock + back-off.
- C-SEC6 Send: mailbox resolved only from
  `{tenantId, ownerUserId: ctx.user.userId}`, never from input. Members using
  the tenant mailbox is a spoofing/cost risk → admin opt-in setting (default
  false). Zod caps: subject ≤ 998 no CRLF, filename ≤ 255 no CRLF/quote, html ≤
  2 MB, ≤ 100 recipients. Gmail `composeRawMessage` concatenates headers raw
  (`gmail/client.ts:1014-1056`) → build MIME with nodemailer `MailComposer` and
  set our own Message-ID. Per-mailbox hourly cap; 429/550 → ERROR with code. Raw
  provider errors are logged today (`inbound.router.ts:756,762`) → code +
  recordId only. `attachments[].fileUrl` free string (`:677`) → restrict to
  tenant storage if fetched.
- C-SEC7 Fixed OAuth/API hosts as constants (no SSRF); Microsoft authority from
  config.
- C-SEC8 PII: suppression stores lower(email) + reason + counts; soft counters
  purge after 90 days, receipts after 30; audit ids/counts only; DSAR
  (`dsar-workflow.ts`) has no email handling → add or file an issue; disconnect
  deletes tokens and cursor.
- C-SEC9 Divergences: V6 agree if members see only their own mailbox + a boolean
  "company mailbox available" (tenant host/username admin-only); V7 agree
  (`requireTLS` on 587); V8 partly disagree → From comes only from the mailbox
  row (SMTP `fromAddress`, OAuth verified account address), never from the
  request.

### Domain-Expert + Test-Engineer (C-DT)

- C-DT1 ERROR user mailbox (revoked token) is unspecified in L2; falling back to
  the tenant mailbox changes the From identity, which Q4's reasoning rejects.
  Recommend refuse "Reconnect your mailbox"; a send failure revealing a revoked
  token flips the mailbox to ERROR in the same unit of work.
- C-DT2 Reply-to precedence must be fixed and shown in UI copy (a tenant
  reply-to on a user-mailbox send sends replies to a shared address).
- C-DT3 Partial bounces are normal under Q9; `EmailRecord` has one status
  (`schema.prisma:3959-3985`). Recommend one receipt per recipient; `BOUNCED`
  only when every recipient hard-bounced; otherwise
  `metadata.bouncedRecipients`.
- C-DT4 DSNs carry no complaints (those are ARF feedback loops) → drop
  COMPLAINT. Soft-bounce counting needs a window; count from receipts
  (idempotent), not a stored counter.
- C-DT5 Quota must reserve and release only the sent recipients
  (`inbound.router.ts:692-700`); `skipped` changes the `{id,status}` contract
  (`:686`).
- C-DT6 The repo has a dependency-free MIME parser:
  `packages/adapters/src/messaging/email/inbound.ts` (`parseMimeParts` `:451`,
  `parseHeaders`, `InboundEmailParser.parse` `:574`) → `parseDsn` in adapters on
  top of it; pure `classifyDsnStatus` + `evaluateBounce` in domain.
- C-DT7 Gmail `parseMessage` (`gmail/client.ts:1058-1108`, `format=full` `:436`)
  drops References/In-Reply-To and the delivery-status part; Outlook search uses
  `$select` (`outlook/client.ts:475`) → raw accessors (Gmail `format=raw`, Graph
  `/$value`) are in scope; `searchMessages` is one request per hit
  (`gmail:454-480`) → page limit.
- C-DT8 Message-ID matching for OAuth kinds is unproven (Gmail may rewrite;
  Graph `sendMail` returns 202 without an id) → exec spike; keep
  `messageIdHeader` for SMTP; Gmail returned id/threadId; Graph fallback
  recipient + window + subject with low confidence.
- C-DT9 Variants: RFC 3464, Gmail DSN, Exchange NDR, `Action: delayed` (not a
  bounce), auto-replies, unparseable → no-op receipt, never throw. Fixtures from
  a runtime `makeDsn()` with `*.example.invalid`.
- C-DT10 Testability per unit (injected `fetch`, `createImapClient`, `lookup`,
  `createTransport`, scheduler `run`
  - fake timers); delete unreachable branches rather than ignore them. Existing
    suites: quota-guard (`:12-19,40-50`), b11 (`:22-31`), router forward
    (`inbound.router.test.ts:300-316`), `EmailCompose.test.tsx:5-9`
    (`createMockEmailTrpc`), `field-encryption.test.ts:63-66` — keep every
    assertion, add companions. Integration test applies the migration SQL itself
    (CI `db push`, `migration.yml:182`).

### Backend-Architect (C-BE)

- C-BE1 One mailbox table works: `ENCRYPTED_FIELDS` is a per-model list, nulls
  pass through (`packages/db/src/field-encryption.ts:33-36,114-126`). Traps:
  only plain strings are encrypted (`:106-111`, a `{ set: … }` write stores
  plaintext); write results and `include`d relations come back as ciphertext
  (`:233-239`); `$queryRaw` bypasses it. Repository helpers write plain strings
  and never reuse returned rows for secrets.
- C-BE2 `users` has no `(tenantId,id)` unique (`schema.prisma:476-507`), so the
  contact_types composite FK
  (`20261017120000_contact_types/migration.sql:87-95`) does not carry over → FK
  on `userId` alone, `tenantId`/`userId` set only from ctx, tested. Partial
  unique indexes per scope; named CHECKs for scope/user consistency and per-kind
  required columns; Text columns.
- C-BE3 Do not persist access tokens (in-memory per mailbox); persist only the
  refresh token. Microsoft rotates refresh tokens (`outlook/client.ts:420`) →
  `tokenVersion` compare-and-set via `updateMany` (covered by the extension).
  Disconnect nulls every secret column and revokes.
- C-BE4 Remove the module singleton (`inbound.router.ts:34-44`) and both call
  sites (`:516` forward, `:742` send). Forward today is `tenantProcedure`
  (`:429`) with no `reserveQuota` (`:493-545`) → one shared `dispatchUserMail`
  (verified check, mailbox resolve, suppression, quota, record, send, status)
  used by both. Order: resolve mailbox → suppression → quota → record (no
  PENDING orphans). Helper module
  `apps/api/src/modules/email/mailbox-sender.ts`, adapters loaded lazily (as
  `integrations.router.ts` `loadAdapters`); the three test files that replace
  `@intelliflow/adapters` (`inbound.quota-guard.test.ts:10-19`,
  `inbound.router.b11.test.ts:22-31`, `inbound.router.test.ts:22`) mock the
  helper instead and keep their assertions.
- C-BE5 Attachments are stored as `fileUrl` metadata but never sent
  (`:693-735`); once mail really leaves they must be attached or the send
  refused — never sent silently without them.
- C-BE6 Gmail `composeRawMessage` (`gmail/client.ts:1014-1056`) lacks
  From/Reply-To/Message-ID/MIME-Version, does not RFC 2047-encode subjects,
  interpolates raw (CRLF injection); `GmailComposeEmailParams` (`:129-144`) has
  no from/replyTo/headers → add `sendRaw(tokens, mime)` with MIME from
  nodemailer `MailComposer` (nodemailer 10.0.15, published 2026-10-05). Outlook
  `sendMessage` (`outlook/client.ts:502-527`) POSTs `/me/sendMail` (202,
  sentinel id `sent`), `composeMessage` (`:1010-1045`) lacks
  from/replyTo/headers → draft-then-send spike (`POST /me/messages` →
  `/{id}/send`) to get `internetMessageId`.
- C-BE7 Stamp `X-IntelliFlow-Record: <recordId>` on every message (X- headers
  survive SMTP, Gmail raw MIME and Graph `internetMessageHeaders`; DSNs quote
  original headers); match DSNs on it first, Message-ID second. Add
  `EmailRecord.messageIdHeader`, `provider`, `providerMessageId` +
  `@@index([tenantId, messageIdHeader])`.
- C-BE8 `searchMessages` is unusable for DSNs
  (`gmail/client.ts:473-480,1058-1085`) → `listDsnSince(tokens, since)` per
  adapter (Gmail `q` + `format=raw`; Graph `receivedDateTime` filter +
  `/$value`). Bounce reader in the API process (has the OAuth envs + encryption
  key); events-worker `MaintenanceScheduler` is a plain `setInterval` with no
  lock (`apps/workers/events-worker/src/maintenance/scheduled-jobs.ts:57-80`);
  the sweep's advisory lock is transaction-scoped
  (`approval-escalation-sweep.ts:452-455`) and must not span IMAP/HTTP →
  per-mailbox lease columns (`nextScanAt`, `lockedUntil`, `failureCount`)
  claimed with `UPDATE … WHERE lockedUntil < now() RETURNING`, exponential
  back-off, ERROR after N failures; env gating as
  `approval-sweep-scheduler.ts:15-23`. IMAP cursor = UIDVALIDITY + last UID;
  Gmail/Graph = received-time cursor with overlap + receipt dedupe.
- C-BE9 OAuth callback: an unauthenticated API GET invites account-linking CSRF
  → redirect URI is a WEB page that calls an authenticated
  `emailMailbox.oauthComplete({provider, code, state})`; state = opaque 256-bit
  value stored as sha256 in an `EmailOAuthState` row (user, tenant, scope,
  provider, PKCE verifier, expiresAt 10 min), consumed with
  `DELETE … RETURNING`. Explicit scopes via `config.scopes`. Google
  sensitive/restricted scopes need app verification beyond ~100 test users, and
  Testing-mode refresh tokens expire after 7 days → NEEDS_HUMAN. Microsoft
  `OUTLOOK_TENANT_ID` is single-tenant by default (`outlook/client.ts:318-324`)
  → multi-tenant (`common`) authority.
- C-BE10 Migrations `20261020120000_email_mailboxes` (+ `EmailOAuthState`),
  `…120100_email_settings_signatures`, `…120200_email_suppression_receipts`,
  `…120300_email_record_message_ids`; RLS block on every new table (not FORCEd,
  `contact_types/migration.sql:97-115`).
- C-BE11 Dead-on-arrival: `trackOpens`/`trackClicks` have no consumer once user
  mail leaves SendGrid → disabled with "needs IFC-221" or hidden;
  `notifyEmailBounced` touches `packages/validators/src/notifications.ts`,
  `apps/web/src/components/notifications/notification-utils.ts`,
  `apps/web/src/app/notifications/settings/page.tsx`; company-mailbox sends need
  an audit trail (`EmailRecord.userId`) + a per-mailbox daily cap.

---

## Round 3 resolutions (lead, binding on the spec)

| #   | Challenge                                             | Resolution                                                                                                                                                                                                                                                                           |
| --- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | ERROR user mailbox (C-DT1)                            | **Refuse** with MAILBOX_ERROR "Reconnect your mailbox" — no user→tenant fallback when the user has a mailbox in ERROR (Q4 reasoning: the From identity must not silently change). Tenant fallback applies only when the user has **no** mailbox **and** the admin enabled it.        |
| D2  | Members using the tenant mailbox (C-SEC6, runner R-4) | Toggle `allowTenantMailboxFallback` (default **false**, category 1: consumed by mailbox resolution). Admins may always send through the tenant mailbox.                                                                                                                              |
| D3  | OAuth callback (C-SEC2 vs C-BE9)                      | **C-BE9 design**: web callback page + authenticated `oauthComplete`; opaque state hashed in `EmailOAuthState` with the PKCE verifier, single use, 10 min; scopes explicit; redirect URI from env; post-connect path hard-coded. No cookie needed (session-authenticated completion). |
| D4  | Token storage (C-BE3)                                 | Persist only the refresh token (+ SMTP/IMAP passwords) encrypted; access tokens in memory; `tokenVersion` CAS; disconnect revokes (POST body) and nulls secrets.                                                                                                                     |
| D5  | Message matching (C-BE7, C-DT8)                       | `X-IntelliFlow-Record` header first, Message-ID second; Graph via draft→send; an exec **spike** proves header survival per kind before the matcher is relied on; the Graph recipient+window fallback is low confidence and **never suppresses on its own**.                          |
| D6  | Partial bounces (C-DT3)                               | Receipt per recipient; `BOUNCED` when every recipient hard-bounced; otherwise status unchanged + `metadata.bouncedRecipients`; UI shows "Bounced" or "Partly bounced".                                                                                                               |
| D7  | Reasons + window (C-DT4)                              | Reasons `HARD_BOUNCE`, `SOFT_BOUNCE_LIMIT`, `MANUAL` (COMPLAINT dropped). Soft bounces counted from receipts within a rolling **30-day** window.                                                                                                                                     |
| D8  | MIME (C-DT6, C-BE6)                                   | DSN parsing reuses the in-repo parser (`inbound.ts`) — no `mailparser`. Outgoing MIME built with nodemailer `MailComposer` for all three kinds. New deps: `nodemailer`, `imapflow`, `sanitize-html` (each pinned exactly, ≥ 14 days old, license + `pnpm audit`/OSV).                |
| D9  | Attachments (C-BE5, C-SEC6)                           | Attachments are sent: fetched only from tenant storage by storage path (no arbitrary URL fetch); a fetch failure fails the send (FAILED with code), never sends without them.                                                                                                        |
| D10 | Tracking (C-BE11)                                     | Stored, shown with "Takes effect when open/click tracking ships (IFC-221)"; category 2 → IFC-221 broadened to all mailbox kinds; default false.                                                                                                                                      |
| D11 | Forward (C-BE4, C-FE3)                                | Server `forward` goes through `dispatchUserMail` (verified, quota, suppression, mailbox) even though the UI uses compose; no mock/singleton remains.                                                                                                                                 |
| D12 | Scheduler (C-BE8, C-SEC5)                             | API-process scheduler, env-gated; per-mailbox lease claim; per-mailbox work scoped to the mailbox tenant; caps per scan.                                                                                                                                                             |
| D13 | Visibility (C-FE4)                                    | BOUNCED/FAILED added to the Sent filter + list DTO + badges.                                                                                                                                                                                                                         |
| D14 | Settings read access (V6 + C-SEC9)                    | Members: own mailbox + boolean `companyMailboxAvailable` (+ its address when fallback is enabled) + read-only tenant settings; tenant mailbox host/username and the suppression list are admin-only.                                                                                 |
| D15 | Users FK (C-BE2)                                      | FK `user_id → users(id)`; tenant/user from ctx only; integration test for cross-tenant mismatch.                                                                                                                                                                                     |

---

## Round 4 — CONSENSUS

Verdicts (subagent mode, each agent read the spec and verified code claims with
tools):

### Frontend-Lead — APPROVED WITH MODIFICATIONS

1 BLOCKING: shell has no way to hide Save/Reset (`page-header.tsx:18-34`
PageAction has no hidden; `module-settings-shell.tsx:139-155` always builds
both) → add optional `hideActions` prop to the shell (+ its tests, shell shared
by ~8 modules) or non-admin read-only page without the shell. 2 shell
`<fieldset disabled={isSaving}>` (`:169`) disables My mailbox during save →
render My mailbox outside the fieldset or state it. 3 prefill must become
`initialBody` (sanitised at the forward-quote site `EmailCompose.tsx:95-101`);
mount only after resolveDefault settles (`_compose-client.tsx:36-71`);
signature-only body not auto-saved (`:370-383`). 4 template insert wipes the
signature (`:316-325`) → decide re-append or documented loss. 5 AC-EM-018:
visible `role="alert"` banner with focus, not only the sr-only region
(`:178-180,204-206,626`); InlineCompose toast (`:127-129`). 6 skipped list also
to aria-live (no toast hook in EmailCompose). 7 `status` on `EmailItemData`
(`EmailListItem.tsx:8-19`), text+icon badge. 8 callback page:
loading/error/retry; StrictMode double-call guard (single-use state). 9
descriptions `EmailSettingsPanel.tsx:14`, `email.ts:10`. Notes: explicit AC for
own `overflow-y-auto` wrapper (`_layout-shell.tsx:53-63`).

### Domain-Expert — APPROVED WITH MODIFICATIONS

1 grep-test also covers `useMock`/`MockEmailProvider` under modules/email; drop
the `(adapters as any)` cast at `inbound.router.ts:33-34`. 2 `EmailStatus`
already has BOUNCED/FAILED (`schema.prisma:3999-4007`), `bouncedAt` exists
(`:3972`) → no enum migration; set bouncedAt on BOUNCED. 3
`EMAIL_SETTINGS_ADMIN_ROLES` aliases `ACCOUNT_OWNER_ADMIN_ROLES`
(`territory-constants.ts:273`) like `CASE_TYPE_ADMIN_ROLES`
(`case-type-defaults.ts:40`) + identity test (`case-type-defaults.test.ts:77`).
4 soft count includes the current DSN; boundary test (3rd suppresses at
threshold 3). 5 suppressions outlive receipts; removal resets the count (count
only receipts after the latest removal). 6 30-day window measured from
`EmailRecord.sentAt`; later DSN → UNMATCHED receipt. 7 `hardBounceAction=NONE`
still records receipts + BOUNCED status. 8 `resolveDefault` returns sanitised
HTML. 9 fallback sends keep `EmailRecord.userId` = actual sender; bounce
notification goes to that user. Notes: PG-084 rebaseline keeps inbound-sync ACs;
layered commits; gh issue for DSAR before PR.

### Security-Lead — APPROVED WITH MODIFICATIONS

1 BLOCKING SSRF predicate: `isPrivateIpv6` recursion on `::ffff:` misses hex
form `::ffff:7f00:1` (`node-catalog.ts:597-599`); expanded loopback not matched
(`:596`); `isPrivateIpv4(a,b)` (`:581`) sees two octets only; missing
NAT64/6to4/doc ranges → canonical byte parse via `node:net` + CIDR table +
unwrap mapped/NAT64/6to4; tests per form. 2 BLOCKING encryption fail-open:
extension only applied when key set (`client.ts:157-159`); only production
throws (`:16`) → router-level guard before any secret write + test with key
unset. 3 `encryptData` only plain strings (`field-encryption.ts:126`) → plain
`data` only + arch test banning `{ set:` + raw-select `v1:` assertion. 4 write
results not decrypted (`:244-249`) → allow-list DTO mappers; serialised-output
test on create/update returns. 5 connect-time pin mandatory for test/send/IMAP;
reject numeric (`0x7f.1`, decimal) and IDN homograph hosts at save; reject ALL
IP literals. 6 `oauthComplete` delete-returning on (stateHash, tenantId, userId,
provider); verify id_token aud/nonce; Google `email_verified`; Microsoft address
from `mail`/`preferred_username`. 7 DSN: also require original Message-ID match
(record ids guessable); cap suppressions per scan (25); replay after MANUAL
removal test. 8 diagnostic text escaped on render, never in notification HTML. 9
redact email-shaped substrings from diagnostic before storing.

### Test-Engineer — APPROVED WITH MODIFICATIONS

1 BLOCKING: state the new annotation total (7) and add
`ENCRYPTED_FIELDS.EmailOAuthState: ['codeVerifier']`
(`field-encryption.test.ts:63-66`). 2 quota-guard (`:18`) and b11 (`:28`) mocks
move to `dispatchUserMail`/transport; keep reserve/release assertions against
sent-only quota. 3 diff-coverage (`scripts/pre-ship.mjs:504`): adapters covered
through injected fakes; scheduler wiring in `main.ts` and page shells need smoke
tests (lead: NO ignore pragmas — lane rule L2). 4 Domain > 95%, application >
90%; boundary tests partitionRecipients / evaluateBounce (threshold 1 and 10,
30-day edge). 5 injected clock / pinned fake timers for 30-day window, 10-min
state, leases. 6 integration test copies
`tests/integration/contact-types.test.ts`, runs `--exclusive intelliflow-db`;
lease race test. 7 module-level scheduler state and the testConnection limiter
resettable between tests. 8 table-driven `isPublicIpAddress` test per range.

### Backend-Architect — APPROVED WITH MODIFICATIONS

1 BLOCKING: explicit `requireEncryptionKey()` guard in mailbox router + refresh
rotation write + OAuth state verifier (`client.ts:16,157-159`); test with key
unset asserts nothing written. 2 BLOCKING: extension covers only top-level
create/createMany/update/updateMany/upsert + 5 reads
(`field-encryption.ts:156-191,233-239`) → lease SQL `RETURNING id` only; secrets
written only by top-level mailbox ops (grep test); OAuth state consumed safely
with the verifier decrypted explicitly or read via Prisma first. 3 BLOCKING:
scheduler starts in `http-server.ts:562-568` (`startApiServer`, after
`containerReady`), not main.ts; spec container/context wiring
(`createBounceReaderDeps()` like `createDefaultSweepDeps`); fix Runtime Wiring
table. 4 mapped/NAT64 tests; SMTP pin connects to the checked address, no second
lookup. 5 forward → verifiedTenantProcedure; existing tests rewritten to mock
dispatchUserMail, not deleted. 6 quota release in a finally-safe path for every
failure after reservation (`quota-guard.ts:102-114`), incl. record creation and
attachment fetch failures. 7 parity test: every annotated field is in
ENCRYPTED_FIELDS. 8 index
`email_bounce_receipts (tenantId, recipient, receivedAt)`. Notes: Graph draft
orphan on /send failure → delete draft, FAILED; spike is a hard gate — failing
kind sends with bounce reading off.

### Confirmation round

Blocking items were folded into the spec as CA-1..CA-6. Re-asked the four agents
with blocking items: Frontend-Lead APPROVED (CA-1 resolves FE-1/FE-2),
Backend-Architect APPROVED (CA-2/CA-3/CA-6 resolve BE-1/2/3), Security-Lead
APPROVED (CA-4/CA-2/CA-3 resolve SEC-1/2), Test-Engineer APPROVED (CA-5 resolves
TE-1; smoke tests instead of ignore pragmas accepted). Consensus: 5/5, no
unresolved critical issue.
