#!/usr/bin/env node
/**
 * Report for a red main-full-suite run (.github/workflows/main-full-suite.yml).
 *
 * The workflow runs the whole suite once per push to main, never cancelling a run, so
 * merges that land while one runs are batched into the next. When it fails, this script
 * says which commits the failure could have come from (the last green run's commit up
 * to this one) and which tests failed, so whoever looks does not have to dig through
 * twenty shard logs. It reports only: it reverts nothing.
 *
 * Inputs are the reports the jobs already write: vitest JSON (--reporter=json) and
 * JUnit XML (the merged unit report). A report that is missing or unreadable is listed
 * as such rather than ignored, because a job that crashed before writing its report is
 * itself a failure worth seeing.
 *
 * Usage (CI):
 *   node scripts/ci/main-red-report.mjs --from <sha|''> --to <sha> --run-url <url> \
 *     --jobs '<json {name: result}>' --out <body.md> <report files...>
 * Appends the body to $GITHUB_STEP_SUMMARY when it is set.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Most failing tests listed in the body; the rest are counted. */
export const MAX_LISTED = 50;

/** Failing tests in a vitest JSON report: [{ file, name, message }]. */
export function failuresFromVitestJson(json) {
  const out = [];
  for (const suite of json?.testResults ?? []) {
    const file = suite.name ?? suite.testFilePath ?? '(unknown file)';
    const failed = (suite.assertionResults ?? []).filter((t) => t.status === 'failed');
    for (const t of failed) {
      out.push({
        file,
        name: t.fullName || t.title || '(unnamed test)',
        message: firstLine((t.failureMessages ?? [])[0]),
      });
    }
    // A file that failed to load has no assertions, only a suite-level message.
    if (!failed.length && suite.status === 'failed') {
      out.push({ file, name: '(file failed to run)', message: firstLine(suite.message) });
    }
  }
  return out;
}

/** Failing test cases in a JUnit XML report: [{ file, name, message }]. */
export function failuresFromJunit(xml) {
  const out = [];
  const caseRe = /<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g;
  for (const m of String(xml).matchAll(caseRe)) {
    const body = m[2] ?? '';
    const fail = /<(failure|error)\b([^>]*)>?/.exec(body);
    if (!fail) continue;
    const attrs = m[1];
    out.push({
      file: attr(attrs, 'classname') || attr(attrs, 'file') || '(unknown file)',
      name: attr(attrs, 'name') || '(unnamed test)',
      message: firstLine(unescapeXml(attr(fail[2], 'message'))),
    });
  }
  return out;
}

/** Reads one report file; returns { failures } or { error }. */
export function readReport(file, read = (p) => fs.readFileSync(p, 'utf8')) {
  let text;
  try {
    text = read(file);
  } catch {
    return { error: 'missing (the job may have stopped before writing it)' };
  }
  try {
    if (file.endsWith('.xml')) return { failures: failuresFromJunit(text) };
    return { failures: failuresFromVitestJson(JSON.parse(text)) };
  } catch {
    return { error: 'unreadable' };
  }
}

/** The commit range a failure could have come from. */
export function describeRange(from, to) {
  if (!from) return `everything up to \`${short(to)}\` (no earlier green run of this workflow)`;
  if (from === to) return `\`${short(to)}\` only`;
  return `\`${short(from)}..${short(to)}\` (after the last green run, up to this one)`;
}

/** Markdown body for the job summary and the main-red issue. */
export function formatReport({ from, to, runUrl, jobs = {}, reports = [] }) {
  const lines = ['## main-full-suite is red', ''];
  lines.push(`- Commits: ${describeRange(from, to)}`);
  if (runUrl) lines.push(`- Run: ${runUrl}`);
  const failedJobs = Object.entries(jobs).filter(
    ([, r]) => r && r !== 'success' && r !== 'skipped'
  );
  if (failedJobs.length) {
    lines.push(`- Jobs not green: ${failedJobs.map(([n, r]) => `${n} (${r})`).join(', ')}`);
  }
  lines.push('');
  const failures = reports.flatMap((r) => r.failures ?? []);
  const broken = reports.filter((r) => r.error);
  if (failures.length) {
    lines.push(`### Failing tests (${failures.length})`, '');
    for (const f of failures.slice(0, MAX_LISTED)) {
      lines.push(`- \`${f.file}\` › ${f.name}${f.message ? ` — ${f.message}` : ''}`);
    }
    if (failures.length > MAX_LISTED)
      lines.push(`- …and ${failures.length - MAX_LISTED} more (see the run)`);
    lines.push('');
  } else {
    lines.push(
      'No failing test found in the reports: the failure is in a step outside the tests (see the run).',
      ''
    );
  }
  if (broken.length) {
    lines.push('### Reports not read', '');
    for (const r of broken) lines.push(`- \`${r.file}\`: ${r.error}`);
    lines.push('');
  }
  lines.push('Nothing was reverted. Fix forward, or revert the culprit by hand.');
  return lines.join('\n') + '\n';
}

function firstLine(s) {
  const line =
    String(s ?? '')
      .split(/\r?\n/)
      .find((l) => l.trim()) ?? '';
  const t = line.trim();
  return t.length > 200 ? `${t.slice(0, 197)}...` : t;
}
function attr(attrs, name) {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(attrs ?? '');
  return m ? unescapeXml(m[1]) : '';
}
function unescapeXml(s) {
  return String(s ?? '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}
function short(sha) {
  return String(sha ?? '').slice(0, 9);
}

/** Parses the CLI arguments. */
export function parseArgs(argv) {
  const opts = { from: '', to: '', runUrl: '', jobs: {}, out: '', files: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--from') opts.from = argv[++i] ?? '';
    else if (a === '--to') opts.to = argv[++i] ?? '';
    else if (a === '--run-url') opts.runUrl = argv[++i] ?? '';
    else if (a === '--jobs') opts.jobs = JSON.parse(argv[++i] || '{}');
    else if (a === '--out') opts.out = argv[++i] ?? '';
    else opts.files.push(a);
  }
  return opts;
}

export function main(argv = process.argv.slice(2), env = process.env) {
  const opts = parseArgs(argv);
  const reports = opts.files.map((file) => ({ file, ...readReport(file) }));
  const body = formatReport({ ...opts, reports });
  if (opts.out) fs.writeFileSync(opts.out, body);
  if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, body);
  process.stdout.write(body);
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) process.exit(main());
