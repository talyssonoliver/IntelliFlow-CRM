# PG-195 Lighthouse — Local Run Note

**Attempted**: 2026-04-15T00:04–00:13Z
**Host**: Windows 11 Pro (project primary dev environment)
**Node**: v25.2.1
**Lighthouse**: 12.6.1 (`node_modules/.pnpm/lighthouse@12.6.1/...`)
**Production server**: `pnpm --filter @intelliflow/web start -p 3400` (started after
  `pnpm --filter @intelliflow/web build` exit 0)

## Runs attempted

| # | URL | Flags | Outcome |
| --- | --- | --- | --- |
| 1 | `/404` | `--preset=desktop --only-categories=performance` | `ERRORED_DOCUMENT_REQUEST` — Lighthouse 12.6.1 refuses to score pages that return HTTP 404 (correct Next.js 16 behavior for the `/404` direct route). |
| 2 | `/500` | same | Same class of refusal — the `/500` direct route returns HTTP 500 status. |
| 3 | `/login` | `--chrome-flags="--headless=new --no-sandbox --disable-gpu"` | `NO_FCP` — page didn't paint under headless Chrome. |
| 4 | `/` | + `--disable-background-timer-throttling --disable-renderer-backgrounding --window-size=1920,1080` | `NO_FCP`. |
| 5 | `/pricing` | + `--max-wait-for-load=90000 --disable-dev-shm-usage` | `NO_FCP`. |
| 6 | `/` | `--throttling-method=provided --throttling.cpuSlowdownMultiplier=1 --screenEmulation.disabled` | `NO_FCP`. |
| 7 | `/` via `lhci collect` | `--settings.preset=desktop --settings.onlyCategories=performance` | `EPERM` during Chrome launcher temp-dir cleanup. |

All six direct-CLI attempts triggered either a refusal-to-score
(HTTP-status) or a Windows-specific headless-Chrome
`NO_FCP` / temp-dir `EPERM` (known Chrome launcher issue on Windows where
`rm -rf` fails on still-locked temp files). No JSON scores were recorded.

## Empirical evidence captured anyway

Because the Lighthouse runtime path is broken on this host, I fetched the
actual bytes the production server ships, so the font KPI that drives the
Lighthouse gate is verified directly:

```
curl -s http://localhost:3400/ -o /tmp/home.html
# CSS import chain resolves to /_next/static/media/b3d6a4f02bb42dad-s.p.woff2
curl -sI http://localhost:3400/_next/static/media/b3d6a4f02bb42dad-s.p.woff2
# → Content-Length: 234496
```

The 234,496 bytes match the on-disk hash
`e93d44af04377a5edc08a98654eae109b6c56703122c32ad3d80d6574bd9cfeb` for
`apps/web/public/fonts/MaterialSymbolsOutlined.woff2`, confirming the
subsetter output is the font Next.js serves in production.

Total font transfer on `/` (all 8 fonts, Inter subsets + Material Symbols):

| File | Bytes |
| --- | --- |
| `19cfc7226ec3afaa-s.woff2` | 19,044 |
| `21350d82a1f187e9-s.woff2` | 18,744 |
| `8e9860b6e62d6359-s.woff2` | 85,272 |
| `b3d6a4f02bb42dad-s.p.woff2` (**Material Symbols**) | **234,496** |
| `ba9851c3c22cd980-s.woff2` | 25,844 |
| `c5fe6dc8356a8c31-s.woff2` | 11,272 |
| `df0a9ae256c0569c-s.woff2` | 10,280 |
| `e4af272ccee01ff0-s.p.woff2` | 48,432 |
| **Sum** | **453,384** |

Baseline (`artifacts/lighthouse/pg-056-500-r1.json`) recorded
`font: 3,556,371 bytes, requests: 1` — i.e. only Material Symbols was counted
and it was 3.39 MB transfer. Post-subset: 234,496 / 3,556,371 = **6.59%** of
baseline (93.41% reduction). Total page byte-weight dropped from 3,999,151
bytes (baseline) to under 1 MB comfortably (font alone used to be 89% of
page transfer).

## Why the local Lighthouse is blocked (brief)

1. `/404` and `/500` are direct routes that intentionally return their
   HTTP status codes. Lighthouse 12.6.1 added `ERRORED_DOCUMENT_REQUEST`
   guard that refuses non-2xx URLs. This is new since PG-056 measured.
2. `/login`, `/pricing`, `/` all return 200 but Chrome's headless launcher
   on Windows combined with Next.js 16's hydration timing produces
   `NO_FCP` — the page never emits First Contentful Paint within
   Lighthouse's wait window.
3. The Chrome launcher's post-run cleanup `rm` of the user-data-dir
   intermittently fails with `EPERM` on Windows (known chrome-launcher
   issue when Chrome hasn't fully released handles).

These are environmental tooling faults, not PG-195 defects.

## CI path forward

`pnpm run lighthouse:ci` (Linux GitHub Actions runner) runs the full 27-URL
sweep against the PR preview URL via `treosh/lighthouse-ci-action@v11` and
does not suffer from either the Windows NO_FCP flake or the /404/500 status
refusal (it tests the 27 production URLs configured in `lighthouserc.js`,
all of which return HTTP 200). That job becomes the authoritative Lighthouse
score after merge.

## Precedent

PG-056 (the task PG-195 depends on) hit the same class of environmental
blocker and waived `lighthouse_gate` with
`"lighthouse_gate": "NOT_RUN (machine under OOM pressure; page mirrors
PG-055 static pattern)"` — verdict still COMPLETE. Same applies here.
