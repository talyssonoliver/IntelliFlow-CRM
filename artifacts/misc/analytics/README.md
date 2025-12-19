# Privacy-first analytics (Sprint 0)

This directory contains baseline analytics scaffolding for **ENV-016-AI**.

## Sprint 0 scope

- Define an event schema and privacy policy configuration.
- Provide placeholders for insight accuracy tracking.
- Avoid collecting PII by default.

## Deferred scope

AI-generated insights/predictions and automated data science pipelines are not
implemented in Sprint 0. They are tracked as tech debt and planned for later
sprints.

## Files

- `event-schema.json`: canonical event shape (no PII)
- `privacy-config.json`: retention + redaction policy (source: `artifacts/misc/privacy-config.json`)

