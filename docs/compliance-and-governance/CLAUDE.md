# docs/compliance-and-governance — Agent guide

## Purpose

Regulatory compliance checklists, data governance policies, and risk management.
Agents use this when tasks touch GDPR, ISO certification, accessibility
(WCAG/VPAT), data retention, DSARs, or risk register updates.

## Structure

```
docs/compliance-and-governance/
├── compliance/         GDPR, ISO 14001/27001/42001, WCAG/VPAT, a11y review
├── data-governance/    DSAR process, retention policy
└── governance/         Risk register
```

## Rules for agents

### What belongs here vs elsewhere

- **Compliance checklist or regulatory mapping?** → `compliance/`
- **Data protection or retention policy?** → `data-governance/`
- **Risk register, release governance?** → `governance/`
- **Security ops (threat models, pentests, crypto, RLS)?** → `docs/security/`
  (NOT here)
- **Engineering code audit (wiring, dead-code, debt)?** → `docs/audit/` (NOT
  here — different audience)
- **Operational policy (SLOs, incident process)?** → `docs/operations/` (NOT
  here)

### Key cross-references

- `docs/security/dpia.md` — Data Protection Impact Assessment lives in security
  (stale placeholder). If it becomes substantive, consider linking from
  `data-governance/`.
- `docs/security/owasp-checklist.md` — OWASP is security ops, not regulatory
  compliance. Stays in security.
- `docs/architecture/adr/ADR-007-data-governance.md` — the architectural
  decision behind data classification. This dir holds the POLICIES; that ADR
  holds the WHY.
- `docs/architecture/adr/ADR-009-zero-trust-security.md` — security
  architecture. ISO 27001 checklist references it.

### Consolidation context (2026-04-17)

- `docs/compliance/` → merged into `compliance-and-governance/compliance/`
- `docs/data-governance/` → merged into
  `compliance-and-governance/data-governance/`
- `docs/governance/` → merged into `compliance-and-governance/governance/`
- `docs/audit/security-claims-audit.md` → moved to `docs/security/` (it's a
  security ops audit, not compliance)
- Do NOT create `docs/compliance/`, `docs/data-governance/`, or
  `docs/governance/` at root level — they were consolidated here.
- Historical attestations referencing old paths were left untouched.
