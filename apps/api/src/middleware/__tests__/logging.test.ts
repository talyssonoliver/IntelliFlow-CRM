/**
 * Logging Middleware Tests
 *
 * Tests request logging, performance monitoring, and error tracking middleware.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createLoggingMiddleware,
  createPerformanceMiddleware,
  createErrorTrackingMiddleware,
} from '../logging';
import type { Context } from '../../context';

describe('LoggingMiddleware', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('createLoggingMiddleware()', () => {
    it('should log request with correlation ID', async () => {
      const loggingMiddleware = createLoggingMiddleware();
      const mockNext = vi.fn(async () => ({ data: 'test' }));

      const ctx: Context = {
        user: {
          userId: 'user-123',
          email: 'test@example.com',
          role: 'USER',
        },
        prisma: {} as any,
        req: undefined,
        res: undefined,
      };

      await loggingMiddleware({
        ctx,
        path: 'leads.getAll',
        type: 'query',
        next: mockNext,
      });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'request',
          method: 'query',
          path: 'leads.getAll',
          userId: 'user-123',
          correlationId: expect.any(String),
          timestamp: expect.any(String),
        })
      );
    });

    it('should log successful response with duration', async () => {
      const loggingMiddleware = createLoggingMiddleware();
      const mockNext = vi.fn(async () => {
        vi.advanceTimersByTime(150); // Simulate 150ms processing
        return { data: 'test' };
      });

      const ctx: Context = {
        user: {
          userId: 'user-123',
          email: 'test@example.com',
          role: 'USER',
        },
        prisma: {} as any,
        req: undefined,
        res: undefined,
      };

      await loggingMiddleware({
        ctx,
        path: 'leads.create',
        type: 'mutation',
        next: mockNext,
      });

      expect(consoleLogSpy).toHaveBeenCalledTimes(2); // Request + Response

      // Check response log
      const responseCalls = consoleLogSpy.mock.calls.filter(
        (call: [{ type: string }]) => call[0].type === 'response'
      );
      expect(responseCalls).toHaveLength(1);
      expect(responseCalls[0][0]).toMatchObject({
        type: 'response',
        method: 'mutation',
        path: 'leads.create',
        duration: expect.any(Number),
        status: 'success',
        correlationId: expect.any(String),
        timestamp: expect.any(String),
      });
    });

    it('should log errors with correlation ID', async () => {
      const loggingMiddleware = createLoggingMiddleware();
      const mockError = new Error('Database connection failed');
      const mockNext = vi.fn(async () => {
        vi.advanceTimersByTime(50);
        throw mockError;
      });

      const ctx: Context = {
        user: {
          userId: 'user-456',
          email: 'test@example.com',
          role: 'USER',
        },
        prisma: {} as any,
        req: undefined,
        res: undefined,
      };

      await expect(
        loggingMiddleware({
          ctx,
          path: 'leads.update',
          type: 'mutation',
          next: mockNext,
        })
      ).rejects.toThrow('Database connection failed');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          correlationId: expect.any(String),
          type: 'error',
          method: 'mutation',
          path: 'leads.update',
          duration: expect.any(Number),
          error: 'Database connection failed',
          timestamp: expect.any(String),
        })
      );
    });

    it('should handle non-Error exceptions', async () => {
      const loggingMiddleware = createLoggingMiddleware();
      const mockNext = vi.fn(async () => {
        throw 'String error'; // Non-Error object
      });

      const ctx: Context = {
        user: null,
        prisma: {} as any,
        req: undefined,
        res: undefined,
      };

      await expect(
        loggingMiddleware({
          ctx,
          path: 'public.health',
          type: 'query',
          next: mockNext,
        })
      ).rejects.toBe('String error');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          error: 'Unknown error',
        })
      );
    });

    it('should include correlation ID in context', async () => {
      const loggingMiddleware = createLoggingMiddleware();
      let capturedContext: any;

      const mockNext = vi.fn(async (opts) => {
        capturedContext = opts?.ctx;
        return { success: true };
      });

      const ctx: Context = {
        user: {
          userId: 'user-789',
          email: 'test@example.com',
          role: 'USER',
        },
        prisma: {} as any,
        req: undefined,
        res: undefined,
      };

      await loggingMiddleware({
        ctx,
        path: 'contacts.list',
        type: 'query',
        next: mockNext,
      });

      expect(capturedContext).toBeDefined();
      expect(capturedContext.correlationId).toBeDefined();
      expect(typeof capturedContext.correlationId).toBe('string');
      expect(capturedContext.correlationId).toMatch(/^\d+-[a-z0-9]+$/);
    });

    it('should log requests without user', async () => {
      const loggingMiddleware = createLoggingMiddleware();
      const mockNext = vi.fn(async () => ({ data: 'public' }));

      const ctx: Context = {
        user: null,
        prisma: {} as any,
        req: undefined,
        res: undefined,
      };

      await loggingMiddleware({
        ctx,
        path: 'public.info',
        type: 'query',
        next: mockNext,
      });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'request',
          userId: undefined,
        })
      );
    });

    it('should preserve original context properties', async () => {
      const loggingMiddleware = createLoggingMiddleware();
      let capturedContext: any;

      const mockNext = vi.fn(async (opts) => {
        capturedContext = opts?.ctx;
        return {};
      });

      const ctx: Context & { customProp: string } = {
        user: {
          userId: 'user-123',
          email: 'test@example.com',
          role: 'USER',
        },
        prisma: {} as any,
        req: undefined,
        res: undefined,
        customProp: 'custom-value',
      };

      await loggingMiddleware({
        ctx,
        path: 'test.route',
        type: 'query',
        next: mockNext,
      });

      expect(capturedContext.customProp).toBe('custom-value');
      expect(capturedContext.user).toEqual(ctx.user);
    });

    it('should generate unique correlation IDs', async () => {
      const loggingMiddleware = createLoggingMiddleware();
      const correlationIds: string[] = [];

      for (let i = 0; i < 5; i++) {
        const mockNext = vi.fn(async (opts: any) => {
          correlationIds.push(opts.ctx.correlationId);
          return {};
        });

        await loggingMiddleware({
          ctx: { user: null, prisma: {} as any, req: undefined, res: undefined },
          path: 'test.route',
          type: 'query',
          next: mockNext,
        });
      }

      // All correlation IDs should be unique
      const uniqueIds = new Set(correlationIds);
      expect(uniqueIds.size).toBe(5);
    });

    it('should calculate accurate duration', async () => {
      const loggingMiddleware = createLoggingMiddleware();
      const mockNext = vi.fn(async () => {
        vi.advanceTimersByTime(250);
        return {};
      });

      await loggingMiddleware({
        ctx: { user: null, prisma: {} as any, req: undefined, res: undefined },
        path: 'test.route',
        type: 'query',
        next: mockNext,
      });

      const responseLog = consoleLogSpy.mock.calls.find(
        (call: [{ type: string }]) => call[0].type === 'response'
      );
      expect(responseLog).toBeDefined();
      expect(responseLog![0].duration).toBeGreaterThanOrEqual(250);
    });

    it('should re-throw errors after logging', async () => {
      const loggingMiddleware = createLoggingMiddleware();
      const customError = new Error('Custom error message');
      const mockNext = vi.fn(async () => {
        throw customError;
      });

      const promise = loggingMiddleware({
        ctx: { user: null, prisma: {} as any, req: undefined, res: undefined },
        path: 'test.route',
        type: 'query',
        next: mockNext,
      });

      await expect(promise).rejects.toThrow(customError);
      await expect(promise).rejects.toThrow('Custom error message');
    });
  });

  describe('createPerformanceMiddleware()', () => {
    it('should log slow requests exceeding threshold', async () => {
      const performanceMiddleware = createPerformanceMiddleware(100); // 100ms threshold
      const mockNext = vi.fn(async () => {
        vi.advanceTimersByTime(150); // 150ms processing
        return { data: 'test' };
      });

      const ctx: Context = {
        user: {
          userId: 'user-123',
          email: 'test@example.com',
          role: 'USER',
        },
        prisma: {} as any,
        req: undefined,
        res: undefined,
      };

      await performanceMiddleware({
        ctx,
        path: 'slow.operation',
        type: 'query',
        next: mockNext,
      });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'slow_request',
          method: 'query',
          path: 'slow.operation',
          duration: expect.any(Number),
          threshold: 100,
          userId: 'user-123',
          timestamp: expect.any(String),
        })
      );
    });

    it('should not log fast requests below threshold', async () => {
      const performanceMiddleware = createPerformanceMiddleware(200); // 200ms threshold
      const mockNext = vi.fn(async () => {
        vi.advanceTimersByTime(50); // 50ms processing
        return { data: 'test' };
      });

      const ctx: Context = {
        user: {
          userId: 'user-123',
          email: 'test@example.com',
          role: 'USER',
        },
        prisma: {} as any,
        req: undefined,
        res: undefined,
      };

      await performanceMiddleware({
        ctx,
        path: 'fast.operation',
        type: 'query',
        next: mockNext,
      });

      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should use default threshold of 1000ms', async () => {
      const performanceMiddleware = createPerformanceMiddleware(); // Default 1000ms
      const mockNext = vi.fn(async () => {
        vi.advanceTimersByTime(1500); // 1500ms processing
        return { data: 'test' };
      });

      await performanceMiddleware({
        ctx: { user: null, prisma: {} as any, req: undefined, res: undefined },
        path: 'very.slow',
        type: 'query',
        next: mockNext,
      });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          threshold: 1000,
          duration: expect.any(Number),
        })
      );
    });

    it('should log requests at exact threshold', async () => {
      const performanceMiddleware = createPerformanceMiddleware(100);
      const mockNext = vi.fn(async () => {
        vi.advanceTimersByTime(100); // Exactly at threshold
        return {};
      });

      await performanceMiddleware({
        ctx: { user: null, prisma: {} as any, req: undefined, res: undefined },
        path: 'test.route',
        type: 'query',
        next: mockNext,
      });

      // Should not log when duration equals threshold (only when exceeding)
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should log requests just above threshold', async () => {
      const performanceMiddleware = createPerformanceMiddleware(100);
      const mockNext = vi.fn(async () => {
        vi.advanceTimersByTime(101); // Just above threshold
        return {};
      });

      await performanceMiddleware({
        ctx: { user: null, prisma: {} as any, req: undefined, res: undefined },
        path: 'test.route',
        type: 'query',
        next: mockNext,
      });

      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    it('should return result from next middleware', async () => {
      const performanceMiddleware = createPerformanceMiddleware(100);
      const expectedResult = { data: 'test', count: 42 };
      const mockNext = vi.fn(async () => expectedResult);

      const result = await performanceMiddleware({
        ctx: { user: null, prisma: {} as any, req: undefined, res: undefined },
        path: 'test.route',
        type: 'query',
        next: mockNext,
      });

      expect(result).toEqual(expectedResult);
    });

    it('should handle errors without logging performance', async () => {
      const performanceMiddleware = createPerformanceMiddleware(100);
      const mockNext = vi.fn(async () => {
        vi.advanceTimersByTime(500);
        throw new Error('Operation failed');
      });

      await expect(
        performanceMiddleware({
          ctx: { user: null, prisma: {} as any, req: undefined, res: undefined },
          path: 'test.route',
          type: 'query',
          next: mockNext,
        })
      ).rejects.toThrow('Operation failed');

      // Should not log slow request when error occurs
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should log without userId for unauthenticated requests', async () => {
      const performanceMiddleware = createPerformanceMiddleware(50);
      const mockNext = vi.fn(async () => {
        vi.advanceTimersByTime(100);
        return {};
      });

      await performanceMiddleware({
        ctx: { user: null, prisma: {} as any, req: undefined, res: undefined },
        path: 'public.slow',
        type: 'query',
        next: mockNext,
      });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: undefined,
        })
      );
    });

    it('should handle custom threshold values', async () => {
      const customThreshold = 2500;
      const performanceMiddleware = createPerformanceMiddleware(customThreshold);
      const mockNext = vi.fn(async () => {
        vi.advanceTimersByTime(3000);
        return {};
      });

      await performanceMiddleware({
        ctx: { user: null, prisma: {} as any, req: undefined, res: undefined },
        path: 'test.route',
        type: 'query',
        next: mockNext,
      });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          threshold: customThreshold,
        })
      );
    });
  });

  describe('createErrorTrackingMiddleware()', () => {
    it('should track errors and re-throw', async () => {
      const errorTrackingMiddleware = createErrorTrackingMiddleware();
      const mockError = new Error('Unexpected error');
      const mockNext = vi.fn(async () => {
        throw mockError;
      });

      const ctx: Context = {
        user: {
          userId: 'user-123',
          email: 'test@example.com',
          role: 'USER',
        },
        prisma: {} as any,
        req: undefined,
        res: undefined,
      };

      await expect(
        errorTrackingMiddleware({
          ctx,
          path: 'leads.create',
          type: 'mutation',
          next: mockNext,
        })
      ).rejects.toThrow('Unexpected error');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'unhandled_error',
          method: 'mutation',
          path: 'leads.create',
          error: {
            message: 'Unexpected error',
            stack: expect.any(String),
            name: 'Error',
          },
          userId: 'user-123',
          timestamp: expect.any(String),
        })
      );
    });

    it('should handle non-Error objects', async () => {
      const errorTrackingMiddleware = createErrorTrackingMiddleware();
      const mockNext = vi.fn(async () => {
        throw { custom: 'error object' };
      });

      await expect(
        errorTrackingMiddleware({
          ctx: { user: null, prisma: {} as any, req: undefined, res: undefined },
          path: 'test.route',
          type: 'query',
          next: mockNext,
        })
      ).rejects.toEqual({ custom: 'error object' });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          error: { custom: 'error object' },
        })
      );
    });

    it('should return result when no error occurs', async () => {
      const errorTrackingMiddleware = createErrorTrackingMiddleware();
      const expectedResult = { success: true, data: 'test' };
      const mockNext = vi.fn(async () => expectedResult);

      const result = await errorTrackingMiddleware({
        ctx: { user: null, prisma: {} as any, req: undefined, res: undefined },
        path: 'test.route',
        type: 'query',
        next: mockNext,
      });

      expect(result).toEqual(expectedResult);
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should log errors without userId for unauthenticated requests', async () => {
      const errorTrackingMiddleware = createErrorTrackingMiddleware();
      const mockNext = vi.fn(async () => {
        throw new Error('Public endpoint error');
      });

      await expect(
        errorTrackingMiddleware({
          ctx: { user: null, prisma: {} as any, req: undefined, res: undefined },
          path: 'public.health',
          type: 'query',
          next: mockNext,
        })
      ).rejects.toThrow('Public endpoint error');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: undefined,
        })
      );
    });

    it('should capture error stack trace', async () => {
      const errorTrackingMiddleware = createErrorTrackingMiddleware();
      const mockError = new Error('Stack trace test');
      const mockNext = vi.fn(async () => {
        throw mockError;
      });

      await expect(
        errorTrackingMiddleware({
          ctx: { user: null, prisma: {} as any, req: undefined, res: undefined },
          path: 'test.route',
          type: 'query',
          next: mockNext,
        })
      ).rejects.toThrow(mockError);

      const errorLog = consoleErrorSpy.mock.calls[0][0];
      expect(errorLog.error.stack).toBeDefined();
      expect(errorLog.error.stack).toContain('Error: Stack trace test');
    });

    it('should preserve error name', async () => {
      const errorTrackingMiddleware = createErrorTrackingMiddleware();

      class CustomError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'CustomError';
        }
      }

      const mockNext = vi.fn(async () => {
        throw new CustomError('Custom error occurred');
      });

      await expect(
        errorTrackingMiddleware({
          ctx: { user: null, prisma: {} as any, req: undefined, res: undefined },
          path: 'test.route',
          type: 'query',
          next: mockNext,
        })
      ).rejects.toThrow('Custom error occurred');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            name: 'CustomError',
            message: 'Custom error occurred',
          }),
        })
      );
    });

    it('should handle string errors', async () => {
      const errorTrackingMiddleware = createErrorTrackingMiddleware();
      const mockNext = vi.fn(async () => {
        throw 'Simple string error';
      });

      await expect(
        errorTrackingMiddleware({
          ctx: { user: null, prisma: {} as any, req: undefined, res: undefined },
          path: 'test.route',
          type: 'query',
          next: mockNext,
        })
      ).rejects.toBe('Simple string error');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Simple string error',
        })
      );
    });

    it('should handle null/undefined errors', async () => {
      const errorTrackingMiddleware = createErrorTrackingMiddleware();
      const mockNext = vi.fn(async () => {
        throw null;
      });

      await expect(
        errorTrackingMiddleware({
          ctx: { user: null, prisma: {} as any, req: undefined, res: undefined },
          path: 'test.route',
          type: 'query',
          next: mockNext,
        })
      ).rejects.toBeNull();

      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('Middleware Composition', () => {
    it('should compose logging and performance middleware', async () => {
      const loggingMiddleware = createLoggingMiddleware();
      const performanceMiddleware = createPerformanceMiddleware(100);

      const finalNext = vi.fn(async () => {
        vi.advanceTimersByTime(150);
        return { data: 'success' };
      });

      const result = await loggingMiddleware({
        ctx: { user: null, prisma: {} as any, req: undefined, res: undefined },
        path: 'test.route',
        type: 'query',
        next: async () =>
          performanceMiddleware({
            ctx: { user: null, prisma: {} as any, req: undefined, res: undefined },
            path: 'test.route',
            type: 'query',
            next: finalNext,
          }),
      });

      expect(result).toEqual({ data: 'success' });
      expect(consoleLogSpy).toHaveBeenCalled(); // Logging middleware
      expect(consoleWarnSpy).toHaveBeenCalled(); // Performance middleware (slow request)
    });

    it('should compose all three middleware types', async () => {
      const loggingMiddleware = createLoggingMiddleware();
      const performanceMiddleware = createPerformanceMiddleware(50);
      const errorTrackingMiddleware = createErrorTrackingMiddleware();

      const finalNext = vi.fn(async () => {
        vi.advanceTimersByTime(100);
        throw new Error('Test error');
      });

      await expect(
        loggingMiddleware({
          ctx: { user: null, prisma: {} as any, req: undefined, res: undefined },
          path: 'test.route',
          type: 'query',
          next: async () =>
            performanceMiddleware({
              ctx: { user: null, prisma: {} as any, req: undefined, res: undefined },
              path: 'test.route',
              type: 'query',
              next: async () =>
                errorTrackingMiddleware({
                  ctx: { user: null, prisma: {} as any, req: undefined, res: undefined },
                  path: 'test.route',
                  type: 'query',
                  next: finalNext,
                }),
            }),
        })
      ).rejects.toThrow('Test error');

      expect(consoleLogSpy).toHaveBeenCalled(); // Request log
      expect(consoleErrorSpy).toHaveBeenCalledTimes(2); // Logging + Error tracking
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long operation names', async () => {
      const loggingMiddleware = createLoggingMiddleware();
      const longPath = 'very.long.path.with.many.segments.that.goes.on.and.on';
      const mockNext = vi.fn(async () => ({}));

      await loggingMiddleware({
        ctx: { user: null, prisma: {} as any, req: undefined, res: undefined },
        path: longPath,
        type: 'query',
        next: mockNext,
      });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          path: longPath,
        })
      );
    });

    it('should handle zero duration', async () => {
      const performanceMiddleware = createPerformanceMiddleware(0);
      const mockNext = vi.fn(async () => {
        // No time advancement
        return {};
      });

      await performanceMiddleware({
        ctx: { user: null, prisma: {} as any, req: undefined, res: undefined },
        path: 'instant.operation',
        type: 'query',
        next: mockNext,
      });

      // Should not log when duration is 0 (not > threshold)
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should handle negative threshold values', async () => {
      const performanceMiddleware = createPerformanceMiddleware(-100);
      const mockNext = vi.fn(async () => ({}));

      await performanceMiddleware({
        ctx: { user: null, prisma: {} as any, req: undefined, res: undefined },
        path: 'test.route',
        type: 'query',
        next: mockNext,
      });

      // All operations are slower than negative threshold
      expect(consoleWarnSpy).toHaveBeenCalled();
    });
  });
});
