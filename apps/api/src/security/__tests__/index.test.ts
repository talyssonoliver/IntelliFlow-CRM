/**
 * Security Module Index Tests
 *
 * Tests that all exports from the security module are valid and accessible.
 */

import { describe, it, expect } from 'vitest';
import * as securityModule from '../index';

describe('Security Module Exports', () => {
  describe('Audit Logger Exports', () => {
    it('should export AuditLogger', () => {
      expect(securityModule.AuditLogger).toBeDefined();
    });

    it('should export getAuditLogger', () => {
      expect(securityModule.getAuditLogger).toBeDefined();
      expect(typeof securityModule.getAuditLogger).toBe('function');
    });

    it('should export resetAuditLogger', () => {
      expect(securityModule.resetAuditLogger).toBeDefined();
      expect(typeof securityModule.resetAuditLogger).toBe('function');
    });
  });

  describe('Audit Event Handler Exports', () => {
    it('should export AuditEventHandler', () => {
      expect(securityModule.AuditEventHandler).toBeDefined();
    });

    it('should export getAuditEventHandler', () => {
      expect(securityModule.getAuditEventHandler).toBeDefined();
      expect(typeof securityModule.getAuditEventHandler).toBe('function');
    });

    it('should export resetAuditEventHandler', () => {
      expect(securityModule.resetAuditEventHandler).toBeDefined();
      expect(typeof securityModule.resetAuditEventHandler).toBe('function');
    });

    it('should export auditDomainEvent', () => {
      expect(securityModule.auditDomainEvent).toBeDefined();
      expect(typeof securityModule.auditDomainEvent).toBe('function');
    });
  });

  describe('RBAC Service Exports', () => {
    it('should export RBACService', () => {
      expect(securityModule.RBACService).toBeDefined();
    });

    it('should export getRBACService', () => {
      expect(securityModule.getRBACService).toBeDefined();
      expect(typeof securityModule.getRBACService).toBe('function');
    });

    it('should export resetRBACService', () => {
      expect(securityModule.resetRBACService).toBeDefined();
      expect(typeof securityModule.resetRBACService).toBe('function');
    });

    it('should export Permissions', () => {
      expect(securityModule.Permissions).toBeDefined();
    });
  });

  describe('Middleware Exports', () => {
    it('should export createSecurityContextMiddleware', () => {
      expect(securityModule.createSecurityContextMiddleware).toBeDefined();
      expect(typeof securityModule.createSecurityContextMiddleware).toBe('function');
    });

    it('should export requirePermission', () => {
      expect(securityModule.requirePermission).toBeDefined();
      expect(typeof securityModule.requirePermission).toBe('function');
    });

    it('should export auditLog', () => {
      expect(securityModule.auditLog).toBeDefined();
      expect(typeof securityModule.auditLog).toBe('function');
    });

    it('should export securedAction', () => {
      expect(securityModule.securedAction).toBeDefined();
      expect(typeof securityModule.securedAction).toBe('function');
    });

    it('should export requireAdmin', () => {
      expect(securityModule.requireAdmin).toBeDefined();
      expect(typeof securityModule.requireAdmin).toBe('function');
    });

    it('should export requireManager', () => {
      expect(securityModule.requireManager).toBeDefined();
      expect(typeof securityModule.requireManager).toBe('function');
    });

    it('should export requireRole', () => {
      expect(securityModule.requireRole).toBeDefined();
      expect(typeof securityModule.requireRole).toBe('function');
    });

    it('should export requireOwnership', () => {
      expect(securityModule.requireOwnership).toBeDefined();
      expect(typeof securityModule.requireOwnership).toBe('function');
    });
  });

  describe('Tenant Context Exports', () => {
    it('should export extractTenantContext', () => {
      expect(securityModule.extractTenantContext).toBeDefined();
      expect(typeof securityModule.extractTenantContext).toBe('function');
    });

    it('should export createTenantScopedPrisma', () => {
      expect(securityModule.createTenantScopedPrisma).toBeDefined();
      expect(typeof securityModule.createTenantScopedPrisma).toBe('function');
    });

    it('should export tenantContextMiddleware', () => {
      expect(securityModule.tenantContextMiddleware).toBeDefined();
    });

    it('should export verifyTenantAccess', () => {
      expect(securityModule.verifyTenantAccess).toBeDefined();
      expect(typeof securityModule.verifyTenantAccess).toBe('function');
    });

    it('should export createTenantWhereClause', () => {
      expect(securityModule.createTenantWhereClause).toBeDefined();
      expect(typeof securityModule.createTenantWhereClause).toBe('function');
    });

    it('should export validateTenantOperation', () => {
      expect(securityModule.validateTenantOperation).toBeDefined();
      expect(typeof securityModule.validateTenantOperation).toBe('function');
    });

    it('should export getTeamMemberIds', () => {
      expect(securityModule.getTeamMemberIds).toBeDefined();
      expect(typeof securityModule.getTeamMemberIds).toBe('function');
    });

    it('should export enrichTenantContext', () => {
      expect(securityModule.enrichTenantContext).toBeDefined();
      expect(typeof securityModule.enrichTenantContext).toBe('function');
    });

    it('should export hasTenantContext', () => {
      expect(securityModule.hasTenantContext).toBeDefined();
      expect(typeof securityModule.hasTenantContext).toBe('function');
    });

    it('should export assertTenantContext', () => {
      expect(securityModule.assertTenantContext).toBeDefined();
      expect(typeof securityModule.assertTenantContext).toBe('function');
    });
  });

  describe('Tenant Limiter Exports', () => {
    it('should export getTenantLimits', () => {
      expect(securityModule.getTenantLimits).toBeDefined();
      expect(typeof securityModule.getTenantLimits).toBe('function');
    });

    it('should export checkResourceUsage', () => {
      expect(securityModule.checkResourceUsage).toBeDefined();
      expect(typeof securityModule.checkResourceUsage).toBe('function');
    });

    it('should export enforceResourceLimit', () => {
      expect(securityModule.enforceResourceLimit).toBeDefined();
      expect(typeof securityModule.enforceResourceLimit).toBe('function');
    });

    it('should export rateLimitMiddleware', () => {
      expect(securityModule.rateLimitMiddleware).toBeDefined();
    });

    it('should export concurrentRequestMiddleware', () => {
      expect(securityModule.concurrentRequestMiddleware).toBeDefined();
    });

    it('should export resourceLimitMiddleware', () => {
      expect(securityModule.resourceLimitMiddleware).toBeDefined();
    });

    it('should export getAllResourceUsage', () => {
      expect(securityModule.getAllResourceUsage).toBeDefined();
      expect(typeof securityModule.getAllResourceUsage).toBe('function');
    });

    it('should export checkApproachingLimits', () => {
      expect(securityModule.checkApproachingLimits).toBeDefined();
      expect(typeof securityModule.checkApproachingLimits).toBe('function');
    });

    it('should export clearRateLimitState', () => {
      expect(securityModule.clearRateLimitState).toBeDefined();
      expect(typeof securityModule.clearRateLimitState).toBe('function');
    });

    it('should export DEFAULT_LIMITS', () => {
      expect(securityModule.DEFAULT_LIMITS).toBeDefined();
    });
  });

  describe('Encryption Exports', () => {
    it('should export EncryptionService', () => {
      expect(securityModule.EncryptionService).toBeDefined();
    });

    it('should export EncryptionError', () => {
      expect(securityModule.EncryptionError).toBeDefined();
    });

    it('should export EnvironmentKeyProvider', () => {
      expect(securityModule.EnvironmentKeyProvider).toBeDefined();
    });

    it('should export VaultKeyProvider', () => {
      expect(securityModule.VaultKeyProvider).toBeDefined();
    });

    it('should export FieldEncryption', () => {
      expect(securityModule.FieldEncryption).toBeDefined();
    });

    it('should export getEncryptionService', () => {
      expect(securityModule.getEncryptionService).toBeDefined();
      expect(typeof securityModule.getEncryptionService).toBe('function');
    });

    it('should export resetEncryptionService', () => {
      expect(securityModule.resetEncryptionService).toBeDefined();
      expect(typeof securityModule.resetEncryptionService).toBe('function');
    });
  });

  describe('Key Rotation Exports', () => {
    it('should export KeyRotationService', () => {
      expect(securityModule.KeyRotationService).toBeDefined();
    });

    it('should export InMemoryKeyVersionStore', () => {
      expect(securityModule.InMemoryKeyVersionStore).toBeDefined();
    });

    it('should export VaultKeyVersionStore', () => {
      expect(securityModule.VaultKeyVersionStore).toBeDefined();
    });

    it('should export getKeyRotationService', () => {
      expect(securityModule.getKeyRotationService).toBeDefined();
      expect(typeof securityModule.getKeyRotationService).toBe('function');
    });

    it('should export resetKeyRotationService', () => {
      expect(securityModule.resetKeyRotationService).toBeDefined();
      expect(typeof securityModule.resetKeyRotationService).toBe('function');
    });
  });

  describe('Type Exports', () => {
    it('should be a valid module with all required exports', () => {
      // Verify the module exports are all present
      const exportKeys = Object.keys(securityModule);
      expect(exportKeys.length).toBeGreaterThan(30);
    });
  });
});
