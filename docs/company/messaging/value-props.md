# Value Propositions — IntelliFlow CRM

**Purpose**: Canonical value statements per audience segment. These are the
source-of-truth claims used in pitch deck slide 6, feature blocks, and
persona-tailored outreach. Keep copy consistent with `copy-blocks.md` and
`personas.md`.

---

## For Sales Teams

**Core promise**: Less time managing the CRM, more time selling.

| Pain removed                        | Value delivered                             |
| ----------------------------------- | ------------------------------------------- |
| Manual data entry and cleanup       | AI-assisted data enrichment and dedup       |
| Stale records and missed follow-ups | Automated reminders with validation gates   |
| Inconsistent pipeline stages        | Enforced stage definitions and field rules  |
| No visibility into automation       | Full audit trail — see what changed and why |

**One-liner**: "IntelliFlow CRM handles the admin so your team stays in
conversations."

---

## For Ops / RevOps

**Core promise**: Trustworthy data and dashboards, without heroic cleanup
effort.

| Pain removed                         | Value delivered                                  |
| ------------------------------------ | ------------------------------------------------ |
| Fragmented systems and definitions   | Standard taxonomy enforced at entry              |
| Unreliable reports and stale metrics | Real-time dashboards backed by validated data    |
| Inconsistent process across reps     | Enforceable workflow rules with evidence logging |
| Manual reconciliation before QBRs    | Automated data quality gates pre-report          |

**One-liner**: "Clean data, enforced definitions, and dashboards you can trust
in a QBR."

---

## For Engineering

**Core promise**: A CRM platform built like a modern software product — not a
legacy SaaS with a brittle API bolted on.

| Pain removed                            | Value delivered                                   |
| --------------------------------------- | ------------------------------------------------- |
| Mystery automation with no audit trail  | Full observability (OTLP, Sentry, Prometheus)     |
| Type-unsafe integrations                | tRPC end-to-end type safety; Zod validation       |
| Monolithic, hard-to-extend codebase     | Hexagonal / DDD architecture; composable packages |
| No CI governance for CRM config changes | CI/CD-style validation gates for all data changes |

**One-liner**: "Finally, a CRM codebase you'd actually want to maintain."

---

## For Founders / GM

**Core promise**: Predictable execution with evidence you can show stakeholders.

| Pain removed                          | Value delivered                                    |
| ------------------------------------- | -------------------------------------------------- |
| Unclear pipeline quality              | Real-time pipeline health dashboard                |
| Inconsistent delivery and follow-up   | Automated workflows with explicit validation       |
| No auditability for investor reviews  | Cryptographically verified evidence trail          |
| Slow time-to-value from new CRM tools | Live in weeks with incremental value at each phase |

**One-liner**: "Predictable revenue cycles and evidence-backed delivery, from
day one."

---

## Usage Rules

- Use the **one-liner** for email subjects and slide subtitles.
- Use the **table rows** for detail slides, feature matrices, and objection
  responses.
- Do NOT invent new value claims without adding them here first.
- Keep aligned with `docs/company/go-to-market/personas.md` pain/success
  sections.

## TODO: to be authored

- Quantified value benchmarks (e.g., "50% reduction in CRM admin" with source)
- Competitive differentiation statements vs. Salesforce / HubSpot
- Localized variants if international markets are targeted

---

**Owner**: PM + Marketing  
**Last reviewed**: 2026-04-16  
**Related**: `docs/company/messaging/copy-blocks.md`,
`docs/company/go-to-market/personas.md`, `docs/sales/pitch-deck-outline.md`
