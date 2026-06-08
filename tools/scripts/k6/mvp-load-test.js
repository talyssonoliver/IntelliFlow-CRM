/**
 * MVP load test — honest, realistic budget (ADR-018).
 *
 * Replaces the aspirational "1,000 concurrent users" framing (IFC-007 acceptance
 * text, which was marked Completed by artifact-existence only and NEVER measured —
 * see docs/operations/runbooks/load-testing-local.md) with the documented
 * ADR-018 "Performance and Load Testing Strategy" budget:
 *
 *     throughput ~5,000 leads/hour, p95 < 200ms, error rate < 0.1%.
 *
 * This runs LOCALLY against a configurable target (default localhost). It is NOT a
 * 1,000-VU production ramp — the MVP infra (Supabase pooler pool_size 15, Realtime
 * ~200, Hobby plans) cannot sustain that, and a single laptop cannot generate it.
 * A true high-concurrency validation belongs to IFC-047 (Sprint 22) on k6 Cloud /
 * distributed runners.
 *
 * Usage:
 *   # validate the SLO at the steady-state budget
 *   BASE_URL=http://localhost:3000 k6 run tools/scripts/k6/mvp-load-test.js
 *
 *   # push above the SLO to find local headroom / the breaking point
 *   TARGET_RPS=20 DURATION=2m k6 run tools/scripts/k6/mvp-load-test.js
 *
 * @task issue #318 (caveat 2), ADR-018, IFC-007 (reframe), IFC-047 (real impl)
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
// ADR-018 budget: 5,000 leads/hour ≈ 1.4 req/s steady state. Override TARGET_RPS to
// push above the SLO and discover the headroom / breaking point locally.
const TARGET_RPS = Number(__ENV.TARGET_RPS || 2);
const DURATION = __ENV.DURATION || '1m';
// Health path differs by target (Next.js web vs the API server) — override as needed.
const HEALTH_PATH = __ENV.HEALTH_PATH || '/health';

const errorRate = new Rate('errors');

export const options = {
  scenarios: {
    mvp_steady: {
      executor: 'constant-arrival-rate',
      rate: TARGET_RPS,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: Math.max(10, TARGET_RPS * 5),
      maxVUs: Math.max(50, TARGET_RPS * 20),
    },
  },
  // ADR-018 budgets. abortOnFail is belt-and-suspenders: if this is ever pointed at
  // a non-local target, the run stops the moment the error or latency budget blows,
  // so a misfire can't sustain damage.
  thresholds: {
    http_req_duration: [{ threshold: 'p(95)<200', abortOnFail: true, delayAbortEval: '10s' }],
    http_req_failed: [{ threshold: 'rate<0.001', abortOnFail: true, delayAbortEval: '10s' }],
    errors: ['rate<0.001'],
  },
};

export default function () {
  // Representative public read path. Extend with seeded authenticated tRPC calls
  // for a fuller mix — see the runbook.
  const res = http.get(`${BASE_URL}${HEALTH_PATH}`, { tags: { name: 'health' } });
  const ok = check(res, { 'status is 2xx': (r) => r.status >= 200 && r.status < 300 });
  if (!ok) {
    errorRate.add(1);
  }
  sleep(1);
}

export function handleSummary(data) {
  const p95 = data.metrics.http_req_duration?.values?.['p(95)'];
  const failRate = data.metrics.http_req_failed?.values?.rate ?? 0;
  const reqs = data.metrics.http_reqs?.values?.count ?? 0;
  const lines = [
    '',
    '=== MVP load test summary (ADR-018 budget) ===',
    `Target:      ${BASE_URL}${HEALTH_PATH}`,
    `Rate:        ${TARGET_RPS}/s for ${DURATION}  (~${TARGET_RPS * 3600}/hour)`,
    `Requests:    ${reqs}`,
    `p95 latency: ${p95 != null ? p95.toFixed(1) : 'n/a'} ms   (budget: < 200 ms)`,
    `Error rate:  ${(failRate * 100).toFixed(3)} %   (budget: < 0.1 %)`,
    '',
  ];
  return { stdout: lines.join('\n') };
}
