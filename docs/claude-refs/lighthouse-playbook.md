# Lighthouse Playbook

Canonical recipe for running Lighthouse locally against IntelliFlow CRM routes.
Supersedes the ad-hoc notes under `artifacts/lighthouse/*/local-run-note.md`.

**Audience**: any agent or human producing a task attestation with a Lighthouse
KPI. If you are about to write `"met": false` with a reason like "deferred to
CI" / "NOT_RUN" / "full run deferred", **stop and read this file first.** The
recipe below works for the majority of routes on this host.

**Last verified**: 2026-04-15 (PG-195) and 2026-04-19 (PG-054 control run).

---

## Decision tree

```
Is the route /404, /500, /maintenance, or another static system page?
  → Path A: Base unauthenticated recipe   (works, evidence below)

Is the route public but dynamic (/aup, /dpa, /pricing, /login, /)?
  → Path B: Base recipe with extended timeouts
     If still NO_FCP after r1+r2+r3, fall through to Path C with narrow URL

Is the route behind auth (/settings/**, /dashboard, /contacts/**, etc.)?
  → Path C: lighthouse:auth harness (Supabase cookie injection)

None of the above worked after a genuine attempt?
  → Path D: Waiver — requires lighthouse_waiver_approved_by: <human>
```

**A waiver is the LAST step, not the first.** Skipping A, B, and C and writing
"deferred to CI" is not acceptable — `check-lighthouse-evidence.mjs` will BLOCK.

---

## Path A — Unauthenticated base recipe

**Status**: proven working. Recent evidence:

| File                                               | fetchTime  | Performance |
| -------------------------------------------------- | ---------- | ----------- |
| `artifacts/lighthouse/pg-195-post-subset-404.json` | 2026-04-15 | 0.96        |
| `artifacts/lighthouse/PG-054/404-ctrl.json`        | 2026-04-19 | 0.96        |
| `artifacts/lighthouse/pg-056-500-r{1,2,3}.json`    | 2026-02    | (real data) |

**Preconditions** (all three must succeed before running Lighthouse):

```bash
pnpm --filter @intelliflow/web build       # exit 0 required
pnpm --filter @intelliflow/web start -p 3400   # NOTE: port 3400, NOT 3000

# In another terminal, verify the server is actually serving 200:
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3400/<route>
# Expect 200 for public pages, 401/302/404 for auth-gated (use Path C for those)
```

**Invocation**:

```bash
lighthouse http://localhost:3400/<route> \
  --preset=desktop \
  --only-categories=performance \
  --output=json \
  --output-path=artifacts/lighthouse/<TASK_ID>/<route-slug>.json \
  --ignore-status-code \
  --quiet
```

**Flag rationale**:

- `--preset=desktop` matches `lighthouserc.js` (`throttling.rttMs=40`,
  `throughputKbps=10240`, `cpuSlowdownMultiplier=1`).
- `--only-categories=performance` matches the PG-195 recipe. If your KPI
  includes accessibility / best-practices / SEO, drop this flag and expect
  longer runtime.
- `--ignore-status-code` is **REQUIRED** for `/404`, `/500`, `/maintenance`.
  Lighthouse 12.6.1 refuses non-2xx responses by default with
  `ERRORED_DOCUMENT_REQUEST`. Without this flag, those routes always fail.
- `--quiet` trims the output; the JSON is the artifact, not stdout.
- `--output-path` under `artifacts/lighthouse/<TASK_ID>/` because that's where
  `check-lighthouse-evidence.mjs` looks, and because it becomes part of the
  attestation `artifact_hashes` block.

**Number of runs**: `lighthouserc.js` uses `numberOfRuns: 3`. For a local run
outside CI, one run is usually enough to confirm the score. If the score is
borderline (0.88-0.92), take three runs and report the median.

---

## Path B — Public dynamic routes (NO_FCP mitigation)

Dynamic server-rendered routes sometimes fail Path A with `NO_FCP` on Windows
headless Chrome. **Documented failures**: `/aup`, `/dpa`, `/pricing`, `/login`,
`/` (unauthenticated home). See `artifacts/lighthouse/pg-195-local-run-note.md`
§"Why the local Lighthouse is blocked" for the root cause (Next.js 16 hydration
timing + Windows chrome-launcher).

**Retry flags** (append to Path A invocation):

```bash
  --max-wait-for-fcp=60000 \
  --max-wait-for-load=90000 \
  --chrome-flags="--headless=new --no-sandbox --disable-gpu \
    --disable-background-timer-throttling \
    --disable-renderer-backgrounding \
    --disable-dev-shm-usage \
    --window-size=1920,1080"
```

If three runs with these flags all still NO_FCP, record the attempt
(`artifacts/lighthouse/<TASK_ID>/path-b-attempts.md`) and move to Path C with
the route pinned via an lhci-auth override, OR Path D if the route is genuinely
un-lightouse-able on this host.

---

## Path C — Authenticated routes (lighthouse:auth harness)

**Status**: harness exists (PG-166, ADR-027). Most PG-\* tasks that create
`/settings/**` or other auth-gated pages should use this, not write a waiver.

**Files**:

- `lighthouserc.authenticated.js` — root lhci config with Puppeteer hook
- `tools/lighthouse/lhci-auth.js` — Supabase cookie/localStorage injector
- `apps/web/package.json` script: `lighthouse:auth`
- `tools/lighthouse/extract-lhci-report.ts` — extracts scores into a summary

**Invocation** (default URL is `/` — see override below for other routes):

```bash
# Preconditions:
pnpm --filter @intelliflow/web build
# Supabase env vars must be set:
export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
export NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
# A test admin user must exist:
#   email: admin@intelliflow.dev
#   password: TestPassword123!
# (see tools/lighthouse/lhci-auth.js lines 37-39)

# Run:
pnpm --filter @intelliflow/web run lighthouse:auth
# → artifacts/benchmarks/home-page-lighthouse/*.json
# → extract-lhci-report runs automatically and prints the scores
```

**Override for non-home auth routes**:

```bash
# Copy lighthouserc.authenticated.js to a per-task variant:
cp lighthouserc.authenticated.js lighthouserc.<TASK_ID>.js

# Edit the `url` array in the copy to point at your route:
# e.g. ['http://localhost:3000/settings/help-center/articles']

# Run:
npx lhci autorun --config=lighthouserc.<TASK_ID>.js
# Move the report into artifacts/lighthouse/<TASK_ID>/:
mv artifacts/benchmarks/home-page-lighthouse/*.json \
   artifacts/lighthouse/<TASK_ID>/
# Delete the per-task config after running:
rm lighthouserc.<TASK_ID>.js
```

The auth harness asserts stricter thresholds than the base config:

- `categories:performance >= 0.9` (error)
- `categories:accessibility >= 0.9` (error)
- `interactive < 1000ms` (PG-166 DoD)
- `first-contentful-paint < 1000ms`
- `largest-contentful-paint < 2500ms`
- `cumulative-layout-shift < 0.1`

If the route targets these thresholds, the auth config is the right tool. If the
route has different targets, copy + edit the `assert.assertions` block along
with the `url`.

---

## Path D — Waiver (last resort)

Only valid when A, B, and C have been **genuinely attempted** and all three
produced actionable errors, not just "I didn't feel like running it." Document
each attempt in `artifacts/lighthouse/<TASK_ID>/waiver-evidence.md` with:

- Exact command you ran (one per path)
- Exact error output (Lighthouse runtime error code, stderr)
- Host info (OS, Chrome version, Node version, Lighthouse version)
- Why the error is environmental, not route-specific

**Then and only then**, add to the attestation:

```json
{
  "kpi_results": [
    {
      "kpi": "Lighthouse >= 0.9 on /settings/foo",
      "target": "performance >= 0.9",
      "actual": "NO_FCP after 3 Path A + 3 Path B + 3 Path C attempts; see artifacts/lighthouse/<TASK_ID>/waiver-evidence.md",
      "met": false
    }
  ],
  "lighthouse_waiver_approved_by": "<your-email-or-github-handle>"
}
```

**Rules for `lighthouse_waiver_approved_by`** (enforced by
`check-lighthouse-waiver.mjs`):

- Must be a real human identifier: an email `x@y.z` or a GitHub handle `@name`
  with at least 3 chars.
- Rejected values: `CI`, `cicd`, `bot`, `agent`, `Claude`, `automation`, `self`,
  `n/a`, `none`, `pending`, `tbd`.
- Second waiver in the same sprint requires the same rule (Guard 4 caps
  unapproved waivers at one per sprint).

---

## What counts as evidence

`check-lighthouse-evidence.mjs` verifies the attestation against the actual file
tree. An attestation passes only when:

| Check       | What the script looks for                                     |
| ----------- | ------------------------------------------------------------- |
| File exists | `artifacts/lighthouse/<TASK_ID>/*.report.json` or `*.json`    |
| File parses | Valid JSON with `categories` and `fetchTime` fields           |
| Scores real | Each claimed category score is a number 0–1                   |
| Fresh       | `fetchTime` within 72 hours of `attestation_timestamp`        |
| Hash match  | Report file appears in `artifact_hashes` with matching sha256 |
| Consistency | If report says `performance < 0.9`, KPI cannot be `met: true` |

**What does NOT count as evidence**:

- "Route enrolled in `lighthouserc.js`" — that's a URL list, not a score.
- "CI will catch it" — CI is not an artifact. Show the CI report.
- "Full run deferred to CI promotion" — the file is what's asked for.
- A report from a different task or a different run copied into the task
  directory (hash-check catches this).
- A report whose `runtimeError.code` is non-null (that's a failed run, not a
  passing one).

---

## Forbidden phrases in attestation notes

The following phrases are flagged by `check-attestation-phrases.mjs` and, when
they appear twice in one attestation, BLOCK completion:

- `deferred to CI`
- `deferred to follow-up`
- `deferred to (next|future|later) sprint`
- `NOT_RUN`
- `not measured`
- `full run deferred`

If you catch yourself typing one of these, the correct action is: go back to the
decision tree. Ninety percent of the time the route is one of the paths A/B/C
and you haven't tried it yet.

---

## Quick FAQ

**Q: Why port 3400 and not 3000?** A: The dev server runs on 3000 in `pnpm dev`.
When you `pnpm start` a production build, you must specify a port so you don't
collide with dev. PG-195 picked 3400 and everyone else has followed; stick with
it for consistency with prior artifacts.

**Q: My route scores 0.85 — does it pass?** A: No. Threshold is `>= 0.9` across
the categories the task's KPI names. Optimize (fonts, JS bundle, image sizing)
until the score meets the bar. If optimization is genuinely out of scope for the
task, file `FOLLOWUP-<TASK>-PERF` in `Sprint_plan.csv` and leave the current KPI
`met: false` with `lighthouse_waiver_approved_by: <human>`.

**Q: The auth harness fails with "Auth failed: {error: ...}"** A: The test user
`admin@intelliflow.dev / TestPassword123!` is hardcoded in
`tools/lighthouse/lhci-auth.js`. Ensure that user exists in your local Supabase
instance. If it doesn't, create it, or change the credentials in the script (and
commit the change only if your whole team agrees).

**Q: Lighthouse prints `NO_FCP` every time on my route — is the recipe broken?**
A: Run the `/404` control first:
`lighthouse http://localhost:3400/404 --preset=desktop --only-categories=performance --ignore-status-code --output=json --output-path=/tmp/ctrl.json`.
If `/404` scores fine, the recipe works; your route has a different issue (Path
B flags, or it needs auth → Path C). If `/404` ALSO NO_FCP's, your host has a
deeper problem (Chrome launcher, Node version, disk perms). Report the host
problem — don't waiver individual routes around it.

---

## See also

- **Enforcement**: `tools/scripts/exec-preflight/check-lighthouse-evidence.mjs`,
  `check-lighthouse-waiver.mjs`, `check-attestation-phrases.mjs`
- **Original recipe source**: `artifacts/lighthouse/pg-195-local-run-note.md`
- **PG-054 control run**: `artifacts/lighthouse/PG-054/local-run-note.md`
- **PG-166 auth harness spec**:
  `docs/architecture/adr/ADR-027-authenticated-home-composition.md`
- **Material Symbols gate** (PG-195):
  `docs/architecture/adr/ADR-046-material-symbols-font-subsetting.md`
- **Memory entry**: `feedback_lighthouse_playbook.md`
