# Compliance Check — Section 4: Plan Deliverables Verification (BLOCKING)

**CRITICAL**: Every file listed in the plan MUST exist at the EXACT path specified.

```
1. Read plan: .specify/sprints/sprint-{N}/planning/{{task_id}}-plan.md
2. Extract all file paths from:
   - "Files to Create:" sections (per-step and summary)
   - "Files to Modify:" sections
3. For EACH path, verify file exists on disk at that exact location
4. Cross-reference count: verified files must equal plan's stated total
5. Verify attestation artifact_hashes covers ALL plan files (no omissions)
```

**Common failure mode**: Implementation creates a file at a different path than planned
(e.g., plan says `components/churn-utils.ts` but file is at `lib/churn-risk/churn-utils.ts`).
This passes typecheck/tests but breaks deliverable tracking.

**How to validate:**
1. Parse plan file for all paths in backticks after "Files to Create:" and "Files to Modify:"
2. Run `test -f <path>` for each
3. If any path is missing, check if a file with the same name exists elsewhere (suggests path deviation)
4. Compare count against plan's "**Total:** N" line

| Check | Requirement |
|-------|-------------|
| All plan paths exist | Every file in "Files to Create/Modify" exists at exact path |
| File count matches | Verified count == plan stated total |
| Attestation coverage | `artifact_hashes` in attestation.json includes ALL plan files |
| No path deviations | Files are at planned paths, not moved to different locations |

**BLOCKING RULE:**
- Any missing file → FAIL (not WARN)
- Count mismatch → FAIL
- Attestation omission → FAIL

## Plan Deliverables — Implementation Steps Verification

### What Gets Checked

1. **Files from Plan**: All paths in `**Files to Create:**` and `**Files to Modify:**` sections
2. **Implementation Steps**: All checkboxes (`- [ ]` and `- [x]`) from the plan
3. **Artifacts**: Referenced artifact paths

### Compliance Output

```
### Plan Deliverables
| Check | Status | Details |
|-------|--------|---------|
| Files | 5/5 EXISTS | All planned files created |
| Steps | 10/12 CHECKED | 2 steps unchecked |
| Overall | WARN | 93% complete |

Missing/Unchecked Items:
- [ ] Run final build verification (Phase 4: VALIDATION)
- [ ] Update documentation (Phase 3: REFACTOR)
```

### Compliance Rules

| Completion % | Compliance Status |
|--------------|-------------------|
| 100% | PASS - All deliverables verified |
| 80-99% | WARN - Minor items incomplete, document |
| 50-79% | FAIL - Significant items missing |
| <50% | FAIL - Major implementation incomplete |

### Why Plan Verification?

- **Accountability**: Ensures LLM agents complete planned work
- **Transparency**: Clear evidence of what was done vs claimed
- **Quality Gate**: Blocks incomplete implementations
- **Audit Trail**: Verifiable record of task completion
