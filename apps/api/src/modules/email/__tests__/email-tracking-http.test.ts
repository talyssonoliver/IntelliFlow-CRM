import { describe, expect, it, vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';

const db = vi.hoisted(() => ({ updateMany: vi.fn(async () => ({ count: 1 })) }));
vi.mock('@intelliflow/db', () => ({ prisma: { emailRecord: { updateMany: db.updateMany } } }));

import { handleEmailTracking } from '../email-tracking-http';
import { trackingSignature } from '../email-tracking';

const RECORD = 'rec' + 'ord1234567890abcdefgh';

function res() {
  const out = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
  } as {
    statusCode: number;
    headers: Record<string, string>;
    body: unknown;
    setHeader: (n: string, v: string) => void;
    end: (b?: unknown) => void;
  };
  out.setHeader = (n, v) => {
    out.headers[n] = v;
  };
  out.end = (b) => {
    out.body = b;
  };
  return out;
}

describe('handleEmailTracking', () => {
  it('leaves every other address to the rest of the server', async () => {
    const r = res();
    const handled = await handleEmailTracking(
      { url: '/trpc/x', method: 'GET' } as IncomingMessage,
      r as unknown as ServerResponse,
      '/trpc/x',
      'http://localhost'
    );
    expect(handled).toBe(false);
    expect(r.statusCode).toBe(0);
    expect(db.updateMany).not.toHaveBeenCalled();
  });

  it('records a signed open through the database client and answers the pixel', async () => {
    const path = `/t/o/${RECORD}/${trackingSignature('o', RECORD)}.gif`;
    const r = res();
    const handled = await handleEmailTracking(
      { url: path, method: 'GET' } as IncomingMessage,
      r as unknown as ServerResponse,
      path,
      'http://localhost'
    );
    expect(handled).toBe(true);
    expect(r.statusCode).toBe(200);
    expect(db.updateMany).toHaveBeenCalledWith({
      where: { id: RECORD },
      data: { openCount: { increment: 1 } },
    });
  });
});
