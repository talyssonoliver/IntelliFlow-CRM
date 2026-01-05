/**
 * GracefulShutdown Unit Tests
 *
 * @module @intelliflow/worker-shared/tests
 * @task IFC-163
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import pino from 'pino';
import {
  setupGracefulShutdown,
  createCompositeShutdown,
} from '../graceful-shutdown';

describe('setupGracefulShutdown', () => {
  let mockLogger: pino.Logger;
  let mockExit: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockLogger = pino({ level: 'silent' });
    // Mock process.exit before each test
    mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {
      // Don't actually exit, just return
    }) as never);
  });

  afterEach(() => {
    // Restore only the exit mock, not all mocks
    mockExit.mockRestore();
  });

  describe('basic setup', () => {
    it('should return a ShutdownHandler object', () => {
      const shutdownFn = vi.fn().mockResolvedValue(undefined);
      const handler = setupGracefulShutdown(shutdownFn, {
        timeoutMs: 1000,
        logger: mockLogger,
      });

      expect(handler).toBeDefined();
      expect(typeof handler.unregister).toBe('function');
      expect(typeof handler.isShuttingDown).toBe('function');
      expect(typeof handler.triggerShutdown).toBe('function');

      handler.unregister();
    });
  });

  describe('isShuttingDown()', () => {
    it('should return false initially', () => {
      const shutdownFn = vi.fn().mockResolvedValue(undefined);
      const handler = setupGracefulShutdown(shutdownFn, {
        timeoutMs: 1000,
        logger: mockLogger,
      });

      expect(handler.isShuttingDown()).toBe(false);

      handler.unregister();
    });

    it('should return true after shutdown is triggered', async () => {
      const shutdownFn = vi.fn().mockResolvedValue(undefined);
      const handler = setupGracefulShutdown(shutdownFn, {
        timeoutMs: 1000,
        logger: mockLogger,
      });

      // Start but don't await to check state
      const promise = handler.triggerShutdown('test');

      // Should be shutting down
      expect(handler.isShuttingDown()).toBe(true);

      await promise;
      handler.unregister();
    });
  });

  describe('triggerShutdown()', () => {
    it('should call the shutdown function', async () => {
      const shutdownFn = vi.fn().mockResolvedValue(undefined);
      const handler = setupGracefulShutdown(shutdownFn, {
        timeoutMs: 1000,
        logger: mockLogger,
      });

      await handler.triggerShutdown('test');

      expect(shutdownFn).toHaveBeenCalledTimes(1);
      // Should call process.exit(0) on success
      expect(mockExit).toHaveBeenCalledWith(0);

      handler.unregister();
    });

    it('should call process.exit(1) on error', async () => {
      const shutdownFn = vi.fn().mockRejectedValue(new Error('Shutdown failed'));
      const handler = setupGracefulShutdown(shutdownFn, {
        timeoutMs: 1000,
        logger: mockLogger,
      });

      await handler.triggerShutdown('test');

      expect(shutdownFn).toHaveBeenCalledTimes(1);
      expect(mockExit).toHaveBeenCalledWith(1);

      handler.unregister();
    });

    it('should be idempotent when called multiple times', async () => {
      const shutdownFn = vi.fn().mockResolvedValue(undefined);
      const handler = setupGracefulShutdown(shutdownFn, {
        timeoutMs: 1000,
        logger: mockLogger,
      });

      await handler.triggerShutdown('first');
      await handler.triggerShutdown('second');

      expect(shutdownFn).toHaveBeenCalledTimes(1);

      handler.unregister();
    });

    it('should call onShutdownStart callback', async () => {
      const shutdownFn = vi.fn().mockResolvedValue(undefined);
      const onShutdownStart = vi.fn();
      const handler = setupGracefulShutdown(shutdownFn, {
        timeoutMs: 1000,
        logger: mockLogger,
        onShutdownStart,
      });

      await handler.triggerShutdown('test');

      expect(onShutdownStart).toHaveBeenCalledTimes(1);

      handler.unregister();
    });

    it('should call onShutdownComplete callback on success', async () => {
      const shutdownFn = vi.fn().mockResolvedValue(undefined);
      const onShutdownComplete = vi.fn();
      const handler = setupGracefulShutdown(shutdownFn, {
        timeoutMs: 1000,
        logger: mockLogger,
        onShutdownComplete,
      });

      await handler.triggerShutdown('test');

      expect(onShutdownComplete).toHaveBeenCalledTimes(1);

      handler.unregister();
    });
  });

  describe('unregister()', () => {
    it('should remove signal handlers', () => {
      const shutdownFn = vi.fn().mockResolvedValue(undefined);
      const handler = setupGracefulShutdown(shutdownFn, {
        timeoutMs: 1000,
        logger: mockLogger,
      });

      // Get listener counts before
      const sigintBefore = process.listenerCount('SIGINT');
      const sigtermBefore = process.listenerCount('SIGTERM');

      handler.unregister();

      // Should have one less listener after unregister
      expect(process.listenerCount('SIGINT')).toBe(sigintBefore - 1);
      expect(process.listenerCount('SIGTERM')).toBe(sigtermBefore - 1);
    });
  });
});

describe('createCompositeShutdown', () => {
  const mockLogger = pino({ level: 'silent' });

  it('should combine multiple handlers', async () => {
    const handler1 = vi.fn().mockResolvedValue(undefined);
    const handler2 = vi.fn().mockResolvedValue(undefined);

    const composite = createCompositeShutdown(
      [
        { name: 'h1', fn: handler1 },
        { name: 'h2', fn: handler2 },
      ],
      mockLogger
    );

    await composite();

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  it('should continue if one handler fails', async () => {
    const handler1 = vi.fn().mockRejectedValue(new Error('Failed'));
    const handler2 = vi.fn().mockResolvedValue(undefined);

    const composite = createCompositeShutdown(
      [
        { name: 'h1', fn: handler1 },
        { name: 'h2', fn: handler2 },
      ],
      mockLogger
    );

    await composite();

    expect(handler1).toHaveBeenCalled();
    expect(handler2).toHaveBeenCalled();
  });

  it('should run handlers in order', async () => {
    const executionOrder: string[] = [];
    const handler1 = vi.fn(async () => {
      executionOrder.push('h1');
    });
    const handler2 = vi.fn(async () => {
      executionOrder.push('h2');
    });
    const handler3 = vi.fn(async () => {
      executionOrder.push('h3');
    });

    const composite = createCompositeShutdown(
      [
        { name: 'h1', fn: handler1 },
        { name: 'h2', fn: handler2 },
        { name: 'h3', fn: handler3 },
      ],
      mockLogger
    );

    await composite();

    expect(executionOrder).toEqual(['h1', 'h2', 'h3']);
  });

  it('should use default logger if not provided', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);

    const composite = createCompositeShutdown([{ name: 'h1', fn: handler }]);

    await composite();

    expect(handler).toHaveBeenCalled();
  });
});
