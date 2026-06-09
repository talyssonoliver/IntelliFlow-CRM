# Preship Guards — CI Failure-Category Detection

## What these guards are

`tools/scripts/preship/` holds three deterministic guards that detect, **at
commit time**, the classes of failure that recently reached `main` despite a
green local run. Each guard maps to one CI failure category from the
2026-06-07/08/09 incident sweep:

| Guard                                | Category | CI red it prevents                                                |
| ------------------------------------ | -------- | ----------------------------------------------------------------- |
| `check-vitest-clean-exit.mjs`        | **A**    | Build Release — "all tests passed" but the process exited 1       |
| `check-unhandled-event-emitters.mjs` | **C**    | Container boot smoke — unhandled `error` event crashed the worker |
| `check-migration-role-bootstrap.mjs` | **D**    | Migration ETL — `role "postgres" does not exist` (P3018)          |

> Category **B** (runtime-path-linting Summary failing on a `cancelled`
> upstream) is **not** covered here: it is a CI-workflow design bug, not a
> commit-time problem, and is tracked separately as follow-up.

These guards **only add detection**. They do not fix the underlying broken jobs
(the `migration.yml` bootstrap, the worker connection setup, etc.) — that is
separate work.

## How they run

- **Pre-commit (fast, automatic):** `.husky/pre-commit` runs
  `node tools/scripts/preship/index.mjs --staged-only`. In this mode the slow
  vitest guard is skipped, and the other two inspect **only the staged diff** —
  a newly-added emitter or a changed migration. Editing an unrelated part of a
  file that already has a pre-existing finding does **not** block you.
- **Full audit (manual / nightly):** `pnpm preship:guards` runs all three guards
  across the whole repo. Use it before a release or when triaging the
  pre-existing backlog.
- **Individual:** each guard is directly runnable, e.g.
  `node tools/scripts/preship/check-migration-role-bootstrap.mjs`. Add `--json`
  for machine-readable output.

The orchestrator exits non-zero if **any** guard fails. Skipped guards (nothing
relevant staged, or the slow guard in fast mode) never fail the run.

---

## Guard A — `check-vitest-clean-exit.mjs`

**What it detects.** A leaked timer or promise (the canonical case is a
`@radix-ui/react-toast` timeout) that fires **after** jsdom is torn down. Node
turns it into an unhandled error/rejection, vitest exits non-zero, and CI prints
`Test run exited 1 without a clean pass signal` — even though every test passed.
The reporter's "31953 passed" line is _not_ sufficient evidence of a clean run.

**How.** It runs the test command, captures stdout+stderr, and fails on a
non-zero exit code **or** any of these teardown-crash signatures (case-
insensitive), regardless of the reported pass count:

- `Unhandled error event`
- `Unhandled rejection`
- `Test run exited N without a clean pass signal` (emitted by
  `scripts/run-tests.js`)
- `caught N unhandled error(s) during the test run` (vitest's section header)

It then extracts the test file(s) vitest blamed (`This error originated in …`,
`The latest test that might've caused the error is …`, plus any `*.test.*`
paths) and prints remediation.

**Why it is skipped in pre-commit.** It runs an actual test suite, so it is too
slow for the hook. It runs in `pnpm preship:guards` / nightly. Scope it with
`--project <name>` to bound the run, or override the command entirely with
`--cmd "<command>" --cwd <dir>`.

**Remediation when it fires.** A test leaked a timer/promise that resolved after
teardown:

- clear timers/intervals in `afterEach` (`vi.clearAllTimers()` /
  `vi.useRealTimers()`),
- await pending microtasks before the test ends; unmount React trees,
- for genuinely benign teardown noise, handle it in vitest's `onUnhandledError`
  hook (do **not** broaden `scripts/run-tests.js`'s OOM forgiveness — that is
  what let category A slip through).

**Common false positives.** A test that legitimately asserts on the literal
string "unhandled rejection" in its own output. If you hit this, scope the guard
to the affected `--project` and confirm the trigger line is a test assertion,
not a real teardown crash.

---

## Guard C — `check-unhandled-event-emitters.mjs`

**What it detects.** A long-lived ioredis / BullMQ client instantiated without
an `error` listener. When the broker is unreachable (`ECONNREFUSED`), the client
emits an `error` event; with no listener, Node escalates it to an uncaught
exception and the worker process dies — the container-boot smoke red.

**How.** It scans `apps/**/src` and `packages/**/src` (`.ts`/`.tsx`, excluding
`__tests__`, `node_modules`, `dist`) for:

```
new Redis(   new IORedis(   new Queue(   new QueueEvents(   new Worker(
```

For each instantiation it requires an `.on('error', …)` (or `.once` /
`.addListener`) handler:

- **Named instance** (`const q = new Queue(...)`, `this.q = new Queue(...)`):
  the handler must be registered on **that variable** anywhere in the same file
  (`q.on('error', …)`). A nearby handler belonging to a _different_ emitter does
  **not** count — that masking was a real false-negative.
- **Anonymous / chained instance** (`new BullMQAdapter(new Queue(...))`,
  `return new Queue(...).on('error', …)`): since there is no name to bind to, a
  generic `.on('error')` within the next 30 lines satisfies the check.

To keep the signal high, BullMQ constructors (`Queue`/`QueueEvents`/`Worker`)
are only considered when the file imports `bullmq`, and `Redis`/`IORedis` only
when the file imports `ioredis`. An unrelated same-named class (a web `Worker`,
a custom `Queue`) is skipped.

**Opt-out.** Put the marker on the instantiation line and a **justification
comment on the immediately following line**:

```ts
const probe = new Redis(url); // preship-allow-unhandled-error
// short-lived readiness probe; caller wraps connect() in try/catch
```

The marker **without** a following justification comment is itself a failure —
you must say why the unhandled `error` is acceptable.

**Remediation when it fires.** Register a handler so an unreachable broker
degrades instead of crashing:

```ts
const queue = new Queue(name, { connection });
queue.on('error', (err) => logger.error({ err }, 'queue error'));
```

**Common false positives.**

- A `new Worker(new URL(...))` web/worker*threads worker whose file \_also*
  imports `bullmq` — rare, but use the opt-out with a justification.
- A factory that attaches the handler indirectly (e.g.
  `attachErrorHandler(queue)`); static scanning cannot follow that, so use the
  opt-out.

**Pre-existing backlog.** A full-mode run currently reports ~21 pre-existing
instantiations without instance-bound handlers (ai-worker queues, the shared
`queue-connector.ts` ioredis connection + queue + queueEvents, two router
queues, etc.). These are genuine crash-risk findings, tracked separately; the
pre-commit hook only gates **newly added** instantiations so it does not block
unrelated edits to those files.

---

## Guard D — `check-migration-role-bootstrap.mjs`

**What it detects.** A Prisma migration that `GRANT`s to / `ALTER`s a Postgres
role the CI `migration.yml` bootstrap never `CREATE`s. `prisma migrate deploy`
then aborts with P3018 `role "X" does not exist`, reddening the Migration ETL
pipeline.

**How.**

1. Parses `.github/workflows/migration.yml`. From each Bootstrap step (name
   matches `bootstrap`, or the `run` body contains `CREATE ROLE`/`CREATE USER`)
   it collects every created role, plus the postgres-service `POSTGRES_USER`
   (the test-DB owner always exists) and Postgres built-in pseudo-roles
   (`public`, `current_user`, …).
2. Walks `packages/db/prisma/migrations/**/migration.sql` and extracts every
   **referenced** role from `GRANT … TO`, `REVOKE … FROM`,
   `ALTER DEFAULT PRIVILEGES FOR ROLE`, `ALTER ROLE`, and
   `REASSIGN/DROP OWNED BY` (a dotted `OWNED BY tbl.col` is a sequence column,
   not a role, and is skipped). SQL comments are stripped first.
3. Fails if any referenced role is not in the bootstrap set, naming the
   migration file, the role, and the line.

Role comparison is case-insensitive and quote-stripped (all roles in this repo
are lowercase, unquoted).

**Provenance.** This guard would have caught commit `487d249c`: the baseline
migration `20260317000000_baseline/migration.sql` references `postgres`, which
that commit's `migration.yml` bootstrap did not create (only `anon`,
`authenticated`, `service_role`). Commit `6e71576a` later added the `postgres`
role, so against current `main` this guard **passes** — re-introduce the gap and
it goes red at commit time instead of in CI. Verify the regression detection
against history with:

```bash
git show 487d249cb:.github/workflows/migration.yml > /tmp/migration-old.yml
node tools/scripts/preship/check-migration-role-bootstrap.mjs --workflow /tmp/migration-old.yml
# -> FAIL: 20260317000000_baseline/migration.sql references role "postgres" ...
```

**Remediation when it fires.** Either add the missing role to the "Bootstrap
Supabase schemas + roles" step in `migration.yml`:

```sql
IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
  CREATE ROLE postgres NOLOGIN;
END IF;
```

…or remove the `GRANT`/`ALTER` from the migration if the role is not actually
needed.

**Common false positives.** A role created by a _different_ mechanism the guard
doesn't parse (e.g. a role provisioned by the Postgres service image itself). If
that happens, the cleanest fix is still to add an explicit
`CREATE ROLE … IF NOT EXISTS` to the bootstrap step so the dependency is
documented and the guard sees it.

---

## Adding / changing a guard

- Guards live only in `tools/scripts/preship/` and share `util.mjs` (repo root
  resolution, recursive file walk, staged-file + staged-added-line helpers,
  colour, main-module detection).
- Each guard exports `async function run(opts)` returning
  `{ name, status: 'pass'|'fail'|'skip', summary, findings[] }` and is also
  directly executable. The orchestrator (`index.mjs`) imports those `run`
  functions and executes them concurrently.
- Keep dependencies to Node built-ins + `js-yaml` (already a devDependency).
- Honor `--staged-only`: a guard must be cheap and incremental in that mode
  (inspect only staged/added content), and slow guards should `skip`.

---

## PR Body Token (pre-PR-create, not pre-commit)

**What it detects.** The required `PR Checks / PR Validation` context greps the
PR **body** and fails the PR unless it references a tracked task id, a GitHub
issue, or a hotfix waiver:

```
([A-Z]{2,}(-[A-Z0-9]+)*-[0-9]+|#[0-9]+|\[hotfix\]|hotfix-waiver)   (case-insensitive)
```

i.e. one of: a task id (`IFC-123`, `PG-045`, `S17-AUDIT-001`, `INFRA-TF-002`),
an issue ref (`#123`), or a hotfix waiver (`[hotfix]` / `hotfix-waiver`).

**Why it is not in the pre-commit orchestrator.** This check runs against the PR
body, which **does not exist** at commit/push time — so the pre-ship gate
structurally cannot mirror it. Instead it is enforced at **PR-create time**:

- `tools/scripts/preship/check-pr-body.mjs` — validate a body
  (`--body-file <path>`, `--body <text>`, or stdin); exits non-zero with
  remediation if it carries no token.
- `tools/scripts/preship/safe-pr-create.mjs` (a.k.a. `pnpm pr:create`) — a
  drop-in `gh pr create` wrapper that validates `--body-file`/`--body` first and
  refuses to open the PR if the body is invalid, otherwise forwards every
  argument to `gh pr create`.

**How to use.**

```bash
pnpm pr:create --base main --head my-branch --title "..." --body-file body.md
```

**When to use `[hotfix]` / `hotfix-waiver`.** Only for work with no tracked task
— meta/infra hardening of CI or the preship system itself, urgent production
hotfixes, or chores that don't map to a sprint task. Prefer a real task id or
`#issue` whenever one exists; the waiver is the honest marker when one genuinely
does not. Add a one-line justification after `hotfix-waiver:`.
