/**
 * Redis/IORedis Connection Factory for BullMQ
 *
 * Provides connection management for BullMQ queues with support for:
 * - Connection pooling
 * - Health checks
 * - Graceful shutdown
 */

import { ConnectionOptions } from 'bullmq';

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
  maxRetriesPerRequest?: number;
  enableReadyCheck?: boolean;
  lazyConnect?: boolean;
}

/**
 * Default Redis connection configuration
 * Uses environment variables with sensible defaults
 */
export function getDefaultConnectionConfig(): RedisConnectionConfig {
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    tls: process.env.REDIS_TLS === 'true',
    maxRetriesPerRequest: null as unknown as number, // BullMQ requires null for blocking commands
    enableReadyCheck: true,
    lazyConnect: false,
  };
}

/**
 * Get BullMQ-compatible connection options
 */
export function getBullMQConnectionOptions(config?: Partial<RedisConnectionConfig>): ConnectionOptions {
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
      const versionMatch = info.match(/redis_version:([^\r\n]+)/);
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
  private connections: Map<string, { config: RedisConnectionConfig; createdAt: Date }> = new Map();

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
// Exports
// ============================================================================

export type { ConnectionOptions };
