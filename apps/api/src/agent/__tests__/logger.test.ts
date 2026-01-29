/**
 * Agent Logger Tests
 *
 * IFC-139: Tests for agent action logging
 *
 * Validates:
 * - Log entry creation
 * - Sensitive data redaction
 * - Statistics gathering
 * - Log filtering
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AgentActionLogger, createLogEntry, LogEntry } from '../logger';
import { AgentActionLog } from '../types';

describe('Agent Logger', () => {
  let logger: AgentActionLogger;

  beforeEach(() => {
    logger = new AgentActionLogger({
      logToConsole: false, // Disable console output for tests
      logToFile: false, // Disable file output for tests
      minLevel: 'DEBUG',
    });
  });

  afterEach(async () => {
    await logger.stop();
  });

  describe('log', () => {
    it('should create a log entry with timestamp', async () => {
      const beforeTime = new Date().toISOString();

      await logger.log({
        userId: 'user-1',
        agentSessionId: 'session-1',
        toolName: 'search_leads',
        actionType: 'SEARCH',
        entityType: 'LEAD',
        input: { query: 'test' },
        success: true,
        durationMs: 50,
        approvalRequired: false,
      });

      const logs = await logger.getRecentLogs({ userId: 'user-1' });
      expect(logs.length).toBe(1);
      expect(logs[0].timestamp).toBeDefined();
      expect(new Date(logs[0].timestamp).toISOString() >= beforeTime).toBe(true);
    });

    it('should set level based on success', async () => {
      await logger.log({
        userId: 'user-1',
        agentSessionId: 'session-1',
        toolName: 'create_case',
        actionType: 'CREATE',
        entityType: 'CASE',
        input: {},
        success: true,
        durationMs: 100,
        approvalRequired: true,
      });

      await logger.log({
        userId: 'user-1',
        agentSessionId: 'session-1',
        toolName: 'update_case',
        actionType: 'UPDATE',
        entityType: 'CASE',
        input: {},
        success: false,
        error: 'Test error',
        durationMs: 100,
        approvalRequired: true,
      });

      const logs = await logger.getRecentLogs({ userId: 'user-1' });
      expect(logs.find((l) => l.success)?.level).toBe('INFO');
      expect(logs.find((l) => !l.success)?.level).toBe('ERROR');
    });
  });

  describe('sensitive data redaction', () => {
    it('should redact sensitive fields in input', async () => {
      const loggerWithRedaction = new AgentActionLogger({
        logToConsole: false,
        logToFile: false,
        redactSensitiveFields: true,
        sensitiveFields: ['password', 'token', 'secret'],
      });

      await loggerWithRedaction.log({
        userId: 'user-1',
        agentSessionId: 'session-1',
        toolName: 'test_tool',
        actionType: 'SEARCH',
        entityType: 'LEAD',
        input: {
          username: 'testuser',
          password: 'supersecret123',
          apiToken: 'token123',
        },
        success: true,
        durationMs: 10,
        approvalRequired: false,
      });

      const logs = await loggerWithRedaction.getRecentLogs({ userId: 'user-1' });
      expect(logs[0].input.username).toBe('testuser');
      expect(logs[0].input.password).toBe('[REDACTED]');
      expect(logs[0].input.apiToken).toBe('[REDACTED]');

      await loggerWithRedaction.stop();
    });

    it('should redact nested sensitive fields', async () => {
      const loggerWithRedaction = new AgentActionLogger({
        logToConsole: false,
        logToFile: false,
        redactSensitiveFields: true,
        sensitiveFields: ['password', 'secret'],
      });

      await loggerWithRedaction.log({
        userId: 'user-1',
        agentSessionId: 'session-1',
        toolName: 'test_tool',
        actionType: 'SEARCH',
        entityType: 'LEAD',
        input: {
          user: {
            name: 'Test',
            credentials: {
              password: 'secret123',
            },
          },
        },
        success: true,
        durationMs: 10,
        approvalRequired: false,
      });

      const logs = await loggerWithRedaction.getRecentLogs({ userId: 'user-1' });
      const input = logs[0].input as Record<string, unknown>;
      const user = input.user as Record<string, unknown>;
      const credentials = user.credentials as Record<string, unknown>;
      expect(credentials.password).toBe('[REDACTED]');

      await loggerWithRedaction.stop();
    });
  });

  describe('getRecentLogs', () => {
    beforeEach(async () => {
      // Add various log entries
      await logger.log({
        userId: 'user-1',
        agentSessionId: 'session-1',
        toolName: 'search_leads',
        actionType: 'SEARCH',
        entityType: 'LEAD',
        input: {},
        success: true,
        durationMs: 10,
        approvalRequired: false,
      });

      await logger.log({
        userId: 'user-1',
        agentSessionId: 'session-1',
        toolName: 'create_case',
        actionType: 'CREATE',
        entityType: 'CASE',
        input: {},
        success: true,
        durationMs: 100,
        approvalRequired: true,
      });

      await logger.log({
        userId: 'user-2',
        agentSessionId: 'session-2',
        toolName: 'search_contacts',
        actionType: 'SEARCH',
        entityType: 'CONTACT',
        input: {},
        success: true,
        durationMs: 20,
        approvalRequired: false,
      });
    });

    it('should filter by userId', async () => {
      const logs = await logger.getRecentLogs({ userId: 'user-1' });

      expect(logs.every((l) => l.userId === 'user-1')).toBe(true);
    });

    it('should filter by sessionId', async () => {
      const logs = await logger.getRecentLogs({ sessionId: 'session-2' });

      expect(logs.every((l) => l.agentSessionId === 'session-2')).toBe(true);
    });

    it('should filter by toolName', async () => {
      const logs = await logger.getRecentLogs({ toolName: 'search_leads' });

      expect(logs.every((l) => l.toolName === 'search_leads')).toBe(true);
    });

    it('should respect limit', async () => {
      const logs = await logger.getRecentLogs({ limit: 2 });

      expect(logs.length).toBeLessThanOrEqual(2);
    });

    it('should sort by timestamp descending', async () => {
      const logs = await logger.getRecentLogs();

      for (let i = 0; i < logs.length - 1; i++) {
        const currentTime = new Date(logs[i].timestamp).getTime();
        const nextTime = new Date(logs[i + 1].timestamp).getTime();
        expect(currentTime).toBeGreaterThanOrEqual(nextTime);
      }
    });
  });

  describe('getStatistics', () => {
    beforeEach(async () => {
      await logger.log({
        userId: 'user-1',
        agentSessionId: 'stats-session',
        toolName: 'search_leads',
        actionType: 'SEARCH',
        entityType: 'LEAD',
        input: {},
        success: true,
        durationMs: 50,
        approvalRequired: false,
      });

      await logger.log({
        userId: 'user-1',
        agentSessionId: 'stats-session',
        toolName: 'create_case',
        actionType: 'CREATE',
        entityType: 'CASE',
        input: {},
        success: true,
        durationMs: 100,
        approvalRequired: true,
        approvalStatus: 'APPROVED',
      });

      await logger.log({
        userId: 'user-1',
        agentSessionId: 'stats-session',
        toolName: 'update_case',
        actionType: 'UPDATE',
        entityType: 'CASE',
        input: {},
        success: false,
        error: 'Test error',
        durationMs: 50,
        approvalRequired: true,
        approvalStatus: 'REJECTED',
      });
    });

    it('should calculate action counts', async () => {
      const stats = await logger.getStatistics('stats-session');

      expect(stats.totalActions).toBe(3);
      expect(stats.successfulActions).toBe(2);
      expect(stats.failedActions).toBe(1);
    });

    it('should count approval-related actions', async () => {
      const stats = await logger.getStatistics('stats-session');

      expect(stats.actionsRequiringApproval).toBe(2);
      expect(stats.approvedActions).toBe(1);
      expect(stats.rejectedActions).toBe(1);
    });

    it('should calculate average duration', async () => {
      const stats = await logger.getStatistics('stats-session');

      // (50 + 100 + 50) / 3 = 66.67
      expect(stats.avgDurationMs).toBeCloseTo(66.67, 0);
    });

    it('should count by tool name', async () => {
      const stats = await logger.getStatistics('stats-session');

      expect(stats.byToolName['search_leads']).toBe(1);
      expect(stats.byToolName['create_case']).toBe(1);
      expect(stats.byToolName['update_case']).toBe(1);
    });

    it('should count by action type', async () => {
      const stats = await logger.getStatistics('stats-session');

      expect(stats.byActionType['SEARCH']).toBe(1);
      expect(stats.byActionType['CREATE']).toBe(1);
      expect(stats.byActionType['UPDATE']).toBe(1);
    });
  });

  describe('specialized logging methods', () => {
    it('should log authorization events', async () => {
      await logger.logAuthorization('user-1', 'session-1', 'create_case', false, 'Not authorized');

      const logs = await logger.getRecentLogs({ userId: 'user-1' });
      expect(logs[0].success).toBe(false);
      expect(logs[0].error).toBe('Not authorized');
      expect(logs[0].metadata?.eventType).toBe('authorization');
    });

    it('should log approval decisions', async () => {
      await logger.logApprovalDecision(
        'user-1',
        'session-1',
        'action-123',
        'APPROVE',
        'manager-1',
        'Looks good'
      );

      const logs = await logger.getRecentLogs({ userId: 'user-1' });
      expect(logs[0].approvalStatus).toBe('APPROVED');
      expect(logs[0].approvedBy).toBe('manager-1');
      expect(logs[0].metadata?.eventType).toBe('approval');
    });

    it('should log rollback events', async () => {
      await logger.logRollback('user-1', 'session-1', 'action-123', true);

      const logs = await logger.getRecentLogs({ userId: 'user-1' });
      expect(logs[0].success).toBe(true);
      expect(logs[0].metadata?.eventType).toBe('rollback');
    });
  });

  describe('createLogEntry', () => {
    it('should convert AgentActionLog to LogEntry', () => {
      const actionLog: AgentActionLog = {
        id: 'log-1',
        timestamp: new Date(),
        userId: 'user-1',
        agentSessionId: 'session-1',
        toolName: 'search_leads',
        actionType: 'SEARCH',
        entityType: 'LEAD',
        input: { query: 'test' },
        output: { results: [] },
        success: true,
        durationMs: 50,
        approvalRequired: false,
      };

      const logEntry = createLogEntry(actionLog);

      expect(logEntry.timestamp).toBe(actionLog.timestamp.toISOString());
      expect(logEntry.level).toBe('INFO');
      expect(logEntry.userId).toBe('user-1');
      expect(logEntry.toolName).toBe('search_leads');
    });

    it('should set ERROR level for failed actions', () => {
      const actionLog: AgentActionLog = {
        id: 'log-1',
        timestamp: new Date(),
        userId: 'user-1',
        agentSessionId: 'session-1',
        toolName: 'create_case',
        actionType: 'CREATE',
        entityType: 'CASE',
        input: {},
        success: false,
        error: 'Test error',
        durationMs: 50,
        approvalRequired: false,
      };

      const logEntry = createLogEntry(actionLog);

      expect(logEntry.level).toBe('ERROR');
    });
  });

  describe('debug method', () => {
    it('should log debug messages when minLevel is DEBUG', async () => {
      await logger.debug('user-1', 'session-1', 'Test debug message', { extra: 'data' });

      const logs = await logger.getRecentLogs({ userId: 'user-1' });
      expect(logs.length).toBe(1);
      expect(logs[0].input).toEqual({ message: 'Test debug message' });
      expect(logs[0].metadata).toEqual({ extra: 'data' });
    });

    it('should skip debug messages when minLevel is INFO', async () => {
      const infoLogger = new AgentActionLogger({
        logToConsole: false,
        logToFile: false,
        minLevel: 'INFO',
      });

      await infoLogger.debug('user-1', 'session-1', 'Test debug message');

      const logs = await infoLogger.getRecentLogs({ userId: 'user-1' });
      expect(logs.length).toBe(0);

      await infoLogger.stop();
    });
  });

  describe('getRecentLogs with since filter', () => {
    it('should filter logs by since date', async () => {
      const beforeTime = new Date();

      await logger.log({
        userId: 'user-1',
        agentSessionId: 'session-1',
        toolName: 'old_action',
        actionType: 'SEARCH',
        entityType: 'LEAD',
        input: {},
        success: true,
        durationMs: 10,
        approvalRequired: false,
      });

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));
      const afterTime = new Date();

      await logger.log({
        userId: 'user-1',
        agentSessionId: 'session-1',
        toolName: 'new_action',
        actionType: 'CREATE',
        entityType: 'CASE',
        input: {},
        success: true,
        durationMs: 20,
        approvalRequired: false,
      });

      const logsAfter = await logger.getRecentLogs({ since: afterTime });
      expect(logsAfter.every(l => l.toolName === 'new_action')).toBe(true);
    });
  });

  describe('flush behavior', () => {
    it('should clear buffer after flush', async () => {
      await logger.log({
        userId: 'user-1',
        agentSessionId: 'session-1',
        toolName: 'test',
        actionType: 'SEARCH',
        entityType: 'LEAD',
        input: {},
        success: true,
        durationMs: 10,
        approvalRequired: false,
      });

      await logger.flush();

      // Buffer should be cleared but logs are still accessible in memory
      const stats = await logger.getStatistics();
      // After flush, buffer is cleared
      expect(stats.totalActions).toBe(0);
    });

    it('should handle empty buffer flush', async () => {
      // Should not throw
      await logger.flush();
    });
  });

  describe('console logging', () => {
    it('should log to console when enabled', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const consoleLogger = new AgentActionLogger({
        logToConsole: true,
        logToFile: false,
        minLevel: 'INFO',
      });

      await consoleLogger.log({
        userId: 'user-1',
        agentSessionId: 'session-1',
        toolName: 'test_tool',
        actionType: 'SEARCH',
        entityType: 'LEAD',
        input: {},
        success: true,
        durationMs: 10,
        approvalRequired: false,
      });

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
      await consoleLogger.stop();
    });

    it('should log approval info when approvalRequired', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const consoleLogger = new AgentActionLogger({
        logToConsole: true,
        logToFile: false,
        minLevel: 'INFO',
      });

      await consoleLogger.log({
        userId: 'user-1',
        agentSessionId: 'session-1',
        toolName: 'test_tool',
        actionType: 'CREATE',
        entityType: 'CASE',
        input: {},
        success: true,
        durationMs: 10,
        approvalRequired: true,
        approvalStatus: 'APPROVED',
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('approval=APPROVED')
      );
      consoleSpy.mockRestore();
      await consoleLogger.stop();
    });

    it('should log errors to console.error', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const consoleLogger = new AgentActionLogger({
        logToConsole: true,
        logToFile: false,
        minLevel: 'INFO',
      });

      await consoleLogger.log({
        userId: 'user-1',
        agentSessionId: 'session-1',
        toolName: 'test_tool',
        actionType: 'UPDATE',
        entityType: 'LEAD',
        input: {},
        success: false,
        error: 'Test error message',
        durationMs: 10,
        approvalRequired: false,
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Test error message')
      );
      consoleErrorSpy.mockRestore();
      await consoleLogger.stop();
    });
  });

  describe('output redaction', () => {
    it('should redact sensitive fields in output', async () => {
      const loggerWithRedaction = new AgentActionLogger({
        logToConsole: false,
        logToFile: false,
        redactSensitiveFields: true,
        sensitiveFields: ['password', 'secret'],
      });

      await loggerWithRedaction.log({
        userId: 'user-1',
        agentSessionId: 'session-1',
        toolName: 'test_tool',
        actionType: 'SEARCH',
        entityType: 'LEAD',
        input: { query: 'test' },
        output: {
          user: 'testuser',
          password: 'secret123',
        },
        success: true,
        durationMs: 10,
        approvalRequired: false,
      });

      const logs = await loggerWithRedaction.getRecentLogs({ userId: 'user-1' });
      const output = logs[0].output as Record<string, unknown>;
      expect(output.user).toBe('testuser');
      expect(output.password).toBe('[REDACTED]');

      await loggerWithRedaction.stop();
    });
  });

  describe('statistics edge cases', () => {
    it('should return zero avgDuration when no logs', async () => {
      const stats = await logger.getStatistics('non-existent-session');
      expect(stats.avgDurationMs).toBe(0);
    });

    it('should count rollback events', async () => {
      await logger.logRollback('user-1', 'stats-session-2', 'action-1', true);

      const stats = await logger.getStatistics('stats-session-2');
      expect(stats.rollbacks).toBe(1);
    });
  });

  describe('approval rejection logging', () => {
    it('should log rejection decisions', async () => {
      await logger.logApprovalDecision(
        'user-1',
        'session-1',
        'action-123',
        'REJECT',
        'manager-1',
        'Not approved'
      );

      const logs = await logger.getRecentLogs({ userId: 'user-1' });
      expect(logs[0].approvalStatus).toBe('REJECTED');
      expect(logs[0].metadata?.reason).toBe('Not approved');
    });
  });
});
