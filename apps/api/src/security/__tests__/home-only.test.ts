/**
 * Home-only census (ADR-071): one case per rule, checked against the REAL appRouter so a rule
 * that matches nothing (or a procedure that should be covered and is not) fails here.
 */

import { describe, it, expect, vi } from 'vitest';
import { HOME_ONLY_RULES, findHomeOnlyRule, homeOnlyViolation } from '../home-only';

vi.mock('../../container', () => ({
  container: {
    leadService: { list: vi.fn() },
    security: {
      rbac: { can: vi.fn().mockResolvedValue({ allowed: true }) },
      auditLogger: { log: vi.fn() },
      encryption: { encrypt: vi.fn() },
      tenantContext: { getTenantContext: vi.fn() },
    },
    adapters: {},
  },
  apiPrisma: { $disconnect: vi.fn() },
}));

const atHome = { tenantId: 't-home', homeTenantId: 't-home', pinned: false };
const visitingMember = { tenantId: 't-client', homeTenantId: 't-home', pinned: false };
const pinnedStaff = { tenantId: 't-client', homeTenantId: 't-home', pinned: true };

async function realProcedurePaths(): Promise<string[]> {
  const { appRouter } = await import('../../router.js');
  return Object.keys((appRouter as unknown as { _def: { procedures: object } })._def.procedures);
}

describe('home-only rules vs the real router', () => {
  it('every non-reserved rule matches at least one real procedure', async () => {
    const paths = await realProcedurePaths();
    const dead = HOME_ONLY_RULES.filter(
      (rule) => !rule.reserved && !paths.some((p) => p.startsWith(rule.match))
    ).map((rule) => rule.match);
    expect(dead).toEqual([]);
  });

  it('every reserved rule still matches no real procedure (remove the flag once a router exists)', async () => {
    const paths = await realProcedurePaths();
    const stale = HOME_ONLY_RULES.filter(
      (rule) => rule.reserved && paths.some((p) => p.startsWith(rule.match))
    ).map((rule) => rule.match);
    expect(stale).toEqual([]);
  });

  it('refuses a pinned session on EVERY real procedure a rule covers', async () => {
    const paths = (await realProcedurePaths()).filter((p) => findHomeOnlyRule(p));
    expect(paths.length).toBeGreaterThan(20);
    for (const path of paths) {
      expect(homeOnlyViolation(path, pinnedStaff), path).not.toBeNull();
    }
  });

  it.each(HOME_ONLY_RULES.map((rule) => [rule.match, rule] as const))(
    'rule %s: pinned refused, home allowed, and (P) governs members outside home',
    (match, rule) => {
      const sample =
        rule.match.endsWith('.') || rule.match.endsWith('update') || rule.match.endsWith('delete')
          ? `${rule.match}Something`
          : rule.match;
      const path = sample.endsWith('.') ? `${sample}x` : sample;
      expect(findHomeOnlyRule(path), match).toBe(rule);

      expect(homeOnlyViolation(path, pinnedStaff)).not.toBeNull();
      expect(homeOnlyViolation(path, atHome)).toBeNull();
      if (rule.profile) {
        expect(homeOnlyViolation(path, visitingMember)).not.toBeNull();
      } else {
        expect(homeOnlyViolation(path, visitingMember)).toBeNull();
      }
    }
  );

  it('keeps sign-out and day-to-day CRM work open to a pinned session', () => {
    for (const path of [
      'auth.logout',
      'lead.list',
      'contact.create',
      'team.list',
      'user.getProfile',
      'user.list',
      'user.listTenants',
      'user.claimLoginGrant',
      'moduleAccess.getEnabledModules',
      'leadSettings.get',
    ]) {
      expect(findHomeOnlyRule(path), path).toBeNull();
      expect(homeOnlyViolation(path, pinnedStaff), path).toBeNull();
    }
  });

  it('covers the named areas of the contract', () => {
    for (const path of [
      'billing.updatePaymentMethod',
      'billing.cancelSubscription',
      'moduleAccess.toggleModule',
      'user.updateProfile',
      'user.updateTimezone',
      'auth.setupMfa',
      'auth.disableMfa',
      'auth.getSessions',
      'auth.revokeSession',
      'tenant.update',
      'tenant.delete',
      'apiKey.create',
      'subscription.toggleModule',
      'queuesAdmin.pause',
    ]) {
      expect(homeOnlyViolation(path, pinnedStaff), path).not.toBeNull();
    }
  });

  it('refuses profile and billing, but not operator paths, to a member outside home', () => {
    expect(homeOnlyViolation('billing.getPlanState', visitingMember)).not.toBeNull();
    expect(homeOnlyViolation('user.updateProfile', visitingMember)).not.toBeNull();
    expect(homeOnlyViolation('auth.getSessions', visitingMember)).not.toBeNull();
    expect(homeOnlyViolation('queuesAdmin.list', visitingMember)).toBeNull();
  });

  it('allows an unauthenticated caller (nothing to refuse)', () => {
    expect(homeOnlyViolation('billing.getPlanState', null)).toBeNull();
  });
});
