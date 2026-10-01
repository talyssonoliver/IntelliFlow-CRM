/**
 * Home-only procedures (ADR-071).
 *
 * Some things belong to the person's OWN account, not to the tenant they are visiting: billing,
 * subscription and plan state, profile and account security, platform operations, credentials.
 * A session acting inside a client tenant must not touch them:
 *
 *  - a PINNED staff session is refused every rule below (it is a guest in the client tenant);
 *  - a non-pinned member acting in a tenant other than their home is refused only the rules
 *    marked `profile` (P): profile and billing, which belong to the home account.
 *
 * The check runs in `isAuthed` (every authenticated procedure passes through it) and matches on
 * the procedure PATH, so a procedure added later under a listed prefix is home-only by default.
 * `team` administration is deliberately NOT listed: staff work normally inside the client tenant.
 *
 * Census: `__tests__/home-only.test.ts` checks one case per rule and fails when a rule matches no
 * real procedure and is not declared `reserved`.
 */

import { isActingOutsideHome } from './membership';

export interface HomeOnlyRule {
  /** An exact procedure path, or a prefix (any path starting with it). */
  match: string;
  /** (P): profile or billing, also refused to a non-pinned member acting outside home. */
  profile: boolean;
  /** Paths under this rule that stay allowed (exact paths). */
  allow?: readonly string[];
  /** No procedure exists yet; the rule reserves the name so a future router is safe by default. */
  reserved?: boolean;
  why: string;
}

export const HOME_ONLY_RULES: readonly HomeOnlyRule[] = [
  // Billing and plan state belong to the home account (P).
  { match: 'billing.', profile: true, why: 'billing' },
  { match: 'subscription.', profile: true, reserved: true, why: 'subscription and plan' },
  // Operator-only plan changes (also guarded by platformAdminProcedure).
  { match: 'moduleAccess.toggleModule', profile: false, why: 'plan module toggle (operator)' },
  // Profile and account security of the signed-in user (P). Sign-out stays allowed.
  { match: 'user.update', profile: true, why: 'profile mutation' },
  { match: 'user.delete', profile: true, reserved: true, why: 'account deletion' },
  {
    match: 'auth.',
    profile: true,
    allow: ['auth.logout'],
    why: 'MFA, sessions and backup codes of the home account',
  },
  // Tenant settings, plan, ownership and credentials: no router exists yet; reserved.
  { match: 'tenant.', profile: false, reserved: true, why: 'tenant admin, plan, ownership' },
  { match: 'apiKey.', profile: false, reserved: true, why: 'API credentials' },
  { match: 'platform.', profile: false, reserved: true, why: 'platform operator' },
  // Platform operations: any signed-in user can reach these today; a guest must not.
  { match: 'queuesAdmin.', profile: false, why: 'platform queue operations' },
];

/** The rule that applies to a procedure path, or null. */
export function findHomeOnlyRule(path: string): HomeOnlyRule | null {
  for (const rule of HOME_ONLY_RULES) {
    if (!path.startsWith(rule.match)) continue;
    if (rule.allow?.includes(path)) return null;
    return rule;
  }
  return null;
}

/** A refusal message when `user` may not call `path`, else null. */
export function homeOnlyViolation(
  path: string,
  user: { tenantId: string; homeTenantId?: string; pinned?: boolean } | null | undefined
): string | null {
  if (!user) return null;
  const rule = findHomeOnlyRule(path);
  if (!rule) return null;
  if (user.pinned) {
    return 'This action is not available in a client workspace opened from the Portal.';
  }
  if (rule.profile && isActingOutsideHome(user)) {
    return 'This belongs to your own account. Switch back to your own workspace to use it.';
  }
  return null;
}

/** Refusal for a procedure explicitly marked home-only: pinned sessions and members outside home. */
export function explicitHomeOnlyViolation(
  user: { tenantId: string; homeTenantId?: string; pinned?: boolean } | null | undefined
): string | null {
  if (!user) return null;
  if (user.pinned) {
    return 'This action is not available in a client workspace opened from the Portal.';
  }
  if (isActingOutsideHome(user)) {
    return 'This belongs to your own account. Switch back to your own workspace to use it.';
  }
  return null;
}
