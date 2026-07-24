# Pre-ship Full (`preship:full`) — cross-browser E2E gate

`pnpm preship:full` runs the **standard pre-ship gate** _plus_ the **full
Playwright browser matrix** (Chromium + Firefox + WebKit). It is the opt-in,
heavyweight sibling of the default `pnpm pre-ship` gate.

It exists to close **harness Gap #4**: the per-push gate runs only a single
browser (the fast `smoke` / `chromium` projects) to stay under the ~45-minute PR
budget, so a regression that reproduces **only** on Gecko (Firefox) or WebKit
(Safari) is invisible until the nightly cross-browser CI job. `preship:full`
gives you that cross-browser signal on demand, and runs automatically every
night against `main` (see [Nightly](#nightly-ci)).

## What it runs

| Phase               | Steps                                                                   |
| ------------------- | ----------------------------------------------------------------------- |
| **Standard gate**   | The entire required-check graph — the same steps as `pnpm pre-ship`.    |
| **Full-matrix E2E** | `playwright test --project=chromium --project=firefox --project=webkit` |

The log delineates the two phases explicitly:

```
  ── standard gate PASS ────────────────────────────────────
  ── full-matrix E2E (chromium+firefox+webkit) ──────
  e2e-full-matrix              ✓ PASS  (18m…)

pre-ship: standard gate PASS.
pre-ship: full-matrix E2E PASS.
pre-ship: PASS in …
```

If the standard gate is **not** green, the full-matrix E2E is **skipped**
(`NOT RUN`) — no point spending two hours on the browser matrix when a required
gate is already red.

The extra step is only added under `--full`; a plain `pnpm pre-ship` shows it as
`SKIPPED_NOT_FULL` and is otherwise unchanged.

## Invocation

```bash
pnpm preship:full                 # standard gate + cross-browser matrix
node scripts/pre-ship.mjs --full  # identical
PRESHIP_MODE=full pnpm pre-ship   # env-var equivalent (e.g. for CI)
```

Discover the plan / help without running anything:

```bash
node scripts/pre-ship.mjs --list --full   # step plan; e2e-full-matrix tagged [--full only]
node scripts/pre-ship.mjs --help          # modes + flags
```

All the standard flags compose with `--full`: `--clean` (ignore the cached-PASS
state), `--only=<ids>`, and the `PRESHIP_KEEP_GOING=1` env var.

## When to run it

- **Before a large or risky PR** — anything touching shared UI, layout, routing,
  CSS, forms, or browser-API usage where a cross-engine difference is plausible.
- **Before a release / production promotion** — a last cross-browser gate on the
  code you are about to ship.
- **Not on every push.** The default `pnpm pre-ship` (single browser) stays the
  per-push gate so the PR loop stays fast. `preship:full` is opt-in.

## Expected duration

**~2 hours.** The standard gate alone is ~20–40 min (install, library build,
lint, typecheck, unit + integration tests, merged coverage, prod build); the
three-browser E2E matrix adds roughly another 60–90 min on top. Budget
accordingly and prefer running it in the background (or let the nightly do it).

## Prerequisites (local runs)

The standard gate's prerequisites (documented in `scripts/pre-ship.mjs` and
`CLAUDE.md`) **plus** the Playwright browser binaries:

1. **Local test DB up** —
   `docker compose -f docker-compose.yml up -d postgres redis`, with
   `DATABASE_URL` pointed at the **local test DB, never prod** (use
   `DATABASE_TEST_URL`). Required for the integration + coverage steps.
2. **Playwright browsers installed** — the matrix needs all three engines:
   ```bash
   pnpm exec playwright install --with-deps chromium firefox webkit
   ```
   (`--with-deps` pulls the OS libraries Firefox/WebKit need on Linux.)
3. **Node 22** (the repo's pinned runtime — Node 25 silently breaks pg/Prisma
   writes; see the repo's Node-version guidance).

If a browser is missing, Playwright fails **loudly** ("Executable doesn't
exist…") — the matrix never silently passes on a partial browser set. Likewise,
Playwright exits non-zero on "No tests found", so a discovery regression fails
the step rather than passing on zero signal.

## Nightly CI

`.github/workflows/preship-full-nightly.yml` runs `pnpm preship:full` against
`main` every night at **03:00 UTC** (also `workflow_dispatch` for on-demand
runs). It **fails loudly** on any red required step or any E2E-matrix failure,
uploads the `preship-full-state` (pre-ship logs/state) and
`preship-full-e2e-report` (Playwright HTML report) artifacts, and posts a Slack
alert on failure when `SLACK_WEBHOOK` is configured.

### No bypass in CI

The nightly uses **no** pre-ship bypass (`PRESHIP_ALLOW_MISSING` /
`PRESHIP_KEEP_GOING` / `--no-verify` are all absent). Two design choices keep
the full gate honest on a CI runner without one:

- **DB-backed steps actually run.** The workflow starts Postgres + Redis via
  `docker compose` (container names `intelliflow-postgres` /
  `intelliflow-redis`) so the gate's docker-name probe finds the stack and the
  integration + coverage steps run for real instead of degrading to MISSING.
- **Laptop-only gates degrade honestly.** `codex-review` needs a local OAuth
  session that cannot exist on a CI runner — and its own contract already states
  _"There is NO CI enforcement — pre-push only."_ `pre-ship.mjs` therefore flips
  it (and only it) to non-required when `process.env.CI` is set, so it is an
  honest SKIP rather than a gate-failing MISSING. Every runnable gate **and**
  the cross-browser E2E matrix remain required and block.

## Relationship to `e2e-full.yml`

`e2e-full.yml` is the existing nightly E2E suite; it currently runs the **full
spec set on Chromium only**. `preship-full-nightly.yml` is complementary: it
runs the **unauthenticated spec set across all three engines**, so a
Firefox/WebKit-only regression is caught here first. As the authenticated suite
is hardened for cross-engine runs, the two can converge.
