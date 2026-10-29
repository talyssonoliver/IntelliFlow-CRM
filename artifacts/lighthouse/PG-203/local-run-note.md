# PG-203 Lighthouse — local runs

## Current evidence: run 9 on 2026-10-29, driver v3

Only these six reports are evidence. Each report's final screenshot was checked and shows the rendered page,
not a loading or blank state. Lighthouse 12, desktop preset, production web build (`next start -p 3400`).
Signed-in pages are measured with LHCI (`tools/lighthouse/lhci-auth.js`); their file is the median of 3 runs.
`/book` is the median of 3 runs.

| Page | Report | Perf | A11y | CLS | Final screenshot shows |
|---|---|---|---|---|---|
| `/calendar/event-types` (signed in) | `calendar-event-types.report.json` | 95 | 93 | 0.003 | the event type list and the booking link card |
| `/settings/privacy-requests` (signed in) | `settings-privacy-requests.report.json` | 92 | 96 | 0.083 | an open request and the restrictions empty state |
| `/book/e2e-firm/intro` | `book.report.json` | 93 | 96 | 0.003 | the event, the date strip and the time grid |
| `/dsar/e2e-firm` | `dsar-request.report.json` | 93 | 96 | 0.003 | the full request form |
| `/dsar/e2e-firm/verify` (fresh link) | `dsar-verify.report.json` | 93 | 100 | 0 | "Your request is confirmed" |
| `/dsar/e2e-firm/export` (live link) | `dsar-export.report.json` | 93 | 96 | 0 | "Your personal data" with "Get my data" |

The three runs per page:
- event types: performance 94, 95, 95;
- privacy requests: 91, 92, 93;
- `/book`: 93, 94, 93.

Best practices (78) and SEO (66) are local-environment and noindex effects, as before.

The link tokens in the verify and export reports are replaced with `REDACTED`. No report holds a JWT, a bearer
token or the admin's address.

sha256:
- `calendar-event-types` 819cfddd909eda15b105eb7dd971148911ab84397b945a27ab66f55e4de60ebc
- `settings-privacy-requests` ec53353cd68664a3a17120a25b43fd5738c63b883e67e8549e77854775bdd785
- `book` 768c0c486dd09b14671afdaaacd68b6d548e3a9fe5e3d39b62afa62040f13e40
- `dsar-request` b6a9a0330fe0848c691ea0d0587ca85ae2690f98490ddf225f62d372c121ee9c
- `dsar-verify` edc8fb4a78a2e22ff8f09a850ab33c20ef7c59d57d8bc25ffc0c6f2f0a682c28
- `dsar-export` c1df75832187aa9689d60164be575d5979c9479bc6c02c073b343d9813d42c45

**Stack.** A fresh, migrated and seeded test database (`scripts/test-db.mjs run --seed`), under the exclusive
`intelliflow-db` slot. Local Supabase for auth only, started in a scratch workdir with migrations and seed off. The
API runs in-process with the mock email adapter, so nothing is sent. The run reads no `.env.local`.

The driver copies `lighthouse-driver-v3/` from the execution evidence folder:
`.specify/sprints/sprint-18/execution/PG-203/exec-PG-203-20261020/tdd/d12-closeout/`.

The end-to-end steps also passed in this run: submit, verification email, verify, export email and download.

**The `/book` defect found and fixed.** This is the first time `/book` was measured with real content. It scored
performance 81 and 82, with CLS 0.25.

A layout-shift capture in the browser found the cause: the details form, the Book button and the footer rendered
under "Loading available times" and were pushed down about 550px when the times arrived.

They now wait until the first times have loaded. The condition is `isPending`, not `isLoading`, because the times
query waits for the event. The first attempt, keyed on `isLoading`, still shifted (CLS 0.22). Tests:
`BookingContent.test.tsx`, red then green twice.

### Which driver produced which reports

| Driver | Date | Reports | Valid? |
|---|---|---|---|
| v1 | 2026-10-21 | `book.report.json` (PR 1) | Measured the not-available state: the build had an unreachable API. Superseded. |
| v2 (`tmp/pg203-local/e2e-dsar.ts`, `execFileSync`) | 2026-10-25 | `dsar-*` and `settings-privacy-requests` | **No.** See the correction below. Superseded. |
| v3 (async `spawn`, limiter reset, availability set, admin password reset, 3-run medians) | 2026-10-29 run 9 | all six above | Yes; every final screenshot checked. |

Runs 3 to 8 on 2026-10-29 were diagnostic and their reports were overwritten:
- run 3 was driver v2 again;
- run 4 failed on a Git Bash path rewrite of the generated key;
- run 5 had `/book` not available (availability not configured);
- run 6 was the first real `/book`, at 81;
- run 7 was the CLS diagnosis;
- run 8 was the first fix, at 82.

### Correction to the 2026-10-25 section below

Its Lighthouse scores did not measure the pages. Driver v2 hosted the API in its own process and started Lighthouse
and LHCI with the synchronous `execFileSync`, which froze that process. During measurement the API could not
answer, so every page that loads data stayed on its loading state.

The committed 2026-10-25 reports show this in their final screenshots: `settings-privacy-requests` is blank and
`dsar-request` shows "Loading". The table below was therefore wrong, and so was the claim that the admin page was
"measured signed in", although `finalDisplayedUrl` was correct. The end-to-end flow in that section is still
valid, because Playwright runs asynchronously.

---

## History (superseded)

### PG-203 Lighthouse — local run (2026-10-21)

Recipe: `docs/claude-refs/lighthouse-playbook.md` (base recipe), Lighthouse 12.6.1, desktop preset, headless
Chrome, production build served by `next start -p 3400`.

The build was made for measurement only. It used local, unreachable endpoints for the variables the client needs
at build time:

- `NEXT_PUBLIC_API_URL=http://127.0.0.1:4999`
- `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54399`

No API was started. A local API would load `.env.local`, which holds production credentials.

## `/book/smith-law/intro` — `book.report.json`

| Category | Score |
|---|---|
| Performance | 93 |
| Accessibility | 100 |
| Best practices | 74 |
| SEO | 66 |

- **What was measured.** The real PG-203 page in its chrome-free "This booking page is not available" state,
  confirmed from the report's final screenshot. The event lookup cannot reach an API, so the page shows that state.
- **First run discarded.** It measured the global error page: the build lacked `NEXT_PUBLIC_API_URL`, and
  `requiredProdEnv` threw. That run is not evidence and was replaced.
- **Best practices 74.** The failing audits are environmental: `errors-in-console` (the unreachable API),
  `third-party-cookies`, `inspector-issues` and `bf-cache`.
- **SEO 66.** `is-crawlable` fails by design: `/book` is noindex and disallowed in robots.txt (spec AC-021).
- **Not measured.** The slot list, form and confirmation states need a reachable API with a seeded tenant.

sha256 `c25df2389e8cd3fed397d48c9fe8060d405a04e058c5c6befeb8d9df026ba952`

## `/calendar/event-types` — not measured (NEEDS_HUMAN)

The route is auth-gated, and an anonymous run lands on `/login` (`finalDisplayedUrl`). That run measured the login
page, not PG-203, so its report is not kept as evidence.

An authenticated measurement needs Path C: `lighthouserc.authenticated.js` plus `tools/lighthouse/lhci-auth.js`
against a local API, local Supabase and a seeded admin. That is the setup PG-198 used, and it is not available in
this lane without production credentials.

## PG-203 PR 2 (data subject requests) — local run (2026-10-25)

Owner ruling 2026-10-24: there is no staging environment, so checks that need a signed-in account run locally.
Stack: a fresh, migrated and seeded test database (`scripts/test-db.mjs run --seed`), local Supabase for auth only (a
scratch workdir with migrations off), the API in-process with the mock email adapter (`EMAIL_PROVIDER=mock`, so
nothing was sent), and a production web build served by `next start -p 3400`. Nothing read `.env.local`. Scripts:
`tmp/pg203-local/` (ignored by git).

### End to end (browser, real API and database)

Submit on `/dsar/e2e-firm` (an access request for a seeded lead) → the verification email is captured from the mock
adapter → the verify link opens → "Your request is confirmed", with the token fragment gone from the address bar →
the export email is captured → "Get my data" → the export is shown, with its withheld section. The database row is
VERIFIED, export issued, 1 download; the firm admins got the new-request alert. The script waits 2.5 s between
steps: submit and verify share a 2-second per-IP throttle, which a person reading their email never meets.

### Lighthouse 12 (desktop preset)

| Page | Report | Perf | A11y | Best practices | SEO |
|---|---|---|---|---|---|
| `/dsar/e2e-firm` | `dsar-request.report.json` | 94 | 100 | 78 | 66 |
| `/dsar/e2e-firm/verify` (fresh link, confirmed state) | `dsar-verify.report.json` | 93 | 100 | 78 | 66 |
| `/dsar/e2e-firm/export` (live link, before download) | `dsar-export.report.json` | 93 | 96 | 78 | 66 |
| `/settings/privacy-requests` (signed-in admin, LHCI x3, median) | `settings-privacy-requests.report.json` | 93 | 94 | — | — |

- The verify and export reports were run on real links: the token in their URL fragment is replaced with
  `REDACTED` in the saved reports. No report holds a JWT, bearer token or the admin's address.
- The admin page was measured signed in: `finalDisplayedUrl` is `/settings/privacy-requests` in all three LHCI
  runs (performance 93, 95, 93; accessibility 94 each), using `tools/lighthouse/lhci-auth.js`.
- SEO 66: the `/dsar/*` pages are `noindex` and disallowed in robots.txt by design. Best practices 78: environmental
  (local console errors, third-party cookie and bf-cache audits), as for `/book`.

sha256: `dsar-request` e35847a7902bb92386bd4a40efd8b732cfa2b112c078d1eebc943b96a1eee68c; `dsar-verify`
ece94ad11d56623f9e444f63c0fd9bbe3a5afc3c1764471107279941c801f39c; `dsar-export`
e6a60be69887ad1919a0770ef1b3cd2a3d1cce3771f02c72a14b96454973abbd; `settings-privacy-requests`
0122b7893a551b2e28b71087796e390821d831d2a3f52cf98c6d2ea449e4b7cc.
