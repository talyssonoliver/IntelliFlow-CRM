/**
 * Chain Version Manifest Generator
 *
 * Generates timestamped prompt-versions manifest files with pass/fail status.
 * Follows the attestation pattern: timestamped file + -latest.json pointer.
 *
 * Task: IFC-086 - Model Versioning with Zep
 *
 * Usage:
 *   npx tsx tools/scripts/generate-chain-version-manifest.ts
 */

import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { CHAIN_TYPES, CHAIN_VERSION_DEFAULTS } from '@intelliflow/domain';

// =============================================================================
// Types
// =============================================================================

interface ChainVersionSummary {
  id: string;
  status: 'DRAFT' | 'ACTIVE' | 'DEPRECATED' | 'ARCHIVED';
  description: string;
  prompt: string;
  model: string;
  temperature: number;
  maxTokens: number;
  rolloutStrategy: 'IMMEDIATE' | 'PERCENTAGE' | 'AB_TEST';
  rolloutPercent: number;
  createdAt: string;
  createdBy: string;
}

interface ChainConfig {
  description: string;
  activeVersion: string;
  defaultModel: string;
  defaultTemperature: number;
  defaultMaxTokens: number;
  versions: ChainVersionSummary[];
}

interface ManifestResult {
  generated_at: string;
  status: 'PASSED' | 'FAILED';
  generator: string;
  version: string;
  metadata: {
    taskId: string;
    sprint: number;
    section: string;
  };
  chains: Record<string, ChainConfig>;
  statistics: {
    totalChains: number;
    totalVersions: number;
    activeVersions: number;
    draftVersions: number;
    deprecatedVersions: number;
    archivedVersions: number;
  };
  zepIntegration: {
    enabled: boolean;
    episodeBudget: {
      maxFreeEpisodes: number;
      warningThresholdPercent: number;
      hardLimitPercent: number;
    };
  };
  error?: string;
}

// =============================================================================
// Default Configurations (Fallback when no DB available)
// =============================================================================

const DEFAULT_CHAIN_CONFIGS: Record<string, { description: string; prompt: string; temperature: number; maxTokens: number }> = {
  SCORING: {
    description: 'Lead scoring chain - Analyzes leads and assigns quality scores',
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
    temperature: 0.7,
    maxTokens: 2000,
  },
  QUALIFICATION: {
    description: 'Lead qualification agent - Determines sales readiness using BANT framework',
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
    temperature: 0.7,
    maxTokens: 2000,
  },
  EMAIL_WRITER: {
    description: 'Email writer agent - Generates personalized sales outreach emails',
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
    temperature: 0.8,
    maxTokens: 1500,
  },
  FOLLOWUP: {
    description: 'Follow-up agent - Determines optimal follow-up strategy and timing',
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
    temperature: 0.7,
    maxTokens: 2000,
  },
};

// =============================================================================
// Utility Functions
// =============================================================================

function generateFilename(timestamp: string): string {
  const safe = timestamp.replace(/[-:]/g, '').replace('T', '-').split('.')[0];
  return `prompt-versions-${safe}.json`;
}

async function getChainVersionsFromDatabase(): Promise<Record<string, ChainConfig> | null> {
  // Check if DATABASE_URL is configured
  if (!process.env.DATABASE_URL) {
    console.log('DATABASE_URL not set, using fallback configs');
    return null;
  }

  const prisma = new PrismaClient();

  try {
    // Query all chain versions grouped by chain type
    const versions = await prisma.chainVersion.findMany({
      orderBy: [{ chainType: 'asc' }, { createdAt: 'desc' }],
    });

    if (versions.length === 0) {
      console.log('No chain versions in database, using fallback configs');
      return null;
    }

    // Group versions by chain type
    const chains: Record<string, ChainConfig> = {};

    for (const chainType of CHAIN_TYPES) {
      const chainVersions = versions.filter((v) => v.chainType === chainType);
      if (chainVersions.length === 0) continue;

      const activeVersion = chainVersions.find((v) => v.status === 'ACTIVE');
      const defaultConfig = DEFAULT_CHAIN_CONFIGS[chainType];

      chains[chainType] = {
        description: defaultConfig?.description || `${chainType} chain`,
        activeVersion: activeVersion?.id || chainVersions[0].id,
        defaultModel: CHAIN_VERSION_DEFAULTS.DEFAULT_MODEL,
        defaultTemperature: defaultConfig?.temperature || CHAIN_VERSION_DEFAULTS.DEFAULT_TEMPERATURE,
        defaultMaxTokens: defaultConfig?.maxTokens || CHAIN_VERSION_DEFAULTS.DEFAULT_MAX_TOKENS,
        versions: chainVersions.map((v) => ({
          id: v.id,
          status: v.status as 'DRAFT' | 'ACTIVE' | 'DEPRECATED' | 'ARCHIVED',
          description: v.description || `${chainType} version`,
          prompt: v.prompt,
          model: v.model,
          temperature: v.temperature,
          maxTokens: v.maxTokens,
          rolloutStrategy: v.rolloutStrategy as 'IMMEDIATE' | 'PERCENTAGE' | 'AB_TEST',
          rolloutPercent: v.rolloutPercent || 100,
          createdAt: v.createdAt.toISOString(),
          createdBy: v.createdBy,
        })),
      };
    }

    console.log(`Loaded ${versions.length} chain versions from database`);
    return Object.keys(chains).length > 0 ? chains : null;
  } catch (error) {
    console.error('Failed to query database:', error instanceof Error ? error.message : error);
    return null;
  } finally {
    await prisma.$disconnect();
  }
}

function buildFallbackChainConfigs(): Record<string, ChainConfig> {
  const chains: Record<string, ChainConfig> = {};

  for (const chainType of CHAIN_TYPES) {
    const config = DEFAULT_CHAIN_CONFIGS[chainType];
    if (!config) continue;

    const versionId = `fallback-${chainType.toLowerCase()}`;

    chains[chainType] = {
      description: config.description,
      activeVersion: versionId,
      defaultModel: CHAIN_VERSION_DEFAULTS.DEFAULT_MODEL,
      defaultTemperature: config.temperature,
      defaultMaxTokens: config.maxTokens,
      versions: [
        {
          id: versionId,
          status: 'ACTIVE',
          description: `Default ${chainType.toLowerCase()} chain configuration`,
          prompt: config.prompt,
          model: CHAIN_VERSION_DEFAULTS.DEFAULT_MODEL,
          temperature: config.temperature,
          maxTokens: config.maxTokens,
          rolloutStrategy: 'IMMEDIATE',
          rolloutPercent: 100,
          createdAt: new Date().toISOString(),
          createdBy: 'system',
        },
      ],
    };
  }

  return chains;
}

function calculateStatistics(chains: Record<string, ChainConfig>) {
  let totalVersions = 0;
  let activeVersions = 0;
  let draftVersions = 0;
  let deprecatedVersions = 0;
  let archivedVersions = 0;

  for (const chain of Object.values(chains)) {
    for (const version of chain.versions) {
      totalVersions++;
      switch (version.status) {
        case 'ACTIVE':
          activeVersions++;
          break;
        case 'DRAFT':
          draftVersions++;
          break;
        case 'DEPRECATED':
          deprecatedVersions++;
          break;
        case 'ARCHIVED':
          archivedVersions++;
          break;
      }
    }
  }

  return {
    totalChains: Object.keys(chains).length,
    totalVersions,
    activeVersions,
    draftVersions,
    deprecatedVersions,
    archivedVersions,
  };
}

// =============================================================================
// Main Generator
// =============================================================================

async function generateManifest(): Promise<ManifestResult> {
  const timestamp = new Date().toISOString();

  try {
    // Try to get versions from database first
    let chains = await getChainVersionsFromDatabase();

    // Fall back to default configs if no DB available
    if (!chains) {
      chains = buildFallbackChainConfigs();
    }

    const statistics = calculateStatistics(chains);

    return {
      generated_at: timestamp,
      status: 'PASSED',
      generator: 'generate-chain-version-manifest.ts',
      version: '1.0.0',
      metadata: {
        taskId: 'IFC-086',
        sprint: 14,
        section: 'AI/ML',
      },
      chains,
      statistics,
      zepIntegration: {
        enabled: true,
        episodeBudget: {
          maxFreeEpisodes: 1000,
          warningThresholdPercent: 80,
          hardLimitPercent: 95,
        },
      },
    };
  } catch (error) {
    return {
      generated_at: timestamp,
      status: 'FAILED',
      generator: 'generate-chain-version-manifest.ts',
      version: '1.0.0',
      metadata: {
        taskId: 'IFC-086',
        sprint: 14,
        section: 'AI/ML',
      },
      chains: {},
      statistics: {
        totalChains: 0,
        totalVersions: 0,
        activeVersions: 0,
        draftVersions: 0,
        deprecatedVersions: 0,
        archivedVersions: 0,
      },
      zepIntegration: {
        enabled: false,
        episodeBudget: {
          maxFreeEpisodes: 0,
          warningThresholdPercent: 0,
          hardLimitPercent: 0,
        },
      },
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// Maximum number of timestamped files to keep (prevents unbounded growth)
const MAX_HISTORY_FILES = 5;

async function cleanupOldFiles(dir: string, prefix: string): Promise<number> {
  const files = await fs.promises.readdir(dir);
  const timestampedFiles = files
    .filter((f) => f.startsWith(prefix) && !f.endsWith('-latest.json'))
    .sort()
    .reverse(); // newest first

  let deleted = 0;
  for (const file of timestampedFiles.slice(MAX_HISTORY_FILES)) {
    await fs.promises.unlink(path.join(dir, file));
    deleted++;
  }
  return deleted;
}

function hashContent(content: string): string {
  // Simple hash for change detection (avoid crypto import overhead)
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    hash = (hash << 5) - hash + content.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(16);
}

async function writeManifest(result: ManifestResult): Promise<{ timestampedPath: string | null; latestPath: string; skipped: boolean }> {
  const dir = path.join(process.cwd(), 'artifacts/misc/prompt-versions');
  await fs.promises.mkdir(dir, { recursive: true });

  const latestPath = path.join(dir, 'prompt-versions-latest.json');

  // Prepare content without timestamps for comparison (DRY: compare actual data)
  // Strip all timestamps (generated_at, createdAt in versions) to compare only meaningful changes
  const stripTimestamps = (obj: ManifestResult) => ({
    status: obj.status,
    chains: Object.fromEntries(
      Object.entries(obj.chains).map(([k, v]) => [
        k,
        {
          ...v,
          versions: v.versions.map(({ createdAt, ...rest }) => rest),
        },
      ])
    ),
    statistics: obj.statistics,
  });

  const newHash = hashContent(JSON.stringify(stripTimestamps(result)));

  // Check if content changed from previous version
  let previousHash = '';
  try {
    const existing = await fs.promises.readFile(latestPath, 'utf-8');
    const parsed = JSON.parse(existing) as ManifestResult;
    previousHash = hashContent(JSON.stringify(stripTimestamps(parsed)));
  } catch {
    // No previous file exists
  }

  // Skip if content unchanged (DRY: avoid duplicate files)
  if (newHash === previousHash) {
    return { timestampedPath: null, latestPath, skipped: true };
  }

  const content = JSON.stringify(result, null, 2);

  // Write timestamped file (immutable history)
  const filename = generateFilename(result.generated_at);
  const timestampedPath = path.join(dir, filename);
  await fs.promises.writeFile(timestampedPath, content, 'utf-8');

  // Overwrite -latest.json (always points to newest)
  await fs.promises.writeFile(latestPath, content, 'utf-8');

  // Cleanup old files to prevent unbounded growth
  await cleanupOldFiles(dir, 'prompt-versions-');

  return { timestampedPath, latestPath, skipped: false };
}

// =============================================================================
// CLI Entry Point
// =============================================================================

async function main() {
  console.log('Generating chain version manifest...');

  const result = await generateManifest();
  const { timestampedPath, latestPath, skipped } = await writeManifest(result);

  console.log(`Status: ${result.status}`);
  console.log(`Generated at: ${result.generated_at}`);
  console.log(`Chains: ${result.statistics.totalChains}`);
  console.log(`Versions: ${result.statistics.totalVersions}`);

  if (skipped) {
    console.log(`\nNo changes detected - skipped file creation (DRY)`);
    console.log(`  - Latest: ${latestPath}`);
  } else {
    console.log(`\nFiles written:`);
    console.log(`  - ${timestampedPath}`);
    console.log(`  - ${latestPath}`);
  }

  if (result.status === 'FAILED') {
    console.error(`Error: ${result.error}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Failed to generate manifest:', err);
  process.exit(1);
});
