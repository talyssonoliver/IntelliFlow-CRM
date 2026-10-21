# Execution Plan: PG-207 — Module Settings: Email (user mailboxes, bounce reading, signatures)

**Spec:** `.specify/sprints/sprint-18/specifications/PG-207-spec.md` (APPROVED,
`/spec-consensus` 5/5 + confirmation round) · **Sprint:** 18 · **Branch:**
`feat/pg-207-email-settings` · **Owner rulings:**
`.specify/sprints/sprint-18/context/PG-207/PG-207-owner-ruling.md` (Q1-Q11; Q11
= attachments wired now, asked in this session) · **ADR:** ADR-085 (Proposed →
Accepted at Step 31) · **PRD:** `docs/planning/prd-module-settings.md` (PG-207
Addendum, Draft → In Progress → Delivered)

> **PRISMA MIGRATIONS (L13):** four additive Class A migrations —
> `packages/db/prisma/migrations/20261020120000_email_mailboxes/`,
> `20261020120100_email_settings_signatures/`,
> `20261020120200_email_suppression_receipts/`,
> `20261020120300_email_record_message_ids/`. Production apply is manual
> (`prisma migrate deploy`) and must happen **before** the API is promoted.
> Called out in the final report, attestation, PR body and the runner message.
> Folder timestamps are re-checked against `origin/main` at Step 7.

> **NEW DEPENDENCIES:** `nodemailer@10.0.15` (published 2026-10-05, MIT-0) +
> `@types/nodemailer`, `imapflow@2.2.6` (2026-10-06, MIT),
> `sanitize-html@2.18.0` (2026-09-30, MIT) + `@types/sanitize-html`. Exact pins;
> the root override `"nodemailer": ">=10.0.9"` (`package.json:254`) becomes
> `"10.0.15"` so it cannot float to 10.1.7 (published 2026-10-18, under the
> 14-day bar). `pnpm audit` + OSV at Step 29.

**Hexagonal layer order:** Domain → Validators → Database → Adapters → API
(application wiring) → UI → docs. **Dependency chain:** new "Email Settings &
User Mailboxes (PG-207, ADR-085)" section (Step 30). **Prerequisites:** PG-178
✅, PG-182 ✅ (verified in the spec, Phase 0.95).

## Runner constraints (apply to every step)

- Node 22: prefix every command with
  `export PATH=/c/Users/talys/AppData/Roaming/nvm/v22.14.0:$PATH; export NODE_OPTIONS=--max-old-space-size=8192;`
  (host default Node 25 hangs pg writes).
- One test process at a time. Single-file vitest runs may run directly; full
  package suites, builds and DB tests go through
  `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-207 -- <cmd>`;
  DB-backed runs add `--exclusive intelliflow-db`.
- `@intelliflow/web`'s `test` script is watch mode → web runs always use
  `vitest run`.
- `pnpm --filter` always uses `./` paths.
- Never pipe a gate into `tail`/`head`; write logs to
  `artifacts/logs/pg-207/*.txt` (never `*.log`, lane L14).
- Commits small and per layer, staged by name, `-F <file>`, hooks on, no AI
  attribution; `gitleaks protect --staged` before every commit. No secret-shaped
  strings: secrets in tests come from one helper
  `apps/api/src/test/pg207-fixtures.ts` (`'x'.repeat(n)`, `*.example.invalid`,
  runtime `randomBytes`).
- Never `.env.local` `DATABASE_URL`/`DIRECT_URL`. `.env.test` targets
  `localhost:5433/intelliflow_test`.
- **No `istanbul ignore` / `v8 ignore` pragmas** (lane L2). Unreachable branches
  are deleted; wiring gets smoke tests.
- A RED claim needs a saved failing log; every recorded timestamp comes from
  `date -u`.

## Preflight Checks

1. [ ] `git fetch origin && git log --oneline origin/main -1` recorded; branch
       rebased if behind; worktree clean.
2. [ ] `docker ps --filter name=postgres-test` → healthy.
3. [ ] Packages built:
       `ls packages/domain/dist packages/validators/dist packages/db/dist packages/adapters/dist`.
4. [ ] Baseline typecheck: `pnpm --filter ./apps/api typecheck`,
       `pnpm --filter ./apps/web typecheck` → exit 0 saved to
       `artifacts/logs/pg-207/00-baseline-typecheck.txt`.
5. [ ] Baseline email suites green:
       `pnpm --dir apps/api exec vitest run src/modules/email` and
       `pnpm --dir apps/web exec vitest run src/components/email src/app/email`
       → saved.
6. [ ] CSV status `Plan Complete → In Progress` (exec Phase 0).
       (`context_ack.json` is created in Step 1.)

## Implementation Reality Checks

| Surface                                                             | Production Consumer                                                               | Replaces / Blocks                                                                          | Verification Command                                                                                                                                                        |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dispatchUserMail` (`apps/api/src/modules/email/mailbox-sender.ts`) | `email.sendEmail`, `email.processEmail` forward                                   | module singleton + mock fallback (`inbound.router.ts:34-44,516,742`)                       | `pnpm --dir apps/api exec vitest run src/modules/email/__tests__/arch-guards.test.ts` (no `createOutboundEmailService`/`useMock`/`MockEmailProvider` under `modules/email`) |
| `emailMailbox.*`                                                    | `MyMailboxCard`, `SmtpMailboxForm`, `CompanyMailboxCard`, `/email/oauth/callback` | —                                                                                          | `pnpm --dir apps/web exec vitest run src/app/email`                                                                                                                         |
| `emailSettings.*`                                                   | `EmailSettingsContent`, `SuppressionListCard`                                     | stub page                                                                                  | same                                                                                                                                                                        |
| `emailSignatures.*`                                                 | `SignaturesContent`, `SignatureDialog`, `_compose-client.tsx` (`resolveDefault`)  | stub page                                                                                  | same                                                                                                                                                                        |
| `emailAttachments.upload`                                           | `EmailCompose` attach flow                                                        | local-only `File[]` never sent (`EmailCompose.tsx:113,591-605`)                            | `pnpm --dir apps/web exec vitest run src/components/email/__tests__/EmailCompose.attachments.test.tsx`                                                                      |
| bounce scheduler                                                    | `startApiServer` (`apps/api/src/http-server.ts:562-568`)                          | —                                                                                          | `pnpm --dir apps/api exec vitest run src/__tests__/http-server.bounce-scheduler.test.ts`                                                                                    |
| `notifyEmailBounced`                                                | bounce reader                                                                     | —                                                                                          | `pnpm --dir apps/api exec vitest run src/modules/email/__tests__/email-automation.test.ts`                                                                                  |
| Gmail/Outlook OAuth + `sendRaw`/draft-send + `listDsnSince`         | `email-mailbox.router.ts`, `mailbox-sender.ts`, `bounce-reader.ts`                | adapter default scopes; `composeRawMessage` for user mail                                  | `pnpm --dir packages/adapters exec vitest run src/email`                                                                                                                    |
| `getEmailSendError`                                                 | `EmailCompose`, `InlineCompose`                                                   | generic "Failed to send" (`EmailCompose.tsx:178-180,204-206`, `InlineCompose.tsx:127-129`) | `pnpm --dir apps/web exec vitest run src/components/email/__tests__/send-errors.test.ts`                                                                                    |
| `isPublicIpAddress` (rewritten)                                     | `resolvePublicHost` (SMTP/IMAP), existing workflow callers                        | old octet-pair logic (`node-catalog.ts:581-624`)                                           | `pnpm --dir packages/domain exec vitest run src/workflow/__tests__/public-ip-address.test.ts`                                                                               |
| `ModuleSettingsShell.hideActions`                                   | `EmailSettingsContent` (non-admin)                                                | —                                                                                          | `pnpm --dir apps/web exec vitest run src/components/shared/__tests__/module-settings-shell.test.tsx`                                                                        |

## Boolean toggles (playbook §8, required by §14)

| Toggle                       | Category | Consumer (step)                                              |
| ---------------------------- | -------- | ------------------------------------------------------------ |
| `allowTenantMailboxFallback` | 1        | `resolveSendingMailbox` via `dispatchUserMail` (Steps 2, 15) |
| `notifySenderOnBounce`       | 1        | `notifyEmailBounced` in the bounce reader (Steps 17, 18)     |
| `trackOpens`                 | 2        | IFC-221 broadened (Step 31 CSV)                              |
| `trackClicks`                | 2        | IFC-221 broadened (Step 31 CSV)                              |
| `EmailSignature.isDefault`   | 1        | `resolveDefault` → compose prefill (Steps 16, 24)            |

## Estimated Effort

### Files Summary

Counted mechanically from every `**Files to Create:**` / `**Files to Modify:**`
block in this plan (unique paths): **Files to Create: 108 · Files to Modify: 56
· Total: 164.**

| Phase (steps)                                                                         | Create  | Modify             | Estimate                                                                                                                         |
| ------------------------------------------------------------------------------------- | ------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| 0 Spike + context ack (1)                                                             | 2       | 0                  | 0.5-1 h                                                                                                                          |
| 1-2 Domain + validators (2-5)                                                         | 22      | 5                  | 4-5 h                                                                                                                            |
| 3 DB: schema, 4 migrations, encryption, integration test (6-8)                        | 5       | 4                  | 3-4 h                                                                                                                            |
| 4 Adapters: deps, MIME, SMTP, IMAP, DSN, Gmail, Outlook, storage (9-14)               | 14      | 10                 | 7-9 h                                                                                                                            |
| 5 API: guard, transport, sender, 4 routers, reader, scheduler, rewire, wiring (15-19) | 29      | 9                  | 10-12 h                                                                                                                          |
| 6 Web: shell, 2 pages, callback, compose, list (20-25)                                | 33      | 12                 | 10-12 h                                                                                                                          |
| 7 Refactor (26)                                                                       | 0       | 0 (already listed) | 1-2 h                                                                                                                            |
| 8 Docs, reviews, gates, evidence (27-31)                                              | 3       | 16                 | 5-7 h                                                                                                                            |
| **Total**                                                                             | **108** | **56**             | **40-52 h** (row PERT 180/360/540 min is exceeded — scope widened by owner rulings Q6-Q11; recorded in the CSV notes at Step 31) |

## Dependencies Verified

| Dependency         | Claim                                                                              | Verified                            | Method                                                                   |
| ------------------ | ---------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------ |
| PG-178             | module settings layout + lead settings router                                      | TRUE                                | `leadSettings` registered `apps/api/src/router.ts:146` (spec Phase 0.95) |
| PG-182             | contact-settings router, `$transaction` on destructive writes, no `skipDuplicates` | TRUE                                | `contact-settings.router.ts:88,92,117,158,176`; `router.ts:12,147`       |
| IFC-144 (adjacent) | outbound flows Completed                                                           | FALSE in production (mock fallback) | fixed by Steps 15 and 19; finding tracked at Step 30                     |

## TDD Phase Map

Each implementation step below is internally RED → GREEN (tests written and run
failing first, log saved). The four TDD phases map onto the steps as follows:

### Phase 1 — RED

Failing tests first in every layer step: 2, 3, 4, 5, 6, 8, 10-13, 14, 15-18, 19
(companion cases), 20-24.

### Phase 2 — GREEN

Minimum implementation to pass, layer by layer: domain (2-3), validators (4-5),
DB (7-8), adapters (9-14), API (15-19), web (20-25).

### Phase 3 — REFACTOR

Step 26 (`/simplify`, duplication, dead branches deleted; scoped suites rerun).

### Phase 4 — VALIDATION

Steps 27-31 and the Validation Matrix (full suites per package, typecheck, lint,
build, audits, Lighthouse, reviews, attestation).

## Execution Steps

### Phase 0: SPIKE

#### Step 1: D5 header-survival spike (hard gate for the matcher)

**Type:** spike **Files to Create:**

- `.specify/sprints/sprint-18/execution/PG-207/spike-header-survival.md`
- `.specify/sprints/sprint-18/attestations/PG-207/context_ack.json` (CSV
  EVIDENCE; written at exec Phase 0 before the spike)

- [ ] Build one MIME with `X-IntelliFlow-Record` + our `Message-ID` via
      `MailComposer` (local, no network) and record the exact header bytes.
- [ ] If live Gmail/Microsoft test credentials exist in `.env.local`
      (`GMAIL_*`/`OUTLOOK_*` + a test refresh token), send one message to an
      `*.example.invalid` recipient and read the returned DSN; record survival
      per kind.
- [ ] If no credentials exist: record **NEEDS_HUMAN (live spike)**. Matcher
      stays in its fail-safe form (CA-18: both record header **and** original
      Message-ID must match; otherwise UNMATCHED, never suppress), so an
      unproven kind degrades to "bounce reading finds nothing" rather than false
      suppression.

### Phase 1: RED + GREEN — Domain (`packages/domain`)

#### Step 2: Email domain helpers (RED → GREEN)

**Type:** test + implementation **Files to Create:**

- `packages/domain/src/email/__tests__/resolve-sending-mailbox.test.ts`
- `packages/domain/src/email/__tests__/partition-recipients.test.ts`
- `packages/domain/src/email/__tests__/dsn-classification.test.ts`
- `packages/domain/src/email/__tests__/evaluate-bounce.test.ts`
- `packages/domain/src/email/__tests__/resolve-default-signature.test.ts`
- `packages/domain/src/email/__tests__/email-address.test.ts`
- `packages/domain/src/email/__tests__/email-constants.test.ts`
- `packages/domain/src/email/email-constants.ts`
- `packages/domain/src/email/resolve-sending-mailbox.ts`
- `packages/domain/src/email/partition-recipients.ts`
- `packages/domain/src/email/dsn-classification.ts`
- `packages/domain/src/email/evaluate-bounce.ts`
- `packages/domain/src/email/resolve-default-signature.ts`
- `packages/domain/src/email/email-address.ts`
- `packages/domain/src/email/index.ts` **Files to Modify:**
- `packages/domain/src/index.ts` (barrel export)

Test cases (each a checkbox in the test file, written first, run RED and saved):

- [ ] resolve: own ACTIVE → own; no own + tenant ACTIVE + fallback on → tenant;
      no own + fallback off + admin → tenant; no own + fallback off + member →
      `NO_MAILBOX`; own ERROR/DISCONNECTED → `MAILBOX_ERROR` (never tenant); no
      mailboxes → `NO_MAILBOX`; tenant mailbox ERROR → `NO_MAILBOX` (AC-EM-011,
      D1/D2).
- [ ] partition: empty lists; duplicates across to/cc/bcc de-duplicated;
      case-insensitive match; order preserved; all suppressed → all skipped
      (AC-EM-015).
- [ ] classify: `failed`+`5.x.x` → HARD; `failed`+`4.x.x` → SOFT; `delayed` →
      DELAYED; `delivered`/`relayed`/ `expanded`/garbage → null.
- [ ] evaluateBounce: HARD + SUPPRESS → suppress HARD_BOUNCE; HARD + NONE → no
      suppress; SOFT count (incl. current) 2 of threshold 3 → no; 3 of 3 →
      suppress SOFT_BOUNCE_LIMIT; thresholds 1 and 10 boundaries; DELAYED →
      never (AC-EM-027, CA-15).
- [ ] default signature: user default > org default > null; non-default ignored.
- [ ] email-address: `normalizeEmail` trims + lower-cases; `hasHeaderInjection`
      true for `\r`, `\n`, `\0`.
- [ ] constants: `EMAIL_SETTINGS_ADMIN_ROLES` `toBe(ACCOUNT_OWNER_ADMIN_ROLES)`
      (CA-14); `SMTP_PORTS` = `[465,587,2525]`; `IMAP_PORT` = 993; defaults
      table equals AC-EM-021; presets (Gmail/Outlook) hosts/ports.

**Validation:**

- [ ] RED log `artifacts/logs/pg-207/02-domain-red.txt` (module-not-found /
      assertion failures).
- [ ] `pnpm --dir packages/domain exec vitest run src/email` → green.
- [ ] `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-207 -- pnpm --filter ./packages/domain build`.

#### Step 3: SSRF predicate rewrite (RED → GREEN)

**Type:** test + implementation **Files to Create:**

- `packages/domain/src/workflow/__tests__/public-ip-address.test.ts` **Files to
  Modify:**
- `packages/domain/src/workflow/node-catalog.ts` (`isPublicIpAddress`,
  `isPrivateIpv4`, `isPrivateIpv6` → canonical byte parse + CIDR table +
  mapped/NAT64/6to4 unwrap; signature unchanged)

- [ ] Table-driven cases, one per range and form: 10/8, 127/8, 169.254/16,
      172.16/12, 192.168/16, 100.64/10, 0/8, 224/4, 240/4, 192.0.0/24,
      192.0.2/24, 198.18/15, 198.51.100/24, 203.0.113/24; `::`, `::1`,
      `0:0:0:0:0:0:0:1`, `fc00::/7`, `fe80::/10`, `ff00::/8`, `2001:db8::/32`;
      `::ffff:127.0.0.1`, `::ffff:7f00:1`, `64:ff9b::7f00:1`, `2002:7f00:1::`;
      public controls (`8.8.8.8`, `2606:4700::1111`).
- [ ] Existing regression:
      `pnpm --dir packages/domain exec vitest run src/workflow` (incl.
      `custom-node-types.test.ts`).

### Phase 2: RED + GREEN — Validators (`packages/validators`)

#### Step 4: Email settings / mailbox / signature schemas

**Type:** test + implementation **Files to Create:**

- `packages/validators/src/__tests__/email-settings.test.ts`
- `packages/validators/src/__tests__/email-mailbox.test.ts`
- `packages/validators/src/__tests__/email-signatures.test.ts`
- `packages/validators/src/email-settings.ts`
- `packages/validators/src/email-mailbox.ts`
- `packages/validators/src/email-signatures.ts` **Files to Modify:**
- `packages/validators/src/index.ts`

- [ ] Hosts: reject scheme/path/port, every IP literal, numeric forms (`0x7f.1`,
      `2130706433`), non-ASCII (IDN), `localhost`, `*.local`, `*.internal`,
      single-label (CA-4); accept `smtp.gmail.com`.
- [ ] Ports: SMTP 465/587/2525 only; IMAP 993 only.
- [ ] Addresses: `z.email()`, CR/LF rejected; `fromName` rejects CR/LF and
      `<>"`, ≤ 100.
- [ ] Password semantics: absent = keep, `null` = clear, string 1..512.
- [ ] Settings update strict; `softBounceThreshold` 1..10; `hardBounceAction`
      enum; unknown keys rejected.
- [ ] Signatures: name trimmed 1..100; html ≤ 20 000; `superRefine` rejects
      duplicate names (case-insensitive, trimmed) per scope with path "rows N
      and M" pointing at the second (AC-EM-034).
- [ ] `sendEmail` input schema (exported for the router): subject ≤ 998 no
      CR/LF; ≤ 100 recipients; html ≤ 2 MB; attachments as
      `{ storagePath, fileName ≤ 255 no CR/LF/quote, contentType, size }`
      (C-SEC6).
- [ ] `pnpm --dir packages/validators exec vitest run src/__tests__/email-settings.test.ts src/__tests__/email-mailbox.test.ts src/__tests__/email-signatures.test.ts`.

#### Step 5: `email_bounced` notification type

**Type:** test + implementation **Files to Modify:**

- `packages/validators/src/notifications.ts`
- `packages/validators/src/__tests__/notifications.test.ts` (length 55 → 56)

(The web side of `email_bounced` — `notification-utils.ts`, notifications
settings page — is in Step 24.)

- [ ] `pnpm --dir packages/validators exec vitest run src/__tests__/notifications.test.ts`.
- [ ] `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-207 -- pnpm --filter ./packages/validators build`.

### Phase 3: RED + GREEN — Database (`packages/db`)

#### Step 6: Encryption map + annotation tests (RED)

**Type:** test **Files to Modify:**

- `packages/db/src/__tests__/field-encryption.test.ts` (annotation total 3 → 7;
  `ENCRYPTED_FIELDS.EmailMailbox` = `smtpPassword, imapPassword, refreshToken`;
  `EmailOAuthState` = `codeVerifier`; parity: every annotated field is in the
  map)

#### Step 7: Schema + migrations (GREEN)

**Type:** implementation **Files to Modify:**

- `packages/db/prisma/schema.prisma` (`EmailMailbox`, `EmailOAuthState`,
  `TenantEmailSettings`, `EmailSignature`, `EmailSuppression`,
  `EmailBounceReceipt`, `EmailRecord` +
  `mailboxId`/`messageIdHeader`/`provider`/ `providerMessageId`, back-relations
  on `Tenant`/`User`)
- `packages/db/src/field-encryption.ts` (`ENCRYPTED_FIELDS`)
- `packages/db/src/index.ts` (export allowlist) **Files to Create:**
- `packages/db/prisma/migrations/20261020120000_email_mailboxes/migration.sql`
- `packages/db/prisma/migrations/20261020120100_email_settings_signatures/migration.sql`
- `packages/db/prisma/migrations/20261020120200_email_suppression_receipts/migration.sql`
- `packages/db/prisma/migrations/20261020120300_email_record_message_ids/migration.sql`

- [ ] Re-check newest folder on `origin/main`
      (`git ls-tree --name-only origin/main packages/db/prisma/migrations/`);
      bump timestamps if another lane landed later.
- [ ] Each table: `tenantId` FK cascade; RLS `ENABLE` + policy block (pattern
      `20261017120000_contact_types/migration.sql:97-115`); named CHECKs
      (scope/user, ports 465/587/2525 & 993, per-kind required columns when
      ACTIVE, `email = lower(btrim(email))`, threshold 1..10, html ≤ 20000, name
      ≤ 100); partial uniques (one USER mailbox per user, one TENANT per tenant,
      one default per user / per org, `lower(name)` per owner scope); receipt
      unique `(mailboxId, dsnKey, recipient)` + index
      `(tenantId, recipient, receivedAt)` (CA-21); `email_records` index
      `(tenantId, messageIdHeader)`.
- [ ] No enum migration: `EmailStatus` already has BOUNCED/FAILED (CA-13).
- [ ] `pnpm --filter ./packages/db exec prisma validate` and `prisma generate`;
      generate migration SQL with
      `prisma migrate diff --from-schema-datasource … --to-schema-datamodel …`
      against the **local test DB only**, then hand-add CHECKs/partial
      indexes/RLS.
- [ ] Apply locally: `pnpm --filter ./packages/db exec prisma migrate deploy`
      with `DATABASE_URL` from `.env.test` (guard
      `tools/scripts/guard-db-target.mjs` must report local).
- [ ] `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-207 --exclusive intelliflow-db -- pnpm --filter ./packages/db test`
      → field-encryption test GREEN.
- [ ] `pnpm --filter ./packages/db build`.

#### Step 8: Integration test (RED → GREEN)

**Type:** test **Files to Create:**

- `tests/integration/email-settings.test.ts` (pattern
  `tests/integration/contact-types.test.ts:15-110`; applies the four migration
  SQL files itself because CI uses `db push`)

- [ ] CHECKs and partial uniques reject bad rows; RLS on all six new tables
      hides tenant B rows from tenant A (`SET LOCAL ROLE authenticated`, pattern
      `contact-types.test.ts:370-394`); encryption round trip (raw select
      `^v1:`, `findFirst` plaintext) with a runtime `randomBytes(32)` key;
      receipt replay → P2002; concurrent lease claim — two
      `UPDATE … RETURNING id` race, exactly one wins; cross-tenant `userId`
      mismatch rejected by the router path (D15).
- [ ] `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-207 --exclusive intelliflow-db -- pnpm vitest run tests/integration/email-settings.test.ts`.

### Phase 4: RED + GREEN — Adapters (`packages/adapters`)

#### Step 9: Dependencies

**Type:** config **Files to Modify:**

- `packages/adapters/package.json` (`nodemailer` 10.0.15, `imapflow` 2.2.6,
  devDeps `@types/nodemailer`)
- `apps/api/package.json` (`sanitize-html` 2.18.0, devDeps
  `@types/sanitize-html`)
- `package.json` (override `"nodemailer": "10.0.15"`)
- `pnpm-lock.yaml`

- [ ] `pnpm install --frozen-lockfile=false` then
      `pnpm install --frozen-lockfile` clean; licence check
      (`pnpm licenses list --filter ./packages/adapters`).

#### Step 10: MIME builder + public-host resolver

**Type:** test + implementation **Files to Create:**

- `packages/adapters/src/messaging/email/__tests__/mime.test.ts`
- `packages/adapters/src/messaging/email/__tests__/public-host.test.ts`
- `packages/adapters/src/messaging/email/mime.ts`
- `packages/adapters/src/messaging/email/public-host.ts`

- [ ] MIME: From/To/Cc/Bcc/Reply-To, RFC 2047 non-ASCII subject, `Message-ID`
      and `X-IntelliFlow-Record` always present, attachments base64-wrapped,
      header injection impossible (CR/LF input throws before build).
- [ ] `resolvePublicHost(host, port, { lookup })`: one lookup, every address
      public, returns `{ address, servername }`; rejects mixed answers, private
      answers, disallowed ports; `node:dns` never called in tests (injected
      `lookup`).

#### Step 11: SMTP mailbox transport

**Type:** test + implementation **Files to Create:**

- `packages/adapters/src/messaging/email/__tests__/smtp-provider.test.ts`
- `packages/adapters/src/messaging/email/smtp-provider.ts`

- [ ] Injected `createTransport`: options carry pinned `host` = checked address,
      `tls.servername` = original host; TLS mode keyed on `smtpSecurity` (W6):
      `SSL` → `secure: true`, `STARTTLS` → `secure: false, requireTLS: true`;
      tested for 465/SSL, 587/STARTTLS, 2525/SSL and 2525/STARTTLS; timeouts
      10/10/20 s; never `rejectUnauthorized:false`.
- [ ] `send(mime)` success → `{ messageId }`; `verify()` for test connection.
- [ ] Error mapping to
      `AUTH_FAILED`/`CONNECT_FAILED`/`TLS_FAILED`/`TIMEOUT`/`REJECTED`/`RATE_LIMITED`;
      the mapped error never contains the fixture password, username or server
      text (SEC-03).
- [ ] One test asserting the default factory wiring passes options to
      `nodemailer.createTransport` (no ignore).

#### Step 12: DSN parser + IMAP DSN reader

**Type:** test + implementation **Files to Create:**

- `packages/adapters/src/messaging/email/__tests__/dsn-parser.test.ts`
- `packages/adapters/src/messaging/email/__tests__/imap-dsn-reader.test.ts`
- `packages/adapters/src/messaging/email/__tests__/dsn-fixtures.ts` (runtime
  `makeDsn({ status, action, recipient, recordId, messageId })`,
  `*.example.invalid`)
- `packages/adapters/src/messaging/email/dsn-parser.ts`
- `packages/adapters/src/messaging/email/imap-dsn-reader.ts` **Files to
  Modify:**
- `packages/adapters/src/messaging/email/inbound.ts` (export
  `parseMimeParts`/`parseHeaders` if not exported)

- [ ] Parser: RFC 3464 multipart/report → per-recipient
      `{recipient, action, status, diagnostic}` + record header + original
      Message-ID from `message/rfc822` or `text/rfc822-headers`; Gmail-style and
      Exchange-style variants; `delayed`; non-report mail → null; oversize/too
      many parts/too deep → null; never throws; diagnostic ≤ 200 chars, control
      chars stripped, email-shaped substrings redacted (CA-19).
- [ ] IMAP reader with injected `createImapClient`: connects to pinned address
      on 993 with SNI, `EXAMINE` (read-only), UID > cursor, UIDVALIDITY change
      resets cursor, ≤ 50 messages, ≤ 256 KB each, no flag writes, logout in
      `finally`; auth failure → `AUTH_FAILED` without secrets.

#### Step 13: Gmail + Outlook adapter extensions

**Type:** test + implementation **Files to Create:**

- `packages/adapters/src/email/gmail/__tests__/client.pg207.test.ts`
- `packages/adapters/src/email/outlook/__tests__/client.pg207.test.ts` **Files
  to Modify:**
- `packages/adapters/src/email/gmail/client.ts` (PKCE params on
  `getAuthorizationUrl`/`exchangeCodeForTokens`, explicit scopes via config,
  `prompt` unchanged only when offline access needs it, `sendRaw(tokens, mime)`
  → `{ id, threadId }`, `listDsnSince(tokens, sinceMs, limit)` with `q` +
  `format=raw`, `getProfileAddress`, revoke as POST body)
- `packages/adapters/src/email/outlook/client.ts` (PKCE, `common` authority from
  config, draft-then-send with `internetMessageHeaders` incl.
  `X-IntelliFlow-Record`, returns `id` + `internetMessageId`, deletes the draft
  when `/send` fails, `listDsnSince` via `receivedDateTime` filter + `/$value`,
  `/me` address)

- [ ] `fetch` stubbed (pattern `gmail/__tests__/client.test.ts:26`); exact scope
      strings asserted (ADR-085 lists); fixed hosts only (`accounts.google.com`,
      `oauth2.googleapis.com`, `gmail.googleapis.com`,
      `login.microsoftonline.com`, `graph.microsoft.com`); revoke body not
      query; refresh with empty refresh token → error; Graph rotated refresh
      token returned.
- [ ] Existing regression:
      `pnpm --dir packages/adapters exec vitest run src/email`.

#### Step 14: Email attachment storage

**Type:** test + implementation

Lead decision (plan review E8): attachments do **not** go into the legal
`case-documents` bucket. They use a dedicated **private** bucket
`email-attachments` (name from `EMAIL_ATTACHMENTS_BUCKET`, default
`email-attachments`), created idempotently by the adapter on first use
(`getBucket` → `createBucket({ public: false })` with the service role). Path
`${tenantId}/${uuid}-${safeName}`. Retention: kept as long as the
`EmailAttachment` row (deleted with the email); recorded in the findings doc.
Port first (additive, application layer), then adapter (W9).

**Files to Modify:**

- `packages/application/src/ports/external/StorageServicePort.ts` (additive: new
  `EmailAttachmentStoragePort` interface; `StorageServicePort` unchanged)
- `packages/adapters/src/storage/SupabaseStorageAdapter.ts` (implements
  `EmailAttachmentStoragePort`:
  `uploadEmailAttachment(tenantId, buffer, fileName, contentType)`,
  `downloadEmailAttachment(tenantId, path)` refusing any path not prefixed with
  `${tenantId}/`)
- `packages/adapters/src/index.ts` (barrel: `mime`, `public-host`,
  `smtp-provider`, `dsn-parser`, `imap-dsn-reader`) **Files to Create:**
- `packages/adapters/src/storage/__tests__/SupabaseStorageAdapter.email.test.ts`

- [ ] Cross-tenant path refused; bucket created once (idempotent, private);
      storage client stubbed.
- [ ] `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-207 -- pnpm --filter ./packages/adapters test`
      (full suite) then `pnpm --filter ./packages/adapters build`.

### Phase 5: RED + GREEN — API (`apps/api`)

#### Step 15: Encryption guard + user-mail dispatcher (RED → GREEN)

**Type:** test + implementation **Files to Create:**

- `apps/api/src/test/pg207-fixtures.ts`
- `apps/api/src/modules/email/encryption-guard.ts` (`requireEncryptionKey()`)
- `apps/api/src/modules/email/mailbox-transport.ts` (per-kind send/verify;
  in-memory access-token cache per mailbox; refresh with `tokenVersion` CAS via
  `updateMany`; `invalid_grant`/auth errors → mailbox ERROR)
- `apps/api/src/modules/email/mailbox-sender.ts` (`dispatchUserMail`)
- `apps/api/src/modules/email/__tests__/encryption-guard.test.ts`
- `apps/api/src/modules/email/__tests__/mailbox-transport.test.ts`
- `apps/api/src/modules/email/__tests__/mailbox-sender.test.ts`
- `apps/api/src/__tests__/container.email-wiring.test.ts` **Files to Modify:**
- `apps/api/src/container.ts` (expose the existing `storageService`
  (`container.ts:349`) as `emailAttachmentStorage`, plus
  `createMailboxTransportFactory()` building SMTP/Gmail/Outlook transports from
  env OAuth client config)
- `apps/api/src/context.ts` (map `emailAttachmentStorage` + `mailboxTransports`
  into ctx services — not optional)

- [ ] Wiring (E3): `dispatchUserMail` and `emailAttachments.upload` read
      `ctx.services.emailAttachmentStorage` / `ctx.services.mailboxTransports`;
      `createBounceReaderDeps()` imports the same factories from `container.ts`;
      `container.email-wiring.test.ts` asserts both are instantiated and exposed
      through context.
- [ ] NF-001: query-count assertion — before the transport call exactly 1
      settings read, 1 mailbox read, 1 suppression query (prisma mock call
      counts).
- [ ] Order: verified → resolve mailbox → suppression lookup → partition → all
      suppressed → ALL_SUPPRESSED (no reserve, no record) → reserve quota for
      sent recipients → record PENDING (`mailboxId`, `userId` = sender) → fetch
      attachments (tenant path only) → MIME (From from mailbox row, Reply-To
      from settings) → send → SENT +
      `messageIdHeader`/`provider`/`providerMessageId`, or FAILED +
      `metadata.sendErrorCode`; quota released on every failure after reserve
      (record create, attachment fetch, transport) (CA-20); `skipped` returned.
- [ ] NO_MAILBOX / MAILBOX_ERROR / ALL_SUPPRESSED / SEND_FAILED carried in
      `TRPCError` `cause.code`.
- [ ] Never another mailbox or provider after a failure (AC-EM-013); per-mailbox
      hourly cap → RATE_LIMITED.
- [ ] Token refresh: CAS success, CAS lost → re-read, `invalid_grant` → ERROR;
      access token never persisted.
- [ ] Key unset → `requireEncryptionKey` throws PRECONDITION_FAILED (CA-2).

#### Step 16: Routers (RED → GREEN)

**Type:** test + implementation **Files to Create:**

- `apps/api/src/modules/email/email-mailbox.router.ts`
- `apps/api/src/modules/email/email-settings.router.ts`
- `apps/api/src/modules/email/email-signatures.router.ts`
- `apps/api/src/modules/email/email-attachments.router.ts`
- `apps/api/src/modules/email/signature-sanitizer.ts`
- `apps/api/src/modules/email/email-dto.ts` (allow-list mappers)
- `apps/api/src/modules/email/__tests__/email-mailbox.router.test.ts`
- `apps/api/src/modules/email/__tests__/email-settings.router.test.ts`
- `apps/api/src/modules/email/__tests__/email-signatures.router.test.ts`
- `apps/api/src/modules/email/__tests__/email-attachments.router.test.ts`
- `apps/api/src/modules/email/__tests__/signature-sanitizer.test.ts`
- `apps/api/src/modules/email/__tests__/no-secret-leak.test.ts`
- `apps/api/src/modules/email/__tests__/arch-guards.test.ts` **Files to
  Modify:**
- `apps/api/src/router.ts` (`emailMailbox`, `emailSettings`, `emailSignatures`,
  `emailAttachments`)
- `apps/api/src/__tests__/app-router.smoke.test.ts`

Per router: role contexts (pattern `contact-types.router.test.ts:91-97`),
`$transaction` mock (`mockImplementation(async fn => fn(prismaMock))`).

- [ ] Mailbox: `getMine`, `getTenant` (admin), `saveSmtp` (own / tenant[admin];
      key guard; SSRF validation; password keep/clear/set), `testConnection`
      (rate limit 5/min/user, resettable), `oauthStart` (state hash row + PKCE
      verifier, explicit scopes, env redirect URI; provider not configured →
      PRECONDITION_FAILED), `oauthComplete` (Prisma read → `deleteMany` count 1
      on `(id, tenantId, userId, provider)`; expired/foreign/replayed state →
      error; id_token `aud`/`nonce`/`email_verified`; stores `accountAddress` +
      encrypted refresh token), `disconnect` (revoke best-effort, nulls secrets,
      DISCONNECTED), `providersAvailable`.
- [ ] Settings: `get` (members: secret-free DTO, `canEdit`,
      `companyMailboxAvailable`), `update` (admin), `resetToDefaults` (admin,
      `$transaction`, tenant settings only), `suppression.list/add/remove`
      (admin; remove `$transaction`; audit counts only).
- [ ] Signatures: `list` (own USER + ORG, `canManageOrg`),
      `create/update/delete` (owner or admin for ORG; max 20; P2002 → CONFLICT;
      sanitised), `setDefault` (`$transaction` clear + set), `resolveDefault`
      (sanitised).
- [ ] Attachments: `upload` (verified; ≤ 10 MB each via
      `assertSizeAllowed`/`assertMimeAllowed` from
      `apps/api/src/modules/legal/document-policies.ts`; returns `storagePath`).
- [ ] Every mutation: cross-tenant FOREIGN id → NOT_FOUND, no write; user B
      cannot touch user A's mailbox/signature (AC-EM-037); denied calls assert
      `$transaction` not called.
- [ ] no-secret-leak: serialised output of every procedure (incl. create/update
      returns) never contains the fixture secret/token; logger + audit spies
      never receive them across save/test/send/refresh/error paths (SEC-02/03);
      `expectTypeOf` on every router output type proves no
      `smtpPassword`/`imapPassword`/`refreshToken`/ `codeVerifier` key (SEC-02).
- [ ] arch-guards: no `createOutboundEmailService`, `useMock`,
      `MockEmailProvider`, `rejectUnauthorized: false`, `adminTenantProcedure`
      (W2), `{ set:` on secret fields, or raw SQL naming secret columns under
      `apps/api/src/modules/email`; and no `rejectUnauthorized: false` under
      `packages/adapters/src/messaging/email` or `packages/adapters/src/email`
      (SEC-05, CA-3, CA-12).
- [ ] Procedure types (W2): reads on `tenantProcedure`, mutations on
      `verifiedTenantProcedure` (mailbox, attachments) or `tenantProcedure`
      (settings, signatures) with in-handler `EMAIL_SETTINGS_ADMIN_ROLES`
      checks; never `adminTenantProcedure`.
- [ ] Sanitizer XSS corpus (`<script>`, `onerror`, `javascript:`, `data:`, SVG,
      CSS `expression`/`url()`).

#### Step 17: Bounce reader + automation (RED → GREEN)

**Type:** test + implementation **Files to Create:**

- `apps/api/src/modules/email/bounce-reader.ts` (`runBounceScan(deps, now)`,
  `createBounceReaderDeps()`)
- `apps/api/src/modules/email/email-automation.ts` (`notifyEmailBounced`)
- `apps/api/src/modules/email/__tests__/bounce-reader.test.ts`
- `apps/api/src/modules/email/__tests__/email-automation.test.ts`

- [ ] Lease claim returns `id` only; per mailbox: list DSNs since cursor
      (kind-specific, injected), parse, match (record header **and** original
      Message-ID, same mailbox + tenant, `sentAt` within 30 days, recipient in
      the record) else UNMATCHED receipt; per DSN one `$transaction`: receipt,
      record BOUNCED + `bouncedAt` when every recipient hard-bounced else
      `metadata.bouncedRecipients`, suppression per `evaluateBounce` (soft count
      from receipts after the latest removal), ≤ 25 suppressions per scan;
      cursor advanced; failures → back-off, ERROR after 5; expired OAuth states
      and receipts > 90 days purged.
- [ ] Replay after MANUAL removal is a no-op; LOW-confidence never suppresses;
      `hardBounceAction=NONE` still records + BOUNCED (CA-15/18).
- [ ] `notifyEmailBounced` only when `notifySenderOnBounce`; recipient =
      `EmailRecord.userId`; diagnostic never in the notification body (CA-19).
- [ ] Injected clock (`now`) everywhere; no wall-clock dates in fixtures.

#### Step 18: Scheduler wiring

**Type:** test + implementation **Files to Create:**

- `apps/api/src/modules/email/bounce-scheduler.ts` (env-gated like
  `apps/api/src/agent/approval-sweep-scheduler.ts:15-23`;
  `bounceScanIntervalFromEnv`; state resettable for tests)
- `apps/api/src/modules/email/__tests__/bounce-scheduler.test.ts`
- `apps/api/src/__tests__/http-server.bounce-scheduler.test.ts` (pattern
  `http-server.approval-sweep.test.ts`) **Files to Modify:**
- `apps/api/src/http-server.ts` (start next to the approval sweep, `run` awaits
  `containerReady` then `runBounceScan(await createBounceReaderDeps())`)

- [ ] Off in test/serverless; start/stop; overlapping run skipped (fake timers).

#### Step 19: Rewire `sendEmail` and `forward`; retire the singleton

**Type:** test + implementation **Files to Modify:**

- `apps/api/src/modules/email/inbound.router.ts` (delete `:33-44` singleton +
  `(adapters as any)` cast; `sendEmail` → `dispatchUserMail`, input from
  validators, returns `{ id, status, skipped }`; `forward` →
  `verifiedTenantProcedure` path + metered via `dispatchUserMail`; Sent filter
  adds BOUNCED/FAILED; list DTO `status`)
- `apps/api/src/modules/email/__tests__/inbound.quota-guard.test.ts` (mock
  `../mailbox-sender`; keep reserve/release assertions, now
  sent-recipients-only)
- `apps/api/src/modules/email/__tests__/inbound.router.b11.test.ts` (mock
  `../mailbox-sender`)
- `apps/api/src/modules/email/__tests__/inbound.router.test.ts` (forward asserts
  dispatcher call + NO_MAILBOX path) **Files to Create:**
- `apps/api/src/modules/email/__tests__/inbound.send-dispatch.test.ts`

- [ ] List DTO (E4): `status` plus `bouncedRecipientCount` (count only, from
      `metadata.bouncedRecipients`); Sent filter test includes BOUNCED and
      FAILED.
- [ ] AC-EM-036 (W3): `inbound.send-dispatch.test.ts` asserts the MIME html
      equals the caller's `htmlBody` exactly (nothing appended).
- [ ] No assertion removed from the three existing files; each gets a companion
      case for the new path.
- [ ] `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-207 -- pnpm --filter ./apps/api test`
      (full suite; L5 flake `apps/workers/shared/health-server.test.ts` not in
      this package) → log saved.
- [ ] `pnpm --filter ./apps/api typecheck`.

### Phase 6: RED + GREEN — Web (`apps/web`)

#### Step 20: Shell `hideActions` + shared send errors

**Type:** test + implementation **Files to Modify:**

- `apps/web/src/components/shared/module-settings-shell.tsx` (optional
  `hideActions`)
- `apps/web/src/components/shared/__tests__/module-settings-shell.test.tsx`
  (create if absent; default unchanged + hidden case) **Files to Create:**
- `apps/web/src/components/email/send-errors.ts`
- `apps/web/src/components/email/__tests__/send-errors.test.ts`

- [ ] Rerun every ModuleSettingsShell consumer suite:
      `pnpm --dir apps/web exec vitest run src/app/tasks src/app/cases src/app/deals src/app/contacts src/app/accounts src/app/reports src/components/shared`.

#### Step 21: `/email/email-settings`

**Type:** test + implementation **Files to Modify:**

- `apps/web/src/app/email/email-settings/page.tsx` (stub → server page +
  Suspense)
- `apps/web/src/components/email/EmailSettingsPanel.tsx`,
  `apps/web/src/components/sidebar/configs/email.ts` (description copy) **Files
  to Create:**
- `apps/web/src/app/email/email-settings/EmailSettingsContent.tsx`
- `apps/web/src/app/email/email-settings/EmailSettingsLoading.tsx`
- `apps/web/src/app/email/email-settings/components/MyMailboxCard.tsx`
- `apps/web/src/app/email/email-settings/components/SmtpMailboxForm.tsx`
- `apps/web/src/app/email/email-settings/components/CompanyMailboxCard.tsx`
- `apps/web/src/app/email/email-settings/components/SecretField.tsx`
- `apps/web/src/app/email/email-settings/components/SuppressionListCard.tsx`
- `apps/web/src/app/email/email-settings/components/OAuthReturnNotice.tsx`
- `apps/web/src/app/email/email-settings/__tests__/EmailSettingsContent.test.tsx`
- `apps/web/src/app/email/email-settings/__tests__/EmailSettingsLoading.test.tsx`
- `apps/web/src/app/email/email-settings/__tests__/page.test.tsx`
- `apps/web/src/app/email/email-settings/components/__tests__/MyMailboxCard.test.tsx`
- `apps/web/src/app/email/email-settings/components/__tests__/SmtpMailboxForm.test.tsx`
- `apps/web/src/app/email/email-settings/components/__tests__/CompanyMailboxCard.test.tsx`
- `apps/web/src/app/email/email-settings/components/__tests__/SecretField.test.tsx`
- `apps/web/src/app/email/email-settings/components/__tests__/SuppressionListCard.test.tsx`
- `apps/web/src/app/email/email-settings/components/__tests__/OAuthReturnNotice.test.tsx`

- [ ] Layout per Round 3 card table (C-FE1): own `h-full overflow-y-auto`
      wrapper (CA-11); My mailbox outside the shell fieldset (CA-1); Company
      mailbox / Reply-to / Tracking (IFC-221 note) / Bounce rules on the shell
      Save; Signatures link card; Suppression list lazy (`next/dynamic`), admin
      only.
- [ ] `isDirty` from a normalised snapshot (`''`/`undefined` → `null`),
      refreshed from mutation `onSuccess(data)`; Save disabled when
      `!isDirty || isSaving || hasClientError`; non-admin: read-only cards +
      "Managed by your admin", `hideActions`.
- [ ] SecretField keep/replace/remove; `autoComplete="new-password"`; no stored
      value in the DOM.
- [ ] Presets Select (Gmail/Outlook/Custom) with app-password note; Test
      connection disabled while dirty; one `aria-live` region; disconnect
      ConfirmationDialog names the fallback.
- [ ] OAuth return: whitelisted `connected`/`error`, static messages,
      `role="status"`/`role="alert"`, dismiss, `router.replace` clears the
      query; unconfigured provider → disabled button with visible reason
      (AC-EM-008).
- [ ] A11Y-01: exactly one h1; each card `<section aria-labelledby>` with an h2
      (asserted by role queries).
- [ ] A11Y-02: invalid fields get `aria-invalid` + `aria-describedby` to the
      error; a failed save moves focus to the first invalid field (asserted with
      `document.activeElement`).
- [ ] A11Y-05: read-only note linked by `aria-describedby` on each disabled
      control; disabled Connect reason is visible text.
- [ ] A11Y-06: disconnect/remove/reset dialogs trap focus and restore it to the
      trigger on close.
- [ ] AC-EM-022 (W3): reset dialog copy asserts it lists what resets (tenant
      settings) and what is preserved (mailboxes, signatures, suppression list).
- [ ] NF-005 (W4): `SuppressionListCard` is imported through `next/dynamic`
      (test asserts the module is not in the initial render tree for non-admins
      and loads for admins).
- [ ] axe-core zero violations: loading, error, admin, member, empty suppression
      list (`EmptyState entity="emails"     phase="passive" size="sm"`, no
      action button; `emails` chosen because suppressions are email addresses
      and the `rules` entity reads as automation — I3).

#### Step 22: `/email/oauth/callback`

**Type:** test + implementation **Files to Create:**

- `apps/web/src/app/email/oauth/callback/page.tsx`
- `apps/web/src/app/email/oauth/callback/OAuthCallbackContent.tsx`
- `apps/web/src/app/email/oauth/callback/__tests__/OAuthCallbackContent.test.tsx`

- [ ] Suspense + `useSearchParams` (pattern
      `apps/web/src/app/settings/account/page.tsx:1-9`); ref guard → one
      `oauthComplete` under StrictMode; loading; error with link back; success →
      `router.replace('/email/email-settings?connected=google|microsoft')`.
- [ ] A11Y-01/04: one h1; status region `role="status"`, error `role="alert"`
      with focus moved to it.

#### Step 23: `/email/signatures`

**Type:** test + implementation **Files to Modify:**

- `apps/web/src/app/email/signatures/page.tsx` (stub → server page + Suspense)
  **Files to Create:**
- `apps/web/src/app/email/signatures/SignaturesContent.tsx`
- `apps/web/src/app/email/signatures/SignaturesLoading.tsx` (wraps
  `TypeSettingsLoading`)
- `apps/web/src/app/email/signatures/components/SignatureDialog.tsx` (lazy;
  RichTextEditor via `onCreate`, `key` per open, image prompt disabled)
- `apps/web/src/app/email/signatures/__tests__/SignaturesContent.test.tsx`
- `apps/web/src/app/email/signatures/__tests__/SignaturesLoading.test.tsx`
- `apps/web/src/app/email/signatures/__tests__/page.test.tsx`
- `apps/web/src/app/email/signatures/components/__tests__/SignatureDialog.test.tsx`

- [ ] PageHeader "New Signature" `size="sm"`; My / Organisation cards; Default
      badges as text; `canManageOrg` gating; EmptyState `entity="signatures"`
      with custom title/description and no action; delete ConfirmationDialog;
      CONFLICT shown on the name field (`aria-invalid` + `aria-describedby`,
      focus to the field — A11Y-02); one h1, cards `section aria-labelledby`
      (A11Y-01); dialog focus trap + restore (A11Y-06); `SignatureDialog` loaded
      via `next/dynamic` (NF-005 assertion); axe clean.

#### Step 24: Compose (prefill, errors, attachments) + list status

**Type:** test + implementation **Files to Modify:**

- `apps/web/src/app/email/compose/_compose-client.tsx` (render gate on
  `resolveDefault` + original email; prop)
- `apps/web/src/components/email/EmailCompose.tsx` (`initialSignatureHtml`
  sanitised into `initialBody`; signature re-appended after template insert;
  attachments uploaded via `emailAttachments.upload` before send and passed as
  storage paths; coded error banner `role="alert"` + focus + link; skipped
  notice + aria-live)
- `apps/web/src/components/email/InlineCompose.tsx` (coded errors; skipped
  toast)
- `apps/web/src/components/email/EmailListItem.tsx`,
  `apps/web/src/components/email/EmailMessage.tsx` (status badge text + icon),
  and the list DTO mapping in `apps/web/src/components/email/EmailPage.tsx`
- `apps/web/src/components/email/__tests__/email-test-utils.ts` (mock
  `emailSignatures.resolveDefault`, `emailAttachments.upload`)
- `apps/web/src/components/notifications/notification-utils.ts` (`email_bounced`
  label/icon)
- `apps/web/src/app/notifications/settings/page.tsx` (`email_bounced` preference
  row) **Files to Create:**
- `apps/web/src/app/email/compose/__tests__/compose-client.prefill.test.tsx`
- `apps/web/src/components/email/__tests__/EmailCompose.attachments.test.tsx`
- `apps/web/src/components/email/__tests__/EmailCompose.send-errors.test.tsx`
- `apps/web/src/components/email/__tests__/EmailListItem.status.test.tsx`

- [ ] Prefill: user > org > none; replies/forwards/reopened drafts not
      prefilled; untouched prefill not auto-saved.
- [ ] List (E4): `EmailItemData` gains `status` + `bouncedRecipientCount`;
      badges "Bounced", "Partly bounced", "Failed" (text + icon) tested in
      `EmailListItem.status.test.tsx`; icons limited to glyphs already in the
      subset (`error`, `report`, `warning`) or the subset regenerated (Step 29).
- [ ] Attachments: upload failure blocks send with a visible error; paths
      passed; nothing dropped silently.
- [ ] Existing suites:
      `pnpm --dir apps/web exec vitest run src/components/email src/app/email src/components/contacts`.

#### Step 25: Web full suite + typecheck

**Type:** validation

- [ ] `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-207 -- pnpm --filter ./apps/web exec vitest run`
      → log saved; `pnpm --filter ./apps/web typecheck`;
      `pnpm --filter ./apps/web lint`.

### Phase 7: REFACTOR

#### Step 26: Refactor + simplify

**Type:** refactor

No new files; touches only files already listed in Steps 2-24 (duplication,
naming, dead branches deleted).

- [ ] `/simplify` on the diff; rerun Steps 2-25 scoped commands; lint per
      package.

### Phase 8: VALIDATION + DOCS

#### Step 27: Registries and design docs

**Type:** docs **Files to Modify:**

- `docs/design/sitemap.md` (rows `:219-220` wording; callback page)
- `docs/design/navigation-reachability-audit.md` (`:296-297`; callback as
  redirect target)
- `docs/design/PAGE_MAP_AND_FLOWS.md` (`:248-249`)
- `docs/design/page-registry.md` (Section 13 rows + count)
- `docs/design/ui-flow-mapping.md` (`:423-424`, `:802,827`)
- `docs/design/content-audit.md` +
  `artifacts/reports/content-audit-results.json`
- `apps/web/src/app/__tests__/sitemap-reconciliation.test.ts` (TC-25 page count
  214 → 215 for the new callback `page.tsx`, with a PG-207 comment — N3)

Navigation & Reachability (W5): `/email/email-settings` and `/email/signatures`
are wired in `apps/web/src/components/sidebar/configs/email.ts:10-11` and
`EmailSettingsPanel.tsx`; signatures are also linked from the Signatures card on
email settings; compose links to email settings. `/email/oauth/callback` is a
provider redirect target, documented in `navigation-reachability-audit.md` as
such with the reason (no navigation entry by design); `docs/design/sitemap.md`
total-count wording updated for the new page; if `check-nav-wiring.mjs` flags
it, the callback is referenced from `oauthStart`'s redirect URI constant in
`apps/web/src/app/email/email-settings/components/MyMailboxCard.tsx`
documentation, not a fake link.

- [ ] Reconciliation suites:
      `pnpm --dir apps/web exec vitest run src/app/__tests__/sitemap.test.ts src/app/__tests__/sitemap-reconciliation.test.ts src/app/__tests__/sitemap-fixes.test.ts src/app/__tests__/ia-reconciliation.test.ts src/app/__tests__/ui-flow-mapping-reconciliation.test.ts`
      and
      `pnpm vitest run tools/scripts/route-total-consistency.test.ts tools/scripts/__tests__/content-audit.test.ts tools/scripts/__tests__/docs-integrity-audit.test.ts`.
- [ ] Preflights:
      `node tools/scripts/exec-preflight/check-nav-wiring.mjs PG-207`,
      `node tools/scripts/exec-preflight/check-page-doc-cochange.mjs PG-207`.

#### Step 28: Reviews

**Type:** review

- [ ] `node scripts/codex-review.mjs` iterated until clean (L3: verify cited
      lines with `git show HEAD:<file>`; false positives waived in
      `tools/audit/codex-review-waivers.yaml` with evidence).
- [ ] `/code-review` on the diff; `/sonarqube-fix` for new findings; a11y-expert
      WCAG 2.1 AA review of both pages, the callback page and compose changes;
      security-lead review of the secret/OAuth/SSRF/DSN paths; independent SQL
      review of the four migrations (ADR-069 Class A gate).

#### Step 29: Gates

**Type:** validation **Files to Modify:**

- `lighthouserc.authenticated.js` (add `/email/email-settings` and
  `/email/signatures`)

- [ ] Full suites of every touched package (Validation Matrix) green; typecheck,
      lint, build for each.
- [ ] `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-207 -- pnpm build`
      (Next build included).
- [ ] `pnpm audit --prod` and OSV scan clean for the three new deps; licence
      list recorded.
- [ ] Lighthouse ≥ 90 on `/email/email-settings` and `/email/signatures` via
      `lighthouserc.authenticated.js` (add both URLs); without
      `LHCI_TEST_EMAIL`/`LHCI_TEST_PASSWORD` → NEEDS_HUMAN with the reason.
- [ ] `git ls-files | grep -cE '\.(log|coverage|tsbuildinfo)$'` = 0 (L14);
      `gitleaks protect --staged` clean.
- [ ] Diff coverage ≥ 80 % on changed lines (pre-ship diff-coverage step is run
      by the runner at the final SHA).
- [ ] Per-package targets (E6, CA-23): domain `src/email` +
      `isPublicIpAddress` > 95 % lines/branches
      (`pnpm --dir packages/domain exec vitest run src/email src/workflow/__tests__/public-ip-address.test.ts --coverage --coverage.include="src/email/**" --coverage.include="src/workflow/node-catalog.ts"`);
      API application code (`apps/api/src/modules/email/**` new files) > 90 %
      (`pnpm --dir apps/api exec vitest run src/modules/email --coverage --coverage.include="src/modules/email/**"`);
      the application package changes only an additive port interface (no
      executable lines).
- [ ] Icons (W10): `node tools/scripts/subset-material-symbols.mjs --verify`
      passes.

#### Step 30: Dependency chain, PRD, ADR, findings, debt

**Type:** docs **Files to Modify:**

- `docs/architecture/diagrams/complete-dependency-chains.md` (new section)
- `docs/architecture/diagrams/integrations-dependency-chain.md` (mailbox
  transports, OAuth, bounce reader — W1)
- `docs/planning/prd-module-settings.md` (PG-207 addendum: Draft → In Progress →
  Delivered status table)
- `docs/architecture/adr/ADR-085-user-mailbox-sending-and-bounce-reading.md`
  (Proposed → Accepted after validations)
- `docs/architecture/adr/README.md` (status)
- `artifacts/metrics/debt-ledger.yaml` (IFC-144 false completion; DSAR email
  gap; Lighthouse/OAuth NEEDS_HUMAN) **Files to Create:**
- `.specify/sprints/sprint-18/execution/PG-207/PG-207-findings.md`

- [ ] Q11 (attachments) recorded in the PRD addendum, ADR-085 and the findings
      doc (W7); the findings doc also records the attachment design
      (`emailAttachments.upload`, `EmailAttachmentStoragePort`, private
      `email-attachments` bucket) as the plan-time elaboration of AC-EM-016 /
      Q11 (N6).
- [ ] gh issues filed (IFC-144 false-completion fake send — fixed here, issue
      documents it; DSAR email coverage) with file:line + proposed fix.

#### Step 31: CSV, attestation, context

**Type:** evidence **Files to Modify:**

- `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv` (PG-207 status
  flow; PG-084 description/notes re-scope — Category B, old→new + evidence;
  IFC-221 broadened to all mailbox kinds; then
  `npx tsx tools/scripts/split-sprint-plan.ts`; diff splits vs main after any
  rebase; "Artifacts To Track" extended with the key new deliverables — routers,
  pages, migrations, adapters — I1)
- `.specify/sprints/sprint-18/attestations/PG-207/task-tracking.json` **Files to
  Create:**
- `.specify/sprints/sprint-18/attestations/PG-207/attestation.json` (every gate
  PASS or NEEDS_HUMAN with reason; artifact hashes incl. the four migrations;
  spike result)
- `.specify/sprints/sprint-18/execution/PG-207/run-<ISO>Z/PG-207-delivery.md`
- [ ] `/exec-gates`, `/compliance-check`, `/exec-attestation`;
      `npx tsx apps/project-tracker/scripts/generate-context.ts`.
- [ ] SendMessage runner `projects-8c`: status, last SHA, attestation path, four
      migrations, NEEDS_HUMAN list.

## Validation Matrix

| Scope       | Purpose                                                           | Command                                                                                                                                                            |
| ----------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Domain      | new + existing                                                    | `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-207 -- pnpm --filter ./packages/domain test`                                                          |
| Validators  | new + notifications                                               | `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-207 -- pnpm --filter ./packages/validators test`                                                      |
| DB          | encryption map/count                                              | `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-207 --exclusive intelliflow-db -- pnpm --filter ./packages/db test`                                   |
| Adapters    | MIME/SMTP/IMAP/DSN/Gmail/Outlook/storage + existing email suites  | `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-207 -- pnpm --filter ./packages/adapters test`                                                        |
| API         | routers, sender, reader, scheduler, rewired inbound suites, smoke | `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-207 -- pnpm --filter ./apps/api test`                                                                 |
| Web         | pages, compose, shell consumers, registries                       | `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-207 -- pnpm --filter ./apps/web exec vitest run`                                                      |
| Integration | CHECKs, uniques, RLS, encryption, lease race                      | `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-207 --exclusive intelliflow-db -- pnpm vitest run tests/integration/email-settings.test.ts`           |
| Tools       | route totals, content audit, docs integrity                       | `pnpm vitest run tools/scripts/route-total-consistency.test.ts tools/scripts/__tests__/content-audit.test.ts tools/scripts/__tests__/docs-integrity-audit.test.ts` |
| Typecheck   | each touched package                                              | `pnpm --filter ./packages/domain typecheck` … `pnpm --filter ./apps/web typecheck` (all six)                                                                       |
| Lint        | each touched package                                              | `pnpm --filter ./apps/api lint`, `pnpm --filter ./apps/web lint`, packages likewise                                                                                |
| Build       | monorepo                                                          | `node C:/Users/talys/ops/test-slots/with-slot.mjs --label PG-207 -- pnpm build`                                                                                    |
| Security    | deps + secrets                                                    | `pnpm audit --prod`; OSV; `gitleaks protect --staged`                                                                                                              |
| Lighthouse  | both routes                                                       | `lighthouserc.authenticated.js` (or NEEDS_HUMAN)                                                                                                                   |

## Acceptance Criteria Traceability

| AC                  | Steps                     |
| ------------------- | ------------------------- |
| AC-EM-001..002      | 4, 7, 16, 21              |
| AC-EM-003..004      | 6, 7, 8, 15, 16           |
| AC-EM-005           | 10, 11, 16                |
| AC-EM-006..008      | 13, 16, 21, 22            |
| AC-EM-009           | 13, 15                    |
| AC-EM-010..017, 019 | 2, 10, 11, 14, 15, 19     |
| AC-EM-018           | 20, 24                    |
| AC-EM-020..023      | 2, 4, 16, 21              |
| AC-EM-024..031      | 2, 12, 13, 17, 18, 21, 24 |
| AC-EM-032..036      | 4, 16, 23, 24             |
| AC-EM-037           | 8, 16                     |
| AC-EM-038..039      | 20-24, 28, 29             |
| AC-EM-040           | 27, 30, 31                |
| NF-001..005         | 15, 12, 11, 9, 21/23      |
| A11Y-01..06         | 21-24, 28                 |
| SEC-01..13          | 3, 6-8, 10-17, 21, 28, 29 |
| CA-1..CA-23         | as cited inline above     |

## Integration Checkpoints Summary

| After Step | Verification                                | Command                                                   |
| ---------- | ------------------------------------------- | --------------------------------------------------------- |
| 2-3        | domain green + built                        | `pnpm --filter ./packages/domain test` (slot) + build     |
| 4-5        | validators green + built                    | `pnpm --filter ./packages/validators test` (slot) + build |
| 7-8        | migrations apply locally, integration green | Step 7/8 commands                                         |
| 14         | adapters full suite + build                 | Step 14 command                                           |
| 19         | API full suite + typecheck                  | Step 19 command                                           |
| 25         | web full suite + typecheck + lint           | Step 25 command                                           |
| 29         | all gates                                   | Validation Matrix                                         |

## Commit plan (per layer)

1. `feat(domain): email mailbox, bounce and recipient helpers for pg-207` (Steps
   2-3)
2. `feat(validators): email settings, mailbox and signature schemas` (Steps 4-5)
3. `feat(db): email mailboxes, settings, signatures and suppression tables`
   (Steps 6-8)
4. `feat(adapters): smtp, imap dsn reader and gmail/outlook raw send` (Steps
   9-14)
5. `fix(email): send user mail through the user's mailbox, never the mock`
   (Steps 15, 19)
6. `feat(email): mailbox, settings, signature and attachment routers` (Step 16)
7. `feat(email): bounce reader and scheduler` (Steps 17-18)
8. `feat(email): email settings, signatures and oauth callback pages` (Steps
   20-23)
9. `feat(email): compose prefill, attachments and coded send errors` (Step 24)
10. `docs(email): pg-207 registries, adr-085 accepted, prd delivered` (Steps
    27, 30)
11. `chore(tracker): pg-207 attestation and csv` (Step 31)

## Plan-Reviewer Sign-off

<!-- plan-reviewer: subagent -->

reviewer_subagent: plan-reviewer (.claude/agents/plan-reviewer.md), 3
iterations, 2026-10-20/21

| Iteration | Verdict     | Items                                                                                                                                                                                                                |
| --------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1         | REVISE      | 8 errors (E1 files summary, E2 block hygiene, E3 container/context wiring, E4 partial-bounce data, E5 A11Y-01/02/05/06, E6 coverage targets, E7 port path, E8 attachments bucket), 10 warnings, 3 info — all applied |
| 2         | REVISE      | N1 checkbox inside a Files block, N2 lighthouserc + recount, N3 unconditional sitemap TC-25 bump, N4 line cite, N6 attachment design note — all applied                                                              |
| 3         | **APPROVE** | No remaining errors; Category Y (UI reachability) PASS: `configs/email.ts:10-11`, `EmailSettingsPanel.tsx`, callback documented as a redirect target                                                                 |

Traceability: every AC-EM-001..040, NF-001..005, A11Y-01..06, SEC-01..13 and
CA-1..23 maps to a step (reviewer matrix, iteration 1, completed by the
iteration-2 fixes).

### Category verdict table (iteration 3)

| Cat | Name                       | Result                                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | Files summary              | PASS — 108 create / 56 modify recounted                                                                                                                                                                                                                                                                                                                                                                   |
| B   | AC traceability            | PASS                                                                                                                                                                                                                                                                                                                                                                                                      |
| F   | Accessibility              | PASS                                                                                                                                                                                                                                                                                                                                                                                                      |
| P   | Shared components          | PASS                                                                                                                                                                                                                                                                                                                                                                                                      |
| X   | Internal vs shared pattern | PASS                                                                                                                                                                                                                                                                                                                                                                                                      |
| Y   | UI Reachability            | PASS — `apps/web/src/components/sidebar/configs/email.ts:10-11` (`email-settings`, `signatures`) and `apps/web/src/components/email/EmailSettingsPanel.tsx:10-21`; Signatures card on email settings (Step 21); compose "Connect your mailbox" link (Step 24); `/email/oauth/callback` documented as a provider redirect target in `navigation-reachability-audit.md` (Step 27); no out-of-scope deferral |
| BB  | PRD/ADR                    | PASS                                                                                                                                                                                                                                                                                                                                                                                                      |
| CC  | Page doc co-change         | PASS (TC-25 214 → 215 unconditional)                                                                                                                                                                                                                                                                                                                                                                      |
