# Product Requirements Document (PRD)

## Overview

| Field             | Value                                                         |
| ----------------- | ------------------------------------------------------------- |
| **Feature Name**  | AI that earns its place                                       |
| **Owner**         | pg-208                                                        |
| **Status**        | Draft                                                         |
| **Target Sprint** | 25-26                                                         |
| **Created Date**  | 2026-11-23                                                    |
| **Last Updated**  | 2026-11-23                                                    |
| **Related Tasks** | IFC-333, IFC-334, IFC-335, IFC-336, IFC-337                   |
| **Builds On**     | MVP-011, MVP-012, MVP-013, MVP-014, MVP-010, IFC-313, IFC-005 |
| **Maps To**       | PG-145, IFC-263 (matrix rows named below)                     |

## Problem Statement

Aurora is sold as an AI-powered CRM, but the AI that runs today does little a
customer would notice. The owner's words on 2026-11-23: "we sell ourselves as AI
powered CRM but our current AI features just do useless things".

Production facts (read-only database, 2026-11-23):

- The only AI chain that runs is lead scoring: 985 runs on claude-haiku, $0.37
  in total.
- 79 of 156 leads (51%) have the same score, 38, so the score ranks nobody.
- `ai_insights` holds 52 rows. They restate what the page shows, for example "X
  scores 72 and is CONTACTED, needs qualification".
- `contact_reply_drafts` holds 2 rows and `conversation_records` holds 5.
- The churn, next-best-action, sentiment, chat and `agent_actions` tables hold 0
  rows.
- `docs/company/product/feature-matrix.md` (last generated 2026-10-30) lists
  about 100 "AI" rows. Most are monitoring dashboards and developer tooling. The
  rows a customer would value (next-best-action and its action cards, deal
  insights and success metrics, the Lead Detail AI Chat Panel, the Similar
  Entity API, AI Insights from an ML model, Contact Email and AI Integration,
  the AI insight null-state) are still planned.

## Who it is for

The first customers are small UK service businesses (for example a handyman
company) that use Aurora with their own Gmail. Their day is: an enquiry arrives
by email, they reply when they can, they book a visit, they quote, they chase.
Value is measured in enquiries answered quickly and jobs not lost to silence.

## Principles

- Every output comes from real data: the customer's mail, settings, calendar and
  history. No placeholder, default or demo output is stored or shown. A missing
  signal is shown as missing.
- AI proposes, a person approves. Nothing is sent, booked or marked lost without
  the user's click (ADR-037).
- A model writes language or reads language. Numbers, prices, dates and slots
  come from the database, settings and calendar, and code checks that the text
  does not contain a figure that is not in them.
- Each feature is accepted on a measurement on the owner's own tenant with real
  mail, written to an evidence file. Where the sample is too small the evidence
  says "inconclusive" with n, and the claim is not made.
- Cost is reported from `chain_runs` for each feature.

## The five features

| #   | Row     | Sprint | Planned    | Feature                                                        |
| --- | ------- | ------ | ---------- | -------------------------------------------------------------- |
| 1   | IFC-333 | 25     | 2026-12-05 | Enquiry triage and extraction                                  |
| 2   | IFC-334 | 25     | 2026-12-12 | Reply draft on every new enquiry, with services, prices, slots |
| 3   | IFC-335 | 26     | 2026-12-19 | Follow-up autopilot ("To send" list)                           |
| 4   | IFC-337 | 26     | 2026-12-26 | Next best action that is an action, with a one-click button    |
| 5   | IFC-336 | 25     | 2026-12-09 | Lead scoring from real engagement signals, with reasons        |

Order of work: 1, then 5 and 2, then 3, then 4. Row IFC-336 is numbered after
IFC-334 and IFC-335 but is scheduled before them because its outputs feed them.

### 1. Enquiry triage and extraction (IFC-333)

Every inbound email from a synced mailbox is classified as new enquiry, existing
customer, supplier or spam/automated. The existing machine-mail guard
(`mail-sync-automated.ts`) stays and runs first. Only a new enquiry creates a
lead. For a new enquiry the job details (what work, address or postcode, when,
budget, phone) are extracted into the lead, each only when the email supports
it, and the lead links to the source email. Low confidence goes to a "needs a
look" list.

Builds on MVP-011 (mail read and unknown sender creates a lead). Maps to the
matrix row "Contact Email & AI Integration" (IFC-263): IFC-333 delivers the AI
reading, IFC-263 keeps webhook matching, contact scoring triggers and routing.

Measured on the owner tenant, real mail only: all inbound mail of the last 30
days (at least 50, n stated); a human checks a random sample of 50 and records
each verdict. Targets: class accuracy at least 90%; 0 spam or automated mails
became leads; 0 extracted phone or postcode values absent from the email; field
accuracy at least 85% for work, postcode and phone where the email states them;
cost per email stated.

### 2. Reply draft on every new enquiry (IFC-334)

Builds on MVP-012 (draft waits as "Reply drafted by Aurora: waiting for you"
with Send, Edit, Dismiss), IFC-313 (real thread) and MVP-013 (Google Calendar).
Adds a "Services and prices" settings page (jobs, price as fixed, from or
hourly, postcode area). The draft names the matching service, quotes only a
price in those settings (otherwise it says the business will confirm after a
look), and offers up to 3 real free slots from the connected calendar inside
availability (PG-202) and event type buffers (PG-203). Each draft records its
outcome: sent unchanged, sent after editing, dismissed, or still waiting after 3
days.

Measured on the owner tenant: the first 20 drafted enquiries or 30 days.
Acceptance rate (sent unchanged plus sent after editing, over drafts shown) and
unchanged share, with n. Targets: 0 prices absent from settings, 0 slots that
clash with a calendar event, 0 sends without a click, review target of 50% or
more accepted.

### 3. Follow-up autopilot (IFC-335)

When a lead, or a deal whose quote was sent, has had no reply in N days (tenant
setting, default 3), a follow-up draft appears in a "To send" list on the
dashboard and on its own page, with Send, Edit, Snooze, Dismiss. At most 2
follow-ups per lead, none after any reply, none to a person who objected or is
under restriction or erasure (IFC-315, IFC-316). The job only drafts. Only the
user's click sends. Builds on MVP-014 and MVP-010.

Measured on the owner tenant over 14 days: leads past N days, drafts created,
sent, edited, dismissed, snoozed, and replies within 7 days of a sent follow-up.
Targets: 0 follow-ups sent without a click, 0 drafts for suppressed people,
every lead past N days listed or given a stated reason.

### 4. Next best action that is an action (IFC-337)

For each lead and deal, one concrete step with a one-click button: send the
drafted reply, send the follow-up, book a visit with the slot filled in, send a
quote, or mark lost (with a confirmation). The step is chosen by plain rules
from real signals (last inbound, last outbound, reply time, stage age). The
model only writes the one-line reason, and a validator rejects a reason whose
numbers are not in the signals or that only restates the score or stage. It
replaces the restating `ai_insights` for leads and the "Run AI analysis" null
state on the lead page (history kept).

Maps to matrix rows "Next-best-action recommendations", "NBA action cards", "NBA
deal insights", "NBA success metrics" (all under PG-145, Backlog, sprint 53):
delivered here for small service businesses, and PG-145 keeps the multi-factor
impact scoring and dashboard remainder. Also supersedes the lead null-state UX
of "AI Insights from ML model" (PG-162) and "AI Insight Null-State UX"
(IFC-220), both Completed, history kept.

Measured on the owner tenant over 14 days or at least 30 suggestions: click
through (clicked over shown), completion within 24 hours, dismissed share, count
by action type. Targets: 100% of suggestions cite real signals, 0 restating
suggestions, 0 actions without a click, review target of 30% or more click
through.

### 5. Lead scoring from real engagement signals (IFC-336)

Replace the inputs with signals that exist: replies, reply speed both ways,
enquiry completeness (IFC-333 fields present), job value (stated budget or the
matched service's price range), recency and open or click engagement. Each score
stores 2 to 4 reasons naming real signals. A missing signal lowers confidence
and is listed as missing, never counted as zero. The cause of the constant 38 is
traced and removed. Builds on IFC-005 and IFC-212 and reuses the PG-148 score
distribution view.

Measured on the owner tenant: score distribution before and after. Targets: no
single score above 15% of leads (today 51%), at least 5 of 10 bands populated,
every score has at least 1 reason. Back-check: over leads marked won or lost (n
stated) the top third by score has a higher won rate than the bottom third.
Fewer than 20 closed leads is reported as inconclusive, not as a pass.

## Rows deliberately not duplicated

| Matrix row (CSV id)                      | Decision                                               |
| ---------------------------------------- | ------------------------------------------------------ |
| Lead Detail AI Chat Panel (IFC-235)      | Kept as is. Not part of the five features.             |
| Similar Entity API pgvector (IFC-218)    | Kept as is. Not part of the five features.             |
| AI Insights from ML model (PG-162)       | Completed. Lead null state superseded by IFC-337.      |
| AI Insight Null-State (IFC-220)          | Completed. Lead null state superseded by IFC-337.      |
| Contact Email & AI Integration (IFC-263) | Note added: AI reading of mail is IFC-333, rest stays. |
| Next-best-action rows (PG-145)           | Note added: delivered for lead and deal by IFC-337.    |

The feature matrix is generated from the sprint plan, so these notes are carried
in the descriptions of PG-145 and IFC-263 in `Sprint_plan.csv` and reach the
matrix on its next generation.

## Privacy and safety

Inbound email is personal data. The chains run per tenant, use only that
tenant's data, and honour restriction, objection and erasure (IFC-315, IFC-316).
Mail text is not copied into logs beyond what `chain_runs` already stores under
the existing AI logging policy. A model failure leaves the mail unclassified and
visible, it never produces a default.

## Non-Goals

- Auto-sending any message, booking or status change.
- New dashboards for monitoring or developer tooling.
- Bringing back the restating `ai_insights` for leads.
- Quotes pages (PG-095 to PG-098): row IFC-335 uses the quote email or the deal
  stage until they exist.

## Acceptance Criteria

- [ ] Each of IFC-333 to IFC-337 has an `owner-tenant-measurement.md` in its
      attestation folder with n stated and every target above reported, met or
      not met.
- [ ] No stored AI output is a placeholder, a default or a figure absent from
      the tenant's data.
- [ ] No message is sent, slot booked or lead marked lost without a user click.
- [ ] Cost per feature is reported from `chain_runs`.
