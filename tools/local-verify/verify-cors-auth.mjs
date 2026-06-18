#!/usr/bin/env node
// Verify the CORS + cross-origin auth path that PERF-08/09 broke.
//
// Since ADR-063 Option 3, the browser is a CROSS-ORIGIN tRPC client: it calls
// the API at ${NEXT_PUBLIC_API_URL}/api/trpc directly. Every authenticated call
// carries an `Authorization` header, so the browser sends a CORS preflight
// (OPTIONS). If the API does not answer the preflight + echo Access-Control-
// Allow-Origin, the browser blocks the real request and the app falls into a
// phantom "not authenticated" redirect loop.
//
// This asserts the real HTTP behaviour against a running API — the class of
// check the mocked unit tests could never make.
//
//   node tools/local-verify/verify-cors-auth.mjs [apiUrl] [webOrigin]
//   API_URL=https://api-production-e9c1.up.railway.app node ...   (check prod)

import { request, trpcQueryUrl, parseTrpcBatch, makeReporter } from './lib/http.mjs';

const API_URL = process.argv[2] || process.env.API_URL || 'http://localhost:4000';
const WEB_ORIGIN = process.argv[3] || process.env.WEB_ORIGIN || 'http://localhost:3000';

async function main() {
  console.log(`\n=== CORS + cross-origin auth ===`);
  console.log(`    API:    ${API_URL}`);
  console.log(`    Origin: ${WEB_ORIGIN}\n`);
  const r = makeReporter('cors-auth');

  // 1) Preflight from the web origin must be answered (not 404) with ACAO.
  const pre = await request(`${API_URL}/api/trpc/auth.getStatus`, {
    method: 'OPTIONS',
    headers: {
      Origin: WEB_ORIGIN,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization,content-type',
    },
  });
  r.check(
    'preflight is answered (status < 400, not the old 404)',
    pre.status < 400,
    `status=${pre.status}`
  );
  r.check(
    'preflight echoes Access-Control-Allow-Origin for the web origin',
    pre.headers['access-control-allow-origin'] === WEB_ORIGIN ||
      pre.headers['access-control-allow-origin'] === '*',
    `acao=${pre.headers['access-control-allow-origin'] ?? '(none)'}`
  );
  r.check(
    'preflight allows the Authorization request header',
    (pre.headers['access-control-allow-headers'] ?? '').toLowerCase().includes('authorization'),
    `allow-headers=${pre.headers['access-control-allow-headers'] ?? '(none)'}`
  );

  // 2) The real cross-origin authed query must succeed AND carry ACAO so the
  //    browser is allowed to read it. (Locally the dev-auth fallback resolves a
  //    seeded user, so authenticated=true even without a token.)
  const status = await request(trpcQueryUrl(API_URL, 'auth.getStatus'), {
    method: 'GET',
    headers: { Origin: WEB_ORIGIN },
  });
  r.check('auth.getStatus returns 200 cross-origin', status.status === 200, `status=${status.status}`);
  r.check(
    'auth.getStatus response carries Access-Control-Allow-Origin',
    Boolean(status.headers['access-control-allow-origin']),
    `acao=${status.headers['access-control-allow-origin'] ?? '(none)'}`
  );
  try {
    const data = parseTrpcBatch(status.body);
    r.note(
      'auth.getStatus body',
      `authenticated=${data?.authenticated} user=${data?.user?.email ?? '(none)'}`
    );
  } catch {
    r.note('auth.getStatus body', '(unparseable — likely an error payload)');
  }

  const summary = r.finish();
  return summary.ok;
}

main()
  .then((ok) => process.exit(ok ? 0 : 1))
  .catch((err) => {
    console.error('verify-cors-auth crashed:', err.message);
    process.exit(2);
  });
