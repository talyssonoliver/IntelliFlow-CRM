/**
 * Redis/IORedis Connection Factory for BullMQ
 *
 * Provides connection management for BullMQ queues with support for:
 * - Connection pooling
 * - Health checks
 * - Graceful shutdown
 */

import { ConnectionOptions } from 'bullmq';
import { requiredProdEnv } from '@intelliflow/validators/required-url';

// ============================================================================
// Connection Configuration
// ============================================================================

/**
 * Redis connection configuration interface
 */
export interface RedisConnectionConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  tls?: boolean;
  maxRetriesPerRequest?: number | null;
  enableReadyCheck?: boolean;
  lazyConnect?: boolean;
}

/**
 * Default Redis connection configuration
 * Uses environment variables with sensible defaults
 */
export function getDefaultConnectionConfig(): RedisConnectionConfig {
  return {
    host: requiredProdEnv('REDIS_HOST', process.env.REDIS_HOST, 'localhost'),
    port: Number.parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: Number.parseInt(process.env.REDIS_DB || '0', 10),
    tls: process.env.REDIS_TLS === 'true',
    maxRetriesPerRequest: null, // BullMQ requires null for blocking commands
    enableReadyCheck: true,
    lazyConnect: false,
  };
}

/**
 * Get BullMQ-compatible connection options
 */
export function getBullMQConnectionOptions(
  config?: Partial<RedisConnectionConfig>
): ConnectionOptions {
  const defaultConfig = getDefaultConnectionConfig();
  const mergedConfig = { ...defaultConfig, ...config };

  return {
    host: mergedConfig.host,
    port: mergedConfig.port,
    password: mergedConfig.password,
    db: mergedConfig.db,
    maxRetriesPerRequest: null, // Required by BullMQ for blocking commands
    enableReadyCheck: mergedConfig.enableReadyCheck,
    lazyConnect: mergedConfig.lazyConnect,
    ...(mergedConfig.tls ? { tls: {} } : {}),
  };
}

// ============================================================================
// Connection Health Check
// ============================================================================

/**
 * Health check result
 */
export interface ConnectionHealthResult {
  connected: boolean;
  latencyMs: number;
  redisVersion?: string;
  error?: string;
}

/**
 * Perform a health check on Redis connection
 * Note: This is a utility function - actual implementation depends on IORedis instance
 */
export async function checkConnectionHealth(
  pingFn: () => Promise<string>,
  infoFn: () => Promise<string>
): Promise<ConnectionHealthResult> {
  const start = Date.now();

  try {
    const pingResult = await pingFn();
    const latencyMs = Date.now() - start;

    if (pingResult !== 'PONG') {
      return {
        connected: false,
        latencyMs,
        error: `Unexpected ping response: ${pingResult}`,
      };
    }

    // Try to get Redis version from INFO
    let redisVersion: string | undefined;
    try {
      const info = await infoFn();
      const versionMatch = /redis_version:([^\r\n]+)/.exec(info);
      if (versionMatch) {
        redisVersion = versionMatch[1];
      }
    } catch {
      // Info command might not be available in all Redis configurations
    }

    return {
      connected: true,
      latencyMs,
      redisVersion,
    };
  } catch (error) {
    return {
      connected: false,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown connection error',
    };
  }
}

// ============================================================================
// Connection Pool Management
// ============================================================================

/**
 * Simple connection registry for managing multiple Redis connections
 */
class ConnectionRegistry {
  private readonly connections: Map<string, { config: RedisConnectionConfig; createdAt: Date }> =
    new Map();

  /**
   * Register a connection configuration
   */
  register(name: string, config: RedisConnectionConfig): void {
    this.connections.set(name, {
      config,
      createdAt: new Date(),
    });
  }

  /**
   * Get a registered connection configuration
   */
  get(name: string): RedisConnectionConfig | undefined {
    return this.connections.get(name)?.config;
  }

  /**
   * Check if a connection is registered
   */
  has(name: string): boolean {
    return this.connections.has(name);
  }

  /**
   * Remove a connection from registry
   */
  unregister(name: string): boolean {
    return this.connections.delete(name);
  }

  /**
   * Get all registered connection names
   */
  getRegisteredNames(): string[] {
    return Array.from(this.connections.keys());
  }

  /**
   * Clear all registered connections
   */
  clear(): void {
    this.connections.clear();
  }
}

// Singleton instance
export const connectionRegistry = new ConnectionRegistry();

// ============================================================================
// Idle blocking time
// ============================================================================

/**
 * How long (seconds) an idle BullMQ worker blocks on BZPOPMIN before it wakes
 * and checks again. BullMQ's default is 5 s: with ~14 workers that is ~1,600
 * Redis commands a minute while no job exists. Adding a job writes the queue's
 * marker key, which wakes the blocked worker at once, so a longer block adds
 * no pickup latency (delayed jobs keep their own timer, capped at 10 s by
 * BullMQ). The cost: a silently dropped connection is noticed after
 * drainDelay + 1 s instead of ~6 s.
 */
export const DEFAULT_DRAIN_DELAY_SECONDS = 30;

/** drainDelay for every Worker: `QUEUE_DRAIN_DELAY_SECONDS`, default 30. */
export function getDrainDelaySeconds(): number {
  const fromEnv = Number(process.env.QUEUE_DRAIN_DELAY_SECONDS);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_DRAIN_DELAY_SECONDS;
}

// ============================================================================
// Exports
// ============================================================================

export type { ConnectionOptions } from 'bullmq';
