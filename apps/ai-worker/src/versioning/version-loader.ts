/**
 * Version Loader - Chain Version Configuration Loader
 *
 * Loads versioned chain configurations for AI chains and agents.
 * Integrates with ChainVersionService for dynamic version selection.
 *
 * Task: IFC-086 - Model Versioning with Zep
 */

import type { ChainType, ChainVersionStatus } from '@intelliflow/domain';
import type { ChainConfig, VersionContext } from '@intelliflow/validators';

// =============================================================================
// Types
// =============================================================================

export interface ExecutionContext {
  userId?: string;
  sessionId?: string;
  leadId?: string;
  tenantId: string;
  experimentId?: string;
}

export interface LoadedVersion {
  versionId: string;
  config: ChainConfig;
  chainType: ChainType;
  status: ChainVersionStatus;
  selectedBy: 'direct' | 'rollout' | 'experiment';
  loadedAt: Date;
}

export interface VersionCache {
  version: LoadedVersion;
  expiresAt: Date;
}

export interface VersionLoaderConfig {
  cacheTtlMs: number;
  enableCache: boolean;
  fallbackConfig?: Record<ChainType, ChainConfig>;
}

// =============================================================================
// Default Configurations (Fallback)
// =============================================================================

const DEFAULT_CONFIGS: Record<ChainType, ChainConfig> = {
  SCORING: {
    prompt: `You are an expert B2B lead scoring assistant. Your task is to analyze lead information and provide a comprehensive score based on multiple factors.

## Scoring Framework

Analyze leads using the following weighted factors:

### 1. Contact Information Completeness (0-25 points)
- Full name provided: +5 points
- Corporate email domain: +10 points (vs personal email: +2 points)
- Phone number available: +5 points
- Job title provided: +5 points

### 2. Engagement Indicators (0-25 points)
- Source quality (Referral: +10, Event: +8, Website: +5, Cold: +2)
- Recent activities count: +3 points per significant activity (max 15)

### 3. Qualification Signals (0-25 points)
- Decision-maker title (VP, Director, C-level): +15 points
- Manager title: +10 points
- Individual contributor: +5 points
- Company size indicators: +10 points if enterprise

### 4. Data Quality (0-25 points)
- Email validation passed: +10 points
- Consistent information: +10 points
- No red flags: +5 points

Be objective and data-driven in your analysis.`,
    model: 'gpt-4-turbo-preview',
    temperature: 0.7,
    maxTokens: 2000,
  },
  QUALIFICATION: {
    prompt: `You are a seasoned sales qualification expert with 15+ years of experience in B2B sales.
You excel at analyzing lead data, identifying buying signals, and determining sales readiness.
You understand BANT (Budget, Authority, Need, Timeline) criteria and modern sales frameworks.
Your recommendations are data-driven, actionable, and focused on conversion optimization.

## BANT Framework

### Budget
- Does the prospect have budget allocated?
- Can they afford the solution?
- Is there budget authority?

### Authority
- Is this person a decision-maker?
- Who else is involved in the decision?
- What is their role in the buying process?

### Need
- Is there a clear business need?
- How urgent is the problem?
- What are the pain points?

### Timeline
- When do they need a solution?
- Are there any deadlines?
- What is driving the timeline?

Always provide structured, actionable recommendations.`,
    model: 'gpt-4-turbo-preview',
    temperature: 0.7,
    maxTokens: 2000,
  },
  EMAIL_WRITER: {
    prompt: `You are a professional B2B email writer specializing in sales outreach.
Your emails are concise, personalized, and action-oriented.
You understand various email purposes (introduction, follow-up, meeting request, proposal).
Your writing is professional yet approachable, avoiding jargon and filler words.

Guidelines:
- Keep subject lines under 50 characters
- Lead with value, not features
- Include a clear call-to-action
- Personalize based on recipient context
- Maintain professional tone throughout`,
    model: 'gpt-4-turbo-preview',
    temperature: 0.8,
    maxTokens: 1500,
  },
  FOLLOWUP: {
    prompt: `You are a sales follow-up strategist with expertise in lead nurturing.
You determine optimal timing, channel, and messaging for follow-up activities.
You consider lead engagement history, urgency signals, and conversion probability.
Your recommendations balance persistence with respect for the prospect's time.

Key considerations:
- Previous interactions and responses
- Engagement signals (email opens, clicks, website visits)
- Business context and timing
- Relationship stage and trust level
- Optimal outreach frequency`,
    model: 'gpt-4-turbo-preview',
    temperature: 0.7,
    maxTokens: 2000,
  },
};

// =============================================================================
// Version Loader
// =============================================================================

/**
 * Version Loader
 *
 * Loads and caches chain version configurations.
 * Falls back to default configs when no versioned config is available.
 */
export class VersionLoader {
  private cache: Map<string, VersionCache> = new Map();
  private config: VersionLoaderConfig;

  // ChainVersionService is injected but optional for fallback scenarios
  private versionService: {
    getActiveVersion: (
      chainType: ChainType,
      context: VersionContext
    ) => Promise<{
      version: {
        id: string;
        chainType: ChainType;
        status: ChainVersionStatus;
        prompt: string;
        model: string;
        temperature: number;
        maxTokens: number;
        additionalParams: Record<string, unknown> | null;
      };
      selectedBy: 'direct' | 'rollout' | 'experiment';
    }>;
  } | null = null;

  constructor(
    versionService?: VersionLoader['versionService'],
    config?: Partial<VersionLoaderConfig>
  ) {
    this.versionService = versionService ?? null;
    this.config = {
      cacheTtlMs: config?.cacheTtlMs ?? 5 * 60 * 1000, // 5 minutes default
      enableCache: config?.enableCache ?? true,
      fallbackConfig: config?.fallbackConfig ?? DEFAULT_CONFIGS,
    };
  }

  /**
   * Load versioned chain configuration
   */
  async loadVersionedChain(
    chainType: ChainType,
    context: ExecutionContext
  ): Promise<LoadedVersion> {
    // Check cache first
    const cacheKey = this.getCacheKey(chainType, context);
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    // Try to load from version service
    if (this.versionService) {
      try {
        const result = await this.versionService.getActiveVersion(chainType, {
          userId: context.userId,
          sessionId: context.sessionId,
          leadId: context.leadId,
          tenantId: context.tenantId,
          experimentId: context.experimentId,
        });

        const loadedVersion: LoadedVersion = {
          versionId: result.version.id,
          config: {
            prompt: result.version.prompt,
            model: result.version.model,
            temperature: result.version.temperature,
            maxTokens: result.version.maxTokens,
            additionalParams: result.version.additionalParams ?? undefined,
          },
          chainType: result.version.chainType,
          status: result.version.status,
          selectedBy: result.selectedBy,
          loadedAt: new Date(),
        };

        // Cache the result
        this.setCache(cacheKey, loadedVersion);

        return loadedVersion;
      } catch (error) {
        console.warn(
          `[VersionLoader] Failed to load version for ${chainType}, using fallback:`,
          error
        );
      }
    }

    // Fallback to default config
    return this.loadFallbackVersion(chainType);
  }

  /**
   * Load fallback version (default config)
   */
  private loadFallbackVersion(chainType: ChainType): LoadedVersion {
    const fallbackConfig = this.config.fallbackConfig?.[chainType] ?? DEFAULT_CONFIGS[chainType];

    return {
      versionId: `fallback-${chainType.toLowerCase()}`,
      config: fallbackConfig,
      chainType,
      status: 'ACTIVE',
      selectedBy: 'direct',
      loadedAt: new Date(),
    };
  }

  /**
   * Get chain config only (without version metadata)
   */
  async getChainConfig(
    chainType: ChainType,
    context: ExecutionContext
  ): Promise<ChainConfig> {
    const loaded = await this.loadVersionedChain(chainType, context);
    return loaded.config;
  }

  /**
   * Preload versions for multiple chain types
   */
  async preloadVersions(
    chainTypes: ChainType[],
    context: ExecutionContext
  ): Promise<Map<ChainType, LoadedVersion>> {
    const results = new Map<ChainType, LoadedVersion>();

    await Promise.all(
      chainTypes.map(async (chainType) => {
        const loaded = await this.loadVersionedChain(chainType, context);
        results.set(chainType, loaded);
      })
    );

    return results;
  }

  /**
   * Invalidate cache for a specific chain type
   */
  invalidateCache(chainType?: ChainType): void {
    if (chainType) {
      // Invalidate specific chain type
      const keysToDelete: string[] = [];
      this.cache.forEach((_, key) => {
        if (key.startsWith(`${chainType}:`)) {
          keysToDelete.push(key);
        }
      });
      keysToDelete.forEach((key) => this.cache.delete(key));
    } else {
      // Clear all cache
      this.cache.clear();
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; hitRate: number } {
    return {
      size: this.cache.size,
      hitRate: 0, // Would need to track hits/misses for this
    };
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  private getCacheKey(chainType: ChainType, context: ExecutionContext): string {
    // Use tenant + chain type as primary key
    // Could add user/session for more granular caching
    return `${chainType}:${context.tenantId}`;
  }

  private getFromCache(key: string): LoadedVersion | null {
    if (!this.config.enableCache) {
      return null;
    }

    const cached = this.cache.get(key);
    if (!cached) {
      return null;
    }

    // Check if expired
    if (new Date() > cached.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return cached.version;
  }

  private setCache(key: string, version: LoadedVersion): void {
    if (!this.config.enableCache) {
      return;
    }

    this.cache.set(key, {
      version,
      expiresAt: new Date(Date.now() + this.config.cacheTtlMs),
    });
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a version loader instance
 */
export function createVersionLoader(
  versionService?: VersionLoader['versionService'],
  config?: Partial<VersionLoaderConfig>
): VersionLoader {
  return new VersionLoader(versionService, config);
}

/**
 * Create a standalone version loader (no service, fallback only)
 */
export function createStandaloneVersionLoader(
  customConfigs?: Partial<Record<ChainType, ChainConfig>>
): VersionLoader {
  return new VersionLoader(null, {
    fallbackConfig: { ...DEFAULT_CONFIGS, ...customConfigs } as Record<ChainType, ChainConfig>,
  });
}
