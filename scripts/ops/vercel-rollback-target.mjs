/**
 * Resolve and verify the target of a Vercel Instant Rollback.
 *
 * Used by .github/workflows/vercel-rollback.yml. Two subcommands:
 *
 *   resolve  read the project's current production deployment and the
 *            rollback target from the Vercel REST API, print a summary, and
 *            export `current_id`, `target_id`, `target_url` for later steps.
 *   verify   after `vercel rollback`, re-read the project and fail unless the
 *            production deployment now is the target.
 *
 * All configuration comes from environment variables; the token is never
 * printed. Everything except the CLI entry point is a pure or injectable
 * function so it can be unit tested without the network.
 *
 * API references (checked 2026-10-05):
 *   GET /v7/deployments         https://vercel.com/docs/rest-api/deployments/list-deployments
 *   GET /v9/projects/{id}       `targets.production` is the deployment that is live
 *   vercel rollback <url|id>    https://vercel.com/docs/cli/rollback
 */
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const API = 'https://api.vercel.com';

/**
 * Reduce a deployment URL or id to the form the API returns: a bare host or a
 * `dpl_` id. Returns '' for blank input.
 *
 * @param {string | undefined | null} ref
 * @returns {string}
 */
export function normalizeRef(ref) {
  let out = String(ref ?? '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .toLowerCase();
  while (out.endsWith('/')) out = out.slice(0, -1);
  return out;
}

/**
 * @param {{ uid?: string, url?: string }} deployment
 * @param {string} ref normalized via {@link normalizeRef}
 */
export function matchesRef(deployment, ref) {
  return (
    normalizeRef(deployment.uid) === ref ||
    (!!deployment.url && normalizeRef(deployment.url) === ref)
  );
}

/**
 * A deployment is a valid rollback target when it is a READY production
 * deployment that Vercel has not flagged as unusable for Instant Rollback.
 *
 * @param {{ state?: string, target?: string | null, isRollbackCandidate?: boolean | null }} d
 */
export function isEligible(d) {
  return d.state === 'READY' && d.target === 'production' && d.isRollbackCandidate !== false;
}

/**
 * Pick the deployment to roll back to.
 *
 * @param {object} args
 * @param {Array<object>} args.deployments production deployments, newest first
 * @param {string} args.currentId id of the deployment that is live now
 * @param {string} [args.target] explicit deployment URL or id; empty = automatic
 * @returns {object} the chosen deployment
 */
export function pickRollbackTarget({ deployments, currentId, target }) {
  const ref = normalizeRef(target);
  if (ref) {
    const found = deployments.find((d) => matchesRef(d, ref));
    if (!found) {
      throw new Error(
        `Target "${ref}" is not among the recent production deployments of this project ` +
          `(${deployments.length} inspected). It may belong to another project, be a preview, or be too old.`
      );
    }
    if (found.uid === currentId) {
      throw new Error(`Target "${ref}" is already the current production deployment.`);
    }
    if (!isEligible(found)) {
      throw new Error(
        `Target "${ref}" is not a READY production deployment eligible for Instant Rollback ` +
          `(state=${found.state}, target=${found.target}, isRollbackCandidate=${found.isRollbackCandidate}).`
      );
    }
    return found;
  }
  const candidate = deployments.find((d) => d.uid !== currentId && isEligible(d));
  if (!candidate) {
    throw new Error(
      `No rollback candidate: none of the ${deployments.length} recent production deployments ` +
        'is READY, eligible, and different from the current one.'
    );
  }
  return candidate;
}

/**
 * Parse a "true"/"false" workflow input. Anything other than an explicit
 * "false" keeps the safe default (dry run).
 *
 * @param {string | undefined} value
 */
export function parseDryRun(value) {
  return (
    String(value ?? '')
      .trim()
      .toLowerCase() !== 'false'
  );
}

/** @param {string} text */
/**
 * A value made safe for a log line: control characters (CR/LF included) are
 * replaced, then the result is JSON-encoded, so input such as a dispatch
 * `reason` or an API-returned id cannot forge or split log lines.
 * @param {unknown} value
 */
export function forLog(value) {
  let clean = '';
  for (const ch of String(value ?? '')) {
    const code = ch.codePointAt(0) ?? 0;
    clean += code < 0x20 || (code >= 0x7f && code <= 0x9f) ? ' ' : ch;
  }
  return JSON.stringify(clean);
}

function cell(text) {
  return String(text ?? '')
    .replace(/\r?\n/g, ' ')
    .replace(/\|/g, '\\|')
    .replace(/[<>]/g, '')
    .slice(0, 200);
}

/** @param {object | undefined} d */
function describe(d) {
  const meta = d?.meta ?? {};
  return {
    id: d?.uid ?? '',
    url: d?.url ? `https://${d.url}` : '',
    createdAt: d?.createdAt ? new Date(d.createdAt).toISOString() : '',
    sha: meta.githubCommitSha ?? '',
    message: meta.githubCommitMessage ?? '',
  };
}

/**
 * Markdown for $GITHUB_STEP_SUMMARY. Commit messages are untrusted text, so
 * every cell is flattened and escaped.
 *
 * @param {{ current: object, target: object, reason: string, actor: string, dryRun: boolean }} args
 */
export function renderSummary({ current, target, reason, actor, dryRun }) {
  const c = describe(current);
  const t = describe(target);
  const row = (label, cur, tgt) => `| ${label} | ${cell(cur)} | ${cell(tgt)} |`;
  return [
    `## Vercel rollback ${dryRun ? '(dry run, nothing changed)' : '(LIVE)'}`,
    '',
    '| | Current production | Rollback target |',
    '|---|---|---|',
    row('Deployment id', c.id, t.id),
    row('URL', c.url, t.url),
    row('Created', c.createdAt, t.createdAt),
    row('Git SHA', c.sha, t.sha),
    row('Commit message', c.message, t.message),
    '',
    `- Reason: ${cell(reason)}`,
    `- Actor: ${cell(actor)}`,
    `- Dry run: ${dryRun}`,
    '',
    dryRun
      ? 'Re-run with `dry_run` set to false to perform the rollback.'
      : `To undo: \`vercel promote ${c.id}\` (or run this workflow again targeting ${c.id}).`,
    '',
  ].join('\n');
}

/**
 * GET a Vercel API path and return parsed JSON. The token goes in a header
 * only; error messages carry the status, never the request headers.
 *
 * @param {string} pathAndQuery
 * @param {string} token
 * @param {typeof fetch} fetchImpl
 */
export async function apiGet(pathAndQuery, token, fetchImpl = fetch) {
  const res = await fetchImpl(`${API}${pathAndQuery}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Vercel API ${pathAndQuery.split('?')[0]} failed with HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Read the project's live production deployment id and its recent READY
 * production deployments.
 *
 * @param {{ token: string, projectId: string, teamId: string, fetchImpl?: typeof fetch }} args
 */
export async function loadState({ token, projectId, teamId, fetchImpl }) {
  const team = `teamId=${encodeURIComponent(teamId)}`;
  const project = await apiGet(
    `/v9/projects/${encodeURIComponent(projectId)}?${team}`,
    token,
    fetchImpl
  );
  const currentId = project?.targets?.production?.id;
  if (!currentId) {
    throw new Error('Project has no live production deployment (targets.production is empty).');
  }
  const query = `projectId=${encodeURIComponent(projectId)}&${team}&target=production&state=READY&limit=20`;
  const list = await apiGet(`/v7/deployments?${query}`, token, fetchImpl);
  return { currentId, deployments: list?.deployments ?? [] };
}

/** @param {Record<string, string | undefined>} env */
function readConfig(env) {
  const missing = ['VERCEL_TOKEN', 'VERCEL_PROJECT_ID', 'VERCEL_ORG_ID', 'ROLLBACK_REASON'].filter(
    (k) => !env[k]?.trim()
  );
  if (missing.length) {
    throw new Error(`Missing required environment: ${missing.join(', ')}`);
  }
  return {
    token: env.VERCEL_TOKEN,
    projectId: env.VERCEL_PROJECT_ID,
    teamId: env.VERCEL_ORG_ID,
    reason: env.ROLLBACK_REASON.trim(),
    target: env.ROLLBACK_TARGET ?? '',
    actor: env.GITHUB_ACTOR ?? 'unknown',
    dryRun: parseDryRun(env.DRY_RUN),
  };
}

/**
 * @param {string | undefined} file
 * @param {string} text
 */
function appendTo(file, text) {
  if (file) fs.appendFileSync(file, text);
}

/**
 * `resolve` subcommand.
 *
 * @param {Record<string, string | undefined>} env
 * @param {{ fetchImpl?: typeof fetch, log?: (s: string) => void }} [deps]
 */
export async function runResolve(env, { fetchImpl, log = console.log } = {}) {
  const cfg = readConfig(env);
  const { currentId, deployments } = await loadState({ ...cfg, fetchImpl });
  const current = deployments.find((d) => d.uid === currentId) ?? { uid: currentId };
  const target = pickRollbackTarget({ deployments, currentId, target: cfg.target });
  const summary = renderSummary({
    current,
    target,
    reason: cfg.reason,
    actor: cfg.actor,
    dryRun: cfg.dryRun,
  });
  appendTo(env.GITHUB_STEP_SUMMARY, summary);
  appendTo(
    env.GITHUB_OUTPUT,
    `current_id=${currentId}\ntarget_id=${target.uid}\ntarget_url=${target.url}\n`
  );
  log(forLog(summary));
  return { currentId, target, dryRun: cfg.dryRun };
}

/**
 * `verify` subcommand: production must now be the target.
 *
 * @param {Record<string, string | undefined>} env
 * @param {{ fetchImpl?: typeof fetch, log?: (s: string) => void, sleep?: (ms: number) => Promise<void>, attempts?: number }} [deps]
 */
export async function runVerify(env, deps = {}) {
  const {
    fetchImpl,
    log = console.log,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
    attempts = 6,
  } = deps;
  const cfg = readConfig(env);
  const expected = env.EXPECTED_ID;
  if (!expected) throw new Error('Missing required environment: EXPECTED_ID');
  let seen = '';
  for (let i = 1; i <= attempts; i++) {
    const { currentId } = await loadState({ ...cfg, fetchImpl });
    seen = currentId;
    if (currentId === expected) {
      log(`Verified: production now serves ${forLog(expected)}.`);
      return true;
    }
    log(
      `Attempt ${i}/${attempts}: production is ${forLog(currentId)}, expected ${forLog(expected)}.`
    );
    if (i < attempts) await sleep(10_000);
  }
  throw new Error(
    `Rollback NOT verified: production is ${forLog(seen)}, expected ${forLog(expected)}.`
  );
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const cmd = argv[0];
  if (cmd === 'resolve') return runResolve(env);
  if (cmd === 'verify') return runVerify(env);
  throw new Error('Usage: vercel-rollback-target.mjs <resolve|verify>');
}

/* istanbul ignore next -- process entry point; main() is unit tested */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`::error::${String(err.message).replace(/\r?\n/g, ' ')}`);
    process.exit(1);
  });
}
