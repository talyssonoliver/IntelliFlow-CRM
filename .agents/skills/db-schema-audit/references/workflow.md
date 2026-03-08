# Workflow

## A. Deterministic Drift Phase

1. Compare DB state and Prisma models.
2. Produce a drift summary with:
   - missing tables/models
   - type mismatches
   - default/nullability mismatches
   - missing/extra relations
3. Mark each item as `confirmed` only if deterministic evidence exists.

## B. LLM Multi-Agent Phase

Run the following agents in parallel where possible:

1. Drift Auditor
2. Security Auditor
3. Multi-Tenancy Auditor
4. Performance Auditor
5. Consistency Auditor

Then run an Orchestrator pass to merge/de-duplicate findings.

## C. Human Gate

- Keep only findings with strong evidence and clear remediation.
- Move ambiguous findings to `needs_review`.

## D. Deliverables

1. Executive summary
2. Confirmed findings JSON
3. Needs-review findings JSON
4. Suggested migration backlog (ordered by risk)
