# Database Backup Runbook - IntelliFlow CRM

**Task**: IFC-142 **Last Updated**: 2026-11-12 **Owner**: Talysson (operator)

The Supabase free plan offers no downloadable backups and no point-in-time
recovery. IntelliFlow's backup is a daily `pg_dump` of production taken on the
operator's PC. This runbook covers what it holds, how it runs, how to check it
and how to restore from it.

---

## 1. What it holds

| Item          | Value                                                                                              |
| ------------- | -------------------------------------------------------------------------------------------------- |
| Source        | production Supabase Postgres 17.6, read-only session (`default_transaction_read_only=on`)          |
| Schemas       | `public`, `auth`, `storage` (schema and data)                                                      |
| Format        | `pg_dump` custom format (`-Fc`), compressed; about 1.5 MB on 2026-11-12                            |
| Rows left out | telemetry and ephemeral tables only (list below); their schema is kept                             |
| Not included  | Storage **files** (only `storage.objects` metadata rows), database roles, Supabase-managed schemas |
| Kept          | 14 daily files                                                                                     |
| Where         | `C:\Users\talys\intelliflow-backups\archives\intelliflow-YYYY-MM-DD.dump`                          |
| Log           | `C:\Users\talys\intelliflow-backups\logs\backup-intelliflow.jsonl`, one line per run               |

Rows left out (owner, 2026-11-12): `public.ai_monitoring_events`,
`public.performance_metrics`, `public.sessions`, `public.email_oauth_states`,
`public.partner_login_grants`, `auth.refresh_tokens`, `auth.sessions`,
`auth.flow_state`, `auth.one_time_tokens`, `auth.mfa_amr_claims`,
`auth.saml_relay_states`, `auth.oauth_client_states`,
`auth.oauth_authorizations`. After a restore everyone signs in again. The AI
insight tables are kept on purpose: rebuilding them would spend AI credit.

## 2. How it runs

- Script: `tools/scripts/backup-intelliflow-db.mjs` (the scheduled task runs a
  copy at `C:\Users\talys\ops\intelliflow\backup-intelliflow-db.mjs`, outside
  any worktree; copy the repo file there after a change).
- Scheduled task `\IntelliFlow\DB-Backup-Daily`, daily 03:30, runs while the
  operator is signed in (Docker Desktop needs the session); a missed run starts
  when the PC is next available.
- Each run starts two one-shot containers of
  `public.ecr.aws/supabase/postgres:17.6.1.106` (`docker run --rm`): `pg_dump`,
  then `pg_restore --list` to check the file. Nothing stays running.
- Supabase's direct host is IPv6-only and Docker Desktop has no IPv6 route, so
  during the run the script relays `127.0.0.1:<random>` to the database; the
  container reaches it as `host.docker.internal`. TLS is end to end.
- Credentials, first found wins: env `INTELLIFLOW_BACKUP_DATABASE_URL`;
  `C:\Users\talys\ops\intelliflow\backup.env` (same key); the main checkout's
  `.env.local` (`DIRECT_URL`, else `DATABASE_URL`). The URL is passed to the
  container as libpq variables by name and is never printed or logged.

A run is SUCCESS only when the file opens and its table of contents holds data
for `public.tenants`, `public.users`, `public.leads` and `auth.users`, and none
for the left-out tables. Anything else is a FAILURE line with the reason (Docker
not running, no credentials, pg_dump error, check failed) and no file.

## 3. Checks

```powershell
# last run
Get-Content C:\Users\talys\intelliflow-backups\logs\backup-intelliflow.jsonl -Tail 1
# files kept
Get-ChildItem C:\Users\talys\intelliflow-backups\archives
# task state
Get-ScheduledTaskInfo -TaskPath '\IntelliFlow\' -TaskName 'DB-Backup-Daily'
# run now
node C:\Users\talys\ops\intelliflow\backup-intelliflow-db.mjs
```

## 4. Restore

Restore into a scratch database first, never straight over production. The
IFC-142 drill (`docs/operations/restore-drill-report.md`) is the tested
procedure: a local Postgres 17 container with the Supabase roles created
(`anon`, `authenticated`, `service_role`, ...) and the `vector`, `pgcrypto` and
`uuid-ossp` extensions in schema `extensions`, then
`pg_restore --no-owner -d <scratch> intelliflow-YYYY-MM-DD.dump`, then counts
and RLS checks.

Restoring into production is the owner's decision (ADR-069: destructive
production change). Agree the target, the file and the downtime with him first.

## 5. Escalation

| Situation                        | Action                                                             |
| -------------------------------- | ------------------------------------------------------------------ |
| FAILURE lines two nights running | tell the owner; the reason is in the log line                      |
| Docker not running at 03:30      | the run fails; the next sign-in catches it up (StartWhenAvailable) |
| Disk filling                     | 14 files of about 1.5 MB each; check the archive folder            |
