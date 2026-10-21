# PG-207 owner ruling (2026-10-20)

Asked by the PG-207 lane during /spec-session, answered by Talysson in an
AskUserQuestion modal.

## Q1. SMTP/IMAP scope

Context: sending goes through SendGrid
(`apps/api/src/modules/email/inbound.router.ts` sendEmail); the repo has no SMTP
or IMAP library, so stored SMTP/IMAP config would have no consumer.

Options: A store + test connection (SMTP send and IMAP sync as follow-up); B
store + send via SMTP; C drop from PG-207.

**Ruling: B.** Store per-tenant SMTP/IMAP config (password encrypted at rest,
never returned to the client), and `sendEmail` actually sends through the
tenant's SMTP when it is configured. IMAP sync goes to a registered follow-up.

## Q2. Where signatures live

Context: `/email/signatures` is a "coming soon" stub; PG-207 must cover
signatures per user and per org.

Options: A card on /email/email-settings with /email/signatures redirecting; B a
real /email/signatures page.

**Ruling: B.** Build signature management on its own page at `/email/signatures`
(replacing the stub) and link it from `/email/email-settings`.

## Q3. Bounce handling rules (asked after exploration, 2026-10-20)

Context: nothing records bounces today (no webhook writes
`EmailRecord.status = BOUNCED` / `bouncedAt`; both providers' `checkBounce`
return null; no suppression-list model).

Options: A save rules + follow-up task to ingest and enforce; B wire it now
(ingest SendGrid bounce events, suppression list, block sends to suppressed
addresses); C drop bounce rules.

**Ruling: B.** Ingest bounce events, keep a per-tenant suppression list, and
enforce the rules at send time in this task. (SMTP bounces arrive as DSN mail
and need IMAP; IMAP sync stays a follow-up per Q1.)

## Q4. SMTP failure behaviour

Options: A fail, no fallback; B fall back to the platform provider; C
tenant-chosen switch.

**Ruling: A.** A send through a configured tenant SMTP server that fails is
marked FAILED with the error; it is never re-sent through the platform provider
(that would send the tenant's From domain through another server and break
SPF/DMARC).

## Q5. How signatures reach outgoing mail

Options: A prefill in compose (user default, else org default; editable; server
appends nothing); B server appends on send.

**Ruling: A.** Compose opens with the user's default signature, else the org
default, already in the body and editable. `sendEmail` does not append anything.

## Q6. Platform send path (asked during Rounds 1-2, 2026-10-20)

Finding put to the owner: production `sendEmail` never sends. The API service
has `RESEND_API_KEY` (and no `SENDGRID_API_KEY`), but `sendEmail` builds its
service with the SendGrid key only, so it falls back to the mock provider and
marks emails SENT that never left
(`apps/api/src/modules/email/inbound.router.ts:34-44`,
`packages/adapters/src/messaging/email/outbound.ts:646`; Railway variable names
checked read-only).

Options offered: A Resend from our verified domain with the user as Reply-To; B
Resend with the user's From; C separate fix.

**Owner answer (verbatim):** "We should fix it now as truly part of the pg-207,
our domain is to send only to our customers never from our domain as if it's the
user email. We should fix it to send from the user domain (like gmail, outlook
or whenever the user use)"

Reading: fix in PG-207. The platform domain (Resend) is for IntelliFlow's own
mail to its customers only; user correspondence must never be sent from the
platform domain. User mail goes out from the user's own mailbox/domain. The mock
fallback must not mark user mail as SENT.

## Q7. How users connect their mailbox

Options: A per-user SMTP (Gmail/Outlook presets + custom, app password) with
optional tenant SMTP fallback, OAuth left in PG-084; B A plus OAuth
Gmail/Outlook sending pulled into PG-207; C tenant SMTP only.

**Ruling: B.** Per-user mailbox over SMTP (presets + custom), the tenant SMTP as
a shared company-domain fallback, AND OAuth "Sign in with Google / Microsoft"
mailbox connection with sending through the Gmail API / Microsoft Graph, pulled
in from PG-084. With no mailbox connected, send is refused ("Connect your
mailbox"), never sent from the platform domain.

## Q8. Bounce detection when mail leaves from the user's own mailbox

Options: A IMAP bounce reader now (worker reads each connected mailbox for
bounce reports only); B suppression list

- manual entries now, automatic detection with the IMAP sync follow-up.

**Ruling: A.** A worker periodically reads each connected mailbox for
delivery-status notifications only (not general mail sync), marks the matching
EmailRecord BOUNCED and applies the bounce rules. General mailbox sync stays a
follow-up.

## Q9. Suppressed recipients at send time

Options: A block the whole send; B drop suppressed recipients and send to the
rest.

**Ruling: B.** Suppressed recipients are dropped, the rest are sent, and the
user is shown which addresses were skipped. If every recipient is suppressed,
nothing is sent.

## Supersedes

- Q3 provider-webhook ingestion is superseded by Q6-Q8 for user mail: user mail
  never goes through SendGrid/Resend, so bounces are read from the sending
  mailbox (Q8).

## Q10. Task order (owner question, 2026-10-20/21)

Owner asked whether PG-207 and PG-084 are inverted (the mailbox/send foundation
should come first). Lead answer: yes, the foundation is upstream of the settings
UI; the "send from the user's Gmail/Outlook" capability was never its own row
(PG-084, Sprint 22 Backlog, is mainly entity-page compose wiring), and IFC-144 /
IFC-099 are marked Completed while production sends go to the mock.

Options: A new foundation task first, PG-207 on top; B keep everything in PG-207
(one large PR); C expand PG-084 and run it first.

**Ruling: B.** PG-207 carries the foundation (mailbox model, SMTP +
Gmail/Outlook OAuth connect, sendEmail/forward fix, bounce reader, suppression)
and the settings UI in one task/PR. PG-084 keeps only the entity-page compose
wiring. Recorded as a Category B rebaseline at exec (CSV notes on PG-084;
IFC-144 false-completion finding tracked).

## Q11. Compose attachments (asked during /plan-session, 2026-10-21)

Finding: `EmailCompose` collects attachments in local state
(`apps/web/src/components/email/EmailCompose.tsx:113,591-605`) but never uploads
them and never passes them to `sendEmail` (`:190-201`); the server input
`attachments` has no caller and is never attached to outgoing mail.

Options: A wire them now (upload via the existing documents upload path, attach
to outgoing mail, fail the send when an attachment cannot be fetched); B disable
the attach button with a visible note, reject server-side, follow-up task.

**Ruling: A.** Attachments are uploaded to tenant storage and sent with the
email; an unfetchable attachment fails the send visibly.
