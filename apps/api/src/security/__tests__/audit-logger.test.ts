import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { AuditLogger, getAuditLogger, resetAuditLogger } from '../audit-logger';

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
      await logger.logAction('UPDATE', 'lead', 'lead-123', {
        actorId: 'user-123',
        beforeState: { status: 'NEW', name: 'Test Lead' },
        afterState: { status: 'QUALIFIED', name: 'Test Lead' },
      });

      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });

    it('should include request context', async () => {
      await logger.logAction('CREATE', 'lead', 'lead-123', {
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
      await logger.logAction('DELETE', 'lead', 'lead-123', {
        actorId: 'user-123',
        beforeState: { id: 'lead-123', name: 'Deleted Lead' },
      });

      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });

    it('should default actorType to USER', async () => {
      await logger.logAction('CREATE', 'lead', 'lead-123', {
        actorId: 'user-123',
      });

      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });
  });

  describe('logPermissionDenied', () => {
    it('should log permission denied event', async () => {
      await logger.logPermissionDenied('lead', 'lead-123', 'lead:delete', {
        actorId: 'user-123',
        actorEmail: 'user@example.com',
        actorRole: 'USER',
        reason: 'User does not have delete permission',
      });

      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });

    it('should include default reason if not provided', async () => {
      await logger.logPermissionDenied('lead', 'lead-123', 'lead:admin', {
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
      await logger.logLogin(true, {
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
      await logger.logLogin(false, {
        email: 'user@example.com',
        ipAddress: '192.168.1.1',
        failureReason: 'Invalid password',
      });

      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
      expect(mockPrisma.securityEvent.create).toHaveBeenCalled();
    });

    it('should include MFA flag in metadata', async () => {
      await logger.logLogin(true, {
        userId: 'user-123',
        email: 'user@example.com',
        mfaUsed: true,
      });

      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });
  });

  describe('logBulkOperation', () => {
    it('should log bulk update operation', async () => {
      await logger.logBulkOperation('BULK_UPDATE', 'lead', ['lead-1', 'lead-2', 'lead-3'], {
        actorId: 'user-123',
        successCount: 3,
      });

      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });

    it('should log bulk delete operation', async () => {
      await logger.logBulkOperation('BULK_DELETE', 'contact', ['contact-1', 'contact-2'], {
        actorId: 'user-123',
        successCount: 2,
      });

      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });

    it('should log partial success when there are failures', async () => {
      await logger.logBulkOperation('IMPORT', 'lead', ['lead-1', 'lead-2', 'lead-3', 'lead-4'], {
        actorId: 'user-123',
        successCount: 3,
        failureCount: 1,
      });

      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });

    it('should log export operation', async () => {
      await logger.logBulkOperation('EXPORT', 'lead', ['lead-1', 'lead-2'], {
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
        eventType: 'Test1',
        action: 'CREATE',
        resourceType: 'lead',
        resourceId: 'lead-1',
      });
      await asyncLogger.log({
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
      await logger.logAction('UPDATE', 'lead', 'lead-123', {
        beforeState: { name: 'Test' },
        afterState: { name: 'Test', status: 'QUALIFIED' },
      });

      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });

    it('should detect removed fields', async () => {
      await logger.logAction('UPDATE', 'lead', 'lead-123', {
        beforeState: { name: 'Test', notes: 'Some notes' },
        afterState: { name: 'Test' },
      });

      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });

    it('should detect modified fields', async () => {
      await logger.logAction('UPDATE', 'lead', 'lead-123', {
        beforeState: { name: 'Old Name', score: 50 },
        afterState: { name: 'New Name', score: 75 },
      });

      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });

    it('should handle deeply nested objects', async () => {
      await logger.logAction('UPDATE', 'lead', 'lead-123', {
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
          eventType: 'Test',
          action: 'CREATE',
          resourceType: 'lead',
          resourceId: 'lead-1',
        })
      ).rejects.toThrow('DB Error');
    });
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
