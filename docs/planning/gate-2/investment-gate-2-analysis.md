# Investment Gate 2 Analysis

## £2000 decision on the AI features - IntelliFlow CRM (Aurora)

**Document ID:** IFC-027-GATE2-ANALYSIS **Date:** 2026-11-21 **Decision owner:**
Talysson (the owner) **Status:** Decided 2026-11-21: MAINTAIN (see "Decision").

An earlier version of this file recommended GO and quoted sprint counts and
eight AI features. It is replaced. This version uses only data read from
production on 21/11/2026 and files named below.

## Decision

**Decided by Talysson (the owner), 2026-11-21: MAINTAIN** (his answer in
Aurora's modal, "Maintain (Recommended)").

- Keep the AI features running and make them provable.
- No new AI spend now.
- **Review date: about 2026-12-21**, after a month of pilot use. Re-run the
  queries in the ROI report and decide again then (section 7, step 7).

## 1. Decision needed

Expand, maintain or cut the AI features. Choose one.

## 2. Recommendation: MAINTAIN

Keep the AI features running and spend a small part of the £2000 on making them
provable. Do not spend the rest on new AI features yet. Review again when a
pilot customer has used scoring and reply drafts for a month.

**The single deciding fact:** only the owner has used the AI features, and only
lead scoring has produced output. There are 0 reply drafts, and 0 of 40 insights
have been opened. There is nothing yet to scale. The cost is not the reason: it
is about US$0.06 a day.

## 3. Evidence in one page

Full detail in `docs/planning/financial/ai-roi-report.md` and
`docs/planning/customer-feedback.md`.

| Question                  | Finding (21/11/2026)                                                                                                                |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Cost to run               | US$0.316 in six days (832 runs). About US$1.9 a month. Scoring only is metered.                                                     |
| Lead scoring output       | 155 of 155 leads scored. Average 34, highest 78.                                                                                    |
| Does the score look right | LOST leads average 14.4, CONTACTED 35.8, the one QUALIFIED 78, the one CONVERTED 62. Partly circular: the score now counts replies. |
| Reply drafts (MVP-012)    | 0 drafts in production.                                                                                                             |
| Insights                  | 40 sales insights, all unopened. 155 lead insight rows.                                                                             |
| Trust in the score        | 150 of 155 leads show a red "?" (needs review), because the confidence gate is 0.85.                                                |
| Customer feedback         | None from outside. Owner rated Aurora 2 of 10 on 15/11 and has said no pilots until he says it is ready.                            |
| Pilot                     | Sam (Acme Handyman) is a QUALIFIED lead. No AI feedback from him on file.                                                           |
| Gate test                 | "AI adds measurable value, ROI positive". Cost known, value not measurable yet.                                                     |

## 4. What £2000 could buy

The repo's earlier cost model priced work at £25 an hour. That rate is an
assumption carried from `docs/planning/financial/ai-roi-report.md` before this
rewrite. On it, £2000 is 80 hours of work. The AI running cost is a rounding
error beside that.

| Option                    | What it is                                                                                                                                                                                                                    | Spend (at £25 an hour, assumed)                        | Expected effect                                                                                                                   | Risk                                                                                             |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| A. Expand                 | Build more AI features (wider reply automation, new insight types, a stronger model)                                                                                                                                          | Up to £2000                                            | More surface for the owner to test. No customer effect until a customer exists.                                                   | Builds on features nobody has used. The 15/11 rating of 2 of 10 says the basics are the problem. |
| B. Maintain (recommended) | Keep scoring on. Make the AI provable: meter every AI call, set a cost ceiling, show the red "?" only when confidence is really low, switch on and test reply drafts on a real thread, make insights visible on the lead page | The approved T1 tranche (£500) or less. Hold the rest. | A trustworthy score on the lead list. Real data on drafts and insights within one or two weeks. The gate test becomes measurable. | Slower headline progress. Needs the owner to actually use drafts and insights.                   |
| C. Spend on customers     | Use the money to get one pilot customer in (setup, onboarding time, a support week)                                                                                                                                           | Up to £2000                                            | Produces the missing evidence: real feedback and time saved.                                                                      | Blocked by the owner's ruling: no pilots until he says Aurora is ready.                          |
| D. Cut                    | Switch the AI off                                                                                                                                                                                                             | Saves about US$1.9 a month                             | None worth having.                                                                                                                | Removes the only feature with a working signal (the score ranks outcomes). Saves almost nothing. |

Notes on the table:

- The "expected effect" column is a judgement, not a measurement. There is no
  data that predicts the effect of A or C. B is the only option whose effect can
  be checked quickly against the same tables used in the ROI report.
- Option C may be the right use of the larger part of the £2000 later. The
  owner's ruling on pilots comes first.

## 5. Risks to know about

- **Unmetered spend.** Only scoring is metered. A paid loop ran on 19/11
  (register row 29) and its cost is not recorded. Set a ceiling and meter every
  call before spending more on AI.
- **Misleading red flag.** 150 of 155 leads show "needs review". A user will
  stop trusting a flag that is always on. Fix is routed to the UI partner.
- **Circular proof.** The score looks good against outcomes partly because it
  counts replies. It is not yet proof of prediction.
- **No outside user.** Every conclusion rests on one user, who is also the
  builder's owner.
- **No outside feedback.** The earlier claim of 25 beta users was false and was
  removed. The honest figure is zero.

## 6. What would change the recommendation

| If this becomes true                                                                       | Then                                                 |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| Reply drafts and insights are used by the owner for two weeks and he scores them 7 or more | Move to Expand, in steps, with the cost ceiling set. |
| A pilot customer says the score or drafts saved them time, in their own words              | Expand, and fund onboarding (option C).              |
| The provider bill is far above US$1.9 a month                                              | Find the unmetered calls before any other spend.     |
| The owner's walk scores stay below 7                                                       | Stay on Maintain. Spend on the basics, not on AI.    |

## 7. Next steps if the owner chooses Maintain

1. Meter every AI call into `chain_runs` and set `monthlyCostCeilingCents`.
2. Compare provider usage with US$0.316 for the same dates.
3. Show the red "?" only on genuinely low confidence (register row 49).
4. Check that reply drafting is switched on for the tenant and produce one draft
   from a real thread.
5. Show lead insights on the lead page so they can be opened.
6. Owner scores the Friday walk steps.
7. Re-run the queries in the ROI report and decide again.

## 8. Sources

- Production database, read-only, 21/11/2026: `chain_runs`, `leads`,
  `lead_ai_insights`, `ai_insights`, `contact_reply_drafts`,
  `auto_response_drafts`, `tenant_ai_config`.
- `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv`: rows IFC-026
  (Completed) and IFC-027 (In Progress, due 28/11/2026).
- `.specify/sprints/sprint-15/attestations/IFC-027/attestation.json`: verdict
  PARTIAL, T1 approved, T2 and T3 pending. It is not changed by this pack.
- `ops/reviews/aurora-customer-issue-register.md` and the Friday flow reports of
  20/11 and 21/11.
- Gate 1 for comparison: `docs/planning/decision-gate-1.md`.
