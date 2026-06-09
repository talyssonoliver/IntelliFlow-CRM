#!/usr/bin/env node
/**
 * index.mjs — preship guard orchestrator.
 *
 * Runs the three CI-failure-category guards concurrently, prints a summary, and
 * exits non-zero if any FAILED. SKIPPED guards (e.g. the slow vitest guard in
 * --staged-only mode, or a guard with nothing relevant staged) do not fail the
 * run.
 *
 *   A) vitest-clean-exit        — teardown-crash / unhandled-error exits
 *   C) unhandled-event-emitters — ioredis/BullMQ clients with no error handler
 *   D) migration-role-bootstrap — migration roles missing from CI bootstrap
 *
 * Usage
 *   node tools/scripts/preship/index.mjs                # full run (all guards)
 *   node tools/scripts/preship/index.mjs --staged-only  # fast pre-commit run
 *   node tools/scripts/preship/index.mjs --json         # machine-readable
 *
 * In --staged-only mode the slow vitest guard is skipped and the other two only
 * inspect the staged diff, keeping pre-commit fast.
 *
 * Exit codes: 0 all passed/skipped, 1 one or more failed, 2 orchestrator error.
 */

import { color, isMain } from './util.mjs';
import { run as runVitestCleanExit } from './check-vitest-clean-exit.mjs';
import { run as runUnhandledEmitters } from './check-unhandled-event-emitters.mjs';
import { run as runMigrationRoles } from './check-migration-role-bootstrap.mjs';

const GUARDS = [
  { id: 'vitest-clean-exit', run: runVitestCleanExit },
  { id: 'unhandled-event-emitters', run: runUnhandledEmitters },
  { id: 'migration-role-bootstrap', run: runMigrationRoles },
];

/**
 * @param {{ stagedOnly?: boolean }} [opts]
 * @returns {Promise<{ results: import('./util.mjs').GuardResult[], failed: number }>}
 */
export async function runAll(opts = {}) {
  const settled = await Promise.allSettled(
    GUARDS.map((g) => g.run({ stagedOnly: opts.stagedOnly }))
  );

  const results = settled.map((s, i) => {
    if (s.status === 'fulfilled') return s.value;
    return {
      name: GUARDS[i].id,
      status: 'fail',
      summary: `guard threw: ${s.reason?.message || s.reason}`,
      findings: [String(s.reason?.stack || s.reason)],
    };
  });

  const failed = results.filter((r) => r.status === 'fail').length;
  return { results, failed };
}

function printReport(results, { stagedOnly }) {
  const tag = stagedOnly ? color.gray('(staged-only)') : color.gray('(full)');
  console.log(`\n${color.bold('preship guards')} ${tag}\n`);

  for (const r of results) {
    const badge =
      r.status === 'pass'
        ? color.green('PASS')
        : r.status === 'skip'
          ? color.gray('SKIP')
          : color.red('FAIL');
    const stream = r.status === 'fail' ? console.error : console.log;
    stream(`  ${badge}  ${r.name.padEnd(26)} ${r.summary}`);
    if (r.status === 'fail') {
      for (const f of r.findings) console.error(f ? `         ${f}` : '');
    }
  }

  const passed = results.filter((r) => r.status === 'pass').length;
  const skipped = results.filter((r) => r.status === 'skip').length;
  const failed = results.filter((r) => r.status === 'fail').length;
  console.log(
    `\n  ${passed} passed, ${skipped} skipped, ${failed} failed ` +
      `(of ${results.length} guards)\n`
  );
}

async function main() {
  const args = process.argv.slice(2);
  const stagedOnly = args.includes('--staged-only');
  const json = args.includes('--json');

  const { results, failed } = await runAll({ stagedOnly });

  if (json) {
    console.log(JSON.stringify({ stagedOnly, failed, results }, null, 2));
  } else {
    printReport(results, { stagedOnly });
    if (failed > 0) {
      console.error(
        `${color.red('✖')} preship guards failed. See docs/runbooks/preship-guards.md ` +
          `for what each guard detects and how to opt out.`
      );
    }
  }

  process.exit(failed > 0 ? 1 : 0);
}

if (isMain(import.meta.url)) {
  main().catch((err) => {
    console.error(`[preship/index] orchestrator error: ${err.stack || err}`);
    process.exit(2);
  });
}
