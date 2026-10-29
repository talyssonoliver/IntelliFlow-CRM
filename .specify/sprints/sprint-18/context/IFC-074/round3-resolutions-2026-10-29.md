# IFC-074 2026-10-29 addendum: Round 3 challenges and lead resolutions (input to Round 4 CONSENSUS)

Base: `round2-lead-draft-2026-10-29.md`. Round 3 was run by five role subagents (backend-architect, devops-lead,
test-engineer, domain-expert, security-lead), read-only, with file:line evidence. Their outputs are summarised in
`IFC-074-discussion.md` (2026-10-29 section). Format: challenge → resolution.

## P1: collector Loki routing (amended)
1. Loki alert instances carry `service_name`, so `fetchTransitions` turns them into `service: 'unknown'`
   (`collect…mjs:449`). They would never anchor to an episode (Backend, DOA High). **Resolution:** take
   `labels.service ?? labels.service_name`. A test checks that a Loki-rule transition anchors to an ai-worker episode.
2. Service names differ. The combined worker's spans use `intelliflow-ai-worker`
   (`apps/ai-worker/src/tracing/otel.ts:48`), but its logs ship as `ai-worker` (Backend). **Resolution:** add a
   constant alias map `{ 'intelliflow-ai-worker': 'ai-worker' }`, applied only when matching Loki series to episodes.
   `sameService` stays unchanged for Prometheus rules. A new `sameLokiService` is used for Loki rules, and a series with
   no `service_name` matches only an episode with no service.
3. Probe and timeline cost (Backend):
   - `trueAtProbe` uses the existing `lokiQueryRange` with `start = end = at`. There is **no new `lokiInstantQuery`**,
     and so no new proxy path.
   - `conditionTimeline` and `conditionHeld` use `lokiQueryRange` with `step=60`, reading the matrix `values`.
   - The Loki lookback is capped at 6 h (`LOKI_CONDITION_LOOKBACK_MAX_S`), and the cap is reported as `lookback_s`.
   - An empty matrix gives `first_true_s: null`, not 0.
4. The `fakeGrafana` test fake answers any `/api/v1/query*` path, so a test there would pass even with the bug (Test).
   **Resolution:** make the fake strict per datasource uid. Prometheus paths under `grafanacloud-logs` return 404, and
   Loki paths under `grafanacloud-prom` return 404. The assertions read the `grafana.calls` paths and the decoded
   `query` and `step` values.
5. Proxy uid safety (Security, Test). **Resolution:** `datasourceProxy(uid)` itself requires `uid` to be a key of
   `DATASOURCE_KINDS` or to match `^[A-Za-z0-9_-]{1,64}$`. Otherwise it throws `invalid datasource uid`, without echoing
   the value. Tests cover `../x`, `a/b`, `a?b`, the empty string and 65 characters.
6. Output schema (Backend, DevOps). **Resolution:** `datasource_kind` and `not_checked` go into the output allowlist,
   the `.d.mts` and the `schema_version` bump (2.2.0), all in one commit. An unknown uid gives
   `not_checked: "unknown_datasource"` and the run continues.

## P2: Loki rule stays ai-worker only. **Agreed by all.**
Wording fix (Domain): the addendum says outright that, by the model, api episodes are expected to miss 120 s, because
only the span rule (modelled at 162-203 s) covers them. Widening the selector is finding F14 (it depends on F11).

## P3: dispatch workflow (amended; the token choice goes to the owner)
7. **Production environment.** Verified via the API on 2026-10-29: `protection_rules: []` and
   `deployment_branch_policy: null`. This is already ledger item ENV008-PROD-ENV-BRANCH-POLICY-001. A dispatch from any
   branch ref receives the environment's secrets (Security).
8. **Token.** The only available token is the Admin `GRAFANA_SA_TOKEN` (DevOps, Security, F7). The question was sent
   to the coordinator for the owner. **Working assumption, option B:** the workflow reads a new environment secret
   `GRAFANA_VIEWER_TOKEN`. When that secret is absent, it fails closed with a message naming F7. It never falls back to
   the Admin token. Agents do not create the secret.
9. **Hardening** (DevOps, Security):
   - job `if: github.ref == 'refs/heads/main'`;
   - `permissions: contents: read`, `environment: Production`;
   - the token passed as step-level `env` only;
   - sparse checkout of `tools/` and `infra/monitoring`;
   - `@v7` actions, following repo convention;
   - `timeout-minutes: 12` and a concurrency group;
   - the `since` and `services` inputs passed through `env:`, quoted, and regex-checked before use;
   - upload only after the collector's own `assertSafeKeys`, with `retention-days: 7`.
10. **Public artifact** (Security). These outputs are the same evidence files already committed to this public repo
    (`artifacts/reports/*`). The artifact exposes nothing new. Trace ids and timings are already public.
11. A workflow test (copying the `env008-workflows.test.ts` pattern) fails on:
    - a `push`, `pull_request` or `schedule` trigger;
    - a write permission;
    - an `inputs.*` reference inside `run:`;
    - any reference to `GRAFANA_SA_TOKEN`.
12. A dispatch-only workflow can be run only once it is on the default branch (DevOps). The post-deploy runbook says
    so.

## P4: KPI statistic and honesty (amended; the statistic goes to the owner)
13. **Statistic.** Moving from the per-incident mean to the per-episode first alert is a **supersession of AC-004**,
    not a correction (Domain). The question was sent to the owner. **Working assumption, option B:**
    - the primary statistic is the mean per-episode first alert;
    - the per-incident mean is co-reported;
    - the definition is pre-registered in this PR, before any post-deploy data;
    - the 2026-10-22 value is labelled non-comparable;
    - this is recorded as Category B (old→new, evidence, impact; Round 4 is the independent review).
14. **`kpi_results` text** (Domain):
    - `actual`: "NOT MEASURED on the post-#1040/#1062 stack. Last measurement 2026-10-22 (per-incident mean 268.7 s,
      n=63, not met) predates both rules. Post-deploy per-episode measurement pending (>=72 h or >=10 episodes)."
    - `target`: "< 120 s mean per-episode first alert".
    - `met: false` (this means "not demonstrated").
    - `task-tracking.json` keeps 4.479 min, with a dated note added.
15. **Labels.** The PR-body numbers are labelled "modelled replay, unverified here, no committed file". The volume
    figures are labelled estimates. The CI-run claims cite run ids only.

## P5: records. Agreed, with fixes
16. Owner ruling 3 is appended to `IFC-074-owner-ruling.md` before the addendum cites it, marked "relayed by the
    coordinator" with the date.
17. Blocker 6: ruling 3 answers only its "tuning vs target" half. Blockers 4 and 5 and AC-002/AC-009 stay open (Domain).

## P6: api runtime impact (amended)
18. **Idle-timer test dropped.** It would test the library, not our code: the constructor schedules nothing, so
    asserting zero timers proves nothing (Test). The claim is stated with citations instead:
    - api log records are written only inside tRPC calls (`middleware.ts:165-222`);
    - the logs timer starts only while records are buffered (`BatchLogRecordProcessorBase.js:228-257`);
    - traces, metrics (60 s reader) and health probes are separate and pre-existing.
    The wording is "log records are tRPC-only", never "an idle api sends nothing" (DevOps).
19. **Volume.** 1-2 lines per request (`middleware.ts:166-191`). The bytes per line are an estimate, unless measured
    from a real record in the existing real-pino test (that measurement is preferred, and plan-session decides).
    A volume tripwire is finding F15.

## P7: userId (reversed)
20. **Keep both keys, as the consensus spec says (`spec:177`).** The reasons:
    - Security recommends (a): userId is already in Tempo as `user.id`, and Grafana access is owner-only.
    - Backend and Test showed the `userId: undefined` override is fragile and only covers `apiLog`, not other lines
      written in the same request.

    Recorded in an ADR-086 amendment: purpose (incident debugging), owner-only access, Loki retention, and the fact that
    only protected and tenant procedures carry tenantId and userId. Public, admin, partner and auth procedures carry
    neither (`trpc.ts:102,316,348,575,598`). Minimising userId, if the owner ever wants it, is done once for all
    services, in the mixin and in spans, and is not part of this PR.
21. **New test (Test, Security).** It uses real pino and `runWithLogContext`, and asserts the exact key set of an
    emitted request record for a protected-context call and for a no-context call. This documents what reaches Loki.

## Post-deploy runbook (DevOps; the steps become an AC)
1. Merge the PR.
2. `build-images` produces `sha-<merge>`.
3. Dispatch `promote-production` with `api` (owner's yes).
4. The uptime check passes.
5. Confirm `OTEL_EXPORTER_OTLP_ENDPOINT` is set on the api.
6. Make one real tRPC call.
7. Dispatch `observability-evidence.yml` with `since=<deploy>` (needs the Viewer token).
8. Repeat until at least 72 h or 10 episodes have passed, then judge AC-013.
