# Product Requirements Document (PRD)

## Overview

| Field             | Value                                                                 |
| ----------------- | --------------------------------------------------------------------- |
| **Feature Name**  | Customer feedback survey collection                                   |
| **Owner**         | ifc-074                                                               |
| **Status**        | Draft                                                                 |
| **Target Sprint** | 25                                                                    |
| **Created Date**  | 2026-11-22                                                            |
| **Last Updated**  | 2026-11-22                                                            |
| **Related Tasks** | IFC-332, IFC-068, IFC-065, IFC-189, IFC-315, IFC-316, PG-203, MVP-001 |

## Problem Statement

`/analytics/feedback` (IFC-068, Completed) shows "No insights yet" for every
real tenant because nothing in the app writes `feedback_surveys`. The
`feedbackSurvey` router is read-only (getDashboardStats, getNPSTrend,
getSentimentBreakdown, exportData) and the only writer is
`packages/db/prisma/seed.ts`. No task covered collecting responses.

## Acceptance Criteria

- [ ] A tenant can create and send an NPS survey (score 0-10 plus optional
      comment) by email from its own connected mailbox (MVP-001) or system mail.
- [ ] A public response page needs no login; the token is unguessable, stored
      hashed, accepts one response and expires.
- [ ] Triggers on deal won (IFC-065) and ticket resolved (IFC-189) are
      configurable per tenant and off by default.
- [ ] Every survey and response is written to `feedback_surveys` with
      `tenantId`.
- [ ] Consent and unsubscribe are honoured (IFC-315); people under erasure or
      restriction (PG-203, IFC-316) are skipped with an audit entry.
- [ ] After one real response, `/analytics/feedback` shows that data instead of
      "No insights yet".
