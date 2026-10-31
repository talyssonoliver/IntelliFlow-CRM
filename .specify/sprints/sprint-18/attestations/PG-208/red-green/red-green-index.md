# PG-208 RED/GREEN evidence index

Each log is the captured output of the plan step's own command. A RED log was committed together with the code that turned it GREEN. The commit column is the commit that added the log.

| Plan step | RED log | GREEN log | Commit |
|---|---|---|---|
| 1 / 8 Domain | `01-domain.red.txt` | `08-domain.green.txt` | `1e8252664` |
| 2 / 9 Validators | `02-validators.red.txt` | `09-validators.green.txt` | `c43e1e2bc` |
| 3 / 10 DB (Section A) | `03-db.red.txt` | `10-db.green.txt` | `7cdb2783c` |
| 4 / 11 Adapters + application | `04-adapters-application.red.txt` | `11-adapters-application.green.txt` | `e30918c29` |
| 5 / 12 API router | `05-api.red.txt` | `12-api.green.txt` | `0388596bb` |
| 6 / 13-14 Runtime, webhook, runner | `06-runtime.red.txt` | `13-14-runtime.green.txt` | `4576e9d74` |
| 7 / 16 Web page | `07-web.red.txt` | `16-web.green.txt` | `3142796e0` |
| 18 Registries / reconciliation | (none) | `18-registries.txt` | `75f9620fe` |
| 22 Integration (real DB, all three sections) | (none) | `22-integration.txt` | `743586efe` |
| 23 Codex: SQL NULL trigger filters (`Prisma.DbNull`) | `23-dbnull.red.txt` | `23-dbnull.green.txt` | `4397081c0` |
| 23 Ruling 9: action snapshots, off-period slots, failure notices | `23-ruling9.red.txt` | `23-ruling9.green.txt` | `9618646a9` |
| 23 Ruling 9: scheduled runs keep their snapshot | `23-ruling9-schedule.red.txt` | `23-ruling9-schedule.green.txt` | `60a5baf8b` |
| 24 Codex (pre-ship): a schedule run snapshots the actions read after its slot claim | `24-stale-schedule-actions.red.txt`, `24-stale-schedule-actions-integration.red.txt` | `24-stale-schedule-actions.green.txt`, `24-stale-schedule-actions-integration.green.txt` | `5b8c33420` |
| 25 Every admission path (event, webhook, schedule, Test Rule) snapshots the rule's actions read under a row lock, and admits nothing for a rule deactivated since the read | `25-admission-current-actions.red.txt`, `25-admission-current-actions-integration.red.txt` | `25-admission-current-actions.green.txt`, `25-admission-current-actions-integration.green.txt` | this commit |

Final validations at HEAD `743586efe` are in `.specify/sprints/sprint-18/execution/PG-208/20261020231931-3d9aa8b9/matop/gates/final-*.txt`.
