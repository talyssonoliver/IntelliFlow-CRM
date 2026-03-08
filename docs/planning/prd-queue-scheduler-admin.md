# Product Requirements Document (PRD)

## Overview

| Field             | Value                                             |
| ----------------- | ------------------------------------------------- |
| **Feature Name**  | Queue Scheduler Administration                    |
| **Owner**         | Backend Dev + Frontend Dev                        |
| **Status**        | In Progress                                       |
| **Target Sprint** | 15                                                |
| **Created Date**  | 2026-03-08                                        |
| **Last Updated**  | 2026-03-08                                        |
| **Related Tasks** | IFC-296                                           |

## Problem Statement

### Background

IntelliFlow CRM uses BullMQ queues (ai-scoring, ai-prediction, ai-insights) for AI background processing. The ai-worker registers cron-based job schedulers for recurring AI operations (insight refresh every 6h, lead scoring every 4h). Currently, the `queuesAdmin` tRPC router returns empty stub data, providing no visibility or control over queue operations.

### Problem Description

Operations staff and administrators have no way to:
- View live queue statistics (waiting, active, completed, failed job counts)
- See registered scheduler cron patterns and next execution times
- Pause/resume queues during maintenance or incidents
- Retry failed jobs without direct Redis access
- Remove stuck or obsolete job schedulers

### Impact

**Who is affected?**

- CRM administrators managing AI operations
- DevOps engineers troubleshooting queue issues

**What is the business impact?**

- Reduced mean-time-to-recovery during queue incidents
- Visibility into AI processing pipeline health

**What happens if we don't solve this?**

- Queue issues require direct Redis CLI access to diagnose and fix
- No visibility into scheduler health from the CRM dashboard

## User Stories

### Primary User Story

**As a** CRM administrator **I want to** view live queue statistics and scheduler status **So that** I can monitor AI processing pipeline health from the dashboard.

**Acceptance Criteria:**

- [ ] All 3 AI queues (ai-scoring, ai-prediction, ai-insights) visible with live counts
- [ ] Scheduler cron patterns displayed with next execution time
- [ ] Queue paused/active status clearly indicated
- [ ] Data refreshes automatically (polling)

### Additional User Stories

#### Story 2

**As a** CRM administrator **I want to** pause and resume queues **So that** I can perform maintenance without stopping the entire system.

**Acceptance Criteria:**

- [ ] Pause button stops new job processing for a specific queue
- [ ] Resume button re-enables processing
- [ ] Current status reflected immediately in the UI

#### Story 3

**As a** CRM administrator **I want to** retry failed jobs and manage schedulers **So that** I can recover from transient errors and manage recurring job schedules.

**Acceptance Criteria:**

- [ ] Retry action re-queues failed jobs for a specific queue
- [ ] Delete scheduler action removes a registered cron scheduler

## Technical Requirements

### tRPC Procedures

```typescript
// apps/api/src/modules/admin/queues.router.ts
export const queuesAdminRouter = router({
  list: protectedProcedure.query(/* live queue stats for all queues */),
  getByName: protectedProcedure.input(...).query(/* single queue stats + schedulers */),
  pause: protectedProcedure.input(...).mutation(/* pause a queue */),
  resume: protectedProcedure.input(...).mutation(/* resume a queue */),
  retryFailed: protectedProcedure.input(...).mutation(/* retry failed jobs */),
  deleteScheduler: protectedProcedure.input(...).mutation(/* remove a job scheduler */),
});
```

### UI Components

- `QueueSchedulerPanel` — Card-based panel added to ActiveAgentsDashboard
- Per-queue rows showing: name, counts, cron pattern, action buttons

## Success Metrics

| Metric              | Target  | Measurement Method |
| ------------------- | ------- | ------------------ |
| API Response Time   | <200ms  | OpenTelemetry      |
| Test Coverage       | >90%    | Vitest coverage    |
| Queues Visible      | 3       | Manual verification|
| CRUD Operations     | All functional | Integration test |

## Dependencies

- [x] IFC-015: BullMQ Job Queue Setup (Completed)
- [x] IFC-197: AI Monitoring tRPC Router (Completed)
- [x] PG-151: Active Agents Dashboard (Completed)

## Out of Scope

- Queue creation/destruction (queues are defined in code)
- Worker management (workers run in ai-worker process)
- Scheduler creation UI (schedulers are created programmatically)
- Email/webhook queue administration (future enhancement)
