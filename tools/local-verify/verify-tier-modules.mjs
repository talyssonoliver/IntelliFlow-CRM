#!/usr/bin/env node
// Verify subscription-tier / module entitlement resolution via the real API,
// and flag where gating is NOT actually enforced server-side.
//
// WHAT THE HARNESS KNOWS (code-verified):
//   - Plan lives on Workspace (PlanTier: STARTER|PROFESSIONAL|ENTERPRISE|CUSTOM);
//     a tenant with no linked Workspace resolves to STARTER.
//   - Module->plan map (ModuleRegistry): STARTER = CORE_CRM, SUPPORT,
//     AI_INTELLIGENCE, ANALYTICS; PROFESSIONAL += LEGAL; ENTERPRISE += COMMERCE.
//   - GATING IS FRONTEND-ONLY: <ModuleGate>/<ModulePaywall> hide UI, but the
//     backend legal/support/commerce routers use `tenantProcedure` with NO
//     `requireModule` middleware — a STARTER tenant that calls a LEGAL endpoint
//     directly still gets data. moduleAccess.getEnabledModules is advisory.
//
// This script calls moduleAccess.getEnabledModules through the live API (dev
// fallback resolves a seeded tenant) and asserts the entitlement payload is well
// formed, then prints the resolved modules so you can eyeball the tier.
//
//   node tools/local-verify/verify-tier-modules.mjs [apiUrl] [webOrigin]

import { request, trpcQueryUrl, parseTrpcBatch, makeReporter } from './lib/http.mjs';

const API_URL = process.argv[2] || process.env.API_URL || 'http://localhost:4000';
const WEB_ORIGIN = process.argv[3] || process.env.WEB_ORIGIN || 'http://localhost:3000';
const ALL_MODULES = ['CORE_CRM', 'LEGAL', 'SUPPORT', 'AI_INTELLIGENCE', 'ANALYTICS', 'COMMERCE'];

async function main() {
  console.log(`\n=== Tier / module entitlements (${API_URL}) ===\n`);
  const r = makeReporter('tier-modules');

  const res = await request(trpcQueryUrl(API_URL, 'moduleAccess.getEnabledModules'), {
    method: 'GET',
    headers: { Origin: WEB_ORIGIN },
  });
  r.check('moduleAccess.getEnabledModules returns 200', res.status === 200, `status=${res.status}`);

  let modules = null;
  try {
    const data = parseTrpcBatch(res.body);
    // Accept a few likely shapes: string[] | {modules:[]} | {enabled:[]}
    modules = Array.isArray(data) ? data : (data?.modules ?? data?.enabled ?? data);
  } catch {
    /* handled below */
  }

  const ok = Array.isArray(modules);
  r.check('entitlement payload is a module array', ok, ok ? `modules=[${modules.join(', ')}]` : `raw=${res.body.slice(0, 160)}`);

  if (ok) {
    const known = modules.filter((m) => ALL_MODULES.includes(m));
    r.check('all returned modules are recognised CRMModule values', known.length === modules.length, `recognised=${known.length}/${modules.length}`);
    r.note('resolved tier (inferred)', modules.includes('COMMERCE') ? 'ENTERPRISE/CUSTOM' : modules.includes('LEGAL') ? 'PROFESSIONAL' : 'STARTER');
  }

  // The gap is not something the API will report — it's the ABSENCE of a server
  // check. We assert it as a standing reminder so it shows up in every run.
  r.note(
    'KNOWN GAP (code-verified, not auto-tested here)',
    'module gating is FRONTEND-ONLY — legal/support/commerce routers (tenantProcedure) ' +
      'do not enforce entitlements, so a STARTER tenant calling those endpoints directly ' +
      'still receives data. Add a requireModule middleware to close this. See FINDINGS.md.'
  );

  const summary = r.finish();
  return summary.ok;
}

main()
  .then((ok) => process.exit(ok ? 0 : 1))
  .catch((err) => {
    console.error('verify-tier-modules crashed:', err.message);
    process.exit(2);
  });
