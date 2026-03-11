# Product Requirements Document (PRD)

## Overview

| Field             | Value                                                  |
| ----------------- | ------------------------------------------------------ |
| **Feature Name**  | Ticket Configuration Pages                             |
| **Owner**         | Frontend Dev (STOA-Domain)                             |
| **Status**        | Implementing                                           |
| **Target Sprint** | 16                                                     |
| **Created Date**  | 2026-03-10                                             |
| **Last Updated**  | 2026-03-10                                             |
| **Related Tasks** | PG-173                                                 |

## Problem Statement

### Background

IntelliFlow CRM has a fully functional ticket management system (PG-137) with
SLA tracking (IFC-093), routing (IFC-067), and domain models (IFC-188/189). The
sidebar already defines navigation entries for three configuration pages under
the "Configuration" section of the Tickets module, but these routes currently
return 404.

### Problem Description

Support managers and admins cannot configure SLA policies, ticket categories, or
automation rules through the UI. The Prisma models exist (`SLAPolicy`,
`TicketCategory`, `RoutingRule`) but there are no frontend pages or dedicated
tRPC endpoints for managing them.

### Impact

**Who is affected?**

- Support managers needing to customize SLA response/resolution targets
- Admins configuring ticket categories and custom field definitions
- Team leads setting up automation rules for ticket assignment and status flows

**What is the business impact?**

- SLA policy management currently requires direct DB access
- Ticket categories are hardcoded in domain constants
- No UI for configuring automated ticket routing rules

**What happens if we don't solve this?**

- Support configuration remains static and non-configurable per tenant
- Sidebar "ghost links" damage user trust (3 broken navigation entries)

## User Stories

### US-001: SLA Policy Management

**As a** support manager **I want to** create and manage SLA policies with
priority-based response and resolution time targets **So that** I can define
appropriate service levels for different customer tiers.

**Acceptance Criteria:**

- [ ] List view shows all SLA policies with name, description, and time targets
- [ ] Create form allows setting response/resolution times per priority level
- [ ] Edit form pre-populates existing values
- [ ] Delete with confirmation dialog
- [ ] Default policy indicator (isDefault flag)
- [ ] Active/inactive toggle

### US-002: Ticket Type Management

**As an** admin **I want to** manage ticket categories with custom properties
**So that** tickets can be properly classified and routed.

**Acceptance Criteria:**

- [ ] List view shows categories with name, description, color, and sort order
- [ ] Create form with name, description, parent category, color, icon, SLA policy
- [ ] Hierarchical display (parent/child categories)
- [ ] Active/inactive toggle
- [ ] Link to default SLA policy per category

### US-003: Automation Rule Builder

**As a** team lead **I want to** configure trigger-condition-action rules for
automated ticket handling **So that** tickets are auto-assigned and status
transitions happen without manual intervention.

**Acceptance Criteria:**

- [ ] List view shows routing rules with name, priority, and active status
- [ ] Rule builder with trigger, condition, and action components
- [ ] Priority ordering (drag-to-reorder or numeric)
- [ ] Active/inactive toggle per rule
- [ ] Conditions stored as JSON (category, priority, SLA status)
- [ ] Actions stored as JSON (assign to user/team/skill)

## Non-Functional Requirements

- All pages Lighthouse >= 90 (Performance, Accessibility)
- Page loads < 200ms
- Forms validate inline before submission
- Multi-tenant: all queries scoped to tenant
