import { describe, expect, it, vi } from 'vitest';
import type { ServerResponse } from 'node:http';
import { trackingSignature } from '../email-tracking';
import {
  createTrackingStore,
  handleEmailTrackingRoute,
  matchTrackingPath,
  type TrackingStore,
} from '../email-tracking-route';

const RECORD = 'rec' + 'ord1234567890abcdefgh';
const AT = new Date('2026-11-20T10:00:00.000Z');
const OPEN_SIG = trackingSignature('o', RECORD);
const LINK = 'https://shop.example.invalid/a?x=1';
const CLICK_SIG = trackingSignature('c', RECORD, LINK);

function fakeRes() {
  const res = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
    end(body?: unknown) {
      this.body = body;
    },
  };
  return res as typeof res & ServerResponse;
}

function fakeStore(): TrackingStore & {
  recordOpen: ReturnType<typeof vi.fn>;
  recordClick: ReturnType<typeof vi.fn>;
} {
  return { recordOpen: vi.fn(async () => undefined), recordClick: vi.fn(async () => undefined) };
}

describe('matchTrackingPath', () => {
  it('reads the pixel and the redirect addresses, also under /api', () => {
    expect(matchTrackingPath(`/t/o/${RECORD}/${OPEN_SIG}.gif`)).toEqual({
      kind: 'o',
      recordId: RECORD,
      signature: OPEN_SIG,
    });
    expect(matchTrackingPath(`/api/t/c/${RECORD}/${CLICK_SIG}`)).toEqual({
      kind: 'c',
      recordId: RECORD,
      signature: CLICK_SIG,
    });
  });

  it('refuses anything else', () => {
    for (const path of [
      '/t/o/short/' + OPEN_SIG + '.gif',
      `/t/o/${RECORD}/${OPEN_SIG}`,
      `/t/c/${RECORD}/${CLICK_SIG}.gif`.replace('.gif', '/extra'),
      `/t/x/${RECORD}/${OPEN_SIG}.gif`,
      `/t/o/${RECORD}/NOTHEX${OPEN_SIG.slice(6)}.gif`,
      `/t/o/${RECORD.toUpperCase()}!/${OPEN_SIG}.gif`,
      '/trpc/x',
      '/',
    ]) {
      expect(matchTrackingPath(path)).toBeNull();
    }
  });
});

describe('handleEmailTrackingRoute', () => {
  const open = { kind: 'o' as const, recordId: RECORD, signature: OPEN_SIG };
  const click = { kind: 'c' as const, recordId: RECORD, signature: CLICK_SIG };

  it('records an open and answers the pixel, uncacheable', async () => {
    const store = fakeStore();
    const res = fakeRes();
    await handleEmailTrackingRoute(
      { method: 'GET' },
      res,
      open,
      new URLSearchParams(),
      store,
      () => AT
    );
    expect(store.recordOpen).toHaveBeenCalledWith(RECORD, AT);
    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toBe('image/gif');
    expect(res.headers['Cache-Control']).toContain('no-store');
    expect((res.body as Buffer).subarray(0, 3).toString()).toBe('GIF');
  });

  it('answers the pixel but records nothing for a wrong signature or a HEAD request', async () => {
    const store = fakeStore();
    const bad = fakeRes();
    await handleEmailTrackingRoute(
      { method: 'GET' },
      bad,
      { ...open, signature: 'a'.repeat(32) },
      new URLSearchParams(),
      store
    );
    const head = fakeRes();
    await handleEmailTrackingRoute({ method: 'HEAD' }, head, open, new URLSearchParams(), store);
    expect(bad.statusCode).toBe(200);
    expect(head.statusCode).toBe(200);
    expect(head.body).toBeUndefined();
    expect(store.recordOpen).not.toHaveBeenCalled();
  });

  it('still answers the pixel when the write fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const store = fakeStore();
    store.recordOpen.mockRejectedValue(new Error('db down'));
    const res = fakeRes();
    await handleEmailTrackingRoute({ method: 'GET' }, res, open, new URLSearchParams(), store);
    expect(res.statusCode).toBe(200);
    log.mockRestore();
  });

  it('records a click and redirects to the signed link', async () => {
    const store = fakeStore();
    const res = fakeRes();
    await handleEmailTrackingRoute(
      { method: 'GET' },
      res,
      click,
      new URLSearchParams({ u: LINK }),
      store,
      () => AT
    );
    expect(store.recordClick).toHaveBeenCalledWith(RECORD, AT);
    expect(res.statusCode).toBe(302);
    expect(res.headers.Location).toBe(LINK);
  });

  it('never redirects to a link the signature does not cover, or a non-http link', async () => {
    const store = fakeStore();
    for (const u of ['https://evil.example.invalid/', 'javascript:alert(1)', '', 'not a url']) {
      const res = fakeRes();
      await handleEmailTrackingRoute(
        { method: 'GET' },
        res,
        click,
        new URLSearchParams({ u }),
        store
      );
      expect(res.statusCode).toBe(400);
      expect(res.headers.Location).toBeUndefined();
    }
    const missing = fakeRes();
    await handleEmailTrackingRoute({ method: 'GET' }, missing, click, new URLSearchParams(), store);
    expect(missing.statusCode).toBe(400);
    expect(store.recordClick).not.toHaveBeenCalled();
  });

  it('still redirects when the write fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const store = fakeStore();
    store.recordClick.mockRejectedValue(new Error('db down'));
    const res = fakeRes();
    await handleEmailTrackingRoute(
      { method: 'GET' },
      res,
      click,
      new URLSearchParams({ u: LINK }),
      store
    );
    expect(res.statusCode).toBe(302);
    log.mockRestore();
  });

  it('refuses other methods', async () => {
    const res = fakeRes();
    await handleEmailTrackingRoute(
      { method: 'POST' },
      res,
      open,
      new URLSearchParams(),
      fakeStore()
    );
    expect(res.statusCode).toBe(405);
  });
});

describe('createTrackingStore', () => {
  function fakeDb() {
    const calls: Array<{ where: Record<string, unknown>; data: Record<string, unknown> }> = [];
    return {
      calls,
      db: {
        emailRecord: {
          updateMany: vi.fn(async (a: never) => {
            calls.push(a);
            return { count: 1 };
          }),
        },
      },
    };
  }

  it('sets openedAt once and counts the open, by record id', async () => {
    const { db, calls } = fakeDb();
    await createTrackingStore(db as never).recordOpen(RECORD, AT);
    expect(calls).toEqual([
      { where: { id: RECORD, openedAt: null }, data: { openedAt: AT } },
      { where: { id: RECORD }, data: { openCount: { increment: 1 } } },
    ]);
  });

  it('counts a click, and a click also proves the open', async () => {
    const { db, calls } = fakeDb();
    await createTrackingStore(db as never).recordClick(RECORD, AT);
    expect(calls).toEqual([
      { where: { id: RECORD, openedAt: null }, data: { openedAt: AT } },
      { where: { id: RECORD }, data: { clickCount: { increment: 1 } } },
      { where: { id: RECORD, clickedAt: null }, data: { clickedAt: AT } },
    ]);
  });
});
