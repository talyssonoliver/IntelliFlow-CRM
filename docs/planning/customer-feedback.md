# Customer Feedback Summary

**Document ID:** IFC-027-CUSTOMER-FEEDBACK **Date:** 2026-11-21 **Status:**
Prepared for the Gate 2 decision. Nothing here is a decision.

## What this file is

The real feedback on file about IntelliFlow CRM (Aurora) and its AI features, as
of 21/11/2026. Each item names its source so it can be checked. Nothing is
paraphrased into a score or a testimonial.

An earlier version of this file reported 25 beta users and named testimonials.
That never happened and it was removed on 2026-10-06. This version replaces the
empty placeholder with what really exists.

## The headline

- No paying customer and no outside beta user has given feedback on the AI
  features. Aurora has no outside customers yet.
- The only user is the owner, running Leangency's own sales on it.
- The one pilot candidate is Sam at Acme Handyman. He is a lead in Aurora
  (status QUALIFIED, score 78). No feedback from him about the AI is on file.

## Feedback from the owner (the only real user)

| Date  | Source                                     | What was said                                                                                                        |
| ----- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| 15/11 | Owner, answering a pilot-customer plan     | "Aurora isn't ready to receive customers yet, I've been testing it on our own Leangency and my remark is 2 of 10"    |
| 17/11 | Owner, opening the customer-issue register | "please note them to avoid happening in future and don't happen with our customers when they start using the system" |

Result of the 15/11 answer: no pilot offers, demos or pricing go to outsiders
until the owner says Aurora is ready.

## Rows about the AI features in the customer-issue register

Source: `ops/reviews/aurora-customer-issue-register.md` (53 rows; these are the
ones about AI). Quoted as written there.

| Row | Found | What the user saw                                                               | State on 21/11                                                                                                                                                                                   |
| --- | ----- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 29  | 19/11 | Pages failed to load parts (429 Too Many Requests)                              | Root cause: a contact-page effect started the next AI call after each AI answer, "a paid Haiku loop" until 429. Fix in the ifc-074 gate.                                                         |
| 34  | 19/11 | A lead from an email enquiry showed "Not scored / AI analysis not run yet"      | FIXED 21/11 (data): 0 of 155 leads unscored.                                                                                                                                                     |
| 49  | 21/11 | Lead scores 28 to 42 with a red "?"; Greenleaf 62 "low confidence"              | PART FIXED. All 155 re-scored (avg 34, max 78). Still open: 150 of 155 show the red "?" because the review threshold is confidence 0.85 and cold leads score below it. Routed to the UI partner. |
| 30  | 19/11 | A new enquiry by email from an unknown sender was dropped, not made into a lead | OPEN at the time (next MVP-011 PR). This is the path that creates enquiry leads.                                                                                                                 |

## Friday flow walks (S-0824)

Sources: `ops/reviews/friday-flow-2026-11-20/REPORT.md` and
`ops/reviews/friday-flow-2026-11-21/REPORT.md`.

- Nine steps, each on a 1440 px and a 390 px screen. The owner's score for every
  step is still blank ("\_\_\_\_") in both reports. He has not scored them.
- These are the agent's observations from the screens, not customer words. The
  21/11 report says: "Lead scores read low and uncertain (28 to 42 with a red
  "?" on the list; Greenleaf 62/100 "low confidence, needs review")".
- The same report lists 111 follow-ups all reading "Overdue by 40 days". That is
  not an AI fault. It is register row 46.
- Rule in both reports: "Below 7 on average means Aurora is not launched."

## What is missing

- Any feedback from Sam (Acme Handyman) about the AI. Ask him once the owner
  says pilots may start.
- The owner's step scores for the Friday walks.
- Any feedback on reply drafts or insights. No reply draft exists in production
  and no insight has been opened (see
  `docs/planning/financial/ai-roi-report.md`).

## How to collect real feedback next

1. The owner scores each Friday walk step (a number and one line).
2. When the owner allows a pilot, ask the pilot user three things after one
   week: did the lead score change what you did, did you use a reply draft, and
   what would you pay for.
3. Record each answer here with source, date and the raw words.
