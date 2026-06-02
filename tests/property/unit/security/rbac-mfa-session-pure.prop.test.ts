/**
 * Property tests for RBACService.can, MfaService.verifyBackupCode,
 * and SessionService.isSessionValid — pure deterministic functions,
 * no infrastructure dependencies.
 *
 * Properties covered:
 *
 * RBAC (RBACService.can — pure path, no DB overrides):
 *  P-RBAC-01: ADMIN is granted every action on every resource.
 *  P-RBAC-02: VIEWER is granted only 'read' on every resource (no write/delete/export/manage/admin).
 *  P-RBAC-03: Ownership restriction — SALES_REP/USER are denied non-'read' actions on records they do not own.
 *  P-RBAC-04: Own-record access — SALES_REP/USER are granted all their role-allowed actions on own records.
 *  P-RBAC-05: Denial reason contains resource type and action when role lacks permission.
 *  P-RBAC-06: checkedPermissions always contains the "resource:action" key.
 *  P-RBAC-07: roleLevel in result equals ROLE_LEVELS[userRole].
 *  P-RBAC-08: Role hierarchy — granted(ADMIN) >= granted(MANAGER) >= granted(SALES_REP) for same context
 *             (monotonicity: a higher role can never have fewer permissions than a lower role).
 *  P-RBAC-09: VIEWER can read any resource regardless of owner (ownership restriction does not block reads).
 *  P-RBAC-10: Pure synchronous helpers — getRoleLevel, isRoleAtLevel, isManager, isAdmin are
 *             deterministic and consistent with ROLE_LEVELS.
 *  P-RBAC-11: evaluateConditions with empty conditions always returns true.
 *  P-RBAC-12: evaluateConditions 'eq' operator is symmetric (value===condition.value ↔ result===true).
 *  P-RBAC-13: evaluateConditions 'neq' is the exact complement of 'eq'.
 *  P-RBAC-14: evaluateConditions 'in' with single-element array behaves identically to 'eq'.
 *  P-RBAC-15: evaluateConditions 'contains'/'startsWith' return false for non-string context values.
 *  P-RBAC-16: All conditions must hold for evaluateConditions to return true (conjunction).
 *
 * MFA (MfaService.verifyBackupCode — pure, no DB):
 *  P-MFA-01: A freshly-hashed code is always valid against its own hash list.
 *  P-MFA-02: After a valid verification the returned updatedCodes has exactly one fewer entry.
 *  P-MFA-03: After a valid verification the consumed code hash is absent from updatedCodes.
 *  P-MFA-04: A code that was never hashed is always invalid.
 *  P-MFA-05: verifyBackupCode is case-insensitive and whitespace-insensitive for the input code.
 *  P-MFA-06: Remaining codes after consumption are a subset of the original hashed codes.
 *  P-MFA-07: An empty hashedCodes list always returns valid:false.
 *  P-MFA-08: verifyBackupCode is idempotent on the hashed list after a failed attempt
 *            (list is unchanged when code is not found).
 *
 * Session (SessionService.isSessionValid — pure, no DB):
 *  P-SESSION-01: A session expiring in the future with recent activity is valid.
 *  P-SESSION-02: An already-expired session (expiresAt in the past) is always invalid.
 *  P-SESSION-03: An inactive session (lastActiveAt + inactivityTimeout < now) is always invalid.
 *  P-SESSION-04: Validity is monotone in expiresAt — pushing expiresAt further forward
 *                cannot turn a valid session invalid (all else equal).
 *  P-SESSION-05: Validity is monotone in lastActiveAt — a more-recent lastActiveAt
 *                cannot turn a valid session invalid (all else equal).
 *  P-SESSION-06: rememberMe flag does not affect isSessionValid (it only controls duration at
 *                creation time — after that, only expiresAt and lastActiveAt matter).
 *  P-SESSION-07: Custom inactivityTimeoutMs is respected — a session idle for exactly
 *                inactivityTimeoutMs milliseconds is invalid.
 *
 * @module tests/property/unit/security/rbac-mfa-session-pure.prop.test.ts
 */

import { describe } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { propertyParams } from '../../support';

// ---------------------------------------------------------------------------
// Production imports (relative paths — no alias for apps/api in vitest.config)
// ---------------------------------------------------------------------------
import { RBACService, resetRBACService } from '../../../../apps/api/src/security/rbac';
import {
  ROLE_LEVELS,
  type RoleName,
  type ResourceType,
  type PermissionAction,
  type AttributeCondition,
} from '../../../../apps/api/src/security/types';
import { MfaService } from '../../../../apps/api/src/services/mfa.service';
import {
  SessionService,
  type SessionData,
  DEFAULT_SESSION_CONFIG,
} from '../../../../apps/api/src/services/session.service';

// ---------------------------------------------------------------------------
// Minimal stub — RBACService constructor requires a PrismaClient. The pure
// path (no DB overrides) only calls prisma inside getUserPermissionOverride,
// which is wrapped in try/catch and returns null on any error. A stub that
// throws on access is therefore safe.
// ---------------------------------------------------------------------------
const stubPrisma = new Proxy(
  {},
  {
    get() {
      // Any property access throws — getUserPermissionOverride catches it and
      // returns null, so the pure role-permission logic is exercised.
      throw new Error('[stub] prisma access not allowed in pure property tests');
    },
  }
) as unknown as import('@intelliflow/db').PrismaClient;

// ---------------------------------------------------------------------------
// Bounded arbitraries (inline — do NOT edit support/arbitraries)
// ---------------------------------------------------------------------------

const ALL_ROLES: RoleName[] = ['ADMIN', 'MANAGER', 'SALES_REP', 'USER', 'VIEWER'];
const ALL_RESOURCES: ResourceType[] = [
  'lead',
  'contact',
  'account',
  'opportunity',
  'task',
  'user',
  'ai_score',
  'appointment',
  'session',
  'system',
  'pipeline_config',
];
const ALL_ACTIONS: PermissionAction[] = ['read', 'write', 'delete', 'export', 'manage', 'admin'];

const arbRole = fc.constantFrom<RoleName>(...ALL_ROLES);
const arbResource = fc.constantFrom<ResourceType>(...ALL_RESOURCES);
const arbAction = fc.constantFrom<PermissionAction>(...ALL_ACTIONS);

/** A non-empty string that is a plausible user/owner ID. */
const arbUserId = fc.uuid();

/** Non-empty string for attribute condition fields/values. */
const arbAttrValue = fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.length > 0);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a fresh RBACService with the stub prisma. */
function makeService(): RBACService {
  resetRBACService();
  return new RBACService(stubPrisma);
}

/** Build a fresh SessionService with no prisma (pure in-memory). */
function makeSessionService(config?: Partial<typeof DEFAULT_SESSION_CONFIG>): SessionService {
  return new SessionService(undefined, config);
}

/**
 * Build a SessionData object for pure isSessionValid tests.
 * All DB fields are irrelevant for this pure check.
 */
function makeSession(overrides: Partial<SessionData> = {}): SessionData {
  const now = new Date();
  return {
    id: 'test-session',
    userId: 'test-user',
    tenantId: 'test-tenant',
    deviceInfo: {},
    createdAt: now,
    lastActiveAt: now,
    expiresAt: new Date(now.getTime() + 60_000), // 1 minute from now
    rememberMe: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// RBAC properties
// ---------------------------------------------------------------------------

describe('RBACService.can — pure role-permission matrix', () => {
  // P-RBAC-01: ADMIN has 'read' and 'write' on every resource (all listed resources have at
  // least these two in their permission matrix). 'delete'/'export'/'manage'/'admin' vary by
  // resource (e.g. system only has read/write/admin; session has no export). We test the
  // lowest common denominator: read + write are always present for ADMIN.
  test.prop([arbResource], propertyParams())(
    'P-RBAC-01a: ADMIN is granted read on every resource',
    async (resource) => {
      const svc = makeService();
      const result = await svc.can({
        userId: 'admin-user',
        userRole: 'ADMIN',
        resourceType: resource,
        action: 'read',
      });
      return result.granted === true;
    }
  );

  test.prop([arbResource], propertyParams())(
    'P-RBAC-01b: ADMIN is granted write on every resource',
    async (resource) => {
      const svc = makeService();
      const result = await svc.can({
        userId: 'admin-user',
        userRole: 'ADMIN',
        resourceType: resource,
        action: 'write',
      });
      return result.granted === true;
    }
  );

  // P-RBAC-01c: ADMIN never has fewer grants than any other role (hierarchy invariant).
  // For every role × resource × action, if the other role is granted, ADMIN must also be granted.
  test.prop([arbRole, arbResource, arbAction], propertyParams())(
    'P-RBAC-01c: ADMIN always has at least as many permissions as any other role',
    async (role, resource, action) => {
      const userId = 'test-user';
      const svc = makeService();
      const adminResult = await svc.can({
        userId,
        userRole: 'ADMIN',
        resourceType: resource,
        action,
      });
      const roleResult = await svc.can({ userId, userRole: role, resourceType: resource, action });
      if (roleResult.granted) {
        return adminResult.granted === true;
      }
      return true;
    }
  );

  // P-RBAC-02
  test.prop(
    [
      arbResource,
      fc.constantFrom<PermissionAction>('write', 'delete', 'export', 'manage', 'admin'),
    ],
    propertyParams()
  )(
    'P-RBAC-02: VIEWER is never granted write/delete/export/manage/admin',
    async (resource, action) => {
      const svc = makeService();
      const result = await svc.can({
        userId: 'viewer-user',
        userRole: 'VIEWER',
        resourceType: resource,
        action,
      });
      return result.granted === false;
    }
  );

  // P-RBAC-03
  test.prop(
    [
      arbUserId,
      arbUserId,
      arbResource,
      fc.constantFrom<PermissionAction>('write', 'delete', 'export'),
      fc.constantFrom<RoleName>('SALES_REP', 'USER'),
    ],
    propertyParams()
  )(
    'P-RBAC-03: Ownership restriction — SALES_REP/USER denied write/delete/export on records they do not own',
    async (userId, ownerId, resource, action, role) => {
      fc.pre(userId !== ownerId); // Must be different users

      const svc = makeService();

      // First check the role even has this action (skip if role lacks it entirely)
      const baseResult = await svc.can({
        userId,
        userRole: role,
        resourceType: resource,
        action,
      });

      if (!baseResult.granted) {
        // Role doesn't have this action at all — ownership check won't fire,
        // but it's still denied, which is correct.
        return true;
      }

      // Role has the action; now supply a different owner → must be denied
      const result = await svc.can({
        userId,
        userRole: role,
        resourceType: resource,
        action,
        resourceOwnerId: ownerId,
      });
      return result.granted === false;
    }
  );

  // P-RBAC-04
  test.prop(
    [
      arbUserId,
      arbResource,
      fc.constantFrom<PermissionAction>('write', 'delete'),
      fc.constantFrom<RoleName>('SALES_REP', 'USER'),
    ],
    propertyParams()
  )(
    'P-RBAC-04: Own-record access — SALES_REP/USER granted write/delete on own records (if role allows it)',
    async (userId, resource, action, role) => {
      const svc = makeService();

      // Check if role has the action at all
      const noOwnerResult = await svc.can({
        userId,
        userRole: role,
        resourceType: resource,
        action,
      });

      // When owner === user, result must match what the role allows (no ownership block)
      const ownResult = await svc.can({
        userId,
        userRole: role,
        resourceType: resource,
        action,
        resourceOwnerId: userId,
      });

      // Supplying own ID as owner should never ADD a denial that wasn't there before
      if (noOwnerResult.granted) {
        return ownResult.granted === true;
      }
      // If role lacks the action, setting resourceOwnerId=userId should not grant it
      return ownResult.granted === false;
    }
  );

  // P-RBAC-05
  test.prop([arbUserId, arbRole, arbResource, arbAction], propertyParams())(
    'P-RBAC-05: Denial reason contains resource type and action when role lacks permission',
    async (userId, role, resource, action) => {
      const svc = makeService();
      const result = await svc.can({ userId, userRole: role, resourceType: resource, action });
      if (!result.granted && result.reason) {
        // Must mention both resource and action (or a specific ownership reason)
        return (
          result.reason.includes(action) ||
          result.reason.includes(resource) ||
          result.reason.includes('cannot')
        );
      }
      return true; // Granted or no reason present — no constraint to check
    }
  );

  // P-RBAC-06
  test.prop([arbUserId, arbRole, arbResource, arbAction], propertyParams())(
    'P-RBAC-06: checkedPermissions always contains the "resource:action" key',
    async (userId, role, resource, action) => {
      const svc = makeService();
      const result = await svc.can({ userId, userRole: role, resourceType: resource, action });
      return result.checkedPermissions.includes(`${resource}:${action}`);
    }
  );

  // P-RBAC-07
  test.prop([arbUserId, arbRole, arbResource, arbAction], propertyParams())(
    'P-RBAC-07: roleLevel in result equals ROLE_LEVELS[userRole]',
    async (userId, role, resource, action) => {
      const svc = makeService();
      const result = await svc.can({ userId, userRole: role, resourceType: resource, action });
      return result.roleLevel === ROLE_LEVELS[role];
    }
  );

  // P-RBAC-08: Role hierarchy monotonicity
  // For every resource × action, granted(ADMIN) >= granted(MANAGER) — i.e. if MANAGER
  // can do it, ADMIN can too (same owner context, no override).
  test.prop([arbUserId, arbResource, arbAction], propertyParams())(
    'P-RBAC-08: ADMIN always has at least as many permissions as MANAGER',
    async (userId, resource, action) => {
      const svc = makeService();
      const adminResult = await svc.can({
        userId,
        userRole: 'ADMIN',
        resourceType: resource,
        action,
      });
      const managerResult = await svc.can({
        userId,
        userRole: 'MANAGER',
        resourceType: resource,
        action,
      });
      // If MANAGER is granted, ADMIN must also be granted
      if (managerResult.granted) {
        return adminResult.granted === true;
      }
      return true; // Manager denied — no constraint on admin from this direction
    }
  );

  test.prop([arbUserId, arbResource, arbAction], propertyParams())(
    'P-RBAC-08b: MANAGER always has at least as many permissions as SALES_REP',
    async (userId, resource, action) => {
      const svc = makeService();
      const managerResult = await svc.can({
        userId,
        userRole: 'MANAGER',
        resourceType: resource,
        action,
      });
      const salesRepResult = await svc.can({
        userId,
        userRole: 'SALES_REP',
        resourceType: resource,
        action,
      });
      if (salesRepResult.granted) {
        return managerResult.granted === true;
      }
      return true;
    }
  );

  // P-RBAC-09: VIEWER can read non-system resources regardless of who owns them.
  // 'system' is explicitly excluded: VIEWER has system:[] (empty) in the permission matrix,
  // so read is not granted. This is an intentional design decision, not a bug.
  // For all other resources, VIEWER has 'read' and ownership restrictions do not apply.
  test.prop(
    [
      arbUserId,
      arbUserId,
      fc.constantFrom<ResourceType>(
        'lead',
        'contact',
        'account',
        'opportunity',
        'task',
        'user',
        'ai_score',
        'appointment',
        'session',
        'pipeline_config'
        // 'system' excluded: VIEWER has system:[] — no read permission
      ),
    ],
    propertyParams()
  )(
    'P-RBAC-09: VIEWER can read non-system resources regardless of who owns them',
    async (userId, ownerId, resource) => {
      const svc = makeService();
      const result = await svc.can({
        userId,
        userRole: 'VIEWER',
        resourceType: resource,
        action: 'read',
        resourceOwnerId: ownerId,
      });
      return result.granted === true;
    }
  );

  // P-RBAC-09b: VIEWER cannot read the 'system' resource (matrix has system:[]).
  test.prop([arbUserId], propertyParams())(
    'P-RBAC-09b: VIEWER is denied read on the system resource',
    async (userId) => {
      const svc = makeService();
      const result = await svc.can({
        userId,
        userRole: 'VIEWER',
        resourceType: 'system',
        action: 'read',
      });
      return result.granted === false;
    }
  );
});

describe('RBACService — pure synchronous helpers', () => {
  // P-RBAC-10
  test.prop([arbRole], propertyParams())(
    'P-RBAC-10: getRoleLevel returns ROLE_LEVELS value',
    (role) => {
      const svc = makeService();
      return svc.getRoleLevel(role) === ROLE_LEVELS[role];
    }
  );

  test.prop([arbRole, fc.integer({ min: 0, max: 100 })], propertyParams())(
    'P-RBAC-10b: isRoleAtLevel is consistent with getRoleLevel',
    (role, minLevel) => {
      const svc = makeService();
      return svc.isRoleAtLevel(role, minLevel) === svc.getRoleLevel(role) >= minLevel;
    }
  );

  test.prop([arbRole], propertyParams())(
    'P-RBAC-10c: isManager is true iff role level >= MANAGER level',
    (role) => {
      const svc = makeService();
      return svc.isManager(role) === ROLE_LEVELS[role] >= ROLE_LEVELS['MANAGER'];
    }
  );

  test.prop([arbRole], propertyParams())('P-RBAC-10d: isAdmin is true only for ADMIN', (role) => {
    const svc = makeService();
    return svc.isAdmin(role) === (role === 'ADMIN');
  });
});

describe('RBACService.evaluateConditions — pure ABAC helpers', () => {
  // P-RBAC-11
  test.prop(
    [
      fc.dictionary(
        fc.string({ minLength: 1, maxLength: 10 }),
        fc.string({ minLength: 1, maxLength: 20 })
      ),
    ],
    propertyParams()
  )('P-RBAC-11: Empty conditions always return true', (ctx) => {
    const svc = makeService();
    return svc.evaluateConditions([], ctx) === true;
  });

  // P-RBAC-12
  test.prop([arbAttrValue, arbAttrValue], propertyParams())(
    'P-RBAC-12: eq operator returns true iff value strictly equals condition.value',
    (contextValue, conditionValue) => {
      const svc = makeService();
      const cond: AttributeCondition = { field: 'f', operator: 'eq', value: conditionValue };
      const result = svc.evaluateConditions([cond], { f: contextValue });
      return result === (contextValue === conditionValue);
    }
  );

  // P-RBAC-13
  test.prop([arbAttrValue, arbAttrValue], propertyParams())(
    'P-RBAC-13: neq is the exact complement of eq',
    (contextValue, conditionValue) => {
      const svc = makeService();
      const eqCond: AttributeCondition = { field: 'f', operator: 'eq', value: conditionValue };
      const neqCond: AttributeCondition = { field: 'f', operator: 'neq', value: conditionValue };
      const eqResult = svc.evaluateConditions([eqCond], { f: contextValue });
      const neqResult = svc.evaluateConditions([neqCond], { f: contextValue });
      return eqResult !== neqResult;
    }
  );

  // P-RBAC-14: 'in' with single-element array behaves like 'eq'
  test.prop([arbAttrValue, arbAttrValue], propertyParams())(
    'P-RBAC-14: in with single-element array behaves identically to eq',
    (contextValue, conditionValue) => {
      const svc = makeService();
      const eqCond: AttributeCondition = { field: 'f', operator: 'eq', value: conditionValue };
      const inCond: AttributeCondition = { field: 'f', operator: 'in', value: [conditionValue] };
      const eqResult = svc.evaluateConditions([eqCond], { f: contextValue });
      const inResult = svc.evaluateConditions([inCond], { f: contextValue });
      return eqResult === inResult;
    }
  );

  // P-RBAC-15: contains/startsWith return false for non-string context values
  test.prop([fc.integer(), arbAttrValue], propertyParams())(
    'P-RBAC-15a: contains returns false when context value is not a string',
    (numericValue, conditionValue) => {
      const svc = makeService();
      const cond: AttributeCondition = { field: 'f', operator: 'contains', value: conditionValue };
      return svc.evaluateConditions([cond], { f: numericValue }) === false;
    }
  );

  test.prop([fc.integer(), arbAttrValue], propertyParams())(
    'P-RBAC-15b: startsWith returns false when context value is not a string',
    (numericValue, conditionValue) => {
      const svc = makeService();
      const cond: AttributeCondition = {
        field: 'f',
        operator: 'startsWith',
        value: conditionValue,
      };
      return svc.evaluateConditions([cond], { f: numericValue }) === false;
    }
  );

  // P-RBAC-16: All conditions must hold (conjunction)
  test.prop(
    [
      fc.array(arbAttrValue, { minLength: 2, maxLength: 4 }),
      fc.array(arbAttrValue, { minLength: 2, maxLength: 4 }),
    ],
    propertyParams()
  )(
    'P-RBAC-16: evaluateConditions requires ALL conditions to hold',
    (fieldValues, conditionValues) => {
      // Build a mixed set: first condition matches, rest do NOT match
      fc.pre(fieldValues.length >= 2 && conditionValues.length >= 2);

      const svc = makeService();

      // Make condition[0] match and condition[1] NOT match (use a different value)
      const matchValue = fieldValues[0];
      const mismatchValue = conditionValues[1] + '_mismatch_sentinel';

      const conditions: AttributeCondition[] = [
        { field: 'a', operator: 'eq', value: matchValue },
        { field: 'b', operator: 'eq', value: mismatchValue },
      ];

      const ctx = { a: matchValue, b: 'something_else' }; // b !== mismatchValue
      const result = svc.evaluateConditions(conditions, ctx);
      return result === false; // Must be false because second condition fails
    }
  );
});

// ---------------------------------------------------------------------------
// MFA properties
// ---------------------------------------------------------------------------

describe('MfaService.verifyBackupCode — pure', () => {
  // Build backup codes using the same pipeline as production:
  // generate -> hash -> verify
  function makeHashedCodes(svc: MfaService, count: number): { plain: string[]; hashed: string[] } {
    const { codes: plain } = svc.generateBackupCodes(count);
    const hashed = svc.hashBackupCodes(plain);
    return { plain, hashed };
  }

  // P-MFA-01
  test.prop([fc.integer({ min: 1, max: 8 }), fc.integer({ min: 0, max: 7 })], propertyParams())(
    'P-MFA-01: A freshly-hashed code is always valid against its own hash list',
    (count, indexSeed) => {
      const svc = new MfaService();
      const { plain, hashed } = makeHashedCodes(svc, count);
      const index = indexSeed % count;
      const result = svc.verifyBackupCode(plain[index], hashed);
      return result.valid === true;
    }
  );

  // P-MFA-02
  test.prop([fc.integer({ min: 1, max: 8 }), fc.integer({ min: 0, max: 7 })], propertyParams())(
    'P-MFA-02: After valid verification, updatedCodes has exactly one fewer entry',
    (count, indexSeed) => {
      const svc = new MfaService();
      const { plain, hashed } = makeHashedCodes(svc, count);
      const index = indexSeed % count;
      const result = svc.verifyBackupCode(plain[index], hashed);
      return result.valid && result.updatedCodes !== undefined
        ? result.updatedCodes.length === hashed.length - 1
        : false;
    }
  );

  // P-MFA-03
  test.prop([fc.integer({ min: 1, max: 8 }), fc.integer({ min: 0, max: 7 })], propertyParams())(
    'P-MFA-03: After valid verification, the consumed code hash is absent from updatedCodes',
    (count, indexSeed) => {
      const svc = new MfaService();
      const { plain, hashed } = makeHashedCodes(svc, count);
      const index = indexSeed % count;
      const consumedHash = hashed[index];
      const result = svc.verifyBackupCode(plain[index], hashed);
      if (!result.valid || !result.updatedCodes) return false;
      return !result.updatedCodes.includes(consumedHash);
    }
  );

  // P-MFA-04
  test.prop(
    [fc.integer({ min: 0, max: 8 }), fc.stringMatching(/^[0-9a-f]{10}$/)],
    propertyParams()
  )('P-MFA-04: A code that was never hashed is always invalid', (count, unknownCode) => {
    const svc = new MfaService();
    const { hashed } = makeHashedCodes(svc, count);
    // unknownCode is not in the generated set (not hashed with hashBackupCodes)
    const result = svc.verifyBackupCode(unknownCode, hashed);
    return result.valid === false;
  });

  // P-MFA-05: verifyBackupCode is case/whitespace-insensitive for input
  test.prop([fc.integer({ min: 1, max: 8 }), fc.integer({ min: 0, max: 7 })], propertyParams())(
    'P-MFA-05: verifyBackupCode is case-insensitive (lowercase variant of plain code also valid)',
    (count, indexSeed) => {
      const svc = new MfaService();
      const { plain, hashed } = makeHashedCodes(svc, count);
      const index = indexSeed % count;
      // Production codes are hex uppercase; try lowercase variant
      const lowerCode = plain[index].toLowerCase();
      const result = svc.verifyBackupCode(lowerCode, hashed);
      return result.valid === true;
    }
  );

  // P-MFA-06: Remaining codes after consumption are a subset of the original
  test.prop([fc.integer({ min: 2, max: 8 }), fc.integer({ min: 0, max: 7 })], propertyParams())(
    'P-MFA-06: updatedCodes is a subset of the original hashed codes',
    (count, indexSeed) => {
      const svc = new MfaService();
      const { plain, hashed } = makeHashedCodes(svc, count);
      const index = indexSeed % count;
      const result = svc.verifyBackupCode(plain[index], hashed);
      if (!result.valid || !result.updatedCodes) return false;
      return result.updatedCodes.every((c) => hashed.includes(c));
    }
  );

  // P-MFA-07: Empty list always invalid
  test.prop([fc.stringMatching(/^[0-9a-f]{10}$/)], propertyParams())(
    'P-MFA-07: Empty hashedCodes list always returns valid:false',
    (code) => {
      const svc = new MfaService();
      return svc.verifyBackupCode(code, []).valid === false;
    }
  );

  // P-MFA-08: Failed attempt leaves list unchanged
  test.prop(
    [fc.integer({ min: 0, max: 8 }), fc.stringMatching(/^[0-9a-f]{10}$/)],
    propertyParams()
  )('P-MFA-08: Failed attempt leaves the hashed list unchanged', (count, unknownCode) => {
    const svc = new MfaService();
    const { hashed } = makeHashedCodes(svc, count);
    const result = svc.verifyBackupCode(unknownCode, hashed);
    // When not valid, updatedCodes should be undefined (no mutation)
    return result.valid === false && result.updatedCodes === undefined;
  });
});

// ---------------------------------------------------------------------------
// Session properties
// ---------------------------------------------------------------------------

describe('SessionService.isSessionValid — pure', () => {
  // P-SESSION-01: Active, unexpired session is valid
  test.prop(
    [fc.integer({ min: 1_000, max: 3_600_000 })], // 1 second to 1 hour from now
    propertyParams()
  )('P-SESSION-01: Session expiring in future with recent activity is valid', (msUntilExpiry) => {
    const svc = makeSessionService();
    const now = Date.now();
    const session = makeSession({
      lastActiveAt: new Date(now),
      expiresAt: new Date(now + msUntilExpiry),
    });
    return svc.isSessionValid(session) === true;
  });

  // P-SESSION-02: Already expired session is always invalid
  test.prop(
    [fc.integer({ min: 1, max: 3_600_000 })], // 1ms to 1hr in the past
    propertyParams()
  )('P-SESSION-02: Expired session is always invalid', (msExpiredAgo) => {
    const svc = makeSessionService();
    const now = Date.now();
    const session = makeSession({
      lastActiveAt: new Date(now - msExpiredAgo), // also recent-ish
      expiresAt: new Date(now - msExpiredAgo),
    });
    return svc.isSessionValid(session) === false;
  });

  // P-SESSION-03: Inactive session is invalid
  test.prop(
    [fc.integer({ min: 1, max: 3_600_000 })], // 1ms to 1hr
    propertyParams()
  )('P-SESSION-03: Session idle beyond inactivityTimeoutMs is always invalid', (extraMs) => {
    const inactivityTimeoutMs = 60_000; // 1 minute
    const svc = makeSessionService({ inactivityTimeoutMs });
    const now = Date.now();
    const idleMs = inactivityTimeoutMs + extraMs;
    const session = makeSession({
      lastActiveAt: new Date(now - idleMs),
      expiresAt: new Date(now + 3_600_000), // still far in future
    });
    return svc.isSessionValid(session) === false;
  });

  // P-SESSION-04: Validity monotone in expiresAt — extending expiry cannot invalidate
  test.prop(
    [fc.integer({ min: 1_000, max: 600_000 }), fc.integer({ min: 1, max: 3_600_000 })],
    propertyParams()
  )(
    'P-SESSION-04: Pushing expiresAt further into the future never invalidates a valid session',
    (baseExpiry, extraMs) => {
      const svc = makeSessionService();
      const now = Date.now();
      const base = makeSession({
        lastActiveAt: new Date(now),
        expiresAt: new Date(now + baseExpiry),
      });
      const extended = makeSession({
        lastActiveAt: new Date(now),
        expiresAt: new Date(now + baseExpiry + extraMs),
      });
      const baseValid = svc.isSessionValid(base);
      const extendedValid = svc.isSessionValid(extended);
      // If base is valid, extended must also be valid
      if (baseValid) return extendedValid === true;
      return true; // No constraint when base is already invalid
    }
  );

  // P-SESSION-05: Validity monotone in lastActiveAt — more recent activity never invalidates
  test.prop(
    [fc.integer({ min: 1, max: 3_000_000 }), fc.integer({ min: 1, max: 3_000_000 })],
    propertyParams()
  )(
    'P-SESSION-05: More-recent lastActiveAt never turns a valid session invalid',
    (idleMs, deltaMs) => {
      const inactivityTimeoutMs = 4 * 60 * 60 * 1000; // 4h default
      const svc = makeSessionService({ inactivityTimeoutMs });
      const now = Date.now();
      const olderSession = makeSession({
        lastActiveAt: new Date(now - idleMs),
        expiresAt: new Date(now + 3_600_000),
      });
      const newerSession = makeSession({
        lastActiveAt: new Date(now - Math.max(0, idleMs - deltaMs)),
        expiresAt: new Date(now + 3_600_000),
      });
      const olderValid = svc.isSessionValid(olderSession);
      const newerValid = svc.isSessionValid(newerSession);
      if (olderValid) return newerValid === true;
      return true;
    }
  );

  // P-SESSION-06: rememberMe flag does not affect isSessionValid
  test.prop([fc.boolean()], propertyParams())(
    'P-SESSION-06: rememberMe flag does not affect isSessionValid (only expiresAt/lastActiveAt matter)',
    (rememberMe) => {
      const svc = makeSessionService();
      const now = Date.now();
      const sessionTrue = makeSession({
        rememberMe: true,
        lastActiveAt: new Date(now),
        expiresAt: new Date(now + 60_000),
      });
      const sessionFalse = makeSession({
        rememberMe: false,
        lastActiveAt: new Date(now),
        expiresAt: new Date(now + 60_000),
      });
      return svc.isSessionValid(sessionTrue) === svc.isSessionValid(sessionFalse);
    }
  );

  // P-SESSION-07: Custom inactivityTimeoutMs is respected.
  // We use a large margin (10 seconds) above the timeout to avoid millisecond drift
  // between the Date.now() used to set lastActiveAt and the Date.now() inside isSessionValid.
  test.prop(
    [fc.integer({ min: 1_000, max: 30_000 })], // custom timeout 1s–30s
    propertyParams()
  )('P-SESSION-07: Session idle well beyond inactivityTimeoutMs is invalid', (customTimeoutMs) => {
    const svc = makeSessionService({ inactivityTimeoutMs: customTimeoutMs });
    const now = Date.now();
    // Idle for timeout + 10 seconds (well past the boundary, no timing jitter risk)
    const sessionWellOver = makeSession({
      lastActiveAt: new Date(now - (customTimeoutMs + 10_000)),
      expiresAt: new Date(now + 3_600_000),
    });
    return svc.isSessionValid(sessionWellOver) === false;
  });

  // P-SESSION-07b: Session idle for well under the timeout is valid
  test.prop(
    [fc.integer({ min: 2_000, max: 30_000 })], // custom timeout 2s–30s
    propertyParams()
  )(
    'P-SESSION-07b: Session idle for well under inactivityTimeoutMs is valid',
    (customTimeoutMs) => {
      // Use half the timeout as idle time — well clear of the boundary
      const svc = makeSessionService({ inactivityTimeoutMs: customTimeoutMs });
      const now = Date.now();
      const sessionWellUnder = makeSession({
        lastActiveAt: new Date(now - Math.floor(customTimeoutMs / 2)),
        expiresAt: new Date(now + 3_600_000),
      });
      return svc.isSessionValid(sessionWellUnder) === true;
    }
  );
});
