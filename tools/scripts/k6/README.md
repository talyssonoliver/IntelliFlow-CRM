# k6 Load Tests

Load-test scripts for the IntelliFlow CRM API (IFC-007, IFC-033).

## Auth-token handling (#643)

These scripts authenticate against Supabase to exercise authenticated tRPC
endpoints. Two rules govern how the token is handled.

### 1. Tokens are never written to artifacts

k6 summary handlers serialize the full run `data` object (including
`setup_data`, the return value of `setup()`) into JSON under
`artifacts/benchmarks/`. Because `setup()` caches the auth token, a live JWT
would otherwise be committed on every run (#643, found during #637).

All summary handlers pass their data through [`lib/redact.js`](./lib/redact.js)
→ `sanitizeSummaryData(data)`, which:

- drops `setup_data` entirely, and
- deep-redacts any secret-keyed value (`authToken`, `access_token`, `password`,
  `apikey`, `authorization`, `service_role_key`, `anon_key`, …) and any
  JWT-shaped string anywhere in the tree.

The module has no k6 imports and is unit-tested at
[`lib/redact.test.ts`](./lib/redact.test.ts). **Do not** write `data` (or
`setup_data`) to an artifact without running it through `sanitizeSummaryData`.

### 2. Persistent-token acquisition (stable, reproducible runs)

Re-authenticating on every run hits the Supabase auth rate limit and flakes. To
reuse one token across many runs, acquire it once and pass it via the
`K6_AUTH_TOKEN` environment variable. When set, `setup()` reuses it and skips
re-authentication; otherwise it falls back to a live Supabase password grant.

```bash
# Acquire once (prints to stdout only — never writes a committed file):
SUPABASE_URL=... SUPABASE_ANON_KEY=... \
  node tools/scripts/k6/get-auth-token.mjs >> .env.k6.local

# Load it (.env.k6.local is gitignored via .env*.local) and run:
set -a && . ./.env.k6.local && set +a
k6 run --env K6_AUTH_TOKEN="$K6_AUTH_TOKEN" \
        --env SUPABASE_URL="$SUPABASE_URL" \
        --env SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY" \
        --env BASE_URL=http://localhost:3000 \
        tools/scripts/k6/authenticated-load-test.js
```

**Never** commit a real `K6_AUTH_TOKEN`, `.env.k6.local`, or any file containing
a token. `.env.example` documents the variable shape (empty value).
