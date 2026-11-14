# Disaster Recovery Restore Drill Report

**Document ID**: IFC-142-DRILL **Status**: Two runs on 2026-11-12. **Run 2
(restore from the real daily backup file) is the method of record from now on.**
Run 1 was a one-off snapshot-consistent fresh dump. Both PASS; gaps are under
"What this drill does NOT prove".

This replaces the earlier "no drill has been run" placeholder. Approved by the
owner on 2026-11-12 (relayed by the coordinator session): a read-only dump of
production restored into a throw-away local container, then dropped.

## Run 2: restore from the daily backup file (method of record)

Restored the file `intelliflow-2026-11-12.dump` (1,549,750 bytes, taken 15:15
UTC by `backup-intelliflow-db.mjs`) into a fresh `pgvector/pgvector:pg17`
container on 127.0.0.1:55442, 15:21 to 15:23 UTC. No new dump of prod was taken.
The file was mounted read-only (`-v ...:/backup:ro`), so no copy exists. Same
roles, extensions and `pg_restore --no-owner` as run 1. Prod was read only for
the comparison (read-only REPEATABLE READ session).

| Item                                                                   | Result                                                                                                                                     |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Provisioning (container, roles, extensions)                            | 2.9 s                                                                                                                                      |
| pg_restore (T2)                                                        | 3.2 s                                                                                                                                      |
| Verification (restored counts, plus counts and checksums against prod) | 5.8 s                                                                                                                                      |
| **RTO from the file**                                                  | **about 12 s** (provision + restore + verification; the dump step is not part of it because the file already exists)                       |
| RPO                                                                    | Daily run at 03:30: at most about 24 h of data loss plus the time since the last successful run. Not point-in-time.                        |
| Tables                                                                 | 251 of 251 present                                                                                                                         |
| Result by table                                                        | 238 checksum-identical to prod now, 13 excluded tables restored with 0 rows as designed, 0 drift, 0 missing, 0 where restored exceeds prod |
| Rows                                                                   | prod 12,904 in 49 non-empty tables; restored 2,961 rows in 42 non-empty tables (the other 9,943 rows are the excluded tables)              |
| pg_restore errors                                                      | 37, the same 2 classes as run 1                                                                                                            |
| RLS                                                                    | PASS, same result as run 1                                                                                                                 |
| Backup file                                                            | Size 1,549,750 bytes and SHA-256 `07f011d1...b1006` identical before and after; file still in place                                        |

Notes.

- The file is only a few minutes older than prod's latest writes, and no table
  had changed, so there is no drift to report in this run; every non-excluded
  table matched on checksum (`ORDER BY x::text COLLATE "C"`,
  `extra_float_digits=1` on both sides). In a run done hours after the backup,
  expect drift in actively written tables (audit_log_entries, notifications,
  lead_activities); report it as a delta, with row count restored <= prod.
- The 13 excluded tables restored with 0 rows. Their prod row counts now:
  `ai_monitoring_events` 8,873, `auth.refresh_tokens` 116, `auth.flow_state`
  920, `auth.sessions` 14, `auth.mfa_amr_claims` 14,
  `public.partner_login_grants` 5, `auth.one_time_tokens` 1, the other 6 are
  empty in prod. This means that after a restore every user must sign in again
  and the monitoring history is lost, by design.
- Core tables: `tenants` 6, `users` 4, `leads` 121, `auth.users` 4 are non-empty
  and equal to prod. `contacts`, `accounts` and `opportunities` are **empty in
  prod itself** (0 and 0), so a "non-empty" check for them cannot pass and is
  not a restore failure.
- pg_restore errors: 36 for missing Supabase-only role `dashboard_user` (15
  GRANT ALL ON TABLE, 11 GRANT INSERT,...,UPDATE ON TABLE, 4 GRANT ALL ON
  FUNCTION, 2 GRANT USAGE ON SCHEMA, 1 GRANT ALL ON SEQUENCE, 3 ALTER DEFAULT
  PRIVILEGES) and 1 `schema "public" already exists`. Both benign. Stderr:
  `restore2-stderr.txt`.
- RLS (policies key on `app.current_tenant_id`): `appointment_settings` 1 row
  and `ai_insights` 13 rows. Superuser and `service_role` see all rows;
  `authenticated` and `anon` with no tenant, JWT claims alone, or an unknown
  tenant see 0; tenant `cmqgpih4` sees 1 of 1 and 12 of 13, as expected.
- Teardown (15:22:40 to 15:23:03Z): container `ifc142-restore2` removed
  (`docker ps -a --filter name=ifc142` empty), its anonymous data volume
  removed, password file deleted, no listener on 55442. Nothing in
  `C:\Users\talys\intelliflow-backups` was modified.
- Still not proven by Run 2: GoTrue login, Storage files, Supabase PITR, restore
  time at a larger size, and the vault and pg_graphql contents.

# Run 1 (fresh snapshot-consistent dump)

## Summary (Run 1)

| Item                                                       | Result                                                                                                                                          |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Date                                                       | 2026-11-12, 15:17 to 15:20 UTC                                                                                                                  |
| Source                                                     | Production Supabase Postgres 17.6, read-only, snapshot-consistent (`pg_export_snapshot`, REPEATABLE READ READ ONLY)                             |
| Target                                                     | Local Docker `pgvector/pgvector:pg17`, bound to 127.0.0.1:55442                                                                                 |
| Scope                                                      | Schemas `public`, `auth`, `storage` (251 tables, 12,904 rows, 49 non-empty tables)                                                              |
| Database size / dump size                                  | 43 MB database / 1.95 MB custom-format dump (1,949,983 bytes)                                                                                   |
| T1 (pg_dump)                                               | 15.7 s                                                                                                                                          |
| T2 (pg_restore)                                            | 6.9 s                                                                                                                                           |
| Provisioning (container start, Supabase roles, extensions) | 12.3 s                                                                                                                                          |
| Verification (counts and checksums on restored DB)         | 0.7 s                                                                                                                                           |
| **RTO (this method, measured)**                            | **about 36 s** (T1 + provisioning + T2 + verification)                                                                                          |
| RPO (this method)                                          | The interval between dumps. **There is no scheduled dump today, so the RPO is unbounded** until one is scheduled.                               |
| Tables compared                                            | 251 of 251, none missing                                                                                                                        |
| Match                                                      | 248 identical on first pass; the other 3 explained, identical once the comparison itself was made deterministic (below). **0 real mismatches.** |
| pg_restore errors                                          | 37, all expected, in 2 classes (below)                                                                                                          |
| RLS                                                        | PASS on 2 tables                                                                                                                                |
| Teardown                                                   | Done 2026-11-12 15:19 to 15:20 UTC (below)                                                                                                      |

Notes on the numbers. The RTO excludes the human time to decide to restore, to
obtain the connection, and to repoint the application. It also excludes the
Docker image pull (1.3 s cached; 19.8 s cold). The database is small (43 MB), so
these timings do not extrapolate linearly to a larger one. The Supabase free
plan offers no downloadable backups, so this drill tests our own `pg_dump` as
the backup.

## Method

1. Opened a read-only REPEATABLE READ session on prod
   (`default_transaction_read_only=on`) and exported a snapshot. Kept it open.
2. Ran `pg_dump --snapshot=<id> -n public -n auth -n storage -Fc` from the same
   image, so the dump and the prod checksums see identical data. Production
   received only reads. The direct host is IPv6-only and Docker here has no
   IPv6, so the dump went through a transparent local TCP forwarder run by the
   drill script (raw bytes, TLS end to end, closed when the script ended).
3. In the same snapshot session, computed per table: row count and
   `md5(string_agg(t::text, ',' ORDER BY t::text))`. No table exceeded 50 MB, so
   none was skipped.
4. Started the container and created what Supabase provides: roles `anon`,
   `authenticated`, `service_role` (BYPASSRLS), `authenticator`,
   `supabase_admin`, `supabase_auth_admin`, `supabase_storage_admin`; schema
   `extensions`; extensions `vector` and `uuid-ossp` (schema `extensions`),
   `pg_trgm` and `btree_gist` (schema `public`, as in prod).
5. `pg_restore --no-owner` (privileges kept), recomputed the same counts and
   checksums, compared table by table.
6. RLS tests with roles on the restored DB.
7. Teardown.

Prod extensions mirrored: vector 0.8.0, uuid-ossp 1.1, pg_trgm 1.6, btree_gist
1.7, plpgsql. Skipped as Supabase-only: `pg_graphql` (schema graphql),
`supabase_vault` (schema vault). `pgcrypto` and `citext` are not installed in
prod, so were not created.

## Versions

Production 17.6; restore target PostgreSQL 17 (pgvector image; pgvector 0.8.0 on
prod); pg_dump and pg_restore 17 from the same image; `pg` 8.21.0 for the
checks. Prod major version was confirmed as 17 over a read-only session before
starting.

## Table-by-table comparison

| Schema  | Tables | Identical (count and checksum) | Explained differences       |
| ------- | ------ | ------------------------------ | --------------------------- |
| public  | 216    | 215                            | 1 (`ai_monitoring_events`)  |
| auth    | 27     | 27                             | 0                           |
| storage | 8      | 6                              | 2 (`buckets`, `migrations`) |
| Total   | 251    | 248                            | 3                           |

Row counts were equal in all 251 tables, including the three below. The full
per-table list is in `prod-sums.json` (table name, count, md5; no row data).

### Mismatch list and explanation

The three first-pass differences were artefacts of how the checksum was
computed, not data differences:

| Table                         | Rows (prod / restored) | Cause                                                                                                                                                                                                                                              | Proof                                                                                                                                                                                      |
| ----------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `storage.buckets`             | 2 / 2                  | `ORDER BY t::text` sorts differently on the two servers' locale builds, so the concatenation order differed                                                                                                                                        | Identical hash with `ORDER BY t::text COLLATE "C"`                                                                                                                                         |
| `storage.migrations`          | 74 / 74                | same                                                                                                                                                                                                                                               | Identical hash with `COLLATE "C"`                                                                                                                                                          |
| `public.ai_monitoring_events` | 8,873 / 8,873          | Locale ordering (as above) plus the text form of `double precision`: the prod role's session default `extra_float_digits=0` prints `5.062e-05`, the local default `1` prints `5.062000000000001e-05` for the same value. 893 rows differed in text | All 8,873 `value` columns have identical bit patterns (`float8send`), 0 bit differences. With `extra_float_digits=1` on both sides and `COLLATE "C"`, hashes are identical (`03190fb5...`) |

The re-checks ran in new read-only prod sessions after the dump snapshot; row
counts were unchanged and the three tables matched. The other 248 tables matched
on the first pass against the original snapshot.

## pg_restore errors (37 total, exit code 1 with "errors ignored")

| Class                                       | Count | Detail                                                                                                                                                                                                                                                               | Impact                                                                                                                                                                                                            |
| ------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase-only role `dashboard_user` missing | 36    | `GRANT ... TO dashboard_user` on auth and storage schemas, tables, functions and one sequence, plus 3 `ALTER DEFAULT PRIVILEGES` (15 GRANT ALL ON TABLE, 11 GRANT INSERT,...,UPDATE ON TABLE, 4 ON FUNCTION, 2 ON SCHEMA, 1 ON SEQUENCE, 3 ALTER DEFAULT PRIVILEGES) | None for the application. The role belongs to the Supabase dashboard. Grants to anon, authenticated and service_role were applied (the RLS test used them). Add the role to the restore recipe to get a clean run |
| `schema "public" already exists`            | 1     | `CREATE SCHEMA public` on a fresh Postgres                                                                                                                                                                                                                           | None, benign                                                                                                                                                                                                      |

No error touched table data, constraints, indexes, policies or functions. Full
stderr: `restore-stderr.txt`.

## RLS results

Method note: the production policies key on the session setting
`app.current_tenant_id` (directly, or through `public.get_current_tenant_id()`,
which reads that setting). They do not use `auth.uid()` or `auth.jwt()`, so
there is no JWT-claims path to test on these tables. RLS is enabled on 215 of
216 public tables in the restored database (193 have a `tenantId` column).

Two tenant-scoped tables with rows were tested, one per policy style. Tenant ids
are truncated to 8 characters.

| Check                                                        | `appointment_settings` (setting style, 1 row) | `ai_insights` (function style, 13 rows, 2 tenants) |
| ------------------------------------------------------------ | --------------------------------------------- | -------------------------------------------------- |
| Superuser / table owner (bypass)                             | 1 (full)                                      | 13 (full)                                          |
| `service_role` (BYPASSRLS)                                   | 1 (full)                                      | 13 (full)                                          |
| `authenticated`, no tenant setting, no claims                | 0                                             | 0                                                  |
| `anon`, no tenant setting                                    | 0                                             | 0                                                  |
| `authenticated`, `request.jwt.claims` set, no tenant setting | 0                                             | 0                                                  |
| `authenticated`, tenant `cmqgpih4`                           | 1 (expected 1)                                | 12 (expected 12)                                   |
| `authenticated`, unknown tenant                              | 0                                             | 0                                                  |

Result: PASS. Isolation is enforced after restore, bypass roles see everything,
and a tenant sees only its own rows. No personal data was read or printed
(counts only).

## What this drill does NOT prove

- **GoTrue login.** The `auth` tables are restored and checksummed, but no
  GoTrue server ran, so sign-in, token issue and refresh were not tested.
- **Storage files.** Only the `storage` metadata tables were restored. The files
  in the object store were not backed up or restored.
- **Supabase PITR or managed backups.** Not used: the free plan offers none.
  This drill tests our own `pg_dump` only. It does not prove point-in-time
  recovery or an RPO better than the dump interval.
- Redis (rebuildable by design), application config, secrets, or an API build
  pointed at the restored DB (no API smoke run).
- Contents of `pg_graphql` and `supabase_vault` (Supabase-only, not dumped).
  Anything stored in the vault would not be recoverable by this method.
- Restore time on a larger database, or restoring into a real Supabase project,
  or the `dashboard_user` grants.

## Follow-ups this drill suggests

1. Schedule the dump (there is none) and store it off the machine; that sets the
   real RPO.
2. Put the roles and extensions step in a script (as in this drill) and add
   `dashboard_user`.
3. Use a deterministic checksum (`COLLATE "C"`, `extra_float_digits=1` on both
   sides) in any future drill.

## Teardown record

- Container `ifc142-restore` removed with `docker rm -f` at
  2026-11-12T15:19:07Z; `docker ps -a --filter name=ifc142` is empty.
- The two anonymous Docker volumes the container runs had created (15:07:17Z and
  15:17:34Z, each a Postgres 17 data directory) were removed at about 15:20Z,
  because `docker rm -f` alone leaves them behind.
- The dump `prod.dump` was deleted by the drill script's `finally` block at
  15:17:55Z and verified absent in a directory listing at 15:19Z; the temporary
  password file was deleted too. A first attempt (15:06 to 15:17) took a dump
  and stalled on a script bug before restoring; that dump was deleted before the
  second run began.
- The local port forwarder closed when the script exited; no listener remains on
  55442 or 55443 (only TIME_WAIT sockets).
- No connection string, password or row data is stored in the work directory.
  Remaining files (`prod-sums.json`, `results.json`, `rls-results.json`,
  `restore-stderr.txt`, scripts) hold table names, counts, hashes and DDL only.
- Production: only reads (read-only sessions), no DDL or DML.
