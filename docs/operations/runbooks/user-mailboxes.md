# User Mailboxes Runbook - IntelliFlow CRM

**Document ID**: PG-207-USER-MAILBOXES-RUNBOOK **Version**: 1.0.0 **Last
Updated**: 2026-10-21 **Owner**: STOA-Domain (Backend Dev + SRE)

## Overview

PG-207 (ADR-085) sends user mail only from the sender's own mailbox, never from
an IntelliFlow address. Each user can have one personal mailbox, and each tenant
one company mailbox. A mailbox is one of three kinds:

- SMTP, plus IMAP for reading bounces.
- Gmail, connected with OAuth.
- Microsoft, connected with OAuth.

The API process runs a bounce scanner that reads delivery reports back from each
connected mailbox. It marks bounced recipients and suppresses them according to
the tenant's rules.

Code:

- `apps/api/src/modules/email/`: `mailbox-sender.ts`, `bounce-reader.ts`,
  `bounce-scheduler.ts`, and the routers.
- `packages/adapters/src/messaging/email/`: SMTP, IMAP, OAuth and the DSN
  parser.

Everything here ships dark. With nothing configured the API boots: the settings
page shows "not configured", sends refuse with `NO_MAILBOX`, and nothing throws.
The proof is `apps/api/src/modules/email/__tests__/dark-launch.test.ts`.

## Metrics / Alerts

There is no dedicated alert rule yet; none exists in
`infra/monitoring/alerts-config.yaml`. Watch the API log for
`[email-bounce-scan] tick failed: <message>` and `[email] bounce scan failed`.
Both carry only the mailbox id and an error code.

## Configuration

| Variable                                                                  | Default             | Purpose                                                                                                                                                                                                       |
| ------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PRISMA_FIELD_ENCRYPTION_KEY`                                             | (required in prod)  | Encrypts SMTP/IMAP passwords and OAuth refresh tokens at rest. Saving a secret without it returns `PRECONDITION_FAILED`. The production API already refuses to boot without it (M4).                          |
| `EMAIL_OAUTH_REDIRECT_URI`                                                | unset               | `https://<app>/email/oauth/callback`. Needed for either OAuth provider.                                                                                                                                       |
| `EMAIL_OAUTH_GOOGLE_CLIENT_ID` / `EMAIL_OAUTH_GOOGLE_CLIENT_SECRET`       | unset               | Google OAuth app. Unset: "Connect Google" is disabled with the reason shown. `gmail.readonly` is a restricted scope and needs Google's security assessment before public launch.                              |
| `EMAIL_OAUTH_MICROSOFT_CLIENT_ID` / `EMAIL_OAUTH_MICROSOFT_CLIENT_SECRET` | unset               | Microsoft (multi-tenant) app registration. Unset: "Connect Microsoft" is disabled.                                                                                                                            |
| `EMAIL_ATTACHMENTS_BUCKET`                                                | `email-attachments` | Private Supabase bucket for compose attachments. Created on first upload when it does not exist.                                                                                                              |
| `EMAIL_BOUNCE_SCAN_INTERVAL_MS`                                           | `60000`             | Bounce scanner interval. `0` disables it. It is always off under tests and on serverless runtimes.                                                                                                            |
| `EMAIL_BOUNCE_TRUSTED_AUTHSERV_IDS`                                       | empty               | Comma-separated `imap.host=authserv-id` pairs: receivers trusted to stamp `Authentication-Results` for the custom SMTP/IMAP mailbox on that IMAP host only. Empty means fail closed. See the procedure below. |

## Bounce trust (#961, owner ruling Q12)

A delivery report changes nothing unless all three of these hold:

1. **Vouched.** A receiver the mailbox trusts stamped the topmost
   `Authentication-Results`:
   - Gmail: `mx.google.com`.
   - Microsoft: its own form, which has no authserv-id.
   - A custom SMTP/IMAP mailbox: the id paired with that mailbox's IMAP host in
     `EMAIL_BOUNCE_TRUSTED_AUTHSERV_IDS`.
2. **Authenticated.** The report is from `mailer-daemon@` or `postmaster@` with
   a DKIM or SPF pass.
3. **Entitled.** The domain that passed may speak for the recipient. It is the
   recipient's own domain, or the sending side: the mailbox address domain, its
   hosts, or the provider.

Anything else is stored as an UNMATCHED, LOW receipt with no effect.

### Procedure: trusting a custom SMTP/IMAP mailbox's receiver

Set `EMAIL_BOUNCE_TRUSTED_AUTHSERV_IDS` per customer when a custom SMTP/IMAP
mailbox is connected. First verify that the server stamps
`Authentication-Results` itself.

1. Send a message from an outside account to the customer's mailbox. Read its
   raw source over IMAP or in the mail client's "show original".
2. Confirm the **first** `Authentication-Results:` header comes from the
   customer's receiving server, for example
   `Authentication-Results: mx.customer.example; dkim=pass …`.
   - If the server adds no such header, do **not** trust it. A sender could then
     write that header themselves, and the mailbox's bounces must stay
     record-only.
3. Add the pair `<imap host>=<authserv-id>` to
   `EMAIL_BOUNCE_TRUSTED_AUTHSERV_IDS` on the API service and redeploy, for
   example `imap.customer.example=mx.customer.example`. The authserv-id is the
   part before the first `;`, lower-cased. The trust applies only to mailboxes
   on that IMAP host. It is never global, so one customer's receiver cannot be
   claimed for another tenant's server.
4. Check the next scan: genuine bounces for that mailbox now record a HARD or
   SOFT receipt with `matchConfidence: HIGH`.

Follow-up #965 (the D5 live header spike) may relax these rules on provider
evidence.

## Procedures

### Production rollout (before the API with PG-207 is promoted)

1. Apply the 8 Class A migrations with `prisma migrate deploy`, never `db push`.
   They are `20261020120000`, `120100`, `120200`, `120300`, `120310`, `120320`,
   `120400` and `120500`.
2. Confirm both concurrently built indexes are valid:
   `SELECT indexrelid::regclass, indisvalid FROM pg_index WHERE indexrelid::regclass::text IN ('email_records_tenantId_messageIdHeader_idx','email_records_mailboxId_idx');`.
   If one is invalid, run `DROP INDEX CONCURRENTLY` on it and re-run
   `migrate deploy`. `IF NOT EXISTS` makes the retry safe.
3. Make sure `PRISMA_FIELD_ENCRYPTION_KEY` is set. The OAuth variables are
   optional and stay dark until set.

### A user reports "Your mailbox needs attention"

The mailbox is in ERROR, for example after a failed login or a revoked grant.
The user opens Email Settings, re-enters credentials or reconnects, and clicks
"Test connection". A passing test returns the mailbox to ACTIVE and restarts its
bounce-scan failure streak.

## Troubleshooting

| Symptom                                             | Check                                                                                                                                                                       |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[email-bounce-scan] tick failed: …` in the API log | The scanner logs and keeps going. Check database access to the `email_mailboxes` table (were the migrations applied?).                                                      |
| Bounces are recorded but nothing is suppressed      | Expected for custom SMTP/IMAP mailboxes until their receiver is trusted (see above), and for unauthenticated or unentitled reports. Look at receipts with kind `UNMATCHED`. |
| A mailbox goes to ERROR after 5 scan failures       | Failing scans back off exponentially, up to 6 hours. Look at the mailbox's `lastErrorCode`; it never carries the server's text.                                             |
| Sends fail with `NO_MAILBOX` or `MAILBOX_ERROR`     | The user has no active mailbox, and the company fallback is off or the company mailbox is not active.                                                                       |

## Escalation

- Security questions about bounce trust: ADR-085, #961 and #965.
- Owner-only actions: OAuth app registration, Google's restricted-scope
  assessment, and trusting a customer's receiver.
