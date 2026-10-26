#!/usr/bin/env node
// Apply the production SLOs in infra/monitoring/grafana/cloud/slos.json to the
// Grafana Cloud stack through the SLO plugin API (ENV-008-AI, ADR-087).
//
// The committed JSON is the source of truth. Each SLO has a fixed uuid, so a
// run reads it by uuid and then creates it (POST) or replaces it (PUT); names
// can change without creating duplicates. Burn-rate alerting comes from each
// SLO's own `alerting` block.
//
// Usage (CI: .github/workflows/grafana-slos.yml):
//   GRAFANA_URL=https://<stack>.grafana.net GRAFANA_SA_TOKEN=<service account token> \
//     node tools/scripts/observability/apply-grafana-slos.mjs [--dry-run]
// The token is read from the environment only and is never printed.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApiClient, redactBody, requireEnv } from '../lib/grafana-provisioning.mjs';

const CONFIG_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'infra',
  'monitoring',
  'grafana',
  'cloud',
  'slos.json'
);
const SLO_API = '/api/plugins/grafana-slo-app/resources/v1/slo';

// Each uuid becomes a URL path segment (see run()); this charset keeps a
// slash, dot-dot or query string from retargeting the request.
const SAFE_PATH_SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;
const REQUIRED = ['uuid', 'name', 'description', 'query', 'objectives'];

/** Every PromQL string an SLO carries, whatever its query type. */
function queriesOf(slo) {
  const q = slo.query ?? {};
  if (q.type === 'freeform') return [q.freeform?.query ?? ''];
  if (q.type === 'ratio')
    return [
      q.ratio?.successMetric?.prometheusMetric ?? '',
      q.ratio?.totalMetric?.prometheusMetric ?? '',
    ];
  return [];
}

/** Every `[...]` range selector in a PromQL string, brackets included. */
function rangesOf(query) {
  const ranges = [];
  for (let open = query.indexOf('['); open !== -1; open = query.indexOf('[', open + 1)) {
    const close = query.indexOf(']', open);
    if (close === -1) break;
    ranges.push(query.slice(open, close + 1));
  }
  return ranges;
}

function checkQuery(problems, id, slo) {
  if (!['ratio', 'freeform'].includes(slo.query.type)) {
    problems.push(`${id}: query.type must be ratio or freeform`);
    return;
  }
  for (const q of queriesOf(slo)) {
    if (!q) problems.push(`${id}: empty query`);
    // Production has native histograms only; a _bucket series never exists.
    if (q.includes('_bucket')) problems.push(`${id}: query uses a _bucket series`);
    // A fixed range breaks at other evaluation intervals.
    if (rangesOf(q).some((r) => r !== '[$__rate_interval]'))
      problems.push(`${id}: ranges must be [$__rate_interval]`);
  }
}

/** Validate the SLO file before touching the API. Returns a list of problems. */
export function validateConfig(config) {
  const problems = [];
  // Without these, JSON.stringify drops the field and Grafana gets an empty folder.
  for (const key of ['folderUid', 'destinationDatasourceUid']) {
    if (typeof config[key] !== 'string' || config[key] === '') problems.push(`${key}: required`);
  }
  if (!Array.isArray(config.slos) || config.slos.length === 0)
    problems.push('slos: at least one SLO is required');
  const seen = new Set();
  for (const slo of config.slos ?? []) {
    const id = slo.uuid ?? '?';
    const missing = REQUIRED.filter((key) => slo[key] === undefined || slo[key] === '');
    for (const key of missing) problems.push(`${id}: missing ${key}`);
    if (slo.uuid !== undefined && !SAFE_PATH_SEGMENT.test(slo.uuid))
      problems.push(`uuid: must match ${SAFE_PATH_SEGMENT} (got ${JSON.stringify(slo.uuid)})`);
    if (slo.query) checkQuery(problems, id, slo);
    if (seen.has(slo.uuid)) problems.push(`${id}: duplicate uuid`);
    seen.add(slo.uuid);
  }
  return problems;
}

/** The SLO plugin payload: the committed SLO plus where it lives and writes. */
function buildSloPayload(slo, config) {
  return {
    ...slo,
    folder: { uid: config.folderUid },
    destinationDatasource: { uid: config.destinationDatasourceUid },
  };
}

export async function run({
  env = process.env,
  argv = process.argv,
  fetchImpl = fetch,
  log = console.log,
  sleep,
} = {}) {
  const dryRun = argv.includes('--dry-run');
  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));

  const problems = validateConfig(config);
  if (problems.length) throw new Error(`SLO file invalid:\n  ${problems.join('\n  ')}`);
  requireEnv(env, ['GRAFANA_URL', 'GRAFANA_SA_TOKEN']);
  const api = createApiClient(env.GRAFANA_URL, env.GRAFANA_SA_TOKEN, fetchImpl, { sleep });

  let created = 0;
  let updated = 0;
  for (const slo of config.slos) {
    const existing = await api('GET', `${SLO_API}/${slo.uuid}`);
    if (existing.status !== 200 && existing.status !== 404) {
      throw new Error(`read ${slo.uuid}: HTTP ${existing.status}`);
    }
    const exists = existing.status === 200;
    if (dryRun) {
      log(`${slo.uuid}: ${exists ? 'present (would update)' : 'missing (would create)'}`);
      continue;
    }
    const payload = buildSloPayload(slo, config);
    const res = exists
      ? await api('PUT', `${SLO_API}/${slo.uuid}`, payload)
      : await api('POST', SLO_API, payload);
    if (res.status >= 300)
      throw new Error(`${slo.uuid}: HTTP ${res.status} ${redactBody(res.text)}`);
    // The uuid is how the next run finds this SLO. If Grafana stored it under
    // another one, every later run would create a duplicate and stay green.
    const storedUuid = res.json?.uuid;
    if (!exists && storedUuid !== undefined && storedUuid !== slo.uuid)
      throw new Error(`${slo.uuid}: created under uuid ${redactBody(String(storedUuid))}`);
    // A reply may name no uuid at all, so read the SLO back by the one we sent.
    if (!exists) {
      const readBack = await api('GET', `${SLO_API}/${slo.uuid}`);
      if (readBack.status !== 200)
        throw new Error(
          `${slo.uuid}: not found under its uuid after create (HTTP ${readBack.status})`
        );
    }
    log(`${exists ? 'updated' : 'created'} ${slo.uuid}`);
    if (exists) updated += 1;
    else created += 1;
  }
  if (dryRun) log(`dry run: ${config.slos.length} SLO(s) valid; writes nothing`);
  return { created, updated, dryRun };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  run().catch((err) => {
    console.error(`[grafana-slos] ${err.message}`);
    process.exit(1);
  });
}
