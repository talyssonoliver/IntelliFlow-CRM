# PG-205 RED/GREEN index

Written by the recovery lane (session ffa3728c) on 2026-10-18T08:57:59Z from each log's header and test summary lines.
The plan asked for this index to be written as each log was saved. Neither lane did that, so this file was
compiled at the end. The logs themselves are the evidence; each header records its own `date -u` time and HEAD.

| Log | Kind | Time (log header) | HEAD | Test summary | Outcome |
|---|---|---|---|---|---|
| `01-domain.red.log` | RED | 2026-10-17T16:39:21Z | `d8ae42d01` | 31 failed / 66 passed (97) | fail (expected) |
| `02-validators.red.log` | RED | 2026-10-17T16:52:48Z | `bd628081a` | 43 failed / 76 passed (119) | fail (expected) |
| `03-api-router.red.log` | RED | 2026-10-17T16:58:23Z | `bd628081a` | 45 failed / 15 passed (60) | fail (expected) |
| `04-api-contact.red.log` | RED | 2026-10-17T17:01:20Z | `bd628081a` | 22 failed / 38 passed (60) | fail (expected) |
| `05-db.pre-migration.log` | pre-migration | 2026-10-17T17:02:46Z | `bd628081a` | 24 skipped (24) | pass |
| `06-web.red.log` | RED | 2026-10-17T17:37:43Z | `dbb06a8db` | 123 failed / 131 passed (254) | fail (expected) |
| `07-domain.green.log` | GREEN | 2026-10-17T16:44:30Z | `d8ae42d01` | 97 passed (97) | pass |
| `08-validators.green.log` | GREEN | 2026-10-17T16:53:37Z | `bd628081a` | 119 passed (119) | pass |
| `09-db.green.log` | GREEN | 2026-10-17T17:16:49Z | `bd628081a` | 24 passed (24) | pass |
| `11-api-router.green.log` | GREEN | 2026-10-17T17:11:51Z | `bd628081a` | 60 passed (60) | pass |
| `12-api-contact.green.log` | GREEN | 2026-10-17T17:14:21Z | `bd628081a` | 60 passed (60) | pass |
| `14-web.green.log` | GREEN | 2026-10-17T17:50:05Z | `dbb06a8db` | 254 passed (254) | pass |
| `15-codex-fixes.green.log` | GREEN | 2026-10-17T18:08:42Z | `dbb06a8db` | 64 passed (64); 58 passed (58); 82 passed (82) | pass |
| `15-codex-fixes.red.log` | RED | 2026-10-17T18:06:04Z | `dbb06a8db` | 2 failed / 62 skipped (64) | fail (expected) |
| `16-codex-fixes-2.green.log` | GREEN | 2026-10-17T18:13:49Z | `dbb06a8db` | 29 passed (29) | pass |
| `16-codex-fixes-2.red.log` | RED | 2026-10-17T18:13:26Z | `dbb06a8db` | 2 failed / 16 skipped (18) | fail (expected) |
| `17-codex-fix-3.green.log` | GREEN | 2026-10-17T19:52:11Z | `dbb06a8db` | 393 passed / 2 skipped (395) | pass |
| `17-codex-fix-3.red.log` | RED | 2026-10-17T19:51:47Z | `dbb06a8db` | 1 failed / 1 passed / 32 skipped (34) | fail (expected) |
| `18-account-picker.green.log` | GREEN | 2026-10-17T19:58:21Z | `dbb06a8db` | 345 passed (345) | pass |
| `18-account-picker.red.log` | RED | 2026-10-17T19:57:29Z | `dbb06a8db` | 4 failed / 1 passed / 57 skipped (62) | fail (expected) |
| `19-account-replace.green.log` | GREEN | 2026-10-17T20:02:09Z | `dbb06a8db` | 395 passed / 2 skipped (397) | pass |
| `19-account-replace.red.log` | RED | 2026-10-17T20:01:38Z | `dbb06a8db` | 2 failed / 34 skipped (36) | fail (expected) |
| `19-account-replace.reverify.log` | reverify | 2026-10-17T20:50:08Z | `?` | 36 passed (36) | pass |
| `20-account-replace-atomic.green.log` | GREEN | 2026-10-17T20:57:59Z | `?` | 66 passed (66); 42 passed (42); 37 passed (37) | pass |
| `20-account-replace-atomic.red.log` | RED | 2026-10-17T20:53:18Z | `dbb06a8db` | 2 failed / 64 skipped (66) | fail (expected) |
| `21-codex-11.green.log` | GREEN | 2026-10-17T21:04:53Z | `?` | 397 passed / 2 skipped (399); 43 passed (43) | pass |
| `21-codex-11.red.log` | RED | 2026-10-17T21:04:17Z | `dbb06a8db` | 1 failed / 37 passed (38) | fail (expected) |
| `22-a11y-review.green.log` | GREEN | 2026-10-17T21:54:39Z | `e929eb220` | 142 passed (142) | pass |
| `22-a11y-review.red.log` | RED | 2026-10-17T21:53:06Z | `e929eb220` | 5 failed / 51 passed (56) | fail (expected) |
| `23-tag-length.green.log` | GREEN | 2026-10-18T08:51:04Z | `ab5c70b0f` | 2743 passed (2743); 398 passed / 2 skipped (400); 521 passed (521) | pass |
| `23-tag-length.red.log` | RED | 2026-10-18T08:50:31Z | `ab5c70b0f` | 2 failed / 58 passed (60) | fail (expected) |
