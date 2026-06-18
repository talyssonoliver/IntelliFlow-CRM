#!/usr/bin/env node
// Run the whole local-verify suite against a running local stack and summarise.
// Each verifier exits 0 (all checks passed) / 1 (a check failed — a real finding)
// / 2 (the verifier itself crashed). A non-zero overall exit means something the
// user should look at — including the deliberately-surfaced enforcement GAPS.
//
//   node tools/local-verify/run-all.mjs
//   API_URL=... WEB_ORIGIN=... node tools/local-verify/run-all.mjs

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const verifiers = ['verify-cors-auth.mjs', 'verify-db-rls.mjs', 'verify-tier-modules.mjs'];

console.log('\n############################################################');
console.log('#  IntelliFlow local verification suite');
console.log(`#  API_URL=${process.env.API_URL || 'http://localhost:4000'}`);
console.log('############################################################');

const results = [];
for (const v of verifiers) {
  const res = spawnSync(process.execPath, [join(here, v)], { stdio: 'inherit', env: process.env });
  results.push({ v, code: res.status ?? 2 });
}

console.log('\n############################################################');
console.log('#  SUMMARY');
for (const { v, code } of results) {
  const tag = code === 0 ? 'OK    ' : code === 1 ? 'FINDING' : 'CRASH ';
  console.log(`#  [${tag}] ${v}${code === 1 ? '  (a check failed — see output above)' : ''}`);
}
console.log('############################################################\n');

// Exit non-zero if any verifier reported a finding or crashed.
process.exit(results.some((r) => r.code !== 0) ? 1 : 0);
