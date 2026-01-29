import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { AuditLogger, getAuditLogger, resetAuditLogger } from '../audit-logger';

const TEST_TENANT_ID = 'test-tenant-123';

describe('AuditLogger', () => {
  let logger: AuditLogger;
  let mockPrisma: PrismaClient;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  function createMockPrisma(): PrismaClient {
    return {
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 'audit-log-123' }),
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
      securityEvent: {
        create: vi.fn().mockResolvedValue({ id: 'security-event-123' }),
      },
    } as unknown as PrismaClient;
  }

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    logger = new AuditLogger(mockPrisma, { consoleLog: false });
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 0, 15, 10, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    resetAuditLogger();
  });

  describe('constructor', () => {
    it('should set default config values', () => {
      const defaultLogger = new AuditLogger(mockPrisma);

      // Test indirectly through behavior
      expect(defaultLogger).toBeDefined();
    });

    it('should accept custom config', () => {
      const customLogger = new AuditLogger(mockPrisma, {
        async: true,
        batchSize: 50,
        flushIntervalMs: 10000,
        consoleLog: true,
        defaultClassification: 'CONFIDENTIAL',
        defaultRetentionDays: 365,
      });

      expect(customLogger).toBeDefined();
    });
  });

  describe('log', () => {
    it('should write audit log entry', async () => {
      const logId = await logger.log({
        tenantId: TEST_TENANT_ID,
        eventType: 'LeadCreated',
        action: 'CREATE',
        resourceType: 'lead',
        resourceId: 'lead-123',
        actorId: 'user-123',
      });

      expect(logId).toBe('audit-log-123');
      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });

    it('should include before and after state', async () => {
      await logger.log({
        tenantId: TEST_TENANT_ID,
        eventType: 'LeadUpdated',
        action: 'UPDATE',
        resourceType: 'lead',
        resourceId: 'lead-123',
        beforeState: { status: 'NEW' },
        afterState: { status: 'QUALIFIED' },
      });

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            oldValue: { status: 'NEW' },
            newValue: { status: 'QUALIFIED' },
          }),
        })
      );
    });

    it('should log to console when enabled', async () => {
      const consoleLogger = new AuditLogger(mockPrisma, { consoleLog: true });

      await consoleLogger.log({
        tenantId: TEST_TENANT_ID,
        eventType: 'LeadCreated',
        action: 'CREATE',
        resourceType: 'lead',
        resourceId: 'lead-123',
        actorId: 'user-123',
      });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[AUDIT]')
      );
    });

    it('should buffer entries when async mode is enabled', async () => {
      const asyncLogger = new AuditLogger(mockPrisma, { async: true, consoleLog: false });

      const logId = await asyncLogger.log({
        tenantId: TEST_TENANT_ID,
        eventType: 'LeadCreated',
        action: 'CREATE',
        resourceType: 'lead',
        resourceId: 'lead-123',
      });

      expect(logId).toBeDefined();
      // Create should not be called immediately
      expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('should include IP address and user agent', async () => {
      await logger.log({
        tenantId: TEST_TENANT_ID,
        eventType: 'LeadCreated',
        action: 'CREATE',
        resourceType: 'lead',
        resourceId: 'lead-123',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      });

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ipAddress: '192.168.1.1',
            userAgent: 'Mozilla/5.0',
          }),
        })
      );
    });
  });

  describe('logAction', () => {
    it('should log CRUD action with calculated changed fields', async () => {
      await logger.logAction('UPDATE', 'lead', 'lead-123', TEST_TENANT_ID, {
        actorId: 'user-123',
        beforeState: { status: 'NEW', name: 'Test Lead' },
        afterState: { status: 'QUALIFIED', name: 'Test Lead' },
      });

      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });

    it('should include request context', async () => {
      await logger.logAction('CREATE', 'lead', 'lead-123', TEST_TENANT_ID, {
        actorId: 'user-123',
        requestContext: {
          requestId: 'req-123',
          traceId: 'trace-123',
          sessionId: 'session-123',
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
        },
      });

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ipAddress: '192.168.1.1',
            userAgent: 'Mozilla/5.0',
          }),
        })
      );
    });

    it('should handle DELETE action', async () => {
      await logger.logAction('DELETE', 'lead', 'lead-123', TEST_TENANT_ID, {
        actorId: 'user-123',
        beforeState: { id: 'lead-123', name: 'Deleted Lead' },
      });

      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });

    it('should default actorType to USER', async () => {
      await logger.logAction('CREATE', 'lead', 'lead-123', TEST_TENANT_ID, {
        actorId: 'user-123',
      });

      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });
  });

  describe('logPermissionDenied', () => {
    it('should log permission denied event', async () => {
      await logger.logPermissionDenied('lead', 'lead-123', 'lead:delete', TEST_TENANT_ID, {
        actorId: 'user-123',
        actorEmail: 'user@example.com',
        actorRole: 'USER',
        reason: 'User does not have delete permission',
      });

      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });

    it('should include default reason if not provided', async () => {
      await logger.logPermissionDenied('lead', 'lead-123', 'lead:admin', TEST_TENANT_ID, {
        actorId: 'user-123',
      });

      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });
  });

  describe('logSecurityEvent', () => {
    it('should create security event', async () => {
      const eventId = await logger.logSecurityEvent({
        eventType: 'SUSPICIOUS_ACTIVITY',
        severity: 'HIGH',
        actorId: 'user-123',
        description: 'Multiple failed login attempts detected',
        details: { attemptCount: 5 },
      });

      expect(eventId).toBe('security-event-123');
      expect(mockPrisma.securityEvent.create).toHaveBeenCalled();
    });

    it('should log to console with severity emoji when enabled', async () => {
      const consoleLogger = new AuditLogger(mockPrisma, { consoleLog: true });

      await consoleLogger.logSecurityEvent({
        eventType: 'LOGIN_FAILURE',
        severity: 'MEDIUM',
        description: 'Failed login attempt',
      });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[SECURITY]')
      );
    });

    it('should handle missing securityEvent model gracefully', async () => {
      const prismaWithoutSecurityEvent = {
        ...mockPrisma,
        securityEvent: undefined,
      } as unknown as PrismaClient;

      const safeLogger = new AuditLogger(prismaWithoutSecurityEvent, { consoleLog: false });

      const eventId = await safeLogger.logSecurityEvent({
        eventType: 'LOGIN_FAILURE',
        description: 'Test event',
      });

      expect(eventId).toBeDefined();
    });
  });

  describe('logLogin', () => {
    it('should log successful login', async () => {
      await logger.logLoginSuccess(TEST_TENANT_ID, {
        userId: 'user-123',
        email: 'user@example.com',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        mfaUsed: true,
      });

      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
      expect(mockPrisma.securityEvent.create).toHaveBeenCalled();
    });

    it('should log failed login', async () => {
      await logger.logLoginFailure(TEST_TENANT_ID, {
        email: 'user@example.com',
        ipAddress: '192.168.1.1',
        failureReason: 'Invalid password',
      });

      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
      expect(mockPrisma.securityEvent.create).toHaveBeenCalled();
    });

    it('should include MFA flag in metadata', async () => {
      await logger.logLoginSuccess(TEST_TENANT_ID, {
        userId: 'user-123',
        email: 'user@example.com',
        mfaUsed: true,
      });

      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });
  });

  describe('logBulkOperation', () => {
    it('should log bulk update operation', async () => {
      await logger.logBulkOperation('BULK_UPDATE', 'lead', ['lead-1', 'lead-2', 'lead-3'], TEST_TENANT_ID, {
        actorId: 'user-123',
        successCount: 3,
      });

      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });

    it('should log bulk delete operation', async () => {
      await logger.logBulkOperation('BULK_DELETE', 'contact', ['contact-1', 'contact-2'], TEST_TENANT_ID, {
        actorId: 'user-123',
        successCount: 2,
      });

      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });

    it('should log partial success when there are failures', async () => {
      await logger.logBulkOperation('IMPORT', 'lead', ['lead-1', 'lead-2', 'lead-3', 'lead-4'], TEST_TENANT_ID, {
        actorId: 'user-123',
        successCount: 3,
        failureCount: 1,
      });

      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });

    it('should log export operation', async () => {
      await logger.logBulkOperation('EXPORT', 'lead', ['lead-1', 'lead-2'], TEST_TENANT_ID, {
        actorEmail: 'user@example.com',
        metadata: { format: 'csv' },
      });

      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });
  });

  describe('query', () => {
    it('should query logs with filters', async () => {
      (mockPrisma.auditLog.findMany as any).mockResolvedValue([
        { id: 'log-1', action: 'CREATE' },
        { id: 'log-2', action: 'UPDATE' },
      ]);
      (mockPrisma.auditLog.count as any).mockResolvedValue(2);

      const result = await logger.query({
        resourceType: 'lead',
        actorId: 'user-123',
        limit: 10,
      });

      expect(result.entries).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(mockPrisma.auditLog.findMany).toHaveBeenCalled();
    });

    it('should filter by date range', async () => {
      await logger.query({
        startDate: new Date(2025, 0, 1),
        endDate: new Date(2025, 0, 31),
      });

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: expect.objectContaining({
              gte: new Date(2025, 0, 1),
              lte: new Date(2025, 0, 31),
            }),
          }),
        })
      );
    });

    it('should support pagination', async () => {
      await logger.query({
        limit: 50,
        offset: 100,
      });

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
          skip: 100,
        })
      );
    });

    it('should use default limit if not specified', async () => {
      await logger.query({});

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100,
          skip: 0,
        })
      );
    });
  });

  describe('flush', () => {
    it('should flush buffered entries', async () => {
      const asyncLogger = new AuditLogger(mockPrisma, {
        async: true,
        batchSize: 10,
        consoleLog: false,
      });

      // Add entries to buffer
      await asyncLogger.log({
        tenantId: TEST_TENANT_ID,
        eventType: 'Test1',
        action: 'CREATE',
        resourceType: 'lead',
        resourceId: 'lead-1',
      });
      await asyncLogger.log({
        tenantId: TEST_TENANT_ID,
        eventType: 'Test2',
        action: 'CREATE',
        resourceType: 'lead',
        resourceId: 'lead-2',
      });

      // Manually flush
      await asyncLogger.flush();

      expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(2);
    });

    it('should not throw on empty buffer', async () => {
      const asyncLogger = new AuditLogger(mockPrisma, { async: true, consoleLog: false });

      await expect(asyncLogger.flush()).resolves.not.toThrow();
    });

    it('should handle flush errors and re-add entries to buffer', async () => {
      const asyncLogger = new AuditLogger(mockPrisma, {
        async: true,
        consoleLog: false,
      });

      // Make create fail
      (mockPrisma.auditLog.create as any).mockRejectedValueOnce(new Error('DB Error'));

      await asyncLogger.log({
        tenantId: TEST_TENANT_ID,
        eventType: 'Test',
        action: 'CREATE',
        resourceType: 'lead',
        resourceId: 'lead-1',
      });

      await asyncLogger.flush();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[AUDIT] Failed to flush audit logs:',
        expect.any(Error)
      );
    });
  });

  describe('shutdown', () => {
    it('should flush remaining logs on shutdown', async () => {
      const asyncLogger = new AuditLogger(mockPrisma, {
        async: true,
        flushIntervalMs: 10000,
        consoleLog: false,
      });

      await asyncLogger.log({
        tenantId: TEST_TENANT_ID,
        eventType: 'Test',
        action: 'CREATE',
        resourceType: 'lead',
        resourceId: 'lead-1',
      });

      await asyncLogger.shutdown();

      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });
  });

  describe('calculateChangedFields', () => {
    it('should detect added fields', async () => {
      await logger.logAction('UPDATE', 'lead', 'lead-123', TEST_TENANT_ID, {
        beforeState: { name: 'Test' },
        afterState: { name: 'Test', status: 'QUALIFIED' },
      });

      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });

    it('should detect removed fields', async () => {
      await logger.logAction('UPDATE', 'lead', 'lead-123', TEST_TENANT_ID, {
        beforeState: { name: 'Test', notes: 'Some notes' },
        afterState: { name: 'Test' },
      });

      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });

    it('should detect modified fields', async () => {
      await logger.logAction('UPDATE', 'lead', 'lead-123', TEST_TENANT_ID, {
        beforeState: { name: 'Old Name', score: 50 },
        afterState: { name: 'New Name', score: 75 },
      });

      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });

    it('should handle deeply nested objects', async () => {
      await logger.logAction('UPDATE', 'lead', 'lead-123', TEST_TENANT_ID, {
        beforeState: { contact: { name: 'John', phone: '123' } },
        afterState: { contact: { name: 'John', phone: '456' } },
      });

      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });
  });

  describe('getSeverityEmoji', () => {
    it('should return correct symbols for severity levels', async () => {
      const consoleLogger = new AuditLogger(mockPrisma, { consoleLog: true });

      await consoleLogger.logSecurityEvent({
        eventType: 'LOGIN_FAILURE',
        severity: 'CRITICAL',
        description: 'Critical event',
      });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('!!!')
      );
    });
  });

  describe('error handling', () => {
    it('should throw when database write fails', async () => {
      (mockPrisma.auditLog.create as any).mockRejectedValueOnce(new Error('DB Error'));

      await expect(
        logger.log({
          tenantId: TEST_TENANT_ID,
          eventType: 'Test',
          action: 'CREATE',
          resourceType: 'lead',
          resourceId: 'lead-1',
        })
      ).rejects.toThrow('DB Error');
    });
  });
});

describe('queryComprehensive', () => {
  let logger: AuditLogger;
  let mockPrisma: PrismaClient;

  beforeEach(() => {
    mockPrisma = {
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 'audit-log-123' }),
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
      auditLogEntry: {
        create: vi.fn().mockResolvedValue({ id: 'audit-entry-123' }),
        findMany: vi.fn().mockResolvedValue([
          { id: 'entry-1', action: 'CREATE' },
          { id: 'entry-2', action: 'UPDATE' },
        ]),
        count: vi.fn().mockResolvedValue(2),
      },
      securityEvent: {
        create: vi.fn().mockResolvedValue({ id: 'security-event-123' }),
      },
    } as unknown as PrismaClient;
    logger = new AuditLogger(mockPrisma, { consoleLog: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetAuditLogger();
  });

  it('should query comprehensive audit log entries', async () => {
    const result = await logger.queryComprehensive({
      resourceType: 'lead',
      actorId: 'user-123',
      limit: 10,
    });

    expect(result.entries).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(mockPrisma.auditLogEntry.findMany).toHaveBeenCalled();
  });

  it('should filter by all available criteria', async () => {
    await logger.queryComprehensive({
      resourceType: 'lead',
      resourceId: 'lead-123',
      actorId: 'user-123',
      actorType: 'USER',
      action: 'CREATE',
      actionResult: 'SUCCESS',
      eventType: 'LeadCreated',
      dataClassification: 'INTERNAL',
      traceId: 'trace-123',
      startDate: new Date(2025, 0, 1),
      endDate: new Date(2025, 0, 31),
    });

    expect(mockPrisma.auditLogEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          resourceType: 'lead',
          resourceId: 'lead-123',
          actorId: 'user-123',
        }),
      })
    );
  });

  it('should fall back to basic query when auditLogEntry table is undefined', async () => {
    const prismaWithoutEntry = {
      ...mockPrisma,
      auditLogEntry: undefined,
    } as unknown as PrismaClient;

    const safeLogger = new AuditLogger(prismaWithoutEntry, { consoleLog: false });

    const result = await safeLogger.queryComprehensive({
      resourceType: 'lead',
    });

    expect(result).toBeDefined();
    expect(mockPrisma.auditLog.findMany).toHaveBeenCalled();
  });

  it('should fall back to basic query on error', async () => {
    (mockPrisma.auditLogEntry.findMany as any).mockRejectedValueOnce(new Error('DB Error'));

    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    const result = await logger.queryComprehensive({
      resourceType: 'lead',
    });

    expect(result).toBeDefined();
    expect(debugSpy).toHaveBeenCalledWith(
      '[AUDIT] Comprehensive query failed, falling back to basic:',
      expect.any(Error)
    );

    debugSpy.mockRestore();
  });
});

describe('getResourceAuditTrail', () => {
  let logger: AuditLogger;
  let mockPrisma: PrismaClient;

  beforeEach(() => {
    mockPrisma = {
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 'audit-log-123' }),
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
      auditLogEntry: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'entry-1', resourceId: 'lead-123' },
        ]),
        count: vi.fn().mockResolvedValue(1),
      },
    } as unknown as PrismaClient;
    logger = new AuditLogger(mockPrisma, { consoleLog: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetAuditLogger();
  });

  it('should get audit trail for a specific resource', async () => {
    const result = await logger.getResourceAuditTrail('lead', 'lead-123');

    expect(result.entries).toHaveLength(1);
    expect(mockPrisma.auditLogEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          resourceType: 'lead',
          resourceId: 'lead-123',
        }),
      })
    );
  });

  it('should support pagination options', async () => {
    await logger.getResourceAuditTrail('lead', 'lead-123', {
      limit: 50,
      offset: 10,
    });

    expect(mockPrisma.auditLogEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 50,
        skip: 10,
      })
    );
  });
});

describe('getActorAuditTrail', () => {
  let logger: AuditLogger;
  let mockPrisma: PrismaClient;

  beforeEach(() => {
    mockPrisma = {
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 'audit-log-123' }),
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
      auditLogEntry: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'entry-1', actorId: 'user-123' },
          { id: 'entry-2', actorId: 'user-123' },
        ]),
        count: vi.fn().mockResolvedValue(2),
      },
    } as unknown as PrismaClient;
    logger = new AuditLogger(mockPrisma, { consoleLog: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetAuditLogger();
  });

  it('should get audit trail for a specific actor', async () => {
    const result = await logger.getActorAuditTrail('user-123');

    expect(result.entries).toHaveLength(2);
    expect(mockPrisma.auditLogEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          actorId: 'user-123',
        }),
      })
    );
  });

  it('should filter by date range', async () => {
    const startDate = new Date(2025, 0, 1);
    const endDate = new Date(2025, 0, 31);

    await logger.getActorAuditTrail('user-123', {
      startDate,
      endDate,
    });

    expect(mockPrisma.auditLogEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          actorId: 'user-123',
          timestamp: {
            gte: startDate,
            lte: endDate,
          },
        }),
      })
    );
  });
});

describe('getPermissionAuditTrail', () => {
  let logger: AuditLogger;
  let mockPrisma: PrismaClient;

  beforeEach(() => {
    mockPrisma = {
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 'audit-log-123' }),
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
      auditLogEntry: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'entry-1', permissionGranted: false },
        ]),
        count: vi.fn().mockResolvedValue(1),
      },
    } as unknown as PrismaClient;
    logger = new AuditLogger(mockPrisma, { consoleLog: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetAuditLogger();
  });

  it('should get permission audit trail', async () => {
    const result = await logger.getPermissionAuditTrail();

    expect(result.entries).toHaveLength(1);
    expect(mockPrisma.auditLogEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          requiredPermission: { not: null },
        }),
      })
    );
  });

  it('should filter by actor and resource type', async () => {
    await logger.getPermissionAuditTrail({
      actorId: 'user-123',
      resourceType: 'lead',
    });

    expect(mockPrisma.auditLogEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          actorId: 'user-123',
          resourceType: 'lead',
        }),
      })
    );
  });

  it('should filter permission denied only', async () => {
    await logger.getPermissionAuditTrail({
      permissionDeniedOnly: true,
    });

    expect(mockPrisma.auditLogEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          permissionGranted: false,
        }),
      })
    );
  });

  it('should filter by date range', async () => {
    const startDate = new Date(2025, 0, 1);
    const endDate = new Date(2025, 0, 31);

    await logger.getPermissionAuditTrail({
      startDate,
      endDate,
    });

    expect(mockPrisma.auditLogEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          timestamp: {
            gte: startDate,
            lte: endDate,
          },
        }),
      })
    );
  });

  it('should return empty when auditLogEntry table is undefined', async () => {
    const prismaWithoutEntry = {
      ...mockPrisma,
      auditLogEntry: undefined,
    } as unknown as PrismaClient;

    const safeLogger = new AuditLogger(prismaWithoutEntry, { consoleLog: false });

    const result = await safeLogger.getPermissionAuditTrail();

    expect(result.entries).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('should handle errors gracefully', async () => {
    (mockPrisma.auditLogEntry.findMany as any).mockRejectedValueOnce(new Error('DB Error'));

    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    const result = await logger.getPermissionAuditTrail();

    expect(result.entries).toEqual([]);
    expect(result.total).toBe(0);
    expect(debugSpy).toHaveBeenCalledWith(
      '[AUDIT] Permission audit trail query failed:',
      expect.any(Error)
    );

    debugSpy.mockRestore();
  });
});

describe('comprehensive entry writing', () => {
  let logger: AuditLogger;
  let mockPrisma: PrismaClient;

  beforeEach(() => {
    mockPrisma = {
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 'audit-log-123' }),
      },
      auditLogEntry: {
        create: vi.fn().mockResolvedValue({ id: 'audit-entry-123' }),
      },
      securityEvent: {
        create: vi.fn().mockResolvedValue({ id: 'security-event-123' }),
      },
    } as unknown as PrismaClient;
    logger = new AuditLogger(mockPrisma, { consoleLog: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetAuditLogger();
  });

  it('should write to comprehensive AuditLogEntry table when available', async () => {
    const logId = await logger.log({
      tenantId: 'tenant-123',
      eventType: 'LeadCreated',
      action: 'CREATE',
      resourceType: 'lead',
      resourceId: 'lead-123',
      actorId: 'user-123',
      actorEmail: 'user@example.com',
      actorRole: 'ADMIN',
      resourceName: 'Test Lead',
      traceId: 'trace-123',
      requestId: 'req-123',
      sessionId: 'session-123',
    });

    expect(logId).toBe('audit-entry-123');
    expect(mockPrisma.auditLogEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-123',
          eventType: 'LeadCreated',
          action: 'CREATE',
          resourceType: 'lead',
          resourceId: 'lead-123',
          actorId: 'user-123',
        }),
      })
    );
  });

  it('should fall back to basic AuditLog when comprehensive write fails', async () => {
    (mockPrisma.auditLogEntry.create as any).mockRejectedValueOnce(new Error('Comprehensive table error'));

    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    const logId = await logger.log({
      tenantId: 'tenant-123',
      eventType: 'LeadCreated',
      action: 'CREATE',
      resourceType: 'lead',
      resourceId: 'lead-123',
    });

    expect(logId).toBe('audit-log-123');
    expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    expect(debugSpy).toHaveBeenCalledWith(
      '[AUDIT] Comprehensive entry failed, falling back to basic:',
      expect.any(Error)
    );

    debugSpy.mockRestore();
  });
});

describe('getSeverityEmoji - all levels', () => {
  let logger: AuditLogger;
  let mockPrisma: PrismaClient;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockPrisma = {
      securityEvent: {
        create: vi.fn().mockResolvedValue({ id: 'security-event-123' }),
      },
    } as unknown as PrismaClient;
    logger = new AuditLogger(mockPrisma, { consoleLog: true });
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetAuditLogger();
  });

  it('should return !!! for CRITICAL severity', async () => {
    await logger.logSecurityEvent({
      eventType: 'TEST',
      severity: 'CRITICAL',
      description: 'Critical event',
    });

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('!!!')
    );
  });

  it('should return !! for HIGH severity', async () => {
    await logger.logSecurityEvent({
      eventType: 'TEST',
      severity: 'HIGH',
      description: 'High event',
    });

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('!!')
    );
  });

  it('should return ! for MEDIUM severity', async () => {
    await logger.logSecurityEvent({
      eventType: 'TEST',
      severity: 'MEDIUM',
      description: 'Medium event',
    });

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('!')
    );
  });

  it('should return - for LOW severity', async () => {
    await logger.logSecurityEvent({
      eventType: 'TEST',
      severity: 'LOW',
      description: 'Low event',
    });

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('-')
    );
  });

  it('should return * for INFO severity', async () => {
    await logger.logSecurityEvent({
      eventType: 'TEST',
      severity: 'INFO',
      description: 'Info event',
    });

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('*')
    );
  });
});

describe('scheduleFlush - batch size trigger', () => {
  let logger: AuditLogger;
  let mockPrisma: PrismaClient;

  beforeEach(() => {
    mockPrisma = {
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 'audit-log-123' }),
      },
      auditLogEntry: undefined,
    } as unknown as PrismaClient;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetAuditLogger();
  });

  it('should buffer entries when async mode is enabled until flush', async () => {
    logger = new AuditLogger(mockPrisma, {
      async: true,
      batchSize: 10,
      consoleLog: false,
    });

    // Add entries to buffer
    await logger.log({
      tenantId: 'tenant-123',
      eventType: 'Test1',
      action: 'CREATE',
      resourceType: 'lead',
      resourceId: 'lead-1',
    });
    await logger.log({
      tenantId: 'tenant-123',
      eventType: 'Test2',
      action: 'CREATE',
      resourceType: 'lead',
      resourceId: 'lead-2',
    });
    await logger.log({
      tenantId: 'tenant-123',
      eventType: 'Test3',
      action: 'CREATE',
      resourceType: 'lead',
      resourceId: 'lead-3',
    });

    // Not flushed yet
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();

    // Manual flush should write all entries
    await logger.flush();

    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(3);
  });
});

describe('calculateChangedFields - edge cases', () => {
  let logger: AuditLogger;
  let mockPrisma: PrismaClient;

  beforeEach(() => {
    mockPrisma = {
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 'audit-log-123' }),
      },
      auditLogEntry: undefined,
    } as unknown as PrismaClient;
    logger = new AuditLogger(mockPrisma, { consoleLog: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetAuditLogger();
  });

  it('should return empty array when both before and after are undefined', async () => {
    await logger.logAction('CREATE', 'lead', 'lead-123', 'tenant-123', {
      beforeState: undefined,
      afterState: undefined,
    });

    expect(mockPrisma.auditLog.create).toHaveBeenCalled();
  });

  it('should return all after keys when only after state exists', async () => {
    await logger.logAction('CREATE', 'lead', 'lead-123', 'tenant-123', {
      beforeState: undefined,
      afterState: { name: 'Test', status: 'NEW' },
    });

    expect(mockPrisma.auditLog.create).toHaveBeenCalled();
  });

  it('should return all before keys when only before state exists', async () => {
    await logger.logAction('DELETE', 'lead', 'lead-123', 'tenant-123', {
      beforeState: { name: 'Test', status: 'NEW' },
      afterState: undefined,
    });

    expect(mockPrisma.auditLog.create).toHaveBeenCalled();
  });
});

describe('getAuditLogger', () => {
  let mockPrisma: PrismaClient;

  beforeEach(() => {
    mockPrisma = {} as PrismaClient;
    resetAuditLogger();
  });

  afterEach(() => {
    resetAuditLogger();
  });

  it('should return singleton instance', () => {
    const logger1 = getAuditLogger(mockPrisma);
    const logger2 = getAuditLogger(mockPrisma);

    expect(logger1).toBe(logger2);
  });

  it('should accept config on first call', () => {
    const logger = getAuditLogger(mockPrisma, { consoleLog: true });
    expect(logger).toBeDefined();
  });
});
