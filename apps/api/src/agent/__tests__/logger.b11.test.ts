/**
 * Agent Logger B11 Tests - covers remaining uncovered branches
 *
 * Targets:
 * - writeToFile: success path (fs.mkdir + fs.appendFile)
 * - writeToFile: error path (catch block, console.error)
 * - flush with logToFile enabled
 * - buffer overflow triggering auto-flush
 * - startFlushInterval: interval flush + error catch
 * - logToConsole with approvalRequired but no approvalStatus (PENDING)
 * - redactSensitiveData with arrays (non-object, non-redactable)
 * - log with redactSensitiveFields=false
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const mockMkdir = vi.hoisted(() => vi.fn());
const mockAppendFile = vi.hoisted(() => vi.fn());

vi.mock('fs', () => ({
  promises: {
    mkdir: (...args: unknown[]) => mockMkdir(...args),
    appendFile: (...args: unknown[]) => mockAppendFile(...args),
  },
}));

import { AgentActionLogger, createLogEntry } from '../logger';

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'user-1',
    agentSessionId: 'session-1',
    toolName: 'test_tool',
    actionType: 'SEARCH' as const,
    entityType: 'LEAD' as const,
    input: { query: 'test' },
    success: true,
    durationMs: 10,
    approvalRequired: false,
    ...overrides,
  };
}

describe('AgentActionLogger b11 - uncovered branches', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('writeToFile - success path', () => {
    it('should call fs.mkdir and fs.appendFile on flush', async () => {
      mockMkdir.mockResolvedValue(undefined);
      mockAppendFile.mockResolvedValue(undefined);

      const logger = new AgentActionLogger({
        logToConsole: false,
        logToFile: true,
        minLevel: 'INFO',
      });

      await logger.log(makeEntry());
      await logger.flush();

      expect(mockMkdir).toHaveBeenCalledWith(expect.any(String), { recursive: true });
      expect(mockAppendFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('"userId":"user-1"')
      );

      await logger.stop();
    });
  });

  describe('writeToFile - error path', () => {
    it('should catch and log error when file write fails', async () => {
      mockMkdir.mockRejectedValue(new Error('Permission denied'));
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const logger = new AgentActionLogger({
        logToConsole: false,
        logToFile: true,
        minLevel: 'INFO',
      });

      await logger.log(makeEntry());
      await logger.flush();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[AGENT-LOGGER] Failed to write to log file:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
      await logger.stop();
    });
  });

  describe('buffer overflow auto-flush', () => {
    it('should auto-flush when buffer reaches BUFFER_SIZE', async () => {
      mockMkdir.mockResolvedValue(undefined);
      mockAppendFile.mockResolvedValue(undefined);

      const logger = new AgentActionLogger({
        logToConsole: false,
        logToFile: true,
        minLevel: 'INFO',
      });

      // Log 100 entries to trigger auto-flush (BUFFER_SIZE = 100)
      for (let i = 0; i < 100; i++) {
        await logger.log(makeEntry({ toolName: `tool-${i}` }));
      }

      // writeToFile should have been called from the auto-flush
      expect(mockAppendFile).toHaveBeenCalled();

      await logger.stop();
    });
  });

  describe('logToConsole - approval PENDING', () => {
    it('should show approval=PENDING when approvalRequired but no status', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const logger = new AgentActionLogger({
        logToConsole: true,
        logToFile: false,
        minLevel: 'INFO',
      });

      await logger.log(
        makeEntry({
          approvalRequired: true,
          // No approvalStatus set => should show PENDING
        })
      );

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('approval=PENDING'));

      consoleSpy.mockRestore();
      await logger.stop();
    });
  });

  describe('redaction disabled', () => {
    it('should NOT redact when redactSensitiveFields is false', async () => {
      const logger = new AgentActionLogger({
        logToConsole: false,
        logToFile: false,
        redactSensitiveFields: false,
        minLevel: 'DEBUG',
      });

      await logger.log(
        makeEntry({
          input: { password: 'mysecret', name: 'test' },
        })
      );

      const logs = await logger.getRecentLogs({ userId: 'user-1' });
      expect(logs[0].input.password).toBe('mysecret');

      await logger.stop();
    });
  });

  describe('redaction with array values', () => {
    it('should not attempt to redact array values', async () => {
      const logger = new AgentActionLogger({
        logToConsole: false,
        logToFile: false,
        redactSensitiveFields: true,
        sensitiveFields: ['password'],
        minLevel: 'DEBUG',
      });

      await logger.log(
        makeEntry({
          input: {
            tags: ['a', 'b', 'c'],
            count: 42,
            password: 'secret',
          },
        })
      );

      const logs = await logger.getRecentLogs({ userId: 'user-1' });
      expect(logs[0].input.tags).toEqual(['a', 'b', 'c']);
      expect(logs[0].input.count).toBe(42);
      expect(logs[0].input.password).toBe('[REDACTED]');

      await logger.stop();
    });
  });

  describe('output redaction when output is non-object', () => {
    it('should not redact non-object output', async () => {
      const logger = new AgentActionLogger({
        logToConsole: false,
        logToFile: false,
        redactSensitiveFields: true,
        sensitiveFields: ['password'],
        minLevel: 'DEBUG',
      });

      await logger.log(
        makeEntry({
          output: 'just a string',
        })
      );

      const logs = await logger.getRecentLogs({ userId: 'user-1' });
      expect(logs[0].output).toBe('just a string');

      await logger.stop();
    });
  });

  describe('startFlushInterval error handling', () => {
    it('should catch flush errors in interval callback', async () => {
      vi.useFakeTimers();
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Create a logger with logToFile: true but make appendFile fail
      mockMkdir.mockResolvedValue(undefined);
      mockAppendFile.mockRejectedValue(new Error('Write failed'));

      const logger = new AgentActionLogger({
        logToConsole: false,
        logToFile: true,
        minLevel: 'INFO',
      });

      // Add an entry to the buffer
      await logger.log(makeEntry());

      // Advance time by FLUSH_INTERVAL_MS (5000ms) to trigger interval flush
      await vi.advanceTimersByTimeAsync(5000);

      // The error should be caught and logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[AGENT-LOGGER] Failed to write to log file:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
      await logger.stop();
      vi.useRealTimers();
    });
  });

  describe('stop when flushInterval is null', () => {
    it('should handle stop when already stopped', async () => {
      const logger = new AgentActionLogger({
        logToConsole: false,
        logToFile: false,
        minLevel: 'INFO',
      });

      await logger.stop();
      // Second stop should not throw
      await logger.stop();
    });
  });
});
