/**
 * Short-lived cache of Supabase users that Supabase itself has verified (egress audit 1126).
 *
 * `verifyToken` checks a JWT locally against the JWKS. When local verification cannot decide
 * (a key id the JWKS does not list yet, a symmetric signature, the JWKS unreachable) it asks
 * Supabase Auth (`auth.getUser(token)`), a network round trip that also makes GoTrue read
 * `auth.users`, `auth.sessions`, `auth.identities` and `auth.mfa_amr_claims`. On a stack that
 * signs with a symmetric key that happens on EVERY request.
 *
 * This keeps the answer for at most 60 seconds so a burst of requests with one token asks once.
 *
 * What makes it safe:
 *  - Only a user Supabase confirmed is stored. A refusal or an error is never cached.
 *  - The key is the SHA-256 of the token. The token itself is never held or logged.
 *  - An entry never outlives the token's own `exp`.
 *  - 60 seconds is a hard ceiling. A session revoked at Supabase stops working here within 60 s
 *    (the next check goes to Supabase, which refuses it); the request path also checks
 *    `auth.sessions` separately on every session-cache miss (see `context.ts`).
 *  - Entries are dropped at once, on this instance, by: sign-out (`deleteToken`), a password
 *    reset, and `invalidateUserSessions` (membership or role change, member removal, login grant
 *    claimed, session ended from the sessions list). See `security/session-cache.ts`.
 *  - A new token (refresh after a password or MFA change) has a new hash and so is never served
 *    an old entry.
 *  - An invalidation also covers a check that was already in flight: `set` takes the time the
 *    check STARTED and refuses to store a result for a user invalidated since, so a request that
 *    asked Supabase just before a sign-out cannot put the signed-out session back.
 *  - The cache keeps its own copy of the user and hands out copies, so no caller can edit what the
 *    next caller gets.
 *  - Bounded: at most 500 entries, oldest evicted first.
 *
 * Other API instances learn about a revocation within the 60 s ceiling, the same bound ADR-071
 * sets for the session caches.
 */
import { createHash } from 'node:crypto';
import type { User } from '@supabase/supabase-js';

export const VERIFIED_TOKEN_TTL_MS = 60_000;
export const VERIFIED_TOKEN_MAX_ENTRIES = 500;
/** Invalidation records kept (one per user, for at most one TTL). */
export const MAX_INVALIDATION_RECORDS = 1_000;

interface Entry {
  user: User;
  userId: string;
  expiresAt: number;
}

/** The `exp` claim of a JWT in ms, or null. The token was already verified, so decoding is safe. */
export function jwtExpiryMs(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      exp?: unknown;
    };
    return typeof claims.exp === 'number' && Number.isFinite(claims.exp) ? claims.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** The `sub` claim of a JWT, or null. Unverified decode: only used to drop cache entries, never to trust. */
export function jwtSubject(token: string): string | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      sub?: unknown;
    };
    return typeof claims.sub === 'string' && claims.sub ? claims.sub : null;
  } catch {
    return null;
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export class VerifiedTokenCache {
  private readonly entries = new Map<string, Entry>();
  private readonly keysByUser = new Map<string, Set<string>>();
  /** userId -> time of the last invalidation, kept for one TTL (older ones cannot matter). */
  private readonly invalidatedAt = new Map<string, number>();
  /** Newest invalidation time that was forgotten for lack of room; checks begun before it are refused. */
  private invalidationFloor = 0;

  constructor(
    private readonly ttlMs: number = VERIFIED_TOKEN_TTL_MS,
    private readonly maxEntries: number = VERIFIED_TOKEN_MAX_ENTRIES,
    // A function that reads the clock at call time (not Date.now itself), so a test clock works.
    private readonly now: () => number = () => Date.now()
  ) {}

  /** The cached user for this token, or null when absent, expired or past the token's exp. */
  get(token: string): User | null {
    const key = hashToken(token);
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (this.now() >= entry.expiresAt) {
      this.remove(key);
      return null;
    }
    return structuredClone(entry.user);
  }

  /**
   * Remember a user Supabase confirmed for this token. Never call it with a refusal.
   * `checkStartedAt` is when the check that produced `user` began. The 60 s are counted from
   * then, not from when the answer arrived: Supabase's answer is only known to be true as of the
   * moment it was asked, so a slow answer gets a shorter life (and one older than 60 s is not
   * stored). If the user was invalidated since the check began, the result is stale and is not
   * stored either.
   */
  set(token: string, user: User, checkStartedAt?: number): void {
    if (!user?.id) return;
    const now = this.now();
    if (checkStartedAt !== undefined) {
      if (checkStartedAt <= this.invalidationFloor) return;
      const invalidated = this.invalidatedAt.get(user.id);
      if (invalidated !== undefined && invalidated >= checkStartedAt) return;
    }
    // Never longer than 60 s from the START of the check, and never past the token's own expiry.
    const startedAt = checkStartedAt === undefined ? now : Math.min(checkStartedAt, now);
    let expiresAt = startedAt + Math.min(this.ttlMs, VERIFIED_TOKEN_TTL_MS);
    const tokenExp = jwtExpiryMs(token);
    if (tokenExp !== null) expiresAt = Math.min(expiresAt, tokenExp);
    if (expiresAt <= now) return;

    const key = hashToken(token);
    if (!this.entries.has(key) && this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.remove(oldest);
    }
    this.entries.set(key, { user: structuredClone(user), userId: user.id, expiresAt });
    let keys = this.keysByUser.get(user.id);
    if (!keys) {
      keys = new Set();
      this.keysByUser.set(user.id, keys);
    }
    keys.add(key);
  }

  /**
   * Sign-out and password reset: forget this token AND every other cached token of its user
   * (a global sign-out ends all of the user's sessions). Returns how many entries were dropped.
   */
  deleteToken(token: string): number {
    const key = hashToken(token);
    const entry = this.entries.get(key);
    // The token may not be cached here (a password-reset link token is never verified by this API,
    // and a sign-out token may have been verified on another instance): its subject still names
    // the user whose other tokens must go.
    const userId = entry?.userId ?? jwtSubject(token);
    if (!userId) return 0;
    return this.deleteUser(userId);
  }

  /** Drop every cached token of one user. Returns how many were removed. */
  deleteUser(userId: string): number {
    this.recordInvalidation(userId, this.now());
    const keys = this.keysByUser.get(userId);
    if (!keys) return 0;
    const count = keys.size;
    for (const key of keys) this.entries.delete(key);
    this.keysByUser.delete(userId);
    return count;
  }

  /**
   * Note that `userId` was invalidated at `now`, in bounded memory and constant time per call.
   *
   * The map is kept in time order (an update moves the user to the end), so expired records are
   * dropped from the front and stop at the first live one. If the map is still over capacity, the
   * oldest records are forgotten, and the newest forgotten time becomes a floor: any check that
   * began at or before it is refused by `set`. That keeps the guarantee (a check begun before an
   * invalidation never repopulates the cache) even for records that had to be forgotten, at the
   * cost of re-verifying a few more tokens. The subject of a sign-out token is read without
   * verifying it, so a caller can name any user here; the worst that does is force that user's
   * next request to ask Supabase again, which is what happens without the cache.
   */
  private recordInvalidation(userId: string, now: number): void {
    this.invalidatedAt.delete(userId);
    this.invalidatedAt.set(userId, now);
    for (const [id, at] of this.invalidatedAt) {
      if (now - at < VERIFIED_TOKEN_TTL_MS) break;
      this.invalidatedAt.delete(id);
    }
    while (this.invalidatedAt.size > MAX_INVALIDATION_RECORDS) {
      const oldest = this.invalidatedAt.entries().next().value;
      if (!oldest) break;
      this.invalidatedAt.delete(oldest[0]);
      this.invalidationFloor = Math.max(this.invalidationFloor, oldest[1]);
    }
  }

  clear(): void {
    this.entries.clear();
    this.keysByUser.clear();
    this.invalidatedAt.clear();
    this.invalidationFloor = 0;
  }

  get size(): number {
    return this.entries.size;
  }

  private remove(key: string): void {
    const entry = this.entries.get(key);
    this.entries.delete(key);
    if (!entry) return;
    const keys = this.keysByUser.get(entry.userId);
    if (!keys) return;
    keys.delete(key);
    if (keys.size === 0) this.keysByUser.delete(entry.userId);
  }
}

/** Process-wide instance used by `verifyToken`. */
export const verifiedTokenCache = new VerifiedTokenCache();
