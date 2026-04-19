# ICP Definition — IntelliFlow CRM

**Purpose**: The canonical Ideal Customer Profile (ICP) for IntelliFlow CRM.
Used for outbound targeting, pilot partner selection, and go-to-market
messaging. Aligned with `docs/company/go-to-market/personas.md` and referenced
from `docs/sales/pitch-deck-outline.md`.

---

## Who We Serve

Teams that need a modern CRM with automation and governance — without adopting a
heavy enterprise suite or tolerating a "black box" automation platform.

---

## Firmographics

| Dimension      | Target                                             |
| -------------- | -------------------------------------------------- |
| Company size   | SMB to mid-market (10–500 employees)               |
| Industry       | B2B SaaS, professional services, tech-enabled B2B  |
| Geography      | UK / EU primary; US secondary (English-first)      |
| Team structure | Distributed / remote-first teams                   |
| Revenue stage  | Post-seed to Series B (or equivalent bootstrapped) |
| Sales motion   | Outbound or product-led with a sales assist layer  |

---

## Technographics

| Signal                           | Why it matters                                               |
| -------------------------------- | ------------------------------------------------------------ |
| Uses GitHub + CI/CD              | Comfortable with validation gates and evidence-based ops     |
| Modern web stack (React, Node)   | Can self-serve API integrations without a systems integrator |
| Has (or wants) observability     | Values metrics, logs, traces — not just dashboards           |
| Current CRM is Pipedrive/HubSpot | Has outgrown basic automation; feels the data quality pain   |
| Uses Notion / Linear / Jira      | Structured, process-oriented team culture                    |

---

## Buying Triggers (When They Are Ready to Buy)

- CRM data is messy or stale — dashboard numbers aren't trusted
- Lead follow-up is inconsistent — reps doing it differently
- "Our automation is a black box" — no audit trail, no confidence
- Sales/RevOps/Eng alignment is breaking down — no shared data definitions
- Preparing for investor QBR — need trustworthy pipeline numbers

---

## Must-Have Requirements (Hard Criteria)

A prospect is ICP-fit if they need ALL of the following:

1. Reliable automation with explicit validation and safeguards (not just
   triggers)
2. Auditability — every automated action must be traceable and reversible
3. Fast UI + API performance (no legacy UX tolerance)
4. Modern developer experience — engineering team will integrate and extend the
   CRM

---

## Disqualifying Signals (Out of ICP)

| Signal                                          | Reason to disqualify                         |
| ----------------------------------------------- | -------------------------------------------- |
| Pure enterprise / regulated industry (FSA, NHS) | Compliance overhead; not our current scope   |
| Needs a native mobile app as primary surface    | Mobile-first not yet a priority              |
| Deeply embedded in Salesforce ecosystem         | Integration complexity; switch cost too high |
| No engineering team                             | Self-service integrations not feasible       |
| Wants "just a simple CRM" — no automation       | Wrong product fit                            |

---

## Scoring Model (Pilot Partner Selection)

Score 1 point per matching criterion:

- [ ] B2B SaaS or services
- [ ] 10–200 employees
- [ ] Has an engineering team (≥1 engineer)
- [ ] Currently uses GitHub or equivalent
- [ ] Pain with CRM data quality or automation opacity
- [ ] Willing to provide regular feedback (≥2/month during pilot)
- [ ] Decision-maker is a Founder, Sales Lead, or RevOps Lead

**Score 6–7**: Strong pilot partner candidate  
**Score 4–5**: Acceptable — proceed with qualification call  
**Score <4**: Out of ICP — decline politely

---

## TODO: to be authored

- Quantified ICP validation from pilot cohort data (post 3-month pilot)
- Secondary ICP: agency / consultancy segment
- Channel-specific ICP variants (PLG vs. outbound vs. partner-led)
- Competitive displacement criteria (Salesforce, HubSpot, Pipedrive)

---

**Owner**: PM + Sales  
**Last reviewed**: 2026-04-16  
**Related**: `docs/company/go-to-market/personas.md`,
`docs/company/go-to-market/icp-personas.md`, `docs/sales/pitch-deck-outline.md`
