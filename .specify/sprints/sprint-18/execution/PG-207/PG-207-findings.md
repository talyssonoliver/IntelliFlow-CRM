# PG-207 — Findings, deviations and hand-offs

Task: Module Settings - Email (`/email/email-settings`), widened by owner
rulings Q1–Q11 to user-mailbox sending (ADR-085). Branch
`feat/pg-207-email-settings`.

## 1. Defects found while implementing

| # | Finding | Evidence | Status |
| - | ------- | -------- | ------ |
| F1 | **IFC-144 false completion: production user mail was a fake send.** `email.sendEmail` used a module-level outbound service that fell back to the mock provider when `SENDGRID_API_KEY` was absent. Railway has no such variable (checked by name only), so production recorded `SENT` for mail that never left. | `inbound.router.ts` before `8d9803710` (`createOutboundEmailService` singleton, `outboundEmailService.sendEmail`) | **Fixed here**: singleton and mock fallback removed; `dispatchUserMail` is the only send path; `arch-guards.test.ts` forbids `createOutboundEmailService` / `useMock` / `MockEmailProvider` under `modules/email`. gh issue #955; debt `PG-207-IFC-144-FALSE-COMPLETION`. |
| F2 | **DSAR does not cover email data.** `DSARWorkflow` exports leads, contacts, accounts and opportunities only; email records, suppressions, bounce receipts, signatures and mailboxes are neither exported nor erased. | `apps/api/src/workflow/dsar-workflow.ts:287-335` | Out of scope; gh issue #956; debt `PG-207-DSAR-EMAIL-COVERAGE`. |
| F3 | **Compose lost typed text on re-render when the body started non-empty.** React 19 re-applies `dangerouslySetInnerHTML` whenever the prop object changes; `EmailCompose` / `InlineCompose` built a new object every render, so in forward mode each keystroke reset the body to the quoted original. A prefilled signature would have done the same to every new message. | RED: `EmailCompose.test.tsx` "keeps what the user types when the form re-renders" failed before the fix | **Fixed here** (`774900013`): the prop object is created once per editor. The InlineCompose twin test was written with its fix; its RED is the identical EmailCompose case. |
| F4 | **RecipientPicker a11y (pre-existing):** its input has `aria-controls` pointing at a listbox id that is not rendered until suggestions open → axe `aria-valid-attr-value` (critical). | axe run on the compose form (`EmailCompose.send-errors.test.tsx`) | Not changed here; the PG-207 axe check is scoped to the new alert. gh issue #957. |
| F5 | **API reads request bodies without a size limit (pre-existing).** `readRequestBody` concatenates the whole body. Attachments (≤ 10 MB, ~13.4 MB base64) follow the same base64 pattern as `upload.router.ts`. | `apps/api/src/http-server.ts:74-86` | Not changed here; gh issue #958 (DoS hardening). |
| F6 | **Nav-wiring / page-doc preflights did not see the plan's new pages.** Both reported "plan does not create any page.tsx" although Steps 21–23 create three. Reachability was checked by hand (sidebar `email.ts:10-11`, `EmailSettingsPanel.tsx`, Signatures card link, compose "Open Email Settings" link; the callback is a redirect target). | `artifacts/logs/pg-207/preflight-nav.txt` | Tooling gap, already tracked as #877 (bold Files-to-Create labels are skipped). |

## 2. Deviations from the plan (with reasons)

- **Attachment limits** are not taken from `legal/document-policies.ts`: email
  attachments have their own 10 MB cap and executable-extension block
  (`MAX_EMAIL_ATTACHMENT_BYTES`, `BLOCKED_ATTACHMENT_EXTENSIONS` in
  `packages/validators/src/email-settings.ts`), shared by the API input schema
  and compose. Document policies govern the documents module, not mail.
- **Attachment design (Q11, plan-time elaboration of AC-EM-016):**
  `emailAttachments.upload` stores each file in the private
  `email-attachments` bucket (`EMAIL_ATTACHMENTS_BUCKET`) through
  `EmailAttachmentStoragePort`; `sendEmail` receives storage paths and reads
  them back tenant-scoped; any unreadable attachment fails the send
  (`ATTACHMENT_UNAVAILABLE`).
- **Eight migrations, not four:** after the independent SQL review,
  `email_records` changes are split so nothing scans it under the ADD COLUMN's
  ACCESS EXCLUSIVE lock: `20261020120300` adds the nullable columns and both
  constraints `NOT VALID` (with `lock_timeout = 5s`); `120310` and `120320`
  each `VALIDATE` one constraint as a single statement (SHARE UPDATE EXCLUSIVE);
  `120400` and `120500` build the `(tenantId, messageIdHeader)` and
  `(mailboxId)` indexes `CONCURRENTLY`. The first three migrations only create
  new tables.
- **OAuth module:** a new `OAuthMailboxClient` (explicit scopes, PKCE, revoke
  by POST body) instead of the legacy Gmail/Outlook adapters, whose defaults
  are unsafe (`gmail.modify`, `prompt=consent`, `Mail.ReadWrite`) and which
  had no production caller.
- **Container wiring** is asserted in `container.test.ts` (mailbox transports
  built by `createMailboxTransports`); `context.ts` needed no change.
- **`providersAvailable`** is returned by `emailMailbox.getMine` rather than a
  separate procedure (one round trip for the card).
- **RBAC / audit resource types:** `email_mailbox`, `email_settings`,
  `email_signature`, `email_suppression` added to `ResourceType` and the
  default permission map (PG-205 precedent) so audit entries are typed.
- **ModuleSettingsShell** gained `leading` (content outside the saving
  fieldset, CA-1) besides `hideActions`; all 139 consumer suites re-run green.
- **Signatures page:** "New Signature" / "New Organisation Signature" sit in
  their card headers (PG-204 case-types pattern) instead of the page header.
- **Extra small files:** `TenantSettingsCards.tsx` (reply-to, tracking, bounce
  rules, signatures link), `components/email/DeliveryStatusBadge.tsx` (shared
  by list row and message header), `app/email/oauth/oauth-session.ts` (the
  per-state provider key shared by the card and the callback),
  `apps/api/.../__tests__/dsn-fixture.ts` (the API cannot import the adapters'
  test fixtures across its `rootDir`).
- **Content audit:** `content-audit-results.json` updated surgically (totals +
  the three PG-207 routes). A full regeneration also rewrites every route's
  `og_url` from the local env's base URL and unrelated rebrand copy.

## 3. Reviews (round 1) and what was done

- **Independent SQL review (ADR-069 Class A gate):** F1 (VALIDATE under the
  ADD COLUMN lock) and F2 (no index on the `mailboxId` FK) fixed in
  `76d930718`. F3 (user-delete cascades to that user's mailboxes, signatures
  and, through the mailbox, its receipts; suppressions survive), F4 (audit
  pointers and OAuth state `userId` carry no FK, by design: the state expires
  in 10 minutes), F5 (after deploy confirm `pg_index.indisvalid` for both
  concurrent indexes) and F6 (RLS is tenant-scoped; per-user separation of
  mailbox secrets is enforced in the API and the secrets are encrypted) are
  accepted and documented. All eight migrations apply to a fresh database and
  `migrate diff` shows nothing on PG-207 objects.
- **Security review:** fixed in `76d930718`: catastrophic-backtracking MIME
  boundary (escaped, ≤ 70 characters); recipients per report (≤ 50) and
  unmatched receipts per scan (≤ 100); provider pagination; forward ownership;
  attachment name/size re-checked at send plus a 25 MB total (declared and
  stored); missing OAuth scopes refused and revoked; credential version bumped
  on save/reconnect/disconnect. Open: forged-DSN suppression by an insider
  recipient → #961 (needs the D5 header spike); archive/delete ownership in
  `processEmail` → #962. Documented, not changed: Microsoft `mail` is used as
  the From address (Exchange rewrites a From the account may not use); IMAP
  fetches a source before the size check (bounded by the 256 KB report cap
  and 50 messages per scan); OAuth state rows are purged by the scan only; the
  connection-test limiter is per process.
- **Codex review round 1:** three findings (stale OAuth token after
  reconnect, suppression pagination off by one, Graph/Gmail bounce paging)
  fixed in `76d930718`.
- **Codex review round 2:** four findings fixed in `d5e4d5a98`. Hard bounces
  are now tracked apart from soft ones, so a soft bounce no longer counts
  toward BOUNCED. A report past the per-scan suppression cap rolls back and
  the scan stops there instead of dropping it. Changing the IMAP account
  clears the scan cursor. Compose guards against a double send.
- **Codex review round 3:** three findings. An SMTP server can refuse some
  recipients and accept the rest. The refused ones are now returned, their
  quota is released and they are recorded as bounced (`b71162687`). Gmail
  windows past the page cap are halved, and the Graph scan never splits a
  receive time (`249162ba4`).
- **Codex review round 4:** three findings fixed in `94dde64d2`. Gmail now cuts
  only at a new second. The bounce notification is created in the receipt's
  transaction, so a failed notification is retried, not lost. Attachment rows
  store the stored byte length instead of the declared size.
- **Codex review round 5** (`2d0a1e571`): attachments sent from compose are
  private storage keys, and `getAttachment` returned the key as the download
  URL. It now returns a five-minute signed link (same tenant-path check as
  downloads). A mailbox made ACTIVE again (new credentials, OAuth reconnect,
  passing test) now restarts its bounce-scan failure streak.
- **Codex review round 6** (`d3e4be6a0`): the DSN parser keeps
  `EMAIL_LIMITS.maxRecipients` (100) recipients, not 50. A failed token
  refresh only marks ERROR the credential version that failed.
- **Codex review round 7** (`b90d87650`): the IMAP reader fetches sizes first
  and never downloads oversize bodies. The scheduler claims one mailbox at a
  time, just before its scan, and writes scan results only while it still
  holds the lease (integration test added). RED was not observed separately
  for rounds 5 (partly), 6 and 7: tests and fixes were written together in
  round 7; rounds 5 and 6 did show RED.
- **Codex review round 8:** a worker whose lease expired could still commit
  receipts and overwrite bounced-recipient lists. Each receipt transaction now
  re-asserts the lease with a row-locking UPDATE and reads the record's
  metadata inside the transaction (RED observed).
- **Codex review round 9** (`c1142ae36`): HIGH, the stored IMAP UID cursor is a
  BigInt and the reader added a number to it, so every IMAP scan after the
  first would throw (the bounce-reader tests used a number where Prisma
  returns a bigint; the fixture is now `10n`). MEDIUM, a disconnected personal
  mailbox refused every send even with the company fallback allowed; it is
  now treated as no mailbox (ERROR still refuses). RED observed for both.
- **Codex review round 10:** new credentials, a reconnect or a disconnect
  now clear the scan lease, so a scan still reading the old account writes
  nothing back. A send's AUTH_FAILED only marks ERROR the credential version
  it used. RED observed.
- **Codex review round 11:** the connection test's result write matches
  the credential version tested (with OAuth rotation). A temporary (4xx)
  SMTP refusal is never a hard bounce. The settings page refreshes the
  mailbox after every test. RED observed; the rotation test first failed
  for a harness reason (Microsoft not configured in the test transports) and
  was then switched to Gmail.
- **Codex review round 12:** the transport wrapper dropped the temporary
  refusal list (round 11 fix incomplete). It is now passed through. RED observed.
- **Codex review round 13:** HIGH, cross-tenant attachment read through an
  encoded traversal (`%2e%2e`) that storage normalises after building the
  URL. One domain rule (`isAttachmentPathInTenant`) allows only
  `[A-Za-z0-9._-]` segments, in both the validator and the adapter. MEDIUM, the
  tenant-wide soft-bounce threshold could be missed by concurrent scans; a
  transaction advisory lock per tenant and recipient now serialises it
  (integration test). RED observed for both.
- **Codex review round 14:** the Message-ID is bounded to the 255-character
  column (rightmost whole labels of the sender domain). The signature cap is
  counted inside the create transaction behind a per-owner advisory lock.
  RED observed for both.
- **STOA verdicts** (`execution/PG-207/20261021-090734-fb30029c/matop/stoa-verdicts/`):
  - Domain, Foundation and Quality: PASS.
  - Security: FAIL on two MEDIUM findings at first (re-runs 2 and 3 are
    recorded above; the last verdict is FAIL only on the pre-existing
    `pnpm audit` highs, which the agent's no-waiver rule counts):
    - #962, processEmail actions not owner-scoped: fixed in `c2be0addf` (RED observed).
    - #961, forged bounce by an insider recipient: ruling requested from the runner and owner (fix with an Authentication-Results rule, or accept in an ADR).
  - The Security agent also noted the pre-existing `pnpm audit` highs in follow-redirects, vite and markdown-it. None come from PG-207 dependencies, and the same versions are on origin/main.
- **Runner question (c), dark launch:** answered by `dark-launch.test.ts` (6 tests, passing) and the delivery report.
- **#961, owner ruling Q12 "fix now, relax later", then hardened:**
  - `a902c05ca`: act only on a mailer-daemon/postmaster report with a topmost
    Authentication-Results DKIM/SPF pass. Follow-up spike: #965.
  - Codex round 16 HIGH (a domain the insider controls). `3080fed71`: the
    reporter must be entitled for the recipient. Comments are ignored, a
    report with several From headers is refused, and Microsoft's form is read.
  - Security re-run 2 (N-1 public-suffix trick) and codex round 17 HIGH (a
    custom IMAP server stamps nothing). `6f7a81f4e`: the reporter is the domain
    that passed, hosts count as themselves, and the receiver must be trusted
    (Gmail `mx.google.com`; Microsoft's form; custom servers via
    `EMAIL_BOUNCE_TRUSTED_AUTHSERV_IDS`, empty, so they fail closed).
  - Security re-run 3, N-3 MEDIUM and N-2 LOW. `66d4dd835`: trusted receivers
    are `imap.host=authserv-id` pairs scoped to that host, and a host's parent
    domain is never entitled.
  - Runner ruling: keep the list empty; documented in `.env.example` and
    `docs/operations/runbooks/user-mailboxes.md`.
  - RED was observed for each change.
- **Codex review round 18:** two MEDIUM, filed per the runner's stop rule:
  #970 (Exchange `MicrosoftExchange<hex>@` NDR senders are record-only) and
  #971 (AUTH_FAILED after an OAuth rotation leaves the mailbox ACTIVE).
- **Codex review round 19** (`bd7b4b1c1`): fixed two findings with RED
  observed:
  - SMTP setup was unreachable after a disconnect (a broken path, not narrow).
  - A 429 or 5xx token endpoint was mapped to AUTH_FAILED.

  No further codex round was run: the runner's pre-ship review at push runs
  one at the final SHA.
- **After pushing was handed to the runner** (2026-10-21/22):
  - Codex pre-ship HIGH (a child domain spoke for its parent): entitlement made directional (`19c80a1ec`).
  - Codex pre-ship MEDIUM #970 (Exchange NDR senders): fixed (`3c0cf2216`).
  - Merged #975: the audit highs cleared; `sanitize-html` bumped to 2.18.1 for GHSA-c9rx-x947-fp3h (`7ddace341`).
  - Security STOA re-run 5 found N-4 (MEDIUM), fixed in `14b24dc09`: Exchange sender exactly 32 hex characters, never entitled through a provider domain.
  - Security STOA re-run 6 confirmed N-4 closed and found R-1 (LOW, conditional), fixed in `a1a741d98`: an Exchange-shaped sender within any provider domain is refused on every path.
  - The re-run 6 verdict file predates the R-1 fix. Its remaining FAIL items are:
    - R-1, now fixed;
    - H-1 (optional public-suffix guard, LOW);
    - two moderate advisories that predate PG-207 (sprintf-js, hono), which the agent's any-severity rule counts.
  - RED was observed for every fix.
- **Simplify review** (read-only subagent, then applied): one `SendErrorAlert`
  for both compose components, shared attachment name/content-type schemas,
  `FIELD_KEYS` in the settings page, misplaced doc comments, and
  `prismaErrorCode` reuse. Not applied: preset drift between the web form and
  domain `MAILBOX_PRESETS` (#963, needs a port decision); type and helper
  consolidation across routers (behaviour-neutral, low value this late).
- **/code-review (quick):** run `20261021-090734-fb30029c` over 26 packages,
  0 TypeScript errors, 0 lint errors. `/sonarqube-fix` is covered by
  `pnpm lint:sonar:guard` run before every commit (0 findings); no SonarQube
  server findings exist for an unpushed branch.
- **NF-001 query-count assertion:** added to `mailbox-sender.test.ts` after the
  behaviour already existed (it passed on first run; not a RED-first test).
- **Accessibility review (WCAG 2.1 AA):** 3 high, 6 medium and the useful
  lows fixed in `abdc38383` (see that commit). The focus tests for these were
  written with the fixes, not before them.

## 3b. Dependencies, licences, Lighthouse

- New runtime dependencies, all permissive: `nodemailer` 10.0.15 (MIT-0),
  `imapflow` 2.2.6 (MIT), `sanitize-html` 2.18.0 (MIT). Type packages:
  `@types/nodemailer` 8.0.2, `@types/sanitize-html` 2.16.2 (MIT). OSV: no
  advisories for the three (`artifacts/logs/pg-207/osv-new-deps.txt`);
  `pnpm audit --prod` lists only pre-existing advisories in unrelated packages.
- Lighthouse (local `next start` on :3400, desktop preset, no session, which
  is the methodology of the repo's base `lighthouserc.js` for authenticated
  routes): `/email/email-settings` performance 94 / accessibility 90,
  `/email/signatures` 93 / 90. Reports: `artifacts/lighthouse/PG-207/`. Both
  routes were added to `lighthouserc.js` (the plan named
  `lighthouserc.authenticated.js`, which takes its URLs from `LHCI_URLS`
  instead). An authenticated run still needs `LHCI_TEST_EMAIL` /
  `LHCI_TEST_PASSWORD` (NEEDS_HUMAN 4).

## 4. NEEDS_HUMAN (cannot be done by an agent)

1. **Google and Microsoft OAuth apps**: register them and set
   `EMAIL_OAUTH_REDIRECT_URI`, `EMAIL_OAUTH_GOOGLE_CLIENT_ID/_SECRET`,
   `EMAIL_OAUTH_MICROSOFT_CLIENT_ID/_SECRET`. `gmail.readonly` (bounce reading) is
   a restricted Google scope that needs Google's security assessment before
   public launch. Until configured, Connect buttons are disabled with the
   reason shown; SMTP works.
2. **Live header spike (D5 / CA-22):** confirm on a real Gmail and Microsoft
   mailbox that `X-IntelliFlow-Record` and the Message-ID survive into DSNs. No
   test OAuth credentials exist locally.
3. **Production prerequisites before the API ships:** apply the eight Class A
   migrations (`prisma migrate deploy`) and confirm both concurrent indexes are
   valid (`pg_index.indisvalid`); ensure
   `PRISMA_FIELD_ENCRYPTION_KEY` is set (secret writes refuse without it);
   create the private `email-attachments` Supabase bucket.
4. **Lighthouse** on `/email/email-settings` and `/email/signatures` needs
   `LHCI_TEST_EMAIL` / `LHCI_TEST_PASSWORD` (authenticated harness).

Items 1, 2 and 4 are tracked as debt `PG-207-OAUTH-LIGHTHOUSE-NEEDS-HUMAN`.
