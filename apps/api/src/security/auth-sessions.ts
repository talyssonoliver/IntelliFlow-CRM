/**
 * Supabase Auth sessions (`auth.sessions`) as the source of truth for which sign-ins are alive.
 *
 * An access token is a signed JWT, so verifying it proves only that it was issued and has not
 * expired. Whether its session has since ended (sign-out, a revoke from the sessions list, or a
 * password change ending the other sessions) lives in `auth.sessions`. The request path checks
 * that table once per session-cache miss (see `context.ts`), and this module is the only code that
 * reads or deletes its rows.
 *
 * Every query is parameterised and scoped to one user. Deleting a session row also removes its
 * refresh tokens (`auth.refresh_tokens.session_id` cascades), so the session cannot be renewed.
 */
import type { PrismaClient } from '@intelliflow/db';

type RawDb = Pick<PrismaClient, '$queryRaw' | '$executeRaw'>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when `value` is a UUID. Supabase user ids and session ids are UUIDs. */
export function isUuid(value: string | null | undefined): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** One sign-in of a user, as shown in the sessions list. */
export interface AuthSession {
  id: string;
  createdAt: Date;
  lastActiveAt: Date;
  userAgent: string | null;
  ipAddress: string | null;
  /** End of the session's lifetime when one is set, else null. */
  expiresAt: Date | null;
  isCurrent: boolean;
}

interface AuthSessionRow {
  id: string;
  created_at: Date;
  updated_at: Date | null;
  refreshed_at: Date | null;
  user_agent: string | null;
  ip: string | null;
  not_after: Date | null;
}

/**
 * Whether `sessionId` is a live session of `userId`. One indexed lookup (primary key).
 * Errors propagate: the caller decides what an unreadable table means (see `context.ts`).
 */
export async function isAuthSessionAlive(
  db: RawDb,
  userId: string,
  sessionId: string
): Promise<boolean> {
  if (!isUuid(userId) || !isUuid(sessionId)) return false;
  const rows = await db.$queryRaw<Array<{ alive: number }>>`
    SELECT 1 AS alive
    FROM auth.sessions
    WHERE id = ${sessionId}::uuid
      AND user_id = ${userId}::uuid
      AND (not_after IS NULL OR not_after > now())
    LIMIT 1`;
  return rows.length > 0;
}

/** The user's live sessions, most recently active first, with the current one marked. */
export async function listAuthSessions(
  db: RawDb,
  userId: string,
  currentSessionId: string | null | undefined
): Promise<AuthSession[]> {
  if (!isUuid(userId)) return [];
  const rows = await db.$queryRaw<AuthSessionRow[]>`
    SELECT id::text AS id, created_at, updated_at, refreshed_at, user_agent, host(ip) AS ip, not_after
    FROM auth.sessions
    WHERE user_id = ${userId}::uuid
      AND (not_after IS NULL OR not_after > now())`;
  return rows
    .map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      lastActiveAt: latest(row.created_at, row.updated_at, row.refreshed_at),
      userAgent: row.user_agent,
      ipAddress: row.ip,
      expiresAt: row.not_after,
      isCurrent: row.id === currentSessionId,
    }))
    .sort((a, b) => b.lastActiveAt.getTime() - a.lastActiveAt.getTime());
}

/** Outcome of ending one session. */
export type EndSessionResult = 'ENDED' | 'NOT_FOUND' | 'CURRENT';

/**
 * End one of the user's sessions. Never the session making the request: that one ends by
 * signing out. Another user's session id is reported as NOT_FOUND and left alone.
 */
export async function endAuthSession(
  db: RawDb,
  userId: string,
  sessionId: string,
  currentSessionId: string | null | undefined
): Promise<EndSessionResult> {
  if (sessionId === currentSessionId) return 'CURRENT';
  if (!isUuid(userId) || !isUuid(sessionId)) return 'NOT_FOUND';
  const deleted = await db.$executeRaw`
    DELETE FROM auth.sessions
    WHERE id = ${sessionId}::uuid
      AND user_id = ${userId}::uuid`;
  return deleted > 0 ? 'ENDED' : 'NOT_FOUND';
}

/**
 * End every session of the user except the current one. Returns how many ended. Without a
 * current session id nothing is deleted, so a request can never sign itself out this way.
 */
export async function endOtherAuthSessions(
  db: RawDb,
  userId: string,
  currentSessionId: string | null | undefined
): Promise<number> {
  if (!isUuid(userId) || !isUuid(currentSessionId)) return 0;
  return db.$executeRaw`
    DELETE FROM auth.sessions
    WHERE user_id = ${userId}::uuid
      AND id <> ${currentSessionId}::uuid`;
}

function latest(...dates: Array<Date | null>): Date {
  let max = 0;
  for (const d of dates) {
    if (d && d.getTime() > max) max = d.getTime();
  }
  return new Date(max);
}
