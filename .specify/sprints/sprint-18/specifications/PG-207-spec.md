# Specification: PG-207 — Module Settings: Email

**Status:** APPROVED — `/spec-consensus` 5/5 APPROVED WITH MODIFICATIONS in
round 4; blocking items resolved by CA-1..CA-6 and re-confirmed 5/5 APPROVED
(2026-10-21) · **Sprint:** 18 · **Branch:** `feat/pg-207-email-settings` ·
**Base:** origin/main `3d285c261` · **Persona:** frontend-lead (lane) ·
**STOA:** foundation (row) + domain + security (migrations, tenant routers,
secrets, outbound network, OAuth)

## Overview

Users send email **from their own mailbox** and admins configure the email
module:

- Each user connects **their own mailbox**: Google (OAuth, Gmail API), Microsoft
  (OAuth, Graph) or any SMTP server (Gmail / Outlook presets + custom). An admin
  may connect one **company mailbox** and choose whether members without a
  mailbox may send through it.
- `email.sendEmail` and the server-side `forward` action really send, through
  the resolved mailbox. Today both go to the mock provider in production and
  record SENT for mail that never left (owner rulings Q6/Q10 — fixed here).
- Tenant settings: reply-to override, open/click tracking switches (take effect
  with IFC-221), bounce rules.
- A **bounce reader** scans each connected mailbox for delivery-status
  notifications, marks the matching emails bounced and maintains a per-tenant
  **suppression list**; suppressed recipients are skipped at send time.
- **Signatures** per user and per organisation on a real `/email/signatures`
  page; the default signature is prefilled in new messages.

Pages: `/email/email-settings` (rewrites the stub) and `/email/signatures`
(rewrites the stub).

### Owner rulings (binding, 2026-10-20/21)

`.specify/sprints/sprint-18/context/PG-207/PG-207-owner-ruling.md`:

| #   | Ruling                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Store SMTP/IMAP config (password encrypted, never returned) and send through it.                                                |
| Q2  | Signatures get their own page `/email/signatures`, linked from email settings.                                                  |
| Q3  | Bounce handling wired now (superseded in mechanism by Q6-Q8: read from the mailbox, not provider webhooks).                     |
| Q4  | A failed mailbox send is FAILED; never re-sent through the platform provider.                                                   |
| Q5  | Signature prefilled in compose (user default, else org default), editable; `sendEmail` appends nothing.                         |
| Q6  | Fix the fake send in PG-207. IntelliFlow's domain sends only IntelliFlow's own mail; user mail never leaves from it.            |
| Q7  | Per-user SMTP + tenant SMTP fallback + OAuth Gmail/Outlook (pulled in from PG-084).                                             |
| Q8  | Bounce reader scans the connected mailboxes for DSNs only (no general sync).                                                    |
| Q9  | Suppressed recipients are dropped and the rest sent; all suppressed → nothing sent.                                             |
| Q10 | Keep foundation + settings in one task/PR; PG-084 keeps entity-page compose wiring.                                             |
| Q11 | (asked at /plan-session) Compose attachments are uploaded to tenant storage and sent; an unfetchable attachment fails the send. |

Runner requirements R-1..R-8 (`PG-207-discussion.md`, "Runner requirements") are
folded into SEC-_ and AC-_ below.

### Row reconciliation (row vs main)

| Row says                                        | Reality / decision                                                                                                          |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| "SMTP/IMAP config per tenant"                   | Per-user mailboxes + one tenant mailbox (Q7). IMAP is used for bounce reading (Q8).                                         |
| "signatures per user/org"                       | `EmailSignature` USER/ORG on `/email/signatures` (Q2); prefill only (Q5).                                                   |
| "tracking pixel on/off"                         | Stored switches; category 2 → IFC-221 (no tracking consumer exists for user mail).                                          |
| "bounce handling rules"                         | Wired: DSN reader + rules + suppression (Q3, Q8, Q9).                                                                       |
| "TagsTab via forwardRef"                        | N/A — the email module has no tags entity; no parent/child open-state split exists (signature dialog is owned by its page). |
| "colorToken CHECK constraint"                   | N/A — no colour tokens on any PG-207 entity; none added.                                                                    |
| "AI defaults FALSE"                             | No AI toggles are added.                                                                                                    |
| "Zod superRefine for duplicate signature names" | AC-EM-034.                                                                                                                  |
| "verified by: pnpm test"                        | Full suites of every touched package (lane rule).                                                                           |
| Owner "Frontend Dev (STOA-Foundation)"          | Full-stack + security task; STOA foundation + domain + security.                                                            |
| Dependencies PG-178, PG-182                     | Verified below. PG-084 (Backlog) is re-scoped (Q10) — Category B rebaseline recorded at exec.                               |

## Related Documents

| Type             | Path                                                                                    | Status                      | Action                                                                  |
| ---------------- | --------------------------------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------- |
| PRD              | `docs/planning/prd-module-settings.md` (PG-207 Addendum)                                | Draft addendum              | Updated (US-EM1..8)                                                     |
| ADR              | `docs/architecture/adr/ADR-085-user-mailbox-sending-and-bounce-reading.md`              | Proposed → Accepted at exec | Created (number allocated by the runner)                                |
| ADR              | `docs/architecture/adr/ADR-041-email-outbound-provider.md`                              | Accepted                    | Referenced (platform provider stays for IntelliFlow's own mail only)    |
| ADR              | `docs/architecture/adr/ADR-069-rolling-wave-rebaselining-and-migration-risk-classes.md` | Accepted                    | Referenced (Class A gates; Category B rebaseline of PG-084)             |
| Playbook         | `docs/planning/module-settings-playbook.md`                                             | —                           | Followed (§1-§15; N/A items stated)                                     |
| Reference spec   | `.specify/sprints/sprint-18/specifications/PG-205-spec.md`                              | —                           | Pattern reference (router, migration, tests)                            |
| Reference spec   | PG-182 / PG-183 (playbook §14)                                                          | —                           | Pattern reference                                                       |
| Dependency chain | `docs/architecture/diagrams/complete-dependency-chains.md`                              | —                           | New "Email Settings & User Mailboxes (PG-207, ADR-085)" section at exec |

## Dependencies Verified (Phase 0.95)

| Dependency                             | Claim                                                                              | Verified                | Method                                                                                                                                                                                                                |
| -------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PG-178                                 | module settings layout + lead settings router                                      | TRUE                    | `leadSettings` registered `apps/api/src/router.ts:146`; attestation `.specify/sprints/sprint-16/attestations/PG-178/attestation.json` (TS gate exit 1/passed true excused; web typecheck re-run exit 0 on 2026-10-07) |
| PG-182                                 | contact-settings router, `$transaction` on destructive writes, no `skipDuplicates` | TRUE                    | `contact-settings.router.ts:88,92,117,158,176`; `contactSettings` `router.ts:12,147`                                                                                                                                  |
| IFC-144 (not a declared dep; adjacent) | "outbound email flows" Completed                                                   | **FALSE in production** | sendEmail falls back to the mock (`inbound.router.ts:34-44`, `outbound.ts:646`; Railway API has no `SENDGRID_API_KEY`). Fixed by this task (Q6); recorded as a finding (gh issue + debt ledger at exec).              |

## Decisions (Rounds 1–3)

Full log: `PG-207-discussion.md` (divergences V1-V9, challenges
C-FE/C-SEC/C-DT/C-BE, resolutions D1-D15).

## Technical Approach

### Data (Class A, additive — ADR-069)

Four migrations (names re-checked against origin/main at exec; other lanes hold
`20261019*`):

1. `20261020120000_email_mailboxes` — `email_mailboxes`, `email_oauth_states`.
2. `20261020120100_email_settings_signatures` — `tenant_email_settings`,
   `email_signatures`.
3. `20261020120200_email_suppression_receipts` — `email_suppressions`,
   `email_bounce_receipts`.
4. `20261020120300_email_record_message_ids` — nullable `email_records`
   columns + index.

Each new table: `tenantId` NOT NULL FK → tenants (cascade),
`ENABLE ROW LEVEL SECURITY` + the `app.current_tenant_id` policy block (pattern
`20261017120000_contact_types/migration.sql:97-115`), named CHECKs, SQL-only
partial unique indexes. All types added to the `packages/db/src/index.ts` export
allowlist.

**`EmailMailbox` (`email_mailboxes`)**

- `id`, `tenantId`, `scope` (`USER`|`TENANT`), `userId` (nullable, FK →
  users.id, set only from ctx), `kind` (`SMTP`|`GMAIL`|`MICROSOFT`), `status`
  (`ACTIVE`|`ERROR`|`DISCONNECTED`), `lastErrorCode` (nullable enum text),
  `fromAddress` (Text), `fromName` (nullable).
- SMTP kind: `smtpHost`, `smtpPort`, `smtpSecurity` (`SSL`|`STARTTLS`),
  `smtpUsername`, `smtpPassword` (`/// @encrypted`), and for bounce reading
  `imapHost`, `imapPort` (993), `imapUsername`, `imapPassword`
  (`/// @encrypted`) — IMAP fields optional; without them the mailbox's bounce
  reading is off and the UI says so.
- OAuth kinds: `accountAddress`, `refreshToken` (`/// @encrypted`),
  `grantedScopes` (Text[]), `tokenVersion` Int. Access tokens are never
  persisted.
- Bounce cursor + lease: `imapUidValidity`, `imapLastUid`, `scanCursorAt`,
  `nextScanAt`, `lockedUntil`, `failureCount`.
- Partial unique: `(tenantId, userId) WHERE scope='USER'`;
  `(tenantId) WHERE scope='TENANT'`.
- CHECKs: `(scope='USER') = (userId IS NOT NULL)`; ports
  `smtpPort IN (465,587,2525)`, `imapPort = 993`; per-kind required columns when
  `status='ACTIVE'`; `fromAddress` trimmed and containing `@`.
- `ENCRYPTED_FIELDS.EmailMailbox = ['smtpPassword','imapPassword','refreshToken']`
  and `ENCRYPTED_FIELDS.EmailOAuthState = ['codeVerifier']`; the
  `/// @encrypted` annotation total goes from 3 to **7**
  (`packages/db/src/__tests__/field-encryption.test.ts:63-66`) plus a parity
  assertion (every annotated field is in the map).

**`EmailOAuthState` (`email_oauth_states`)** — `stateHash` (sha256, unique),
`tenantId`, `userId`, `scope`, `provider`, `codeVerifier` (`/// @encrypted`),
`expiresAt` (10 min). Consumed with delete-returning; expired rows purged by the
scheduler.

**`TenantEmailSettings` (`tenant_email_settings`)** — singleton per tenant
(`tenantId` unique): `allowTenantMailboxFallback` (false), `replyToAddress`
(nullable), `trackOpens` (false), `trackClicks` (false), `hardBounceAction`
(`SUPPRESS`|`NONE`, default `SUPPRESS`), `softBounceThreshold` (1-10, default
3), `notifySenderOnBounce` (false). Missing row = defaults (no seeding
required).

**`EmailSignature` (`email_signatures`)** — `scope` (`USER`|`ORG`), `userId`
(nullable), `name` (≤ 100, trimmed), `html` (Text, ≤ 20 000 chars, sanitised),
`isDefault`. Unique `(tenantId, scope, coalesce(userId,''), lower(name))`; one
default per user `WHERE isDefault AND scope='USER'`, one per org
`WHERE isDefault AND scope='ORG'`. Max 20 signatures per owner scope (router
check).

**`EmailSuppression` (`email_suppressions`)** — `email` (CHECK
`email = lower(btrim(email))`), `reason`
(`HARD_BOUNCE`|`SOFT_BOUNCE_LIMIT`|`MANUAL`), `source` (`DSN`|`MANUAL`),
`emailRecordId` (nullable), `createdById` (nullable), timestamps. Unique
`(tenantId, email)`.

**`EmailBounceReceipt` (`email_bounce_receipts`)** — `mailboxId`, `dsnKey`
(provider message id / IMAP UIDVALIDITY:UID), `recipient` (lower),
`emailRecordId`, `kind` (`HARD`|`SOFT`|`DELAYED`|`UNMATCHED`), `statusCode`
(e.g. `5.1.1`), `diagnostic` (≤ 200 chars, control chars stripped),
`matchConfidence` (`HIGH`|`LOW`), `receivedAt`. Unique
`(mailboxId, dsnKey, recipient)` (idempotency; P2002 caught as no-op, never
`skipDuplicates`). Soft-bounce counts are derived from receipts within 30 days.
Retention: receipts purged after 90 days.

**`EmailRecord` additions** — `mailboxId` (nullable FK), `messageIdHeader`,
`provider` (`SMTP`|`GMAIL`|`MICROSOFT`), `providerMessageId`;
`@@index([tenantId, messageIdHeader])`. Per-recipient bounces in
`metadata.bouncedRecipients`; skipped recipients in
`metadata.skippedRecipients`; failure code in `metadata.sendErrorCode`.

### Domain (`packages/domain/src/email/`, zero infra deps; new barrel export)

- `email-constants.ts`: `MAILBOX_KINDS`, `MAILBOX_SCOPES`, `MAILBOX_STATUSES`,
  `SMTP_PORTS = [465,587,2525]`, `IMAP_PORT = 993`, `SUPPRESSION_REASONS`,
  `SIGNATURE_SCOPES`, `EMAIL_SETTINGS_ADMIN_ROLES` (reuse
  `ACCOUNT_OWNER_ADMIN_ROLES` values), `EMAIL_SETTINGS_DEFAULTS`,
  `EMAIL_LIMITS`, `MAILBOX_PRESETS` (Gmail `smtp.gmail.com:465` /
  `imap.gmail.com:993`; Outlook `smtp.office365.com:587` /
  `outlook.office365.com:993`).
- `resolve-sending-mailbox.ts`:
  `resolveSendingMailbox({ userMailbox, tenantMailbox, allowFallback, isAdmin })`
  → `{ mailbox } | { refusal: 'NO_MAILBOX' | 'MAILBOX_ERROR' }` (D1/D2).
- `partition-recipients.ts`: `partitionRecipients(to, cc, bcc, suppressed)` →
  `{ to, cc, bcc, skipped }` (case-insensitive, order-preserving,
  de-duplicated).
- `dsn-classification.ts`: `classifyDsnStatus(action, status)` →
  `HARD | SOFT | DELAYED | null`.
- `evaluate-bounce.ts`: `evaluateBounce(kind, rules, softCountIn30d)` →
  `{ suppress, reason }`.
- `resolve-default-signature.ts`: user default > org default > none.
- `email-address.ts`: `normalizeEmail`, `hasHeaderInjection` (CR/LF/NUL).

### Validators (`packages/validators/src/email-settings.ts`, `email-signatures.ts`, `email-mailbox.ts`)

- Strict schemas; enums from domain constants. Host: hostname only (no
  scheme/path/port/IP literal in private ranges, no
  `localhost`/`.local`/`.internal`/single-label). Ports from the allow-lists.
  Addresses `z.email()` + no CR/LF; `fromName` no CR/LF/`<>"`, ≤ 100.
- Password inputs on update: absent = keep, `null` = clear, string = set
  (1..512).
- `updateEmailSignaturesSchema` / list-level payloads end with `.superRefine`
  rejecting duplicate names (case-insensitive, trimmed) per owner scope with a
  "rows N and M" path (playbook §6).
- `sendEmail` input tightened (C-SEC6): subject ≤ 998 no CR/LF, ≤ 100 recipients
  total, html ≤ 2 MB, attachment `fileName` ≤ 255 no CR/LF/quote, attachments by
  storage path.

### Adapters (`packages/adapters`)

- `messaging/email/mime.ts`:
  `buildMime({from, to, cc, bcc, replyTo, subject, html, text, attachments, headers})`
  via nodemailer `MailComposer`; always sets `Message-ID` and
  `X-IntelliFlow-Record`.
- `messaging/email/smtp-provider.ts`: `SmtpMailboxTransport` with injected
  `lookup` + `createTransport`; `resolvePublicHost` (TCP pin: every resolved
  address public, connect to the pinned IP, `tls.servername` = host),
  `requireTLS` on 587, `secure` on 465, timeouts (connect 10 s, greeting 10 s,
  socket 20 s), errors mapped to codes (`AUTH_FAILED`, `CONNECT_FAILED`,
  `TLS_FAILED`, `TIMEOUT`, `REJECTED`, `RATE_LIMITED`) with no server text kept.
- `messaging/email/imap-dsn-reader.ts`: `imapflow` client via injected factory;
  port 993, TLS, read-only `EXAMINE INBOX`, `SEARCH` by UID > cursor and DSN
  shape, fetch ≤ 256 KB per message, ≤ 50 per scan, no flag changes.
- `messaging/email/dsn-parser.ts`: `parseDsn(raw)` on top of the in-repo MIME
  parser (`packages/adapters/src/messaging/email/inbound.ts`
  `parseMimeParts`/`parseHeaders`); requires
  `multipart/report; report-type=delivery-status`; caps size/parts/depth;
  returns per-recipient `{recipient, action, status, diagnostic}` +
  `X-IntelliFlow-Record` / original Message-ID from the `message/rfc822` or
  `text/rfc822-headers` part; never throws (unparseable → null).
- Gmail adapter: `sendRaw(tokens, mime)`, `listDsnSince(tokens, sinceMs, limit)`
  (`q` + `format=raw`), `getProfileAddress`, revoke via POST body; explicit
  scopes; PKCE params on `getAuthorizationUrl` / `exchangeCodeForTokens`.
- Outlook adapter: draft-then-send (`POST /me/messages` with
  `internetMessageHeaders` incl. `X-IntelliFlow-Record`, then `/send`), returns
  `id` + `internetMessageId`; `listDsnSince` (`receivedDateTime` filter +
  `/$value`); `/me` address; PKCE; authority `common` from config.
- `isPublicIpAddress` (`packages/domain/src/workflow/node-catalog.ts:581-624`)
  is rewritten to parse the address into canonical bytes (`node:net` `isIP` +
  manual expansion; domain stays dependency-free), check a CIDR table and unwrap
  IPv4-mapped (dotted **and** hex), NAT64 `64:ff9b::/96` and 6to4 `2002::/16` to
  the embedded IPv4; ranges added: 192.0.0.0/24, 192.0.2.0/24, 198.18.0.0/15,
  198.51.100.0/24, 203.0.113.0/24, 2001:db8::/32, expanded-zero loopback.
  Table-driven test, one case per range and form. Existing callers keep the same
  signature; the HTTP `resolveAndPin` is untouched.

### API (`apps/api`)

- `modules/email/mailbox-sender.ts`: `dispatchUserMail(ctx, message)` — the
  single path for user mail: verified user → resolve mailbox (domain) → load
  suppression set → partition → refuse if all suppressed →
  `reserveQuota(sent recipients only)` → create `EmailRecord` (PENDING,
  mailboxId) → build MIME → send via the mailbox transport → update SENT (+
  messageIdHeader/provider ids) or FAILED (+ code) → release quota on failure →
  flip mailbox to ERROR on auth/revoked errors. Adapters loaded lazily.
- `modules/email/inbound.router.ts`: module singleton (`:34-44`) and both call
  sites removed; `sendEmail` and the `forward` action call `dispatchUserMail`;
  `forward` moves to `verifiedTenantProcedure` and is metered; Sent filter adds
  `BOUNCED`, `FAILED`; list DTO exposes `status`; errors carry a machine code in
  `data.cause` (`NO_MAILBOX`, `MAILBOX_ERROR`, `ALL_SUPPRESSED`, `SEND_FAILED`);
  success returns `{ id, status, skipped }`.
- `modules/email/email-mailbox.router.ts` (`emailMailbox`): `getMine`,
  `getTenant` (admin), `saveSmtp` (own or tenant[admin]), `testConnection` (own
  or tenant[admin]; rate-limited 5/min/user), `oauthStart`, `oauthComplete`,
  `disconnect`, `providersAvailable` (which OAuth providers are configured in
  this environment).
- `modules/email/email-settings.router.ts` (`emailSettings`): `get` (members:
  secret-free DTO + `canEdit`), `update` (admin), `resetToDefaults` (admin;
  tenant settings only, `$transaction`; never touches mailboxes, signatures or
  suppressions), `suppression.list` / `add` / `remove` (admin; `remove` in
  `$transaction`, audited with counts only).
- `modules/email/email-signatures.router.ts` (`emailSignatures`): `list` (own
  USER + ORG, `canManageOrg`), `create`, `update`, `delete`, `setDefault`
  (`$transaction`: clear + set), `resolveDefault`.
- `modules/email/bounce-reader.ts` + `bounce-scheduler.ts`: env-gated (off in
  test/serverless, pattern
  `apps/api/src/agent/approval-sweep-scheduler.ts:15-23`), interval 10 min;
  claims due mailboxes with
  `UPDATE … WHERE lockedUntil < now() AND nextScanAt <= now() RETURNING`; per
  mailbox: list DSNs since cursor, parse, match (D5), write receipts + record
  status + suppression + optional notification in one `$transaction` per DSN;
  back-off on errors; ERROR after 5 consecutive failures; purges expired OAuth
  states and old receipts.
- `modules/email/email-automation.ts`: `notifyEmailBounced` (reads
  `notifySenderOnBounce`), new `email_bounced` notification type.
- Procedures use `tenantProcedure` / `verifiedTenantProcedure` + in-handler role
  checks (never `adminTenantProcedure`, which lacks CSRF/rate-limit middleware).
  All queries carry explicit `tenantId`.
- Registered as top-level `emailMailbox`, `emailSettings`, `emailSignatures` in
  `apps/api/src/router.ts`; `app-router.smoke.test.ts` updated.

### Web (`apps/web`)

| File                                                                              | Tag                                                                                                                      |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `app/email/email-settings/page.tsx`                                               | EXTENDS (stub → server page + Suspense)                                                                                  |
| `app/email/email-settings/EmailSettingsContent.tsx`                               | COMPOSES ModuleSettingsShell, SectionHeader, Card, Switch, Input, Select                                                 |
| `app/email/email-settings/EmailSettingsLoading.tsx`                               | NEW (justified: bento skeleton, playbook §1)                                                                             |
| `app/email/email-settings/components/MyMailboxCard.tsx`                           | NEW (justified: no shared mailbox-connection UI)                                                                         |
| `app/email/email-settings/components/SmtpMailboxForm.tsx`                         | NEW (justified; presets Select)                                                                                          |
| `app/email/email-settings/components/SecretField.tsx`                             | NEW (justified: `password-input.tsx` is dark/controlled login UI)                                                        |
| `app/email/email-settings/components/SuppressionListCard.tsx`                     | NEW (justified; lazy via `next/dynamic`)                                                                                 |
| `app/email/email-settings/components/OAuthReturnNotice.tsx`                       | NEW (justified; whitelisted query params)                                                                                |
| `app/email/oauth/callback/page.tsx`                                               | NEW (justified: OAuth redirect target that completes via authenticated tRPC)                                             |
| `app/email/signatures/page.tsx`, `SignaturesContent.tsx`, `SignaturesLoading.tsx` | EXTENDS stub; COMPOSES PageHeader, Card, EmptyState, ConfirmationDialog; REUSES TypeSettingsLoading                      |
| `app/email/signatures/components/SignatureDialog.tsx`                             | COMPOSES Dialog + Input + RichTextEditor + Switch (lazy)                                                                 |
| `app/email/compose/_compose-client.tsx`                                           | EXTENDS (resolveDefault query, render gate, prop)                                                                        |
| `components/email/EmailCompose.tsx`                                               | EXTENDS (`initialSignatureHtml` prop; coded error banner; skipped toast)                                                 |
| `components/email/InlineCompose.tsx`                                              | EXTENDS (coded errors; skipped toast)                                                                                    |
| `components/email/send-errors.ts`                                                 | NEW (justified: shared code→message map for 2 callers)                                                                   |
| `components/email/EmailListItem.tsx`, `EmailMessage.tsx`                          | EXTENDS (status badge)                                                                                                   |
| `components/email/EmailSettingsPanel.tsx`, `components/sidebar/configs/email.ts`  | EXTENDS (description copy)                                                                                               |
| `components/shared/module-settings-shell.tsx`                                     | EXTENDS (optional `hideActions` prop for read-only viewers; default unchanged; shell test + its consumers' suites rerun) |

## Runtime Wiring & Replacement Paths

| Surface                                                | Must Be Called By                                                                                                   | Replaces / Blocks                                                                           | Notes                                                                                                                                     |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `dispatchUserMail`                                     | `email.sendEmail`, `email.processEmail` (forward)                                                                   | module `outboundEmailService` singleton + mock fallback (`inbound.router.ts:34-44,516,742`) | singleton deleted; grep-test asserts no `createOutboundEmailService` in `modules/email`                                                   |
| `emailMailbox.*`                                       | `MyMailboxCard`, `SmtpMailboxForm`, company mailbox card, `/email/oauth/callback`                                   | —                                                                                           | `oauthComplete` only from the callback page                                                                                               |
| `emailSettings.*`                                      | `EmailSettingsContent`, `SuppressionListCard`                                                                       | —                                                                                           |                                                                                                                                           |
| `emailSignatures.list/create/update/delete/setDefault` | `SignaturesContent`, `SignatureDialog`                                                                              | stub page                                                                                   |                                                                                                                                           |
| `emailSignatures.resolveDefault`                       | `_compose-client.tsx`                                                                                               | —                                                                                           | prefill only (Q5)                                                                                                                         |
| bounce scheduler                                       | `startApiServer` in `apps/api/src/http-server.ts:562-568`, after `containerReady` (same site as the approval sweep) | —                                                                                           | env-gated; deps from `createBounceReaderDeps()` (pattern `createDefaultSweepDeps`), wired through `container.ts` per `apps/api/CLAUDE.md` |
| `notifyEmailBounced`                                   | bounce reader                                                                                                       | —                                                                                           | flag `notifySenderOnBounce`                                                                                                               |
| Gmail/Outlook adapter OAuth + send                     | `email-mailbox.router.ts`, `mailbox-sender.ts`, bounce reader                                                       | `composeRawMessage` path for user mail; adapter default scopes                              | first production callers (C-SEC0)                                                                                                         |
| `getEmailSendError`                                    | `EmailCompose`, `InlineCompose`                                                                                     | generic "Failed to send" (`EmailCompose.tsx:178-180,204-206`, `InlineCompose.tsx:127-129`)  |                                                                                                                                           |

## Navigation & Reachability

| Route                   | Sidebar Entry                                                                                                       | Parent Link                                          | Breadcrumb             | Reachable?                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------ |
| `/email/email-settings` | `apps/web/src/components/sidebar/configs/email.ts:10` (`email-settings`, icon `tune`) + `EmailSettingsPanel.tsx:14` | compose "Connect your mailbox" link; signatures page | Email / Email Settings | YES                                                                                  |
| `/email/signatures`     | `email.ts:11` (`signatures`, icon `draw`) + `EmailSettingsPanel.tsx`                                                | Signatures card on email settings                    | Email / Signatures     | YES                                                                                  |
| `/email/oauth/callback` | none (OAuth redirect target, not a destination)                                                                     | provider redirect only                               | —                      | N/A by design; documented in `navigation-reachability-audit.md` as a redirect target |

Registries updated at exec: `docs/design/sitemap.md`,
`navigation-reachability-audit.md`, `PAGE_MAP_AND_FLOWS.md`, `page-registry.md`
(Section 13 rows + count), `ui-flow-mapping.md`, `content-audit.md` + results.

## Boolean toggles (playbook §8)

| Toggle                                           | Category | Runtime consumer                                         |
| ------------------------------------------------ | -------- | -------------------------------------------------------- |
| `TenantEmailSettings.allowTenantMailboxFallback` | 1        | `resolveSendingMailbox` in `dispatchUserMail`            |
| `TenantEmailSettings.notifySenderOnBounce`       | 1        | `notifyEmailBounced` in the bounce reader                |
| `TenantEmailSettings.trackOpens`                 | 2        | IFC-221 broadened (pixel injection on all mailbox kinds) |
| `TenantEmailSettings.trackClicks`                | 2        | IFC-221 broadened (link wrapping on all mailbox kinds)   |
| `EmailSignature.isDefault`                       | 1        | `resolveDefault` → compose prefill                       |
| `hardBounceAction` (enum, not Boolean)           | 1        | `evaluateBounce` in the bounce reader                    |

No AI toggles.

## Acceptance Criteria

**Mailboxes**

- AC-EM-001: A user can connect exactly one personal mailbox: Google, Microsoft
  or SMTP (Gmail/Outlook presets + custom). An admin can connect one company
  mailbox. Other users' mailboxes are never visible or usable.
- AC-EM-002: SMTP save validates host (public hostname only), port
  (465/587/2525), security, username, password, From address and name; IMAP
  fields optional (993 only).
- AC-EM-003: Secrets (SMTP/IMAP passwords, refresh token, PKCE verifier) are
  encrypted at rest via `ENCRYPTED_FIELDS`; saving a secret is refused
  (PRECONDITION_FAILED) when the encryption key is absent.
- AC-EM-004: No procedure returns a secret; the DTO exposes only
  `hasPassword`/`connected` booleans; password update semantics keep/clear/set.
- AC-EM-005: "Test connection" authenticates without sending, reports a coded
  result, is rate-limited, and uses the same SSRF-pinned connect path as
  sending.
- AC-EM-006: OAuth connect uses PKCE + single-use hashed state (10 min)
  completed by an authenticated call from the callback page; the state must
  belong to the calling user/tenant; scopes are exactly the ADR-085 lists; the
  stored address comes from the provider profile/id_token (verified).
- AC-EM-007: Disconnect revokes at the provider (best effort, POST body),
  deletes all secrets, sets DISCONNECTED.
- AC-EM-008: When a provider's OAuth client is not configured in the
  environment, its Connect button is disabled with the reason as visible text.
- AC-EM-009: A refresh failure with `invalid_grant` (or an auth error on send)
  sets the mailbox to ERROR with a code; rotated refresh tokens are written with
  a `tokenVersion` compare-and-set.

**Sending**

- AC-EM-010: `sendEmail` and server `forward` send only through
  `dispatchUserMail`; the mock provider and the platform provider are never used
  for user mail.
- AC-EM-011: Mailbox resolution: own ACTIVE mailbox → else (no own mailbox)
  tenant mailbox if `allowTenantMailboxFallback` or the sender is an admin →
  else NO_MAILBOX. Own mailbox in ERROR/DISCONNECTED → MAILBOX_ERROR (no
  fallback).
- AC-EM-012: From = the mailbox's `fromAddress` (SMTP) or verified
  `accountAddress` (OAuth), never `ctx.user.email` and never request input.
  Reply-To = tenant `replyToAddress` when set, else none.
- AC-EM-013: A transport failure records FAILED with a coded reason, releases
  the reserved quota, returns SEND_FAILED, and never retries through another
  mailbox/provider (Q4).
- AC-EM-014: An email is SENT only after the transport accepted it; the stored
  record carries `mailboxId`, `provider`, `messageIdHeader` and, where
  available, `providerMessageId`.
- AC-EM-015: Suppressed recipients (to/cc/bcc, case-insensitive) are dropped
  before quota; the response lists them in `skipped`; quota counts only sent
  recipients; all suppressed → ALL_SUPPRESSED, nothing reserved, no record.
- AC-EM-016: Attachments are fetched only from tenant storage by path and sent;
  a fetch failure fails the send.
- AC-EM-017: Every outgoing message carries `Message-ID` and
  `X-IntelliFlow-Record`; MIME built by `MailComposer` (RFC 2047 subjects, no
  header injection).
- AC-EM-018: Compose shows an inline, linked message for NO_MAILBOX /
  MAILBOX_ERROR, keeps the draft, and shows the skipped recipients after a
  partial send; same for InlineCompose.
- AC-EM-019: `forward` requires a verified user and is metered like `sendEmail`.

**Tenant settings**

- AC-EM-020: Admin roles (`ADMIN`, `MANAGER`, `OWNER`, `SUPER_ADMIN`) edit
  tenant settings; members read a secret-free DTO with `canEdit=false`; tenant
  mailbox host/username and the suppression list are admin-only.
- AC-EM-021: Defaults: fallback off, tracking off, hard bounce SUPPRESS, soft
  threshold 3, notify off, no reply-to.
- AC-EM-022: Reset to Defaults restores tenant settings only, in a
  `$transaction`; mailboxes, signatures and suppressions are preserved; the
  dialog says exactly that.
- AC-EM-023: Tracking switches are stored and labelled as taking effect with
  IFC-221.

**Bounces & suppression**

- AC-EM-024: The scheduler is off in test/serverless, claims mailboxes by lease
  (no double scan across replicas), backs off on errors, sets ERROR after 5
  consecutive failures.
- AC-EM-025: Only `multipart/report; report-type=delivery-status` messages are
  processed; size/part/depth caps; nothing rendered; only status code + ≤
  200-char diagnostic stored; no other mail content stored.
- AC-EM-026: A DSN applies only if it matches an `EmailRecord` sent from that
  mailbox within 30 days (by `X-IntelliFlow-Record`, then Message-ID) and names
  one of its recipients; LOW-confidence matches never suppress.
- AC-EM-027: Hard bounce → receipt + (`hardBounceAction=SUPPRESS`) suppression
  `HARD_BOUNCE`; soft → receipt and suppression `SOFT_BOUNCE_LIMIT` when the
  30-day soft count reaches the threshold; `delayed` → receipt only.
- AC-EM-028: A record is BOUNCED when every recipient hard-bounced; otherwise
  `metadata.bouncedRecipients`; the UI shows "Bounced" / "Partly bounced" /
  "Failed" badges; Sent includes BOUNCED and FAILED.
- AC-EM-029: Re-processing the same DSN is a no-op (unique receipt, P2002
  caught).
- AC-EM-030: With `notifySenderOnBounce`, the sender gets an `email_bounced`
  notification.
- AC-EM-031: Admins list, add (MANUAL) and remove suppressions; audit entries
  carry ids/counts, never addresses.

**Signatures**

- AC-EM-032: Users manage their own USER signatures; admin roles manage ORG
  signatures; others see ORG signatures read-only.
- AC-EM-033: Signature HTML is sanitised server-side on save (allow-list,
  https/mailto links, https images, no `data:`/`javascript:`, ≤ 20 000 chars)
  and again on prefill.
- AC-EM-034: Duplicate names (case-insensitive, trimmed) per owner scope are
  rejected by a Zod `superRefine` and by the DB unique index (P2002 → CONFLICT).
- AC-EM-035: At most one default per user and one per org (`setDefault` in
  `$transaction`; partial unique index).
- AC-EM-036: New messages prefill user default > org default > none; replies,
  forwards and reopened drafts are not prefilled; nothing is injected after
  mount; `sendEmail` appends nothing.

**Cross-cutting**

- AC-EM-037: Every procedure is tenant-scoped; each mutation has a cross-tenant
  negative test (foreign id → NOT_FOUND, no write); a user cannot act on another
  user's mailbox or signature in the same tenant.
- AC-EM-038: Both pages follow the playbook (PageHeader/ModuleSettingsShell,
  bento grid, canonical EmptyState `phase="passive"`, Title Case `size="sm"`
  CTAs, Save disabled when not dirty, skeletons mirroring the bento).
- AC-EM-039: WCAG 2.1 AA (axe clean in tests + a11y-expert review); Lighthouse ≥
  90 on both routes or NEEDS_HUMAN with the reason.
- AC-EM-040: Registries, PRD addendum, ADR-085, dependency chain, CSV (incl.
  PG-084 re-scope note, IFC-221 broadening) updated.

### Non-functional

- NF-001: `sendEmail` adds ≤ 1 settings read + 1 mailbox read + 1 suppression
  query before the transport call.
- NF-002: Bounce scan ≤ 50 messages per mailbox per run, ≤ 256 KB per message,
  10-minute interval.
- NF-003: Connection timeouts: connect 10 s, greeting 10 s, socket 20 s.
- NF-004: New deps pinned exactly, ≥ 14 days old at pin time, `pnpm audit` + OSV
  clean, licences allowed.
- NF-005: Web bundle: TipTap dialog and suppression table lazy-loaded.

## Accessibility requirements (A11Y)

- A11Y-01: One h1 per page; each card a `section aria-labelledby` with an h2.
- A11Y-02: Every field labelled; errors `aria-invalid` + `aria-describedby`;
  focus moves to the first invalid field on failed save.
- A11Y-03: Status (mailbox, record badges) conveyed by text, not colour alone.
- A11Y-04: Connect/test/disconnect results announced through one
  `aria-live="polite"` region; OAuth return notice `role="status"` /
  `role="alert"` with a dismiss button.
- A11Y-05: Disabled Connect shows its reason as visible text; read-only cards
  carry "Managed by your admin" linked by `aria-describedby`.
- A11Y-06: Dialogs trap focus and restore it; delete/disconnect confirmations
  name the item.

## Security requirements (SEC)

- SEC-01 Encryption at rest + refuse without key (AC-EM-003). Test: real-DB raw
  select shows `v1:` ciphertext; `findFirst` returns plaintext; annotation
  count + `ENCRYPTED_FIELDS` entry assertions.
- SEC-02 Write-only DTO: no output of any procedure contains a secret
  (serialised-output test with a runtime-built fixture secret) and the type has
  no secret keys (`expectTypeOf`).
- SEC-03 Never logged: logger + audit spies across save/test/send/refresh/error
  paths assert the fixture secret and tokens never appear; nodemailer/OAuth
  errors mapped to codes before logging.
- SEC-04 SSRF: save-time host validation + connect-time resolve-all-public +
  pin + SNI; extended private ranges; ports allow-listed; test with mocked
  `node:dns`.
- SEC-05 TLS only; no `rejectUnauthorized:false` anywhere under `modules/email`
  or `messaging/email` (grep test).
- SEC-06 Header injection: CR/LF rejected in subject, names, addresses,
  filenames; MIME built by `MailComposer`.
- SEC-07 OAuth: PKCE S256, hashed single-use state bound to user+tenant, env
  redirect URI, hard-coded post-connect route, whitelisted return params,
  explicit minimal scopes (test asserts exact scope strings), fixed provider
  hosts, revoke by POST.
- SEC-08 Isolation: mailbox resolved only from
  `{tenantId, userId: ctx.user.userId}`; cross-tenant and cross-user negatives
  per mutation; RLS integration checks on every new table.
- SEC-09 DSN spoofing: AC-EM-026 rules; caps; no rendering; no content stored.
- SEC-10 Signature sanitisation server-side (sanitize-html allow-list) + client
  DOMPurify on prefill; XSS corpus test.
- SEC-11 Rate limits: `testConnection` 5/min/user; per-mailbox hourly send cap
  (default 100) with RATE_LIMITED code.
- SEC-12 PII: suppression addresses lower-cased, audit without addresses;
  receipts purged after 90 days; DSAR gap tracked (gh issue + debt ledger).
- SEC-13 Fixtures built at runtime (`'x'.repeat(n)`, `*.example.invalid`,
  runtime keys); local secret scan before every commit.

## Test Requirements

New (TDD RED first):

- Domain:
  `packages/domain/src/email/__tests__/{resolve-sending-mailbox,partition-recipients,dsn-classification,evaluate-bounce,resolve-default-signature,email-address}.test.ts`;
  `packages/domain/src/workflow/__tests__/` additions for the extended
  `isPublicIpAddress` ranges.
- Validators:
  `packages/validators/src/__tests__/{email-settings,email-signatures,email-mailbox}.test.ts`
  (superRefine duplicates, hosts, ports, CR/LF, password semantics, strict
  keys).
- Adapters:
  `packages/adapters/src/messaging/email/__tests__/{mime,smtp-provider,imap-dsn-reader,dsn-parser}.test.ts`;
  `packages/adapters/src/email/gmail/__tests__/` and `outlook/__tests__/`
  additions (sendRaw, draft→send, listDsnSince, PKCE, scopes, revoke POST) —
  fetch stubbed.
- API:
  `apps/api/src/modules/email/__tests__/{mailbox-sender,email-mailbox.router,email-settings.router,email-signatures.router,bounce-reader,bounce-scheduler,email-automation,no-secret-leak}.test.ts`;
  `apps/api/src/__tests__/app-router.smoke.test.ts` (new routers).
- DB: `packages/db/src/__tests__/field-encryption.test.ts` (count + entries).
- Integration: `tests/integration/email-settings.test.ts` (applies the four
  migration SQL files itself; CHECKs, partial uniques, RLS on every new table,
  encryption round trip, receipt idempotency, cross-tenant FK mismatch).
- Web:
  `app/email/email-settings/__tests__/{EmailSettingsContent,SecretField,MyMailboxCard,OAuthReturnNotice}.test.tsx`,
  `app/email/signatures/__tests__/{SignaturesContent,SignatureDialog}.test.tsx`,
  `app/email/oauth/callback/__tests__/page.test.tsx`,
  `app/email/compose/__tests__/compose-client.prefill.test.tsx`,
  `components/email/__tests__/{send-errors,EmailListItem.status}.test.tsx` —
  axe-core on every state.

Existing regression suites (rerun; updated honestly, no assertion removed):
`apps/api/src/modules/email/__tests__/*` (incl. `inbound.quota-guard`,
`inbound.router.b11`, `inbound.router`, `inbound.router.webhook-hmac`),
`packages/adapters` email + gmail + outlook suites, `packages/db`
field-encryption, `apps/web/src/components/email/__tests__/*` (`EmailCompose`,
`email-coverage.supplementary`, `EmailPage*`, `email-test-utils` mock extended),
`apps/web/src/app/email/__tests__/_layout-shell.test.tsx`,
`apps/web/src/app/__tests__/{sitemap,sitemap-reconciliation,sitemap-fixes,ia-reconciliation,ui-flow-mapping-reconciliation}.test.ts`,
`tools/scripts/route-total-consistency.test.ts`, content-audit + docs-integrity
tests, nav-wiring + page-doc co-change preflights, notifications type-count test
(`packages/validators/src/__tests__/notifications.test.ts`).

Full suites of every touched package (`pnpm --filter <pkg> test`) through the
slot wrapper; DB-backed runs with `--exclusive intelliflow-db`; Node 22 for DB
writes.

## Risks & Mitigations

| Risk                                                                                                   | Mitigation                                                                                   |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Message-ID / X-header not preserved by Gmail or Graph → DSNs unmatched                                 | Exec spike per kind before relying on it; LOW-confidence fallback never suppresses           |
| Google restricted scope (`gmail.readonly`) needs verification; Testing-mode tokens expire after 7 days | NEEDS_HUMAN: owner registers/verifies apps; UI shows "not configured"; documented in ADR-085 |
| Users lose the ability to send until they connect a mailbox                                            | Intentional (Q6); clear compose banner + link; tenant fallback opt-in                        |
| Encryption key missing in an environment                                                               | Saves refused; production has `PRISMA_FIELD_ENCRYPTION_KEY` (Railway API, checked by name)   |
| Large PR (Q10)                                                                                         | Commits split by layer; codex review iterated; full suites per package                       |
| New deps (supply chain)                                                                                | Exact pins ≥ 14 days, audit/OSV, licence check                                               |
| Other lanes edit the same registries/counts                                                            | Change only PG-207's rows; rebase before ship                                                |
| Spoofed DSNs suppress contacts                                                                         | AC-EM-026 matching rules                                                                     |
| Concurrency (two replicas scanning)                                                                    | Lease claim per mailbox                                                                      |

## Out of scope (tracked)

- General inbound mailbox sync (reading normal mail into IntelliFlow):
  **PG-084** ("Replace activity-derived email list with real email integration
  data") — PG-084 is re-scoped at exec to keep inbound sync + entity-page
  compose.
- Open/click tracking pixel and link wrapping: **IFC-221** (broadened to every
  mailbox kind).
- DSAR erasure of email records/suppressions: gh issue + debt ledger at exec
  (cited in the findings doc).

## Consensus amendments (binding; adopted from the Round 4 votes)

BLOCKING items raised in the votes, each resolved by an amendment below (author
in brackets):

- CA-1 [FE-1] `ModuleSettingsShell` gains an optional `hideActions` prop;
  non-admins get the shell without Save/Reset. My mailbox renders outside the
  shell's `<fieldset disabled={isSaving}>` [FE-2].
- CA-2 [SEC-2, BE-1] `requireEncryptionKey()` guard runs before every secret
  write (SMTP/IMAP save, OAuth complete, refresh-token rotation, OAuth state
  creation); key absent → PRECONDITION_FAILED and nothing written; tested with
  the key unset. AC-EM-003 is enforced by this guard, not by the extension.
- CA-3 [SEC-3, SEC-4, BE-2] Secrets are written only by top-level
  `email_mailboxes` / `email_oauth_states` Prisma create/update/updateMany with
  plain-string `data` (arch test bans `{ set:` and raw SQL on these columns);
  lease claim SQL returns `id` only; DTOs are allow-list mappers, never a spread
  row; the serialised-output leak test covers create and update returns; OAuth
  state is read through Prisma (decrypting the verifier) and then deleted with a
  `deleteMany` guarded on `(id, tenantId, userId, provider)` count = 1 (single
  use).
- CA-4 [SEC-1, BE-4] SSRF predicate rewritten (see Adapters); every connect
  (test, send, IMAP) resolves once, checks every address and connects to the
  checked address with SNI = host (no second lookup); save-time validation
  rejects all IP literals, numeric host forms (`0x7f.1`, decimal integers) and
  non-ASCII (IDN) hosts.
- CA-5 [TE-1] Annotation total 7, `ENCRYPTED_FIELDS.EmailOAuthState`, parity
  test [BE-7].
- CA-6 [BE-3] Scheduler starts in `startApiServer` (`http-server.ts:562-568`)
  with `createBounceReaderDeps()`.

Non-blocking modifications adopted:

- CA-7 Compose [FE-3/4]: `_compose-client.tsx` renders `EmailCompose` only after
  `resolveDefault` settles (and, for reply/forward, after the original loads);
  `initialSignatureHtml` is DOMPurify-sanitised and folded into `initialBody` at
  the forward-quote site; a template insert replaces the body and the signature
  is re-appended after it.
- CA-8 Errors [FE-5/6]: NO_MAILBOX / MAILBOX_ERROR / ALL_SUPPRESSED /
  SEND_FAILED render as a visible `role="alert"` banner that receives focus; the
  skipped list goes to the visible notice and the aria-live region.
- CA-9 [FE-7] `status` added to `EmailItemData`; badge text + icon.
- CA-10 [FE-8] Callback page: loading, error with a link back to settings, and a
  ref-guard so StrictMode's double effect calls `oauthComplete` once.
- CA-11 [FE notes] Both pages wrap content in their own `h-full overflow-y-auto`
  container (email layout has none).
- CA-12 [DOM-1] Grep test: no `createOutboundEmailService`, `useMock` or
  `MockEmailProvider` under `modules/email`; the `(adapters as any)` cast goes
  with the singleton.
- CA-13 [DOM-2] `EmailStatus` already has BOUNCED/FAILED
  (`schema.prisma:3999-4007`) — no enum migration; `bouncedAt` set when a record
  flips to BOUNCED.
- CA-14 [DOM-3] `EMAIL_SETTINGS_ADMIN_ROLES = ACCOUNT_OWNER_ADMIN_ROLES` +
  identity test.
- CA-15 [DOM-4/5/6/7] Soft count includes the current DSN (threshold 3 → third
  suppresses); only receipts after the latest suppression removal for that
  address count; the 30-day match window is measured from `EmailRecord.sentAt`
  (later DSNs → UNMATCHED receipt); `hardBounceAction=NONE` still records
  receipts and BOUNCED status.
- CA-16 [DOM-8/9] `resolveDefault` returns sanitised HTML; fallback sends keep
  `EmailRecord.userId` = the sender, and the bounce notification goes to that
  user.
- CA-17 [SEC-6] `id_token` `aud`/`nonce`/`email_verified` verified (Google);
  Microsoft address from `mail`/`preferred_username`.
- CA-18 [SEC-7] DSN accepted only when the record header **and** the original
  Message-ID both match (or, for kinds where the spike shows the Message-ID is
  rewritten, the provider message id read back at send); ≤ 25 suppressions per
  scan; replay after a MANUAL removal is a no-op (test).
- CA-19 [SEC-8/9] Diagnostic text: email-shaped substrings redacted before
  storing, escaped on render, never in notification HTML.
- CA-20 [BE-6] `dispatchUserMail` releases the quota reservation on every
  failure after reserving (record creation, attachment fetch, transport).
- CA-21 [BE-8] Index `email_bounce_receipts (tenantId, recipient, receivedAt)`.
- CA-22 [BE notes] Graph: delete the draft when `/send` fails. The D5 spike is a
  hard gate: a kind that fails it sends normally with bounce reading shown as
  off.
- CA-23 [TE-2..8] quota-guard / b11 / router suites mock `dispatchUserMail` and
  keep their reserve/release assertions (sent-only quota); coverage targets
  domain > 95 %, application > 90 %, diff ≥ 80 % with **no ignore pragmas**
  (lane rule L2) — scheduler wiring and page shells get smoke tests; injected
  clock / pinned fake timers for every time window; integration test modelled on
  `tests/integration/contact-types.test.ts`, run with
  `--exclusive intelliflow-db`, including a concurrent lease-claim race;
  scheduler state and the testConnection limiter resettable between tests; one
  shared runtime fixture helper for secrets.

## Agent Sign-offs

| Agent             | Verdict                                                    | Files verified (abridged)                                                                                                                                                                               |
| ----------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend-Lead     | APPROVED WITH MODIFICATIONS (FE-1 blocking → CA-1)         | `module-settings-shell.tsx:43-79,139-170`, `page-header.tsx:18-34`, `EmailCompose.tsx:95-101,170-206,316-325,370-383`, `_compose-client.tsx:36-71`, `EmailListItem.tsx:8-19`, `_layout-shell.tsx:45-67` |
| Backend-Architect | APPROVED WITH MODIFICATIONS (BE-1/2/3 blocking → CA-2/3/6) | `inbound.router.ts:33-44,516,742`, `http-server.ts:557-568`, `field-encryption.ts:33-36,116-191,205-239`, `client.ts:16,157-159`, `quota-guard.ts:102-114`                                              |
| Security-Lead     | APPROVED WITH MODIFICATIONS (SEC-1/2 blocking → CA-4/2)    | `node-catalog.ts:581-624`, `field-encryption.ts:126,244-272`, `client.ts:16-18,157-159`, `inbound.router.ts:34-44`                                                                                      |
| Domain-Expert     | APPROVED WITH MODIFICATIONS                                | `schema.prisma:3958-4007`, `territory-constants.ts:273`, `case-type-defaults.ts:40`, `prd-module-settings.md:1051-1082`                                                                                 |
| Test-Engineer     | APPROVED WITH MODIFICATIONS (TE-1 blocking → CA-5)         | `field-encryption.test.ts:63-66`, `inbound.router.b11.test.ts:28`, `inbound.quota-guard.test.ts:18`, `scripts/pre-ship.mjs:455-506`                                                                     |

Approval 5/5 (100 %). Confirmation round (2026-10-21): Frontend-Lead APPROVED
(CA-1), Backend-Architect APPROVED (CA-2/3/6), Security-Lead APPROVED
(CA-2/3/4), Test-Engineer APPROVED (CA-5/23); Domain-Expert had no blocking
item. No unresolved critical issue.
