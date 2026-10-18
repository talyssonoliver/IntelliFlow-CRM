# Evidence file renames (PR #916 review, 2026-10-18)

CI's artifact lint (`.github/workflows/artifact-lint.yml`, "Validate .gitignore Coverage") rejects any tracked `*.log`
file. Every tracked PG-202 evidence log was renamed from `<name>.log` to `<name>.txt` with `git mv`; the contents are
unchanged and git history follows each rename.

Lane-written documents (plan, findings, checkpoint, design check, compliance report, attestation, task tracking, delivery
report) were updated to the `.txt` paths. Records written by review sub-agents (the STOA verdicts and the a11y reviews)
are left as their authors wrote them: where they cite `….log`, read `….txt` in the same folder.
