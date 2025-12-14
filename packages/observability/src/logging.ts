/**
 * Structured Logging Utilities
 *
 * This module provides structured logging with correlation IDs and trace context.
 * It uses Pino for high-performance JSON logging.
 *
 * Key Features:
 * - Structured JSON logging
 * - Automatic correlation IDs
 * - Trace context integration
 * - Performance-optimized
 * - Log levels and filtering
 * - Pretty printing for development
 *
 * Usage:
 * ```typescript
 * import { createLogger } from '@intelliflow/observability/logging';
 *
 * const logger = createLogger({ name: 'my-service' });
 *
 * logger.info({ userId: '123' }, 'User logged in');
 * logger.error({ err: error }, 'Failed to process request');
 * ```
 */

import pino from 'pino';
import { getTraceId, getSpanId } from './tracing';

/**
 * Logger configuration options
 */
export interface LoggerConfig {
  name: string;
  level?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  prettyPrint?: boolean;
  destination?: string;
}

/**
 * Log context with correlation IDs
 */
export interface LogContext {
  correlationId?: string;
  traceId?: string;
  spanId?: string;
  userId?: string;
  requestId?: string;
  [key: string]: any;
}

/**
 * Create a structured logger instance
 *
 * @param config - Logger configuration
 * @returns Pino logger instance
 */
export function createLogger(config: LoggerConfig): pino.Logger {
  const level = config.level || process.env.LOG_LEVEL || 'info';
  const isDevelopment = process.env.NODE_ENV !== 'production';

  const options: pino.LoggerOptions = {
    name: config.name,
    level,

    // Base configuration
    base: {
      service: config.name,
      environment: process.env.ENVIRONMENT || 'development',
      version: process.env.SERVICE_VERSION || '0.1.0',
    },

    // Timestamp configuration
    timestamp: pino.stdTimeFunctions.isoTime,

    // Serializers for common objects
    serializers: {
      err: pino.stdSerializers.err,
      error: pino.stdSerializers.err,
      req: pino.stdSerializers.req,
      res: pino.stdSerializers.res,
    },

    // Format options
    formatters: {
      level: (label) => {
        return { level: label };
      },
      bindings: (bindings) => {
        return {
          pid: bindings.pid,
          hostname: bindings.hostname,
        };
      },
    },

    // Hooks to add trace context
    mixin: () => {
      return {
        traceId: getTraceId(),
        spanId: getSpanId(),
      };
    },
  };

  // Pretty printing for development
  const transport = config.prettyPrint || (isDevelopment && !process.env.CI)
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
          singleLine: false,
          messageFormat: '{msg} [{traceId}]',
        },
      }
    : undefined;

  return pino(
    options,
    transport
      ? pino.transport(transport)
      : config.destination
      ? pino.destination(config.destination)
      : undefined
  );
}

/**
 * Default logger instance
 */
let defaultLogger: pino.Logger | null = null;

/**
 * Initialize the default logger
 *
 * @param config - Logger configuration
 */
export function initLogger(config: LoggerConfig): void {
  defaultLogger = createLogger(config);
  console.log(`✅ Logger initialized for ${config.name}`);
}

/**
 * Get the default logger instance
 */
export function getLogger(): pino.Logger {
  if (!defaultLogger) {
    // Create a fallback logger if not initialized
    defaultLogger = createLogger({ name: 'default' });
  }
  return defaultLogger;
}

/**
 * Create a child logger with additional context
 *
 * @param context - Additional context to include in all logs
 * @returns Child logger
 */
export function createChildLogger(context: LogContext): pino.Logger {
  return getLogger().child(context);
}

/**
 * Log levels enum
 */
export enum LogLevel {
  TRACE = 10,
  DEBUG = 20,
  INFO = 30,
  WARN = 40,
  ERROR = 50,
  FATAL = 60,
}

/**
 * Logger utilities
 */
export const logger = {
  /**
   * Log trace message
   */
  trace: (context: LogContext | string, message?: string) => {
    if (typeof context === 'string') {
      getLogger().trace(context);
    } else {
      getLogger().trace(context, message);
    }
  },

  /**
   * Log debug message
   */
  debug: (context: LogContext | string, message?: string) => {
    if (typeof context === 'string') {
      getLogger().debug(context);
    } else {
      getLogger().debug(context, message);
    }
  },

  /**
   * Log info message
   */
  info: (context: LogContext | string, message?: string) => {
    if (typeof context === 'string') {
      getLogger().info(context);
    } else {
      getLogger().info(context, message);
    }
  },

  /**
   * Log warning message
   */
  warn: (context: LogContext | string, message?: string) => {
    if (typeof context === 'string') {
      getLogger().warn(context);
    } else {
      getLogger().warn(context, message);
    }
  },

  /**
   * Log error message
   */
  error: (context: LogContext | string | Error, message?: string) => {
    if (context instanceof Error) {
      getLogger().error({ err: context }, message || context.message);
    } else if (typeof context === 'string') {
      getLogger().error(context);
    } else {
      getLogger().error(context, message);
    }
  },

  /**
   * Log fatal message
   */
  fatal: (context: LogContext | string | Error, message?: string) => {
    if (context instanceof Error) {
      getLogger().fatal({ err: context }, message || context.message);
    } else if (typeof context === 'string') {
      getLogger().fatal(context);
    } else {
      getLogger().fatal(context, message);
    }
  },
};

/**
 * Request logger middleware helper
 *
 * Creates a child logger with request context
 */
export function createRequestLogger(requestId: string, additionalContext?: LogContext): pino.Logger {
  return createChildLogger({
    requestId,
    correlationId: requestId,
    ...additionalContext,
  });
}

/**
 * Log domain events
 */
export function logDomainEvent(
  eventName: string,
  eventData: Record<string, any>,
  context?: LogContext
): void {
  logger.info(
    {
      event: eventName,
      eventData,
      ...context,
    },
    `Domain event: ${eventName}`
  );
}

/**
 * Log API requests
 */
export function logApiRequest(
  method: string,
  url: string,
  statusCode: number,
  duration: number,
  context?: LogContext
): void {
  const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';

  getLogger()[level](
    {
      http: {
        method,
        url,
        statusCode,
        duration,
      },
      ...context,
    },
    `${method} ${url} ${statusCode} ${duration}ms`
  );
}

/**
 * Log database queries
 */
export function logDatabaseQuery(
  operation: string,
  table: string,
  duration: number,
  context?: LogContext
): void {
  logger.debug(
    {
      db: {
        operation,
        table,
        duration,
      },
      ...context,
    },
    `DB ${operation} on ${table} (${duration}ms)`
  );
}

/**
 * Log AI operations
 */
export function logAiOperation(
  model: string,
  operation: string,
  duration: number,
  cost: number,
  context?: LogContext
): void {
  logger.info(
    {
      ai: {
        model,
        operation,
        duration,
        cost,
      },
      ...context,
    },
    `AI ${operation} with ${model} (${duration}ms, $${cost.toFixed(4)})`
  );
}

/**
 * Log cache operations
 */
export function logCacheOperation(
  operation: 'hit' | 'miss' | 'set' | 'delete',
  key: string,
  context?: LogContext
): void {
  logger.debug(
    {
      cache: {
        operation,
        key,
      },
      ...context,
    },
    `Cache ${operation}: ${key}`
  );
}

/**
 * Log security events
 */
export function logSecurityEvent(
  eventType: string,
  severity: 'low' | 'medium' | 'high' | 'critical',
  details: Record<string, any>,
  context?: LogContext
): void {
  const level = severity === 'critical' || severity === 'high' ? 'error' : 'warn';

  getLogger()[level](
    {
      security: {
        eventType,
        severity,
        ...details,
      },
      ...context,
    },
    `Security event: ${eventType} (${severity})`
  );
}

/**
 * Log business metrics
 */
export function logBusinessMetric(
  metricName: string,
  value: number,
  unit: string,
  context?: LogContext
): void {
  logger.info(
    {
      metric: {
        name: metricName,
        value,
        unit,
      },
      ...context,
    },
    `Metric: ${metricName} = ${value} ${unit}`
  );
}

/**
 * Performance logger decorator
 *
 * @example
 * ```typescript
 * class LeadService {
 *   @LogPerformance('LeadService.processLead')
 *   async processLead(leadId: string) {
 *     // Method implementation
 *   }
 * }
 * ```
 */
export function LogPerformance(operationName?: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor {
    const originalMethod = descriptor.value;
    const name = operationName || `${target.constructor.name}.${propertyKey}`;

    descriptor.value = async function (...args: any[]) {
      const startTime = Date.now();
      try {
        const result = await originalMethod.apply(this, args);
        const duration = Date.now() - startTime;

        logger.debug(
          {
            operation: name,
            duration,
            class: target.constructor.name,
            method: propertyKey,
          },
          `${name} completed in ${duration}ms`
        );

        return result;
      } catch (error) {
        const duration = Date.now() - startTime;

        logger.error(
          {
            operation: name,
            duration,
            class: target.constructor.name,
            method: propertyKey,
            err: error,
          },
          `${name} failed after ${duration}ms`
        );

        throw error;
      }
    };

    return descriptor;
  };
}

/**
 * Redact sensitive information from logs
 */
export function redactSensitiveData(data: Record<string, any>): Record<string, any> {
  const sensitiveKeys = [
    'password',
    'token',
    'apiKey',
    'secret',
    'authorization',
    'cookie',
    'creditCard',
    'ssn',
  ];

  const redacted = { ...data };

  for (const key of Object.keys(redacted)) {
    if (sensitiveKeys.some((sensitive) => key.toLowerCase().includes(sensitive))) {
      redacted[key] = '[REDACTED]';
    } else if (typeof redacted[key] === 'object' && redacted[key] !== null) {
      redacted[key] = redactSensitiveData(redacted[key]);
    }
  }

  return redacted;
}

/**
 * Common log contexts
 */
export const LogContexts = {
  /**
   * Create user context
   */
  user: (userId: string, email?: string): LogContext => ({
    userId,
    userEmail: email,
  }),

  /**
   * Create lead context
   */
  lead: (leadId: string, score?: number): LogContext => ({
    leadId,
    leadScore: score,
  }),

  /**
   * Create request context
   */
  request: (requestId: string, method: string, path: string): LogContext => ({
    requestId,
    httpMethod: method,
    httpPath: path,
  }),

  /**
   * Create error context
   */
  error: (error: Error, additionalContext?: Record<string, any>): LogContext => ({
    errorName: error.name,
    errorMessage: error.message,
    errorStack: error.stack,
    ...additionalContext,
  }),
};

/**
 * Export pino types for external use
 */
export type { Logger } from 'pino';
