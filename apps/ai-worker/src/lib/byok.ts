/**
 * byok.ts - "bring your own key" routing for the ai-worker (PG-199 BYOK).
 *
 * A workspace admin stores their own provider key (API: aiProviderKey router, table
 * `tenant_ai_provider_keys`, key encrypted by the field-encryption extension). When a job's
 * tenant has one, `createLLMForTenant` (llm-factory.ts) builds that tenant's chat model on
 * their provider and key; every other tenant keeps the platform providers unchanged.
 *
 * How the route is decided (`routeForTenant`):
 * - no credential, or no real tenant (`unknown`, `__...`): the platform path;
 * - status INVALID (the provider rejected the key): the platform path only when the tenant
 *   allowed fallback, otherwise the job fails with a clear, key-free error;
 * - an explicit provider override (the job-level fallback after a failure) is the platform
 *   path only when the tenant allowed fallback, otherwise it fails the same way: a customer
 *   who did not allow fallback never has a platform provider called for them;
 * - otherwise their key. RATE_LIMITED / QUOTA_EXCEEDED keys are still tried (they heal on
 *   the next successful call).
 *
 * A BYOK call that fails with 401/403 (INVALID), 402 or an insufficient-quota error
 * (QUOTA_EXCEEDED) or 429 (RATE_LIMITED) marks the credential's status, then either falls
 * back to the platform model (allowFallback) or throws `ByokKeyError`. Other errors (5xx,
 * timeouts, a refusal) are not key failures and pass through unchanged.
 *
 * The key is only ever held in this process's memory: it is never logged, never put in an
 * error message, and the credential cache (30 s) and the built-model cache (5 min, keyed by
 * tenant and a hash of the key) are invalidated when the row changes (a new row is picked up
 * within the cache TTL, and `invalidateByok` clears both at once for this process).
 */

import { createHash } from 'node:crypto';
import { prisma } from '@intelliflow/db';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import {
  AI_KEY_PROVIDERS,
  AI_KEY_PROVIDER_LABELS,
  type AIKeyProvider,
  type AIKeyStatus,
} from '@intelliflow/validators';
import { createLogger } from '../utils/logger.js';
import { CircuitBreaker } from '../utils/circuit-breaker.js';
import { tenantContextStore } from '../tracing/tenant-context.js';

const logger = createLogger('byok');

export const BYOK_KEY_ERROR = 'BYOK_KEY_ERROR';

/** The key's status, or UNREADABLE when it exists but could not be read (database or decrypt). */
export type ByokKeyStatus = AIKeyStatus | 'UNREADABLE';

/** The tenant's own key cannot be used for this call (and fallback is not allowed). */
export class ByokKeyError extends Error {
  readonly code = BYOK_KEY_ERROR;
  constructor(
    readonly tenantId: string,
    readonly provider: AIKeyProvider | null,
    readonly keyStatus: ByokKeyStatus,
    message: string
  ) {
    super(message);
    this.name = 'ByokKeyError';
  }
}

/** True for the BYOK error, or an error whose `cause` chain holds it. */
export function isByokKeyError(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; current && depth < 5; depth++) {
    if ((current as { code?: unknown }).code === BYOK_KEY_ERROR) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/** Set on an error thrown by a call that ran on a tenant's own key (not a platform call). */
const BYOK_ORIGIN = Symbol.for('intelliflow.byok.origin');

function markByokOrigin(err: unknown): void {
  if (err && typeof err === 'object') {
    try {
      Object.defineProperty(err, BYOK_ORIGIN, { value: true, configurable: true });
    } catch {
      // A frozen error cannot be tagged: it then counts like any other failure.
    }
  }
}

/**
 * True when the error came from a call on a tenant's own key or provider: `ByokKeyError`, or
 * any error a BYOK-model call threw (also when a chain wrapped it: the `cause` chain is
 * followed). Shared circuit breakers must not count these: one customer's bad key or provider
 * outage would otherwise open the breaker for every tenant.
 */
export function isByokFailure(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; current && depth < 5; depth++) {
    if ((current as { code?: unknown }).code === BYOK_KEY_ERROR) return true;
    if (typeof current === 'object' && (current as Record<symbol, unknown>)[BYOK_ORIGIN] === true) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

// Shared circuit breakers guard the PLATFORM provider. A BYOK failure is never counted (any
// caller, present or future); a BYOK success is not counted either (the wrapper below marks the
// call, see CircuitBreaker.markCallNotPlatform), and a BYOK call that falls back to the
// platform is counted as the platform call it then is.
if (typeof CircuitBreaker.ignoreFailuresMatching === 'function') {
  CircuitBreaker.ignoreFailuresMatching(isByokFailure);
}

/**
 * An OPEN platform breaker does not refuse a tenant that runs on its own key (and an INVALID
 * key is not one: that call goes to the platform or fails). Asked only when the breaker is
 * OPEN, so a closed breaker costs nothing extra.
 */
async function runsOnOwnKey(): Promise<boolean> {
  const tenantId = tenantContextStore.getStore()?.tenantId;
  if (!isBillableTenant(tenantId)) return false;
  const credential = await resolveByokCredential(tenantId);
  if (credential === null) return false;
  if (credential.status !== 'INVALID') return true;
  // A rejected key's recovery probe (routeForTenant) runs on the key, so it is let through too.
  return Date.now() - (lastInvalidProbeAt.get(tenantId) ?? 0) >= INVALID_PROBE_INTERVAL_MS;
}

if (typeof CircuitBreaker.bypassWhenOpen === 'function') {
  CircuitBreaker.bypassWhenOpen(runsOnOwnKey);
}

export interface ByokCredential {
  tenantId: string;
  provider: AIKeyProvider;
  apiKey: string;
  last4: string;
  /** Changes on every key replacement (the row's createdAt, rewritten by `set`), in ms. */
  revision: number;
  status: AIKeyStatus;
  allowFallback: boolean;
}

// ---------------------------------------------------------------------------
// Credential cache
// ---------------------------------------------------------------------------

const CREDENTIAL_TTL_MS = 30_000;
const MODEL_TTL_MS = 5 * 60_000;
const MODEL_CACHE_MAX = 500;

interface CredentialEntry {
  value: ByokCredential | null;
  expiresAt: number;
}

/** How long past its TTL a credential may still be served while the database cannot be read. */
const STALE_SERVE_MS = 60_000;
/** An INVALID key is tried again at most this often, so a one-off rejection heals itself. */
const INVALID_PROBE_INTERVAL_MS = 10 * 60_000;
/** The same failure status is written at most this often per tenant. */
const MARK_INTERVAL_MS = 60_000;

const credentialCache = new Map<string, CredentialEntry>();
const modelCache = new Map<string, { model: BaseChatModel; expiresAt: number }>();
const lastUsedWrittenAt = new Map<string, number>();
const lastInvalidProbeAt = new Map<string, number>();
const lastMarked = new Map<string, { status: string; at: number }>();
/** Tenants this process has seen with a key: an unreadable key for one of them never falls open. */
const tenantsWithKey = new Set<string>();

/** Test seam and change hook: forget everything cached for a tenant (or every tenant). */
export function invalidateByok(tenantId?: string): void {
  if (!tenantId) {
    credentialCache.clear();
    modelCache.clear();
    lastUsedWrittenAt.clear();
    lastInvalidProbeAt.clear();
    lastMarked.clear();
    tenantsWithKey.clear();
    return;
  }
  credentialCache.delete(tenantId);
  lastUsedWrittenAt.delete(tenantId);
  lastInvalidProbeAt.delete(tenantId);
  for (const key of lastMarked.keys()) if (key.startsWith(`${tenantId}:`)) lastMarked.delete(key);
  for (const key of modelCache.keys()) {
    if (key.startsWith(`${tenantId}\u0000`)) modelCache.delete(key);
  }
}

function isBillableTenant(tenantId: string | undefined): tenantId is string {
  return !!tenantId && tenantId !== 'unknown' && !tenantId.startsWith('__');
}

/** The same stored key: same provider and the same revision (a replacement changes it). */
function sameKey(a: ByokCredential, b: ByokCredential): boolean {
  return a.provider === b.provider && a.revision === b.revision;
}

/** Prisma "table does not exist": the migration has not been applied yet. */
function isSchemaPending(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return code === 'P2021' || code === 'P2022';
}

const KNOWN_PROVIDERS: ReadonlySet<string> = new Set(AI_KEY_PROVIDERS);
const KNOWN_STATUSES: ReadonlySet<string> = new Set([
  'ACTIVE',
  'INVALID',
  'RATE_LIMITED',
  'QUOTA_EXCEEDED',
]);

/**
 * What is known about a key that could not be read: whether a row exists and whether the
 * tenant allowed fallback. Selects no secret column, so it works when decryption is what
 * failed. Null when the database itself cannot be reached.
 */
async function probeKeyRow(
  tenantId: string
): Promise<{ exists: boolean; allowFallback: boolean } | null> {
  try {
    const row = (await prisma.tenantAIProviderKey.findFirst({
      where: { tenantId },
      select: { allowFallback: true },
    })) as { allowFallback: boolean } | null;
    return { exists: row !== null, allowFallback: row?.allowFallback === true };
  } catch {
    return null;
  }
}

/** A tenant's key is known to exist but cannot be read now, and fallback is not allowed. */
function unreadable(tenantId: string, provider: AIKeyProvider | null): ByokKeyError {
  return new ByokKeyError(
    tenantId,
    provider,
    'UNREADABLE',
    byokFailureMessage(provider, 'UNREADABLE')
  );
}

/**
 * The tenant's credential, or null when it has none. Cached 30 s.
 *
 * When the key cannot be read it never silently falls onto the platform for a tenant that did
 * not allow fallback: a key that exists but fails to decrypt follows the tenant's own
 * `allowFallback`; with the database down, the last value is served for up to a minute, then
 * a tenant known to have a key fails with a clear error (`ByokKeyError`, UNREADABLE). Only a
 * tenant this process has never seen with a key goes to the platform then, so an outage does
 * not stop every other tenant's AI.
 */
export async function resolveByokCredential(tenantId: string): Promise<ByokCredential | null> {
  const now = Date.now();
  const cached = credentialCache.get(tenantId);
  if (cached && cached.expiresAt > now) return cached.value;

  try {
    const value = await readCredential(tenantId);
    credentialCache.set(tenantId, { value, expiresAt: now + CREDENTIAL_TTL_MS });
    if (value) tenantsWithKey.add(tenantId);
    else tenantsWithKey.delete(tenantId);
    return value;
  } catch (err) {
    // The migration has not been applied: nobody has a key yet.
    if (isSchemaPending(err)) return null;
    logger.warn(
      { tenantId, err: err instanceof Error ? err.name : 'Error' },
      'BYOK credential could not be read'
    );
    return unreadableOutcome(tenantId, cached, now);
  }
}

/** The tenant's row as a credential (decrypted by the field-encryption client), or null. */
async function readCredential(tenantId: string): Promise<ByokCredential | null> {
  const row = (await prisma.tenantAIProviderKey.findFirst({
    where: { tenantId },
    select: {
      provider: true,
      apiKey: true,
      last4: true,
      createdAt: true,
      status: true,
      allowFallback: true,
    },
  })) as {
    provider: string;
    apiKey: string;
    last4: string;
    createdAt: Date;
    status: string;
    allowFallback: boolean;
  } | null;
  if (!row || !KNOWN_PROVIDERS.has(row.provider) || !KNOWN_STATUSES.has(row.status)) return null;
  return {
    tenantId,
    provider: row.provider as AIKeyProvider,
    apiKey: row.apiKey,
    last4: row.last4,
    revision: new Date(row.createdAt).getTime(),
    status: row.status as AIKeyStatus,
    allowFallback: row.allowFallback,
  };
}

/** What to do for a tenant whose key could not be read: see resolveByokCredential. */
async function unreadableOutcome(
  tenantId: string,
  cached: CredentialEntry | undefined,
  now: number
): Promise<ByokCredential | null> {
  const known = cached?.value ?? null;
  const probe = await probeKeyRow(tenantId);
  if (probe) {
    // The database answers but the key cannot be read (decrypt failure): honour the tenant's choice.
    if (!probe.exists || probe.allowFallback) return null;
    tenantsWithKey.add(tenantId);
    throw unreadable(tenantId, known?.provider ?? null);
  }
  // The database cannot be reached: serve the last value for a minute. Past that, neither the
  // key's existence nor the tenant's fallback consent can be established, so fail closed:
  // only a cached tenant that allowed fallback goes to the platform.
  if (cached && cached.expiresAt + STALE_SERVE_MS > now) return cached.value;
  if (known?.allowFallback === true) return null;
  throw unreadable(tenantId, known?.provider ?? null);
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

export type ByokRoute = { kind: 'platform' } | { kind: 'byok'; credential: ByokCredential };

function providerLabel(provider: AIKeyProvider | null): string {
  return provider ? AI_KEY_PROVIDER_LABELS[provider] : 'AI provider';
}

/** The clear, key-free message a failed job carries. */
export function byokFailureMessage(provider: AIKeyProvider | null, status: ByokKeyStatus): string {
  const label = providerLabel(provider);
  switch (status) {
    case 'INVALID':
      return `Your ${label} API key was rejected by the provider. Replace it in Settings > AI > Model Configuration, or allow fallback to the platform AI.`;
    case 'QUOTA_EXCEEDED':
      return `Your ${label} API key has no remaining quota or credit. Top it up with the provider, or allow fallback to the platform AI in Model Configuration.`;
    case 'RATE_LIMITED':
      return `Your ${label} API key hit the provider's rate limit. Try again shortly, or allow fallback to the platform AI in Model Configuration.`;
    case 'UNREADABLE':
      return `Your own ${label} key could not be read right now, and fallback to the platform AI is turned off in Model Configuration. Try again shortly.`;
    default:
      return `Your own ${label} key could not be used for this call, and fallback to the platform AI is turned off in Model Configuration.`;
  }
}

/**
 * Decide the route for one model build. `explicitProvider` is true when the caller named a
 * provider (the job-level fallback after a failed first attempt).
 */
export async function routeForTenant(
  tenantId: string,
  options: { explicitProvider?: boolean } = {}
): Promise<ByokRoute> {
  if (!isBillableTenant(tenantId)) return { kind: 'platform' };
  const credential = await resolveByokCredential(tenantId);
  if (!credential) return { kind: 'platform' };

  // A rejected key is tried again at most every 10 minutes: if the provider accepts it the call
  // heals the status, so one spurious 401/403 cannot disable a key for good.
  const probing =
    credential.status === 'INVALID' &&
    !options.explicitProvider &&
    Date.now() - (lastInvalidProbeAt.get(tenantId) ?? 0) >= INVALID_PROBE_INTERVAL_MS;
  if (probing) {
    lastInvalidProbeAt.set(tenantId, Date.now());
    return { kind: 'byok', credential };
  }

  if (credential.status === 'INVALID' || options.explicitProvider) {
    if (credential.allowFallback) return { kind: 'platform' };
    throw new ByokKeyError(
      tenantId,
      credential.provider,
      credential.status,
      byokFailureMessage(credential.provider, credential.status)
    );
  }
  return { kind: 'byok', credential };
}

// ---------------------------------------------------------------------------
// Built-model cache
// ---------------------------------------------------------------------------

function keyFingerprint(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex').slice(0, 16);
}

/** A cached model for this tenant, key and shape, built by `build` on a miss (5 min). */
export function getCachedByokModel(
  credential: ByokCredential,
  shape: string,
  build: () => BaseChatModel
): BaseChatModel {
  const now = Date.now();
  const key = `${credential.tenantId}\u0000${credential.provider}:${keyFingerprint(credential.apiKey)}:${shape}`;
  const cached = modelCache.get(key);
  if (cached && cached.expiresAt > now) return cached.model;

  if (modelCache.size >= MODEL_CACHE_MAX) {
    for (const [k, entry] of modelCache) if (entry.expiresAt <= now) modelCache.delete(k);
    // Still full: drop the oldest entries (insertion order), never every tenant's models.
    for (const k of modelCache.keys()) {
      if (modelCache.size < MODEL_CACHE_MAX) break;
      modelCache.delete(k);
    }
  }
  const model = build();
  modelCache.set(key, { model, expiresAt: now + MODEL_TTL_MS });
  return model;
}

// ---------------------------------------------------------------------------
// Failure classification and status marking
// ---------------------------------------------------------------------------

const QUOTA_PATTERN =
  /insufficient[_ ]quota|exceeded your current quota|credit balance is too low|out of credits/i;

const KEY_REJECTED_403 = /key|unauthori[sz]ed|authentication|permission|not allowed|access|denied/i;
const NOT_THE_KEY_403 = /moderation|flagged|region|country|territory/i;

/** Errors of our own parsing of an answer: never the provider's verdict on the key. */
const PARSE_FAILURES: ReadonlySet<string> = new Set(['OutputParserException', 'ZodError']);

function httpStatusOf(err: unknown): number | undefined {
  const e = err as {
    status?: unknown;
    statusCode?: unknown;
    response?: { status?: unknown };
    error?: { status?: unknown };
  } | null;
  const status = Number(e?.status ?? e?.statusCode ?? e?.response?.status ?? e?.error?.status);
  return Number.isInteger(status) ? status : undefined;
}

/**
 * Which key problem an error is, or null when it is not one (a 5xx, a timeout, a refusal,
 * a schema failure): those are not the customer key's fault and are never marked.
 */
export function classifyByokFailure(
  err: unknown,
  provider?: AIKeyProvider
): Exclude<AIKeyStatus, 'ACTIVE'> | null {
  const status = httpStatusOf(err);
  const e = err as { code?: unknown; message?: unknown; type?: unknown; name?: unknown } | null;
  const text = `${String(e?.code ?? '')} ${String(e?.type ?? '')} ${String(e?.message ?? '')}`;
  // Only an HTTP answer from the provider is a verdict on the key. An error with no status
  // (a parse failure quoting the model's own output, a network error) never is.
  if (status === undefined || PARSE_FAILURES.has(String(e?.name ?? ''))) return null;
  // An empty balance arrives as 400 (Anthropic), 402 or 429.
  const quotaStatus = status === 400 || status === 402 || status === 429;
  if (quotaStatus && QUOTA_PATTERN.test(text)) return 'QUOTA_EXCEEDED';
  if (status === 401) return 'INVALID';
  // 403 is a bad key only when the provider says it is about the key or its permissions: other
  // 403s (OpenRouter's moderation of one flagged prompt, a region refusal) are not the key's fault.
  if (status === 403)
    return KEY_REJECTED_403.test(text) && !NOT_THE_KEY_403.test(text) ? 'INVALID' : null;
  if (status === 402) return 'QUOTA_EXCEEDED';
  if (status === 429) return 'RATE_LIMITED';
  // Google answers a bad key at run time with 400 "API key not valid".
  if (provider === 'google' && status === 400 && GOOGLE_BAD_KEY.test(text)) return 'INVALID';
  return null;
}

const GOOGLE_BAD_KEY = /api key not valid|API_KEY_INVALID/i;

const STATUS_DETAIL: Record<Exclude<AIKeyStatus, 'ACTIVE'>, string> = {
  INVALID: 'The provider rejected the key. Replace it, or test it again.',
  QUOTA_EXCEEDED: 'The key has no remaining quota or credit with the provider.',
  RATE_LIMITED: 'The provider rate-limited the key.',
};

/**
 * Mark the credential's status. Never throws and never writes the provider's message. The
 * cached credential is updated in place (a failing key must not cost a database read per
 * call) and the same status is written at most once a minute per tenant.
 */
export async function markByokStatus(
  credential: ByokCredential,
  status: Exclude<AIKeyStatus, 'ACTIVE'>
): Promise<void> {
  const { tenantId } = credential;
  const now = Date.now();
  const cached = credentialCache.get(tenantId);
  // Only if the cached credential is the key that failed (a replacement is left alone).
  if (cached?.value && sameKey(cached.value, credential)) {
    credentialCache.set(tenantId, { ...cached, value: { ...cached.value, status } });
    if (status === 'INVALID') lastInvalidProbeAt.set(tenantId, now);
  }

  // Throttled per key (tenant and revision): an old key's failure never suppresses the new one's.
  const markKey = `${tenantId}:${credential.provider}:${credential.revision}`;
  const previous = lastMarked.get(markKey);
  if (previous && previous.status === status && now - previous.at < MARK_INTERVAL_MS) return;
  lastMarked.set(markKey, { status, at: now });
  try {
    // Only the key this call used: a key replaced meanwhile is not marked for the old one's failure.
    const written = await prisma.tenantAIProviderKey.updateMany({
      where: { tenantId, provider: credential.provider, createdAt: new Date(credential.revision) },
      data: { status, statusDetail: STATUS_DETAIL[status] },
    });
    // Matched no row (the key was replaced): nothing was recorded, so nothing is throttled.
    if (written?.count === 0) lastMarked.delete(markKey);
  } catch (err) {
    lastMarked.delete(markKey);
    logger.warn(
      { tenantId, err: err instanceof Error ? err.name : 'Error' },
      'BYOK key status could not be recorded'
    );
  }
}

const LAST_USED_WRITE_INTERVAL_MS = 5 * 60_000;

/** A successful call: stamp lastUsedAt (at most every 5 min) and heal a non-ACTIVE status. */
function recordByokSuccess(credential: ByokCredential): void {
  const now = Date.now();
  // The status NOW (a model outlives the status it was built with), not the captured one.
  const cachedNow = credentialCache.get(credential.tenantId)?.value;
  const current =
    cachedNow && sameKey(cachedNow, credential) ? cachedNow.status : credential.status;
  const heals = current !== 'ACTIVE';
  const last = lastUsedWrittenAt.get(credential.tenantId) ?? 0;
  if (!heals && now - last < LAST_USED_WRITE_INTERVAL_MS) return;
  lastUsedWrittenAt.set(credential.tenantId, now);
  if (heals) {
    const cached = credentialCache.get(credential.tenantId);
    if (cached?.value && sameKey(cached.value, credential)) {
      credentialCache.set(credential.tenantId, {
        ...cached,
        value: { ...cached.value, status: 'ACTIVE' },
      });
    }
    lastMarked.delete(`${credential.tenantId}:${credential.provider}:${credential.revision}`);
  }
  prisma.tenantAIProviderKey
    .updateMany({
      where: {
        tenantId: credential.tenantId,
        provider: credential.provider,
        createdAt: new Date(credential.revision),
      },
      data: { lastUsedAt: new Date(), ...(heals ? { status: 'ACTIVE', statusDetail: null } : {}) },
    })
    .catch((err: unknown) =>
      logger.warn(
        { tenantId: credential.tenantId, err: err instanceof Error ? err.name : 'Error' },
        'BYOK last-used time could not be recorded'
      )
    );
}

// ---------------------------------------------------------------------------
// Failure handling around the tenant's model
// ---------------------------------------------------------------------------

function platformBreakerRefusesCall(): boolean {
  return (
    typeof CircuitBreaker.callBypassedOpenBreaker === 'function' &&
    CircuitBreaker.callBypassedOpenBreaker()
  );
}

/** Tell the surrounding shared breaker (if any) whether this call is the platform's answer. */
function markNotPlatform(notPlatform: boolean): void {
  if (typeof CircuitBreaker.markCallNotPlatform === 'function') {
    CircuitBreaker.markCallNotPlatform(notPlatform);
  }
}

interface Invokable {
  invoke: (input: unknown, options?: unknown) => Promise<unknown>;
}

export interface ByokFailureOptions {
  credential: ByokCredential;
  /** Builds the platform model; present only when the tenant allowed fallback. */
  fallback: (() => Promise<BaseChatModel> | BaseChatModel) | null;
}

/**
 * Wrap the tenant's own model: a key failure marks the credential, then runs the call on the
 * platform model (fallback allowed) or throws `ByokKeyError`. `invoke` and
 * `withStructuredOutput` are covered, like the other model wrappers in llm-factory.ts. The
 * fallback model is the platform's normal model, so its calls are metered against the
 * platform's budget as usual.
 */
export function withByokFailureHandling(
  model: BaseChatModel,
  options: ByokFailureOptions
): BaseChatModel {
  const { credential, fallback } = options;

  const run = async (
    own: () => Promise<unknown>,
    onFallback: (fallbackModel: BaseChatModel) => Promise<unknown>
  ): Promise<unknown> => {
    try {
      // Not the platform provider's answer: a shared breaker must not count it either way.
      markNotPlatform(true);
      const result = await own();
      recordByokSuccess(credential);
      return result;
    } catch (err) {
      const failure = classifyByokFailure(err, credential.provider);
      if (!failure) {
        markByokOrigin(err);
        throw err;
      }
      await markByokStatus(credential, failure);
      logger.warn(
        { tenantId: credential.tenantId, provider: credential.provider, keyStatus: failure },
        fallback ? 'BYOK key failed; falling back to the platform model' : 'BYOK key failed'
      );
      if (!fallback) {
        throw new ByokKeyError(
          credential.tenantId,
          credential.provider,
          failure,
          byokFailureMessage(credential.provider, failure)
        );
      }
      // The call was let through an OPEN platform breaker because it runs on the tenant's key:
      // the platform is not to be called now, whatever the tenant allowed.
      if (platformBreakerRefusesCall()) {
        throw new Error('Circuit breaker is OPEN - too many failures', { cause: err });
      }
      // The platform's answer is the one that counts for the shared breaker from here on.
      markNotPlatform(false);
      return onFallback(await fallback());
    }
  };

  return new Proxy(model, {
    get(target, prop, receiver) {
      if (prop === 'invoke') {
        return (input: unknown, callOptions?: unknown) =>
          run(
            () => (target as unknown as Invokable).invoke(input, callOptions),
            (fb) => (fb as unknown as Invokable).invoke(input, callOptions)
          );
      }
      if (prop === 'withStructuredOutput') {
        return (...args: unknown[]) => {
          const structure = (m: BaseChatModel) =>
            (m.withStructuredOutput as (...a: unknown[]) => Invokable).apply(m, args);
          const own = structure(target);
          return {
            invoke: (input: unknown, callOptions?: unknown) =>
              run(
                () => own.invoke(input, callOptions),
                (fb) => structure(fb).invoke(input, callOptions)
              ),
          };
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}
