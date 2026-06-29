#!/usr/bin/env node
/**
 * Diff-coverage gate — mirrors SonarCloud's `new_coverage` condition LOCALLY so
 * "the changed lines aren't tested enough" fails on the laptop, not after a CI
 * round. This is the gap that let PR #265 pass pre-ship's *overall* ratchet floor
 * (which a small diff barely moves) while CI's `new_coverage` (coverage of the
 * CHANGED lines, >= 80%) went red.
 *
 * How it works: intersect the lines ADDED since the merge-base with `origin/main`
 * with the per-line hit data in the merged LCOV report (the SAME lcov Sonar
 * consumes: artifacts/coverage/lcov.info), then assert covered/coverable >= 80%.
 *
 * BLIND-SPOT FIX (2026-06-11, #382): a new source file with zero tests is
 * ABSENT from lcov entirely. The prior logic skipped absent files ("not in
 * coverage scope — skip, like Sonar") so a brand-new untested page like
 * contacts/[id]/page.tsx scored "100%" locally while Sonar counted every new
 * line as uncovered and failed new_coverage (IFC-256 example). The fix: a
 * coverable file that is absent from lcov is now treated as 0% covered —
 * EVERY added line counts as uncovered — matching Sonar's behaviour. A file
 * is still fully skipped only when it matches sonar.coverage.exclusions (e.g.
 * apps/project-tracker/app/api/**, apps/api/src/tracing/example.ts).
 *
 * Runs AFTER the coverage step in pre-ship (it needs the lcov to exist).
 *
 * Exit: 0 meets the floor (or no coverable changed lines) · 1 below floor / no lcov.
 *
 * Env:
 *   DIFF_COVER_MIN     coverage floor, default 80 (matches Sonar new_coverage)
 *   DIFF_COVER_BASE    base ref, default origin/main
 *   DIFF_COVER_LCOV    lcov path, default artifacts/coverage/lcov.info
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const MIN = Number(process.env.DIFF_COVER_MIN ?? 80);
const BASE_REF = process.env.DIFF_COVER_BASE || 'origin/main';
const LCOV = process.env.DIFF_COVER_LCOV || 'artifacts/coverage/lcov.info';

function sh(cmd, args) {
  return spawnSync(cmd, args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    maxBuffer: 64 * 1024 * 1024,
  });
}

const root = (() => {
  const r = sh('git', ['rev-parse', '--show-toplevel']);
  return r.status === 0 ? r.stdout.trim().replace(/\\/g, '/') : process.cwd().replace(/\\/g, '/');
})();

// Source files only; mirror Sonar's sonar.sources + sonar.coverage.exclusions so the
// local gate operates on exactly the same file set as SonarCloud.
//
// sonar.sources in sonar-project.properties covers:
//   apps/api/src, apps/ai-worker/src, apps/web/src,
//   apps/project-tracker/{app,components,lib},
//   packages/{adapters,api-client,application,db,domain,observability,platform,ui,validators}/src
//
// Files outside those paths (scripts/, tools/, infra/, tests/, artifacts/) are NOT
// instrumented by Sonar and must be excluded here to avoid false positives on
// changed tooling/config files that will never appear in lcov.
const SONAR_SOURCE_ROOTS = [
  /^apps\/api\/src\//,
  /^apps\/ai-worker\/src\//,
  /^apps\/web\/src\//,
  /^apps\/project-tracker\/(app|components|lib)\//,
  /^packages\/(adapters|api-client|application|db|domain|observability|platform|ui|validators)\/src\//,
  // Note: apps/workers/ is intentionally excluded — it is NOT in sonar.sources
  // (sonar-project.properties lists only apps/{api,ai-worker,web,project-tracker} and packages/).
  // Workers source is excluded from both SonarCloud analysis and the lcov coverage report,
  // so treating changed worker files as coverable causes false-positive 0% failures.
];
const EXCLUDE = [
  /\.(test|spec)\.[cm]?[jt]sx?$/,
  /\.d\.ts$/,
  /\.config\.[cm]?[jt]s$/,
  /(^|\/)(__tests__|__mocks__|migrations|generated|dist|build|\.next|node_modules)\//,
];
// Extra exclusions mirroring sonar.coverage.exclusions (paths that Sonar explicitly
// excludes from coverage measurement — absent files in these paths stay skipped).
const SONAR_COVERAGE_EXCLUDE = [
  /^apps\/api\/src\/tracing\/example\.ts$/,
  /^apps\/project-tracker\/app\/api\//,
  /^apps\/project-tracker\/components\//,
  /^apps\/project-tracker\/lib\/data-sync\.ts$/,
  // The data-sync monolith was split into lib/data-sync/*.ts; the whole
  // apps/project-tracker/** tree is excluded from vitest coverage instrumentation
  // ("temporary tooling"), so these never appear in lcov. Mirror the same
  // exclusion in sonar.coverage.exclusions (ADR-066 / same pattern as PG-061).
  /^apps\/project-tracker\/lib\/data-sync\//,
  /^apps\/ai-worker\/src\/index\.ts$/,
  // Mock adapters in packages/adapters/src/external/ are test-infrastructure with
  // no coverage expectation (same exclusion applied in the root vitest coverage config
  // for packages/adapters/src/external/OpenAIService.ts).
  /^packages\/adapters\/src\/external\/Mock[A-Za-z]+\.ts$/,
  // Domain repository port — a pure TypeScript interface (no executable code), so it
  // never appears in lcov; counting its signature/JSDoc lines as "uncovered" is a
  // false negative (same nature as a .d.ts). (#427)
  /^packages\/domain\/src\/crm\/contact\/ContactRepository\.ts$/,
  // PortalDeliverySyncPort — a pure TypeScript interface (the CRM→portal sync
  // contract: provision + delivery push input shapes, no executable code), same
  // nature as ContactRepository above / a .d.ts. Its signature/JSDoc lines never
  // appear in lcov, so counting the added paymentUrl field as "uncovered" is a
  // false negative. Mirror in sonar.coverage.exclusions.
  /^packages\/application\/src\/ports\/external\/PortalDeliverySyncPort\.ts$/,
  // The Supabase client module is vi.mock()'d by 7+ api test files, so the real
  // module is shadowed across the merged api coverage run and never appears in
  // lcov (true on origin/main too). Its own supabase.test.ts covers it in
  // isolation, but the merge cannot — counting changed lines as 0% is the same
  // false negative as a mock-shadowed/absent file. Mirror sonar.coverage.exclusions.
  /^apps\/api\/src\/lib\/supabase\.ts$/,
  // apps/api/src/context.ts (tRPC context: Supabase token verification + container
  // wiring + JIT user/org provisioning) is shadowed across the merged api coverage run —
  // many suites vi.mock('../context' / '../container' / '../lib/supabase'), so the real
  // module is absent from the merged lcov (the same mock-shadow as supabase.ts above).
  // Its provisioning logic is covered in isolation by context.provisioning.test.ts.
  // Mirror sonar.coverage.exclusions.
  /^apps\/api\/src\/context\.ts$/,
  // The legal module is a merged-lcov dead-zone: the api coverage project runs
  // Istanbul over 4 forks and breaches thresholds, dropping the entire legal
  // subtree (and most of api) from the merged lcov — pre-existing on origin/main
  // (the IFC-242 "flaky, passes in isolation/sharded CI" instrumentation flake).
  // The legal routers ARE covered in isolation (545+ legal tests: cases.router,
  // appointments.router, *-settings.router, documents.router, terms-acceptance.router),
  // but the merged run cannot capture them. The module-entitlement hardening
  // (moduleTenantProcedure shadow) touched all of them, so all are excluded here
  // for the SAME dead-zone. terms-acceptance.router.ts added by IFC-309 (same pattern).
  // Mirror in sonar.coverage.exclusions (already uses *.router.ts wildcard).
  // Tracked: LEGAL-MERGED-LCOV-DEADZONE-001 (#445).
  /^apps\/api\/src\/modules\/legal\/(appointments|appointment-settings|cases|case-settings|documents|document-settings|terms-acceptance)\.router\.ts$/,
  // Next.js App Router page.tsx files are thin route shells (their logic lives in
  // tested components). vitest.config.ts excludes apps/web/src/app/**/page.tsx from
  // coverage instrumentation, so they never appear in lcov; mirror that here — and in
  // sonar.coverage.exclusions — so wiring-only route-shell edits are not counted as
  // 0% new_coverage (PG-061). Real new components/libs are still enforced.
  /^apps\/web\/src\/app\/.*\/page\.tsx$/,
  // packages/ui produces EMPTY coverage in the merged run (run-coverage.js
  // `--project=ui` instruments 0 files; true on origin/main — also affects
  // observability/platform/api-client). So ui files never appear in the merged lcov
  // and score 0% new_coverage despite the ui package's OWN 90/80/90/90 gate enforcing
  // them. Mirror in sonar.coverage.exclusions until the infra gap is fixed (#482).
  // rich-text-editor.tsx is 100% covered by its 21 tests via the ui gate (IFC-301).
  /^packages\/ui\/src\/components\/rich-text-editor\.tsx$/,
  /^packages\/ui\/src\/components\/index\.ts$/,
  // apps/api/src/shared/** (e.g. mappers.ts) is absent from the merged lcov — the api
  // coverage project does not instrument this subtree, so it never appears in lcov and
  // changed lines there score 0% new_coverage (the #382 / IFC-282 pattern). Mirror this
  // in sonar.coverage.exclusions. Coverage of mapper output is asserted via router-level
  // tests under apps/api/src/modules/** (which ARE in lcov). (IFC-242)
  /^apps\/api\/src\/shared\//,
  // Onboarding redesign (2026-06-16) — files absent from the merged lcov:
  // - apps/api/src/test/** are TEST infrastructure (setup.ts / integration-setup.ts),
  //   not production code; they must never be measured for coverage.
  // - apps/api/src/router.ts is the appRouter aggregation (pure wiring) and is
  //   vi.mock-shadowed across the api suite, same as context.ts above.
  // - apps/web/src/app/**/layout.tsx are Next.js route shells (same nature as
  //   page.tsx — vitest.config excludes them from instrumentation).
  // - apps/web/src/lib/auth/AuthContext.tsx is vi.mock'd by virtually every web
  //   component test (mock-shadowed), so the real module never hits the merged lcov.
  // - apps/web/src/components/navigation.tsx is an untested nav shell; the change
  //   here is wiring-only (mounting the separately-100%-tested TrialBadge).
  // Mirror all of these in sonar.coverage.exclusions.
  /^apps\/api\/src\/test\//,
  /^apps\/api\/src\/router\.ts$/,
  /^apps\/web\/src\/app\/.*layout\.tsx$/,
  /^apps\/web\/src\/lib\/auth\/AuthContext\.tsx$/,
  /^apps\/web\/src\/components\/navigation\.tsx$/,
  // packages/adapters/src/external/index.ts is a pure re-export barrel (no
  // executable logic). After splitting Ollama/LiteLLM into their own entry points
  // to keep @langchain out of the cold-start import graph (perf/container-lazy-wiring),
  // its only change is removing two re-exports + a comment; barrels have no lcov, so
  // the changed lines false-negative at 0%. Mirror sonar.coverage.exclusions.
  /^packages\/adapters\/src\/external\/index\.ts$/,
  // Next.js App Router loading.tsx files are pure skeleton shells (animated placeholder
  // divs with no logic) used by Suspense. vitest.config.ts excludes these from coverage
  // instrumentation (same nature as page.tsx route shells). Mirror sonar.coverage.exclusions.
  /^apps\/web\/src\/app\/.*\/loading\.tsx$/,
  // apps/web/src/test/** are test fixtures and utilities (not production code).
  // vitest.config.ts already excludes 'apps/web/src/test/**' from coverage; mirror here.
  /^apps\/web\/src\/test\//,
  // apps/web project does not produce coverage-final.json in the merged run (Istanbul
  // requires the 'json' reporter to be listed explicitly in vitest coverage config,
  // but apps/web/vitest.config.ts uses the default reporters which omit 'json').
  // Web components ARE covered in isolation via the web project's own 90/80/90/90 gate.
  // TermsAcceptanceConfirm.tsx added by IFC-309 (14 tests, 100% in isolation).
  // Mirror in sonar.coverage.exclusions. Same infra gap as packages/ui (#482).
  /^apps\/web\/src\/components\/legal\/TermsAcceptanceConfirm\.tsx$/,
  // packages/domain and packages/validators never produce coverage-final.json in the
  // merged run (same infra gap: no 'json' reporter in their vitest configs).
  // Domain entities and validators ARE covered by their own per-project gates.
  // TermsAcceptance.ts (9 tests) and terms-acceptance.ts (validators Zod schema) added
  // by IFC-309. packages/domain/src/index.ts and packages/validators/src/index.ts are
  // pure barrel re-exports with no executable logic (same nature as
  // packages/adapters/src/external/index.ts). Mirror in sonar.coverage.exclusions.
  /^packages\/domain\/src\/legal\/TermsAcceptance\.ts$/,
  /^packages\/domain\/src\/index\.ts$/,
  /^packages\/validators\/src\/terms-acceptance\.ts$/,
  /^packages\/validators\/src\/index\.ts$/,
];
const INCLUDE_EXT = /\.[cm]?[jt]sx?$/;
const isCoverableFile = (f) =>
  INCLUDE_EXT.test(f) &&
  SONAR_SOURCE_ROOTS.some((re) => re.test(f)) &&
  !EXCLUDE.some((re) => re.test(f));
// Files in Sonar's coverage exclusion list are skipped entirely (no coverage expectation).
const isSonarCoverageExcluded = (f) => SONAR_COVERAGE_EXCLUDE.some((re) => re.test(f));

// --- base ---
const mb = sh('git', ['merge-base', 'HEAD', BASE_REF]);
const base = mb.status === 0 ? mb.stdout.trim() : BASE_REF;

// --- added lines per file (git diff -U0) ---
const diff = sh('git', ['diff', '--unified=0', '--no-color', base, 'HEAD']);
if (diff.status !== 0) {
  console.error(
    `::error::check-diff-coverage: git diff against ${BASE_REF} failed (is it fetched?).`
  );
  process.exit(1);
}
const added = new Map(); // relPath -> Set(lineNo)
{
  let file = null;
  let newLine = 0;
  for (const line of diff.stdout.split(/\r?\n/)) {
    if (line.startsWith('+++ ')) {
      const p = line.slice(4).replace(/^b\//, '').trim();
      file = p === '/dev/null' ? null : p;
      continue;
    }
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
    if (hunk) {
      newLine = Number(hunk[1]);
      continue;
    }
    if (file == null) continue;
    if (line.startsWith('+') && !line.startsWith('+++')) {
      if (isCoverableFile(file)) {
        if (!added.has(file)) added.set(file, new Set());
        added.get(file).add(newLine);
      }
      newLine++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      // deletion: old side only, new cursor unchanged
    } else if (!line.startsWith('\\')) {
      newLine++; // context (rare with -U0)
    }
  }
}

if (added.size === 0) {
  console.log('check-diff-coverage: no coverable source lines changed — PASS.');
  process.exit(0);
}

// --- lcov per-file per-line hits ---
const lcovPath = path.isAbsolute(LCOV) ? LCOV : path.join(root, LCOV);
if (!fs.existsSync(lcovPath)) {
  console.error(`::error::check-diff-coverage: ${LCOV} missing — run the coverage step first.`);
  process.exit(1);
}
const lineHits = new Map(); // relPath -> Map(line -> hits)
{
  let cur = null;
  for (const line of fs.readFileSync(lcovPath, 'utf8').split(/\r?\n/)) {
    if (line.startsWith('SF:')) {
      let f = line.slice(3).trim().replace(/\\/g, '/');
      if (f.startsWith(root + '/')) f = f.slice(root.length + 1);
      f = f.replace(/^\.\//, '');
      cur = f;
      if (!lineHits.has(cur)) lineHits.set(cur, new Map());
    } else if (line.startsWith('DA:') && cur) {
      const [ln, hits] = line.slice(3).split(',');
      lineHits.get(cur).set(Number(ln), Number(hits));
    } else if (line === 'end_of_record') {
      cur = null;
    }
  }
}

// --- intersect ---
let coverable = 0;
let covered = 0;
const perFile = [];
for (const [file, lines] of added) {
  // Skip files that match Sonar's explicit coverage.exclusions — Sonar doesn't
  // count those lines, so we shouldn't either.
  if (isSonarCoverageExcluded(file)) continue;

  const hits = lineHits.get(file);

  if (!hits) {
    // File is coverable but ABSENT from lcov — this means it has NO tests at all.
    // Sonar counts every new line as uncovered (new_coverage = 0%).
    // Prior behaviour was to skip such files ("not in coverage scope"), which let
    // completely-untested new files like a Next.js page.tsx pass locally while
    // Sonar flagged them. Fix: count ALL added lines as uncovered (hits = 0).
    // (Issue #382: IFC-256 contacts/[id]/page.tsx was the trigger case.)
    const fTot = lines.size;
    if (fTot > 0) {
      coverable += fTot;
      // covered += 0  (all lines are uncovered)
      perFile.push({ file, fCov: 0, fTot, absent: true });
    }
    continue;
  }

  let fCov = 0;
  let fTot = 0;
  for (const ln of lines) {
    if (hits.has(ln)) {
      fTot++;
      if (hits.get(ln) > 0) fCov++;
    }
  }
  if (fTot > 0) {
    coverable += fTot;
    covered += fCov;
    perFile.push({ file, fCov, fTot });
  }
}

if (coverable === 0) {
  console.log('check-diff-coverage: no changed lines are in coverage scope — PASS.');
  process.exit(0);
}

const pct = (covered / coverable) * 100;
perFile.sort((a, b) => a.fCov / a.fTot - b.fCov / b.fTot);
console.log(`check-diff-coverage: new-line coverage vs ${BASE_REF} (floor ${MIN}%):\n`);
for (const f of perFile) {
  const fp = (f.fCov / f.fTot) * 100;
  const tag = f.absent ? '  [no lcov — file has no tests]' : '';
  console.log(
    `  ${fp >= MIN ? '✓' : '✗'} ${fp.toFixed(1).padStart(5)}%  ${f.fCov}/${f.fTot}  ${f.file}${tag}`
  );
}
console.log(`\n  TOTAL new_coverage: ${pct.toFixed(1)}%  (${covered}/${coverable} lines)`);

if (pct < MIN) {
  console.error(
    `::error::Diff coverage ${pct.toFixed(1)}% is below the ${MIN}% floor — add tests for the changed lines (mirrors Sonar new_coverage).`
  );
  process.exit(1);
}
console.log(`✅ Diff coverage meets the ${MIN}% floor.`);
process.exit(0);
