# Architecture Diagram Conventions

This guide defines standards and conventions for creating architecture diagrams
in the IntelliFlow CRM project.

---

## Overview

Clear, consistent diagrams are essential for communicating architecture
decisions. This document establishes:

- Which diagram types to use for different purposes
- Naming and styling conventions
- Tool recommendations
- File organization
- Best practices

---

## Table of Contents

- [C4 Model](#c4-model)
- [Diagram Types](#diagram-types)
- [Tool Selection](#tool-selection)
- [Naming Conventions](#naming-conventions)
- [Styling Guidelines](#styling-guidelines)
- [File Organization](#file-organization)
- [Examples](#examples)
- [Best Practices](#best-practices)

---

## C4 Model

We use the **C4 model** (Context, Containers, Components, Code) as our primary
framework for architecture diagrams.

### C4 Levels

```mermaid
graph TD
    L1[Level 1: System Context]
    L2[Level 2: Container]
    L3[Level 3: Component]
    L4[Level 4: Code]

    L1 -->|Zoom in| L2
    L2 -->|Zoom in| L3
    L3 -->|Zoom in| L4

    L1_DESC[Shows system in context<br/>Users and external systems]
    L2_DESC[Shows containers<br/>Apps, databases, services]
    L3_DESC[Shows components<br/>Packages, modules, classes]
    L4_DESC[Shows code<br/>Classes, methods, UML]

    L1 -.-> L1_DESC
    L2 -.-> L2_DESC
    L3 -.-> L3_DESC
    L4 -.-> L4_DESC
```

### When to Use Each Level

| Level                  | Purpose                                   | Audience                       | Update Frequency              |
| ---------------------- | ----------------------------------------- | ------------------------------ | ----------------------------- |
| **L1: System Context** | Show how our system fits in the world     | Executives, Product, All teams | Rarely (major features)       |
| **L2: Container**      | Show high-level technical building blocks | Architects, Leads, DevOps      | Occasionally (new services)   |
| **L3: Component**      | Show internal structure of containers     | Developers, Architects         | Regularly (new modules)       |
| **L4: Code**           | Show class/module relationships           | Developers                     | Rarely (complex modules only) |

---

## Diagram Types

### 1. System Context Diagram (C4 Level 1)

**Purpose:** Show how IntelliFlow CRM fits in the broader ecosystem

**Elements:**

- IntelliFlow CRM system (the thing we're building)
- Users and personas
- External systems (Stripe, Sendgrid, OpenAI, etc.)

**Example:**

```mermaid
graph TB
    subgraph "Users"
        SALES[Sales Rep]
        MANAGER[Sales Manager]
        ADMIN[Admin]
    end

    SYSTEM[IntelliFlow CRM<br/>AI-powered CRM system]

    subgraph "External Systems"
        STRIPE[Stripe<br/>Payment processing]
        SENDGRID[SendGrid<br/>Email delivery]
        OPENAI[OpenAI<br/>AI/LLM services]
        CALENDAR[Google Calendar<br/>Calendar integration]
    end

    SALES -->|Manages leads and deals| SYSTEM
    MANAGER -->|Views analytics| SYSTEM
    ADMIN -->|Configures system| SYSTEM

    SYSTEM -->|Processes payments| STRIPE
    SYSTEM -->|Sends emails| SENDGRID
    SYSTEM -->|AI scoring & predictions| OPENAI
    SYSTEM -->|Syncs events| CALENDAR
```

**File naming:** `01-system-context.mmd` (Mermaid) or `01-system-context.puml`
(PlantUML)

---

### 2. Container Diagram (C4 Level 2)

**Purpose:** Show high-level technical architecture and deployment units

**Elements:**

- Applications (Web, API, Worker)
- Databases (Supabase, Redis)
- Message queues
- External services

**Example:**

```mermaid
graph TB
    subgraph "Client Layer"
        WEB[Next.js Web App<br/>Port 3000<br/>Vercel]
    end

    subgraph "API Layer"
        API[tRPC API Server<br/>Port 4000<br/>Railway]
    end

    subgraph "Worker Layer"
        AI_WORKER[AI Worker<br/>Port 5000<br/>Railway]
    end

    subgraph "Data Layer"
        SUPABASE[(Supabase<br/>PostgreSQL + pgvector)]
        REDIS[(Redis<br/>Upstash)]
    end

    subgraph "External Services"
        OPENAI[OpenAI API]
        SENDGRID[SendGrid]
    end

    WEB -->|HTTPS/tRPC| API
    API -->|SQL| SUPABASE
    API -->|Cache| REDIS
    API -->|Pub/Sub| AI_WORKER
    AI_WORKER -->|LLM Calls| OPENAI
    AI_WORKER -->|SQL| SUPABASE
    API -->|Email| SENDGRID
```

**File naming:** `02-container.mmd`

---

### 3. Component Diagram (C4 Level 3)

**Purpose:** Show internal structure of a specific container

**Elements:**

- Packages/modules
- Layers (domain, application, adapters)
- Dependencies between components

**Example (API Container):**

```mermaid
graph TB
    subgraph "apps/api"
        subgraph "Presentation Layer"
            ROUTER[tRPC Routers]
            MIDDLEWARE[Middleware]
        end

        subgraph "Application Layer"
            USECASES[Use Cases]
            PORTS[Ports]
        end

        subgraph "Domain Layer"
            ENTITIES[Entities]
            VALUEOBJS[Value Objects]
            EVENTS[Domain Events]
        end

        subgraph "Infrastructure Layer"
            REPOS[Repositories]
            ADAPTERS[External Adapters]
        end
    end

    ROUTER --> USECASES
    MIDDLEWARE --> ROUTER
    USECASES --> PORTS
    USECASES --> ENTITIES
    ENTITIES --> VALUEOBJS
    ENTITIES --> EVENTS
    PORTS -.implements.- REPOS
    PORTS -.implements.- ADAPTERS
```

**File naming:** `03-component-api.mmd`

---

### 4. Sequence Diagram

**Purpose:** Show how objects/services interact over time

**Use for:**

- API request flows
- Authentication flows
- Event-driven workflows
- Cross-system interactions

**Example:**

```mermaid
sequenceDiagram
    participant Client as Next.js Client
    participant Router as tRPC Router
    participant UseCase as Score Lead Use Case
    participant Domain as Lead Entity
    participant Repo as Lead Repository
    participant DB as Supabase

    Client->>Router: POST /api/trpc/leads.score
    Router->>Router: Validate input (Zod)
    Router->>Router: Authenticate user
    Router->>UseCase: execute(input)
    UseCase->>Repo: findById(leadId)
    Repo->>DB: SELECT * FROM leads
    DB-->>Repo: Lead record
    Repo-->>UseCase: Lead entity
    UseCase->>Domain: updateScore(newScore)
    Domain->>Domain: Apply business rules
    Domain->>Domain: Create domain event
    UseCase->>Repo: save(lead)
    Repo->>DB: UPDATE leads
    DB-->>Repo: Success
    UseCase-->>Router: Result<LeadScore>
    Router-->>Client: { score: 85 }
```

**File naming:** `seq-lead-scoring-flow.mmd`

---

### 5. State Diagram

**Purpose:** Show entity lifecycle and state transitions

**Use for:**

- Lead status flow
- Deal pipeline stages
- Ticket lifecycle
- Order processing states

**Example:**

```mermaid
stateDiagram-v2
    [*] --> New: Lead captured

    New --> Contacted: First outreach
    New --> Unqualified: Failed qualification

    Contacted --> Qualified: Met criteria
    Contacted --> Unqualified: Did not meet criteria

    Qualified --> Opportunity: Deal created
    Qualified --> Nurturing: Not ready to buy

    Nurturing --> Qualified: Re-engaged
    Nurturing --> Lost: Unresponsive

    Opportunity --> Won: Deal closed
    Opportunity --> Lost: Deal lost

    Won --> [*]
    Lost --> [*]
    Unqualified --> [*]
```

**File naming:** `state-lead-lifecycle.mmd`

---

### 6. Deployment Diagram

**Purpose:** Show infrastructure and deployment architecture

**Use for:**

- Production environment layout
- Multi-region setup
- Networking and security zones
- CI/CD pipeline

**Example:**

```mermaid
graph TB
    subgraph "Edge Network"
        CDN[Vercel Edge CDN]
    end

    subgraph "Compute - US East"
        WEB_EAST[Next.js - Vercel]
        API_EAST[tRPC API - Railway]
        WORKER_EAST[AI Worker - Railway]
    end

    subgraph "Data - US East"
        DB_EAST[(Supabase Primary<br/>PostgreSQL)]
        REDIS_EAST[(Upstash Redis)]
    end

    subgraph "Compute - EU West"
        WEB_EU[Next.js - Vercel]
        API_EU[tRPC API - Railway]
    end

    subgraph "Data - EU West"
        DB_EU[(Supabase Read Replica)]
        REDIS_EU[(Upstash Redis)]
    end

    subgraph "External Services"
        OPENAI[OpenAI API]
        SENTRY[Sentry]
    end

    CDN --> WEB_EAST
    CDN --> WEB_EU

    WEB_EAST --> API_EAST
    API_EAST --> DB_EAST
    API_EAST --> REDIS_EAST
    API_EAST --> WORKER_EAST

    WEB_EU --> API_EU
    API_EU --> DB_EU
    API_EU --> REDIS_EU

    WORKER_EAST --> OPENAI
    API_EAST --> SENTRY
    API_EU --> SENTRY
```

**File naming:** `deploy-production-multi-region.mmd`

---

## Tool Selection

### Recommended Tools

| Tool           | Use Cases                                     | Pros                                                   | Cons                              | Format        |
| -------------- | --------------------------------------------- | ------------------------------------------------------ | --------------------------------- | ------------- |
| **Mermaid**    | Sequence, flowcharts, state, simple diagrams  | Text-based, git-friendly, renders in GitHub/Docusaurus | Limited styling                   | `.mmd`        |
| **PlantUML**   | Complex UML, domain models, detailed diagrams | Powerful, widely supported                             | Requires Java, harder syntax      | `.puml`       |
| **Excalidraw** | Ad-hoc sketches, whiteboarding, brainstorming | Easy to use, beautiful output                          | Not text-based, harder to version | `.excalidraw` |
| **draw.io**    | Complex custom diagrams, network diagrams     | Feature-rich, professional                             | Not text-based, large files       | `.drawio`     |

### Decision Tree

```mermaid
flowchart TD
    START{What are you<br/>diagramming?}

    START -->|API flow or<br/>interactions| SEQ[Use Mermaid<br/>Sequence Diagram]
    START -->|State transitions<br/>or lifecycle| STATE[Use Mermaid<br/>State Diagram]
    START -->|System architecture<br/>or C4 model| C4{Need detailed<br/>customization?}

    C4 -->|No| MERMAID[Use Mermaid<br/>Graph/Flowchart]
    C4 -->|Yes| PLANTUML[Use PlantUML<br/>C4 Extension]

    START -->|Domain model<br/>or class diagram| CLASS[Use PlantUML<br/>Class Diagram]
    START -->|Infrastructure<br/>or network| DEPLOY{Complex<br/>networking?}

    DEPLOY -->|No| MERMAID_DEPLOY[Use Mermaid]
    DEPLOY -->|Yes| DRAWIO[Use draw.io]

    START -->|Quick sketch<br/>or brainstorm| EXCALIDRAW[Use Excalidraw]
```

### General Guidelines

**Use Mermaid when:**

- Diagram needs to be versioned with code
- Simple to moderate complexity
- Rendering in GitHub/Docusaurus is important
- Collaboration through text edits

**Use PlantUML when:**

- Complex domain models or UML
- Need precise control over layout
- Using C4-PlantUML extension
- Generating from code

**Use Excalidraw when:**

- Brainstorming or sketching
- Presenting to non-technical stakeholders
- Need hand-drawn aesthetic
- Quick mockups

**Use draw.io when:**

- Complex network diagrams
- Need rich visual customization
- Creating detailed infrastructure diagrams
- One-time diagrams that won't change often

---

## Naming Conventions

### File Naming Pattern

```
<level>-<type>-<subject>.<extension>

Examples:
01-system-context.mmd
02-container.mmd
03-component-api.mmd
03-component-web.mmd
seq-lead-scoring-flow.mmd
state-deal-lifecycle.mmd
deploy-production.mmd
```

### Naming Components

| Level                  | Prefix          | Example                       |
| ---------------------- | --------------- | ----------------------------- |
| System Context (C4-L1) | `01-system-`    | `01-system-context.mmd`       |
| Container (C4-L2)      | `02-container-` | `02-container.mmd`            |
| Component (C4-L3)      | `03-component-` | `03-component-api.mmd`        |
| Code (C4-L4)           | `04-code-`      | `04-code-lead-aggregate.puml` |
| Sequence               | `seq-`          | `seq-authentication-flow.mmd` |
| State                  | `state-`        | `state-lead-lifecycle.mmd`    |
| Deployment             | `deploy-`       | `deploy-production.mmd`       |

---

## Styling Guidelines

### Color Palette

Use consistent colors to represent different types of elements:

| Element Type        | Mermaid Color  | PlantUML Color | Hex          |
| ------------------- | -------------- | -------------- | ------------ |
| **User/Actor**      | `fill:#E8F5E9` | `#E8F5E9`      | Green-50     |
| **Frontend/UI**     | `fill:#E3F2FD` | `#E3F2FD`      | Blue-50      |
| **API/Backend**     | `fill:#FFF3E0` | `#FFF3E0`      | Orange-50    |
| **Database**        | `fill:#F3E5F5` | `#F3E5F5`      | Purple-50    |
| **External System** | `fill:#ECEFF1` | `#ECEFF1`      | Blue-Gray-50 |
| **Worker/Queue**    | `fill:#FFF9C4` | `#FFF9C4`      | Yellow-50    |

### Mermaid Styling Example

```mermaid
graph TB
    USER[Sales Rep]:::user
    WEB[Next.js Web]:::frontend
    API[tRPC API]:::backend
    DB[(PostgreSQL)]:::database
    EXT[OpenAI]:::external

    USER --> WEB
    WEB --> API
    API --> DB
    API --> EXT

    classDef user fill:#E8F5E9,stroke:#4CAF50,stroke-width:2px
    classDef frontend fill:#E3F2FD,stroke:#2196F3,stroke-width:2px
    classDef backend fill:#FFF3E0,stroke:#FF9800,stroke-width:2px
    classDef database fill:#F3E5F5,stroke:#9C27B0,stroke-width:2px
    classDef external fill:#ECEFF1,stroke:#607D8B,stroke-width:2px
```

### Typography

- **Node labels**: Use clear, concise labels (max 3-4 words)
- **Descriptions**: Add descriptions on second line if needed
- **Ports/URLs**: Include port numbers or URLs for containers

---

## File Organization

### Directory Structure

```
docs/architecture/diagrams/
├── README.md                        # This file
├── 01-system-context.mmd            # C4 Level 1
├── 02-container.mmd                 # C4 Level 2
├── 03-component-api.mmd             # C4 Level 3 (API)
├── 03-component-web.mmd             # C4 Level 3 (Web)
├── 03-component-ai-worker.mmd       # C4 Level 3 (AI Worker)
├── seq-lead-scoring-flow.mmd        # Sequence diagram
├── seq-authentication-flow.mmd      # Sequence diagram
├── state-lead-lifecycle.mmd         # State diagram
├── state-deal-pipeline.mmd          # State diagram
├── deploy-production.mmd            # Deployment diagram
├── domain/                          # Domain-specific diagrams
│   ├── crm-context-bounded.puml     # CRM bounded context
│   ├── intelligence-context.puml    # Intelligence context
│   └── platform-context.puml        # Platform context
└── sketches/                        # Excalidraw/ad-hoc sketches
    ├── initial-architecture.excalidraw
    └── feature-brainstorm.excalidraw
```

### Embedding in Documentation

Reference diagrams in ADRs and documentation:

**Markdown:**

```markdown
## Architecture Overview

![System Context](./diagrams/01-system-context.mmd)
```

**In ADRs:**

```markdown
## Proposed Architecture

See [Container Diagram](../diagrams/02-container.mmd) for the high-level
structure.
```

---

## Examples

### Example 1: C4 System Context

See: [`01-system-context.mmd`](./01-system-context.mmd)

### Example 2: C4 Container

See: [`02-container.mmd`](./02-container.mmd)

### Example 3: Sequence Diagram

See: [`seq-lead-scoring-flow.mmd`](./seq-lead-scoring-flow.mmd)

### Example 4: State Diagram

See: [`state-lead-lifecycle.mmd`](./state-lead-lifecycle.mmd)

---

## Best Practices

### DO

✅ **Start with context** - Begin with L1 system context before diving deep ✅
**Use consistent notation** - Stick to established symbols and colors ✅ **Keep
it simple** - Diagrams should clarify, not confuse ✅ **Label everything** - All
nodes and edges should have clear labels ✅ **Version with code** - Store
diagrams in git alongside code ✅ **Update regularly** - Keep diagrams in sync
with implementation ✅ **Add legends** - Include a legend for complex diagrams
✅ **Link diagrams** - Create navigation between abstraction levels

### DON'T

❌ **Don't overcomplicate** - If diagram is hard to read, split it ❌ **Don't
use screenshots** - Use text-based formats for versionability ❌ **Don't mix
abstraction levels** - Keep L1, L2, L3, L4 separate ❌ **Don't duplicate
information** - One source of truth per concept ❌ **Don't skip
titles/legends** - Always include context ❌ **Don't use obscure tools** - Stick
to team-approved tools ❌ **Don't create and forget** - Diagrams need
maintenance

---

## Validation Checklist

Before committing a diagram, verify:

- [ ] Follows C4 model conventions (if applicable)
- [ ] Uses consistent naming convention
- [ ] Includes title and description
- [ ] Colors follow style guide
- [ ] All elements are labeled
- [ ] Legend included (if needed)
- [ ] Renders correctly in GitHub/Docusaurus
- [ ] Linked from relevant documentation
- [ ] Saved in correct directory
- [ ] Source file committed (not just image)

---

## Tools and Resources

### Online Editors

- **Mermaid Live**: https://mermaid.live/
- **PlantUML Online**: http://www.plantuml.com/plantuml/
- **Excalidraw**: https://excalidraw.com/
- **draw.io**: https://app.diagrams.net/

### VS Code Extensions

- **Mermaid Preview**: `bierner.markdown-mermaid`
- **PlantUML**: `jebbs.plantuml`
- **Draw.io Integration**: `hediet.vscode-drawio`
- **Excalidraw**: `pomdtr.excalidraw-editor`

### Documentation

- **C4 Model**: https://c4model.com/
- **Mermaid Docs**: https://mermaid.js.org/
- **PlantUML Reference**: https://plantuml.com/
- **C4-PlantUML**: https://github.com/plantuml-stdlib/C4-PlantUML

---

## Related Documents

- [ADR Template](../adr/000-template.md)
- [ARP Template](../arp/000-template.md)
- [Decision Workflow](../decision-workflow.md)
- [Flowchart Conventions](../flowcharts/README.md)
- [Architecture Overview](../overview.md)

---

**Document Owner:** Architecture Team **Last Updated:** 2025-12-20 **Next
Review:** 2026-03-20
