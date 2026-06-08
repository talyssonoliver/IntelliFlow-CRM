import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Job } from 'bullmq';
import {
  processPortalSweepJob,
  PORTAL_SWEEP_QUEUE,
  PORTAL_SWEEP_CRON,
  type PortalSweepJobData,
} from '../portal-sweep.job';

const job = { id: 'job_1', data: {} } as unknown as Job<PortalSweepJobData>;

function mockResponse(status: number, body: string) {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: () => Promise.resolve(body),
  } as Response;
}

describe('processPortalSweepJob', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  const env = {
    url: process.env.LEANGENCY_PORTAL_INTERNAL_URL,
    secret: process.env.PORTAL_INTERNAL_SECRET,
  };

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    process.env.LEANGENCY_PORTAL_INTERNAL_URL = 'https://admin.leangency.com';
    process.env.PORTAL_INTERNAL_SECRET = 'sek_test';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (env.url === undefined) delete process.env.LEANGENCY_PORTAL_INTERNAL_URL;
    else process.env.LEANGENCY_PORTAL_INTERNAL_URL = env.url;
    if (env.secret === undefined) delete process.env.PORTAL_INTERNAL_SECRET;
    else process.env.PORTAL_INTERNAL_SECRET = env.secret;
  });

  it('exposes the expected queue name + cron', () => {
    expect(PORTAL_SWEEP_QUEUE).toBe('portal-sweep');
    expect(PORTAL_SWEEP_CRON).toBe('0 5 * * *');
  });

  it('POSTs to the portal sweep endpoint with Bearer auth and returns the counts', async () => {
    fetchSpy.mockResolvedValue(
      mockResponse(200, JSON.stringify({ evaluated: 4, paused: ['acme'] }))
    );
    const res = await processPortalSweepJob(job);

    expect(res).toEqual({ success: true, evaluated: 4, paused: ['acme'] });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://admin.leangency.com/api/internal/delivery/sweep');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer sek_test');
  });

  it('defaults evaluated/paused when the response omits them', async () => {
    fetchSpy.mockResolvedValue(mockResponse(200, '{}'));
    expect(await processPortalSweepJob(job)).toEqual({ success: true, evaluated: 0, paused: [] });
  });

  it('skips (no fetch) when the portal env is not configured', async () => {
    delete process.env.LEANGENCY_PORTAL_INTERNAL_URL;
    const res = await processPortalSweepJob(job);
    expect(res).toEqual({ success: true, evaluated: 0, paused: [], skipped: true });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('throws on a non-2xx response (so BullMQ retries)', async () => {
    fetchSpy.mockResolvedValue(mockResponse(500, 'boom'));
    await expect(processPortalSweepJob(job)).rejects.toThrow(/HTTP 500/);
  });

  it('trims a trailing slash on the base URL', async () => {
    process.env.LEANGENCY_PORTAL_INTERNAL_URL = 'https://admin.leangency.com/';
    fetchSpy.mockResolvedValue(mockResponse(200, '{}'));
    await processPortalSweepJob(job);
    expect(fetchSpy.mock.calls[0][0]).toBe(
      'https://admin.leangency.com/api/internal/delivery/sweep'
    );
  });
});
