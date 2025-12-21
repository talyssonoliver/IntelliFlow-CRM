# Process Flowchart Conventions

This guide defines standards for creating process flowcharts and decision trees
in the IntelliFlow CRM project.

---

## Overview

While [Diagram Conventions](../diagrams/README.md) covers architectural diagrams
(C4, containers, components), this document focuses specifically on **process
flowcharts** used to document:

- Decision workflows and approval processes
- Business process flows
- State machine transitions
- Algorithm logic flows
- User journey flows

---

## Table of Contents

- [When to Use Flowcharts](#when-to-use-flowcharts)
- [Flowchart Types](#flowchart-types)
- [Notation Standards](#notation-standards)
- [Tool Selection](#tool-selection)
- [Naming Conventions](#naming-conventions)
- [Best Practices](#best-practices)
- [Examples](#examples)

---

## When to Use Flowcharts

### Use Flowcharts For:

- **Decision workflows**: When documenting approval processes, review flows, or
  multi-step decisions
- **Business processes**: When mapping out sales processes, lead qualification,
  customer onboarding
- **Algorithm logic**: When explaining complex conditional logic or branching
  behavior
- **State transitions**: When showing how entities move through different states
- **User journeys**: When documenting user interaction flows through the system

### Don't Use Flowcharts For:

- **System architecture**: Use C4 diagrams instead (see
  [Diagram Conventions](../diagrams/README.md))
- **API interactions**: Use sequence diagrams instead
- **Data structures**: Use class or entity-relationship diagrams
- **Deployment architecture**: Use deployment diagrams

---

## Flowchart Types

### 1. Decision Flowchart

**Purpose:** Document decision-making processes with multiple conditional
branches

**Example Use Cases:**

- Architecture decision workflow (ARP → ADR process)
- Lead scoring decision logic
- Feature flag evaluation
- Approval workflows

**Example:**

```mermaid
flowchart TD
    START([Start: New Feature Request])

    Q1{Is it a breaking<br/>change?}
    Q2{Does it affect<br/>architecture?}
    Q3{Approved?}

    START --> Q1

    Q1 -->|Yes| RFC[Create RFC Document]
    Q1 -->|No| Q2

    Q2 -->|Yes| ARP[Create ARP]
    Q2 -->|No| IMPL[Proceed with Implementation]

    RFC --> REVIEW[Technical Review]
    ARP --> REVIEW

    REVIEW --> Q3

    Q3 -->|Yes| IMPL
    Q3 -->|No| REVISE[Revise Proposal]

    REVISE --> REVIEW

    IMPL --> END([Complete])
```

**File naming:** `flow-decision-feature-approval.mmd`

---

### 2. Process Flowchart

**Purpose:** Document sequential business processes with decision points

**Example Use Cases:**

- Lead capture to conversion process
- Customer onboarding workflow
- Support ticket lifecycle
- Invoice generation process

**Example:**

```mermaid
flowchart TD
    START([Lead Captured])

    ENRICH[Enrich Lead Data]
    SCORE[AI Scoring]

    Q1{Score > 70?}

    QUALIFY[Mark as Qualified]
    NURTURE[Add to Nurture Campaign]

    ASSIGN[Auto-assign to Sales Rep]
    EMAIL[Send Welcome Email]

    CREATE_OPP[Create Opportunity]

    END_QUAL([Qualified Lead])
    END_NURT([Nurturing])

    START --> ENRICH
    ENRICH --> SCORE
    SCORE --> Q1

    Q1 -->|Yes| QUALIFY
    Q1 -->|No| NURTURE

    QUALIFY --> ASSIGN
    ASSIGN --> EMAIL
    EMAIL --> CREATE_OPP
    CREATE_OPP --> END_QUAL

    NURTURE --> END_NURT
```

**File naming:** `flow-process-lead-qualification.mmd`

---

### 3. State Transition Flowchart

**Purpose:** Show how entities transition between states based on events

**Example Use Cases:**

- Deal pipeline stages
- Ticket status transitions
- Order fulfillment states
- User account lifecycle

**Example:**

```mermaid
stateDiagram-v2
    [*] --> Draft: Create deal

    Draft --> Qualification: Submit for review
    Draft --> Lost: Abandon

    Qualification --> Proposal: Qualified
    Qualification --> Lost: Disqualified

    Proposal --> Negotiation: Proposal accepted
    Proposal --> Lost: Proposal rejected

    Negotiation --> ClosedWon: Contract signed
    Negotiation --> Lost: Negotiation failed
    Negotiation --> Proposal: Needs revision

    ClosedWon --> [*]
    Lost --> [*]

    note right of Qualification
        Automatic scoring
        Manual review required
    end note

    note right of ClosedWon
        Trigger: Contract signed
        Actions: Create customer record,
        Send welcome email,
        Notify finance team
    end note
```

**File naming:** `flow-state-deal-pipeline.mmd`

---

### 4. Swimlane Flowchart

**Purpose:** Show processes across multiple actors or systems with clear
responsibility boundaries

**Example Use Cases:**

- Cross-team workflows
- User-system interactions
- Multi-stage approval processes
- Handoff processes

**Example:**

```mermaid
flowchart TD
    subgraph "Sales Rep"
        A1[Create Lead]
        A2[Contact Lead]
        A3[Create Opportunity]
    end

    subgraph "AI System"
        B1[Score Lead]
        B2[Generate Email]
        B3[Predict Close Probability]
    end

    subgraph "Sales Manager"
        C1[Review Qualified Leads]
        C2[Approve Discount]
        C3[Close Deal]
    end

    A1 --> B1
    B1 --> A2
    A2 --> B2
    B2 --> C1
    C1 --> A3
    A3 --> B3
    B3 --> C2
    C2 --> C3
```

**File naming:** `flow-swimlane-sales-process.mmd`

---

## Notation Standards

### Shape Conventions

Use standard flowchart shapes with consistent meaning:

| Shape                 | Mermaid Syntax | Meaning        | Example             |
| --------------------- | -------------- | -------------- | ------------------- |
| **Rounded Rectangle** | `([Label])`    | Start/End      | `([Start Process])` |
| **Rectangle**         | `[Label]`      | Process/Action | `[Score Lead]`      |
| **Diamond**           | `{Label}`      | Decision       | `{Score > 70?}`     |
| **Parallelogram**     | `[/Label/]`    | Input/Output   | `[/User Input/]`    |
| **Cylinder**          | `[(Label)]`    | Database       | `[(Save to DB)]`    |
| **Hexagon**           | `{{Label}}`    | Preparation    | `{{Initialize}}`    |
| **Circle**            | `((Label))`    | Connector      | `((A))`             |

### Arrow Types

| Arrow Type  | Mermaid Syntax | Meaning                    |
| ----------- | -------------- | -------------------------- | --- | ------------------------ |
| **Solid**   | `-->`          | Primary flow               |
| **Dotted**  | `-.->`         | Alternative/secondary flow |
| **Bold**    | `==>`          | Important/critical path    |
| **Labeled** | `-->           | Label                      | `   | Condition or description |

### Color Coding

Use colors to indicate flow types or outcomes:

```mermaid
flowchart TD
    START([Start])
    SUCCESS[Success Path]:::success
    ERROR[Error Path]:::error
    WARNING[Warning Path]:::warning
    INFO[Info Path]:::info

    START --> SUCCESS
    START --> ERROR
    START --> WARNING
    START --> INFO

    classDef success fill:#d4edda,stroke:#28a745,stroke-width:2px
    classDef error fill:#f8d7da,stroke:#dc3545,stroke-width:2px
    classDef warning fill:#fff3cd,stroke:#ffc107,stroke-width:2px
    classDef info fill:#d1ecf1,stroke:#17a2b8,stroke-width:2px
```

---

## Tool Selection

### Recommended: Mermaid

**Primary tool for all flowcharts** in this project.

**Advantages:**

- Text-based (git-friendly)
- Renders in GitHub and Docusaurus
- Easy to collaborate on
- Versioned with code
- No external dependencies

**Limitations:**

- Limited layout control
- Basic styling options

**When to use:** All flowcharts unless Mermaid limitations block you

---

### Alternative: PlantUML Activity Diagrams

**Use when:**

- Need complex swimlanes
- Require precise layout control
- Generating from code

**Example:**

```plantuml
@startuml
start
:Receive Lead;
if (Score > 70?) then (yes)
  :Mark Qualified;
  :Assign to Sales;
else (no)
  :Add to Nurture;
endif
stop
@enduml
```

---

### Alternative: Excalidraw

**Use when:**

- Brainstorming or sketching
- Need hand-drawn aesthetic
- Creating presentation materials

**Not recommended for:**

- Production documentation (not text-based)
- Frequently updated processes

---

## Naming Conventions

### File Naming Pattern

```
flow-<type>-<subject>.mmd

Examples:
flow-decision-architecture-approval.mmd
flow-process-lead-qualification.mmd
flow-state-deal-pipeline.mmd
flow-swimlane-customer-onboarding.mmd
```

### Type Prefixes

| Prefix            | Type               | Example                               |
| ----------------- | ------------------ | ------------------------------------- |
| `flow-decision-`  | Decision flowchart | `flow-decision-gate-review.mmd`       |
| `flow-process-`   | Process flowchart  | `flow-process-invoice-generation.mmd` |
| `flow-state-`     | State transition   | `flow-state-ticket-lifecycle.mmd`     |
| `flow-swimlane-`  | Swimlane flowchart | `flow-swimlane-approval-workflow.mmd` |
| `flow-algorithm-` | Algorithm logic    | `flow-algorithm-scoring-logic.mmd`    |

---

## Best Practices

### DO

✅ **Start simple** - Begin with basic flow, add complexity only if needed ✅
**Use consistent shapes** - Follow standard notation (rectangle for action,
diamond for decision) ✅ **Label clearly** - Every node and edge should have a
clear, concise label ✅ **Show happy path first** - Primary flow should be the
most prominent ✅ **Include legends** - Add legend for complex flowcharts with
custom notation ✅ **Keep it focused** - One flowchart per process; split
complex flows ✅ **Add notes** - Use notes to explain complex decision criteria
✅ **Version with code** - Store in git alongside related code ✅ **Link to
docs** - Reference flowcharts from ADRs, runbooks, and documentation

### DON'T

❌ **Don't overcomplicate** - If flowchart is too complex, break it down ❌
**Don't mix abstraction levels** - Keep process flows separate from technical
architecture ❌ **Don't use custom notation** - Stick to standard flowchart
shapes ❌ **Don't skip decision criteria** - Label all decision branches with
conditions ❌ **Don't leave dead ends** - All branches should lead somewhere ❌
**Don't duplicate information** - Reference other flowcharts instead of copying
❌ **Don't forget error paths** - Show what happens when things go wrong ❌
**Don't skip validation** - Ensure flowchart renders correctly

---

## Examples

### Example 1: Architecture Decision Workflow

See: [Decision Workflow](../decision-workflow.md#workflow-diagram) - Complete
workflow from problem identification to implementation.

---

### Example 2: Lead Scoring Algorithm

```mermaid
flowchart TD
    START([Input: Lead Data])

    EXTRACT[Extract Features]

    subgraph "Scoring Criteria"
        C1{Company Size<br/>> 50?}
        C2{Budget > $10k?}
        C3{Timeline < 3mo?}
        C4{Decision Maker?}
    end

    CALC[Calculate Base Score]

    AI[AI Model Prediction]

    COMBINE[Weighted Average:<br/>Base: 40%, AI: 60%]

    Q1{Final Score<br/>> 70?}

    HIGH[Qualified Lead<br/>Priority: High]:::success
    MED[Qualified Lead<br/>Priority: Medium]:::warning
    LOW[Nurture Campaign]:::info

    END([Output: Scored Lead])

    START --> EXTRACT
    EXTRACT --> C1

    C1 -->|Yes +20| C2
    C1 -->|No +0| C2

    C2 -->|Yes +25| C3
    C2 -->|No +0| C3

    C3 -->|Yes +20| C4
    C3 -->|No +0| C4

    C4 -->|Yes +25| CALC
    C4 -->|No +10| CALC

    CALC --> AI
    AI --> COMBINE

    COMBINE --> Q1

    Q1 -->|Yes| HIGH
    Q1 -->|50-69| MED
    Q1 -->|No| LOW

    HIGH --> END
    MED --> END
    LOW --> END

    classDef success fill:#d4edda,stroke:#28a745,stroke-width:2px
    classDef warning fill:#fff3cd,stroke:#ffc107,stroke-width:2px
    classDef info fill:#d1ecf1,stroke:#17a2b8,stroke-width:2px
```

**File:** `flow-algorithm-lead-scoring.mmd`

---

### Example 3: Sprint Gate Review Process

```mermaid
flowchart TD
    START([Gate Review Triggered])

    GATHER[Gather Sprint Metrics]

    subgraph "Gate Checks"
        G1{All Tasks<br/>Complete?}
        G2{KPIs Met?}
        G3{No Critical<br/>Bugs?}
        G4{Architecture<br/>Tests Pass?}
    end

    AUTO_PASS[Auto-Pass Gate]:::success
    MANUAL[Manual Review Required]:::warning

    REVIEW[Architecture Team Review]

    Q1{Approved?}

    WAIVER[Grant Waiver]
    REMEDIATE[Create Remediation Plan]

    PASS[Gate Passed]:::success
    FAIL[Gate Failed]:::error

    NEXT[Proceed to Next Sprint]
    BLOCK[Block Next Sprint]

    END([Gate Review Complete])

    START --> GATHER
    GATHER --> G1

    G1 -->|No| MANUAL
    G1 -->|Yes| G2

    G2 -->|No| MANUAL
    G2 -->|Yes| G3

    G3 -->|No| MANUAL
    G3 -->|Yes| G4

    G4 -->|No| MANUAL
    G4 -->|Yes| AUTO_PASS

    AUTO_PASS --> PASS

    MANUAL --> REVIEW
    REVIEW --> Q1

    Q1 -->|Approved| WAIVER
    Q1 -->|Rejected| REMEDIATE
    Q1 -->|Conditional| REMEDIATE

    WAIVER --> PASS
    REMEDIATE --> FAIL

    PASS --> NEXT
    FAIL --> BLOCK

    NEXT --> END
    BLOCK --> END

    classDef success fill:#d4edda,stroke:#28a745,stroke-width:2px
    classDef warning fill:#fff3cd,stroke:#ffc107,stroke-width:2px
    classDef error fill:#f8d7da,stroke:#dc3545,stroke-width:2px
```

**File:** `flow-process-gate-review.mmd`

---

## Validation Checklist

Before committing a flowchart, verify:

- [ ] Follows standard flowchart notation (shapes used correctly)
- [ ] Uses consistent naming convention
- [ ] All decision branches are labeled
- [ ] No dead ends (all paths lead to an end state)
- [ ] Includes start and end nodes
- [ ] Colors follow style guide (if used)
- [ ] Renders correctly in GitHub/Docusaurus
- [ ] Saved in correct directory (`docs/architecture/flowcharts/`)
- [ ] Referenced from relevant documentation
- [ ] Legend included (if custom notation used)

---

## Integration with Documentation

### Referencing Flowcharts

**In ADRs:**

```markdown
## Decision Outcome

The approval workflow follows this process:

![Approval Workflow](../flowcharts/flow-decision-architecture-approval.mmd)
```

**In Runbooks:**

```markdown
## Incident Response Process

When a production incident occurs, follow this flowchart:

See:
[Incident Response Flow](../architecture/flowcharts/flow-process-incident-response.mmd)
```

**In User Documentation:**

```markdown
## How Leads Are Qualified

The system uses the following algorithm to score and qualify leads:

![Lead Scoring](../architecture/flowcharts/flow-algorithm-lead-scoring.mmd)
```

---

## Related Documents

- [Diagram Conventions](../diagrams/README.md) - For architectural diagrams (C4,
  containers, components)
- [ADR Template](../adr/000-template.md) - Reference flowcharts from ADRs
- [ARP Template](../arp/000-template.md) - Include process flows in proposals
- [Decision Workflow](../decision-workflow.md) - Example of complex decision
  flowchart

---

**Document Owner:** Architecture Team **Last Updated:** 2025-12-21 **Next
Review:** 2026-03-21
