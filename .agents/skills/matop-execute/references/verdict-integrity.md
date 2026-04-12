# MATOP: Verdict Integrity Rules (NON-NEGOTIABLE)

## Rule 1: No PASS Without All Gates Passing

```
IF plan_checkboxes < 100%:
  verdict != PASS
IF artifacts_missing > 0:
  verdict = FAIL
IF any_build_command_failed:
  verdict = FAIL
IF any_stoa_failed:
  verdict = FAIL
```

## Rule 2: Commands Must Be Actually Executed

```
FORBIDDEN: Assuming command success without running
FORBIDDEN: Simulating exit codes
FORBIDDEN: Skipping validation commands
REQUIRED: Use Bash tool to run actual commands
REQUIRED: Capture actual stdout/stderr
REQUIRED: Record actual timestamps
```

## Rule 3: Evidence Must Be Verifiable

For every gate result:

- Command actually executed (timestamped)
- Exit code from actual execution
- Output captured for audit
- Hash of output for verification

## Rule 4: No Manual Override of FAIL

```
IF any automated gate = FAIL:
  verdict MUST be FAIL
  verdict CANNOT be manually changed to PASS
  human intervention required for remediation
```

## Consequences of Invalid Validation

1. **UI shows incorrect status** — Task appears incomplete in dashboard
2. **Sprint metrics invalid** — Progress tracking is incorrect
3. **Attestation rejected** — Compliance audit fails
4. **Human review triggered** — Task flagged for manual inspection

**The system is designed to catch invalid validations. Agents cannot bypass
these checks.**
