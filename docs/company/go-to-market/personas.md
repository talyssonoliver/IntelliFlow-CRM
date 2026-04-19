# Personas — IntelliFlow CRM

**Purpose**: Primary buyer and user personas for IntelliFlow CRM. These personas
inform messaging (`value-props.md`, `copy-blocks.md`), pitch deck customization,
and feature prioritization. Aligned with `icp.md` firmographics.

---

## Persona Map

| Persona          | Role in buying cycle     | Primary surface used    |
| ---------------- | ------------------------ | ----------------------- |
| Founder / GM     | Economic buyer / sponsor | Dashboards, reports     |
| Sales Lead       | Champion / power user    | Pipeline, tasks, mobile |
| RevOps / Ops     | Champion / power user    | Workflows, dashboards   |
| Engineering Lead | Technical evaluator      | APIs, docs, CI/CD gates |

---

## Persona 1: Founder / GM

**Job title examples**: CEO, Co-founder, GM, VP of Sales, CRO

### Goals (what success looks like)

- Faster, more predictable revenue cycles
- Consistent execution — team delivers what was committed
- Investor-ready pipeline data with no manual prep
- Visibility into bottlenecks before they become crises

### Pains (what keeps them up at night)

- Unclear pipeline quality — can't trust the numbers in the CRM
- Inconsistent delivery — every sprint or sales cycle is a surprise
- Automation that creates messes — no audit trail, hard to debug
- Time wasted in QBR prep manually reconciling CRM data

### How they evaluate IntelliFlow CRM

- Wants to see a live dashboard showing real pipeline health
- Asks: “Can I trust this data in front of investors?”
- Values evidence trail and governance story for due diligence

---

## Persona 2: Sales Lead

**Job title examples**: Head of Sales, Sales Manager, AE Lead, SDR Lead

### Goals

- Consistent, automated follow-up — nothing slips through
- Clear pipeline stages with enforced definitions
- Less time on CRM admin, more time in conversations
- Mobile-friendly — updates while in transit

### Pains

- Manual data entry after every call / meeting
- Stale records — unclear which contacts are still active
- Inconsistent follow-up across the team
- No visibility into which automation triggered what

### How they evaluate IntelliFlow CRM

- Wants a 5-minute demo of automated follow-up creation
- Asks: “How long does it take to log a call?”
- Values the audit trail when a deal falls through — “what happened?”

---

## Persona 3: RevOps / Ops

**Job title examples**: RevOps Lead, Head of Operations, Sales Operations
Manager

### Goals

- Trustworthy reporting — dashboards that don't need manual cleaning
- Clean taxonomy — standard definitions enforced, not hoped for
- Workflow automation with explicit rules and audit evidence
- Single source of truth for pipeline and activity data

### Pains

- Fragmented systems — CRM + spreadsheets + manual exports
- Inconsistent field definitions across reps
- Can't enforce process changes — reps work around the system
- Unclear what automation is actually doing

### How they evaluate IntelliFlow CRM

- Wants to see validation gate configuration and field rules
- Asks: “Can I enforce required fields without going to engineering?”
- Values data completeness dashboard and segment coverage metrics

---

## Persona 4: Engineering Lead

**Job title examples**: Head of Engineering, Staff Engineer, Tech Lead, CTO
(small co)

### Goals

- Stable integrations — CRM APIs that don't break silently
- Safe automation — no mystery changes in production
- Observable system — metrics, logs, traces, not just dashboards
- Clean, maintainable codebase — no “CRM black box”

### Pains

- “Mystery” automation — no way to tell what the CRM changed and why
- No evidence trail — debugging automation failures takes hours
- Brittle integrations — CRM vendor changes break data pipelines
- Vendor lock-in — can't export data or migrate without pain

### How they evaluate IntelliFlow CRM

- Asks to see the architecture docs and tRPC API types
- Wants to know about OpenTelemetry integration and DLQ handling
- Values: open stack, no vendor lock-in, CI/CD-style governance gates

---

## Persona Interaction Map

```
Founder/GM ──── approves pilot ──────────────────────────────────────┐
                                                                      │
Sales Lead ─── champions daily use ──── reports to ────────────────► Founder/GM
RevOps ──────── owns workflows/data ──── reports to ───────────────► Founder/GM
Eng Lead ──────── evaluates tech ──────── unblocks ────────────────► RevOps, Sales Lead
```

---

## TODO: to be authored

- Persona validation from pilot cohort interviews (post 3-month pilot)
- Day-in-the-life journey maps per persona
- Key objections and talk tracks per persona
- Secondary personas (SDR, AE individual contributor)

---

**Owner**: PM + Sales  
**Last reviewed**: 2026-04-16  
**Related**: `docs/company/go-to-market/icp.md`,
`docs/company/go-to-market/icp-personas.md`,
`docs/company/messaging/value-props.md`, `docs/sales/pitch-deck-outline.md`
