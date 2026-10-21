# ADR-085: User Mail Leaves From the User's Own Mailbox; Bounces Are Read Back From It

**Status:** Accepted (2026-10-21 — implemented on `feat/pg-207-email-settings`;
proposed in the PG-207 spec session)

**Date:** 2026-10-21

**Deciders:** Talysson Oliveira (owner rulings Q1-Q12, 2026-10-20/21,
`.specify/sprints/sprint-18/context/PG-207/PG-207-owner-ruling.md`); PG-207 spec
session

**Technical Story:** PG-207 — Module Settings: Email (absorbs the send side of
PG-084)

## Context and Problem Statement

`email.sendEmail` and the `forward` action of `email.processEmail`
(`apps/api/src/modules/email/inbound.router.ts`) send through a module-level
`createOutboundEmailService` singleton that is built with the SendGrid key only.
Production has `RESEND_API_KEY` and no `SENDGRID_API_KEY`, so both paths fall
back to the mock provider and record emails as SENT that never left. The `From`
address is the user's login address, which no platform provider may send as.

The owner ruled (Q6) that IntelliFlow's own domain is only for IntelliFlow's
mail to its customers and must never send user correspondence as if it were the
user. User mail must leave from the user's own mailbox (Gmail, Outlook, or any
SMTP server). The owner also ruled that bounces must be detected and enforced in
this task (Q3, Q8) and that suppressed recipients are dropped while the rest are
sent (Q9).

Because user mail no longer passes through a platform provider, provider bounce
webhooks (SendGrid Event Webhook, Resend/Svix) never see it. Bounces come back
as delivery-status notifications (DSNs, RFC 3464) into the sending mailbox.

## Decision Drivers

- Never report SENT for mail that was not sent (the production defect).
- Sender identity: From is the mailbox owner's verified address; no platform
  domain for user mail; no silent fallback that changes the From identity (Q4).
- Secrets (SMTP/IMAP passwords, OAuth refresh tokens) encrypted at rest, never
  returned, never logged.
- Tenant-supplied hosts are an SSRF surface.
- Bounce detection must not be spoofable into suppressing arbitrary addresses.
- Minimal OAuth scopes.

## Considered Options

1. **Platform provider (Resend) from IntelliFlow's verified domain, user as
   Reply-To.** Rejected by the owner (Q6).
2. **Platform provider with the user's From.** Fails on unverified domains and
   still sends user mail through IntelliFlow's sender reputation. Rejected (Q6).
3. **Tenant SMTP only.** Rejected (Q7): users need their own mailboxes.
4. **Per-user mailbox (SMTP with Gmail/Outlook presets, or OAuth Gmail API /
   Microsoft Graph) with an admin-enabled tenant mailbox fallback; DSNs read
   back from the sending mailbox (IMAP for SMTP mailboxes, Gmail API / Graph for
   OAuth mailboxes).** Chosen (Q7 B, Q8 A).

## Decision Outcome

Chosen option 4.

- **Mailbox model.** `EmailMailbox` rows, scope `USER` (at most one per user) or
  `TENANT` (at most one per tenant), kind `SMTP | GMAIL | MICROSOFT`. SMTP
  password, IMAP password and OAuth refresh token are field-encrypted
  (`packages/db/src/field-encryption.ts` `ENCRYPTED_FIELDS`); access tokens are
  held in memory only. Saving a secret is refused when
  `PRISMA_FIELD_ENCRYPTION_KEY` is absent.
- **Send resolution.** The user's mailbox; if the user has none and the admin
  enabled `allowTenantMailboxFallback`, the tenant mailbox; otherwise the send
  is refused (NO_MAILBOX). A user mailbox in ERROR refuses (MAILBOX_ERROR); it
  never falls back. A transport failure records FAILED with a coded reason and
  never retries through another mailbox or provider. The mock provider is never
  used for user mail.
- **Transports.** SMTP via nodemailer with DNS-pinned connects (public addresses
  only, ports 465/587/2525, TLS required); Gmail via `users.messages.send` with
  raw MIME; Microsoft via Graph `POST /me/sendMail` with the base64 MIME as
  `text/plain`: one call, which accepts the MIME as is (this corrects the
  draft-then-send first written here). MIME is built once with nodemailer
  `MailComposer` and carries `X-IntelliFlow-Record: <recordId>`. An SMTP server
  may refuse some recipients at RCPT TO and accept the rest; the refused ones
  are returned to the sender, their quota is released and they are recorded as
  bounced on the record, which stays SENT for the others.
- **OAuth.** Authorization code + S256 PKCE; opaque state stored hashed in
  `EmailOAuthState` (single use, 10 minutes); the redirect lands on a web page
  that completes the exchange through an authenticated tRPC call; explicit
  scopes (Gmail `gmail.send`, `gmail.readonly`, `openid`, `email`; Microsoft
  `Mail.Send`, `Mail.Read`, `offline_access`, `User.Read`), never the adapter
  defaults; disconnect revokes and deletes the tokens.
- **Bounce reading.** An env-gated scheduler in the API process claims mailboxes
  through per-row leases and lists DSNs since a cursor (IMAP 993 read-only for
  SMTP mailboxes, Gmail `q` + `format=raw`, Graph filter + `$value`). A DSN is
  accepted only if it carries both the `X-IntelliFlow-Record` id and the
  original Message-ID, both match one `EmailRecord` of the same tenant sent from
  that mailbox in the last 30 days, and it names one of that record's recipients
  (either value alone is not enough: a forged report could name a guessed id).
  Listing never moves the cursor past an unread report: Gmail windows past the
  page cap are halved, and Graph scans stop only between receive times. Hard
  bounces suppress (if the rule says so); soft bounces suppress after the tenant
  threshold within 30 days. Only the status code and a truncated diagnostic are
  stored; no mail content.
- **Suppression.** Suppressed recipients are dropped before quota is reserved;
  the response lists them; all-suppressed sends nothing.
- **Attachments (Q11).** Compose uploads attachments to the private
  `email-attachments` bucket before sending; the send re-checks the blocked
  extensions and the 25 MB total.

- **Vouched, authenticated, entitled reports only (#961, owner ruling Q12,
  2026-10-21).** A matched report acts (bounce status, suppression,
  notification) only when all three of these hold:
  1. **Vouched.** A receiver this mailbox trusts stamped the topmost
     `Authentication-Results`. A sender can only add headers below it.
     - Gmail: `mx.google.com`.
     - Microsoft: its own form, which has no authserv-id.
     - A custom SMTP/IMAP mailbox: only the receiver paired with that mailbox's
       IMAP host in `EMAIL_BOUNCE_TRUSTED_AUTHSERV_IDS`
       (`imap.host=authserv-id`). It is never global, so one customer's receiver
       cannot be claimed for another tenant's server. The list is empty by
       default, so those mailboxes fail closed, because a server that stamps
       nothing would leave a sender-written header on top.
  2. **Authenticated.** The report is from `mailer-daemon@` or `postmaster@`,
     with exactly one From header. That header shows `dkim=pass`
     (`header.d`/`header.i`) or `spf=pass` (`smtp.mailfrom`/`smtp.helo`) for a
     domain related to the From domain (one within the other). The domain that
     passed, not the From domain the sender chose, is the reporter's identity.
     Comments are ignored.
  3. **Entitled, directionally.** A passing domain may speak for that recipient
     in one of three ways:
     - It is the recipient's domain or a parent of it. `example.com` may report
       on `sub.example.com`, never the reverse: a child such as
       `evil.example.com` gets no authority over its parent.
     - It exactly matches the sending side: the mailbox address domain or its
       SMTP/IMAP hosts.
     - It is a provider domain (Google, Microsoft) or one of its subdomains.

     A bare TLD never qualifies. This closes the codex pre-ship HIGH
     (2026-10-21).

  Every other report is stored as an UNMATCHED, LOW receipt with no effect. That
  covers a recipient forging a report with the ids they received, even when it
  is signed by a domain they control (public-suffix tricks included). Some
  genuine bounces will be recorded without acting: provider-internal bounces
  without `Authentication-Results`, custom IMAP mailboxes until their receiver
  is configured, and unusual reporters. #965 (the D5 live header spike) relaxes
  the rule on provider evidence.

### Consequences

- Good: user mail is really sent, from the user's identity; no fake SENT.
- Good: bounce enforcement works for every mailbox kind.
- Bad: three new runtime dependencies (`nodemailer`, `imapflow`,
  `sanitize-html`) — pinned, audited.
- Bad: Gmail `gmail.readonly` is a restricted scope; Google app verification
  (and a security assessment) is required before more than ~100 users can
  connect. Microsoft needs a multi-tenant app registration. Both are owner
  actions (NEEDS_HUMAN); until then the Connect buttons show "not configured".
- Bad: a user without a connected mailbox can no longer send (by design).

## Related

- ADR-041 (email outbound provider) — its platform provider remains for
  IntelliFlow's own system mail only (notifications container adapter); it no
  longer applies to user correspondence.
- ADR-069 (migration risk classes) — all PG-207 migrations are Class A.
- IFC-221 — open/click tracking pixel (tracking toggles are category 2 until it
  ships).
- PG-084 — keeps entity-page compose wiring; its "send through the user's
  Gmail/Outlook" part is delivered here.
