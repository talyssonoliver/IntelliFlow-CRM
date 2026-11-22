# Investment Gate 3 Analysis

## £3000 decision on scaling - IntelliFlow CRM (Aurora)

**Document ID:** IFC-034-GATE3-ANALYSIS **Date:** 2026-11-22 **Decision owner:**
Talysson (the owner) **Status:** Decided 2026-11-22: HOLD (see "Decision").

This pack follows the shape of Gate 2 (`docs/planning/gate-2/`). Every number
was read on 22/11/2026 from production (read-only), the Railway API, GitHub, the
uptime log, the issue register, the project tracker or a repo file named in
section 9. Where data could not be read, section 8 says so. Nothing is estimated
and presented as measured.

## Decision

**Decided by Talysson (the owner), 2026-11-22: HOLD** (his answer in Aurora's
modal, "Hold (Recommended)").

- No scaling spend now.
- Close the stability gaps first: main CI pass rate 82.5%, load test p95 1.1 s
  against the 200 ms target, and the 13 open register rows.
- Get a first outside customer.
- **Review date: about 2026-12-21**, together with Gate 2. Re-run the queries in
  this pack and decide again then (section 11, step 5).

## 1. Decision needed

Scale, hold or cut. Choose one. Gate 3 is the £3000 tranche (row IFC-034,
critical path, due 28/11/2026). The row's definition of done is: "Scale decision
with modern stack validated".

## 2. Recommendation: HOLD

Do not release the £3000 for scaling now. Keep Aurora running on the current
free and low-cost plans, fix the open stability gaps, and put the first outside
customer on it. Decide again when that customer has used it for a month, which
is the same review window as Gate 2 (about 2026-12-21).

**The single deciding fact:** Aurora has no paying customer and its automation
has never been used by one. Production holds 0 paid subscriptions, 0 workflow
definitions and 0 workflow runs. The only user is the owner. There is nothing
yet to scale, and the gate's own tests (ROI positive, "first paying customer")
cannot be shown.

## 3. Gate 3 tests against the data

The Gate 3 success criteria come from `docs/planning/financial/business-case.md`
(section "Gate 3").

| Test                        | Finding (22/11/2026)                                                                                                                        | Met     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 50% fewer manual tasks      | No baseline was ever recorded and the `tasks` table has 0 rows. Follow-ups are computed from leads, not stored. Not measurable.             | No      |
| Workflow engine operational | 0 workflow definitions and 0 workflow executions in the Leangency tenant. The task-automation run log is also empty.                        | No      |
| First paying customer       | 0 rows in `stripe_subscriptions`. 6 tenants exist; the one with data is Leangency itself, with 1 user (the owner), on the CUSTOM plan.      | No      |
| Stability proven            | Clean for the 5 days the uptime check has been logged. A real load test failed its latency budget (section 4). Sentry data is not readable. | Partial |
| Automation ROI calculated   | Cost is known (about US$1.2 to US$1.9 a month for AI). Value is not measurable: no customer, no time-saved record.                          | No      |

## 4. Stability (last 30 days, 23/10 to 22/11)

### Uptime

Source: `ops/aurora-uptime/logs/site-uptime.jsonl`, written by the uptime check
that replaced the Sentry monitor on 17/11.

| Measure                       | Result                                                                                  |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| Window covered by the log     | 17/11 19:04 to 22/11 10:50 UTC: **5 of the 30 days**                                    |
| Check runs                    | 224 (about every 30 minutes), no gap longer than 1 hour                                 |
| Runs with any probe failing   | **0** (static asset, API `/health`, live-updates `/health`; home page 19 of 19 up)      |
| Uptime over the logged window | 100% of the sampled checks. A 30-minute sample cannot show an outage shorter than that. |
| Uptime for 23/10 to 16/11     | **Not available.** No monitor was running.                                              |

### Railway deployments (read-only API, production environment)

Statuses are final states. REMOVED means a newer deployment replaced it, not a
failure.

| Service              | Deployments in 30 days | Failed | Note                          |
| -------------------- | ---------------------- | ------ | ----------------------------- |
| api                  | 163                    | 0      | 1 sleeping now, rest replaced |
| combined-worker      | 146                    | 2      | 1 live (SUCCESS)              |
| ai-worker            | 5                      | 1      |                               |
| ws (live updates)    | 4                      | 0      | 1 sleeping now                |
| Redis                | 4                      | 0      | 1 live                        |
| events-worker        | 3                      | 0      |                               |
| notifications-worker | 2                      | 0      |                               |
| ingestion-worker     | 1                      | 0      |                               |
| **Total**            | **328**                | **3**  | 0.9% of deployments failed    |

A deployment count is not an uptime figure. It shows how often production
changed: the API was redeployed about 5 times a day.

### Main branch CI (GitHub Actions, branch main, 23/10 to 22/11)

Pass rate is success divided by success plus failure. Cancelled runs are shown
but left out of the rate.

| Workflow                     | Success | Failure | Cancelled | Pass rate |
| ---------------------------- | ------- | ------- | --------- | --------- |
| CI Pipeline                  | 156     | 33      | 79        | **82.5%** |
| Main Full Suite (from 15/11) | 101     | 3       | 24        | 97.1%     |
| Release                      | 235     | 12      | 43        | 95.1%     |
| Promote to Production        | 142     | 14      | 0         | 91.0%     |

The 82.5% pass rate of the main CI Pipeline is the weakest stability number
here.

### Incidents and customer-visible faults

- The incident ledger (`ops/incidents.md`) has **no IntelliFlow row in the
  window**. Its last IntelliFlow row (Redis and worker outage) was restored on
  05/10.
- From the customer-issue register, three production events in the window: 17/11
  the live site stopped updating after 14:54 because the free plan's
  100-deployments-a-day limit was used up (row 23, still OPEN: the workflow fix
  is not merged); 19/11 pages returned 429 Too Many Requests when opened in
  quick succession (row 29, cause found, not closed); 20/11 the free Vercel CPU
  allowance reached 91% (row 22).
- 22/11: the AI monitoring Drift page crashes on every size (row 54, OPEN) and
  Billing Usage shows "Unable to load usage data" (row 56, OPEN).

### Customer-issue register (`ops/reviews/aurora-customer-issue-register.md`)

| Count                                                            | Rows |
| ---------------------------------------------------------------- | ---- |
| Rows in the register                                             | 56   |
| FIXED                                                            | 35   |
| of which verified, with proof in the state cell                  | 25   |
| of which with a PR in the Fix column and no live check           | 10   |
| Fixed in code but unproven (no live case to check yet)           | 3    |
| OPEN                                                             | 13   |
| Part fixed, in progress, root cause only, blocked or "not a bug" | 5    |

So 25 of 56 rows (45%) are fixed with evidence on record, and 35 of 56 (63%) are
marked fixed.

### Load test (IFC-033, 22/10, `artifacts/reports/load-test-report.html`)

A real k6 run against the production API: 123 seconds, 185 leads created, 20
lead-to-deal conversions, error rate 0%. Throughput passed (about 5,435 leads an
hour against 5,000). **The p95 latency failed: 1,137 ms against a 200 ms
budget** (measured from the owner's PC, so it includes the network). The row was
closed under an owner waiver, with p95 recorded as a measured fail. No
1,000-user test exists.

### Not available

- **Sentry:** not readable (owner sign-in pending). No error rate, crash-free
  rate or issue count is reported here.
- **Railway restarts and crashes** inside a running deployment. Only deployment
  status was read.

## 5. Automation: what it does today (production, Leangency tenant, read-only)

| Automation                  | Result on 22/11/2026                                                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Lead scoring                | 156 of 156 leads scored; 833 model runs, all successful (15/11 to 22/11). Average 34, highest 78. 151 of 156 show NEEDS_REVIEW (low confidence). |
| COA import (outreach sends) | 303 Resend email records: 300 sent, 3 bounced. The register counts 299 imported on 20/11. 154 of 156 leads carry the `coa-pipeline` tag.         |
| Enquiry leads from email    | At most 1 lead (source EMAIL, no COA tag, status NEW). The enquiry-to-lead step (MVP-011, register row 30) is still OPEN.                        |
| Reply drafts (MVP-012)      | **1** draft, created 22/11, status DRAFT, confidence 0.6, not sent. Gate 2 found 0 on 21/11. The auto-response draft table has 0 rows.           |
| Sales insights              | 47 insights (40 on 21/11), 0 viewed, 0 acted on, 0 dismissed. 156 lead insight rows.                                                             |
| Workflow engine             | 0 definitions, 0 executions.                                                                                                                     |
| Tasks                       | 0 stored tasks.                                                                                                                                  |
| Email open tracking         | 1 open and 1 click on 316 email records. Tracking was only switched on 20/11 (register row 41).                                                  |
| Deals                       | 1 opportunity, stage QUALIFICATION, value £0.                                                                                                    |

Compared with Gate 2 (21/11), the only new output is one unsent reply draft and
seven more unread insights.

## 6. Cost and ROI

### What it costs today

| Item                       | Cost                                                                                                         | Source                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| AI (lead scoring, metered) | US$0.317 in the 8 days 15/11 to 22/11, about US$1.2 a month (Gate 2 quoted US$1.9 on a 6-day window)         | `chain_runs`                                               |
| Railway (all services)     | About US$1.8 in the current cycle; US$20 is the spend limit                                                  | `ops/work/platform/free-quota/latest.md` (estimate, 21/11) |
| Vercel                     | £0 on Hobby, but **3.67 of 4 hours (91.8%)** of the Active CPU allowance used. At 100% every project pauses. | same file                                                  |
| GitHub Actions             | 965 of 2,000 minutes (48.2%), all private repos together                                                     | same file                                                  |

### ROI

The ROI cannot be calculated. The cost side is small and known. The value side
is zero because no revenue and no customer time-saving is tied to the
automation. The earlier 140% projection was removed in Gate 2 and is not used. A
figure such as "hours saved" would be invented, so none is given.

## 7. Scale plan: what scaling needs

### Options for the £3000

The Gate 2 pack priced work at £25 an hour (an assumption from the repo's
earlier cost model). On it, £3000 is 120 hours.

| Option                | What it is                                                                                                            | Spend                                                                                 | Expected effect                                                       | Risk                                                                                        |
| --------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| A. Scale              | Fund WhatsApp (IFC-331 deploy), paid hosting headroom, load and uptime hardening, onboarding for more customers       | Up to £3000                                                                           | Capacity for customers who do not exist yet                           | Builds capacity on a product the owner rated 2 of 10 on 15/11 and has held back from pilots |
| B. Hold (recommended) | Spend nothing from the £3000 now. Fix the open register rows and the p95 gap inside current plans. Onboard one pilot. | £0 now. The first call on the tranche is the pilot's setup, if the owner releases it. | Produces the missing evidence: a customer, real usage, a measured ROI | Slower headline progress. Depends on the owner saying Aurora is ready for a pilot.          |
| C. Cut                | Stop investing in Aurora beyond running costs                                                                         | Saves almost nothing (AI about US$1.2 a month, Railway under its US$20 limit)         | None worth having                                                     | Stops work that has a clean uptime record and a working scoring signal                      |

The "expected effect" column is judgement, not measurement. No data predicts it.

### What scaling to more customers needs (facts)

- **WhatsApp (ADR-089).** WAHA Core is Apache-2.0, so there is no licence cost.
  Measured memory is about 322 MiB per idle container, which is about US$3.3 a
  month just to exist. Per tenant: about US$3.4 with one container each, or
  about US$0.4 with one shared container for 10 tenants (unpaired floor). With a
  paired session at the design doc's unverified 200 MB: about US$5.3 and about
  US$2.3. These sit inside the US$5 or US$20 of credit a Railway plan already
  includes for the first few tenants. The ADR says the owner approves the
  Railway spend before IFC-331 deploys anything. The WhatsApp seam (IFC-320) is
  built and the design (IFC-322) is decided.
- **MVP rows left.** 14 MVP rows: 9 Completed, 5 In Progress (MVP-001 email end
  to end, MVP-011 read a customer's Gmail, MVP-012 approve an AI-drafted reply,
  MVP-013 Google Calendar, MVP-014 who is waiting). Mail is the first need of a
  customer, and 3 of the 5 are mail.
- **Schedule.** The tracker's critical path (31 tasks, 79% complete) reports a
  Schedule Performance Index of **0.66** and a schedule variance of -79,440
  minutes (about 1,324 hours), status critical. The bottleneck task is IFC-030.
  IFC-034 itself shows Backlog with a modelled start of 24/11.
- **Free-plan ceiling.** The Vercel CPU allowance (91.8%) is the first limit
  more customers would hit. Every page view and function run counts, and a pause
  stops all sites, client sites included. Scaling needs either the owner lifting
  the "no paid upgrade" rule (his ruling of 20/11) or more static pages first.
  That is his call.
- **Latency.** The p95 of 1,137 ms against 200 ms has not been fixed or
  re-measured since 22/10.

## 8. Data that could not be read

| Data                                        | Why                                                                     |
| ------------------------------------------- | ----------------------------------------------------------------------- |
| Sentry errors, crash-free rate, issue count | Not accessible. Owner sign-in is pending.                               |
| Uptime from 23/10 to 16/11                  | No monitor existed. The log starts 17/11 19:04.                         |
| Uptime while the owner's PC was off         | The check runs only while the PC is on. The log has no gap over 1 hour. |
| Railway process restarts and crash loops    | Not read. Only deployment status was read.                              |
| Manual tasks before automation (50% test)   | No baseline exists.                                                     |
| Time saved per user                         | No user other than the owner has recorded any.                          |
| Latency after 22/10                         | No load test since the one on 22/10.                                    |
| Vercel and Railway invoices                 | The cost lines are the ops gauge's estimate of 21/11, not an invoice.   |

## 9. Sources

- Production database, read-only, 22/11/2026, Leangency tenant: `leads`,
  `chain_runs`, `contact_reply_drafts`, `auto_response_drafts`, `ai_insights`,
  `lead_ai_insights`, `email_records`, `lead_activities`, `opportunities`,
  `tasks`, `workflow_definitions`, `workflow_executions`,
  `task_automation_runs`; `stripe_subscriptions` and `tenants` as counts only.
- Railway GraphQL API, read-only, deployment lists for the 8 services of the
  production environment, 22/11/2026.
- `gh run list`, branch main, workflows "CI Pipeline", "Main Full Suite",
  "Release" and "Promote to Production", created on or after 23/10/2026.
- `ops/aurora-uptime/logs/site-uptime.jsonl`, `ops/incidents.md`,
  `ops/reviews/aurora-customer-issue-register.md`,
  `ops/work/platform/free-quota/latest.md`.
- Tracker `GET /api/schedule/critical-path`, 22/11/2026 10:52 UTC.
- `docs/architecture/adr/ADR-089-waha-tenant-isolation.md`,
  `docs/planning/financial/business-case.md`,
  `docs/planning/financial/budget-approval.md`,
  `artifacts/reports/load-test-report.html`,
  `docs/planning/gate-2/investment-gate-2-analysis.md`,
  `docs/planning/customer-feedback.md`.

## 10. What would change the recommendation

| If this becomes true                                                        | Then                                                      |
| --------------------------------------------------------------------------- | --------------------------------------------------------- |
| One outside customer pays and uses scoring, drafts or workflows for a month | Move to Scale, in steps, starting with mail and WhatsApp. |
| The p95 is re-measured under 200 ms and main CI stays above 95% for 30 days | The stability test is met and the case for Scale grows.   |
| Vercel CPU reaches 100% or the owner lifts the free-plan rule               | Hosting becomes a funded item inside Scale.               |
| The owner scores Aurora below 7 on the next Friday walk                     | Stay on Hold. Spend on the basics, not on capacity.       |

## 11. Next steps if the owner chooses Hold

1. Fix the 13 open register rows that touch a first customer's path (mail,
   enquiries to leads, tasks).
2. Re-run the k6 test and record p95. Set up an uptime check that does not
   depend on the PC being on.
3. Get Sentry read access so the stability test has error data.
4. Owner says when Aurora is ready for one pilot (Robert at West London Handyman
   is the candidate).
5. Re-run the queries in this pack and decide again about 2026-12-21.

## 12. The binary artifacts in the row

The row's definition of done names `automation-roi-analysis.xlsx`,
`stability-report.pdf` and `scale-plan.pptx`. Gate 1 and Gate 2 were both
reviewed from markdown (`decision-gate-1.md`, `investment-gate-1-deck.md`,
`gate-2/investment-gate-2-analysis.md`), and the repo holds no generator for
gate binaries, so none are produced here. The owner's review should accept this
file instead: section 6 for the ROI sheet, section 4 for the stability report
and section 7 for the scale plan.
