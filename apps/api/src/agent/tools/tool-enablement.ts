/**
 * Tool Enablement Helper
 *
 * H6 (2026-04-17 audit): Per-tenant gate that blocks agent tool invocations
 * for tenants that have disabled a specific tool via TenantToolEnablement.
 *
 * Default semantics: all tools are ENABLED. A row with enabled=false blocks
 * that tool for the tenant. Absence of a row means enabled=true.
 *
 * Cache: module-level Map, TTL 60s. Fails open on DB error (never blocks
 * tool use due to a DB hiccup).
 */

import type { PrismaClient } from '@intelliflow/db';

/**
 * Thrown when a tool is explicitly disabled for a tenant.
 */
export class ToolDisabledError extends Error {
  readonly toolName: string;
  readonly tenantId: string;

  constructor(toolName: string, tenantId: string) {
    super(
      `Tool "${toolName}" is disabled for tenant ${tenantId}. ` +
        `Contact your administrator to re-enable it.`
    );
    this.name = 'ToolDisabledError';
    this.toolName = toolName;
    this.tenantId = tenantId;
  }
}

// ---------------------------------------------------------------------------
// Cache internals
// ---------------------------------------------------------------------------

interface CacheEntry {
  enabled: boolean;
  expiresAt: number;
}

/** 60-second TTL for enablement lookups */
const CACHE_TTL_MS = 60_000;

/** `${tenantId}:${toolName}` → CacheEntry */
const enablementCache = new Map<string, CacheEntry>();

function cacheKey(tenantId: string, toolName: string): string {
  return `${tenantId}:${toolName}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns true if the tool is enabled for the tenant.
 *
 * - No row in DB  → true  (default-enabled)
 * - Row enabled=true → true
 * - Row enabled=false → false
 * - DB throws → true (fail-open) + logs warn
 */
export async function isToolEnabledForTenant(
  prisma: PrismaClient,
  tenantId: string,
  toolName: string
): Promise<boolean> {
  const key = cacheKey(tenantId, toolName);
  const now = Date.now();
  const cached = enablementCache.get(key);

  if (cached && cached.expiresAt > now) {
    return cached.enabled;
  }

  try {
    const row = await prisma.tenantToolEnablement.findUnique({
      where: { tenantId_toolName: { tenantId, toolName } },
      select: { enabled: true },
    });

    const enabled = row === null || row.enabled === true;
    enablementCache.set(key, { enabled, expiresAt: now + CACHE_TTL_MS });
    return enabled;
  } catch (err) {
    // Fail-open: DB unavailability must never silently block agents
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[tool-enablement] DB query failed for tenant=${tenantId} tool=${toolName}; ` +
        `failing open. Error: ${message}`
    );
    return true;
  }
}

/**
 * Invalidate cached entries.
 *
 * Call this after any admin endpoint updates TenantToolEnablement rows.
 *
 * - Pass { tenantId, toolName } to evict a single entry.
 * - Pass { tenantId } to evict all tools for that tenant.
 * - Pass {} to flush the entire cache (e.g. after a bulk migration).
 */
export function __invalidateCache(opts: { tenantId?: string; toolName?: string } = {}): void {
  if (!opts.tenantId && !opts.toolName) {
    enablementCache.clear();
    return;
  }

  for (const key of enablementCache.keys()) {
    const [keyTenantId, keyToolName] = key.split(':');
    const tenantMatch = !opts.tenantId || keyTenantId === opts.tenantId;
    const toolMatch = !opts.toolName || keyToolName === opts.toolName;
    if (tenantMatch && toolMatch) {
      enablementCache.delete(key);
    }
  }
}

/**
 * Exposed for testing only — returns a snapshot of current cache state.
 * @internal
 */
export function __getCacheSnapshot(): Map<string, CacheEntry> {
  return new Map(enablementCache);
}
