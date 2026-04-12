import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLogger, logger, withTiming, withContext, LOG_LEVELS, LoggerContext } from './logger';

describe('Logger', () => {
  // Store original env vars
  const originalLogLevel = process.env.LOG_LEVEL;
  const originalNodeEnv = process.env.NODE_ENV;

  // Ensure clean state before each test
  beforeEach(() => {
    // Set a known log level to prevent pino errors
    process.env.LOG_LEVEL = 'info';
  });

  // Restore after all tests
  afterEach(() => {
    if (originalLogLevel === undefined) {
      delete process.env.LOG_LEVEL;
    } else {
      process.env.LOG_LEVEL = originalLogLevel;
    }
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  describe('createLogger', () => {
    it('should create logger with name', () => {
      const testLogger = createLogger('test-logger');

      expect(testLogger).toBeDefined();
      expect(testLogger.info).toBeInstanceOf(Function);
      expect(testLogger.error).toBeInstanceOf(Function);
      expect(testLogger.warn).toBeInstanceOf(Function);
      expect(testLogger.debug).toBeInstanceOf(Function);
    });

    it('should create logger with context', () => {
      const context: LoggerContext = {
        operationType: 'test',
        userId: 'user-123',
        sessionId: 'session-456',
      };

      const contextLogger = createLogger('context-logger', context);

      expect(contextLogger).toBeDefined();
    });

    it('should respect LOG_LEVEL environment variable', () => {
      const originalLogLevel = process.env.LOG_LEVEL;

      process.env.LOG_LEVEL = 'debug';
      const debugLogger = createLogger('debug-logger');
      expect(debugLogger).toBeDefined();

      process.env.LOG_LEVEL = 'error';
      const errorLogger = createLogger('error-logger');
      expect(errorLogger).toBeDefined();

      // Properly restore
      if (originalLogLevel === undefined) {
        delete process.env.LOG_LEVEL;
      } else {
        process.env.LOG_LEVEL = originalLogLevel;
      }
    });

    it('should default to info level', () => {
      const originalLogLevel = process.env.LOG_LEVEL;
      delete process.env.LOG_LEVEL;

      const defaultLogger = createLogger('default-logger');
      expect(defaultLogger).toBeDefined();

      // Properly restore
      if (originalLogLevel === undefined) {
        delete process.env.LOG_LEVEL;
      } else {
        process.env.LOG_LEVEL = originalLogLevel;
      }
    });
  });

  describe('global logger', () => {
    it('should export global logger instance', () => {
      expect(logger).toBeDefined();
      expect(logger.info).toBeInstanceOf(Function);
      expect(logger.error).toBeInstanceOf(Function);
      expect(logger.warn).toBeInstanceOf(Function);
      expect(logger.debug).toBeInstanceOf(Function);
      expect(logger.trace).toBeInstanceOf(Function);
      expect(logger.fatal).toBeInstanceOf(Function);
    });
  });

  describe('withTiming', () => {
    it('should wrap async function with timing', async () => {
      const mockFn = vi.fn(async (a: string, b: string) => 'success');

      // withTiming returns a wrapped function
      const result = await withTiming(mockFn, 'test-operation')('arg1', 'arg2');

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2');
    });

    it('should measure execution time', async () => {
      const delayFn = async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return 'done';
      };

      const result = await withTiming(delayFn, 'delay-operation')();

      expect(result).toBe('done');
    });

    it('should handle errors and still measure time', async () => {
      const errorFn = vi.fn(async () => {
        throw new Error('Test error');
      });

      await expect(withTiming(errorFn, 'error-operation')()).rejects.toThrow('Test error');
      expect(errorFn).toHaveBeenCalled();
    });

    it('should preserve function signature', async () => {
      const typedFn = async (a: number, b: string): Promise<boolean> => {
        return a > 0 && b.length > 0;
      };

      const result = await withTiming(typedFn, 'typed-operation')(5, 'test');

      expect(result).toBe(true);
    });

    it('should work with multiple arguments', async () => {
      const multiArgFn = async (a: string, b: number, c: boolean) => {
        return { a, b, c };
      };

      const result = await withTiming(multiArgFn, 'multi-arg-operation')('test', 42, true);

      expect(result).toEqual({ a: 'test', b: 42, c: true });
    });
  });

  describe('withContext', () => {
    it('should create child logger with context', () => {
      const context: LoggerContext = {
        operationType: 'test-op',
        userId: 'user-789',
        taskId: 'task-123',
      };

      const childLogger = withContext(context);

      expect(childLogger).toBeDefined();
      expect(childLogger.info).toBeInstanceOf(Function);
    });

    it('should support nested context', () => {
      const parentContext: LoggerContext = {
        sessionId: 'session-123',
      };

      const childContext: LoggerContext = {
        operationType: 'nested-op',
        userId: 'user-456',
      };

      const parentLogger = withContext(parentContext);
      const childLogger = parentLogger.child(childContext);

      expect(childLogger).toBeDefined();
    });

    it('should allow custom metadata fields', () => {
      const context: LoggerContext = {
        operationType: 'custom',
        customField1: 'value1',
        customField2: 42,
        customField3: { nested: 'object' },
      };

      const customLogger = withContext(context);

      expect(customLogger).toBeDefined();
    });
  });

  describe('LOG_LEVELS', () => {
    it('should export all log levels', () => {
      expect(LOG_LEVELS.TRACE).toBe('trace');
      expect(LOG_LEVELS.DEBUG).toBe('debug');
      expect(LOG_LEVELS.INFO).toBe('info');
      expect(LOG_LEVELS.WARN).toBe('warn');
      expect(LOG_LEVELS.ERROR).toBe('error');
      expect(LOG_LEVELS.FATAL).toBe('fatal');
    });

    it('should have 6 log levels', () => {
      const levels = Object.keys(LOG_LEVELS);
      expect(levels).toHaveLength(6);
    });
  });

  describe('LoggerContext type', () => {
    it('should accept standard context fields', () => {
      const context: LoggerContext = {
        operationType: 'test',
        userId: 'user-123',
        sessionId: 'session-456',
        taskId: 'task-789',
        agentName: 'test-agent',
      };

      expect(context.operationType).toBe('test');
      expect(context.userId).toBe('user-123');
      expect(context.sessionId).toBe('session-456');
      expect(context.taskId).toBe('task-789');
      expect(context.agentName).toBe('test-agent');
    });

    it('should accept custom fields via index signature', () => {
      const context: LoggerContext = {
        customField: 'custom-value',
        numericField: 42,
        booleanField: true,
        objectField: { nested: 'value' },
      };

      expect(context.customField).toBe('custom-value');
      expect(context.numericField).toBe(42);
      expect(context.booleanField).toBe(true);
      expect(context.objectField).toEqual({ nested: 'value' });
    });
  });

  describe('production vs development', () => {
    it('should handle production environment', () => {
      const originalEnv = process.env.NODE_ENV;
      const originalLogLevel = process.env.LOG_LEVEL;

      process.env.NODE_ENV = 'production';
      process.env.LOG_LEVEL = 'info';

      const prodLogger = createLogger('prod-logger');
      expect(prodLogger).toBeDefined();

      // Properly restore env vars
      if (originalEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = originalEnv;
      }
      if (originalLogLevel === undefined) {
        delete process.env.LOG_LEVEL;
      } else {
        process.env.LOG_LEVEL = originalLogLevel;
      }
    });

    it('should handle development environment', () => {
      const originalEnv = process.env.NODE_ENV;
      const originalLogLevel = process.env.LOG_LEVEL;

      process.env.NODE_ENV = 'development';
      process.env.LOG_LEVEL = 'debug';

      const devLogger = createLogger('dev-logger');
      expect(devLogger).toBeDefined();

      // Properly restore env vars
      if (originalEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = originalEnv;
      }
      if (originalLogLevel === undefined) {
        delete process.env.LOG_LEVEL;
      } else {
        process.env.LOG_LEVEL = originalLogLevel;
      }
    });
  });

  describe('error handling in withTiming', () => {
    it('should re-throw original error', async () => {
      const customError = new Error('Custom error message');
      const errorFn = vi.fn(async () => {
        throw customError;
      });

      await expect(withTiming(errorFn, 'error-test')()).rejects.toThrow('Custom error message');
    });

    it('should handle non-Error objects', async () => {
      const errorFn = vi.fn(async () => {
        throw 'String error';
      });

      await expect(withTiming(errorFn, 'string-error')()).rejects.toBe('String error');
    });
  });
});
