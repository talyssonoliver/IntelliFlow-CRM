/**
 * Zep Memory Adapter - Cloud Integration
 *
 * Adapter for Zep Cloud SDK for session/memory management.
 * Implements episode budget management for free tier (1000 episodes).
 *
 * Task: IFC-086 - Model Versioning with Zep
 */

import { ZEP_CONFIG } from '@intelliflow/domain';

// =============================================================================
// Types
// =============================================================================

/**
 * Prisma client interface for episode tracking
 * This allows us to inject a mock in tests
 */
export interface ZepPrismaClient {
  zepEpisodeUsage: {
    upsert: (args: {
      where: { tenantId: string };
      create: {
        tenantId: string;
        episodesUsed: number;
        maxEpisodes: number;
        warningPercent: number;
        hardLimitPercent: number;
      };
      update: Record<string, unknown>;
    }) => Promise<{
      id: string;
      tenantId: string;
      episodesUsed: number;
      maxEpisodes: number;
      warningPercent: number;
      hardLimitPercent: number;
      lastUpdated: Date;
      createdAt: Date;
      lastSyncedAt: Date | null;
      lastSyncSuccess: boolean;
    }>;
    update: (args: {
      where: { tenantId: string };
      data: Partial<{
        episodesUsed: number;
        lastSyncedAt: Date;
        lastSyncSuccess: boolean;
      }>;
    }) => Promise<Record<string, unknown>>;
    findUnique: (args: {
      where: { tenantId: string };
    }) => Promise<{
      id: string;
      tenantId: string;
      episodesUsed: number;
      maxEpisodes: number;
      warningPercent: number;
      hardLimitPercent: number;
      lastUpdated: Date;
      createdAt: Date;
      lastSyncedAt: Date | null;
      lastSyncSuccess: boolean;
    } | null>;
  };
  zepEpisodeAudit: {
    create: (args: {
      data: {
        tenantId: string;
        previousCount: number;
        newCount: number;
        delta: number;
        operation: string;
        sessionId?: string;
      };
    }) => Promise<Record<string, unknown>>;
    findMany: (args: {
      where: { tenantId: string };
      orderBy: { createdAt: 'desc' };
      take?: number;
    }) => Promise<Array<Record<string, unknown>>>;
  };
  $transaction: <T>(operations: Promise<T>[]) => Promise<T[]>;
}

export interface ZepConfig {
  apiKey: string;
  projectId?: string;
  maxEpisodes?: number;
  warningThresholdPercent?: number;
  hardLimitPercent?: number;
  prisma?: ZepPrismaClient;
  tenantId?: string;
}

export interface SessionMetadata {
  userId?: string;
  chainType?: string;
  versionId?: string;
  tenantId: string;
  [key: string]: unknown;
}

export interface ZepMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  roleType?: 'user' | 'assistant';
  metadata?: Record<string, unknown>;
}

export interface ZepMemory {
  messages: ZepMessage[];
  summary?: string;
  facts?: string[];
  context?: string;
}

export interface ZepSession {
  sessionId: string;
  metadata: SessionMetadata;
  createdAt: Date;
  updatedAt: Date;
}

export interface EpisodeBudget {
  used: number;
  remaining: number;
  warningThreshold: number;
  limitThreshold: number;
  isWarning: boolean;
  isLimited: boolean;
  isPersisted?: boolean;
  lastSyncedAt?: Date | null;
}

// =============================================================================
// Zep Memory Adapter
// =============================================================================

export class ZepMemoryAdapter {
  private apiKey: string;
  private projectId?: string;
  private episodeCount = 0;
  private maxEpisodes: number;
  private warningThresholdPercent: number;
  private hardLimitPercent: number;
  private isInitializedFlag = false;

  // In-memory fallback when approaching limit
  private inMemoryFallback: Map<string, ZepMemory> = new Map();
  private useFallback = false;

  // Prisma persistence
  private prisma?: ZepPrismaClient;
  private tenantId: string;
  private isPersisted = false;
  private lastSyncedAt: Date | null = null;

  constructor(config: ZepConfig) {
    this.apiKey = config.apiKey;
    this.projectId = config.projectId;
    this.maxEpisodes = config.maxEpisodes ?? ZEP_CONFIG.MAX_FREE_EPISODES;
    this.warningThresholdPercent = config.warningThresholdPercent ?? ZEP_CONFIG.WARNING_THRESHOLD_PERCENT;
    this.hardLimitPercent = config.hardLimitPercent ?? ZEP_CONFIG.HARD_LIMIT_PERCENT;
    this.prisma = config.prisma as ZepPrismaClient | undefined;
    this.tenantId = config.tenantId ?? 'global';
  }

  /**
   * Initialize the Zep client
   */
  async initialize(): Promise<void> {
    if (this.isInitializedFlag) return;

    // First, try to load from database if Prisma is available
    if (this.prisma) {
      try {
        const record = await this.prisma.zepEpisodeUsage.upsert({
          where: { tenantId: this.tenantId },
          create: {
            tenantId: this.tenantId,
            episodesUsed: 0,
            maxEpisodes: this.maxEpisodes,
            warningPercent: this.warningThresholdPercent,
            hardLimitPercent: this.hardLimitPercent,
          },
          update: {},
        });

        this.episodeCount = record.episodesUsed;
        this.isPersisted = true;
        this.lastSyncedAt = record.lastSyncedAt;
      } catch (error) {
        console.warn('[ZepMemoryAdapter] Failed to load from database:', error);
      }
    }

    // Validate API key
    if (!this.apiKey) {
      console.warn('[ZepMemoryAdapter] No API key provided, using in-memory fallback');
      this.useFallback = true;
      this.isInitializedFlag = true;
      return;
    }

    try {
      // Check connection by fetching episode count from Cloud API
      const cloudCount = await this.fetchEpisodeCountFromCloud();

      // If Cloud count is higher, sync to database
      if (cloudCount > this.episodeCount && this.prisma) {
        await this.syncToDatabase(cloudCount, 'SYNC_FROM_API');
      }

      this.isInitializedFlag = true;
      console.log(`[ZepMemoryAdapter] Initialized. Episodes used: ${this.episodeCount}/${this.maxEpisodes}`);
    } catch (error) {
      console.error('[ZepMemoryAdapter] Failed to sync with Cloud API:', error);

      // Mark sync as failed in database
      if (this.prisma) {
        try {
          await this.prisma.zepEpisodeUsage.update({
            where: { tenantId: this.tenantId },
            data: { lastSyncSuccess: false },
          });
        } catch {
          // Ignore database errors during error handling
        }
      }

      // Still mark as initialized - we can work with local data
      this.isInitializedFlag = true;
      console.log(`[ZepMemoryAdapter] Initialized. Episodes used: ${this.episodeCount}/${this.maxEpisodes}`);
    }
  }

  /**
   * Create or get a session
   */
  async createSession(
    sessionId: string,
    metadata: SessionMetadata
  ): Promise<ZepSession> {
    await this.ensureInitialized();

    if (this.useFallback) {
      return this.createFallbackSession(sessionId, metadata);
    }

    // Check budget before creating session
    if (this.shouldUseFallback()) {
      console.warn('[ZepMemoryAdapter] Approaching episode limit, using in-memory fallback');
      return this.createFallbackSession(sessionId, metadata);
    }

    try {
      const response = await this.makeRequest('/sessions', 'POST', {
        session_id: sessionId,
        metadata,
      });

      const previousCount = this.episodeCount;
      this.episodeCount++;

      // Persist and audit
      await this.incrementEpisodeCount(previousCount, 'CREATE_SESSION', sessionId);

      return {
        sessionId: response.session_id as string,
        metadata: response.metadata as SessionMetadata,
        createdAt: new Date(response.created_at as string),
        updatedAt: new Date(response.updated_at as string),
      };
    } catch (error) {
      console.error('[ZepMemoryAdapter] Failed to create session:', error);
      return this.createFallbackSession(sessionId, metadata);
    }
  }

  /**
   * Add messages to a session
   */
  async addMemory(sessionId: string, messages: ZepMessage[]): Promise<void> {
    await this.ensureInitialized();

    if (this.useFallback || this.shouldUseFallback()) {
      this.addFallbackMemory(sessionId, messages);
      return;
    }

    try {
      await this.makeRequest(`/sessions/${sessionId}/memory`, 'POST', {
        messages: messages.map((m) => ({
          role: m.role,
          role_type: m.roleType ?? m.role,
          content: m.content,
          metadata: m.metadata,
        })),
      });

      // Increment episode count for each message batch
      const previousCount = this.episodeCount;
      this.episodeCount++;

      // Persist and audit
      await this.incrementEpisodeCount(previousCount, 'ADD_MEMORY', sessionId);
    } catch (error) {
      console.error('[ZepMemoryAdapter] Failed to add memory:', error);
      this.addFallbackMemory(sessionId, messages);
    }
  }

  /**
   * Get memory for a session
   */
  async getMemory(sessionId: string, lastN?: number): Promise<ZepMemory> {
    await this.ensureInitialized();

    if (this.useFallback) {
      return this.getFallbackMemory(sessionId);
    }

    try {
      const limit = lastN ?? ZEP_CONFIG.DEFAULT_MEMORY_LIMIT;
      const response = await this.makeRequest(
        `/sessions/${sessionId}/memory?lastn=${limit}`,
        'GET'
      );

      const messages = Array.isArray(response.messages) ? response.messages : [];
      return {
        messages: messages.map((m: Record<string, unknown>) => ({
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content as string,
          roleType: m.role_type as 'user' | 'assistant' | undefined,
          metadata: m.metadata as Record<string, unknown> | undefined,
        })),
        summary: response.summary as string | undefined,
        facts: response.facts as string[] | undefined,
        context: response.context as string | undefined,
      };
    } catch (error) {
      console.error('[ZepMemoryAdapter] Failed to get memory:', error);
      return this.getFallbackMemory(sessionId);
    }
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<void> {
    if (this.useFallback) {
      this.inMemoryFallback.delete(sessionId);
      return;
    }

    try {
      await this.makeRequest(`/sessions/${sessionId}`, 'DELETE');
    } catch (error) {
      console.error('[ZepMemoryAdapter] Failed to delete session:', error);
      this.inMemoryFallback.delete(sessionId);
    }
  }

  /**
   * Get episode budget status
   */
  async getEpisodeBudget(): Promise<EpisodeBudget> {
    await this.ensureInitialized();

    const warningThreshold = Math.floor(
      (this.maxEpisodes * this.warningThresholdPercent) / 100
    );
    const limitThreshold = Math.floor(
      (this.maxEpisodes * this.hardLimitPercent) / 100
    );

    return {
      used: this.episodeCount,
      remaining: this.maxEpisodes - this.episodeCount,
      warningThreshold,
      limitThreshold,
      isWarning: this.episodeCount >= warningThreshold,
      isLimited: this.episodeCount >= limitThreshold,
      isPersisted: this.isPersisted,
      lastSyncedAt: this.lastSyncedAt,
    };
  }

  /**
   * Search memory across sessions
   */
  async searchMemory(
    query: string,
    options?: {
      sessionId?: string;
      limit?: number;
      minScore?: number;
    }
  ): Promise<ZepMessage[]> {
    if (this.useFallback) {
      // Simple keyword search for fallback
      return this.searchFallbackMemory(query, options);
    }

    try {
      const params = new URLSearchParams({
        text: query,
        limit: String(options?.limit ?? 10),
        min_score: String(options?.minScore ?? 0.5),
      });

      if (options?.sessionId) {
        params.append('session_id', options.sessionId);
      }

      const response = await this.makeRequest(`/memory/search?${params}`, 'GET');
      const results = Array.isArray(response.results) ? response.results : [];

      return results.map((r: Record<string, unknown>) => ({
        role: r.role as 'user' | 'assistant' | 'system',
        content: r.content as string,
        metadata: r.metadata as Record<string, unknown> | undefined,
      }));
    } catch (error) {
      console.error('[ZepMemoryAdapter] Failed to search memory:', error);
      return this.searchFallbackMemory(query, options);
    }
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  private async ensureInitialized(): Promise<void> {
    if (!this.isInitializedFlag) {
      await this.initialize();
    }
  }

  private shouldUseFallback(): boolean {
    const limitThreshold = Math.floor(
      (this.maxEpisodes * this.hardLimitPercent) / 100
    );
    return this.episodeCount >= limitThreshold;
  }

  /**
   * Fetch episode count from Zep Cloud API
   * Note: Does NOT update this.episodeCount - caller should handle sync logic
   * Throws on network/API errors - caller must handle exceptions
   */
  private async fetchEpisodeCountFromCloud(): Promise<number> {
    const response = await this.makeRequest('/account/usage', 'GET');
    const count = (response.episodes_used as number) ?? 0;
    return count;
  }

  /**
   * Sync episode count to database
   */
  private async syncToDatabase(
    newCount: number,
    operation: string,
    sessionId?: string
  ): Promise<void> {
    if (!this.prisma) return;

    try {
      const previousCount = this.episodeCount;

      await this.prisma.zepEpisodeUsage.update({
        where: { tenantId: this.tenantId },
        data: {
          episodesUsed: newCount,
          lastSyncedAt: new Date(),
          lastSyncSuccess: true,
        },
      });

      await this.prisma.zepEpisodeAudit.create({
        data: {
          tenantId: this.tenantId,
          previousCount,
          newCount,
          delta: newCount - previousCount,
          operation,
          sessionId,
        },
      });

      this.episodeCount = newCount;
      this.lastSyncedAt = new Date();
    } catch (error) {
      console.error('[ZepMemoryAdapter] Failed to sync to database:', error);
    }
  }

  /**
   * Increment episode count and persist
   */
  private async incrementEpisodeCount(
    previousCount: number,
    operation: string,
    sessionId?: string
  ): Promise<void> {
    if (!this.prisma) return;

    try {
      await this.prisma.zepEpisodeUsage.update({
        where: { tenantId: this.tenantId },
        data: { episodesUsed: this.episodeCount },
      });

      await this.prisma.zepEpisodeAudit.create({
        data: {
          tenantId: this.tenantId,
          previousCount,
          newCount: this.episodeCount,
          delta: 1,
          operation,
          sessionId,
        },
      });
    } catch (error) {
      console.error('[ZepMemoryAdapter] Failed to increment episode count:', error);
    }
  }

  private async makeRequest(
    endpoint: string,
    method: 'GET' | 'POST' | 'DELETE',
    body?: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const baseUrl = 'https://api.getzep.com/api/v2';
    const url = `${baseUrl}${endpoint}`;

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };

    if (this.projectId) {
      headers['X-Project-Id'] = this.projectId;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Zep API error: ${response.status} - ${error}`);
    }

    if (method === 'DELETE') {
      return {};
    }

    return response.json() as Promise<Record<string, unknown>>;
  }

  // =============================================================================
  // Fallback Methods (in-memory)
  // =============================================================================

  private createFallbackSession(
    sessionId: string,
    metadata: SessionMetadata
  ): ZepSession {
    if (!this.inMemoryFallback.has(sessionId)) {
      this.inMemoryFallback.set(sessionId, { messages: [] });
    }

    return {
      sessionId,
      metadata,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  private addFallbackMemory(sessionId: string, messages: ZepMessage[]): void {
    const memory = this.inMemoryFallback.get(sessionId) ?? { messages: [] };
    memory.messages.push(...messages);

    // Keep only last N messages
    if (memory.messages.length > ZEP_CONFIG.DEFAULT_MEMORY_LIMIT) {
      memory.messages = memory.messages.slice(-ZEP_CONFIG.DEFAULT_MEMORY_LIMIT);
    }

    this.inMemoryFallback.set(sessionId, memory);
  }

  private getFallbackMemory(sessionId: string): ZepMemory {
    return this.inMemoryFallback.get(sessionId) ?? { messages: [] };
  }

  private searchFallbackMemory(
    query: string,
    options?: { sessionId?: string; limit?: number }
  ): ZepMessage[] {
    const queryLower = query.toLowerCase();
    const results: ZepMessage[] = [];
    const limit = options?.limit ?? 10;

    const sessionsToSearch = options?.sessionId
      ? [options.sessionId]
      : Array.from(this.inMemoryFallback.keys());

    for (const sessionId of sessionsToSearch) {
      const memory = this.inMemoryFallback.get(sessionId);
      if (!memory) continue;

      for (const message of memory.messages) {
        if (message.content.toLowerCase().includes(queryLower)) {
          results.push(message);
          if (results.length >= limit) break;
        }
      }

      if (results.length >= limit) break;
    }

    return results;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a Zep memory adapter from environment variables
 */
export function createZepAdapter(config?: Partial<ZepConfig>): ZepMemoryAdapter {
  return new ZepMemoryAdapter({
    apiKey: config?.apiKey ?? process.env.ZEP_API_KEY ?? '',
    projectId: config?.projectId ?? process.env.ZEP_PROJECT_ID,
    maxEpisodes: config?.maxEpisodes ?? ZEP_CONFIG.MAX_FREE_EPISODES,
  });
}
