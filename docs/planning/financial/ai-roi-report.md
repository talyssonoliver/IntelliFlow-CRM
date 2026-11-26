# AI Return on Investment Report

## IntelliFlow CRM - AI features, measured on production data

**Document ID:** IFC-027-AI-ROI **Date:** 2026-11-21 **Purpose:** Gate 2
investment decision support. Prepared for the owner. Nothing here is a decision.

An earlier version of this report projected a 140% year-one ROI and a 460%
three-year ROI. Those figures had no source and are removed. Every number below
was read from the production database (the Leangency tenant, read-only) on
21/11/2026, or comes from a named file.

## 1. Summary

| Question                      | Answer                                                                        |
| ----------------------------- | ----------------------------------------------------------------------------- |
| What does the AI cost to run? | About US$0.06 a day for lead scoring. US$0.32 in total since 15/11.           |
| Is the cost a problem?        | No. At this rate a year costs about US$23.                                    |
| Does it produce value?        | Lead scoring runs and ranks leads sensibly. Nothing else has produced output. |
| Can ROI be calculated?        | Not yet. The cost is known. No revenue is tied to the AI.                     |
| What is the gate's own test?  | "AI adds measurable value, ROI positive". Value is not yet measurable.        |

## 2. AI features in production

| Feature                 | Code                                         | Output in production on 21/11                                                                |
| ----------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Lead scoring            | `apps/ai-worker/src/jobs/scoring.job.ts`     | 155 of 155 leads scored. 832 model runs, all successful.                                     |
| Reply drafts (MVP-012)  | `apps/ai-worker/src/jobs/reply-draft.job.ts` | 0 drafts. `contact_reply_drafts` and `auto_response_drafts` are both empty.                  |
| Lead and sales insights | `lead_ai_insights`, `ai_insights`            | 155 lead insight rows. 40 sales insights, all status NEW: 0 viewed, 0 acted on, 0 dismissed. |
| Enquiry leads (MVP-011) | Mail sync                                    | Not provable from the data. See section 4.                                                   |

Reply drafts are written with status DRAFT and are never sent without review
(ADR-037). Zero drafts means the feature has never produced output in
production. The data cannot say whether that is because no reply needed one or
because it is not switched on. That is a gap to close.

## 3. What the AI costs

Source: table `chain_runs` (one row per model call, with tokens and cost).

| Measure         | Value                                |
| --------------- | ------------------------------------ |
| Period          | 15/11 16:00 to 21/11 15:54           |
| Model           | claude-haiku-5-5, chain LEAD_SCORING |
| Runs            | 832, all succeeded                   |
| Input tokens    | 1,233,463                            |
| Output tokens   | 385,846                              |
| Total cost      | US$0.316318                          |
| Cost per run    | about US$0.00038                     |
| Average latency | about 3 seconds per run              |

Cost by day (US$, from `chain_runs`):

| Day   | Runs | Cost   |
| ----- | ---- | ------ |
| 16/11 | 120  | 0.0441 |
| 17/11 | 125  | 0.0472 |
| 18/11 | 127  | 0.0491 |
| 19/11 | 140  | 0.0538 |
| 20/11 | 152  | 0.0585 |
| 21/11 | 167  | 0.0631 |

21/11 is a part day (to 15:54) and includes the re-score of all 155 leads. At
the 21/11 rate a month is about US$1.9. The cost grows with the number of leads,
not with the number of users, so it stays small.

### What the cost data does not cover

- `chain_runs` records only lead scoring. Other AI calls are not metered here:
  contact tag suggestions, insights generation, and reply drafts (none have
  run). Register row 29 shows one unmetered cost: on 19/11 a loop in the contact
  page made repeated paid Haiku calls until the rate limit stopped it. The size
  of that loop is not in the data.
- No cost ceiling is set for this tenant (`tenant_ai_config` has no row for it,
  so `monthlyCostCeilingCents` is unset).
- No currency conversion is applied. The figures are in US dollars as stored.

### Method to get the full cost

1. Read the provider's usage page for the API key in use, for 15/11 to today.
   Compare with US$0.316 for scoring. The difference is the unmetered spend.
2. Write a `chain_runs` row for every AI call (tag suggestion, insights, reply
   draft), so the table becomes the single source.
3. Set a monthly ceiling for the tenant in `tenant_ai_config`.

## 4. What the AI did on real data

All figures from the production database on 21/11.

### Lead scoring

- 155 leads, 155 scored. 154 have a last-contacted date.
- Scores: average 34.3, lowest 12, highest 78. Three leads score 60 or more and
  four score 50 or more.
- Re-score on 21/11 (register row 49): all 155 re-scored between 15:51 and
  15:54.
- Average score by lead status:

| Status    | Leads | Average score |
| --------- | ----- | ------------- |
| QUALIFIED | 1     | 78.0          |
| CONVERTED | 1     | 62.0          |
| CONTACTED | 137   | 35.8          |
| NEW       | 1     | 42.0          |
| LOST      | 15    | 14.4          |

- The top three scores are 78 (the only QUALIFIED lead, Acme Handyman), 72, and
  62 (the only CONVERTED lead).
- Caution: the 21/11 re-score feeds in opens, clicks and replies (row 49), so
  leads that replied score higher partly because they replied. The pattern is
  encouraging but it is not proof that the score predicts who will buy.
- 150 of 155 are marked NEEDS_REVIEW. The review threshold is confidence 0.85
  and cold leads score below it. The list therefore shows a red "?" on almost
  every lead. The score is not the problem. The flag is.

### Reply drafts

- 0 drafts exist. No value measured.

### Insights

- 40 sales insights (37 recommendations, 2 trends, 1 prediction), created 02/11
  to 21/11. None viewed, acted on or dismissed.
- 155 lead insight rows (a next best action on every lead, average conversion
  probability 27.25).
- Nobody has opened them, so their value is unmeasured.

### Enquiry leads

- 34 leads were created on 17/11, 19/11 and 20/11 (6, 20 and 8). The `source`
  field says EMAIL for 154 of 155 leads, which covers both Leangency's own
  outreach sync and real enquiries. The data cannot separate them, so the number
  of auto-created enquiry leads is not stated. Register row 30 shows the enquiry
  path was still open on 19/11.

## 5. ROI

- Cost: about US$1.9 a month for scoring, plus unmetered calls.
- Benefit: no revenue, saved hours or conversions are tied to the AI. The leads
  that converted or qualified came from the owner's outreach. The score did not
  cause them.
- ROI is therefore not computable. A percentage would be invented.
- What would make it computable: one pilot customer using scoring and drafts for
  a month, with the time saved per day written down by the user.

## 6. Spend to date

The Gate 2 attestation (2026-02-17) records tranche T1 (£500) as approved and T2
and T3 as pending the remediation milestones in
`docs/planning/gate-2/remediation-plan.md`. This report does not change that.
