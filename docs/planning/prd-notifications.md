# Product Requirements Document (PRD)

## Overview

| Field             | Value                                                  |
| ----------------- | ------------------------------------------------------ |
| **Feature Name**  | Notification System                                     |
| **Owner**         | Architecture Team / Platform FE+BE                     |
| **Status**        | In Progress                                            |
| **Target Sprint** | Sprint 5 (backend), Sprint 14 (inbox UI)               |
| **Created Date**  | 2026-02-22                                             |
| **Last Updated**  | 2026-02-22                                             |
| **Related Tasks** | IFC-157, IFC-183, PG-130                               |

## Problem Statement

### Background

IntelliFlow CRM users need to receive timely notifications about important events — new leads, task assignments, deal updates, and system alerts — through multiple delivery channels.

### Problem Description

Without a notification inbox, users must manually check the application for updates, leading to delayed responses and missed action items. The backend notification service (IFC-157, IFC-183) is complete, but the frontend experience lacks a proper componentized inbox with real-time updates, filtering, and batch actions.

## User Stories

### User Story 1

**As a** sales rep **I want to** see a real-time notification inbox **So that** I can respond quickly to new leads, deal changes, and team mentions without refreshing the page.

### User Story 2

**As a** user **I want to** filter notifications by type, priority, and read status **So that** I can focus on what matters most.

### User Story 3

**As a** user **I want to** mark notifications as read individually or in bulk **So that** I can manage my inbox efficiently.

### User Story 4

**As a** user **I want to** see an unread notification count in the header bell icon **So that** I know when new notifications arrive without visiting the inbox.

### User Story 5

**As a** user **I want to** scroll through notifications with infinite scroll **So that** loading is seamless without explicit pagination buttons.

## Acceptance Criteria

### PG-130: Notifications Inbox Page

| ID | Criterion |
|----|-----------|
| AC-001 | Notification list displays paginated results from `notifications.list` tRPC endpoint |
| AC-002 | Real-time updates via `notifications.onNew` tRPC subscription show new notifications without page refresh |
| AC-003 | Filter bar supports type, priority, and read-status filters sent server-side |
| AC-004 | Search input filters notifications by title/body |
| AC-005 | Mark individual notification as read via `notifications.markAsRead` |
| AC-006 | Mark all as read via `notifications.markAllAsRead` |
| AC-007 | Dismiss/delete notification via `notifications.delete` |
| AC-008 | NotificationBell component in header shows unread count from `notifications.getUnreadCount` |
| AC-009 | Infinite scroll pagination loads next page when scrolling near bottom |
| AC-010 | Page loads in <300ms; Lighthouse score >=90 |
| AC-011 | Components extracted into separate files: NotificationList, NotificationItem, NotificationFilters, NotificationBell |
| AC-012 | Priority filter uses correct domain values: high, normal, low (not urgent/medium) |

## Technical Requirements

- Frontend: Next.js App Router, shadcn/ui, Tailwind CSS
- API: tRPC notifications router (IFC-183)
- Real-time: tRPC WebSocket subscription (`notifications.onNew`)
- Auth: `useRequireAuth()` guard
- Components in `apps/web/src/components/notifications/`
- Page at `apps/web/src/app/notifications/page.tsx`

## Status

- IFC-157 (Notification Service MVP): **Completed**
- IFC-183 (Notifications tRPC Router): **Completed**
- PG-130 (Notifications Inbox Page): **In Progress** (Specifying)
