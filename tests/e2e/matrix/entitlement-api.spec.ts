/**
 * Authenticated QA matrix — module entitlement per tier (API tier).
 *
 * Hits the real API with each persona's REAL token and asserts the plan-based
 * gate: the paid LEGAL module is denied to STARTER tenants and granted to
 * PROFESSIONAL+ — independent of the tenant's own ADMIN role (the backend gate is
 * plan-based, with no role bypass; cf. the frontend ModuleGate which DOES bypass
 * for admins — tracked separately). Core/AI/Analytics are in every tier and must
 * stay authorized for everyone.
 *
 * Runs in the `authenticated` project (depends on `setup`). storageState is
 * cleared here so ONLY the explicit Bearer token authenticates — no stray cookie.
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import { QA_PERSONAS } from '../fixtures/qa-personas';
import { readPersonaToken } from '../fixtures/storage-state';

const API = process.env.QA_API_URL || 'http://localhost:4000';

test.use({ storageState: { cookies: [], origins: [] } });

async function trpc(ctx: APIRequestContext, proc: string, token: string, input: unknown = {}) {
  const url = `${API}/api/trpc/${proc}?batch=1&input=${encodeURIComponent(
    JSON.stringify({ 0: input })
  )}`;
  const res = await ctx.get(url, { headers: { authorization: `Bearer ${token}` } });
  const text = await res.text();
  return {
    status: res.status(),
    forbidden: /FORBIDDEN|does not include the LEGAL/i.test(text),
    text,
  };
}

// Module-gating per tier — LEGAL is the only plan-gated module with routes.
for (const persona of QA_PERSONAS) {
  const tierHasLegal = persona.plan === 'PROFESSIONAL' || persona.plan === 'ENTERPRISE';

  test(`${persona.key} (${persona.plan}/${persona.industry}): LEGAL ${tierHasLegal ? 'granted' : 'denied'}`, async ({
    request,
  }) => {
    const token = readPersonaToken(persona.key);
    const cases = await trpc(request, 'cases.list', token);
    expect(
      cases.forbidden,
      `cases.list should be ${tierHasLegal ? 'authorized' : 'FORBIDDEN'} for ${persona.plan}`
    ).toBe(!tierHasLegal);
  });
}

// Per-module authorized-path smokes — Core CRM, AI and Analytics are in EVERY
// tier, so they must be authorized for every persona regardless of plan.
const ALWAYS_ON: { module: string; proc: string }[] = [
  { module: 'CORE_CRM', proc: 'account.filterOptions' },
  // Calendar shares the appointments router — it must NOT be LEGAL-gated, or the
  // calendar breaks for non-Professional tenants (regression guard).
  { module: 'CORE_CRM (calendar)', proc: 'appointments.list' },
  { module: 'AI_INTELLIGENCE', proc: 'agent.listTools' },
  { module: 'ANALYTICS', proc: 'analytics.leadStats' },
];

for (const persona of QA_PERSONAS) {
  test(`${persona.key} (${persona.plan}): Core/AI/Analytics authorized`, async ({ request }) => {
    const token = readPersonaToken(persona.key);
    for (const { module, proc } of ALWAYS_ON) {
      const r = await trpc(request, proc, token);
      expect(r.forbidden, `${module} (${proc}) must be authorized for ${persona.plan}`).toBe(false);
    }
  });
}
