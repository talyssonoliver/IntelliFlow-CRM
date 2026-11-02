/**
 * The module-level Supabase clients serve every request in this process, so no
 * sign-in may leave a user session on them. Runs the real supabase-js clients with
 * fetch faked, so nothing leaves the machine.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createServiceAuthFlowClient,
  exchangeCodeForSession,
  signIn,
  signUp,
  supabase,
  supabaseAdmin,
} from '../supabase';

const SECRET = 'x'.repeat(12);

function sessionBody(userId: string) {
  return {
    access_token: `access-${userId}`,
    refresh_token: `refresh-${userId}`,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: {
      id: userId,
      email: `${userId}@mail.example.invalid`,
      aud: 'authenticated',
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-01-01T00:00:00.000Z',
    },
  };
}

/** Answers each auth call with a session for the user named in `current`. */
function stubAuthServer() {
  const server = { current: 'user-a', authHeaders: [] as Array<string | null> };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: unknown, init?: RequestInit) => {
      server.authHeaders.push(new Headers(init?.headers).get('Authorization'));
      return new Response(JSON.stringify(sessionBody(server.current)), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    })
  );
  return server;
}

async function expectSharedClientsSessionFree() {
  await expect(supabase.auth.getSession()).resolves.toMatchObject({ data: { session: null } });
  await expect(supabaseAdmin.auth.getSession()).resolves.toMatchObject({ data: { session: null } });
}

describe('module-level Supabase clients', () => {
  let server: ReturnType<typeof stubAuthServer>;

  beforeEach(() => {
    server = stubAuthServer();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('hold no session after two users sign in one after the other', async () => {
    const first = await signIn('user-a@mail.example.invalid', SECRET);
    await expectSharedClientsSessionFree();

    server.current = 'user-b';
    const second = await signIn('user-b@mail.example.invalid', SECRET);
    await expectSharedClientsSessionFree();

    expect(first.session?.user.id).toBe('user-a');
    expect(second.session?.user.id).toBe('user-b');
    expect(second.session?.refresh_token).toBe('refresh-user-b');
  });

  it('hold no session after a sign-up', async () => {
    const result = await signUp('user-a@mail.example.invalid', SECRET);

    expect(result.session?.user.id).toBe('user-a');
    await expectSharedClientsSessionFree();
  });

  it('hold no session after a code exchange', async () => {
    const result = await exchangeCodeForSession('code');

    expect(result.session?.user.id).toBe('user-a');
    await expectSharedClientsSessionFree();
  });

  it('hold no session after the service flows that can return one', async () => {
    const client = createServiceAuthFlowClient();
    await client.auth.verifyOtp({ token_hash: 'hash', type: 'email' });
    await createServiceAuthFlowClient().auth.signUp({
      email: 'user-b@mail.example.invalid',
      password: SECRET,
    });

    await expectSharedClientsSessionFree();
  });

  it('do not send a signed-in user token on a later call', async () => {
    await signIn('user-a@mail.example.invalid', SECRET);
    server.authHeaders.length = 0;

    await supabase.from('leads').select('id');
    await supabaseAdmin.from('leads').select('id');

    expect(server.authHeaders).toHaveLength(2);
    expect(server.authHeaders.join(' ')).not.toContain('access-user-a');
  });

  it('give each sign-in its own client, so one sign-in does not see another', async () => {
    await signIn('user-a@mail.example.invalid', SECRET);
    server.current = 'user-b';
    const fresh = createServiceAuthFlowClient();

    await expect(fresh.auth.getSession()).resolves.toMatchObject({ data: { session: null } });
  });
});

describe('API source', () => {
  const SRC = path.resolve(__dirname, '../..');
  const SESSION_CALLS =
    'signUp|signInWithPassword|signInWithOtp|signInWithOAuth|signInWithIdToken|verifyOtp|' +
    'exchangeCodeForSession|refreshSession|setSession|getSession';
  const FORBIDDEN = new RegExp(String.raw`\bsupabase(Admin)?\.auth\.(${SESSION_CALLS})\b`);

  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) return name === '__tests__' ? [] : sourceFiles(full);
      return /\.tsx?$/.test(name) && !name.endsWith('.test.ts') ? [full] : [];
    });
  }

  it('makes no session call on a module-level client', () => {
    const offenders = sourceFiles(SRC).flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((line, i) =>
          FORBIDDEN.test(line) ? [`${path.relative(SRC, file)}:${i + 1}: ${line.trim()}`] : []
        )
    );

    expect(offenders).toEqual([]);
  });

  it('would catch one', () => {
    expect(FORBIDDEN.test('await supabaseAdmin.auth.verifyOtp({')).toBe(true);
    expect(FORBIDDEN.test('await supabaseAdmin.auth.admin.signOut(id)')).toBe(false);
  });
});
