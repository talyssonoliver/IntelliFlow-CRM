File Structure Analysis Report

  Summary Statistics (excluding project-tracker)

  | Metric                  | Count                       |
  |-------------------------|-----------------------------|
  | Total tree lines        | 2,125                       |
  | Total artifact files    | 821                         |
  | Context duplicates      | 315 (38% of all artifacts!) |
  | System audit run dirs   | 13                          |
  | Top-level artifact dirs | 18 (IFC-160 specifies 6)    |

  ---
  IFC-160 Artifact Conventions Compliance

  ✅ Compliant Directories

  | Directory                                  | Purpose             | Status            |
  |--------------------------------------------|---------------------|-------------------|
  | artifacts/benchmarks/                      | Performance reports | ✅ OK             |
  | artifacts/coverage/                        | Test coverage       | ✅ OK             |
  | artifacts/misc/                            | Configuration       | ✅ OK             |
  | artifacts/metrics/                         | Sprint metrics      | ✅ OK             |
  | artifacts/reports/                         | Reports             | ✅ OK             |
  | artifacts/qualitative-reviews/             | Swarm reviews       | ✅ OK (CLAUDE.md) |
  | artifacts/blockers.json                    | Swarm state         | ✅ OK             |
  | artifacts/human-intervention-required.json | Swarm state         | ✅ OK             |

  ❌ Violations / Non-Standard Directories

  | Directory               | Files | Issue                 | Recommendation                            |
  |-------------------------|-------|-----------------------|-------------------------------------------|
  | artifacts/context/      | 213   | NOT in IFC-160        | Move to reports/ or delete old timestamps |
  | artifacts/attestations/ | 80    | Wrong location        | Move to reports/attestation/              |
  | artifacts/logs/         | 12    | Runtime files         | Add to .gitignore                         |
  | artifacts/lighthouse/   | 2     | Wrong location        | Move to benchmarks/                       |
  | artifacts/performance/  | 2     | Wrong location        | Move to benchmarks/                       |
  | artifacts/sprint0/      | 10    | Legacy codex run      | Archive or delete                         |
  | artifacts/test-results/ | 1     | Wrong location        | Move to coverage/                         |
  | artifacts/validation/   | 0     | Wrong location        | Move to reports/validation/               |
  | artifacts/backups/      | 1     | Not documented        | Document or remove                        |
  | artifacts/forensics/    | 0     | Empty                 | DELETE                                    |
  | artifacts/status/       | 0     | Empty                 | DELETE                                    |

  ---
  Major Bloat Issues

  1. Context File Explosion (315 files = 38% of artifacts)

  Three separate locations storing similar data:
  artifacts/attestations/{TASK-ID}/context_ack.json     (80 files)
  artifacts/context/20251225-181500/{TASK-ID}/          (150+ files, 3 per task)
  artifacts/context/20251225-225405-0e2cd590/{TASK-ID}/ (more copies)
  artifacts/context/20251226-144000/{TASK-ID}/          (more copies)
  artifacts/contexts/{TASK-ID}-context.md               (22 files)

  Fix: Keep only artifacts/attestations/ or consolidate into artifacts/reports/attestation/

  2. System Audit Run Accumulation (13 directories)

  Each audit run creates a new timestamped directory:
  artifacts/reports/system-audit/20251222-201705-b57b8de5/
  artifacts/reports/system-audit/20251222-211124-d01dd204/
  ... (11 more)

  Fix: Keep only latest + one backup, or implement rotation policy

  3. Sprint Prompts at Root (4 files)

  artifacts/Sprint0_prompt.md
  artifacts/Sprint1_prompt.md
  artifacts/Sprint3_prompt.md
  artifacts/Sprint4_prompt.md

  Fix: Move to artifacts/reports/sprint-prompts/ per IFC-160
  After Cleanup Estimate

  | Before         | After         | Savings       |
  |----------------|---------------|---------------|
  | 821 files      | ~400 files    | 51% reduction |
  | 18 directories | 8 directories | 56% reduction |