# ENG-OPS-002 Finding Schema (canonical)

Every finding object MUST have these keys (reproducibility is mandatory):

```jsonc
{
  "id": "STABLE-ID",              // e.g. DDD-001, HEX-003, SEC-007, PERF-002, QUAL-004, STALE-005
  "severity": "Critical|High|Medium|Low|Info",
  "category": "short-slug",       // e.g. anemic-domain, layer-violation, idor, n-plus-one, god-file, stale-adr
  "boundedContext": "leads|contacts|accounts|deals|billing|auth|ai|scheduling|communications|legal|documents|platform|cross-cutting|n/a",
  "hexLayer": "domain|application|adapters|infrastructure|ui|api-router|worker|cross-cutting|n/a",
  "file": "relative/path/from/repo/root.ts",
  "line": 123,                    // 1-indexed; or "range": "120-140"
  "evidence": "REPRODUCIBLE: exact grep/command OR file:line quote proving the finding",
  "impact": "what breaks / what risk this creates",
  "probability": "High|Medium|Low",   // likelihood of manifesting
  "rootCause": "why this exists",
  "policyViolation": "ADR-0XX / PRD / policy name, or null",
  "remediation": "concrete proposed fix (NOT applied — audit only)",
  "suggestedOwner": "backend-architect|security-lead|test-engineer|frontend-lead|data-engineer|domain-expert|devops-lead|ai-specialist",
  "dependencies": ["other finding IDs or task IDs, or empty"],
  "estimateMinutes": 120,          // O/M/P midpoint estimate for remediation
  "sprintCandidate": "19|20|21|backlog",
  "confidence": 85,                // 0-100 analyst confidence
  "possibleFalsePositive": false,  // bool
  "falsePositiveJustification": "why it might be a false positive, or null"
}
```

## Rules
1. NO fabricated file:line — every `file`+`line` must actually exist and contain what evidence claims.
2. Evidence must be reproducible: a grep command OR a verbatim code quote with file:line.
3. If you cannot confirm, mark `possibleFalsePositive: true` and lower `confidence`.
4. Do NOT propose or apply code fixes in the repo — this is audit only. `remediation` is a text proposal.
5. Every Critical/High finding MUST have a `suggestedOwner` and a `remediation`.
6. Output a JSON object: `{ "meta": {...}, "findings": [ ... ] }`.
