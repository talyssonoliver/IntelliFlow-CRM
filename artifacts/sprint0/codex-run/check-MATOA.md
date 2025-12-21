You're absolutely right, Talysson. I underestimated the architecture. Let me revise with a proper implementation plan.

---

## ✅ **STOA v3.1 Framework: Revised Implementation**

### **Claude Code as MATOP Lead + Sub-Agent STOAs**

The architecture is actually elegant:

```
┌─────────────────────────────────────────────────────────────────┐
│                    CLAUDE CODE SESSION                          │
│                    (MATOP Lead / Orchestrator)                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│   │ Foundation   │  │   Security   │  │   Quality    │         │
│   │    STOA      │  │    STOA      │  │    STOA      │         │
│   │ (sub-agent)  │  │ (sub-agent)  │  │ (sub-agent)  │         │
│   └──────┬───────┘  └──────┬───────┘  └──────┬───────┘         │
│          │                 │                 │                  │
│          ▼                 ▼                 ▼                  │
│   ┌─────────────────────────────────────────────────┐          │
│   │              EVIDENCE LAYER                      │          │
│   │  artifacts/reports/system-audit/<RUN_ID>/        │          │
│   │  - gate-transcripts/                             │          │
│   │  - stoa-verdicts/                                │          │
│   │  - evidence-hashes.txt                           │          │
│   └─────────────────────────────────────────────────┘          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🏗️ **Implementation: Claude Code Commands + Sub-Agents**

### **1. MATOP Orchestrator Command**

```markdown
<!-- .claude/commands/matop-execute.md -->
# MATOP Task Execution Protocol

Execute a task using the Multi-Agent Task Ownership Protocol.

## Usage
/matop-execute <TASK_ID>

## Protocol
1. Load task from Sprint_plan.csv
2. Determine Lead STOA (by prefix)
3. Derive Supporting STOAs (by impact surface)
4. Spawn STOA sub-agents for validation
5. Collect verdicts and produce evidence bundle
6. Update task status based on consensus

## Sub-Agent Spawning
For each required STOA, spawn a focused sub-agent:
- `/stoa-foundation` for ENV-* infrastructure checks
- `/stoa-security` for security gate profile
- `/stoa-quality` for test/coverage enforcement
- `/stoa-intelligence` for AI/ML validation
- `/stoa-domain` for business logic verification
```

### **2. STOA Sub-Agent Commands**

Each STOA is a focused sub-agent with a specific gate profile:

```markdown
<!-- .claude/commands/stoa-security.md -->
# Security STOA Sub-Agent

## Gate Profile (Mandatory)
Execute in order, capture all output:

```bash
# 1. Secret scanning
pnpm exec gitleaks detect --source . --no-git -v 2>&1 | tee artifacts/reports/system-audit/$RUN_ID/gate-transcripts/gitleaks.log

# 2. Dependency audit
pnpm audit --audit-level=moderate 2>&1 | tee artifacts/reports/system-audit/$RUN_ID/gate-transcripts/pnpm-audit.log

# 3. SAST scan
pnpm exec semgrep scan --config=auto --json 2>&1 | tee artifacts/reports/system-audit/$RUN_ID/gate-transcripts/semgrep.json

# 4. Container/IaC scan (if applicable)
trivy fs . --format json 2>&1 | tee artifacts/reports/system-audit/$RUN_ID/gate-transcripts/trivy.json
```

## Verdict Logic
- PASS: All gates exit 0, no HIGH/CRITICAL findings
- WARN: Gates pass but MEDIUM findings exist
- FAIL: Any gate exits non-zero OR HIGH/CRITICAL findings
- NEEDS HUMAN: Tool misconfiguration or ambiguous results

## Output
Produce: `artifacts/reports/system-audit/$RUN_ID/stoa-verdicts/security.json`
```

```markdown
<!-- .claude/commands/stoa-quality.md -->
# Quality STOA Sub-Agent

## Gate Profile (Mandatory)

```bash
# 1. Type checking
pnpm turbo typecheck 2>&1 | tee artifacts/reports/system-audit/$RUN_ID/gate-transcripts/typecheck.log

# 2. Linting
pnpm turbo lint -- --max-warnings=0 2>&1 | tee artifacts/reports/system-audit/$RUN_ID/gate-transcripts/lint.log

# 3. Unit tests with coverage
pnpm turbo test:coverage 2>&1 | tee artifacts/reports/system-audit/$RUN_ID/gate-transcripts/test-coverage.log

# 4. Extract coverage metrics
# Parse coverage and validate against thresholds
```

## Verdict Logic
- PASS: Coverage >= threshold, all tests pass, no lint errors
- WARN: Coverage within 5% of threshold
- FAIL: Tests fail OR coverage below threshold - 5%

## Output
Produce: `artifacts/reports/system-audit/$RUN_ID/stoa-verdicts/quality.json`
```

```markdown
<!-- .claude/commands/stoa-foundation.md -->
# Foundation STOA Sub-Agent

## Gate Profile (Mandatory)

```bash
# 1. Build validation
pnpm turbo build 2>&1 | tee artifacts/reports/system-audit/$RUN_ID/gate-transcripts/build.log

# 2. Docker validation (if applicable)
docker compose -f docker-compose.yml config -q 2>&1 | tee artifacts/reports/system-audit/$RUN_ID/gate-transcripts/docker-config.log

# 3. Environment bootstrap check
./scripts/validate-env.sh 2>&1 | tee artifacts/reports/system-audit/$RUN_ID/gate-transcripts/env-check.log

# 4. Artifact placement validation
./tools/lint/artifact-paths.ts 2>&1 | tee artifacts/reports/system-audit/$RUN_ID/gate-transcripts/artifact-lint.log
```

## Verdict Logic
- PASS: All infrastructure gates pass
- WARN: Non-critical config warnings
- FAIL: Build fails OR docker config invalid OR env misconfigured

## Output
Produce: `artifacts/reports/system-audit/$RUN_ID/stoa-verdicts/foundation.json`
```

---

### **3. Deterministic STOA Assignment Script**

```typescript
// tools/stoa/assign-stoas.ts

interface STOAAssignment {
  taskId: string;
  leadSTOA: STOAType;
  supportingSTOAs: STOAType[];
  gateProfile: string[];
}

type STOAType = 'foundation' | 'domain' | 'intelligence' | 'security' | 'quality' | 'automation';

// Prefix-based Lead STOA assignment (from v3.1 §2.1)
const LEAD_STOA_MAP: Record<string, STOAType> = {
  'ENV-': 'foundation',
  'EP-': 'foundation',
  'IFC-': 'domain',
  'EXC-SEC-': 'security',
  'SEC-': 'security',
  'AI-': 'intelligence',
  'AI-SETUP-': 'intelligence',
  'AUTOMATION-': 'automation',
};

// Keyword triggers for Supporting STOAs (from v3.1 Appendix A)
const SECURITY_TRIGGERS = ['auth', 'jwt', 'token', 'session', 'rbac', 'permissions', 'secret', 'vault', 'rate-limit', 'csrf', 'xss', 'injection'];
const AI_TRIGGERS = ['prompt', 'agent', 'chain', 'embedding', 'vector', 'scoring', 'llm', 'langchain', 'crewai'];
const QUALITY_TRIGGERS = ['coverage', 'e2e', 'playwright', 'vitest', 'mutation', 'stryker', 'quality gate'];

export function assignSTOAs(task: TaskRecord): STOAAssignment {
  // 1. Determine Lead STOA by prefix
  const leadSTOA = getLeadSTOA(task.taskId);
  
  // 2. Derive Supporting STOAs from DoD, Description, and affected paths
  const supportingSTOAs = deriveSupportingSTOAs(task, leadSTOA);
  
  // 3. Build gate profile based on all assigned STOAs
  const gateProfile = buildGateProfile(leadSTOA, supportingSTOAs);
  
  return { taskId: task.taskId, leadSTOA, supportingSTOAs, gateProfile };
}

function getLeadSTOA(taskId: string): STOAType {
  for (const [prefix, stoa] of Object.entries(LEAD_STOA_MAP)) {
    if (taskId.startsWith(prefix)) return stoa;
  }
  return 'domain'; // Default fallback
}

function deriveSupportingSTOAs(task: TaskRecord, leadSTOA: STOAType): STOAType[] {
  const supporting: Set<STOAType> = new Set();
  const searchText = `${task.description} ${task.dod} ${task.artifacts}`.toLowerCase();
  
  // Security STOA triggers
  if (SECURITY_TRIGGERS.some(t => searchText.includes(t)) && leadSTOA !== 'security') {
    supporting.add('security');
  }
  
  // Intelligence STOA triggers
  if (AI_TRIGGERS.some(t => searchText.includes(t)) && leadSTOA !== 'intelligence') {
    supporting.add('intelligence');
  }
  
  // Quality STOA triggers
  if (QUALITY_TRIGGERS.some(t => searchText.includes(t)) && leadSTOA !== 'quality') {
    supporting.add('quality');
  }
  
  // Foundation is always supporting for non-foundation tasks (baseline gates)
  if (leadSTOA !== 'foundation') {
    supporting.add('foundation');
  }
  
  return Array.from(supporting);
}
```

---

### **4. Evidence Bundle Generator**

```typescript
// tools/stoa/evidence-bundle.ts

import { createHash } from 'crypto';
import { writeFileSync, readdirSync, readFileSync } from 'fs';

interface EvidenceBundle {
  runId: string;
  taskId: string;
  timestamp: string;
  leadSTOA: string;
  supportingSTOAs: string[];
  verdicts: Record<string, STOAVerdict>;
  consensusVerdict: 'PASS' | 'WARN' | 'FAIL' | 'NEEDS_HUMAN';
  evidenceHashes: Record<string, string>;
}

interface STOAVerdict {
  stoa: string;
  verdict: 'PASS' | 'WARN' | 'FAIL' | 'NEEDS_HUMAN';
  rationale: string;
  gatesExecuted: string[];
  findings: Finding[];
}

export function generateEvidenceBundle(runId: string, taskId: string): EvidenceBundle {
  const basePath = `artifacts/reports/system-audit/${runId}`;
  
  // 1. Collect all STOA verdicts
  const verdicts = collectVerdicts(`${basePath}/stoa-verdicts`);
  
  // 2. Determine consensus (all must PASS, any FAIL = FAIL, any NEEDS_HUMAN = NEEDS_HUMAN)
  const consensusVerdict = deriveConsensus(verdicts);
  
  // 3. Generate hashes for all evidence files
  const evidenceHashes = generateHashes(basePath);
  
  // 4. Write evidence-hashes.txt
  const hashContent = Object.entries(evidenceHashes)
    .map(([file, hash]) => `${hash}  ${file}`)
    .join('\n');
  writeFileSync(`${basePath}/evidence-hashes.txt`, hashContent);
  
  // 5. Build and write summary
  const bundle: EvidenceBundle = {
    runId,
    taskId,
    timestamp: new Date().toISOString(),
    leadSTOA: verdicts.lead?.stoa || 'unknown',
    supportingSTOAs: Object.keys(verdicts).filter(k => k !== 'lead'),
    verdicts,
    consensusVerdict,
    evidenceHashes,
  };
  
  writeFileSync(`${basePath}/summary.json`, JSON.stringify(bundle, null, 2));
  
  return bundle;
}

function deriveConsensus(verdicts: Record<string, STOAVerdict>): EvidenceBundle['consensusVerdict'] {
  const allVerdicts = Object.values(verdicts).map(v => v.verdict);
  
  if (allVerdicts.includes('NEEDS_HUMAN')) return 'NEEDS_HUMAN';
  if (allVerdicts.includes('FAIL')) return 'FAIL';
  if (allVerdicts.includes('WARN')) return 'WARN';
  return 'PASS';
}

function generateHashes(basePath: string): Record<string, string> {
  const hashes: Record<string, string> = {};
  
  const walkDir = (dir: string) => {
    for (const file of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = `${dir}/${file.name}`;
      if (file.isDirectory()) {
        walkDir(fullPath);
      } else {
        const content = readFileSync(fullPath);
        hashes[fullPath.replace(basePath + '/', '')] = createHash('sha256').update(content).digest('hex');
      }
    }
  };
  
  walkDir(basePath);
  return hashes;
}
```

---

### **5. Main Orchestrator (MATOP Lead)**

```typescript
// tools/stoa/matop-orchestrator.ts

import { assignSTOAs } from './assign-stoas';
import { generateEvidenceBundle } from './evidence-bundle';
import { execSync } from 'child_process';
import { v4 as uuidv4 } from 'uuid';

export async function executeTask(taskId: string): Promise<void> {
  const runId = `${taskId}-${uuidv4().slice(0, 8)}`;
  const basePath = `artifacts/reports/system-audit/${runId}`;
  
  // 1. Create run directory structure
  execSync(`mkdir -p ${basePath}/{gate-transcripts,stoa-verdicts}`);
  
  // 2. Load task and assign STOAs
  const task = await loadTaskFromCSV(taskId);
  const assignment = assignSTOAs(task);
  
  console.log(`[MATOP] Task: ${taskId}`);
  console.log(`[MATOP] Lead STOA: ${assignment.leadSTOA}`);
  console.log(`[MATOP] Supporting STOAs: ${assignment.supportingSTOAs.join(', ')}`);
  
  // 3. Execute each STOA sub-agent (spawn focused validation contexts)
  const allSTOAs = [assignment.leadSTOA, ...assignment.supportingSTOAs];
  
  for (const stoa of allSTOAs) {
    console.log(`[MATOP] Spawning ${stoa} STOA sub-agent...`);
    
    // Spawn sub-agent with focused gate profile
    // In Claude Code, this would be a /run or direct command invocation
    execSync(`RUN_ID=${runId} pnpm tsx tools/stoa/run-stoa.ts ${stoa} ${taskId}`, {
      stdio: 'inherit',
      env: { ...process.env, RUN_ID: runId, TASK_ID: taskId },
    });
  }
  
  // 4. Collect verdicts and generate evidence bundle
  const bundle = generateEvidenceBundle(runId, taskId);
  
  // 5. Update task status based on consensus
  await updateTaskStatus(taskId, bundle.consensusVerdict, runId);
  
  console.log(`[MATOP] Consensus: ${bundle.consensusVerdict}`);
  console.log(`[MATOP] Evidence: ${basePath}/summary.json`);
}
```

---

## 📁 **Updated Project Structure**

Based on STOA v3.1 Section 7 (artifact placement):

```
intelliFlow-CRM/
├── .claude/
│   └── commands/
│       ├── matop-execute.md          # Main orchestrator
│       ├── stoa-foundation.md        # Foundation sub-agent
│       ├── stoa-security.md          # Security sub-agent
│       ├── stoa-quality.md           # Quality sub-agent
│       ├── stoa-intelligence.md      # AI/ML sub-agent
│       ├── stoa-domain.md            # Domain sub-agent
│       └── stoa-automation.md        # Automation sub-agent
│
├── tools/
│   ├── stoa/
│   │   ├── assign-stoas.ts           # Deterministic assignment
│   │   ├── evidence-bundle.ts        # Hash generation
│   │   ├── matop-orchestrator.ts     # Main orchestrator
│   │   └── run-stoa.ts               # Sub-agent runner
│   └── lint/
│       └── artifact-paths.ts         # IFC-160 linter
│
├── artifacts/                         # ALL runtime outputs here
│   ├── reports/
│   │   └── system-audit/
│   │       └── <RUN_ID>/
│   │           ├── gate-transcripts/
│   │           ├── stoa-verdicts/
│   │           ├── evidence-hashes.txt
│   │           ├── summary.json
│   │           └── summary.md
│   ├── logs/
│   ├── metrics/
│   ├── coverage/
│   └── sprint-data/
│       ├── Sprint_plan.csv           # Canonical source
│       ├── Sprint_plan.json
│       └── task-registry.json
│
└── apps/project-tracker/
    └── docs/                          # ONLY static documentation
        └── metrics/
            └── schemas/               # JSON schemas (move to packages/)
```

---

## 🎯 **Sprint 0 Implementation Checklist**

| Step | Action | Owner | Status |
|------|--------|-------|--------|
| 1 | Create `/artifacts/` root structure | Foundation STOA | 🔲 |
| 2 | Migrate runtime outputs from `docs/metrics/` | Foundation STOA | 🔲 |
| 3 | Create `.claude/commands/` for all 6 STOAs | Automation STOA | 🔲 |
| 4 | Implement `tools/stoa/assign-stoas.ts` | Automation STOA | 🔲 |
| 5 | Implement `tools/stoa/evidence-bundle.ts` | Automation STOA | 🔲 |
| 6 | Implement `tools/stoa/matop-orchestrator.ts` | Automation STOA | 🔲 |
| 7 | Add artifact-paths linter to CI | Foundation STOA | 🔲 |
| 8 | Update `plan-overrides.yaml` schema | Automation STOA | 🔲 |

---

## ✅ **What Success Looks Like**

```bash
# Developer runs:
/matop-execute ENV-008-AI

# Claude Code (MATOP Lead):
[MATOP] Task: ENV-008-AI
[MATOP] Lead STOA: foundation
[MATOP] Supporting STOAs: quality, security
[MATOP] Spawning foundation STOA sub-agent...
[MATOP] Spawning quality STOA sub-agent...
[MATOP] Spawning security STOA sub-agent...
[MATOP] Consensus: PASS
[MATOP] Evidence: artifacts/reports/system-audit/ENV-008-AI-a1b2c3d4/summary.json

# Task status updated to Completed with evidence hash
```