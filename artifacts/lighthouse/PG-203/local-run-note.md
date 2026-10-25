# PG-203 Lighthouse — local run (2026-10-21)

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
