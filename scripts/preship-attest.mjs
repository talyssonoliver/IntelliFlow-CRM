#!/usr/bin/env node
/**
 * Final-SHA pre-ship attestation — ENG-OPS-003.Gap13 (issue #644).
 *
 * WHAT THIS IS
 * ------------
 * `scripts/pre-ship.mjs` runs on `git push`, keyed to the SHA being pushed. But
 * a PR's FINAL head SHA is routinely NOT one a dev machine ever pushed: branch
 * protection has `strict: true`, so `gh pr update-branch` is mandatory whenever
 * `main` moves — and it builds that merge commit SERVER-SIDE, never passing
 * through `husky pre-push`. #637 merged at a head no local gate had ever seen.
 *
 * This tool publishes a machine-readable record — an annotated tag object at
 * `refs/preship/<sha>` whose message is a JSON payload — saying "a local
 * pre-ship run recorded a full-gate PASS for exactly this SHA", and verifies
 * that record from CI.
 *
 * WHAT THIS IS NOT
 * ----------------
 * It is an HONESTY / PROCESS control, NOT a security boundary. Anyone with push
 * access can publish an attestation without ever running the gate — exactly as
 * `git push --no-verify` already bypasses the pre-push hook. It catches the
 * ACCIDENTAL gap (a merge moved the SHA under a developer who genuinely ran the
 * gate); it does not stop a determined bypass. Do not document it otherwise —
 * overselling a skippable gate is how the #265 SKIP_PRESHIP erosion repeats.
 *
 * WHY A TAG OBJECT AND NOT A COMMIT STATUS
 * ----------------------------------------
 * A `pre-push` hook runs BEFORE the objects reach the remote, so
 * `POST /repos/{o}/{r}/statuses/{sha}` returns 422 (no such commit) — a commit
 * status cannot be published from the hook at all. A ref push carries its own
 * objects, so it works. A BARE ref carries no payload and so cannot distinguish
 * a full gate from `--only=lint`; an annotated tag carries the payload.
 *
 * Usage:
 *   node scripts/preship-attest.mjs --publish
 *   node scripts/preship-attest.mjs --verify --sha=<40-hex>
 *
 * Options:
 *   --remote=<name|path>   default: $PRESHIP_ATTEST_REMOTE or "origin"
 *   --state=<path>         default: <repo>/artifacts/preship/last-run.json
 *   --preship-file=<path>  default: <repo>/scripts/pre-ship.mjs
 *   --help
 *
 * Exit codes: 0 attested/verified, 1 refused, 2 usage error.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

export const PAYLOAD_VERSION = 1;
export const ATTEST_REF_PREFIX = 'refs/preship/';

/** Step verdicts that mean "this step honestly passed". */
const PASSING = new Set(['PASS', 'CACHED_PASS']);

/**
 * Re-derive whether a pre-ship state file honestly represents a FULL gate PASS.
 *
 * `state.verdict` alone is NOT sufficient evidence, and this is the whole point
 * of the function. Two confirmed laundering vectors produce a top-level
 * `verdict: "PASS"` that is structurally identical to a full green run:
 *
 *   1. `--only=<ids>` marks unselected steps SKIPPED_NOT_SELECTED
 *      (pre-ship.mjs:746-748) and sliceVerdict (:836-840) ignores that value.
 *   2. `PRESHIP_ALLOW_MISSING=1` (:872,:935) drops required
 *      SKIPPED_PRECONDITION steps from the `missing` count.
 *
 * So we walk `expected_step_ids` and demand a passing record for each.
 *
 * NOTE ON THE ABSENT `required` FIELD: three record shapes omit `required` —
 * SKIPPED_NOT_SELECTED (:746-748), SKIPPED_NOT_FULL (:753-755) and the
 * abort-loop records (:894-899). Treating `required` as optional is safe here
 * because three checks interlock: `only === null` kills the first,
 * `expected_step_ids` excludes full_only steps outside --full (killing the
 * second), and an abort always co-occurs with a FAIL record (killing the
 * third). Any of those verdicts is rejected outright below regardless.
 *
 * NOTE ON 'MISSING': that value is NEVER persisted — it is a console display
 * label only (pre-ship.mjs:907-909). On disk a missing-required step stays
 * SKIPPED_PRECONDITION with `required: true`. Testing for 'MISSING' here would
 * silently never match; we mirror isMissingRequired (:846-848) instead.
 *
 * @param {unknown} state parsed contents of artifacts/preship/last-run.json
 * @param {string} headSha the SHA being attested
 * @param {string} preshipSha256 sha256 of the scripts/pre-ship.mjs that ran
 * @returns {{ok: boolean, reasons: string[], payload: object|null}}
 */
export function assessState(state, headSha, preshipSha256) {
  const reasons = [];

  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return { ok: false, reasons: ['state file is not a JSON object'], payload: null };
  }

  const expected = state.expected_step_ids;
  if (!Array.isArray(expected) || expected.length === 0) {
    reasons.push(
      'state file has no expected_step_ids — it predates ENG-OPS-003.Gap13; re-run the gate'
    );
  }
  if (!Array.isArray(state.steps)) {
    reasons.push('state file has no steps[] array');
  }
  // Without either list there is nothing to re-derive from; stop here so the
  // caller gets the real reason instead of a cascade of derived complaints.
  if (reasons.length > 0) return { ok: false, reasons, payload: null };

  if (state.git_head !== headSha) {
    reasons.push(`state is stale: recorded HEAD ${state.git_head}, attesting ${headSha}`);
  }
  if (state.verdict !== 'PASS') {
    reasons.push(`pre-ship verdict was ${state.verdict}, not PASS`);
  }
  if (state.allow_missing === true) {
    reasons.push('run used PRESHIP_ALLOW_MISSING=1 — a required step never ran');
  }
  if (state.only !== null && state.only !== undefined) {
    const only = Array.isArray(state.only) ? state.only.join(',') : String(state.only);
    reasons.push(`run used --only=${only} — a subset gate cannot be attested`);
  }
  if (state.mode !== 'standard' && state.mode !== 'full') {
    reasons.push(`unrecognised pre-ship mode: ${state.mode}`);
  }

  const byId = new Map(state.steps.map((s) => [s?.id, s]));
  let ok = 0;
  for (const id of expected) {
    const rec = byId.get(id);
    if (!rec) {
      reasons.push(`step ${id} is missing from steps[]`);
      continue;
    }
    if (PASSING.has(rec.verdict)) {
      ok += 1;
      continue;
    }
    // A NON-required step whose precondition was unmet is an honest skip
    // (e.g. actionlint or terraform not installed). A REQUIRED one is not.
    if (rec.verdict === 'SKIPPED_PRECONDITION' && rec.required === false) {
      ok += 1;
      continue;
    }
    reasons.push(`step ${id} did not pass (${rec.verdict})`);
  }

  if (reasons.length > 0) return { ok: false, reasons, payload: null };

  return {
    ok: true,
    reasons: [],
    payload: {
      v: PAYLOAD_VERSION,
      sha: headSha,
      mode: state.mode,
      allow_missing: false,
      only: null,
      steps_ok: ok,
      steps_expected: expected.length,
      preship_sha256: preshipSha256,
      node: process.version,
      attested_at: new Date().toISOString(),
    },
  };
}

/**
 * Validate a payload read back from a published attestation.
 * @returns {string[]} reasons it is unacceptable (empty === acceptable)
 */
export function validatePayload(payload, sha, preshipSha256) {
  const reasons = [];
  if (!payload || typeof payload !== 'object') return ['attestation payload is not JSON'];
  if (payload.v !== PAYLOAD_VERSION) reasons.push(`unsupported payload version ${payload.v}`);
  if (payload.sha !== sha) reasons.push(`payload records sha ${payload.sha}, expected ${sha}`);
  if (payload.allow_missing !== false) {
    reasons.push('payload records allow_missing — a required step never ran');
  }
  if (payload.only !== null) reasons.push('payload records an --only subset run');
  if (payload.mode !== 'standard' && payload.mode !== 'full') {
    reasons.push(`payload records an unrecognised mode: ${payload.mode}`);
  }
  if (!(payload.steps_expected > 0) || payload.steps_ok !== payload.steps_expected) {
    reasons.push(`payload records ${payload.steps_ok}/${payload.steps_expected} steps passing`);
  }
  if (preshipSha256 && payload.preship_sha256 !== preshipSha256) {
    reasons.push(
      `payload preship_sha256 ${payload.preship_sha256} does not match the ` +
        `scripts/pre-ship.mjs in this checkout (${preshipSha256}) — the gate that ` +
        'produced the attestation is not the gate at this SHA'
    );
  }
  return reasons;
}

/** Extract the message body of a `git cat-file -p <tag>` dump. */
export function tagMessage(catFileOutput) {
  const idx = catFileOutput.indexOf('\n\n');
  return idx === -1 ? '' : catFileOutput.slice(idx + 2);
}

/**
 * Tracked paths that running the gate is EXPECTED to rewrite. `artifacts/` holds
 * the gate's own generated output — merged coverage, the a11y route reconcile
 * report — and several of those files are tracked, so a real pre-ship run always
 * leaves them modified. Treating that as a dirty tree would make --publish
 * unusable after every genuine run (found by dogfooding this tool on its own PR).
 *
 * Everything else still counts: the check exists to catch attesting a SHA whose
 * SOURCE differs from what the gate actually ran against.
 */
const GENERATED_PREFIXES = ['artifacts/'];

/**
 * Working-tree changes that invalidate an attestation.
 * @param {string} porcelain output of `git status --porcelain`
 * @returns {string[]} offending paths (empty === attestable)
 */
export function dirtyPaths(porcelain) {
  return porcelain
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      // "XY path" — and for renames, "XY old -> new". Take the destination.
      const p = l.slice(2).trim();
      const arrow = p.indexOf(' -> ');
      return arrow === -1 ? p : p.slice(arrow + 4);
    })
    .map((p) => p.replace(/^"|"$/g, '').replace(/\\/g, '/'))
    .filter((p) => !GENERATED_PREFIXES.some((prefix) => p.startsWith(prefix)));
}

// ─── CLI ──────────────────────────────────────────────────────────────────

const USAGE = `pre-ship attestation (ENG-OPS-003.Gap13, issue #644)

  node scripts/preship-attest.mjs --publish
      Publish an attestation for HEAD, if and only if artifacts/preship/last-run.json
      records a full-gate PASS for exactly this SHA.

  node scripts/preship-attest.mjs --verify --sha=<40-hex>
      Verify that <sha> has a published attestation. Exits 1 if it does not.

Options:
  --remote=<name|path>   default: $PRESHIP_ATTEST_REMOTE or "origin"
  --state=<path>         default: <repo>/artifacts/preship/last-run.json
  --preship-file=<path>  default: <repo>/scripts/pre-ship.mjs
  --help

This is an honesty gate, not a security boundary: it records that the gate ran
for a SHA. It does not prove it, and anyone with push access can forge it.
`;

function git(args, opts = {}) {
  return spawnSync('git', args, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    // Never block a non-interactive hook on a credential prompt: fail fast so
    // the warn-only caller can move on.
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    ...opts,
  });
}

function fail(lines) {
  for (const l of lines) process.stderr.write(`${l}\n`);
  process.exit(1);
}

function sha256File(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function main(argv) {
  const flags = {
    publish: false,
    verify: false,
    sha: null,
    remote: process.env.PRESHIP_ATTEST_REMOTE || 'origin',
    state: null,
    preshipFile: null,
  };

  for (const a of argv) {
    if (a === '--publish') flags.publish = true;
    else if (a === '--verify') flags.verify = true;
    else if (a === '--help' || a === '-h') {
      process.stdout.write(USAGE);
      return 0;
    } else if (a.startsWith('--sha=')) flags.sha = a.slice(6).trim();
    else if (a.startsWith('--remote=')) flags.remote = a.slice(9);
    else if (a.startsWith('--state=')) flags.state = a.slice(8);
    else if (a.startsWith('--preship-file=')) flags.preshipFile = a.slice(15);
    else {
      process.stderr.write(`Unknown argument: ${a}\n\n${USAGE}`);
      return 2;
    }
  }

  if (flags.publish === flags.verify) {
    process.stderr.write(`Specify exactly one of --publish or --verify.\n\n${USAGE}`);
    return 2;
  }

  const top = git(['rev-parse', '--show-toplevel']);
  if (top.status !== 0) {
    process.stderr.write('Not inside a git repository.\n');
    return 2;
  }
  const repoRoot = top.stdout.trim().replace(/\\/g, '/');
  const statePath = flags.state || path.join(repoRoot, 'artifacts/preship/last-run.json');
  const preshipFile = flags.preshipFile || path.join(repoRoot, 'scripts/pre-ship.mjs');

  return flags.publish
    ? doPublish(flags, repoRoot, statePath, preshipFile)
    : doVerify(flags, preshipFile);
}

function doPublish(flags, repoRoot, statePath, preshipFile) {
  const head = git(['rev-parse', 'HEAD']).stdout.trim();

  const dirty = dirtyPaths(git(['status', '--porcelain']).stdout);
  if (dirty.length > 0) {
    fail([
      'REFUSED: the working tree has uncommitted source changes, so the gate did',
      `  not run against ${head.slice(0, 9)} as committed:`,
      ...dirty.slice(0, 10).map((p) => `    ${p}`),
      ...(dirty.length > 10 ? [`    ...and ${dirty.length - 10} more`] : []),
      '  Commit (or set aside) your changes, re-run: pnpm run pre-ship',
    ]);
  }

  let state;
  try {
    state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch (err) {
    fail([
      `REFUSED: cannot read a pre-ship result from ${statePath}`,
      `  (${err.code === 'ENOENT' ? 'no such file' : 'malformed JSON'})`,
      '  Run the gate first: pnpm run pre-ship',
    ]);
    return 1; // unreachable; keeps control flow explicit
  }

  let preshipSha256;
  try {
    preshipSha256 = sha256File(preshipFile);
  } catch {
    fail([`REFUSED: cannot read ${preshipFile} to pin the gate version.`]);
    return 1;
  }

  const { ok, reasons, payload } = assessState(state, head, preshipSha256);
  if (!ok) {
    fail([
      `REFUSED: ${head.slice(0, 9)} has no attestable pre-ship result:`,
      ...reasons.map((r) => `  - ${r}`),
      '',
      '  An attestation may only be published for a full, clean gate run at this',
      '  exact SHA. Re-run: pnpm run pre-ship',
    ]);
  }

  const ref = ATTEST_REF_PREFIX + head;

  // Already published? Never force-overwrite someone else's record: report and
  // stop. This also makes --publish idempotent (re-running the gate at the same
  // HEAD must not fail the push).
  const existing = git(['ls-remote', flags.remote, ref]);
  if (existing.status === 0 && existing.stdout.trim() !== '') {
    const obj = existing.stdout.trim().split(/\s+/)[0];
    process.stdout.write(
      `pre-ship attestation already published for ${head.slice(0, 9)} (${obj.slice(0, 9)}).\n`
    );
    return 0;
  }

  const tmpTag = '_preship-attest-tmp';
  const tag = git(['tag', '-a', '-f', '-F', '-', tmpTag, head], {
    input: JSON.stringify(payload, null, 2) + '\n',
  });
  if (tag.status !== 0) {
    fail(['REFUSED: could not create the attestation tag object.', tag.stderr.trim()]);
  }
  const obj = git(['rev-parse', tmpTag]).stdout.trim();

  const push = git(['push', flags.remote, `${obj}:${ref}`]);
  git(['tag', '-d', tmpTag]); // local scratch tag; harmless if it fails

  if (push.status !== 0) {
    fail([
      `REFUSED: could not publish the attestation to ${flags.remote}.`,
      push.stderr.trim(),
      '  Retry after the push completes: pnpm preship:attest',
    ]);
  }

  process.stdout.write(
    `pre-ship attestation published for ${head.slice(0, 9)} ` +
      `(${payload.mode}, ${payload.steps_ok}/${payload.steps_expected} steps).\n`
  );
  return 0;
}

function doVerify(flags, preshipFile) {
  const sha = flags.sha;
  if (!sha || !/^[0-9a-f]{40}$/i.test(sha)) {
    process.stderr.write(`--verify requires --sha=<40-hex-character sha>, got: ${sha}\n`);
    return 2;
  }
  const ref = ATTEST_REF_PREFIX + sha;

  const ls = git(['ls-remote', flags.remote, ref]);
  if (ls.status !== 0) {
    fail([`Could not query ${flags.remote} for ${ref}.`, ls.stderr.trim()]);
  }
  if (ls.stdout.trim() === '') {
    fail([
      `NO PRE-SHIP ATTESTATION for ${sha}.`,
      '',
      '  No local pre-ship run has been recorded against this exact commit. This',
      '  is usually because the head moved server-side (gh pr update-branch /',
      '  the "Update branch" button) after the last local gate run.',
      '',
      '  To fix, from a checkout of this branch:',
      `    git fetch origin && git checkout ${sha.slice(0, 9)}`,
      '    pnpm run pre-ship',
      '    pnpm preship:attest',
      '  then re-run this check.',
      '',
      '  See docs/runbooks/preship-attestation.md.',
    ]);
  }

  const obj = ls.stdout.trim().split(/\s+/)[0];

  // Bring the object into the local store so cat-file can read it.
  const fetched = git(['fetch', '--quiet', flags.remote, ref]);
  if (fetched.status !== 0) {
    fail([`Could not fetch ${ref} from ${flags.remote}.`, fetched.stderr.trim()]);
  }

  const type = git(['cat-file', '-t', obj]).stdout.trim();
  if (type !== 'tag') {
    fail([
      `Attestation for ${sha} is a ${type || 'unknown'} object, not an annotated tag.`,
      '  Only tag objects carry the run payload. Re-publish: pnpm preship:attest',
    ]);
  }

  const dump = git(['cat-file', '-p', obj]).stdout;
  const target = /^object ([0-9a-f]{40})$/m.exec(dump)?.[1];
  if (target !== sha) {
    fail([
      `Attestation for ${sha} points at a different commit (${target}).`,
      '  The record does not describe the commit under test. Refusing.',
    ]);
  }

  let payload;
  try {
    payload = JSON.parse(tagMessage(dump));
  } catch {
    fail([`Attestation payload for ${sha} is not valid JSON.`]);
  }

  let preshipSha256 = null;
  try {
    preshipSha256 = sha256File(preshipFile);
  } catch {
    // Verifying outside a checkout that has the gate script: skip the pin
    // rather than fail on an unrelated cause. Loud, so it is never silent.
    process.stdout.write(`note: ${preshipFile} not readable — gate-version pin not checked.\n`);
  }

  const reasons = validatePayload(payload, sha, preshipSha256);
  if (reasons.length > 0) {
    fail([
      `Attestation for ${sha} does not record a full clean gate:`,
      ...reasons.map((r) => `  - ${r}`),
      '',
      '  Re-run the gate at this SHA and re-publish: pnpm run pre-ship && pnpm preship:attest',
    ]);
  }

  process.stdout.write(
    `pre-ship attestation OK for ${sha.slice(0, 9)}: ${payload.mode} gate, ` +
      `${payload.steps_ok}/${payload.steps_expected} steps, attested ${payload.attested_at}.\n`
  );
  return 0;
}

// Only run the CLI when executed directly, so tests can import the pure helpers.
const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]).endsWith('preship-attest.mjs');
if (invokedDirectly) {
  process.exit(main(process.argv.slice(2)));
}
