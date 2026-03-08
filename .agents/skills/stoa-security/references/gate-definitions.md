# Security STOA: Gate Definitions

## Secret Scanning

```bash
# 1. Gitleaks - Secret detection
gitleaks detect --source . --redact 2>&1 | tee "artifacts/reports/system-audit/$RUN_ID/gates/gitleaks.log"
```

## Dependency Audit

```bash
# 2. pnpm audit - Dependency vulnerabilities
pnpm audit --audit-level=high 2>&1 | tee "artifacts/reports/system-audit/$RUN_ID/gates/pnpm-audit-high.log"

# 3. Snyk (if SNYK_TOKEN available)
if [ -n "$SNYK_TOKEN" ]; then
  snyk test --severity-threshold=high 2>&1 | tee "artifacts/reports/system-audit/$RUN_ID/gates/snyk.log"
fi
```

## SAST Scanning

```bash
# 4. Semgrep security audit (if enabled)
semgrep --config=p/security-audit --error 2>&1 | tee "artifacts/reports/system-audit/$RUN_ID/gates/semgrep.log"
```

## Container/IaC Scanning

```bash
# 5. Trivy filesystem scan (if enabled)
trivy fs . --severity HIGH,CRITICAL 2>&1 | tee "artifacts/reports/system-audit/$RUN_ID/gates/trivy-fs.log"

# 6. Trivy image scan (if Docker image exists)
if docker images | grep -q "intelliflow-crm"; then
  trivy image --severity HIGH,CRITICAL --exit-code 1 intelliflow-crm:latest 2>&1 | tee "artifacts/reports/system-audit/$RUN_ID/gates/trivy-image.log"
fi
```

## Verdict Logic

| Condition | Verdict |
|---|---|
| All gates exit 0, no findings at any severity | PASS |
| Any gate exits non-zero | FAIL |
| HIGH/CRITICAL findings detected | FAIL |
| MEDIUM findings detected | FAIL |
| Secret leak detected | FAIL (immediate) |
| Tool misconfiguration or ambiguous results | NEEDS_HUMAN |

**Note**: There is NO WARN verdict. All findings at any severity result in FAIL. This aligns with the binary gate policy (PASS/FAIL/NEEDS_HUMAN only).

## Security Finding Severity

| Severity | Action |
|---|---|
| CRITICAL | Immediate FAIL, block merge |
| HIGH | FAIL, requires fix before completion |
| MEDIUM | FAIL, requires fix before completion |
| LOW | FAIL, log finding and require fix |

## Unavailable Tools

Many security tools require external setup. When required but unavailable, document the gap — no waiver system. The tool absence is noted in findings but does not contribute to a PASS.

## Execution Code (TypeScript)

```typescript
import {
  loadAuditMatrix,
  runGates,
  generateStoaVerdict,
  writeStoaVerdict,
  getEvidenceDir,
} from './tools/scripts/lib/stoa/index.js';

const matrix = loadAuditMatrix(repoRoot);
const evidenceDir = getEvidenceDir(repoRoot, runId);

const securityGates = ['gitleaks', 'pnpm-audit-high'];

if (process.env.SNYK_TOKEN) {
  securityGates.push('snyk');
}

const results = await runGates(securityGates, {
  repoRoot,
  evidenceDir,
  matrix,
  dryRun: false,
});

const verdict = generateStoaVerdict(
  'Security',
  taskId,
  {
    execute: securityGates,
    skipped: [],
  },
  results
);

writeStoaVerdict(evidenceDir, verdict);
```

## Verdict JSON Schema

```json
{
  "stoa": "Security",
  "taskId": "<TASK_ID>",
  "verdict": "PASS|FAIL|NEEDS_HUMAN",
  "rationale": "All security gates passed with no findings",
  "toolIdsSelected": ["gitleaks", "pnpm-audit-high", "snyk", "semgrep-security-audit"],
  "toolIdsExecuted": ["gitleaks", "pnpm-audit-high"],
  "findings": [],
  "timestamp": "2025-12-20T14:30:00.000Z"
}
```

## Example Output

```
[Security STOA] Task: ENV-008-AI
[Security STOA] Running 2 gates...

  [1/2] gitleaks... PASS (3.2s) - No secrets detected
  [2/2] pnpm-audit-high... PASS (1.8s) - No high/critical vulnerabilities

[Security STOA] Unavailable tools (documented, not contributing to PASS):
  - snyk: env_var_missing (SNYK_TOKEN)
  - semgrep-security-audit: infrastructure_not_ready

[Security STOA] Verdict: PASS
[Security STOA] Rationale: All executed security gates passed with no findings
[Security STOA] Output: artifacts/reports/system-audit/<RUN_ID>/stoa-verdicts/Security.json
```
