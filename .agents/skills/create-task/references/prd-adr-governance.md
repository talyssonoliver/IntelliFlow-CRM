# PRD/ADR Governance

## Decision Tree

```
Is the task PG-* or IFC-* with UI component?
  YES → Needs PRD (docs/planning/prd-<slug>.md)
  NO  →
    Is the task ENV-* or an architecture/infrastructure decision?
      YES → Needs ADR (docs/planning/adr/ADR-{NNN}-<slug>.md)
      NO  →
        Is the task cross-functional (GOV-*, DOC-*, BRAND-*, etc.)?
          YES → Skip PRD/ADR (optional based on scope)
          NO  → Skip PRD/ADR
```

## Before Creating: Search Existing Documents

1. **Search PRDs**:
   ```
   Glob pattern="docs/planning/prd-*.md"
   ```
   Read titles/overviews to find if a related PRD already exists.

2. **Search ADRs**:
   ```
   Glob pattern="docs/planning/adr/ADR-*.md"
   ```
   Check the ADR README.md index for related decisions.

3. If a related document exists, **link to it** in the CSV Pre-requisites column instead of creating a new one.

## PRD Stub Creation

File: `docs/planning/prd-<slug>.md`

Naming: lowercase, hyphenated slug from the feature name. Example: `prd-contact-merge.md`

Minimum stub content:
```markdown
# Product Requirements Document (PRD)

## Overview

| Field             | Value              |
| ----------------- | ------------------ |
| **Feature Name**  | <Feature Name>     |
| **Owner**         | <Owner>            |
| **Status**        | Draft              |
| **Target Sprint** | <Sprint Number>    |
| **Created Date**  | <YYYY-MM-DD>       |
| **Last Updated**  | <YYYY-MM-DD>       |
| **Related Tasks** | <Task IDs>         |

## Problem Statement

<Brief problem description — 2-3 sentences>

## Acceptance Criteria

- [ ] <Criterion 1>
- [ ] <Criterion 2>
- [ ] <Criterion 3>
```

The full PRD template is at `docs/planning/prd-template.md` — the stub is intentionally minimal. The task implementer will flesh it out during spec-session.

## ADR Stub Creation

File: `docs/planning/adr/ADR-{NNN}-<slug>.md`

### ADR Number Allocation

1. Read `docs/planning/adr/README.md`
2. Find the "Next Steps" section — it states the next available number (currently 038+)
3. Glob `docs/planning/adr/ADR-*.md` to find the actual highest number
4. Allocate MAX + 1

### ADR Naming

Format: `ADR-{NNN}-<slug>.md` where NNN is zero-padded to 3 digits and slug is lowercase-hyphenated.
Example: `ADR-038-contact-merge-strategy.md`

### Minimum stub content:

```markdown
# ADR-{NNN}: <Title>

**Status:** Proposed

**Date:** <YYYY-MM-DD>

**Deciders:** Architecture Team

**Technical Story:** <Task ID>

## Context and Problem Statement

<Brief context — 2-3 sentences>

## Decision Drivers

- <Driver 1>
- <Driver 2>

## Considered Options

- <Option 1>
- <Option 2>

## Decision Outcome

Chosen option: TBD — to be decided during implementation.
```

The full ADR template is at `docs/planning/adr/template.md`.

### Update ADR README

After creating a new ADR stub, add it to the index table in `docs/planning/adr/README.md` and update the "Next Steps" section to reflect the new highest number.

## Linking Back

After creating PRD/ADR stubs:
1. Add the file path to the task's Pre-requisites column: `FILE:docs/planning/prd-<slug>.md` or `FILE:docs/planning/adr/ADR-NNN-slug.md`
2. Add to Artifacts To Track: `ARTIFACT:docs/planning/prd-<slug>.md` or `ARTIFACT:docs/planning/adr/ADR-NNN-slug.md`
