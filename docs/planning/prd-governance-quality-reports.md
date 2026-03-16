# Product Requirements Document (PRD)

## Overview

| Field             | Value                                                  |
| ----------------- | ------------------------------------------------------ |
| **Feature Name**  | Governance Quality Report Sub-Pages                    |
| **Owner**         | Frontend Dev (STOA-Quality)                            |
| **Status**        | In Progress                                            |
| **Target Sprint** | 16                                                     |
| **Created Date**  | 2026-03-15                                             |
| **Last Updated**  | 2026-03-15                                             |
| **Related Tasks** | PG-176                                                 |

## Problem Statement

### Background

The IntelliFlow CRM governance module includes a quality reports system that reads real CI-generated artifacts (Lighthouse, test coverage, performance benchmarks) from the filesystem and displays them. The parent page at `/governance/quality-reports` shows summary cards, and the `[reportId]` detail page embeds raw HTML reports in an iframe.

### Problem Description

The current detail view is a generic iframe viewer that provides no structured data visualization. Users cannot see category breakdowns, per-package coverage, or benchmark operation details without opening raw HTML files. The sidebar already links to `/governance/quality-reports/lighthouse`, `/governance/quality-reports/coverage`, and `/governance/quality-reports/performance`, but these routes do not resolve to dedicated pages.

### Impact

**Who is affected?**
- Engineering leads reviewing code quality metrics
- DevOps engineers monitoring CI health
- Product managers tracking quality KPIs

**What is the business impact?**
- Faster quality assessment through structured data views
- Better decision-making with category-level breakdowns
- Reduced context-switching (no need to open raw HTML reports)

## User Stories

### US-1: Lighthouse Scores by Category

**As an** engineering lead **I want to** see Lighthouse scores broken down by category (Performance, Accessibility, Best Practices, SEO) with threshold indicators **So that** I can quickly identify which quality dimension needs attention.

**Acceptance Criteria:**
- [ ] 4 category score gauges with >=90 threshold line
- [ ] Core Web Vitals table (FCP, LCP, CLS, TBT, SI) when available
- [ ] Pass/fail indicators per category
- [ ] Back-link to quality reports list via breadcrumb

### US-2: Test Coverage by Package

**As a** developer **I want to** see test coverage broken down by statements, branches, functions, and lines with per-package detail **So that** I can identify under-tested areas.

**Acceptance Criteria:**
- [ ] 4-metric breakdown (statements, branches, functions, lines) with thresholds
- [ ] Per-package coverage table when data is available
- [ ] Test run metadata (total/passed/failed) when present
- [ ] Visual threshold bars with color-coded pass/fail

### US-3: Performance Benchmarks

**As a** DevOps engineer **I want to** see API response times and benchmark operations with threshold pass/fail **So that** I can monitor performance regressions.

**Acceptance Criteria:**
- [ ] Operations benchmark table with p95 timings and pass/fail
- [ ] Load test summary when k6 data is available
- [ ] Threshold status badges (tRPC p95 <50ms, DB p95 <20ms)
- [ ] Overall pass/fail indicator

## Technical Requirements

### Pages

- `/governance/quality-reports/lighthouse` — Static route, client component
- `/governance/quality-reports/coverage` — Static route, client component
- `/governance/quality-reports/performance` — Static route, client component

### Data Source

All pages fetch from existing `/api/quality-reports?action=detail&id=<type>` endpoint. The API reads real CI artifacts from the filesystem — no fake/mock data.

### UI Components

- Reuse `PageHeader` from `@/components/shared` for breadcrumbs and actions
- Reuse `Card`, `Progress`, `MetricCard` from `@intelliflow/ui`
- Use `recharts` (already in `apps/web/package.json`) for any trend visualizations
- New components: `LighthouseReportView`, `CoverageReportView`, `PerformanceReportView` in `apps/web/src/components/governance/`

## Success Metrics

| Metric                | Target | Measurement Method |
| --------------------- | ------ | ------------------ |
| Lighthouse Score      | >=90   | Lighthouse CI      |
| Test Coverage         | >=90%  | Vitest coverage    |
| All 3 routes resolve  | 100%   | Manual + E2E       |
| Back-navigation works | 100%   | Manual + E2E       |

## Dependencies

- [x] PG-015: Sign In (Completed)

## Out of Scope

- Historical trend storage (no time-series database)
- API endpoint modifications (use existing data contracts)
- Real-time CI pipeline integration
- k6 load test runner integration (display only)
