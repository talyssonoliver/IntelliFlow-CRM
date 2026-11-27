# Supabase egress audit, 26 November 2026

Supabase org "taly" is on the Free plan and the owner will not upgrade. Supabase
warned on 23/11 that monthly egress is over quota and that fair-use restrictions
apply from 24/12/2026 unless it stays under about 5.5 GB. Storage is tiny (DB 55
MB), so this is egress: bytes Postgres, Auth and the pooler send out to the
Railway API and workers.

This audit lists every hot reader found in code, how often it runs, and how many
bytes a run returns, then ranks them by monthly egress. Figures marked
**measured** come from production, read-only. Figures marked **modelled** are
row counts times measured row sizes times a stated frequency. Nothing here was
measured from Supabase's own egress counter (the dashboard has no per-query
breakdown); the new egress log (section 7) is how we measure after deploy.

## 1. How it was measured

- Read-only access to production through the pg client with
  `default_transaction_read_only=on` (`DIRECT_URL`, never printed).
  `pg_stat_statements` is not installed, so there is no per-query history.
- Row sizes: `avg(length(row::text))` per table. Wire size is close to that
  (text protocol).
- Current rate: `pg_stat_user_tables` sampled three times (t0, +56 s, +19 min)
  and diffed. The counters have never been reset, so the lifetime totals in the
  task description are cumulative since the project was created and say nothing
  about today.

### What the counters say today (measured, 19 minutes, 16:20 to 16:39 UTC)

Production is close to idle. Every non-zero delta on `leads`, `email_records`,
`notifications`, `lead_activities`, `audit_log_entries`, `tenants`,
`opportunities` and `lead_ai_insights` is one full scan each, which is the
audit's own size queries. The remaining activity:

| table                     | what moved in 19 min                                     | meaning                                                                               |
| ------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `ai_monitoring_events`    | 4 index scans, 2,840 tuples (= 4 x 710, the 24 h window) | `#1559`'s marker `aggregate`, every 5 minutes, returns about 100 bytes. No row reads. |
| `email_mailboxes`         | 119 seq scans, 237 tuples (2 rows each), 2 updates       | mailbox claim and sync polling, about 6 a minute on a 2-row table                     |
| everything under `auth.*` | 0                                                        | no Auth traffic while nobody is signed in                                             |

So the big reader (the monitoring publisher, 68M tuples fetched by index) is
already fixed and deployed: #1559 merged 23/11 and its signature, one aggregate
every 5 minutes and no row reads, is what production shows now. The lifetime
totals (68.4M index tuples, 171k seq scans) are history.

### Facts that change the reading of the evidence

1. **Seq-scan counts are not egress.** `auth.mfa_amr_claims` (113 rows),
   `auth.identities` (4), `auth.users` (4) are scanned by GoTrue itself inside
   Supabase; a sequential scan of a 4-row table returns nothing to us. Tuples
   read is work done in the database; egress is bytes returned.
2. **`ai_monitoring_events.tenantId` is NULL on every row** (15,839 rows, 0
   distinct tenants). The tenant-scoped readers filter `tenantId = <tenant>`, so
   today they return 0 rows for every tenant. Only drift events are read for all
   tenants (the global ones are included by design). The modelled figures below
   assume the rows are tenant-owned, which is what the code is written for and
   what will happen the day the worker starts stamping a tenant. Until then
   those readers are latent, not active.
3. **Auth is already cached in the API.** `verifyToken` verifies ES256 sessions
   locally against the JWKS, and ADR-071 caches the resolved session for 60 s
   per instance (`security/session-cache.ts`). `auth.getUser` is only called
   when local verification cannot decide (see section 4).
4. **Retention already exists at 30 days.**
   `MonitoringFlushService.cleanupOldEvents` deletes events older than 30 days
   once a day (`apps/ai-worker/src/monitoring/monitoring-flush.service.ts`); the
   oldest row is 27/10, exactly 30 days. The table cannot grow past about 16k
   rows, which is why it is 9.6 MB. This matters for the retention script
   (section 6).

## 2. Row sizes (measured, production)

| event type       | rows  | avg wire bytes | events / day (last 24 h) |
| ---------------- | ----- | -------------- | ------------------------ |
| latency          | 4,376 | 164            | 162                      |
| roi_cost         | 3,026 | 196            | 162                      |
| roi_value        | 4,325 | 180            | 162                      |
| hallucination    | 3,578 | 513            | 171                      |
| drift            | 46    | 1,104          | about 1.5                |
| phase_transition | 488   | 311            | 52                       |

Other tables: `leads` 165 rows x 512 B (84 KB for the whole table),
`email_records` 332 rows x 1,699 B (max 6.6 KB), `email_mailboxes` 2 rows x 752
B, `notifications` 165 x 525 B, `lead_activities` 680 x 462 B.

## 3. Ranked readers, by monthly egress

"Before" is the code on `main` at cfa74d520, "after" is this PR. Dashboard rows
assume one person with the page open 8 hours a day for 30 days (960 half-minute
polls a day), and, for the tenant readers, tenant-owned events (fact 2). The
unit of comparison is the figure a quota cares about.

| #   | reader (file:line on main)                                                                                                                                        | frequency                                                                              | bytes per run                                          | monthly, before                                                                                         | monthly, after                                                                                         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1   | `RedisMonitoringPublisher.tick`, all rows of the 24 h window per tenant (`apps/ai-worker/src/monitoring/redis-monitoring-publisher.ts`, `fetchEventsForTenant`)   | every 60 s, 1,440 a day                                                                | 100 to 280 KB                                          | **4.5 to 12.3 GB** (150 to 409 MB/day, measured by #1559)                                               | **about 1 MB** (marker aggregate every 5 min, about 100 B). Already fixed by #1559, deployed.          |
| 2   | `getROIMetrics`: every cost and value row since the beginning, then summed in JS (`AIMonitoringService.ts:388-389`, polled by `useDriftDashboard`, `hooks.ts:80`) | every 5 min (96 a day)                                                                 | 7,351 rows x about 190 B = **1.4 MB**                  | **3.9 GB** (modelled, latent: 0 rows today)                                                             | 2 rows, about 150 B per run, cached 2 min: **under 1 MB**                                              |
| 3   | `getLatencyMetrics`: up to 10,000 full rows then percentiles in JS (`AIMonitoringService.ts:205-209`, `hooks.ts:249`)                                             | every 30 s (960 a day)                                                                 | 162 rows x 164 B = 27 KB (24 h range)                  | **0.77 GB** (modelled, latent)                                                                          | one summary row (about 350 B) per cache window: **about 25 MB** worst case, 4 MB at the 2-minute cache |
| 4   | `getDriftMetrics {limit: 20}` (`AIMonitoringService.ts:163`, `hooks.ts:72`)                                                                                       | every 30 s                                                                             | 20 rows x 1,104 B = 22 KB                              | **0.63 GB** (modelled from measured sizes; **active today**, drift events are global)                   | cached 2 min, polled every 60 s: **0.16 GB**                                                           |
| 5   | `getLatencyTrend`: every latency row in the window, no `take`, bucketed in JS (`AIMonitoringService.ts:306`, `hooks.ts:264`)                                      | every 60 s (480 a day)                                                                 | 27 KB (24 h)                                           | **0.38 GB** (modelled, latent)                                                                          | at most 288 buckets x about 60 B = 17 KB, every 2 min: **0.06 GB**                                     |
| 6   | `getStatus` DB fallback: 8 queries, one of them every latency value of 24 h (`AIMonitoringService.ts:70-123`)                                                     | every 30 s                                                                             | about 5 KB                                             | 0.14 GB (modelled; served from Redis when the publisher has the tenant's keys, which it does not today) | one aggregate row plus two percentiles, about 400 B, cached: **under 10 MB**                           |
| 7   | `getHallucinationReport` (default limit 50, 513 B rows)                                                                                                           | on page open                                                                           | 26 KB                                                  | not polled; 26 KB per view                                                                              | capped at 100 rows and only the shown columns; cached                                                  |
| 8   | Mailbox sync and bounce scan (`outlook-inbox-sync.ts:371`, `bounce-reader.ts:702`, 6 reads a minute on `email_mailboxes`)                                         | about 6 a minute                                                                       | up to 1.5 KB                                           | about 0.4 GB at the very worst (all rows returned); likely under 0.1 GB                                 | unchanged: correctness-critical claim logic, tiny                                                      |
| 9   | `getHotLeads`, `getReadyForQualification`: no `take` (`lead.router.ts:1241`, `1257` on main)                                                                      | on page view                                                                           | 165 leads x 512 B = 84 KB at most                      | proportional to views                                                                                   | capped at 500 rows                                                                                     |
| 10  | Events-worker maintenance sweeps (`apps/workers/events-worker/src/maintenance/scheduled-jobs.ts`)                                                                 | 60 s SLA, 15 min follow-up, 60 min deals, 5 min appointments                           | each `select`s a few columns and has `take` 30 to 1000 | already bounded: under 0.05 GB                                                                          | unchanged                                                                                              |
| 11  | Auth `getUser` fallback (`apps/api/src/lib/supabase.ts:418`)                                                                                                      | only when the JWKS cannot decide; every request if Supabase signs with a symmetric key | 1.5 to 2 KB                                            | not observed (no Auth traffic in the 19-minute sample); up to N requests x 2 KB if the fallback is hot  | at most one per token per 60 s                                                                         |

Notes on the table:

- Rows 2 to 6 total about 5.7 GB a month for one person who keeps both
  dashboards open all working day, if the events are tenant-owned. That is the
  whole free quota from one browser tab. They are the next incident waiting,
  even though today's data makes most of them return nothing.
- Row 1 is what actually burned the quota. It is gone.
- Everything else read in a sweep or a list is already bounded by a `take` or is
  a single-row lookup. The `leads` and `email_records` seq-scan counts come from
  small tables where the planner prefers a scan; they are not a stream of
  full-table reads to the API. The only unbounded lead lists found are row 9.

## 4. Auth

What the evidence suggested (a `getUser` on every API request) is not what the
code does today:

- `verifyToken` (`apps/api/src/lib/supabase.ts`) decodes and verifies ES256 JWTs
  locally against the JWKS, with no network call. `auth.getUser` runs only when
  local verification cannot decide: a key id the JWKS does not list yet, a
  symmetric (HS256) signature, or the JWKS endpoint failing.
- After verification the resolved session is cached for 60 s per instance
  (ADR-071), and the `auth.sessions` liveness check runs once per cache miss, as
  one indexed primary-key lookup.

So the extra risk is the fallback: on a stack that signs sessions symmetrically,
or during a key rotation, every request would call `auth.getUser` (about 1.5 to
2 KB back, and GoTrue then reads `auth.users`, `auth.sessions`,
`auth.identities` and `auth.mfa_amr_claims`). That is the path that now has a
cache.

**The cache (`apps/api/src/lib/verified-token-cache.ts`).** Not pure local
verification: Supabase still decides every token, at most once per 60 s.

- Stores only a user Supabase confirmed. A refusal or an error is never cached.
- Key is the SHA-256 of the token; the token is never stored or logged.
- An entry never outlives 60 s and never outlives the token's own `exp`.
- At most 500 entries, oldest evicted first.
- Dropped at once, on the instance that handled the change, by: sign-out
  (`signOutUser`, which is global, so all the user's cached tokens go), a
  password reset (`updateUserPassword`), a Supabase role metadata sync, and
  `invalidateUserSessions`, which is already called on membership revocation,
  role change, member removal, a login grant being claimed and a session ended
  from the sessions list.
- A refreshed token (after a password or MFA change) has a different hash, so it
  is verified afresh.
- Other API instances learn within the 60 s ceiling, the same bound ADR-071 sets
  for the session caches.

The web app's `getVerifiedCaller` (`apps/web/src/lib/route-access.ts`) also
calls `getUser`; it guards developer-only routes (`/api/adr`,
`/api/quality-reports`, `/api/compliance`) that nobody polls, so it is left
alone.

## 5. Connections

- One shared Prisma client per process: `packages/db/src/client.ts` builds a
  single client with one `PrismaPg` pool (`max` from `DATABASE_POOL_MAX` or
  `DB_POOL_MAX`, default 10, 1 on serverless). The API, the ai-worker and the
  events-worker all import it. No request or job constructs a client; the other
  `new PrismaClient` hits are seed and backfill scripts that exit.
- The one exception was the events-worker, which built its own client with the
  `pg` default pool of 10 and no override. It now uses `DATABASE_POOL_MAX`
  (default **5**): it runs one outbox poller and a few timers. This changes the
  connection cap only; no query changes.
- **Not changed, for the owner or the deploy:** the Supavisor transaction pooler
  (port 6543) and the per-service `DATABASE_POOL_MAX` are environment settings
  on Railway, not code. The local `.env.local` uses the direct connection
  (`db.<ref>.supabase.co:5432`); what Railway uses cannot be read from here. The
  ~10.8k `supavisor_logs` lines a day are consistent with the old 60 s publisher
  tick plus the sweeps, and should fall now. Recommended Railway settings:
  `DATABASE_POOL_MAX=5` on the API and the ai-worker, `DATABASE_POOL_MAX=3` on
  the events-worker, and `DATABASE_URL` pointing at the transaction pooler with
  `?pgbouncer=true`. Each is reversible by removing the variable.

## 6. Retention of `ai_monitoring_events`

`tools/scripts/ai-monitoring-retention.ts` (dry run by default, not scheduled,
never run against production) rolls rows older than N days (default 90,
minimum 7) into one row per (UTC day, event type, tenant, model) in the new
`ai_monitoring_daily_summaries` table, then deletes the detailed rows of that
day in the same transaction, after checking the summaries account for every
event. Additive migration `20261126110000_ai_monitoring_daily_summaries` (Class
A, RLS on, no client grant). Guards: `--apply` needs
`--owner-approved "<who, when>"`, and a Supabase host also needs
`ALLOW_PRODUCTION_RETENTION` set to the same text. `drift` events are kept
unless `--include-drift` is given (a few dozen rows, and their payloads cannot
be summarised).

**Owner decision (see the end):** the 30-day daily delete in
`MonitoringFlushService` already runs, so nothing ever reaches 90 days and this
script has nothing to roll up. To keep history the delete must become "roll up,
then delete" (or the script runs daily at 30 days). That change deletes data and
is not made here.

## 7. Egress log

`packages/db/src/egress-meter.ts`, off unless `EGRESS_LOG=1` (read when the
client is created, so no cost when off). Every Prisma operation reports its rows
and the JSON size of its result under a label: the active query-budget route
(`trpc.query.aiMonitoring.getStatus`, a queue name), or the name given to
`runWithEgressJob` (the events-worker maintenance jobs and the API background
jobs are named). It logs one `[egress]` line every 5 minutes
(`EGRESS_LOG_INTERVAL_MS`) with the top 15 by bytes (`EGRESS_LOG_TOP`): `job`,
`op`, `calls`, `rows`, `bytes`, `avgBytes`. Only labels and numbers are logged,
never row contents. Turn it on for a day after the deploy, add the bytes up,
compare to Supabase's counter, turn it off.

## 8. What this PR changes

| change                                                                                                                                                                | file                                                                                                 | reversible by                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Monitoring aggregates in SQL (count, sum, avg, min, max, p50 to p99, per-bucket trend); drift and hallucination lists select only shown columns and are capped at 100 | `apps/api/src/services/AIMonitoringService.ts`                                                       | revert the file                      |
| In-process result cache, 2 min default                                                                                                                                | same                                                                                                 | `AI_MONITORING_QUERY_CACHE_TTL_MS=0` |
| Dashboard polling 30 s to 60 s (trend 120 s); start time floored to the minute so the query key is stable                                                             | `apps/web/src/lib/ai-monitoring/hooks.ts`                                                            | revert                               |
| Verified-user cache, 60 s                                                                                                                                             | `apps/api/src/lib/verified-token-cache.ts`, `supabase.ts`, `security/session-cache.ts`, `context.ts` | revert                               |
| Events-worker pool 10 to 5                                                                                                                                            | `apps/workers/events-worker/src/main.ts`                                                             | `DATABASE_POOL_MAX=10`               |
| Score-band lead lists capped at 500                                                                                                                                   | `apps/api/src/modules/lead/lead.router.ts`                                                           | revert                               |
| Egress log                                                                                                                                                            | `packages/db/src/egress-meter.ts`, `client.ts`                                                       | leave `EGRESS_LOG` unset             |
| Retention script and summary table                                                                                                                                    | `tools/scripts/ai-monitoring-retention.ts`, migration                                                | not scheduled; drop never needed     |

Proof the new figures equal the old ones:
`tests/integration/ai-monitoring-sql-parity.test.ts` seeds one tenant (ties,
nulls, three-state flags, other-tenant and global rows) into a real Postgres,
runs the previous JavaScript calculation (kept in the test) and the new SQL on
the same rows, and compares counts, percentiles (p50, p75, p90, p95, p99), min,
max, mean, success rate, ROI and every trend bucket. Percentiles use integer
arithmetic (`(n * p + 99) / 100`) so they match the JS rule `ceil(n * p / 100)`
exactly; `percentile_disc`'s float fraction can differ by one position.

Behaviour that changed on purpose, and nothing else:

- `getStatus` and `getLatencyTrend` floor their window start to the minute (so
  the result can be cached): the window may be up to 59 s longer.
- Results can be up to 2 minutes old.
- The score-band lists stop at 500 leads (highest score first).
- `getDriftMetrics` and `getHallucinationReport` cap `limit` at 100 inside the
  service (the router already did).

Left unchanged and why: `getROIMetrics` still sums all time when no range is
given (its `periodStart` says 7 days; that mismatch is old and changing it would
change the figure); the Redis store's `hasFilters` treats the router's default
`limit` as a filter, so drift and hallucination never use the Redis snapshot
(the SQL path is now cheap, and slicing a snapshot to a limit is a behaviour
risk for little gain); the mailbox sync claim logic.

## 9. Estimated monthly egress after the fix

| source                                                     | before                     | after                                                        |
| ---------------------------------------------------------- | -------------------------- | ------------------------------------------------------------ |
| Monitoring publisher                                       | 4.5 to 12.3 GB             | about 0.001 GB (already fixed by #1559)                      |
| Dashboards, one heavy user (modelled, tenant-owned events) | up to 5.7 GB               | about 0.3 GB                                                 |
| Mailbox sync, sweeps, background                           | 0.1 to 0.5 GB              | 0.1 to 0.5 GB                                                |
| Auth `getUser`                                             | 0 today                    | at most one per token per minute if the fallback is ever hot |
| App pages (lists, details)                                 | not measured, small tables | unchanged, hot-lead lists capped                             |
| **Total**                                                  | **5 to 18 GB**             | **about 0.5 to 1 GB**                                        |

Against a quota of about 5.5 GB that leaves roughly five times the headroom. The
"after" column is an estimate; the egress log is how it gets checked.

## 10. Owner decisions

1. **Retention policy for `ai_monitoring_events`** (deletion is yours): keep the
   30-day daily delete as is, or change it to roll up first so history survives
   (then run the script once with `--apply` after a dry run you have seen).
2. **Apply the new migration to production** (`ai_monitoring_daily_summaries`,
   additive, empty). It is only needed if you choose the roll-up; the app does
   not read it.
3. **Railway settings**: `DATABASE_POOL_MAX` values and the transaction pooler
   URL (section 5).
4. **Turn on `EGRESS_LOG=1`** on the API, ai-worker and events-worker for one
   day after the deploy.
5. **Tenant ids on events**: the worker writes every monitoring event with
   `tenantId` NULL, so tenants see no latency, ROI or hallucination data at all.
   Fixing that makes rows 2 to 6 live, and is what the caches and SQL summaries
   are for. It is a product decision, not an egress one.
6. Merge and worker deploy (the ai-worker deploy also carries #1552). Not done
   here.
