/**
 * RBAC/ABAC Permission Service
 *
 * Implements Role-Based Access Control (RBAC) with Attribute-Based Access Control (ABAC) extensions.
 *
 * IMPLEMENTS: IFC-098 (RBAC/ABAC & Audit Trail)
 *
 * Features:
 * - Role-based permission checks (ADMIN, MANAGER, SALES_REP, USER, VIEWER)
 * - Attribute-based conditions (e.g., only own records)
 * - Permission caching for performance
 * - Hierarchical role evaluation
 *
 * Usage:
 * ```typescript
 * const rbac = new RBACService(prisma);
 *
 * // Check if user can read a lead
 * const canRead = await rbac.can(user, 'read', 'lead', { resourceId: lead.id, ownerId: lead.ownerId });
 *
 * // Get all permissions for a user
 * const permissions = await rbac.getPermissions(userId);
 * ```
 */

import { PrismaClient } from '@prisma/client';
import {
  RoleName,
  ROLE_LEVELS,
  PermissionAction,
  ResourceType,
  PermissionCheckResult,
  PermissionContext,
  AttributeCondition,
} from './types';

/**
 * Default permissions matrix by role
 *
 * Format: { [role]: { [resource]: [actions] } }
 */
const DEFAULT_PERMISSIONS: Record<RoleName, Record<ResourceType, PermissionAction[]>> = {
  ADMIN: {
    lead: ['read', 'write', 'delete', 'export', 'manage', 'admin'],
    contact: ['read', 'write', 'delete', 'export', 'manage', 'admin'],
    account: ['read', 'write', 'delete', 'export', 'manage', 'admin'],
    opportunity: ['read', 'write', 'delete', 'export', 'manage', 'admin'],
    task: ['read', 'write', 'delete', 'export', 'manage', 'admin'],
    user: ['read', 'write', 'delete', 'export', 'manage', 'admin'],
    ai_score: ['read', 'write', 'delete', 'export', 'manage', 'admin'],
    appointment: ['read', 'write', 'delete', 'export', 'manage', 'admin'],
    session: ['read', 'write', 'delete', 'manage', 'admin'],
    system: ['read', 'write', 'admin'],
  },
  MANAGER: {
    lead: ['read', 'write', 'delete', 'export', 'manage'],
    contact: ['read', 'write', 'delete', 'export', 'manage'],
    account: ['read', 'write', 'delete', 'export', 'manage'],
    opportunity: ['read', 'write', 'delete', 'export', 'manage'],
    task: ['read', 'write', 'delete', 'export', 'manage'],
    user: ['read', 'manage'],
    ai_score: ['read', 'write', 'manage'],
    appointment: ['read', 'write', 'delete', 'export', 'manage'],
    session: ['read', 'write', 'delete', 'manage'],
    system: ['read'],
  },
  SALES_REP: {
    lead: ['read', 'write', 'delete', 'export'],
    contact: ['read', 'write', 'delete', 'export'],
    account: ['read', 'write', 'export'],
    opportunity: ['read', 'write', 'delete', 'export'],
    task: ['read', 'write', 'delete'],
    user: ['read'],
    ai_score: ['read', 'write'],
    appointment: ['read', 'write', 'delete'],
    session: ['read', 'write', 'delete'],
    system: [],
  },
  USER: {
    lead: ['read', 'write'],
    contact: ['read', 'write'],
    account: ['read'],
    opportunity: ['read', 'write'],
    task: ['read', 'write'],
    user: ['read'],
    ai_score: ['read'],
    appointment: ['read', 'write'],
    session: ['read', 'write', 'delete'],
    system: [],
  },
  VIEWER: {
    lead: ['read'],
    contact: ['read'],
    account: ['read'],
    opportunity: ['read'],
    task: ['read'],
    user: ['read'],
    ai_score: ['read'],
    appointment: ['read'],
    session: ['read'],
    system: [],
  },
};

/**
 * Ownership restrictions by role
 *
 * If true, non-admin roles can only access their own records
 */
const OWNERSHIP_RESTRICTIONS: Record<RoleName, boolean> = {
  ADMIN: false, // Admin can access all records
  MANAGER: false, // Manager can access team records
  SALES_REP: true, // Sales rep can only access own records
  USER: true, // User can only access own records
  VIEWER: false, // Viewer has read-only access to all
};

/**
 * RBAC Service class
 */
export class RBACService {
  private prisma: PrismaClient;
  private permissionCache: Map<string, { permissions: string[]; timestamp: number }> = new Map();
  private cacheMaxAge = 60 * 1000; // 1 minute

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Check if a user can perform an action on a resource
   *
   * @param context - Permission context with user, action, and resource info
   * @returns Permission check result
   */
  async can(context: PermissionContext): Promise<PermissionCheckResult> {
    const { userId, userRole, resourceType, action, resourceId, resourceOwnerId } = context;
    const roleLevel = ROLE_LEVELS[userRole] ?? 0;
    const checkedPermissions: string[] = [];

    // Check role-based permissions
    const rolePermissions = DEFAULT_PERMISSIONS[userRole]?.[resourceType] ?? [];
    const permissionId = `${resourceType}:${action}`;
    checkedPermissions.push(permissionId);

    const hasRolePermission = rolePermissions.includes(action);

    if (!hasRolePermission) {
      return {
        granted: false,
        reason: `Role ${userRole} does not have ${action} permission on ${resourceType}`,
        checkedPermissions,
        roleLevel,
      };
    }

    // Check ownership restrictions (ABAC)
    if (OWNERSHIP_RESTRICTIONS[userRole] && resourceOwnerId) {
      if (resourceOwnerId !== userId) {
        // Check if the action is a read action (viewers can read all)
        if (userRole === 'VIEWER' && action === 'read') {
          // Viewers can read all records
        } else {
          return {
            granted: false,
            reason: `User ${userId} cannot ${action} ${resourceType} owned by ${resourceOwnerId}`,
            checkedPermissions,
            roleLevel,
          };
        }
      }
    }

    // Check for custom user-level permission overrides
    const userOverride = await this.getUserPermissionOverride(userId, permissionId);
    if (userOverride !== null) {
      checkedPermissions.push(`user_override:${permissionId}`);
      return {
        granted: userOverride,
        reason: userOverride ? 'Granted by user override' : 'Denied by user override',
        checkedPermissions,
        roleLevel,
      };
    }

    return {
      granted: true,
      checkedPermissions,
      roleLevel,
    };
  }

  /**
   * Shorthand permission check methods
   */
  async canRead(
    userId: string,
    userRole: RoleName,
    resourceType: ResourceType,
    resourceOwnerId?: string
  ): Promise<boolean> {
    const result = await this.can({
      userId,
      userRole,
      resourceType,
      action: 'read',
      resourceOwnerId,
    });
    return result.granted;
  }

  async canWrite(
    userId: string,
    userRole: RoleName,
    resourceType: ResourceType,
    resourceOwnerId?: string
  ): Promise<boolean> {
    const result = await this.can({
      userId,
      userRole,
      resourceType,
      action: 'write',
      resourceOwnerId,
    });
    return result.granted;
  }

  async canDelete(
    userId: string,
    userRole: RoleName,
    resourceType: ResourceType,
    resourceOwnerId?: string
  ): Promise<boolean> {
    const result = await this.can({
      userId,
      userRole,
      resourceType,
      action: 'delete',
      resourceOwnerId,
    });
    return result.granted;
  }

  async canManage(
    userId: string,
    userRole: RoleName,
    resourceType: ResourceType
  ): Promise<boolean> {
    const result = await this.can({ userId, userRole, resourceType, action: 'manage' });
    return result.granted;
  }

  async canExport(
    userId: string,
    userRole: RoleName,
    resourceType: ResourceType
  ): Promise<boolean> {
    const result = await this.can({ userId, userRole, resourceType, action: 'export' });
    return result.granted;
  }

  /**
   * Get all permissions for a user
   */
  async getPermissions(userId: string, userRole: RoleName): Promise<string[]> {
    const cacheKey = `${userId}:${userRole}`;
    const cached = this.permissionCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.cacheMaxAge) {
      return cached.permissions;
    }

    const permissions: string[] = [];

    // Add role-based permissions
    const rolePerms = DEFAULT_PERMISSIONS[userRole];
    if (rolePerms) {
      for (const [resource, actions] of Object.entries(rolePerms)) {
        for (const action of actions) {
          permissions.push(`${resource}:${action}`);
        }
      }
    }

    // Cache the result
    this.permissionCache.set(cacheKey, {
      permissions,
      timestamp: Date.now(),
    });

    return permissions;
  }

  /**
   * Check if user has a specific permission by ID
   */
  async hasPermission(userId: string, userRole: RoleName, permissionId: string): Promise<boolean> {
    const [resourceType, action] = permissionId.split(':') as [ResourceType, PermissionAction];
    const result = await this.can({ userId, userRole, resourceType, action });
    return result.granted;
  }

  /**
   * Get the role level for comparison
   */
  getRoleLevel(role: RoleName): number {
    return ROLE_LEVELS[role] ?? 0;
  }

  /**
   * Check if a role is at or above a minimum level
   */
  isRoleAtLevel(role: RoleName, minLevel: number): boolean {
    return this.getRoleLevel(role) >= minLevel;
  }

  /**
   * Check if a role is admin or manager
   */
  isManager(role: RoleName): boolean {
    return this.isRoleAtLevel(role, ROLE_LEVELS.MANAGER);
  }

  /**
   * Check if a role is admin
   */
  isAdmin(role: RoleName): boolean {
    return role === 'ADMIN';
  }

  /**
   * Get user permission override from database
   *
   * Queries the UserPermission table to check for user-specific permission overrides.
   * Returns null if no override exists, otherwise returns the granted status.
   */
  private async getUserPermissionOverride(
    userId: string,
    permissionId: string
  ): Promise<boolean | null> {
    try {
      // First, find the permission by name (e.g., 'lead:read')
      const permission = await this.prisma.permission.findUnique({
        where: { name: permissionId },
      });

      if (!permission) {
        return null; // Permission not in database, use default behavior
      }

      // Check for user-specific override
      const userPermission = await this.prisma.userPermission.findUnique({
        where: {
          userId_permissionId: {
            userId,
            permissionId: permission.id,
          },
        },
      });

      if (!userPermission) {
        return null; // No override exists
      }

      // Check if override has expired
      if (userPermission.expiresAt && userPermission.expiresAt < new Date()) {
        return null; // Override has expired
      }

      return userPermission.granted;
    } catch (error) {
      // If tables don't exist yet, return null (use defaults)
      console.debug('[RBAC] Permission override check failed, using defaults:', error);
      return null;
    }
  }

  /**
   * Get user's RBAC roles from database
   *
   * Queries the UserRoleAssignment table to get all active roles for a user.
   * Falls back to the user's simple role if no assignments found.
   */
  async getUserRBACRoles(userId: string): Promise<RoleName[]> {
    try {
      const roleAssignments = await this.prisma.userRoleAssignment.findMany({
        where: {
          userId,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } },
          ],
        },
        include: {
          role: true,
        },
      });

      if (roleAssignments.length === 0) {
        return []; // No database roles, will use simple role from User model
      }

      return roleAssignments
        .map((ra) => ra.role.name as RoleName)
        .filter((name): name is RoleName =>
          ['ADMIN', 'MANAGER', 'SALES_REP', 'USER', 'VIEWER'].includes(name)
        );
    } catch (error) {
      // If table doesn't exist yet, return empty array
      console.debug('[RBAC] Role assignment check failed:', error);
      return [];
    }
  }

  /**
   * Get permissions from database for a role
   *
   * Queries the RolePermission table to get all permissions for an RBAC role.
   */
  async getRolePermissionsFromDB(roleName: string): Promise<string[]> {
    try {
      const role = await this.prisma.rBACRole.findUnique({
        where: { name: roleName },
        include: {
          permissions: {
            where: { granted: true },
            include: { permission: true },
          },
        },
      });

      if (!role) {
        return [];
      }

      return role.permissions.map((rp) => rp.permission.name);
    } catch (error) {
      // If tables don't exist yet, return empty array
      console.debug('[RBAC] Database role permissions check failed:', error);
      return [];
    }
  }

  /**
   * Get all permissions for a user, combining database and default permissions
   *
   * Priority order:
   * 1. User-specific overrides (highest)
   * 2. Database RBAC roles
   * 3. Default role permissions (fallback)
   */
  async getPermissionsWithDB(userId: string, userRole: RoleName): Promise<string[]> {
    const cacheKey = `db:${userId}:${userRole}`;
    const cached = this.permissionCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.cacheMaxAge) {
      return cached.permissions;
    }

    const permissions = new Set<string>();

    // 1. Start with default role permissions
    const defaultPerms = DEFAULT_PERMISSIONS[userRole];
    if (defaultPerms) {
      for (const [resource, actions] of Object.entries(defaultPerms)) {
        for (const action of actions) {
          permissions.add(`${resource}:${action}`);
        }
      }
    }

    // 2. Add database RBAC roles permissions
    const dbRoles = await this.getUserRBACRoles(userId);
    for (const role of dbRoles) {
      const rolePerms = await this.getRolePermissionsFromDB(role);
      rolePerms.forEach((p) => permissions.add(p));
    }

    // 3. Apply user-specific overrides
    try {
      const userOverrides = await this.prisma.userPermission.findMany({
        where: {
          userId,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } },
          ],
        },
        include: { permission: true },
      });

      for (const override of userOverrides) {
        if (override.granted) {
          permissions.add(override.permission.name);
        } else {
          permissions.delete(override.permission.name);
        }
      }
    } catch (error) {
      // If table doesn't exist, skip overrides
      console.debug('[RBAC] User overrides check failed:', error);
    }

    const result = Array.from(permissions);

    // Cache the result
    this.permissionCache.set(cacheKey, {
      permissions: result,
      timestamp: Date.now(),
    });

    return result;
  }

  /**
   * Assign an RBAC role to a user
   */
  async assignRole(
    userId: string,
    roleName: string,
    assignedBy?: string,
    expiresAt?: Date
  ): Promise<void> {
    const role = await this.prisma.rBACRole.findUnique({
      where: { name: roleName },
    });

    if (!role) {
      throw new Error(`Role ${roleName} not found`);
    }

    await this.prisma.userRoleAssignment.upsert({
      where: {
        userId_roleId: { userId, roleId: role.id },
      },
      create: {
        userId,
        roleId: role.id,
        assignedBy,
        expiresAt,
      },
      update: {
        assignedBy,
        expiresAt,
        assignedAt: new Date(),
      },
    });

    // Clear cache for this user
    this.clearCache(userId);
  }

  /**
   * Remove an RBAC role from a user
   */
  async removeRole(userId: string, roleName: string): Promise<void> {
    const role = await this.prisma.rBACRole.findUnique({
      where: { name: roleName },
    });

    if (!role) {
      return; // Role doesn't exist, nothing to remove
    }

    await this.prisma.userRoleAssignment.deleteMany({
      where: {
        userId,
        roleId: role.id,
      },
    });

    // Clear cache for this user
    this.clearCache(userId);
  }

  /**
   * Grant or deny a specific permission to a user
   */
  async setUserPermission(
    userId: string,
    permissionName: string,
    granted: boolean,
    grantedBy?: string,
    reason?: string,
    expiresAt?: Date
  ): Promise<void> {
    const permission = await this.prisma.permission.findUnique({
      where: { name: permissionName },
    });

    if (!permission) {
      throw new Error(`Permission ${permissionName} not found`);
    }

    await this.prisma.userPermission.upsert({
      where: {
        userId_permissionId: { userId, permissionId: permission.id },
      },
      create: {
        userId,
        permissionId: permission.id,
        granted,
        grantedBy,
        reason,
        expiresAt,
      },
      update: {
        granted,
        grantedBy,
        reason,
        expiresAt,
        grantedAt: new Date(),
      },
    });

    // Clear cache for this user
    this.clearCache(userId);
  }

  /**
   * Remove a user-specific permission override
   */
  async removeUserPermission(userId: string, permissionName: string): Promise<void> {
    const permission = await this.prisma.permission.findUnique({
      where: { name: permissionName },
    });

    if (!permission) {
      return; // Permission doesn't exist
    }

    await this.prisma.userPermission.deleteMany({
      where: {
        userId,
        permissionId: permission.id,
      },
    });

    // Clear cache for this user
    this.clearCache(userId);
  }

  /**
   * Clear the permission cache (call when permissions are updated)
   */
  clearCache(userId?: string): void {
    if (userId) {
      for (const key of this.permissionCache.keys()) {
        if (key.startsWith(`${userId}:`)) {
          this.permissionCache.delete(key);
        }
      }
    } else {
      this.permissionCache.clear();
    }
  }

  /**
   * Evaluate ABAC conditions
   */
  evaluateConditions(conditions: AttributeCondition[], context: Record<string, unknown>): boolean {
    for (const condition of conditions) {
      const value = context[condition.field];

      switch (condition.operator) {
        case 'eq':
          if (value !== condition.value) return false;
          break;
        case 'neq':
          if (value === condition.value) return false;
          break;
        case 'in':
          if (!Array.isArray(condition.value) || !condition.value.includes(value as string))
            return false;
          break;
        case 'contains':
          if (typeof value !== 'string' || !value.includes(condition.value as string)) return false;
          break;
        case 'startsWith':
          if (typeof value !== 'string' || !value.startsWith(condition.value as string))
            return false;
          break;
      }
    }

    return true;
  }
}

/**
 * Create a singleton RBAC service instance
 */
let rbacServiceInstance: RBACService | null = null;

export function getRBACService(prisma: PrismaClient): RBACService {
  if (!rbacServiceInstance) {
    rbacServiceInstance = new RBACService(prisma);
  }
  return rbacServiceInstance;
}

/**
 * Reset the RBAC service instance (for testing)
 */
export function resetRBACService(): void {
  rbacServiceInstance = null;
}

/**
 * Permission constants for easy reference
 */
export const Permissions = {
  // Lead permissions
  LEADS_READ: 'lead:read' as const,
  LEADS_WRITE: 'lead:write' as const,
  LEADS_DELETE: 'lead:delete' as const,
  LEADS_EXPORT: 'lead:export' as const,
  LEADS_MANAGE: 'lead:manage' as const,

  // Contact permissions
  CONTACTS_READ: 'contact:read' as const,
  CONTACTS_WRITE: 'contact:write' as const,
  CONTACTS_DELETE: 'contact:delete' as const,
  CONTACTS_EXPORT: 'contact:export' as const,
  CONTACTS_MANAGE: 'contact:manage' as const,

  // Account permissions
  ACCOUNTS_READ: 'account:read' as const,
  ACCOUNTS_WRITE: 'account:write' as const,
  ACCOUNTS_DELETE: 'account:delete' as const,
  ACCOUNTS_EXPORT: 'account:export' as const,
  ACCOUNTS_MANAGE: 'account:manage' as const,

  // Opportunity permissions
  OPPORTUNITIES_READ: 'opportunity:read' as const,
  OPPORTUNITIES_WRITE: 'opportunity:write' as const,
  OPPORTUNITIES_DELETE: 'opportunity:delete' as const,
  OPPORTUNITIES_EXPORT: 'opportunity:export' as const,
  OPPORTUNITIES_MANAGE: 'opportunity:manage' as const,

  // Task permissions
  TASKS_READ: 'task:read' as const,
  TASKS_WRITE: 'task:write' as const,
  TASKS_DELETE: 'task:delete' as const,
  TASKS_MANAGE: 'task:manage' as const,

  // User permissions
  USERS_READ: 'user:read' as const,
  USERS_WRITE: 'user:write' as const,
  USERS_DELETE: 'user:delete' as const,
  USERS_MANAGE: 'user:manage' as const,
  USERS_ADMIN: 'user:admin' as const,

  // System permissions
  SYSTEM_READ: 'system:read' as const,
  SYSTEM_WRITE: 'system:write' as const,
  SYSTEM_ADMIN: 'system:admin' as const,
} as const;
