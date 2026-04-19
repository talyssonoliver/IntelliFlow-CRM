# Compliance & Governance — IntelliFlow CRM

Regulatory checklists, data governance policies, and risk management for the
IntelliFlow CRM platform.

## Structure

```
docs/compliance-and-governance/
├── compliance/         Regulatory & accessibility checklists
├── data-governance/    Data protection & retention policies
├── governance/         Risk management & release governance
└── README.md
```

## Compliance (`compliance/`)

| Document                                                                          | Scope                                       |
| --------------------------------------------------------------------------------- | ------------------------------------------- |
| [gdpr-checklist.md](compliance/gdpr-checklist.md)                                 | GDPR compliance controls + evidence mapping |
| [iso-14001-checklist.md](compliance/iso-14001-checklist.md)                       | ISO 14001 environmental management          |
| [iso-27001-checklist.md](compliance/iso-27001-checklist.md)                       | ISO 27001 information security              |
| [iso-42001-checklist.md](compliance/iso-42001-checklist.md)                       | ISO 42001 AI management system              |
| [accessibility-gap-assessment.md](compliance/accessibility-gap-assessment.md)     | WCAG 2.1 AA gap analysis                    |
| [wcag-conformance-statement.md](compliance/wcag-conformance-statement.md)         | WCAG conformance statement                  |
| [vpat-2.5.md](compliance/vpat-2.5.md)                                             | Voluntary Product Accessibility Template    |
| [quarterly-a11y-review-template.md](compliance/quarterly-a11y-review-template.md) | Quarterly accessibility review checklist    |

## Data Governance (`data-governance/`)

| Document                                                   | Scope                                    |
| ---------------------------------------------------------- | ---------------------------------------- |
| [dsar-process.md](data-governance/dsar-process.md)         | Data Subject Access Request workflow     |
| [retention-policy.md](data-governance/retention-policy.md) | Data retention schedules per entity type |

## Governance (`governance/`)

| Document                                        | Scope                                 |
| ----------------------------------------------- | ------------------------------------- |
| [risk-register.md](governance/risk-register.md) | Active risk register with mitigations |

## Where things live vs related directories

| Content type                                           | Location                                  |
| ------------------------------------------------------ | ----------------------------------------- |
| Compliance checklists (GDPR, ISO, WCAG)                | Here (`compliance/`)                      |
| Data protection policies (DSAR, retention)             | Here (`data-governance/`)                 |
| Risk management                                        | Here (`governance/`)                      |
| Security ops (threat models, pentests, crypto, RLS)    | `docs/security/` (separate)               |
| Engineering code audits (wiring, dead-code, tech-debt) | `docs/audit/` (separate — not compliance) |
| Operational runbooks & policies                        | `docs/operations/`                        |
| Architecture decisions (ADRs)                          | `docs/architecture/adr/`                  |
