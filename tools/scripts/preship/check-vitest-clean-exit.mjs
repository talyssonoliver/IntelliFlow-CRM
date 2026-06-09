#!/usr/bin/env node
/**
 * check-vitest-clean-exit.mjs  (CI failure category A)
 *
 * Catches the "Build Release red — all tests passed but the process exited 1"
 * class of failure: a leaked timer / promise (e.g. a `@radix-ui/react-toast`
 * timeout) fires AFTER jsdom is torn down, Node turns it into an unhandled
 * error / rejection, vitest exits non-zero, and CI reports
 * "Test run exited 1 without a clean pass signal" even though every test passed.
 *
 * The reporter saying "31953 passed" is NOT sufficient: this guard runs the
 * test command, captures stdout+stderr, and FAILS on any of the teardown-crash
 * signatures below OR a non-zero exit code, regardless of the passed count.
 *
 *   • "Unhandled error event"
 *   • "Unhandled rejection"
 *   • "Test run exited N without a clean pass signal"   (scripts/run-tests.js)
 *   • vitest's "caught N unhandled error(s) during the test run"
 *
 * It then points at the test file(s) vitest blamed so you can clear the leaked
 * timer/promise (clear timers in afterEach, await pending microtasks, or use
 * the vitest onUnhandledError config).
 *
 * This guard is SLOW (it runs a test suite). It is intentionally skipped in
 * --staged-only / pre-commit mode and runs only in `pnpm preship:guards` /
 * nightly. Scope it with --project to keep it bounded.
 *
 * Usage
 *   node tools/scripts/preship/check-vitest-clean-exit.mjs
 *   node tools/scripts/preship/check-vitest-clean-exit.mjs --project web
 *   node tools/scripts/preship/check-vitest-clean-exit.mjs --cmd "npx vitest run --reporter=verbose" --cwd /tmp/x
 *   node tools/scripts/preship/check-vitest-clean-exit.mjs --staged-only   # skips (slow)
 *
 * Exit codes (when run directly): 0 pass/skip, 1 fail, 2 usage error.
 */

import { spawn } from 'node:child_process';

import { repoRoot, stripAnsi, color, isMain } from './util.mjs';

// Teardown-crash signatures. A match fails the run even if the reporter shows
// every test passing. Keep these specific to avoid matching benign log lines.
const TRIGGERS = [
  { re: /Unhandled error event/i, label: "unhandled 'error' event" },
  { re: /Unhandled rejection/i, label: 'unhandled promise rejection' },
  {
    re: /Test run exited \d+ without a clean pass signal/i,
    label: 'run-tests.js clean-pass-signal failure',
  },
  {
    re: /caught \d+ unhandled error/i,
    label: 'vitest unhandled-error section',
  },
];

/**
 * Analyse captured test output. Pure — unit-testable without spawning.
 * @returns {{ triggered: {label:string, sample:string}[], blamedFiles: string[] }}
 */
export function analyzeOutput(rawOutput) {
  const text = stripAnsi(rawOutput);
  const triggered = [];
  for (const t of TRIGGERS) {
    const m = text.match(t.re);
    if (m) {
      // Grab the whole line the match sits on for context.
      const start = text.lastIndexOf('\n', m.index) + 1;
      const end = text.indexOf('\n', m.index);
      const sample = text.slice(start, end === -1 ? undefined : end).trim();
      triggered.push({ label: t.label, sample: sample.slice(0, 200) });
    }
  }

  // Blame extraction: vitest prints "This error originated in <file>" and
  // "The latest test that might've caused the error is <file>".
  const blamed = new Set();
  const originRe = /This error originated in "?([^"\n]+\.(?:tsx?|jsx?|mjs|cjs))"?/gi;
  const latestRe =
    /latest test that might'?ve caused the error is "?([^"\n]+\.(?:tsx?|jsx?|mjs|cjs))"?/gi;
  const genericTestRe = /[\w./\\-]+\.(?:test|spec)\.(?:tsx?|jsx?)/g;
  let m;
  while ((m = originRe.exec(text)) !== null) blamed.add(m[1].trim());
  while ((m = latestRe.exec(text)) !== null) blamed.add(m[1].trim());
  while ((m = genericTestRe.exec(text)) !== null) blamed.add(m[0].trim());

  return { triggered, blamedFiles: [...blamed].slice(0, 15) };
}

/** Run a command, streaming output through while capturing it. */
function runCommand(command, cwd) {
  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      env: process.env,
      stdio: ['inherit', 'pipe', 'pipe'],
    });
    let output = '';
    const onData = (data) => {
      const s = data.toString();
      output += s;
      process.stdout.write(data);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', (data) => {
      output += data.toString();
      process.stderr.write(data);
    });
    child.on('error', (err) => {
      output += `\n[spawn error] ${err.message}\n`;
      resolve({ code: 1, output });
    });
    child.on('close', (code) => resolve({ code: code ?? 1, output }));
  });
}

/**
 * @param {{ stagedOnly?: boolean, cmd?: string, projects?: string[], cwd?: string }} [opts]
 * @returns {Promise<import('./util.mjs').GuardResult>}
 */
export async function run(opts = {}) {
  const name = 'vitest-clean-exit';

  // Slow guard: never run in the fast pre-commit path.
  if (opts.stagedOnly) {
    return {
      name,
      status: 'skip',
      summary: 'slow guard skipped in --staged-only mode (runs in `pnpm preship:guards`)',
      findings: [],
    };
  }

  const cwd = opts.cwd ?? repoRoot;
  const projectFlags = (opts.projects ?? []).map((p) => `--project ${p}`).join(' ');
  const command = opts.cmd ?? `pnpm test --reporter=verbose --bail 0 ${projectFlags}`.trim();

  console.log(`${color.gray(`[${name}] running:`)} ${command}`);
  const { code, output } = await runCommand(command, cwd);
  const { triggered, blamedFiles } = analyzeOutput(output);

  const failed = code !== 0 || triggered.length > 0;
  if (!failed) {
    return {
      name,
      status: 'pass',
      summary: 'test run exited cleanly (no teardown crash signatures)',
      findings: [],
    };
  }

  const findings = [];
  if (triggered.length > 0) {
    findings.push('Teardown-crash signature(s) detected:');
    for (const t of triggered) findings.push(`  • ${t.label}: ${t.sample}`);
  }
  if (code !== 0 && triggered.length === 0) {
    findings.push(`Test command exited ${code} with no recognised clean-pass signal.`);
  }
  if (blamedFiles.length > 0) {
    findings.push('', 'Likely offending test file(s):');
    for (const f of blamedFiles) findings.push(`  → ${f}`);
  }
  findings.push(
    '',
    'Remediation: a test leaked a timer or promise that resolved AFTER teardown.',
    '  • clear timers/intervals in afterEach (or vi.clearAllTimers()/vi.useRealTimers())',
    '  • await pending microtasks before the test ends; unmount React trees',
    '  • for known-benign teardown noise, handle it in the vitest onUnhandledError hook'
  );

  return {
    name,
    status: 'fail',
    summary:
      triggered.length > 0
        ? `${triggered.length} teardown-crash signature(s) in test output (exit ${code})`
        : `test run exited ${code} without a clean pass`,
    findings,
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = { stagedOnly: false, json: false, projects: [], cmd: undefined, cwd: undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--staged-only') opts.stagedOnly = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--project') opts.projects.push(argv[++i]);
    else if (a === '--cmd') opts.cmd = argv[++i];
    else if (a === '--cwd') opts.cwd = argv[++i];
    else {
      console.error(`unknown arg: ${a}`);
      process.exit(2);
    }
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const result = await run(opts);

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.status === 'pass') {
    console.log(`${color.green('PASS')}  [${result.name}] ${result.summary}`);
  } else if (result.status === 'skip') {
    console.log(`${color.gray('SKIP')}  [${result.name}] ${result.summary}`);
  } else {
    console.error(`${color.red('FAIL')}  [${result.name}] ${result.summary}`);
    for (const f of result.findings) console.error(f ? `      ${f}` : '');
  }

  process.exit(result.status === 'fail' ? 1 : 0);
}

if (isMain(import.meta.url)) {
  main().catch((err) => {
    console.error(`[vitest-clean-exit] unexpected error: ${err.stack || err}`);
    process.exit(2);
  });
}
