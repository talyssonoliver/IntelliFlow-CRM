# Security STOA Sub-Agent

Execute Security STOA validation for security-sensitive tasks.

## Usage

```
/stoa-security <TASK_ID> [RUN_ID]
```

## Arguments

- `TASK_ID` (required): The task ID being validated
- `RUN_ID` (optional): The run ID from MATOP orchestrator. If not provided,
  generates a new one.

## Responsibility

The Security STOA owns:

- Secret scanning and leak prevention
- Dependency vulnerability auditing
- SAST (Static Application Security Testing)
- Container and IaC security scanning
- Authentication/authorization code review
- OWASP Top 10 compliance
- Rate limiting and CSRF protection

## Gate Profile (Mandatory)

Execute these gates from `audit-matrix.yml` in order:

### Secret Scanning

```bash
# 1. Gitleaks - Secret detection
gitleaks detect --source . --redact 2>&1 | tee "artifacts/reports/system-audit/$RUN_ID/gates/gitleaks.log"
```

### Dependency Audit

```bash
# 2. pnpm audit - Dependency vulnerabilities
pnpm audit --audit-level=high 2>&1 | tee "artifacts/reports/system-audit/$RUN_ID/gates/pnpm-audit-high.log"

# 3. Snyk (if SNYK_TOKEN available)
if [ -n "$SNYK_TOKEN" ]; then
  snyk test --severity-threshold=high 2>&1 | tee "artifacts/reports/system-audit/$RUN_ID/gates/snyk.log"
fi
```

### SAST Scanning

```bash
# 4. Semgrep security audit (if enabled)
semgrep --config=p/security-audit --error 2>&1 | tee "artifacts/reports/system-audit/$RUN_ID/gates/semgrep.log"
```

### Container/IaC Scanning

```bash
# 5. Trivy filesystem scan (if enabled)
trivy fs . --severity HIGH,CRITICAL 2>&1 | tee "artifacts/reports/system-audit/$RUN_ID/gates/trivy-fs.log"

# 6. Trivy image scan (if Docker image exists)
if docker images | grep -q "intelliflow-crm"; then
  trivy image --severity HIGH,CRITICAL --exit-code 1 intelliflow-crm:latest 2>&1 | tee "artifacts/reports/system-audit/$RUN_ID/gates/trivy-image.log"
fi
```

## Verdict Logic

| Condition                                   | Verdict          |
| ------------------------------------------- | ---------------- |
| All gates exit 0, no HIGH/CRITICAL findings | PASS             |
| Gates pass but MEDIUM findings exist        | WARN             |
| Any gate exits non-zero                     | FAIL             |
| HIGH/CRITICAL findings detected             | FAIL             |
| Secret leak detected                        | FAIL (immediate) |
| Tool misconfiguration or ambiguous results  | NEEDS_HUMAN      |

## Security Finding Severity

| Severity | Action                               |
| -------- | ------------------------------------ |
| CRITICAL | Immediate FAIL, block merge          |
| HIGH     | FAIL, requires fix before completion |
| MEDIUM   | WARN, create review queue entry      |
| LOW      | INFO, log and continue               |

## Verdict Output

Produce verdict file at:
`artifacts/reports/system-audit/$RUN_ID/stoa-verdicts/Security.json`

```json
{
  "stoa": "Security",
  "taskId": "<TASK_ID>",
  "verdict": "PASS|WARN|FAIL|NEEDS_HUMAN",
  "rationale": "All security gates passed with no HIGH/CRITICAL findings",
  "toolIdsSelected": [
    "gitleaks",
    "pnpm-audit-high",
    "snyk",
    "semgrep-security-audit"
  ],
  "toolIdsExecuted": ["gitleaks", "pnpm-audit-high"],
  "waiversProposed": ["snyk", "semgrep-security-audit"],
  "findings": [
    {
      "severity": "medium",
      "source": "pnpm-audit-high",
      "message": "3 moderate vulnerabilities in dev dependencies",
      "recommendation": "Run pnpm audit fix to address"
    }
  ],
  "timestamp": "2025-12-20T14:30:00.000Z"
}
```

## Waiver Handling for Disabled Tools

Many security tools require external setup (tokens, installations). When
required but unavailable:

| Tool                     | Typical Waiver Reason          |
| ------------------------ | ------------------------------ |
| `snyk`                   | `env_var_missing` (SNYK_TOKEN) |
| `semgrep-security-audit` | `infrastructure_not_ready`     |
| `trivy-image`            | `infrastructure_not_ready`     |

Waivers must:

1. Have explicit justification
2. Have expiry date (max 30 days)
3. Be approved by human before task completes

## Execution

```typescript
import {
  loadAuditMatrix,
  runGates,
  generateStoaVerdict,
  writeStoaVerdict,
  createWaiverRecord,
  saveWaivers,
  getEvidenceDir,
} from './tools/scripts/lib/stoa/index.js';

const matrix = loadAuditMatrix(repoRoot);
const evidenceDir = getEvidenceDir(repoRoot, runId);

// Security-specific gates
const securityGates = ['gitleaks', 'pnpm-audit-high'];

// Check for optional gates
if (process.env.SNYK_TOKEN) {
  securityGates.push('snyk');
}

const results = await runGates(securityGates, {
  repoRoot,
  evidenceDir,
  matrix,
  dryRun: false,
});

// Create waivers for required-but-unavailable tools
const waivers = [];
if (!process.env.SNYK_TOKEN) {
  waivers.push(
    createWaiverRecord(
      'snyk',
      matrix.tools.find((t) => t.id === 'snyk'),
      runId
    )
  );
}

if (waivers.length > 0) {
  await saveWaivers(evidenceDir, waivers);
}

const verdict = generateStoaVerdict(
  'Security',
  taskId,
  {
    execute: securityGates,
    waiverRequired: waivers.map((w) => w.toolId),
    skipped: [],
  },
  results,
  waivers,
  isStrictMode()
);

writeStoaVerdict(evidenceDir, verdict);
```

## Example Output

```
[Security STOA] Task: ENV-008-AI
[Security STOA] Running 2 gates (2 waivers required)...

  [1/2] gitleaks... PASS (3.2s) - No secrets detected
  [2/2] pnpm-audit-high... PASS (1.8s) - No high/critical vulnerabilities

[Security STOA] Waivers:
  - snyk: env_var_missing (SNYK_TOKEN)
  - semgrep-security-audit: infrastructure_not_ready

[Security STOA] Verdict: WARN
[Security STOA] Rationale: Gates passed but 2 waivers pending approval
[Security STOA] Output: artifacts/reports/system-audit/<RUN_ID>/stoa-verdicts/Security.json
```

## Related Commands

- `/matop-execute` - MATOP orchestrator (spawns this sub-agent)
- `/stoa-foundation` - Foundation STOA sub-agent
- `/stoa-quality` - Quality STOA sub-agent
