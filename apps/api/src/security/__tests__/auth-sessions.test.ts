/**
 * Guard paths of the auth.sessions helpers: anything that is not a UUID never reaches the
 * database, and the current session is never deleted.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  endAuthSession,
  endOtherAuthSessions,
  isAuthSessionAlive,
  isUuid,
  listAuthSessions,
} from '../auth-sessions';

const USER = '11111111-1111-4111-8111-111111111111';
const CURRENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const db = { $queryRaw: vi.fn(), $executeRaw: vi.fn() };

beforeEach(() => {
  db.$queryRaw.mockResolvedValue([]);
  db.$executeRaw.mockResolvedValue(0);
});

describe('isUuid', () => {
  it.each([
    [CURRENT, true],
    ['AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA', true],
    ['not-a-uuid', false],
    ['', false],
    [null, false],
    [undefined, false],
  ])('%s -> %s', (value, expected) => {
    expect(isUuid(value as string | null | undefined)).toBe(expected);
  });
});

describe('guards', () => {
  it('isAuthSessionAlive: a non-UUID user or session is not alive and is not queried', async () => {
    await expect(isAuthSessionAlive(db as never, 'user-1', CURRENT)).resolves.toBe(false);
    await expect(isAuthSessionAlive(db as never, USER, 'session-1')).resolves.toBe(false);
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it('listAuthSessions: a non-UUID user lists nothing', async () => {
    await expect(listAuthSessions(db as never, 'user-1', CURRENT)).resolves.toEqual([]);
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it('listAuthSessions: reads display columns only, with refreshed_at as UTC and ip as text', async () => {
    await listAuthSessions(db as never, USER, null);
    const [strings] = db.$queryRaw.mock.calls[0] as [TemplateStringsArray];
    const sql = strings.join('?');
    expect(sql).toContain("refreshed_at AT TIME ZONE 'UTC'");
    expect(sql).toContain('host(ip)');
    expect(sql).not.toMatch(/token|hmac|SELECT \*/i);
  });

  it('listAuthSessions: last activity is the latest of created, updated and refreshed', async () => {
    const created = new Date('2026-11-01T00:00:00Z');
    const refreshed = new Date('2026-11-05T00:00:00Z');
    db.$queryRaw.mockResolvedValue([
      {
        id: OTHER,
        created_at: created,
        updated_at: null,
        refreshed_at: refreshed,
        user_agent: null,
        ip: null,
        not_after: null,
      },
    ]);
    const [session] = await listAuthSessions(db as never, USER, null);
    expect(session).toMatchObject({ id: OTHER, lastActiveAt: refreshed, isCurrent: false });
  });

  it('endAuthSession: the current session is never deleted', async () => {
    await expect(endAuthSession(db as never, USER, CURRENT, CURRENT)).resolves.toBe('CURRENT');
    expect(db.$executeRaw).not.toHaveBeenCalled();
  });

  it('endAuthSession: an upper-case spelling of the current session id is still the current one', async () => {
    await expect(endAuthSession(db as never, USER, CURRENT.toUpperCase(), CURRENT)).resolves.toBe(
      'CURRENT'
    );
    await expect(endAuthSession(db as never, USER, CURRENT, CURRENT.toUpperCase())).resolves.toBe(
      'CURRENT'
    );
    expect(db.$executeRaw).not.toHaveBeenCalled();
  });

  it('endAuthSession: the DELETE itself excludes the current session', async () => {
    db.$executeRaw.mockResolvedValue(1);
    await expect(endAuthSession(db as never, USER, OTHER, CURRENT)).resolves.toBe('ENDED');
    const [strings, ...values] = db.$executeRaw.mock.calls[0] as [
      TemplateStringsArray,
      ...unknown[],
    ];
    expect(strings.join('?')).toContain('id <> ?::uuid');
    expect(values).toEqual([OTHER, USER, CURRENT]);
  });

  it('endAuthSession: a non-UUID id is not found and is not queried', async () => {
    await expect(endAuthSession(db as never, USER, 'session-1', CURRENT)).resolves.toBe(
      'NOT_FOUND'
    );
    await expect(endAuthSession(db as never, 'user-1', OTHER, CURRENT)).resolves.toBe('NOT_FOUND');
    expect(db.$executeRaw).not.toHaveBeenCalled();
  });

  it('endOtherAuthSessions: without a current UUID session nothing is deleted', async () => {
    await expect(endOtherAuthSessions(db as never, USER, null)).resolves.toBe(0);
    await expect(endOtherAuthSessions(db as never, USER, 'session-1')).resolves.toBe(0);
    await expect(endOtherAuthSessions(db as never, 'user-1', CURRENT)).resolves.toBe(0);
    expect(db.$executeRaw).not.toHaveBeenCalled();
  });
});
