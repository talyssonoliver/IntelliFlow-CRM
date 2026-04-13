# Product Requirements Document (PRD)

## Overview

| Field             | Value                            |
| ----------------- | -------------------------------- |
| **Feature Name**  | Workflow Builder UI (React Flow) |
| **Owner**         | Frontend Dev + UX                |
| **Status**        | In Progress                      |
| **Target Sprint** | 17                               |
| **Created Date**  | 2026-04-10                       |
| **Last Updated**  | 2026-04-10                       |
| **Related Tasks** | IFC-031                          |

## Problem Statement

### Background

IntelliFlow CRM has a powerful workflow engine (IFC-028) and
auto-response/approval system (IFC-029), but non-technical CRM operators have no
visual interface to create or manage automation workflows. Currently, workflow
definitions must be authored as JSON/code, making the feature inaccessible to
the business users who need it most.

### Problem Description

Non-technical CRM users (sales ops, account managers, team leads) cannot
configure workflow automation without developer involvement. The backend
workflow engine supports 5 node types, 6 action types, conditional branching,
and human approval gates — but none of this is accessible through a visual
interface.

### Impact

**Who is affected?**

- Sales operations managers who need to configure lead qualification workflows
- Case managers who need to set up escalation and resolution automation
- Team leads who need approval workflows for sensitive operations
- System administrators configuring automation without engineering support

**What is the business impact?**

- Reduced time-to-automation from days (engineering ticket) to minutes
  (self-serve)
- Decreased dependence on engineering for routine workflow changes
- Faster CRM adoption for non-technical teams
- Enables the workflow engine investment (IFC-028) to deliver business value

**What happens if we don't solve this?**

- Workflow engine (IFC-028) delivers zero user-facing value without UI
- Teams revert to manual processes or use competitors with visual builders
- Engineering bottleneck for every automation change

## User Stories

### Primary User Story

**As a** non-technical CRM operator **I want to** visually drag and drop
workflow nodes on a canvas **So that** I can create and activate automation
workflows without writing code.

**Acceptance Criteria:**

- [ ] Canvas displays workflow as nodes (blocks) and edges (arrows)
- [ ] User can drag node types from a palette onto the canvas
- [ ] User can connect nodes by drawing edges between them
- [ ] User can configure each node (action type, conditions, labels) in a side
      panel
- [ ] User can save a workflow as a named definition
- [ ] User can activate/deactivate a workflow with a toggle

### Additional User Stories

#### Story 2: Workflow Management

**As a** CRM operator **I want to** view all existing automation workflows **So
that** I can understand what automation is currently active and manage it.

**Acceptance Criteria:**

- [ ] Workflow list page shows all workflow definitions with name, status,
      category
- [ ] User can click a workflow to open it in the visual builder
- [ ] User can delete a workflow definition
- [ ] User can duplicate an existing workflow as a starting point

#### Story 3: Node Configuration

**As a** CRM operator **I want to** configure what each workflow node does **So
that** the automation performs the right actions for my business process.

**Acceptance Criteria:**

- [ ] Start node: configure trigger type (event/schedule/manual/webhook) and
      trigger config
- [ ] Action node: select action type (notify, update field, create task, call
      webhook, trigger workflow, log)
- [ ] Decision node: configure condition groups with AND/OR/NOT logic
- [ ] Human node: configure required approvers and approval deadline
- [ ] End node: optionally configure completion status

## Acceptance Criteria Checklist

### Functional Requirements

- [ ] Workflow canvas renders existing workflow definitions from
      `workflow.getById`
- [ ] Node palette lists all 5 node types with icons and descriptions
- [ ] Drag-and-drop from palette to canvas creates a new node
- [ ] Click edge between nodes shows label configuration
- [ ] Node detail panel opens on node click, closes on backdrop click
- [ ] Save button calls `workflow.create` or `workflow.update` tRPC procedure
- [ ] Workflow list calls `workflow.list` tRPC procedure (paginated)
- [ ] Activation toggle calls `workflow.setActive` tRPC procedure
- [ ] Validation prevents saving invalid workflow (no start/end, disconnected
      nodes)

### Non-Functional Requirements

- [ ] Canvas renders up to 50 nodes without visible lag
- [ ] Lighthouse performance score ≥90 on production build
- [ ] Accessible: keyboard-navigable node palette and connection handles
- [ ] Responsive: works on desktop (≥1280px); canvas scrollable on smaller
      screens
- [ ] WCAG 2.1 AA: all interactive elements have focus indicators and ARIA
      labels

### Quality Gates

- [ ] Test coverage ≥90% for workflow builder components
- [ ] Unit tests for WorkflowCanvas, NodePalette, NodeConfigPanel, WorkflowList
- [ ] E2E test for create → configure → save → activate flow
- [ ] pnpm build passes with no errors
- [ ] TypeScript strict mode: no type errors
- [ ] Accessibility score ≥95

## Technical Requirements

### API Endpoints

**tRPC Procedures (new — to be implemented in IFC-031):**

| Procedure            | Type     | Description                                     |
| -------------------- | -------- | ----------------------------------------------- |
| `workflow.list`      | query    | Implement stub — list all definitions paginated |
| `workflow.getById`   | query    | Implement stub — fetch single definition        |
| `workflow.create`    | mutation | Create new workflow definition                  |
| `workflow.update`    | mutation | Update existing workflow definition             |
| `workflow.delete`    | mutation | Soft-delete workflow definition                 |
| `workflow.setActive` | mutation | Toggle `isActive` flag                          |

### Data Model

No new Prisma models required. `WorkflowDefinition` and `WorkflowExecution`
models already exist (IFC-028).

### UI/UX Components

**New Components (canvas-specific, no shared equivalent):**

- `WorkflowCanvas` — React Flow canvas with node/edge renderer
- `NodePalette` — Draggable node type picker sidebar
- `WorkflowNodeCard` — Custom React Flow node component (per type)
- `NodeConfigPanel` — Sheet/panel for node configuration form
- `WorkflowToolbar` — Save, zoom controls, auto-layout toolbar

**Shared Components (REUSE):**

- `PageHeader` — Page title, breadcrumbs, action buttons
- `SearchFilterBar` — Filter/sort workflow list
- `DataTable` — Workflow list table
- `EmptyState` — No workflows state
- `StatusBadge` — Workflow active/inactive status
- shadcn `Sheet`, `Dialog`, `Select`, `Input`, `Switch`, `Badge` — node config
  form

### State Management

- Server state: tRPC + React Query for workflow list and definitions
- Canvas state: React Flow internal state (`useNodesState`, `useEdgesState`) +
  local `useState`
- Form state: React Hook Form for node configuration panels

### Performance Considerations

- React Flow renders via SVG/HTML — no performance concerns up to 50 nodes
- Lazy-load React Flow (`dynamic(() => import('reactflow'), { ssr: false })`) —
  prevents SSR issues with browser-only canvas
- Bundle: React Flow adds ~150KB gzipped; must stay within 300KB JS budget

## Success Metrics

### Performance Targets

| Metric                   | Target | Method        |
| ------------------------ | ------ | ------------- |
| Canvas render (50 nodes) | <500ms | Browser perf  |
| Workflow save latency    | <300ms | tRPC trace    |
| Page FCP                 | <1s    | Lighthouse    |
| Lighthouse performance   | ≥90    | Lighthouse CI |

### Business Metrics

| Metric                                | Target | Method                   |
| ------------------------------------- | ------ | ------------------------ |
| Usability test task completion        | ≥80%   | usability-test-video.mp4 |
| Workflow creation without dev support | 100%   | User observation         |

## Dependencies

### Prerequisite Tasks

- [x] IFC-028: Workflow Engine — WorkflowDefinition Prisma model, state machine,
      tRPC router scaffold
- [x] IFC-029: Auto-Response with Approval Gate — Human approval workflow
      pattern established

### Technical Prerequisites

- [ ] `reactflow` or `@xyflow/react` package installed in `apps/web`
- [ ] `workflow.create`/`update`/`delete`/`setActive` tRPC procedures
      implemented
- [ ] `workflow.list`/`getById` stubs replaced with real Prisma queries

## Risks and Mitigations

| Risk                                     | Likelihood | Impact | Mitigation                                                     |
| ---------------------------------------- | ---------- | ------ | -------------------------------------------------------------- |
| React Flow SSR incompatibility           | High       | High   | Use `dynamic()` with `ssr: false`                              |
| Bundle size exceeds 300KB JS budget      | Medium     | High   | Code-split canvas; lazy-load React Flow                        |
| Canvas accessibility gaps (keyboard DnD) | Medium     | Medium | Use React Flow keyboard navigation; ARIA labels                |
| Complex node config forms slowing UX     | Medium     | Medium | Sheet panel pattern (existing pattern from RoutingRulesEditor) |
| Saving workflow with invalid topology    | Medium     | Medium | Client-side validation before tRPC call                        |

## Out of Scope

**Explicitly NOT included in this release:**

- Workflow execution monitoring/status on the canvas (separate task)
- AI-assisted workflow suggestion from natural language
- Workflow versioning UI (version field exists in DB but no UI)
- Template library / workflow marketplace
- Workflow import/export (JSON)
- Multi-tenant workflow sharing

## References

- Sprint Plan: `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv`
- ADR-005: `docs/planning/adr/ADR-005-workflow-engine.md`
- ADR-014: `docs/planning/adr/ADR-014-workflow-engine-decision.md`
- ADR-017: `docs/planning/adr/ADR-017-workflow-reliability.md`
- Dependency IFC-028: Workflow Engine backend
- Related: IFC-029 (Auto-Response), IFC-030 (Lead Routing)

## Revision History

| Version | Date       | Author | Changes                                 |
| ------- | ---------- | ------ | --------------------------------------- |
| 1.0     | 2026-04-10 | Claude | Initial draft from IFC-031 spec session |
