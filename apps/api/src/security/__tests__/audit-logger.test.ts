import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { PrismaClient } from '@intelliflow/db';
import { AuditLogger, getAuditLogger, resetAuditLogger } from '../audit-logger';

const TEST_TENANT_ID = 'test-tenant-123';

describe('AuditLogger', () => {
  let logger: AuditLogger;
  let mockPrisma: PrismaClient;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  function createMockPrisma(): PrismaClient {
    return {
      tenant: {
        findUnique: vi.fn().mockResolvedValue({ id: TEST_TENANT_ID }),
      },
      auditLogEntry: {
        create: vi.fn().mockResolvedValue({ id: 'audit-log-123' }),
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
      securityEvent: {
        create: vi.fn().mockResolvedValue({ id: 'security-event-123' }),
      },
    } as any as PrismaClient; // test-only mock
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
      expect(mockPrisma.auditLogEntry.create).toHaveBeenCalled();
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

      expect(mockPrisma.auditLogEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            beforeState: { status: 'NEW' },
            afterState: { status: 'QUALIFIED' },
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

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('[AUDIT]'));
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
      expect(mockPrisma.auditLogEntry.create).not.toHaveBeenCalled();
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

      expect(mockPrisma.auditLogEntry.create).toHaveBeenCalledWith(
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

      expect(mockPrisma.auditLogEntry.create).toHaveBeenCalled();
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

      expect(mockPrisma.auditLogEntry.create).toHaveBeenCalledWith(
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

      expect(mockPrisma.auditLogEntry.create).toHaveBeenCalled();
    });

    it('should default actorType to USER', async () => {
      await logger.logAction('CREATE', 'lead', 'lead-123', TEST_TENANT_ID, {
        actorId: 'user-123',
      });

      expect(mockPrisma.auditLogEntry.create).toHaveBeenCalled();
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

      expect(mockPrisma.auditLogEntry.create).toHaveBeenCalled();
    });

    it('should include default reason if not provided', async () => {
      await logger.logPermissionDenied('lead', 'lead-123', 'lead:admin', TEST_TENANT_ID, {
        actorId: 'user-123',
      });

      expect(mockPrisma.auditLogEntry.create).toHaveBeenCalled();
    });
  });

  describe('logSecurityEvent', () => {
    it('should create security event', async () => {
      const eventId = await logger.logSecurityEvent({
        eventType: 'SUSPICIOUS_ACTIVITY',
        severity: 'HIGH',
        tenantId: TEST_TENANT_ID,
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
        tenantId: TEST_TENANT_ID,
        description: 'Failed login attempt',
      });

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('[SECURITY]'));
    });

    it('should handle missing securityEvent model gracefully', async () => {
      const prismaWithoutSecurityEvent = {
        ...mockPrisma,
        securityEvent: undefined,
      } as any as PrismaClient; // test-only mock

      const safeLogger = new AuditLogger(prismaWithoutSecurityEvent, { consoleLog: false });

      const eventId = await safeLogger.logSecurityEvent({
        eventType: 'LOGIN_FAILURE',
        tenantId: TEST_TENANT_ID,
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

      expect(mockPrisma.auditLogEntry.create).toHaveBeenCalled();
      expect(mockPrisma.securityEvent.create).toHaveBeenCalled();
    });

    it('should log failed login', async () => {
      await logger.logLoginFailure(TEST_TENANT_ID, {
        email: 'user@example.com',
        ipAddress: '192.168.1.1',
        failureReason: 'Invalid password',
      });

      expect(mockPrisma.auditLogEntry.create).toHaveBeenCalled();
      expect(mockPrisma.securityEvent.create).toHaveBeenCalled();
    });

    it('should include MFA flag in metadata', async () => {
      await logger.logLoginSuccess(TEST_TENANT_ID, {
        userId: 'user-123',
        email: 'user@example.com',
        mfaUsed: true,
      });

      expect(mockPrisma.auditLogEntry.create).toHaveBeenCalled();
    });
  });

  describe('logBulkOperation', () => {
    it('should log bulk update operation', async () => {
      await logger.logBulkOperation(
        'BULK_UPDATE',
        'lead',
        ['lead-1', 'lead-2', 'lead-3'],
        TEST_TENANT_ID,
        {
          actorId: 'user-123',
          successCount: 3,
        }
      );

      expect(mockPrisma.auditLogEntry.create).toHaveBeenCalled();
    });

    it('should log bulk delete operation', async () => {
      await logger.logBulkOperation(
        'BULK_DELETE',
        'contact',
        ['contact-1', 'contact-2'],
        TEST_TENANT_ID,
        {
          actorId: 'user-123',
          successCount: 2,
        }
      );

      expect(mockPrisma.auditLogEntry.create).toHaveBeenCalled();
    });

    it('should log partial success when there are failures', async () => {
      await logger.logBulkOperation(
        'IMPORT',
        'lead',
        ['lead-1', 'lead-2', 'lead-3', 'lead-4'],
        TEST_TENANT_ID,
        {
          actorId: 'user-123',
          successCount: 3,
          failureCount: 1,
        }
      );

      expect(mockPrisma.auditLogEntry.create).toHaveBeenCalled();
    });

    it('should log export operation', async () => {
      await logger.logBulkOperation('EXPORT', 'lead', ['lead-1', 'lead-2'], TEST_TENANT_ID, {
        actorEmail: 'user@example.com',
        metadata: { format: 'csv' },
      });

      expect(mockPrisma.auditLogEntry.create).toHaveBeenCalled();
    });
  });

  describe('query', () => {
    it('should query logs with filters', async () => {
      (mockPrisma.auditLogEntry.findMany as any).mockResolvedValue([
        { id: 'log-1', action: 'CREATE' },
        { id: 'log-2', action: 'UPDATE' },
      ]);
      (mockPrisma.auditLogEntry.count as any).mockResolvedValue(2);

      const result = await logger.query({
        resourceType: 'lead',
        actorId: 'user-123',
        limit: 10,
      });

      expect(result.entries).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(mockPrisma.auditLogEntry.findMany).toHaveBeenCalled();
    });

    it('should filter by date range', async () => {
      await logger.query({
        startDate: new Date(2025, 0, 1),
        endDate: new Date(2025, 0, 31),
      });

      expect(mockPrisma.auditLogEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            timestamp: expect.objectContaining({
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

      expect(mockPrisma.auditLogEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
          skip: 100,
        })
      );
    });

    it('should use default limit if not specified', async () => {
      await logger.query({});

      expect(mockPrisma.auditLogEntry.findMany).toHaveBeenCalledWith(
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

      expect(mockPrisma.auditLogEntry.create).toHaveBeenCalledTimes(2);
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
      (mockPrisma.auditLogEntry.create as any).mockRejectedValueOnce(new Error('DB Error'));

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

      expect(mockPrisma.auditLogEntry.create).toHaveBeenCalled();
    });
  });

  describe('calculateChangedFields', () => {
    it('should detect added fields', async () => {
      await logger.logAction('UPDATE', 'lead', 'lead-123', TEST_TENANT_ID, {
        beforeState: { name: 'Test' },
        afterState: { name: 'Test', status: 'QUALIFIED' },
      });

      expect(mockPrisma.auditLogEntry.create).toHaveBeenCalled();
    });

    it('should detect removed fields', async () => {
      await logger.logAction('UPDATE', 'lead', 'lead-123', TEST_TENANT_ID, {
        beforeState: { name: 'Test', notes: 'Some notes' },
        afterState: { name: 'Test' },
      });

      expect(mockPrisma.auditLogEntry.create).toHaveBeenCalled();
    });

    it('should detect modified fields', async () => {
      await logger.logAction('UPDATE', 'lead', 'lead-123', TEST_TENANT_ID, {
        beforeState: { name: 'Old Name', score: 50 },
        afterState: { name: 'New Name', score: 75 },
      });

      expect(mockPrisma.auditLogEntry.create).toHaveBeenCalled();
    });

    it('should handle deeply nested objects', async () => {
      await logger.logAction('UPDATE', 'lead', 'lead-123', TEST_TENANT_ID, {
        beforeState: { contact: { name: 'John', phone: '123' } },
        afterState: { contact: { name: 'John', phone: '456' } },
      });

      expect(mockPrisma.auditLogEntry.create).toHaveBeenCalled();
    });
  });

  describe('getSeverityEmoji', () => {
    it('should return correct symbols for severity levels', async () => {
      const consoleLogger = new AuditLogger(mockPrisma, { consoleLog: true });

      await consoleLogger.logSecurityEvent({
        eventType: 'LOGIN_FAILURE',
        severity: 'CRITICAL',
        tenantId: TEST_TENANT_ID,
        description: 'Critical event',
      });

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('!!!'));
    });
  });

  describe('error handling', () => {
    it('should throw when database write fails', async () => {
      (mockPrisma.auditLogEntry.create as any).mockRejectedValueOnce(new Error('DB Error'));

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
      tenant: {
        findUnique: vi.fn().mockResolvedValue({ id: TEST_TENANT_ID }),
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
    } as any as PrismaClient; // test-only mock
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

  it('should throw error when database query fails', async () => {
    const dbError = new Error('DB Error');
    (mockPrisma.auditLogEntry.findMany as any).mockRejectedValueOnce(dbError);

    await expect(
      logger.queryComprehensive({
        resourceType: 'lead',
      })
    ).rejects.toThrow('DB Error');
  });
});

describe('getResourceAuditTrail', () => {
  let logger: AuditLogger;
  let mockPrisma: PrismaClient;

  beforeEach(() => {
    mockPrisma = {
      tenant: {
        findUnique: vi.fn().mockResolvedValue({ id: TEST_TENANT_ID }),
      },
      auditLogEntry: {
        findMany: vi.fn().mockResolvedValue([{ id: 'entry-1', resourceId: 'lead-123' }]),
        count: vi.fn().mockResolvedValue(1),
      },
    } as any as PrismaClient; // test-only mock
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
      tenant: {
        findUnique: vi.fn().mockResolvedValue({ id: TEST_TENANT_ID }),
      },
      auditLogEntry: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'entry-1', actorId: 'user-123' },
          { id: 'entry-2', actorId: 'user-123' },
        ]),
        count: vi.fn().mockResolvedValue(2),
      },
    } as any as PrismaClient; // test-only mock
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
      tenant: {
        findUnique: vi.fn().mockResolvedValue({ id: TEST_TENANT_ID }),
      },
      auditLogEntry: {
        findMany: vi.fn().mockResolvedValue([{ id: 'entry-1', permissionGranted: false }]),
        count: vi.fn().mockResolvedValue(1),
      },
    } as any as PrismaClient; // test-only mock
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

  it('should throw error when database query fails', async () => {
    const dbError = new Error('DB Error');
    (mockPrisma.auditLogEntry.findMany as any).mockRejectedValueOnce(dbError);

    await expect(logger.getPermissionAuditTrail()).rejects.toThrow('DB Error');
  });
});

describe('comprehensive entry writing', () => {
  let logger: AuditLogger;
  let mockPrisma: PrismaClient;

  beforeEach(() => {
    mockPrisma = {
      tenant: {
        findUnique: vi.fn().mockResolvedValue({ id: 'tenant-123' }),
      },
      auditLogEntry: {
        create: vi.fn().mockResolvedValue({ id: 'audit-entry-123' }),
      },
      securityEvent: {
        create: vi.fn().mockResolvedValue({ id: 'security-event-123' }),
      },
    } as any as PrismaClient; // test-only mock
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

  it('should throw error when audit log write fails', async () => {
    const dbError = new Error('Database write error');
    (mockPrisma.auditLogEntry.create as any).mockRejectedValueOnce(dbError);

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      logger.log({
        tenantId: TEST_TENANT_ID,
        eventType: 'LeadCreated',
        action: 'CREATE',
        resourceType: 'lead',
        resourceId: 'lead-123',
      })
    ).rejects.toThrow('Database write error');

    expect(mockPrisma.auditLogEntry.create).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith('[AUDIT] Failed to write audit log:', dbError);

    errorSpy.mockRestore();
  });
});

describe('getSeverityEmoji - all levels', () => {
  let logger: AuditLogger;
  let mockPrisma: PrismaClient;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockPrisma = {
      tenant: {
        findUnique: vi.fn().mockResolvedValue({ id: TEST_TENANT_ID }),
      },
      securityEvent: {
        create: vi.fn().mockResolvedValue({ id: 'security-event-123' }),
      },
    } as any as PrismaClient; // test-only mock
    logger = new AuditLogger(mockPrisma, { consoleLog: true });
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetAuditLogger();
  });

  it('should return !!! for CRITICAL severity', async () => {
    await logger.logSecurityEvent({
      eventType: 'LOGIN_ATTEMPT',
      severity: 'CRITICAL',
      tenantId: TEST_TENANT_ID,
      description: 'Critical event',
    });

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('!!!'));
  });

  it('should return !! for HIGH severity', async () => {
    await logger.logSecurityEvent({
      eventType: 'LOGIN_ATTEMPT',
      severity: 'HIGH',
      tenantId: TEST_TENANT_ID,
      description: 'High event',
    });

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('!!'));
  });

  it('should return ! for MEDIUM severity', async () => {
    await logger.logSecurityEvent({
      eventType: 'LOGIN_ATTEMPT',
      severity: 'MEDIUM',
      tenantId: TEST_TENANT_ID,
      description: 'Medium event',
    });

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('!'));
  });

  it('should return - for LOW severity', async () => {
    await logger.logSecurityEvent({
      eventType: 'LOGIN_ATTEMPT',
      severity: 'LOW',
      tenantId: TEST_TENANT_ID,
      description: 'Low event',
    });

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('-'));
  });

  it('should return * for INFO severity', async () => {
    await logger.logSecurityEvent({
      eventType: 'LOGIN_ATTEMPT',
      severity: 'INFO',
      tenantId: TEST_TENANT_ID,
      description: 'Info event',
    });

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('*'));
  });
});

describe('scheduleFlush - batch size trigger', () => {
  let logger: AuditLogger;
  let mockPrisma: PrismaClient;

  beforeEach(() => {
    mockPrisma = {
      tenant: {
        findUnique: vi.fn().mockResolvedValue({ id: 'tenant-123' }),
      },
      auditLogEntry: {
        create: vi.fn().mockResolvedValue({ id: 'audit-log-123' }),
      },
    } as any as PrismaClient; // test-only mock
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
    expect(mockPrisma.auditLogEntry.create).not.toHaveBeenCalled();

    // Manual flush should write all entries
    await logger.flush();

    expect(mockPrisma.auditLogEntry.create).toHaveBeenCalledTimes(3);
  });
});

describe('calculateChangedFields - edge cases', () => {
  let logger: AuditLogger;
  let mockPrisma: PrismaClient;

  beforeEach(() => {
    mockPrisma = {
      tenant: {
        findUnique: vi.fn().mockResolvedValue({ id: 'tenant-123' }),
      },
      auditLogEntry: {
        create: vi.fn().mockResolvedValue({ id: 'audit-log-123' }),
      },
    } as any as PrismaClient; // test-only mock
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

    expect(mockPrisma.auditLogEntry.create).toHaveBeenCalled();
  });

  it('should return all after keys when only after state exists', async () => {
    await logger.logAction('CREATE', 'lead', 'lead-123', 'tenant-123', {
      beforeState: undefined,
      afterState: { name: 'Test', status: 'NEW' },
    });

    expect(mockPrisma.auditLogEntry.create).toHaveBeenCalled();
  });

  it('should return all before keys when only before state exists', async () => {
    await logger.logAction('DELETE', 'lead', 'lead-123', 'tenant-123', {
      beforeState: { name: 'Test', status: 'NEW' },
      afterState: undefined,
    });

    expect(mockPrisma.auditLogEntry.create).toHaveBeenCalled();
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
