/**
 * Coverage ratchet-floor logic (ADR-058), shared by CI and pre-ship through
 * scripts/check-coverage-floor.mjs.
 *
 * The floor guards PRODUCT code. Repo tooling (scripts/, tools/) is in the same
 * merged lcov so SonarCloud can hold new tooling code to `new_coverage`, but
 * that tooling arrived with ~8% coverage: counting it here would drag the
 * total under the floor without a single product line getting worse. So the
 * floor is computed over product files only, from the per-file entries of
 * coverage-summary.json — the same set of files the floor measured before
 * tooling was instrumented. Tooling coverage is reported, not gated, here;
 * Sonar's new_coverage gates it.
 */
import path from 'node:path';

export const DEFAULT_FLOOR = { statements: 78, branches: 70, functions: 75, lines: 80 };
export const METRICS = Object.keys(DEFAULT_FLOOR);

/** Top-level directories instrumented as repo tooling, not product. */
export const TOOLING_ROOTS = ['scripts', 'tools'];

/**
 * Istanbul's own rounding (istanbul-lib-coverage/lib/percent.js), so a product
 * total computed here matches what the json-summary would have printed.
 */
export function istanbulPercent(covered, total) {
  return total > 0 ? Math.floor((1000 * 100 * covered) / total / 10) / 100 : 100;
}

/**
 * @param {Record<string, string | undefined>} env
 */
export function resolveFloor(env) {
  return Object.fromEntries(
    METRICS.map((k) => [k, Number(env[`COVERAGE_FLOOR_${k.toUpperCase()}`] ?? DEFAULT_FLOOR[k])])
  );
}

/**
 * @param {string} file absolute or relative path from a coverage summary
 * @param {string} root repo root
 */
export function isToolingFile(file, root) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  return TOOLING_ROOTS.some((r) => rel.startsWith(`${r}/`));
}

/**
 * Split an Istanbul json-summary into product and tooling totals.
 *
 * @param {Record<string, any>} summary parsed coverage-summary.json
 * @param {string} root repo root
 */
export function splitTotals(summary, root) {
  const empty = () =>
    Object.fromEntries(METRICS.map((k) => [k, { total: 0, covered: 0, pct: 100 }]));
  const product = empty();
  const tooling = empty();
  let productFiles = 0;
  let toolingFiles = 0;
  for (const [file, entry] of Object.entries(summary)) {
    if (file === 'total') continue;
    const tooled = isToolingFile(file, root);
    const into = tooled ? tooling : product;
    if (tooled) toolingFiles++;
    else productFiles++;
    for (const k of METRICS) {
      into[k].total += entry[k]?.total ?? 0;
      into[k].covered += entry[k]?.covered ?? 0;
    }
  }
  for (const t of [product, tooling]) {
    for (const k of METRICS) t[k].pct = istanbulPercent(t[k].covered, t[k].total);
  }
  return { product, tooling, productFiles, toolingFiles };
}

/**
 * The whole gate. Returns the process exit code.
 *
 * @param {object} io
 * @param {string} io.summaryPath
 * @param {string} io.root repo root
 * @param {Record<string, string | undefined>} io.env
 * @param {(p: string) => string | null} io.readFile returns null when the file is missing
 * @param {(msg: string) => void} io.log
 * @param {(msg: string) => void} io.error
 * @returns {number}
 */
export function runCoverageFloor({ summaryPath, root, env, readFile, log, error }) {
  const floor = resolveFloor(env);
  const text = readFile(summaryPath);
  if (text == null) {
    error(`::error::${summaryPath} missing — the coverage step failed to produce a report.`);
    return 1;
  }
  let summary;
  try {
    summary = JSON.parse(text);
  } catch (e) {
    error(`::error::could not parse ${summaryPath}: ${e.message}`);
    return 1;
  }

  const { product, tooling, productFiles, toolingFiles } = splitTotals(summary ?? {}, root);
  if (productFiles === 0) {
    error(`::error::${summaryPath} has no per-file product entries — cannot compute the floor.`);
    return 1;
  }

  let bad = false;
  log(`Product coverage (${productFiles} files):`);
  for (const k of METRICS) {
    const ok = product[k].pct >= floor[k];
    log(`${ok ? '✓' : '✗'} ${k}: ${product[k].pct}% (floor ${floor[k]}%)`);
    if (!ok) bad = true;
  }
  if (toolingFiles > 0) {
    log(
      `Tooling coverage (${toolingFiles} files, ${TOOLING_ROOTS.join('/, ')}/ — not floor-gated; Sonar new_coverage gates new lines): ` +
        METRICS.map((k) => `${k} ${tooling[k].pct}%`).join(' · ')
    );
  }

  if (bad) {
    error(
      `::error::Product coverage is below the ratchet floor (${METRICS.map((k) => floor[k]).join('/')}). See ADR-058.`
    );
    return 1;
  }
  log('✅ Product coverage meets the ratchet floor.');
  return 0;
}
