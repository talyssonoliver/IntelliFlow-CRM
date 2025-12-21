import pino from 'pino';

/**
 * Centralized logger configuration for AI Worker
 * Provides structured logging with correlation IDs and context
 */

export interface LoggerContext {
  operationType?: string;
  userId?: string;
  sessionId?: string;
  taskId?: string;
  agentName?: string;
  [key: string]: unknown;
}

/**
 * Create a logger instance with optional context
 */
export function createLogger(name: string, context?: LoggerContext) {
  const logger = pino({
    name,
    level: process.env.LOG_LEVEL || 'info',
    formatters: {
      level: (label) => {
        return { level: label };
      },
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    ...(process.env.NODE_ENV === 'production'
      ? {}
      : {
          transport: {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'HH:MM:ss Z',
              ignore: 'pid,hostname',
            },
          },
        }),
  });

  if (context) {
    return logger.child(context);
  }

  return logger;
}

/**
 * Global logger instance for general use
 */
export const logger = createLogger('ai-worker');

/**
 * Logger middleware for tracking operation duration
 */
export function withTiming<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  operationName: string
): T {
  return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    const startTime = Date.now();
    const opLogger = createLogger('timing', { operation: operationName });

    try {
      opLogger.debug('Operation started');
      const result = await fn(...args);
      const duration = Date.now() - startTime;

      opLogger.info({ duration }, 'Operation completed successfully');

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      opLogger.error(
        {
          duration,
          error: error instanceof Error ? error.message : String(error),
        },
        'Operation failed'
      );

      throw error;
    }
  }) as T;
}

/**
 * Create a child logger with additional context
 */
export function withContext(context: LoggerContext) {
  return logger.child(context);
}

/**
 * Log levels for different scenarios
 */
export const LOG_LEVELS = {
  TRACE: 'trace',
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
  FATAL: 'fatal',
} as const;

export type LogLevel = (typeof LOG_LEVELS)[keyof typeof LOG_LEVELS];
