# Engineering Audits — IntelliFlow CRM

> **These files are stale** — they were produced during sprints 3–11 as one-time
> code-wiring reviews. The findings they document have since been addressed (or
> superseded by later refactors). Treat them as historical reference, not
> current-state source-of-truth.

## Scope

This directory contains **engineering code audits** — systematic reviews of how
UI pages wire to backend APIs and shared components. They are NOT compliance
audits (those live in `docs/compliance-and-governance/`).

## Files

| Audit                            | Scope                                         | Status |
| -------------------------------- | --------------------------------------------- | ------ |
| `account-detail-wiring-audit.md` | Account 360 page ↔ API wiring                 | Stale  |
| `activity-feed-unification.md`   | Activity feed cross-page unification tracking | Stale  |
| `ai-agent-pages-wiring-audit.md` | AI review + settings pages wiring             | Stale  |
| `contact-detail-wiring-audit.md` | Contact 360 page ↔ API wiring                 | Stale  |
| `dashboard-wiring-audit.md`      | Dashboard page ↔ API wiring                   | Stale  |
| `dead-code-audit-plan.md`        | Knip-based dead-code analysis (3,782 files)   | Stale  |
| `deal-detail-wiring-audit.md`    | Deal/Opportunity detail ↔ API wiring          | Stale  |
| `entity-detail-debt-analysis.md` | Cross-entity tech-debt analysis               | Stale  |
| `lead-detail-wiring-audit.md`    | Lead 360 page ↔ API wiring                    | Stale  |
| `seed-data-wiring-audit.md`      | DB seed runtime bug audit                     | Stale  |
| `task-detail-wiring-audit.md`    | Task domain ↔ API wiring                      | Stale  |

## Where things go instead

| You're writing…                | Put it in…                                                         |
| ------------------------------ | ------------------------------------------------------------------ |
| A new UI wiring audit          | Here — but consider if a `/code-review` run is more appropriate    |
| A compliance/regulatory audit  | `docs/compliance-and-governance/`                                  |
| A security claims verification | `docs/security/` (e.g. `security-claims-audit.md` was moved there) |
| An architecture decision       | `docs/architecture/adr/`                                           |
| An operational audit           | `docs/operations/` (e.g. `system-audit.md`)                        |
