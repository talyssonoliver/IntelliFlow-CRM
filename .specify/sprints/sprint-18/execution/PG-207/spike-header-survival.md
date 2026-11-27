# PG-207 spike: do our match headers survive a bounce report (plan Step 1)

Recorded 2026-11-22 on a fresh worktree of origin/main (`28eb9f49a`). Local only, no network, no mailbox contacted.

## Part 1, done: what we put on the wire

`buildMime` (`packages/adapters/src/messaging/email/mime.ts`, MailComposer) was run through the test-slot wrapper
(`pnpm exec tsx`) with placeholder addresses on `example.invalid`. The header block it produced:

```
X-Intelliflow-Record: 00000000-0000-4000-8000-000000000001
From: Sender <sender@example.invalid>
To: recipient@example.invalid
Reply-To: replies@example.invalid
Subject: Spike
Message-ID:
 <00000000-0000-4000-8000-000000000001.06ac072664971f3f@example.invalid>
Date: Sun, 22 Nov 2026 19:26:32 +0000
MIME-Version: 1.0
Content-Type: multipart/alternative;
 boundary="--_NmP-75285cd468cfa54f-Part_1"
```

Two things the matcher must cope with, and does:

- MailComposer writes the name as `X-Intelliflow-Record` (header names are case-insensitive).
  `dsn-parser.ts` reads the lower-cased key `x-intelliflow-record`, and `mime.test.ts` pins the case-insensitive match.
- The `Message-ID` is folded onto a continuation line. The parser unfolds headers before it compares the id; the
  value returned by `buildMime` (`messageId`) equals the unfolded header value.

## Part 2, still NEEDS_HUMAN: do Gmail and Microsoft return those headers in a delivery report

This needs a real send to a non-existent recipient from a connected Gmail and a connected Microsoft mailbox, then
reading the returned delivery-status notification. No Gmail or Microsoft test credentials are available to an agent
(the OAuth apps are not registered yet, see the attestation notes), so this part has not been run.

Until it is, the matcher stays in its fail-safe form (owner ruling Q12, issue #965): a report acts only when it
carries both the record header and the original Message-ID, and anything else is stored as UNMATCHED with no effect.
An unproven mailbox kind therefore degrades to "bounce reading finds nothing", never to a wrong suppression.
