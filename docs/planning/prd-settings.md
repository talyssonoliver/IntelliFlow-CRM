# Product Requirements Document (PRD)

## Overview

| Field             | Value                                                  |
| ----------------- | ------------------------------------------------------ |
| **Feature Name**  | Settings & Configuration UI                                    |
| **Owner**         | Architecture Team                                      |
| **Status**        | In Progress                                            |
| **Target Sprint** | Sprint 12-15                                      |
| **Created Date**  | 2026-02-22                                               |
| **Last Updated**  | 2026-02-25                                               |
| **Related Tasks** | PG-104, IFC-191                                   |

> **Note**: This PRD was retroactively created to document requirements for tasks
> that were completed before PRD governance was integrated into the workflow.
> Content is derived from task specifications and implementation artifacts.

## Problem Statement

### Background

IntelliFlow CRM requires a centralized settings interface for users to manage their account preferences, security settings, AI configuration, and team management.

### Problem Description

Without a unified settings UI, configuration is scattered across multiple entry points, leading to a fragmented user experience.

## User Stories

### User Story 1

**As a** user **I want to** access all settings from one page **So that** I can manage my preferences efficiently.

### User Story 2 (IFC-191)

**As a** user **I want to** set my preferred timezone in account settings **So that** the home page greeting and time-sensitive features display correctly for my location.

### User Story 3 (IFC-191)

**As a** user **I want** the home page greeting to say "Good morning/afternoon/evening" based on my timezone **So that** the CRM feels personalized regardless of where the server is hosted.

## Acceptance Criteria

_Derived from completed task specifications. See individual spec files at
`.specify/sprints/sprint-{N}/specifications/{TASK_ID}-spec.md` for detailed AC._

### IFC-191: User Timezone Support

- AC-1: `User.timezone` field exists in Prisma schema with `@default("UTC")`
- AC-2: Prisma migration is created and reversible
- AC-3: `getGreeting()` in `home.router.ts` uses user's timezone (not server time)
- AC-4: Fallback chain: user timezone → UTC (tenant-level timezone is a future enhancement; Tenant model has no timezone field)
- AC-5: TimezoneSelector component on `/settings/account` page allows timezone selection
- AC-6: Timezone selection persists across sessions
- AC-7: Test coverage >=90% for all new/modified code

## Technical Requirements

_Refer to implementation artifacts and attestations for architectural details._

## Status

All related tasks are **Completed**. This PRD serves as retroactive documentation
for the feature area and will be referenced by future tasks in this domain.
