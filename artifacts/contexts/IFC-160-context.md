# Task Context: IFC-160

## Description
Artifact path conventions + CI lint to prevent repo drift

## Dependencies
ENV-001-AI, ENV-002-AI

## Prerequisites
None

## Definition of Done
Repo artifact conventions documented; artifact-path linter added; CI blocks non-canonical artifact paths; move-map template provided

## KPIs
  - N/A

## Expected Artifacts
  - docs/architecture/repo-layout.md
  - docs/architecture/artifact-conventions.md
  - tools/lint/artifact-paths.ts
  - .github/workflows/artifact-lint.yml
  - scripts/migration/artifact-move-map.csv

## Validation Method
Run artifact-lint in CI; introduce an invalid artifact path and confirm CI fails; review migration map completeness

---

## Upstream Context

---
Generated: 2025-12-16T05:05:04+00:00
