---
name: db-schema-audit
description:
  Audit and compare database schemas using Supabase snapshot SQL plus Prisma
  schemas. Use deterministic drift checks first, then multi-agent LLM analysis
  with structured findings and human approval gates.
user-invocable: true
---

# DB Schema Audit

Use this skill when the user asks to audit schema quality, detect drift, prepare
a DB review pack for other LLMs, or run a multi-agent schema analysis workflow.

## Inputs

Primary inputs in this repo:

- Supabase snapshot SQL: `infra/supabase/schema-snapshots/*.sql`
- App Prisma schema: `packages/db/prisma/schema.prisma`
- Audit Prisma schema: `packages/db/prisma/schema-audit.prisma`

## Mandatory Process (in order)

1. **Collect source artifacts**
   - Confirm latest snapshot file and both Prisma schemas.
   - Do not mutate source schemas during analysis.

2. **Run deterministic checks first**
   - Detect objective drift between DB state and Prisma state.
   - Prefer CLI diff/introspection workflow over LLM-only reasoning.

3. **Build an LLM analysis pack**
   - Produce compact, structured context:
     - table list
     - columns/types/nullability/defaults
     - PK/FK graph
     - enum usage
     - tenant isolation markers (`tenantId` coverage)
   - Chunk by domain to reduce token cost.

4. **Run multi-agent audit**
   - Assign specialized auditors (drift, security, tenancy, performance,
     consistency).
   - Require structured outputs for every finding.

5. **Human approval gate**
   - Promote only high-confidence findings with evidence.
   - Separate “confirmed issues” vs “needs review”.

6. **Persist outputs**
   - Save findings and summary in artifacts for trend comparison.

## Output Contract (required)

Every finding must include:

- `id`
- `category`
- `severity` (`low|medium|high|critical`)
- `confidence` (0-1)
- `evidence`
- `affected_objects`
- `recommendation`
- `migration_risk`

Use the exact templates in:

- `references/workflow.md`
- `references/subagent-prompts.md`
- `references/output-schema.md`

## Guardrails

- Never execute destructive DB operations during audit.
- Never accept unverified LLM claims without schema evidence.
- Deterministic checks are the source of truth for drift.
- Keep recommendations migration-safe and reversible where possible.
