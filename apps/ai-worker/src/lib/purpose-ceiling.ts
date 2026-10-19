/**
 * purpose-ceiling.ts — per-purpose monthly AI cost ceilings (PG-199, ADR-082).
 *
 * A tenant can cap each AI purpose's monthly spend (owner Q2). Before a model is
 * built, `assertWithinCeiling` compares the purpose's month-to-date spend with its
 * ceiling and throws `PurposeCeilingReachedError` once it is reached; the caller then
 * runs its existing non-AI fallback. Other purposes keep working.
 *
 * - Spend is read through a `PurposeSpendReader` registered at boot
 *   (`setPurposeSpendReader`, ai-worker.ts). With no reader the check fails open and
 *   warns once — never silently.
 * - Spend is cached 30 s per (tenant, purpose, UTC month), so a cached block never
 *   outlives midnight UTC on the 1st. Spend recorded in this process during the
 *   window is added locally (`notePurposeSpend`) so a burst cannot run past the cap.
 * - The ceiling is soft: cost is only known after a call returns, so one in-flight
 *   call per worker may overshoot.
 * - A DB failure while reading spend fails open with a logged reason: the AI is
 *   never blocked because the database is unreachable.
 */

import { purposeSpendPeriod, type LLMPurpose } from '@intelliflow/domain';

export const PURPOSE_CEILING_REACHED = 'PURPOSE_CEILING_REACHED';

export class PurposeCeilingReachedError extends Error {
  readonly code = PURPOSE_CEILING_REACHED;

  constructor(
    readonly purpose: LLMPurpose,
    readonly ceilingCents: number,
    readonly spentCents: number
  ) {
    super(`monthly AI ceiling reached for ${purpose}`);
    this.name = 'PurposeCeilingReachedError';
  }
}

/**
 * True for the ceiling error itself, anything carrying its code, or an error whose
 * `cause` chain contains it (callers such as the embedding chain wrap errors).
 */
export function isPurposeCeilingReached(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; current && depth < 5; depth++) {
    if ((current as { code?: unknown }).code === PURPOSE_CEILING_REACHED) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export interface PurposeSpendReader {
  getSpend(
    tenantId: string,
    period: string,
    purposes: readonly LLMPurpose[]
  ): Promise<Partial<Record<LLMPurpose, number>>>;
}

let spendReader: PurposeSpendReader | null = null;

/** Registered once at worker boot with the Prisma-backed repository. */
export function setPurposeSpendReader(reader: PurposeSpendReader | null): void {
  spendReader = reader;
}

export function getPurposeSpendReader(): PurposeSpendReader | null {
  return spendReader;
}

interface SpendCacheEntry {
  centiCents: number;
  expiresAt: number;
}

const SPEND_CACHE_TTL_MS = 30_000;

/** Exported so tests can clear it. Key: `${tenantId}:${purpose}:${period}`. */
export const _spendCache = new Map<string, SpendCacheEntry>();

/**
 * One spend read per key at a time, and the spend noted while it is in flight, so a
 * concurrent miss never replaces a newer local balance with an older read.
 */
const inflightReads = new Map<string, Promise<number | null>>();
const notedDuringRead = new Map<string, number>();

function spendKey(tenantId: string, purpose: LLMPurpose, period: string): string {
  return `${tenantId}:${purpose}:${period}`;
}

const warned = new Set<string>();

function warnOnce(reason: string, detail: string): void {
  if (warned.has(reason)) return;
  warned.add(reason);
  console.warn(`[purpose-ceiling] ${reason}: ${detail} — ceiling not enforced (fail-open)`);
}

/** Test hook: forget which fail-open reasons were already logged. */
export function __resetPurposeCeilingWarnings(): void {
  warned.clear();
}

/** Add spend recorded in this process to an existing cache entry for the same month. */
export function notePurposeSpend(
  tenantId: string,
  purpose: LLMPurpose,
  centiCents: number,
  now: Date = new Date()
): void {
  if (!(centiCents > 0)) return;
  const key = spendKey(tenantId, purpose, purposeSpendPeriod(now));
  const entry = _spendCache.get(key);
  if (entry) entry.centiCents += centiCents;
  if (inflightReads.has(key))
    notedDuringRead.set(key, (notedDuringRead.get(key) ?? 0) + centiCents);
}

async function readSpend(tenantId: string, purpose: LLMPurpose, now: Date): Promise<number | null> {
  const period = purposeSpendPeriod(now);
  const key = spendKey(tenantId, purpose, period);
  const cached = _spendCache.get(key);
  if (cached && cached.expiresAt > now.getTime()) return cached.centiCents;

  if (!spendReader) {
    warnOnce('spend_reader_missing', 'no PurposeSpendReader registered');
    return null;
  }
  const inflight = inflightReads.get(key);
  if (inflight) return inflight;
  const read = fetchSpend(spendReader, tenantId, purpose, period, key, now);
  inflightReads.set(key, read);
  try {
    return await read;
  } finally {
    inflightReads.delete(key);
    notedDuringRead.delete(key);
  }
}

async function fetchSpend(
  reader: PurposeSpendReader,
  tenantId: string,
  purpose: LLMPurpose,
  period: string,
  key: string,
  now: Date
): Promise<number | null> {
  try {
    const spend = await reader.getSpend(tenantId, period, [purpose]);
    const centiCents = (spend[purpose] ?? 0) + (notedDuringRead.get(key) ?? 0);
    _spendCache.set(key, { centiCents, expiresAt: now.getTime() + SPEND_CACHE_TTL_MS });
    return centiCents;
  } catch (err) {
    console.warn(
      `[purpose-ceiling] spend_read_failed for ${purpose}: ${
        err instanceof Error ? err.message : String(err)
      } — ceiling not enforced for this call (fail-open)`
    );
    return null;
  }
}

/**
 * Throw `PurposeCeilingReachedError` when the purpose has reached its monthly ceiling.
 * `ceilingCents` null/undefined = no ceiling; 0 = blocked outright (even free models).
 */
export async function assertWithinCeiling(
  tenantId: string,
  purpose: LLMPurpose,
  ceilingCents: number | null | undefined,
  now: Date = new Date()
): Promise<void> {
  if (ceilingCents === null || ceilingCents === undefined) return;
  if (ceilingCents === 0) throw new PurposeCeilingReachedError(purpose, 0, 0);

  const centiCents = await readSpend(tenantId, purpose, now);
  if (centiCents === null) return;
  if (centiCents >= ceilingCents * 100) {
    throw new PurposeCeilingReachedError(purpose, ceilingCents, centiCents / 100);
  }
}
