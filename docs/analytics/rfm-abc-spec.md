# RFM + ABC Segmentation Spec — IntelliFlow CRM

**Purpose**: Define the segmentation model for prioritizing customer accounts
and outreach. RFM + ABC scores are calculated by a scheduled job in
`apps/ai-worker` and surfaced via the Segmentation Coverage dashboard (see
`docs/analytics/dashboards-requirements.md`).

---

## 1. Overview

Segmentation answers: "Which accounts should we focus on right now?"

- **RFM** (Recency, Frequency, Monetary) measures engagement and value signals.
- **ABC (Pareto)** groups accounts by contribution to total revenue / pipeline.
- Both scores are written to the `accounts` table and exposed via the tRPC
  analytics router.

---

## 2. RFM Scoring

### Dimensions

| Dimension     | Definition                                     | Data source             |
| ------------- | ---------------------------------------------- | ----------------------- |
| Recency (R)   | Days since last logged activity (`activities`) | `activities.created_at` |
| Frequency (F) | Count of key events in the last 90 days        | `activities`, `deals`   |
| Monetary (M)  | Sum of `expected_value` of won / active deals  | `deals`                 |

### Scoring Method

Each dimension is scored 1–5 using quintile bucketing over the active account
population (accounts with at least 1 activity in the last 180 days):

- Score 5 = best (most recent, most frequent, highest value)
- Score 1 = worst

Combined RFM score = concatenation of R, F, M scores (e.g., `"554"`, `"211"`).

### Segment Labels

Accounts are mapped to named segments based on their RFM combination:

| Segment Label      | RFM Pattern (approximate) | Description                        |
| ------------------ | ------------------------- | ---------------------------------- |
| Champion           | R≥4, F≥4, M≥4             | Best customers; high engagement    |
| Loyal              | R≥3, F≥4, M≥3             | Regular, valuable; nurture         |
| Potential Loyalist | R≥4, F≥2, M≥2             | Recent, not yet frequent           |
| At Risk            | R≤2, F≥3, M≥3             | Used to be great; re-engage now    |
| Hibernating        | R≤2, F≤2, M≤2             | Low engagement; win-back or purge  |
| Lost               | R=1, F=1, M=any           | No recent activity; likely churned |
| New Customer       | R=5, F=1, M=any           | Just acquired; onboard urgently    |

Labels are stored in `accounts.rfm_segment` (string, nullable).

---

## 3. ABC Classification (Pareto)

ABC groups accounts by their share of total pipeline or revenue value.

| Class | Share of accounts | Share of value | Description           |
| ----- | ----------------- | -------------- | --------------------- |
| A     | ~20%              | ~80%           | Top value accounts    |
| B     | ~30%              | ~15%           | Mid-tier contributors |
| C     | ~50%              | ~5%            | Long-tail accounts    |

**Calculation**: Sort all accounts by `monetary_value` descending. Assign A to
the top cumulative 80%, B to the next 15%, C to the remainder.

Stored in `accounts.abc_class` (`'A' | 'B' | 'C' | null`).

---

## 4. Recalculation Schedule

- **Frequency**: Daily at 02:00 UTC (scheduled job in `apps/ai-worker`)
- **Scope**: All accounts with ≥1 activity in the last 180 days
- **Audit fields**: `rfm_scored_at`, `abc_classified_at` (timestamps on
  `accounts`)
- **Idempotency**: Job is safe to re-run; overwrites scores in place

---

## 5. Segment Movement & Audit

- Every score change is logged to `account_segment_history` with:
  - `account_id`, `changed_at`, `old_rfm_segment`, `new_rfm_segment`,
    `old_abc_class`, `new_abc_class`, `job_run_id`
- The Segmentation Coverage dashboard shows 30-day movement counts.

---

## 6. Rules for Moving Between Segments

- Segments recalculate from scratch on each run (not incremental)
- No manual overrides — segment is always derived from data
- Exception: accounts tagged `do_not_score = true` are excluded from RFM/ABC
  (for test accounts, internal accounts)

---

## TODO: to be authored

- Exact quintile thresholds (to be set after first 30 days of real data)
- Segment-based automation trigger rules (e.g., "At Risk → trigger re-engagement
  workflow")
- Validation tests for the scoring job
- Edge cases: accounts with zero monetary value; accounts with no activities

---

**Owner**: Engineering Lead + PM  
**Last reviewed**: 2026-04-16  
**Related**: `docs/analytics/dashboards-requirements.md`, `apps/ai-worker/`
(scoring job), `packages/domain/` (Account entity)
