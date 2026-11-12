import { describe, it, expect, vi } from 'vitest';
import { checkAiAgents, checkApi, checkSignIn, runServiceChecks } from '../service-checks';

const API = 'https://api.example.invalid/';
const SUPA = 'https://auth.example.invalid';
const KEY = 'anon-placeholder';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('checkApi', () => {
  it('is up when /health/ready answers 200, and times it', async () => {
    const fetchFn = vi.fn(async () => json({ ready: true }));
    const result = await checkApi(fetchFn, API);
    expect(result).toMatchObject({ id: 'api', state: 'up' });
    expect(typeof result.ms).toBe('number');
    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.example.invalid/health/ready',
      expect.objectContaining({ cache: 'no-store' })
    );
  });

  it('is degraded when the API answers but is not ready', async () => {
    const result = await checkApi(async () => json({ ready: false }, 503), API);
    expect(result).toMatchObject({ state: 'degraded', note: 'Answering, but not ready' });
  });

  it('is down when the request fails', async () => {
    const result = await checkApi(async () => Promise.reject(new Error('x')), API);
    expect(result.state).toBe('down');
    expect(result.ms).toBeUndefined();
  });

  it('is not checked without an address', async () => {
    const fetchFn = vi.fn();
    expect((await checkApi(fetchFn, undefined)).state).toBe('not_checked');
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('checkAiAgents', () => {
  const detailed = (consumers?: Record<string, number>) =>
    json({ checks: consumers ? { queues: { status: 'ok', consumers } } : {} });

  it('is up when every AI queue has a worker; other queues do not count', async () => {
    const result = await checkAiAgents(
      async () => detailed({ 'ai-scoring': 1, 'ai-reply-draft': 2, 'email-notifications': 0 }),
      API
    );
    expect(result).toMatchObject({ id: 'ai', state: 'up' });
  });

  it('is degraded when some AI queues have no worker', async () => {
    const result = await checkAiAgents(
      async () => detailed({ 'ai-scoring': 1, 'ai-reply-draft': 0 }),
      API
    );
    expect(result).toMatchObject({
      state: 'degraded',
      note: '1 of 2 AI queues have no worker',
    });
  });

  it('is down when no AI queue has a worker', async () => {
    const result = await checkAiAgents(async () => detailed({ 'ai-scoring': 0 }), API);
    expect(result).toMatchObject({ state: 'down', note: 'No AI worker is running' });
  });

  it('is down when the API cannot reach the job queues', async () => {
    const fetchFn = async () => json({ checks: { queues: { status: 'error', error: 'x' } } });
    expect(await checkAiAgents(fetchFn, API)).toMatchObject({
      state: 'down',
      note: 'The API could not reach the AI job queues',
    });
  });

  it('is not checked when the API does not report queues or AI queues', async () => {
    expect((await checkAiAgents(async () => detailed(), API)).state).toBe('not_checked');
    expect(
      (await checkAiAgents(async () => detailed({ 'email-notifications': 1 }), API)).state
    ).toBe('not_checked');
    expect((await checkAiAgents(async () => new Response('not json'), API)).state).toBe(
      'not_checked'
    );
  });

  it('is down when the API cannot be reached, and not checked without an address', async () => {
    expect((await checkAiAgents(async () => json({}, 500), API)).state).toBe('down');
    expect((await checkAiAgents(async () => Promise.reject(new Error('x')), API)).state).toBe(
      'down'
    );
    expect((await checkAiAgents(vi.fn(), undefined)).state).toBe('not_checked');
  });
});

describe('checkSignIn', () => {
  it('calls the auth health endpoint with the public key', async () => {
    const fetchFn = vi.fn(async () => json({}));
    const result = await checkSignIn(fetchFn, SUPA, KEY);
    expect(result).toMatchObject({ id: 'auth', state: 'up' });
    expect(fetchFn).toHaveBeenCalledWith(
      'https://auth.example.invalid/auth/v1/health',
      expect.objectContaining({ headers: { apikey: KEY } })
    );
  });

  it('is down on an error status or a failed request', async () => {
    expect((await checkSignIn(async () => json({}, 503), SUPA, KEY)).state).toBe('down');
    expect((await checkSignIn(async () => Promise.reject(new Error('x')), SUPA, KEY)).state).toBe(
      'down'
    );
  });

  it('is not checked without an address or key', async () => {
    expect((await checkSignIn(vi.fn(), SUPA, undefined)).state).toBe('not_checked');
    expect((await checkSignIn(vi.fn(), undefined, KEY)).state).toBe('not_checked');
  });
});

describe('runServiceChecks', () => {
  it('returns the three services in order', async () => {
    const result = await runServiceChecks(async () => json({}), {});
    expect(result.map((s) => s.id)).toEqual(['api', 'ai', 'auth']);
  });
});
