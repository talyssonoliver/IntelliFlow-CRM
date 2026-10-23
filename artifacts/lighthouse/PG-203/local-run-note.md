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
