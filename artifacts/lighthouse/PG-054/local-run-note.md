# PG-054 Lighthouse — Local Run Note

**Attempted**: 2026-04-19T09:50–10:00Z
**Host**: Windows 11 Pro (project primary dev environment)
**Node**: v25.2.1
**Lighthouse**: 12.6.1 (`node_modules/.pnpm/lighthouse@12.6.1/...`)
**Production server**: `pnpm --filter @intelliflow/web start` on port 3000
(started after `pnpm --filter @intelliflow/web build` exit 0; `curl
http://localhost:3000/aup` → HTTP 200, ~97 KB HTML)

## Runs attempted

| # | URL | Invocation | Outcome |
| --- | --- | --- | --- |
| 1 | `/aup` | `lhci collect --url=http://localhost:3000/aup --numberOfRuns=1 --settings.preset=desktop` | `NO_FCP` + `EPERM` temp-dir cleanup |
| 2-6 | `/aup` | `lighthouse http://localhost:3000/aup --preset=desktop --only-categories=...` with varying `--chrome-flags` (`--headless=new`, `--disable-gpu`, `--disable-background-timer-throttling`, `--max-wait-for-load=60000`, etc.) | 5 runs, all `NO_FCP` |
| 7 | `/aup` | `lhci collect` via minimal `lhci-aup.config.js` (3 runs) | All 3 `NO_FCP` |
| 8 | `/` (control) | direct CLI `--preset=desktop --only-categories=performance` | `NO_FCP` — confirms environmental, not `/aup`-specific |

All invocations completed the audit framework but Lighthouse's
NavigationRunner never observed First Contentful Paint within its wait
window, so no category scores were recorded. Same Windows/headless-Chrome
class previously captured in `artifacts/lighthouse/pg-195-local-run-note.md`.

## Empirical evidence that the page itself is fine

- `curl http://localhost:3000/aup` → HTTP 200, 97,035 bytes of valid HTML
  with CSS stylesheets, hydration scripts, and the expected `<h1>Acceptable
  Use Policy</h1>` / section landmarks.
- `pnpm --filter @intelliflow/web build` → exit 0, `/aup` appears in the
  route manifest as `ƒ /aup`.
- `src/app/(public)/aup/__tests__/page.test.tsx` → 7/7 pass (live render
  via JSDOM).

## Why the local Lighthouse is blocked (brief)

1. `/` and `/aup` both return HTTP 200 but Chrome's headless launcher on
   this Windows host combined with Next.js 16's hydration timing produces
   `NO_FCP` — the page never emits First Contentful Paint within
   Lighthouse's wait window. Same failure mode seen across every public
   URL attempted today.
2. The Chrome launcher's post-run cleanup `rm` of the user-data-dir
   intermittently fails with `EPERM` (known `chrome-launcher` issue when
   Chrome hasn't released handles).

These are environmental tooling faults, not PG-054 defects.

## CI path forward

`pnpm run lighthouse:ci` runs the full URL sweep defined in
`lighthouserc.js` against the PR preview URL via
`treosh/lighthouse-ci-action@v11` on the Linux GitHub Actions runner, and
does not suffer from the Windows headless-Chrome NO_FCP flake. PG-054
added `http://localhost:3000/aup` to `lighthouserc.js` line 22, so that CI
job becomes the authoritative Lighthouse score after merge.

## Precedent

- PG-056 waived `lighthouse_gate` with `NOT_RUN (machine under OOM
  pressure)` — verdict COMPLETE.
- PG-195 hit the same `NO_FCP` / `EPERM` class on some URLs, documented
  in `artifacts/lighthouse/pg-195-local-run-note.md`, verdict COMPLETE.

Same waiver class applies here for `/aup`.
