#!/usr/bin/env node
// Verify whether Postgres row-level security ACTUALLY enforces tenant isolation
// for the role the API connects as — not just whether policies exist.
//
// WHY THIS EXISTS: the schema enables RLS and ships ~80 tenant_isolation
// policies, which reads as "tenants are isolated at the database". But RLS is
// silently bypassed when (a) the connecting role is a SUPERUSER or has
// rolbypassrls, and (b) the table is not FORCE ROW LEVEL SECURITY. If the app's
// DATABASE_URL points at the `postgres` owner/superuser (it does, locally and on
// many Supabase setups), every policy is a no-op and isolation depends ENTIRELY
// on the application-layer `createTenantWhereClause`. This script proves which
// reality you're in by setting a bogus tenant and checking what's still visible.
//
//   node tools/local-verify/verify-db-rls.mjs
//   PGCONTAINER=intelliflow-postgres-test PGDB=intelliflow_test PGUSER=postgres node ...

import { execFileSync } from 'node:child_process';
import { makeReporter } from './lib/http.mjs';

const CONTAINER = process.env.PGCONTAINER || 'intelliflow-postgres-test';
const DB = process.env.PGDB || 'intelliflow_test';
const USER = process.env.PGUSER || 'postgres';
const BOGUS_TENANT = '99999999-0000-4000-8000-000000000999';

function psql(sql) {
  const out = execFileSync(
    'docker',
    ['exec', CONTAINER, 'psql', '-U', USER, '-d', DB, '-tA', '-c', sql],
    { encoding: 'utf8' }
  );
  return out.trim();
}

/** Last integer in psql output — robust to leading command tags (SET/BEGIN). */
function psqlInt(sql) {
  const nums = psql(sql).match(/\d+/g);
  return nums ? Number(nums[nums.length - 1]) : Number.NaN;
}

function main() {
  console.log(`\n=== DB row-level-security reality check (container ${CONTAINER}) ===\n`);
  const r = makeReporter('db-rls');

  // 1) Connecting role privileges.
  const [rolsuper, rolbypassrls] = psql(
    `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user;`
  ).split('|');
  const isSuper = rolsuper === 't';
  const bypassesRls = rolbypassrls === 't';
  r.note('connecting role', `${USER} (superuser=${isSuper}, bypassrls=${bypassesRls})`);

  // 2) Policies exist (the thing that looks reassuring).
  const policyCount = Number(psql(`SELECT count(*) FROM pg_policies WHERE schemaname='public';`));
  r.check('tenant RLS policies exist in the schema', policyCount > 0, `${policyCount} policies`);

  // 3) FORCE RLS — without it, the owner/superuser bypasses every policy.
  const forced = psql(
    `SELECT relforcerowsecurity FROM pg_class WHERE relname='leads' AND relkind='r';`
  );
  r.note('leads.FORCE ROW LEVEL SECURITY', forced === 't' ? 'YES (forced)' : 'NO (owner/superuser bypasses)');

  // 4) THE TRUTH: set a bogus tenant and see what RLS lets through.
  const totalLeads = psqlInt(`SELECT count(*) FROM leads;`);
  const visibleWrongTenant = psqlInt(
    `SET app.current_tenant_id='${BOGUS_TENANT}'; SELECT count(*) FROM leads;`
  );

  const rlsActuallyEnforces = visibleWrongTenant === 0 && totalLeads > 0;
  r.check(
    'RLS actually isolates: a bogus tenant sees 0 leads',
    rlsActuallyEnforces || totalLeads === 0,
    `total=${totalLeads}, visible-as-wrong-tenant=${visibleWrongTenant}`
  );

  if (!rlsActuallyEnforces && totalLeads > 0) {
    r.note(
      'CONCLUSION',
      'DB RLS is BYPASSED for this connection — tenant isolation depends ENTIRELY on the ' +
        'app-layer createTenantWhereClause. A missing where-clause on ANY tenant table = a ' +
        'cross-tenant leak that RLS will NOT catch. Fix: connect Prisma as a non-superuser ' +
        'role without rolbypassrls, OR add FORCE ROW LEVEL SECURITY to tenant tables.'
    );
  }

  const summary = r.finish();
  return summary.ok;
}

try {
  const ok = main();
  process.exit(ok ? 0 : 1);
} catch (err) {
  console.error('verify-db-rls crashed:', err.message);
  process.exit(2);
}
