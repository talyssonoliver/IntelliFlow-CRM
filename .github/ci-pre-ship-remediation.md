# Production-Branch CI Failure Post-Mortem

**Audit date:** 2026-10-03  
**Repository:** `talyssonoliver/IntelliFlow-CRM`  
**Evidence window:** 2026-07-22 through 2026-10-03

## 1. Executive Summary

The 50 newest completed, failed GitHub Actions runs found for `push` events on
`main` were reviewed. They represent **33 distinct commits**; multiple
workflows failed on the same SHA, so these are not 50 distinct merges.
Commit/PR metadata is taken from the commit subject; “—” means no PR number was
present there.

| Failed workflow family | Runs | Share |
| --- | ---: | ---: |
| CI Pipeline | 16 | 32% |
| Release | 12 | 24% |
| Security Scanning | 11 | 22% |
| Dependency Security Scan | 9 | 18% |
| Build & Push Images | 1 | 2% |
| Artifact Signing and Provenance | 1 | 2% |

These are **workflow-family counts**, not root-cause counts: run-level status
alone does not establish that all failures in one workflow share a cause. The
clearest recurring causes confirmed in inspected logs were:

1. **Test and quality-gate failures:** CI runs failed at SonarCloud quality gate
   or unit shard/coverage enforcement; Release runs failed in `Build Release` →
   `Run tests`. A representative shard/merge-gate failure explicitly reported
   `unit-shards=failure`.
2. **Real-database test reliability:** inspected test output includes Prisma
   `ECONNREFUSED` during inherited-membership integration-test cleanup/reset
   (`RESET ROLE` / `RESET app.current_tenant_id`). The test relies on a live DB;
   the precise underlying infrastructure or lifecycle failure needs the full
   job log to distinguish.
3. **Dependency/security policy findings:** inspected `pnpm audit` output
   reported 38 vulnerabilities (21 high, 16 moderate, 1 low), including a
   transitive `fast-uri` advisory; OSV scanner failures also recurred. Some
   scanner outputs identify findings but do not establish whether each was
   reachable at runtime.
4. **Build and E2E integration gaps:** an API image failed to resolve
   `@intelliflow/partner-sdk`; a Playwright smoke test received HTML where it
   expected tRPC JSON (`Unexpected token '<'`); a separate test exposed
   `window is not defined` in a Radix hover-card delayed callback.

**Stability index:** the selected sample is 50/50 failed by construction, so its
failure share is 100%; it is **not** a reliability rate for all merges. A true
stability rate requires the total completed main-branch workflow runs (and
preferably unique commits) for the same period. The report does not infer that
50 failed runs equal 50 failed production deployments. The inspected
`.github/workflows/cd.yml` deploys automatically only after `CI Pipeline`
concludes successfully and deploys the validated SHA; a failed CI check blocks
that automatic path. Manual dispatch is a separate route.

## 2. Breakdown of Failure Patterns

### Confirmed failure modes and where they belong

| Pattern | Evidence and likely systemic gap | Best catch point |
| --- | --- | --- |
| Unit/test/quality gates | CI includes 20 unit shards, a merge coverage gate, and a blocking SonarCloud quality gate. Logs confirm both Sonar failures and shard/coverage failures. Sonar logs identify a failed gate but do not disclose which metric without SonarCloud details. | Local pre-ship; required CI gate |
| DB-backed integration tests | Prisma cleanup/reset calls were refused by the DB in inherited-membership tests. This indicates a missing/unavailable DB service, wrong target, or lifecycle/cleanup race; the captured error alone does not distinguish them. | Local Docker-backed integration run; CI service health/readiness and test cleanup |
| E2E API origin/response contract | Smoke test received an HTML document rather than tRPC JSON. Most likely wrong/unavailable API origin, fallback route, or proxy configuration; inspect response URL/status/content-type before assigning a specific cause. | Local smoke suite; CI E2E preflight and response diagnostics |
| Dependency/security scans | Audit and OSV checks reject dependency snapshots with advisories; inspected `pnpm audit` output included high-severity transitive findings. This is a dependency update/policy issue, not evidence of an exploitable production path by itself. | Local lockfile scanner; CI dependency checks |
| Container packaging | API image could not resolve `@intelliflow/partner-sdk`; a later fix title explicitly says to ship the SDK in the API image. The image build context/workspace packaging did not include a required package. | Local Docker build and CI image build |
| Test environment/browser globals | A React/Radix timeout accessed `window` outside a browser-like test environment. | Component test setup and deterministic timer cleanup |
| Release workflow test stage | Several inspected Release runs stopped at `Build Release` → `Run tests`; build/archive/release steps were skipped as a consequence. The failed test name is not safely attributable to every Release run without its terminal log. | The same local test command/configuration as CI; retain per-run logs |
| Other scanner/provenance failures | Security, dependency, and artifact-signing workflow names identify the failing area, but some older runs did not have enough retained terminal output in the audit evidence to identify the exact rule or artifact. | Preserve full failing-step logs and artifact metadata; do not infer causes from titles |

### Frequency and reporting limits

- Workflow-family frequencies above cover all 50 selected run IDs and sum to
  100%.
- The same SHA may appear more than once because multiple workflows run for a
  push; there are 33 distinct SHAs in this sample.
- Run IDs link to GitHub Actions. The table records the workflow/failure stage
  and uses confidence-qualified summaries. Where the exact job log was not
  available in the audit evidence, it says so instead of guessing.
- Security/dependency workflow failures are treated as policy/scan failures,
  not as confirmed runtime vulnerabilities. No production deployment failure
  is asserted without an actual CD run and its job log.

## 3. 50-Run Failure Log

“Stage” is the workflow that reported failure; exact failing job is included
where observed. Cause summaries distinguish direct evidence from likely or
unavailable evidence. PR numbers come from commit subjects and do not imply
that each run is a separate merge.

| Run ID / Commit | Failure Category | Root Cause Summary | Catch Location |
| --- | --- | --- | --- |
| [37130088746](https://github.com/talyssonoliver/IntelliFlow-CRM/actions/runs/37130088746) / `1e6af32c93` (#752) | CI Pipeline — SonarCloud | `SonarQube Cloud Scan` failed. Quality Gate reported FAILED; exact metric is not in the inspected log excerpt. | CI |
| [37130088507](https://github.com/talyssonoliver/IntelliFlow-CRM/actions/runs/37130088507) / `1e6af32c93` (#752) | Release — tests | `Build Release` → `Run tests` failed; build/archive/release steps were skipped. Underlying assertion requires this run’s test log. | CI |
| [37122083372](https://github.com/talyssonoliver/IntelliFlow-CRM/actions/runs/37122083372) / `f0f90dbadc` (#751) | CI Pipeline — SonarCloud | `SonarQube Cloud Scan` failed. Quality Gate metric not established by the inspected excerpt. | CI |
| [37122083255](https://github.com/talyssonoliver/IntelliFlow-CRM/actions/runs/37122083255) / `f0f90dbadc` (#751) | Release — tests | `Build Release` → `Run tests` failed; later release steps skipped. Underlying test cause not established here. | CI |
| [37119834137](https://github.com/talyssonoliver/IntelliFlow-CRM/actions/runs/37119834137) / `da95f3c6eb` (#750) | CI Pipeline — unit/coverage | Unit Shard 14/20 failed and Merge Coverage Gate enforced the upstream failure. Test output includes DB-backed inherited-membership cleanup `ECONNREFUSED`; inspect complete log to confirm whether it is this shard’s exact cause. | Local + CI |
| [37119834009](https://github.com/talyssonoliver/IntelliFlow-CRM/actions/runs/37119834009) / `da95f3c6eb` (#750) | Release — tests | `Build Release` → `Run tests` failed; release build and archive were skipped. Exact failing test not established here. | CI |
| [37115526088](https://github.com/talyssonoliver/IntelliFlow-CRM/actions/runs/37115526088) / `ea5231ac55` (#745) | CI Pipeline — SonarCloud | `SonarQube Cloud Scan` failed; the specific failed quality metric is not shown in the inspected evidence. | CI |
| [37115525872](https://github.com/talyssonoliver/IntelliFlow-CRM/actions/runs/37115525872) / `ea5231ac55` (#745) | Release — tests | `Build Release` → `Run tests` failed; release outputs were skipped. Exact assertion requires the run log. | CI |
| [37035128006](https://github.com/talyssonoliver/IntelliFlow-CRM/actions/runs/37035128006) / `e362dc8247` (#744) | CI Pipeline — SonarCloud | `SonarQube Cloud Scan` failed; quality metric not determined. Integration Tests completed successfully for this run. | CI |
| [37035127491](https://github.com/talyssonoliver/IntelliFlow-CRM/actions/runs/37035127491) / `e362dc8247` (#744) | Release — tests | `Build Release` → `Run tests` failed; build/archive steps were skipped. Underlying test cause is not established here. | CI |
| [36952424938](https://github.com/talyssonoliver/IntelliFlow-CRM/actions/runs/36952424938) / `8d385f30cd` (#743) | Release — tests | `Build Release` → `Run tests` failed; later release steps skipped. The commit title concerns API SDK packaging, but is not evidence that this Release test failure had the same cause. | CI |
| [36952425261](https://github.com/talyssonoliver/IntelliFlow-CRM/actions/runs/36952425261) / `8d385f30cd` (#743) | CI Pipeline — SonarCloud | `SonarQube Cloud Scan` failed; exact metric unavailable in inspected excerpt. | CI |
| [36944634379](https://github.com/talyssonoliver/IntelliFlow-CRM/actions/runs/36944634379) / `09805af049` (#742) | CI Pipeline — SonarCloud | `SonarQube Cloud Scan` failed; the failed metric is not established. Integration Tests completed successfully in this CI run. | CI |
| [36944633926](https://github.com/talyssonoliver/IntelliFlow-CRM/actions/runs/36944633926) / `09805af049` (#742) | Security Scanning — Docker image build | `Docker Image Scanning` failed during image build; API image build also failed. Other inspected scans (Trivy filesystem, npm audit, baseline, OWASP, CodeQL) passed. | CI |
| [36944633900](https://github.com/talyssonoliver/IntelliFlow-CRM/actions/runs/36944633900) / `09805af049` (#742) | Release — tests | `Build Release` → `Run tests` failed; later release steps skipped. Exact test-level cause not established here. | CI |
| [36944633898](https://github.com/talyssonoliver/IntelliFlow-CRM/actions/runs/36944633898) / `09805af049` (#742) | Build & Push Images — API image | API build and advisory container boot failed while resolving `@intelliflow/partner-sdk`, a workspace packaging/build-context omission. | Local + CI |
| [36845202054](https://github.com/talyssonoliver/IntelliFlow-CRM/actions/runs/36845202054) / `071018bcde` (#738) | CI Pipeline — SonarCloud | `SonarQube Cloud Scan` failed; exact quality metric is not in the inspected evidence. | CI |
| [34535329041](https://github.com/talyssonoliver/IntelliFlow-CRM/actions/runs/34535329041) / `936e0f3ec4` (#709) | Dependency Security Scan | Dependency scanner failed. Run title references a Vitest timeout repair; scanner output is needed to confirm whether that is causal or merely commit context. | CI |
| [34093245095](https://github.com/talyssonoliver/IntelliFlow-CRM/actions/runs/34093245095) / `df1091fff1` (#688) | Security Scanning | Security workflow failed; exact job/rule needs the run log. | CI |
| [34066319769](https://github.com/talyssonoliver/IntelliFlow-CRM/actions/runs/34066319769) / `8f4b7bf7b9` (#705) | Dependency Security Scan | Dependency scan failed around the `@bull-board/ui` revert; exact scanner finding needs the log. | CI |
| [34066319800](https://github.com/talyssonoliver/IntelliFlow-CRM/actions/runs/34066319800) / `8f4b7bf7b9` (#705) | Security Scanning | Security workflow failed; exact check is not established from the retained evidence. | CI |
| [34002237681](https://github.com/talyssonoliver/IntelliFlow-CRM/actions/runs/34002237681) / `d0cb182c6d` (#682) | Dependency Security Scan | Dependency scan failed after `@bull-board/ui` update; verify the advisory/lockfile finding from the terminal log. | CI |
| [34002237635](https://github.com/talyssonoliver/IntelliFlow-CRM/actions/runs/34002237635) / `d0cb182c6d` (#682) | Security Scanning | Security workflow failed; exact job/rule is not established here. | CI |
| [34001012613](https://github.com/talyssonoliver/IntelliFlow-CRM/actions/runs/34001012613) / `974b95ada4` (#684) | Security Scanning | Security workflow failed on the `js-yaml` update commit; exact scanner finding needs the run log. | CI |
| [34001012601](https://github.com/talyssonoliver/IntelliFlow-CRM/actions/runs/34001012601) / `974b95ada4` (#684) | Dependency Security Scan | Dependency scan failed on the `js-yaml` update commit; verify advisory/version details from the scan output. | CI |
| [34001012626](https://github.com/talyssonoliver/IntelliFlow-CRM/actions/runs/34001012626) / `974b95ada4` (#684) | Release — tests | Release workflow failed; inspect run jobs for the exact failing stage and log before assigning a test cause. | CI |
| [30624338454](https://github.com/talyssonoliver/IntelliFlow-CRM/actions/runs/30624338454) / `966c6a2226` (#673) | Release | Release workflow failed. Exact failed job/terminal cause was not available in the reviewed evidence. | CI |
| [30218983428](https://github.com/talyssonoliver/IntelliFlow-CRM/actions/runs/30218983428) / `a2199de956` (#668) | Release | Release workflow failed. Exact job/terminal cause was not established here. | CI |
| [30216133887](https://github.com/talyssonoliver/IntelliFlow-CRM/actions/runs/30216133887) / `0b8d347b83` (#658) | CI Pipeline | CI workflow failed; the commit concerns quality-gate/reporting changes, but the title alone does not establish the failing check. | CI |
| [30178452607](https://github.com/talyssonoliver/IntelliFlow-CRM/actions/runs/30178452607) / `a20f21a62b` (#654) | CI Pipeline | E2E test job failed in the inspected job summary; terminal output is needed to establish the exact assertion/environment cause. | CI |
| [30153250533](https://github.com/talyssonoliver/IntelliFlow-CRM/actions/runs/30153250533) / `382fe5af26` (#638) | Security Scanning | Security workflow failed; exact scanner/rule was not established in reviewed output. | CI |
| [30152019192](https://github.com/talyssonoliver/IntelliFlow-CRM/actions/runs/30152019192) / `a07f433090` (—) | Security Scanning | Security workflow failed; exact job cause is unavailable in this evidence set. | CI |
| [30152019343](https://github.com/talyssonoliver/IntelliFlow-CRM/actions/runs/30152019343) / `a07f433090` (—) | CI Pipeline | CI workflow failed; exact failing check was not established in reviewed evidence. | CI |
| [30134794981](https://github.com/talyssonoliver/IntelliFlow-CRM/actions/runs/30134794981) / `f4ec0b0cb2` (#634) | Security Scanning | Security workflow failed after a workflow-password/secrets change; title is context, not proof of the specific failing security check. | CI |
| [30131581574](https://github.com/talyssonoliver/IntelliFlow-CRM/actions/runs/30131581574) / `1ce7055bca` (#630) | Security Scanning | Security workflow failed around secret-linter/Gitleaks changes; exact rule or environment failure needs the run log. | CI |
| [30121053763](https://github.com/talyssonoliver/IntelliFlow-CRM/actions/runs/30121053763) / `baf69d8235` (#629) | Security Scanning | Security workflow failed; exact check not established from reviewed evidence. | CI |
| [30121053738](https://github.com/talyssonoliver/IntelliFlow-CRM/actions/runs/30121053738) / `baf69d8235` (#629) | Dependency Security Scan | Dependency scan failed; exact advisory/finding not established here. | CI |
| [30106506342](https://github.com/talyssonoliver/IntelliFlow-CRM/actions/runs/30106506342) / `fd8f78c2ff` (#627) | Release | Release workflow failed around a secret-source change; exact stage is not established from the run title. | CI |
| [30105480402](https://github.com/talyssonoliver/IntelliFlow-CRM/actions/runs/30105480402) / `2ec7d0e497` (#626) | Artifact Signing and Provenance | Provenance workflow failed; specific attestation/signing step and cause require its job log. | CI |
| [30105480396](https://github.com/talyssonoliver/IntelliFlow-CRM/actions/runs/30105480396) / `2ec7d0e497` (#626) | Release | Release workflow failed; exact stage/cause not established by available evidence. | CI |
| [30100561681](https://github.com/talyssonoliver/IntelliFlow-CRM/actions/runs/30100561681) / `1235bcee1b` (#622) | CI Pipeline | CI workflow failed on a load-test/benchmark commit; exact check and terminal cause need the run log. | CI |
| [30100561471](https://github.com/talyssonoliver/IntelliFlow-CRM/actions/runs/30100561471) / `1235bcee1b` (#622) | Dependency Security Scan | Dependency scan failed; exact finding not established in reviewed evidence. | CI |
| [30000068138](https://github.com/talyssonoliver/IntelliFlow-CRM/actions/runs/30000068138) / `7d4fd773c3` (#620) | Dependency Security Scan | Dependency scan failed on a dependency-bump commit; inspect scanner result for the exact advisory. | CI |
| [29993359545](https://github.com/talyssonoliver/IntelliFlow-CRM/actions/runs/29993359545) / `b8ed885c9c` (#619) | Dependency Security Scan | Dependency scan failed; flaky-test skip-gate title does not establish scanner cause. | CI |
| [29991251512](https://github.com/talyssonoliver/IntelliFlow-CRM/actions/runs/29991251512) / `cc136b6f4c` (#618) | Dependency Security Scan | Dependency scan failed around a Next.js security update; exact remaining advisory/failure needs the log. | CI |
| [29966224278](https://github.com/talyssonoliver/IntelliFlow-CRM/actions/runs/29966224278) / `cd82f0ae70` (#616) | Security Scanning | Security workflow failed; exact scan/rule is not established from reviewed evidence. | CI |
| [29947499690](https://github.com/talyssonoliver/IntelliFlow-CRM/actions/runs/29947499690) / `3e6ed968ac` (#610) | CI Pipeline — E2E | E2E test job failed around test discovery/runner diagnostics; inspected historical smoke failure returned HTML instead of tRPC JSON. Exact linkage needs the full run log. | Local + CI |
| [29943235083](https://github.com/talyssonoliver/IntelliFlow-CRM/actions/runs/29943235083) / `ccf635e6db` (#608) | CI Pipeline — E2E | CI workflow failed around E2E discovery. Commit title identifies “No tests found”; confirm exact failed job output before treating that as the sole cause. | Local + CI |
| [29931169744](https://github.com/talyssonoliver/IntelliFlow-CRM/actions/runs/29931169744) / `5cdb96985e` (#604) | CI Pipeline | CI workflow failed on a governance/quality-guard commit; exact gate and error require the job log. | CI |
| [29925134514](https://github.com/talyssonoliver/IntelliFlow-CRM/actions/runs/29925134514) / `d12093fa21` (#603) | CI Pipeline | CI workflow failed on a quality-rule fix; exact check/error requires the job log. | CI |

## 4. Local Agent Remediation Roadmap

This section specifies follow-up work; **no source, workflow, or infrastructure
changes were made as part of this audit**.

### A. Local pre-ship and developer feedback

1. Keep `.husky/pre-push` invoking `pnpm run pre-ship` on every branch push.
   The existing gate intentionally has no general bypass. For genuinely
   unavailable infrastructure, use `PRESHIP_ALLOW_MISSING=1` only as documented:
   it must still run all other steps and record the gap.
2. Before pushing, require a clean full gate and review its artifacts:
   ```bash
   pnpm install --frozen-lockfile
   pnpm run pre-ship -- --clean
   ```
   If debugging one existing pre-ship step, use the step ID from
   `artifacts/preship/last-run.json`:
   ```bash
   pnpm exec node scripts/pre-ship.mjs --only=<step-id>
   ```
3. For changes to web/API behavior, run the focused checks and preserve their
   failure output:
   ```bash
   pnpm run typecheck
   pnpm run lint
   pnpm run test:unit
   pnpm run test:integration
   pnpm run test:e2e
   pnpm run test:architecture
   pnpm run build
   ```
   Integration tests require the local test DB/Redis stack. Verify the
   connection points to the local test database—not production—before running
   DB-backed checks.
4. For a dependency change, review the lockfile and run local scanners already
   supported by the repo:
   ```bash
   pnpm audit --audit-level=high
   osv-scanner --lockfile=pnpm-lock.yaml
   ```
   The OSV command requires `osv-scanner` installed. Resolve or document each
   direct/transitive finding with an approved upgrade/override; do not blindly
   suppress findings or use an unreviewed blanket `audit fix`.
5. For API container changes, build the same image locally before pushing:
   ```bash
   docker build -f infra/docker/Dockerfile.api -t intelliflow-api:preflight .
   ```
   Verify the image includes built workspace dependencies such as
   `@intelliflow/partner-sdk` and boots successfully.

### B. Test determinism and database guardrails

1. In `packages/.../inherited-membership.test.ts` (locate the actual file with
   repository search), ensure the integration test waits for database
   readiness, uses a disposable test DB, and performs role/tenant cleanup in a
   `finally` path that does not hide the original assertion failure.
2. Keep DB-backed tests in the explicit Vitest `integration` project and out of
   unit-only commands. In CI, provide health-checked PostgreSQL and Redis
   services, verify readiness before tests start, and fail with a diagnostic
   naming the target host/database instead of retrying connection refusal
   silently.
3. For `window is not defined` failures in
   `apps/web/src/components/email/__tests__/email-coverage.supplementary.test.tsx`,
   use the configured browser-like test environment for DOM components and
   clear fake timers/unmount components in teardown. Keep the test enabled;
   quarantine only with an owner, issue, expiry, and explicit CI visibility.
4. For the smoke test in `tests/e2e/smoke.spec.ts`, log the resolved API URL,
   HTTP status, content type, and a bounded response excerpt when JSON parsing
   fails. Assert that the configured tRPC endpoint returns JSON and is served by
   the intended local/preview service, not an HTML fallback page.

### C. CI and CD guardrails

1. In `.github/workflows/test-regression.yml`, preserve the required
   `if: always()` merge gate and the explicit failure on any unsuccessful shard
   or project guard. Do not allow a skipped required check to make failed unit
   tests appear green. Keep upload of shard reports/timings under `if: always()`.
2. In `.github/workflows/ci.yml`, keep smoke tests blocking and add preflight
   diagnostics for app/API base URLs and response content types. Ensure
   Playwright test discovery is checked before execution; a zero-test run must
   fail with the discovered file list.
3. For SonarCloud failures in `.github/workflows/test-regression.yml`, attach
   the scanner’s quality-gate status and the failing metric/threshold to the
   job summary when available. Keep the quality gate blocking; distinguish
   code-quality failures from Sonar service/authentication failures.
4. For `.github/workflows/dependency-scan.yml` and
   `.github/workflows/security.yml`, retain scanner SARIF and terminal output,
   report package/version/fixed version/severity and whether a dependency is
   production or development-only, and fail only according to the documented
   severity policy. Re-run lockfile scans after updating dependencies.
5. In `infra/docker/Dockerfile.api` and the corresponding image workflow, build
   workspace libraries before the API image and ensure the Docker build context
   contains every workspace package required at runtime. Keep the API image
   build and container-boot smoke check blocking.
6. Keep `.github/workflows/cd.yml`’s upstream-success gate and validated-SHA
   pinning. Preserve the blocking production `/api/health` smoke test and
   correlate failures with deploy SHA, HTTP status, and response logs. Never
   interpret a failed CI push run as a production deployment without a matching
   CD run.
7. For all workflows, retain logs/artifacts long enough for root-cause review
   and include the failed step name in the summary. Keep retry logic limited to
   demonstrably transient infrastructure errors; retries must not mask
   deterministic test, dependency, or packaging defects.

### D. Verification commands for agents implementing remediation

Run from the repository root, against a local test DB only:

```bash
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run lint
pnpm run test:unit
pnpm run test:integration
pnpm run test:e2e
pnpm run test:architecture
pnpm run build
pnpm audit --audit-level=high
docker build -f infra/docker/Dockerfile.api -t intelliflow-api:preflight .
pnpm run pre-ship -- --clean
```

Also verify the affected GitHub Actions jobs on a PR before merge: unit shards
and merge gate, SonarCloud gate, smoke/E2E, dependency/security scans, API image
build/boot, and—when deployment behavior changes—the staging and production
health checks. Do not mark any unavailable required validation green; record
the blocker and its evidence.
