#!/usr/bin/env node
/**
 * check-unhandled-event-emitters.mjs  (CI failure category C)
 *
 * Catches the "Container boot smoke red — unhandled 'error' event crashed the
 * process" class of failure: a long-lived ioredis / BullMQ client is
 * instantiated, the broker is unreachable (ECONNREFUSED), the client emits an
 * `error` event, nothing is listening, and Node turns the unhandled `error`
 * into an uncaught exception that kills the worker.
 *
 * Detection
 *   Scans apps/** /src and packages/** /src (.ts/.tsx, excluding __tests__ /
 *   node_modules / dist) for:
 *       new Redis(   new IORedis(   new Queue(   new QueueEvents(   new Worker(
 *   For each instantiation it requires an `.on('error', ...)` (or `.once`)
 *   handler that is reachable either:
 *     • on the captured instance variable anywhere in the same file, OR
 *     • within the next 30 lines after the instantiation (chained / nearby).
 *   If no handler is found, the instantiation is reported as a crash risk.
 *
 *   To keep the signal high, BullMQ constructors (Queue/QueueEvents/Worker) are
 *   only considered when the file imports `bullmq`, and Redis/IORedis only when
 *   the file imports `ioredis` — otherwise the match is an unrelated class (a
 *   web `Worker`, a custom `Queue`, ...) and is skipped.
 *
 * Opt-out
 *   Put `// preship-allow-unhandled-error` on the instantiation line and a
 *   justification comment on the immediately following line, e.g.
 *       const r = new Redis(url); // preship-allow-unhandled-error
 *       // short-lived health probe, wrapped in try/catch by the caller
 *   The opt-out WITHOUT a following justification comment is itself a failure.
 *
 * Usage
 *   node tools/scripts/preship/check-unhandled-event-emitters.mjs
 *   node tools/scripts/preship/check-unhandled-event-emitters.mjs --staged-only
 *   node tools/scripts/preship/check-unhandled-event-emitters.mjs --json
 *
 * Exit codes (when run directly): 0 pass/skip, 1 fail, 2 usage error.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  repoRoot,
  walkFiles,
  getStagedFiles,
  getStagedAddedLines,
  toPosixRel,
  color,
  isMain,
} from './util.mjs';

const SCAN_ROOTS = [join(repoRoot, 'apps'), join(repoRoot, 'packages')];

// constructor -> the import that makes it the dangerous EventEmitter we mean.
const CTOR_MODULE = {
  Redis: 'ioredis',
  IORedis: 'ioredis',
  Queue: 'bullmq',
  QueueEvents: 'bullmq',
  Worker: 'bullmq',
};

const OPT_OUT = 'preship-allow-unhandled-error';

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function importsModule(text, mod) {
  const re = new RegExp(
    `(?:from\\s+['"]${escapeRe(mod)}['"]|require\\(\\s*['"]${escapeRe(mod)}['"]\\s*\\)|import\\(\\s*['"]${escapeRe(mod)}['"]\\s*\\))`
  );
  return re.test(text);
}

/** Does the file register an `.on('error')` / `.once('error')` on `varName`? */
function hasHandlerForVar(text, varName) {
  if (!varName) return false;
  const re = new RegExp(
    `\\b${escapeRe(varName)}\\s*\\.\\s*(?:on|once|addListener)\\s*\\(\\s*['"]error['"]`
  );
  return re.test(text);
}

const ERROR_HANDLER_RE = /\.\s*(?:on|once|addListener)\s*\(\s*['"]error['"]/;
const COMMENT_LINE_RE = /^\s*(?:\/\/|\/\*|\*)/;

/**
 * Scan a single file's text. `addedLines` (Set<number> | null) restricts
 * reporting to freshly-added lines in --staged-only mode; null = report all.
 *
 * @returns {{ findings: string[], instantiations: number }}
 */
export function scanFile(rel, text, addedLines = null) {
  const lines = text.split('\n');
  const findings = [];
  let instantiations = 0;

  const ctorAlt = Object.keys(CTOR_MODULE).join('|');
  const ctorRe = new RegExp(`new\\s+(${ctorAlt})\\s*\\(`, 'g');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;
    ctorRe.lastIndex = 0;
    let m;
    while ((m = ctorRe.exec(line)) !== null) {
      const ctor = m[1];
      const mod = CTOR_MODULE[ctor];

      // Only the EventEmitter we actually mean (skip unrelated same-named ctors).
      if (!importsModule(text, mod)) continue;

      instantiations += 1;

      // In staged-only mode, only flag instantiations the commit introduces.
      if (addedLines && !addedLines.has(lineNo)) continue;

      // Capture the instance variable, if any:
      //   const x = / let x = / var x = / this.x = / x =
      const before = line.slice(0, m.index);
      const varMatch =
        before.match(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*$/) ||
        before.match(/this\.([A-Za-z_$][\w$]*)\s*=\s*$/) ||
        before.match(/([A-Za-z_$][\w$]*)\s*=\s*$/);
      const varName = varMatch ? varMatch[1] : null;

      // Is the error handler registered ON THIS INSTANCE?
      //   • Named instance  -> require `<var>.on('error')` ANYWHERE in the file.
      //     (Do NOT accept a nearby generic `.on('error')`; it may belong to a
      //     different emitter — that masking was a false-negative.)
      //   • Anonymous/chained instance (e.g. `new BullMQAdapter(new Queue(...))`
      //     or `return new Queue(...).on('error', ...)`) -> fall back to a
      //     generic handler within the next 30 lines, since there is no name
      //     to bind to.
      let handled;
      if (varName) {
        handled = hasHandlerForVar(text, varName);
      } else {
        const windowText = lines.slice(i, Math.min(lines.length, i + 31)).join('\n');
        handled = ERROR_HANDLER_RE.test(windowText);
      }

      if (handled) continue;

      // 3) explicit opt-out marker on the instantiation line
      if (line.includes(OPT_OUT)) {
        const next = lines[i + 1] ?? '';
        if (COMMENT_LINE_RE.test(next) && next.replace(/^\s*(?:\/\/|\/\*|\*)\s*/, '').trim()) {
          continue; // suppressed with justification
        }
        findings.push(
          `${rel}:${lineNo} new ${ctor}(...) uses ${OPT_OUT} but has no justification comment on the next line`
        );
        continue;
      }

      findings.push(
        `${rel}:${lineNo} new ${ctor}(...) has no .on('error') handler (instance${varName ? ` "${varName}"` : ''}, ${mod})`
      );
    }
  }

  return { findings, instantiations };
}

/**
 * @param {{ stagedOnly?: boolean }} [opts]
 * @returns {Promise<import('./util.mjs').GuardResult>}
 */
export async function run(opts = {}) {
  const name = 'unhandled-event-emitters';

  let files;
  let addedByFile = new Map();
  if (opts.stagedOnly) {
    const staged = getStagedFiles().filter(
      (f) =>
        /[\\/](apps|packages)[\\/]/.test(f) &&
        /[\\/]src[\\/]/.test(f) &&
        /\.tsx?$/.test(f) &&
        !/[\\/]__tests__[\\/]/.test(f) &&
        !/\.(test|spec)\.tsx?$/.test(f)
    );
    files = staged;
    for (const f of staged) addedByFile.set(f, getStagedAddedLines(f));
    if (files.length === 0) {
      return {
        name,
        status: 'skip',
        summary: 'no apps|packages src .ts/.tsx files staged',
        findings: [],
      };
    }
  } else {
    files = walkFiles(SCAN_ROOTS, { exts: ['.ts', '.tsx'] }).filter(
      (f) => /[\\/]src[\\/]/.test(f) && !/\.(test|spec)\.tsx?$/.test(f)
    );
  }

  const allFindings = [];
  let totalInstantiations = 0;
  for (const file of files) {
    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const rel = toPosixRel(file);
    const added = opts.stagedOnly ? addedByFile.get(file) : null;
    const { findings, instantiations } = scanFile(rel, text, added);
    totalInstantiations += instantiations;
    allFindings.push(...findings);
  }

  if (allFindings.length > 0) {
    return {
      name,
      status: 'fail',
      summary: `${allFindings.length} ioredis/BullMQ instantiation(s) without an error handler`,
      findings: [
        ...allFindings.sort(),
        '',
        `Fix: register an error handler on each client so an unreachable broker`,
        `degrades instead of crashing the process, e.g.:`,
        `    const queue = new Queue(name, { connection });`,
        `    queue.on('error', (err) => logger.error({ err }, 'queue error'));`,
        `Or, if the client is intentionally short-lived / handled elsewhere, add`,
        `\`// ${OPT_OUT}\` on the instantiation line + a justification comment below.`,
      ],
    };
  }

  return {
    name,
    status: 'pass',
    summary: `${totalInstantiations} ioredis/BullMQ instantiation(s) all have error handlers`,
    findings: [],
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const stagedOnly = args.includes('--staged-only');
  const json = args.includes('--json');

  const result = await run({ stagedOnly });

  if (json) {
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
    console.error(`[unhandled-event-emitters] unexpected error: ${err.stack || err}`);
    process.exit(2);
  });
}
