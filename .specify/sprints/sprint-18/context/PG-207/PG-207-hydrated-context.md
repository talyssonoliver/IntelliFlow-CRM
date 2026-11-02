# PG-207 hydrated context (structured audits)

Compiled 2026-10-20 by the PG-207 lane during /spec-session Phases 0-0.77. The
generated hydration output is `hydrated-context.json` / `hydrated-context.md`
(context-hydration.ts). Exploration evidence: `PG-207-spec-exploration.md`.
Owner rulings Q1-Q10: `PG-207-owner-ruling.md`.

- Shared component audit (Phase 0.76): 10 reuse decisions — ModuleSettingsShell,
  PageHeader, SectionHeader, EmptyState, RichTextEditor, form primitives and
  TypeSettingsLoading reused; Dialog + AlertDialog composed; EmailCompose
  extended for the default-signature prefill. New page-local section cards, a
  SecretField (PasswordInput is a dark controlled login field) and a
  SignatureDialog are justified (no shared component renders mail-server
  connection fields).
- Route conflict audit (Phase 0.77): both target routes are stubs and are
  rewritten in place; the email settings panel description is updated;
  `/email/templates` is a different feature (PG-085) and stays untouched. No
  fake-data page overlaps the feature anywhere else.
- PRD required (PG-\* UI): `docs/planning/prd-module-settings.md` gets a PG-207
  addendum.
- ADR required (new external dependency nodemailer, per-tenant transport, secret
  storage, bounce ingestion): ADR-085 (allocated by the runner).
