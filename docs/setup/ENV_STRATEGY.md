# Environment Variables Strategy

## Single Source of Truth

All environment variables are managed from a **single root `.env` file**.

```
intelliFlow-CRM/
├── .env                 # ← SINGLE SOURCE OF TRUTH (gitignored)
├── .env.example         # Template for new developers
├── .env.local           # Legacy/backup (can be removed)
└── apps/web/.env.local  # Next.js client-side vars only (NEXT_PUBLIC_*)
```

## How It Works

1. **Root `.env`** contains all secrets (DATABASE_URL, API keys, etc.)
2. **`dotenv-cli`** loads root `.env` before running any command
3. **`turbo.json`** passes env vars to all workspaces via `globalEnv`
4. **No duplicate .env files** in packages or apps (except for Next.js NEXT_PUBLIC_*)

## Setup for New Developers

```bash
# 1. Copy the template
cp .env.example .env

# 2. Edit with your credentials
# (Get DATABASE_URL from Supabase dashboard)
code .env

# 3. Run dev
pnpm dev
```

## What NOT to Do

❌ Don't create `.env` files in `packages/db/`, `apps/api/`, etc.
❌ Don't duplicate credentials across multiple files  
❌ Don't commit `.env` files (they're gitignored)

## What TO Do

✅ Edit only the root `.env` file  
✅ Use `pnpm dev` (automatically loads .env via dotenv-cli)  
✅ Keep `apps/web/.env.local` for NEXT_PUBLIC_* vars only

## Special Cases

### Next.js (apps/web)
Next.js auto-loads `.env.local` for client-side variables.
Only put `NEXT_PUBLIC_*` variables in `apps/web/.env.local`.
Server-side vars come from root `.env` via dotenv-cli.

### Prisma (packages/db)
Prisma reads DATABASE_URL from the environment.
The root `.env` is loaded by dotenv-cli before any db: command.

### Tests
Test commands use `dotenv -e .env` to load environment.
For test-specific overrides, use `.env.test`.

## Troubleshooting

### "Authentication failed against database server"
1. Check root `.env` has correct DATABASE_URL
2. Ensure you're using `pnpm dev` (not running turbo directly)
3. Restart the dev server after changing `.env`

### Environment not loading
1. Verify `.env` exists at project root
2. Check `pnpm dev` output for dotenv messages
3. Run `pnpm disk:check` to ensure disk space is available
