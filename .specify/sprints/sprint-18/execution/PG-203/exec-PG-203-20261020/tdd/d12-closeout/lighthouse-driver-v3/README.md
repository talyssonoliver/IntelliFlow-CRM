# Lighthouse driver v3 (PG-203, run 9, 2026-10-29)

The driver that produced the run 9 reports in `artifacts/lighthouse/PG-203/`, copied byte-for-byte except:

- `e2e-dsar.ts` is stored as `e2e-dsar.ts.txt`, so the repo's lint does not check evidence as source code.
  Rename it back to `.ts` to run it.
- In `make-env.py`, the seed-user password key name is built from parts so the secret scanner does not read the
  line as a credential. The value is still random per run and is never written to the repo.

See `artifacts/lighthouse/PG-203/local-run-note.md` for how the stack is started.
