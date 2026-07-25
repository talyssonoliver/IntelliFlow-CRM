# ENG-OPS-003.Gap13 — Docs build silent no-op

**Issue:** #647 — _docs: Docusaurus site does not build, and docs:build/docs:dev
silently no-op_
**Type:** Harness/CI gap (attestation-tracked, NOT a `Sprint_plan.csv` row — same
class as Gap2/Gap6/Gap7/Gap12).
**Follow-up of:** ENG-OPS-003.Gap6 (#645 / #642).

## Problem (two linked defects)

1. **Silent no-op (the titled bug, the L20 pattern).** Root scripts were
   `"docs:dev": "pnpm --filter docs dev"` and
   `"docs:build": "pnpm --filter docs build"`. But `docs/` is **deliberately not
   a pnpm workspace member** (folding it in drags `docusaurus build` into the
   required turbo `Build` gate — tried and reverted in #645). So `--filter docs`
   matches **zero** projects and **pnpm exits 0** — reporting success while
   building nothing. `pnpm docs:build` was green-that-did-nothing: silence as
   success. `docs:dev` had a second latent bug — it invoked a `dev` script that
   `docs/package.json` does not define (Docusaurus dev is `start`).

2. **Site does not build.** The Docusaurus content preset set
   `routeBasePath: '/'` but **no `path`**, so it defaulted to `docs/docs/` (which
   does not exist) while the Markdown lives directly under `docs/`. Build failed:
   _"The docs folder does not exist for version current."_ Defect 1 is why
   defect 2 went unnoticed for months.

## Root cause

`docs/` is a **kitchen-sink directory** — curated Markdown content mixed with
`node_modules/`, the Docusaurus `src/`, generated governance reports
(`CURRENT_STATE_REPORT.md`, `evidence/`, `audit/`, `operations/`, …). Building
the **whole** tree cleanly is not a config change: many files are authored as
GitHub-flavored Markdown and are **MDX-hostile** (malformed YAML front matter,
JSX-hostile `<...>`), and `sidebars.js` references explicit doc IDs that do not
all exist. That curation is a separate, open-ended effort.

## Scope decision

**In scope (this task):** kill the silence-as-success footgun and correct the
objectively-wrong content path so the build fails **loudly and meaningfully**.

- `docs:build` / `docs:dev` invoke the **standalone** docs project directly
  (`pnpm --dir docs --ignore-workspace run build|start`) so the exit code
  propagates. No `--filter docs` while docs is out of the workspace.
- Docusaurus preset declares an explicit `path: '.'` (+ minimal `exclude` for
  `node_modules`/`src`/tooling), so it targets the real content root instead of
  silently defaulting to the nonexistent `docs/docs/`.

**Out of scope (documented follow-up):** curating the hundreds of governance
Markdown files into an MDX-clean, fully-building site, and the consequent
workspace fold + `docs/pnpm-lock.yaml` removal + `docs-audit` pre-ship retirement
(issue #647 step 2). Until the site builds clean, `docs/` **stays out** of the
workspace (the required `Build` gate must not run `docusaurus build`).

## Acceptance criteria

- **AC-1** — `pnpm docs:build` runs the real `docusaurus build` and, when content
  cannot be resolved, **hard-errors (exit ≠ 0)**. It can **never** report success
  without building. (Issue acceptance: "either (a) actually builds or (b)
  hard-errors when it can't find content." → (b), honestly.)
- **AC-2** — `pnpm docs:dev` invokes the real Docusaurus dev server (`start`), not
  a nonexistent `dev` script, and not an empty `--filter`.
- **AC-3** — The content preset declares an explicit `path`; it cannot fall back
  to `docs/docs/`.
- **AC-4** — A regression guard fails if any of these regress (script reverts to
  the silent `--filter docs` form, or the explicit `path` is removed, or `docs/`
  is added to the workspace).
- **AC-5** — No workspace fold; `docs/` keeps its own lockfile; the
  `pnpm-workspace.yaml` rationale note is updated to match reality.
- **AC-6** — Standard gates: TS + Tests + Lint + Build + full pre-ship clean at
  the final SHA (no bypass).

## Non-goals / guardrails

- Do **not** fold `docs/` into the workspace (known required-`Build` trap, #645).
- Do **not** attempt a full green site build (content curation — follow-up).
- No pre-ship bypass, no `--no-verify`, no destructive git.
