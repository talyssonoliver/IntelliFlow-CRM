# PG-205 RED/GREEN index

Compiled by the recovery lane (session ffa3728c) from each log's header and test summary lines; last regenerated 2026-10-18T10:36:29Z.
The plan asked for this index to be written as each log was saved. Neither lane did that, so this file was compiled
at the end. The logs are `.txt` (renamed from `.log` on 2026-10-18 because CI rejects tracked `*.log`); each
header records its own `date -u` time and HEAD. `25-integration-colour-check` has no RED: the local test DB has
the constraint, so only CI could fail (see its header).

| Log | Kind | Time (log header) | HEAD | Test summary | Outcome |
|---|---|---|---|---|---|
| `01-domain.red.txt` | RED | 2026-10-17T16:39:21Z | `d8ae42d01` | 31 ⎯⎯⎯⎯⎯⎯⎯ / 31 failed / 66 passed (97) | fail (expected) |
| `02-validators.red.txt` | RED | 2026-10-17T16:52:48Z | `bd628081a` | 43 ⎯⎯⎯⎯⎯⎯⎯ / 43 failed / 76 passed (119) | fail (expected) |
| `03-api-router.red.txt` | RED | 2026-10-17T16:58:23Z | `bd628081a` | 45 ⎯⎯⎯⎯⎯⎯⎯ / 45 failed / 15 passed (60) | fail (expected) |
| `04-api-contact.red.txt` | RED | 2026-10-17T17:01:20Z | `bd628081a` | 22 ⎯⎯⎯⎯⎯⎯⎯ / 22 failed / 38 passed (60) | fail (expected) |
| `05-db.pre-migration.txt` | pre-migration | 2026-10-17T17:02:46Z | `bd628081a` | 24 skipped (24) | pass |
| `06-web.red.txt` | RED | 2026-10-17T17:37:43Z | `dbb06a8db` | 123 ⎯⎯⎯⎯⎯⎯ / 123 failed / 131 passed (254) | fail (expected) |
| `07-domain.green.txt` | GREEN | 2026-10-17T16:44:30Z | `d8ae42d01` | 97 passed (97) | pass |
| `08-validators.green.txt` | GREEN | 2026-10-17T16:53:37Z | `bd628081a` | 119 passed (119) | pass |
| `09-db.green.txt` | GREEN | 2026-10-17T17:16:49Z | `bd628081a` | 24 passed (24) | pass |
| `11-api-router.green.txt` | GREEN | 2026-10-17T17:11:51Z | `bd628081a` | 60 passed (60) | pass |
| `12-api-contact.green.txt` | GREEN | 2026-10-17T17:14:21Z | `bd628081a` | 60 passed (60) | pass |
| `14-web.green.txt` | GREEN | 2026-10-17T17:50:05Z | `dbb06a8db` | 254 passed (254) | pass |
| `15-codex-fixes.green.txt` | GREEN | 2026-10-17T18:08:42Z | `dbb06a8db` | 64 passed (64) / 58 passed (58) / 82 passed (82) | pass |
| `15-codex-fixes.red.txt` | RED | 2026-10-17T18:06:04Z | `dbb06a8db` | 2 ⎯⎯⎯⎯⎯⎯⎯ / 2 failed / 62 skipped (64) / 1 ⎯⎯⎯⎯⎯⎯⎯ | fail (expected) |
| `16-codex-fixes-2.green.txt` | GREEN | 2026-10-17T18:13:49Z | `dbb06a8db` | 29 passed (29) | pass |
| `16-codex-fixes-2.red.txt` | RED | 2026-10-17T18:13:26Z | `dbb06a8db` | 2 ⎯⎯⎯⎯⎯⎯⎯ / 2 failed / 16 skipped (18) | fail (expected) |
| `17-codex-fix-3.green.txt` | GREEN | 2026-10-17T19:52:11Z | `dbb06a8db` | 393 passed / 2 skipped (395) | pass |
| `17-codex-fix-3.red.txt` | RED | 2026-10-17T19:51:47Z | `dbb06a8db` | 1 ⎯⎯⎯⎯⎯⎯⎯ / 1 failed / 1 passed / 32 skipped (34) | fail (expected) |
| `18-account-picker.green.txt` | GREEN | 2026-10-17T19:58:21Z | `dbb06a8db` | 345 passed (345) | pass |
| `18-account-picker.red.txt` | RED | 2026-10-17T19:57:29Z | `dbb06a8db` | 4 ⎯⎯⎯⎯⎯⎯⎯ / 4 failed / 1 passed / 57 skipped (62) | fail (expected) |
| `19-account-replace.green.txt` | GREEN | 2026-10-17T20:02:09Z | `dbb06a8db` | 395 passed / 2 skipped (397) | pass |
| `19-account-replace.red.txt` | RED | 2026-10-17T20:01:38Z | `dbb06a8db` | 2 ⎯⎯⎯⎯⎯⎯⎯ / 2 failed / 34 skipped (36) | fail (expected) |
| `19-account-replace.reverify.txt` | reverify | 2026-10-17T20:50:08Z | `?` | 36 passed (36) | pass |
| `20-account-replace-atomic.green.txt` | GREEN | 2026-10-17T20:57:59Z | `?` | 66 passed (66) / 42 passed (42) / 37 passed (37) | pass |
| `20-account-replace-atomic.red.txt` | RED | 2026-10-17T20:53:18Z | `dbb06a8db` | 2 ⎯⎯⎯⎯⎯⎯⎯ / 2 failed / 64 skipped (66) / 6 ⎯⎯⎯⎯⎯⎯⎯ | fail (expected) |
| `21-codex-11.green.txt` | GREEN | 2026-10-17T21:04:53Z | `?` | 397 passed / 2 skipped (399) / 43 passed (43) | pass |
| `21-codex-11.red.txt` | RED | 2026-10-17T21:04:17Z | `dbb06a8db` | 1 ⎯⎯⎯⎯⎯⎯⎯ / 1 failed / 37 passed (38) / 2 ⎯⎯⎯⎯⎯⎯⎯ | fail (expected) |
| `22-a11y-review.green.txt` | GREEN | 2026-10-17T21:54:39Z | `e929eb220` | 142 passed (142) | pass |
| `22-a11y-review.red.txt` | RED | 2026-10-17T21:53:06Z | `e929eb220` | 5 failed / 51 passed (56) | fail (expected) |
| `23-tag-length.green.txt` | GREEN | 2026-10-18T08:51:04Z | `ab5c70b0f` | 2743 passed (2743) / 398 passed / 2 skipped (400) / 521 passed (521) | pass |
| `23-tag-length.red.txt` | RED | 2026-10-18T08:50:31Z | `ab5c70b0f` | 2 failed / 58 passed (60) | fail (expected) |
| `24-deploy-skew.green.txt` | GREEN | 2026-10-18T10:30:33Z | `4c1df7cac` | 327 passed (327) | pass |
| `24-deploy-skew.red.txt` | RED | 2026-10-18T10:29:55Z | `4c1df7cac` | 1 failed / 7 passed (8) | fail (expected) |
| `25-integration-colour-check.green.txt` | GREEN | 2026-10-18T10:31:21Z | `4c1df7cac` | 24 passed (24) | pass |
| `26-name-superrefine.green.txt` | GREEN | 2026-10-18T10:33:22Z | `4c1df7cac` | 61 passed (61) / 44 passed (44) | pass |
| `26-name-superrefine.red.txt` | RED | 2026-10-18T10:32:14Z | `4c1df7cac` | 1 failed / 14 passed (15) | fail (expected) |
