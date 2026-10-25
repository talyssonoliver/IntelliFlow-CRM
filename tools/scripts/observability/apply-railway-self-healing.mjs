#!/usr/bin/env node
// Read, and with --apply set, the self-healing settings of the Railway
// production services api and ai-worker (ENV-008-AI, ADR-087, owner ruling 2:
// applied by CI on merge).
//
// Self-healing here means two Railway settings, nothing more:
//   - restartPolicyType ON_FAILURE: Railway restarts a process that crashes
//     (not one that hangs);
//   - a deploy health check: a deployment whose health path does not answer
//     never takes traffic. It is a deploy gate, not a liveness probe.
//
// The script never deploys or redeploys. Changed settings take effect from the
// next deployment. Before it sets the api health check it requires a live 200
// from <PRODUCTION_API_URL>/api/health/live, because a wrong path would make
// the next production deploy fail (lane-lead guard, 2026-10-25).
//
// Self-contained on purpose (no tools/scripts/lib import), so its workflow can
// sparse-check-out this folder only.
//
// Usage (CI: .github/workflows/railway-self-healing.yml):
//   RAILWAY_API_TOKEN=<token> RAILWAY_PROJECT_ID=<id> PRODUCTION_API_URL=<url> \
//     node tools/scripts/observability/apply-railway-self-healing.mjs [--apply]
// Only service names, field names and setting values are printed: never the
// token, an ID, a variable value or the api host.
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const GRAPHQL_URL = 'https://backboard.railway.com/graphql/v2';
const USER_AGENT = 'ifc-env008/1.0';
const PROBE_PATH = '/api/health/live';
const PROBE_TIMEOUT_MS = 15000;
const ALLOWED_ERROR_MESSAGES = new Set(['Not Authorized', 'Problem processing request']);

/** The settings CI owns. Changing a value here changes production on merge. */
export const DESIRED = {
  api: {
    restartPolicyType: 'ON_FAILURE',
    restartPolicyMaxRetries: 10,
    healthcheckPath: '/api/health/live',
    healthcheckTimeout: 120,
  },
  'ai-worker': { restartPolicyType: 'ON_FAILURE', restartPolicyMaxRetries: 10 },
};
const AI_WORKER_HEALTHCHECK_PATH = '/health/live';
const AI_WORKER_DEFAULT_HEALTH_PORT = '5000';

/** The DESIRED keys whose current value differs, with their desired values. */
export function diffFields(current, desired) {
  return Object.fromEntries(
    Object.entries(desired).filter(([key, value]) => (current?.[key] ?? null) !== value)
  );
}

/**
 * Railway probes the service's PORT. ai-worker serves health on HEALTH_PORT
 * (default 5000), so a health path is only safe when the two are the same port.
 */
export function aiWorkerHealthcheck(vars) {
  if (vars === null || vars === undefined) return { set: false, reason: 'variables unreadable' };
  const healthPort = vars.HEALTH_PORT ?? AI_WORKER_DEFAULT_HEALTH_PORT;
  if (vars.PORT !== undefined && vars.PORT === healthPort) return { set: true };
  return { set: false, reason: 'ai-worker serves health on HEALTH_PORT != PORT' };
}

const QUERIES = {
  project: `query project($id: String!) {
  project(id: $id) {
    environments { edges { node { id name } } }
    services { edges { node { id name } } }
  }
}`,
  serviceInstance: `query serviceInstance($serviceId: String!, $environmentId: String!) {
  serviceInstance(serviceId: $serviceId, environmentId: $environmentId) {
    restartPolicyType restartPolicyMaxRetries healthcheckPath healthcheckTimeout
  }
}`,
  variables: `query variables($projectId: String!, $environmentId: String!, $serviceId: String!) {
  variables(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId)
}`,
  serviceInstanceUpdate: `mutation serviceInstanceUpdate($serviceId: String!, $environmentId: String!, $input: ServiceInstanceUpdateInput!) {
  serviceInstanceUpdate(serviceId: $serviceId, environmentId: $environmentId, input: $input)
}`,
};

/** A GraphQL error reduced to its code and, if allow-listed, its message. */
function describeError(op, error) {
  const code = error?.extensions?.code ?? 'UNKNOWN';
  const message = ALLOWED_ERROR_MESSAGES.has(error?.message) ? error.message : '<redacted>';
  return `railway ${op}: ${code} ${message}`;
}

function createGraphqlClient(token, fetchImpl) {
  return async (op, variables, { soft = false } = {}) => {
    const res = await fetchImpl(GRAPHQL_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
      },
      body: JSON.stringify({ query: QUERIES[op], variables }),
    });
    let json;
    try {
      json = JSON.parse(await res.text());
    } catch {
      json = undefined;
    }
    const error = json?.errors?.[0];
    if (res.status === 200 && !error && json?.data) return json.data[op];
    if (soft) return null;
    if (error) throw new Error(describeError(op, error));
    throw new Error(`railway ${op}: HTTP ${res.status}`);
  };
}

/** GET the live api health path; resolves to null on a 200, else a fixed-word reason. */
async function probeApi(baseUrl, fetchImpl) {
  if (!baseUrl) return 'no url';
  let end = baseUrl.length;
  while (end > 0 && baseUrl[end - 1] === '/') end -= 1;
  try {
    const res = await fetchImpl(`${baseUrl.slice(0, end)}${PROBE_PATH}`, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (res.status === 200) return null;
    if (res.status >= 300 && res.status < 400) return 'redirect';
    return `HTTP ${res.status}`;
  } catch (err) {
    return err?.name === 'TimeoutError' || err?.name === 'AbortError' ? 'timeout' : 'network error';
  }
}

const show = (value) => (value === null || value === undefined ? 'none' : String(value));

function defaultWriteSummary(text) {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
}

/** Only PORT and HEALTH_PORT are kept; every other variable is dropped unread. */
async function readPorts(gql, projectId, environmentId, serviceId) {
  const vars = await gql('variables', { projectId, environmentId, serviceId }, { soft: true });
  if (!vars || typeof vars !== 'object') return null;
  return { PORT: vars.PORT, HEALTH_PORT: vars.HEALTH_PORT };
}

function findByName(edges, name, kind) {
  const node = (edges ?? []).map((e) => e.node).find((n) => n.name === name);
  if (!node) throw new Error(`${kind} ${name} not found`);
  return node.id;
}

export async function run({
  env = process.env,
  argv = process.argv,
  fetchImpl = fetch,
  log = console.log,
  writeSummary = defaultWriteSummary,
} = {}) {
  const apply = argv.includes('--apply');
  if (!env.RAILWAY_API_TOKEN || !env.RAILWAY_PROJECT_ID) {
    throw new Error('RAILWAY_API_TOKEN and RAILWAY_PROJECT_ID are required');
  }
  const gql = createGraphqlClient(env.RAILWAY_API_TOKEN, fetchImpl);

  const project = await gql('project', { id: env.RAILWAY_PROJECT_ID });
  const environmentId = findByName(project?.environments?.edges, 'production', 'environment');
  // Resolve both services before any write, so a missing one changes nothing.
  const serviceIds = Object.fromEntries(
    Object.keys(DESIRED).map((name) => [
      name,
      findByName(project?.services?.edges, name, 'service'),
    ])
  );

  const rows = [];
  const notes = [];
  const note = (line) => {
    notes.push(line);
    log(line);
  };
  let probeFailure = null;
  log(`mode: ${apply ? 'apply' : 'read-only'}`);
  log('service | field | before | after');

  for (const [name, serviceId] of Object.entries(serviceIds)) {
    const current = await gql('serviceInstance', { serviceId, environmentId });
    const desired = { ...DESIRED[name] };
    if (name === 'ai-worker') {
      const ports = await readPorts(gql, env.RAILWAY_PROJECT_ID, environmentId, serviceId);
      const check = aiWorkerHealthcheck(ports);
      if (check.set) desired.healthcheckPath = AI_WORKER_HEALTHCHECK_PATH;
      else note(`healthcheck skipped: ${check.reason}`);
    }
    const diff = diffFields(current, desired);

    if (name === 'api' && 'healthcheckPath' in diff) {
      const reason = await probeApi(env.PRODUCTION_API_URL, fetchImpl);
      if (reason) {
        const line = `api ${PROBE_PATH} probe returned ${reason}`;
        if (apply) {
          delete diff.healthcheckPath;
          delete diff.healthcheckTimeout;
          probeFailure = `healthcheck skipped: ${line}`;
          note(probeFailure);
        } else {
          note(`healthcheck would be skipped: ${line}`);
        }
      }
    }

    for (const field of Object.keys(desired)) {
      const after = !apply || field in diff ? desired[field] : current?.[field];
      const row = `${name} | ${field} | ${show(current?.[field])} | ${show(after)}`;
      rows.push(row);
      log(row);
    }

    if (apply && Object.keys(diff).length > 0) {
      await gql('serviceInstanceUpdate', { serviceId, environmentId, input: diff });
      const readBack = await gql('serviceInstance', { serviceId, environmentId });
      // Compare only what was sent: a skipped field is expected to differ.
      for (const [key, value] of Object.entries(diff)) {
        if ((readBack?.[key] ?? null) !== value)
          throw new Error(`read-back mismatch: ${name}.${key}`);
      }
    }
  }

  const effective = apply
    ? 'Changed settings are effective from the next deployment; this job never redeploys.'
    : 'Read-only run: nothing was changed. Settings set by --apply are effective from the next deployment.';
  log(effective);
  const retry = probeFailure
    ? [
        '',
        'The api health check was not set. It is retried only by a push that changes this workflow or its script, or by a manual run with apply ticked.',
      ]
    : [];
  writeSummary(
    [
      `## Railway self-healing (${apply ? 'apply' : 'read-only'})`,
      '',
      'service | field | before | after',
      '--- | --- | --- | ---',
      ...rows,
      '',
      ...notes,
      ...(notes.length ? [''] : []),
      effective,
      ...retry,
      '',
    ].join('\n')
  );

  if (probeFailure) throw new Error(probeFailure);
  return { applied: apply, notes };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  run().catch((err) => {
    console.error(`[railway-self-healing] ${err.message}`);
    process.exit(1);
  });
}
