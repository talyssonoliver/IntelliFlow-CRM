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

export interface ZepConfig {
  apiKey: string;
  projectId?: string;
  maxEpisodes?: number;
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
}

// =============================================================================
// Zep Memory Adapter
// =============================================================================

export class ZepMemoryAdapter {
  private apiKey: string;
  private projectId?: string;
  private episodeCount = 0;
  private maxEpisodes: number;
  private isInitialized = false;

  // In-memory fallback when approaching limit
  private inMemoryFallback: Map<string, ZepMemory> = new Map();
  private useFallback = false;

  constructor(config: ZepConfig) {
    this.apiKey = config.apiKey;
    this.projectId = config.projectId;
    this.maxEpisodes = config.maxEpisodes ?? ZEP_CONFIG.MAX_FREE_EPISODES;
  }

  /**
   * Initialize the Zep client
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Validate API key
    if (!this.apiKey) {
      console.warn('[ZepMemoryAdapter] No API key provided, using in-memory fallback');
      this.useFallback = true;
      this.isInitialized = true;
      return;
    }

    try {
      // Check connection by fetching episode count
      await this.fetchEpisodeCount();
      this.isInitialized = true;
      console.log(`[ZepMemoryAdapter] Initialized. Episodes used: ${this.episodeCount}/${this.maxEpisodes}`);
    } catch (error) {
      console.error('[ZepMemoryAdapter] Failed to initialize, using in-memory fallback:', error);
      this.useFallback = true;
      this.isInitialized = true;
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

      this.episodeCount++;
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
      this.episodeCount++;
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
      (this.maxEpisodes * ZEP_CONFIG.WARNING_THRESHOLD_PERCENT) / 100
    );
    const limitThreshold = Math.floor(
      (this.maxEpisodes * ZEP_CONFIG.HARD_LIMIT_PERCENT) / 100
    );

    return {
      used: this.episodeCount,
      remaining: this.maxEpisodes - this.episodeCount,
      warningThreshold,
      limitThreshold,
      isWarning: this.episodeCount >= warningThreshold,
      isLimited: this.episodeCount >= limitThreshold,
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
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  private shouldUseFallback(): boolean {
    const limitThreshold = Math.floor(
      (this.maxEpisodes * ZEP_CONFIG.HARD_LIMIT_PERCENT) / 100
    );
    return this.episodeCount >= limitThreshold;
  }

  private async fetchEpisodeCount(): Promise<void> {
    try {
      const response = await this.makeRequest('/account/usage', 'GET');
      this.episodeCount = (response.episodes_used as number) ?? 0;
    } catch {
      // Default to 0 if we can't fetch
      this.episodeCount = 0;
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
