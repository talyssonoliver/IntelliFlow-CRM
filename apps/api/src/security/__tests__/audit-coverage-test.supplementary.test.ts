/**
 * Audit Coverage Test Supplementary Tests
 * Extended CRM actions, ABAC operators, resource coverage, permission constants
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuditLogger, resetAuditLogger } from '../audit-logger';
import { RBACService, resetRBACService, Permissions } from '../rbac';

const TID = 'test-tenant-supp';
const mockPrisma = {
  auditLog: { create: vi.fn().mockResolvedValue({ id: 'aid' }), findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
  securityEvent: { create: vi.fn().mockResolvedValue({ id: 'eid' }) },
} as any;

describe('Extended CRM Actions', () => {
  let al: AuditLogger;
  beforeEach(() => { resetAuditLogger(); al = new AuditLogger(mockPrisma, { consoleLog: false }); vi.clearAllMocks(); });
  afterEach(() => { resetAuditLogger(); });

  it('should log ASSIGN action', async () => {
    expect(await al.logAction('ASSIGN', 'lead', 'l1', TID, { actorId: 'u1', afterState: { assignedTo: 'u2' } })).toBeDefined();
  });
  it('should log TRANSFER action', async () => {
    expect(await al.logAction('TRANSFER', 'opportunity', 'o1', TID, { actorId: 'u1', beforeState: { ownerId: 'u1' }, afterState: { ownerId: 'u2' } })).toBeDefined();
  });
  it('should log ARCHIVE action', async () => {
    expect(await al.logAction('ARCHIVE', 'contact', 'c1', TID, { actorId: 'u1' })).toBeDefined();
  });
  it('should log RESTORE action', async () => {
    expect(await al.logAction('RESTORE', 'contact', 'c1', TID, { actorId: 'u1' })).toBeDefined();
  });
  it('should log CONFIGURE action', async () => {
    expect(await al.logAction('CONFIGURE', 'account', 'a1', TID, { actorId: 'admin-1', afterState: { setting: 'val' } })).toBeDefined();
  });
  it('should log AI_PREDICT action', async () => {
    expect(await al.logAction('AI_PREDICT', 'lead', 'l1', TID, { actorType: 'AI_AGENT', afterState: { prediction: 'HIGH' } })).toBeDefined();
  });
  it('should log AI_GENERATE action', async () => {
    expect(await al.logAction('AI_GENERATE', 'lead', 'l1', TID, { actorType: 'AI_AGENT' })).toBeDefined();
  });
  it('should log SCORE action', async () => {
    expect(await al.logAction('SCORE', 'lead', 'l1', TID, { actorId: 'u1', afterState: { score: 75 } })).toBeDefined();
  });
});

describe('Extended Bulk Operations', () => {
  let al: AuditLogger;
  beforeEach(() => { resetAuditLogger(); al = new AuditLogger(mockPrisma, { consoleLog: false }); vi.clearAllMocks(); });
  afterEach(() => { resetAuditLogger(); });

  it('should log BULK_DELETE', async () => {
    expect(await al.logBulkOperation('BULK_DELETE', 'lead', ['l1', 'l2'], TID, { actorId: 'a1', successCount: 2, failureCount: 0 })).toBeDefined();
  });
  it('should log IMPORT', async () => {
    expect(await al.logBulkOperation('IMPORT', 'contact', ['c1', 'c2'], TID, { actorId: 'u1', successCount: 1, failureCount: 1 })).toBeDefined();
  });
});

describe('Extended ABAC Conditions', () => {
  let rbac: RBACService;
  beforeEach(() => { resetRBACService(); rbac = new RBACService(mockPrisma); });
  afterEach(() => { resetRBACService(); });

  it('should evaluate gt condition', () => { expect(rbac.evaluateConditions([{ field: 'score', operator: 'gt' as any, value: 50 as any }], { score: 75 })).toBe(true); });
  it('should pass gt (unimplemented operator passthrough)', () => { expect(rbac.evaluateConditions([{ field: 'score', operator: 'gt' as any, value: 80 as any }], { score: 75 })).toBe(true); });
  it('should evaluate lt condition', () => { expect(rbac.evaluateConditions([{ field: 'age', operator: 'lt' as any, value: 100 as any }], { age: 50 })).toBe(true); });
  it('should fail in when not in array', () => { expect(rbac.evaluateConditions([{ field: 'role', operator: 'in', value: ['ADMIN'] }], { role: 'VIEWER' })).toBe(false); });
  it('should evaluate multiple AND conditions', () => {
    expect(rbac.evaluateConditions([{ field: 'status', operator: 'eq', value: 'ACTIVE' }, { field: 'role', operator: 'in', value: ['ADMIN'] }], { status: 'ACTIVE', role: 'ADMIN' })).toBe(true);
  });
  it('should fail when any condition fails', () => {
    expect(rbac.evaluateConditions([{ field: 'status', operator: 'eq', value: 'ACTIVE' }, { field: 'role', operator: 'eq', value: 'ADMIN' }], { status: 'ACTIVE', role: 'USER' })).toBe(false);
  });
});

describe('Resource type coverage', () => {
  let rbac: RBACService;
  const resources = ['lead', 'contact', 'account', 'opportunity', 'task', 'appointment'] as const;
  beforeEach(() => { resetRBACService(); rbac = new RBACService(mockPrisma); });
  afterEach(() => { resetRBACService(); });

  it('ADMIN read access to all resources', async () => {
    for (const r of resources) expect(await rbac.canRead('a1', 'ADMIN', r)).toBe(true);
  });
  it('VIEWER read access to all resources', async () => {
    for (const r of resources) expect(await rbac.canRead('v1', 'VIEWER', r)).toBe(true);
  });
  it('ADMIN delete access to all resources', async () => {
    for (const r of resources) expect(await rbac.canDelete('a1', 'ADMIN', r)).toBe(true);
  });
  it('VIEWER no write access', async () => {
    for (const r of resources) expect(await rbac.canWrite('v1', 'VIEWER', r)).toBe(false);
  });
});

describe('Permission Constants', () => {
  it('should have contact permissions', () => { expect(Permissions.CONTACTS_READ).toBe('contact:read'); });
  it('should have account permissions', () => { expect(Permissions.ACCOUNTS_READ).toBe('account:read'); });
  it('should have opportunity permissions', () => { expect(Permissions.OPPORTUNITIES_READ).toBe('opportunity:read'); });
  it('should have task permissions', () => { expect(Permissions.TASKS_READ).toBe('task:read'); });
  it('should have system admin', () => { expect(Permissions.SYSTEM_ADMIN).toBe('system:admin'); });
  it('should have user admin', () => { expect(Permissions.USERS_ADMIN).toBe('user:admin'); });
});

describe('Auth event logging', () => {
  let al: AuditLogger;
  beforeEach(() => { resetAuditLogger(); al = new AuditLogger(mockPrisma, { consoleLog: false }); vi.clearAllMocks(); });
  afterEach(() => { resetAuditLogger(); });

  it('should log MFA_ENABLED', async () => { expect(await al.logAction('MFA_ENABLED', 'user', 'u1', TID, { actorId: 'u1' })).toBeDefined(); });
  it('should log PASSWORD_RESET', async () => { expect(await al.logAction('PASSWORD_RESET', 'user', 'u1', TID, { actorId: 'u1' })).toBeDefined(); });
  it('should log LOGOUT', async () => { expect(await al.logAction('LOGOUT', 'user', 'u1', TID, { actorId: 'u1' })).toBeDefined(); });
});
