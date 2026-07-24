# CodeQL Configuration & the Default-Setup Decision

**Status:** Active · **Owner:** Security · **Last verified:** 2026-07-24

This document records how CodeQL code-scanning is configured for IntelliFlow
CRM, why GitHub's **default-setup** is deliberately kept **off**, and the
in-repo backstop (`vendored-js-lint`) that makes the decision durable.

## TL;DR

| Item                               | State                                                                  |
| ---------------------------------- | ---------------------------------------------------------------------- |
| CodeQL **default-setup**           | `not-configured` (deliberately **disabled**)                           |
| CodeQL **advanced setup**          | **Active** — `.github/workflows/security.yml` → `codeql-analysis`      |
| Config file (honoured by advanced) | `.github/codeql/codeql-config.yml`                                     |
| Commit-time backstop               | `tools/scripts/security/vendored-js-lint.mjs` (pre-ship, **required**) |

## Background — the IFC-033 gap (harness Gap #2)

GitHub offers two ways to run CodeQL:

1. **Default-setup** — a repo/org-level toggle enabled from the GitHub UI. It is
   convenient but **does not honour** a repository's `codeql-config.yml`. It
   scans the whole tree with GitHub's own defaults.
2. **Advanced setup** — a workflow you own (here, the `codeql-analysis` job in
   `.github/workflows/security.yml`) that calls `github/codeql-action` with an
   explicit `config-file:`. It **honours** `paths-ignore`, custom query suites,
   etc.

During **IFC-033** (k6 load-test evidence), a `load-test-report.html` was
committed that embedded **~168 KB of vendored k6 dashboard JavaScript inline**.
Default-setup — ignoring our `paths-ignore` — analysed that third-party bundle
and raised a wall of noise alerts on code we neither wrote nor ship as our own.
The manual remediation was to regenerate the report as **script-free static
HTML**.

The root cause was **two independent failure surfaces**:

- **Config bypass:** default-setup ignores `codeql-config.yml`, so our
  `paths-ignore` exclusions did not apply.
- **Incomplete exclusions:** the advanced config already excluded `artifacts/**`
  and `docs/evidence/**`, but not `.lighthouseci/**` or minified/vendored JS.

## Decision

### 1. Keep default-setup disabled; rely on the config-respecting advanced setup

Default-setup is **`not-configured`** and stays that way. The advanced
`codeql-analysis` job in `security.yml` is the authoritative CodeQL scanner: it
runs on pushes to `main`/`develop`, on pull requests, and nightly, and it passes
`config-file: ./.github/codeql/codeql-config.yml` so our exclusions are
honoured.

> ⚠️ **Do not re-enable default-setup from the GitHub UI.** GitHub does not let
> default-setup and advanced setup coexist cleanly, and default-setup would
> reintroduce the config-bypass gap. If a future need arises, change the
> advanced workflow instead. Re-enabling default-setup is a security-review
> decision, not a convenience toggle.

Verify the current state at any time:

```bash
gh api repos/:owner/:repo/code-scanning/default-setup --jq '.state'
# expected: not-configured
```

### 2. Harden the advanced config's exclusions

`.github/codeql/codeql-config.yml` now also excludes the remaining IFC-033-class
paths:

- `**/.lighthouseci/**` — Lighthouse CI run reports (vendored viewer bundle),
  which live at the repo root and so were not covered by `artifacts/**`.
- `**/*.min.js`, `**/*.min.css`, `**/*.bundle.js` — minified/vendored assets.

(`artifacts/**` and `docs/evidence/**` were already excluded, which covers the
committed Lighthouse, Playwright, benchmark, and evidence HTML reports.)

### 3. Enforce the pattern in-repo — `vendored-js-lint` (the durable backstop)

Config exclusions and the default-setup toggle are both **GitHub-side settings**
— nothing in the repository prevents a future author from committing another
vendored-JS-in-HTML file, and nothing prevents an admin from silently
re-enabling default-setup from the UI. To make the decision durable, a pre-ship
gate enforces the underlying rule at commit time:

- **Script:** `tools/scripts/security/vendored-js-lint.mjs`
- **Wiring:** `scripts/pre-ship.mjs` → step `vendored-js-lint` (**required**)
- **Rule:** fail if any tracked `*.html` file carries an **inline** (non-`src`)
  `<script>` block larger than **8 KB**, unless the file is explicitly
  allowlisted.
- **Independent of GitHub:** it runs locally on every push and does not depend
  on which CodeQL setup GitHub happens to run.

Run it manually:

```bash
node tools/scripts/security/vendored-js-lint.mjs        # human-readable
node tools/scripts/security/vendored-js-lint.mjs --json # machine-readable
```

#### When the gate flags your file

Pick one:

1. **Regenerate as script-free static HTML** (the IFC-033 fix) — best for
   evidence/report artefacts.
2. **Externalise the JS** to a `.js` file referenced via `<script src="…">` so
   the CodeQL config governs it normally.
3. **Allowlist it** — if it is a legitimate, reviewed tool-generated report, add
   an entry to `ALLOWLIST` in `vendored-js-lint.mjs` with a one-line reason.
   Adding an allowlist entry is a **security-review** decision.

The allowlist is currently seeded with the known tool-generated reports
(`artifacts/lighthouse/**`, `artifacts/benchmarks/**`,
`artifacts/test-results/*`, `artifacts/reports/*`, `.lighthouseci/**`) and the
first-party `apps/project-tracker/public/feature-matrix.html` dashboard.

## Related

- `.github/workflows/security.yml` — advanced CodeQL job + other scanners.
- `.github/codeql/codeql-config.yml` — query suites and `paths-ignore`.
- `tools/scripts/security/vendored-js-lint.mjs` — the commit-time backstop.
- `tools/scripts/__tests__/vendored-js-lint.test.ts` — its unit tests.
