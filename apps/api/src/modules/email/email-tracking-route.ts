/**
 * The public side of open and click tracking (register row 41): the pixel `GET /t/o/<record>/<signature>.gif`
 * and the redirect `GET /t/c/<record>/<signature>?u=<link>`. Both are public (a mail reader calls them) and
 * authenticated by the signature, which `email-tracking.ts` put in the address when the mail was sent.
 *
 * A bad signature records nothing. The pixel still answers with the image (no oracle for guessing); the
 * redirect answers 400 and never redirects (so it cannot be used to bounce people to another site).
 * A failed write never breaks the answer: the reader still gets its image or its link.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { isValidSignature, type TrackingKind } from './email-tracking';

/** 1x1 transparent GIF. */
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

export interface TrackingMatch {
  kind: TrackingKind;
  recordId: string;
  signature: string;
}

export interface TrackingStore {
  recordOpen(recordId: string, at: Date): Promise<void>;
  recordClick(recordId: string, at: Date): Promise<void>;
}

const ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

function isRecordId(value: string): boolean {
  return (
    value.length >= 20 &&
    value.length <= 40 &&
    [...value].every((char) => ID_CHARS.includes(char.toLowerCase()))
  );
}

function isSignature(value: string): boolean {
  return value.length === 32 && [...value].every((char) => '0123456789abcdef'.includes(char));
}

/** `/t/o/<record>/<signature>.gif` or `/t/c/<record>/<signature>` (also under `/api`), else null. */
export function matchTrackingPath(pathname: string): TrackingMatch | null {
  const path = pathname.startsWith('/api/t/') ? pathname.slice(4) : pathname;
  const parts = path.split('/');
  if (parts.length !== 5 || parts[0] !== '' || parts[1] !== 't') return null;
  const kind = parts[2];
  if (kind !== 'o' && kind !== 'c') return null;
  const recordId = parts[3] ?? '';
  let signature = parts[4] ?? '';
  if (kind === 'o') {
    if (!signature.endsWith('.gif')) return null;
    signature = signature.slice(0, -4);
  }
  if (!isRecordId(recordId) || !isSignature(signature)) return null;
  return { kind, recordId, signature };
}

function sendPixel(res: ServerResponse, headOnly: boolean): void {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Content-Length', String(PIXEL.length));
  // Every open must reach us: nothing may cache the image.
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.end(headOnly ? undefined : PIXEL);
}

function parseTarget(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

async function safely(label: string, write: Promise<void>): Promise<void> {
  try {
    await write;
  } catch (error) {
    console.error(`[email-tracking] ${label} not recorded`, {
      reason: error instanceof Error ? error.message : 'unknown',
    });
  }
}

export async function handleEmailTrackingRoute(
  req: Pick<IncomingMessage, 'method'>,
  res: ServerResponse,
  match: TrackingMatch,
  search: URLSearchParams,
  store: TrackingStore,
  now: () => Date = () => new Date()
): Promise<void> {
  const method = req.method?.toUpperCase() ?? 'GET';
  if (method !== 'GET' && method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, HEAD');
    res.end();
    return;
  }
  const headOnly = method === 'HEAD';

  if (match.kind === 'o') {
    // A HEAD probe (a link checker) is not an open.
    if (!headOnly && isValidSignature('o', match.recordId, match.signature)) {
      await safely('open', store.recordOpen(match.recordId, now()));
    }
    sendPixel(res, headOnly);
    return;
  }

  const target = parseTarget(search.get('u'));
  if (!target || !isValidSignature('c', match.recordId, match.signature, target)) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('This link is not valid.');
    return;
  }
  if (!headOnly) await safely('click', store.recordClick(match.recordId, now()));
  res.statusCode = 302;
  res.setHeader('Location', target);
  res.setHeader('Cache-Control', 'no-store');
  res.end();
}

interface TrackingDb {
  emailRecord: {
    updateMany(args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }): Promise<unknown>;
  };
}

/** Writes to the email record by its id (the signature already proved the caller held the mail). */
export function createTrackingStore(db: TrackingDb): TrackingStore {
  const mark = async (recordId: string, at: Date, count: 'openCount' | 'clickCount') => {
    // First open: openedAt is set once, only where it is still empty.
    await db.emailRecord.updateMany({
      where: { id: recordId, openedAt: null },
      data: { openedAt: at },
    });
    await db.emailRecord.updateMany({
      where: { id: recordId },
      data: { [count]: { increment: 1 } },
    });
  };
  return {
    recordOpen: (recordId, at) => mark(recordId, at, 'openCount'),
    async recordClick(recordId, at) {
      // A click proves the mail was opened too.
      await mark(recordId, at, 'clickCount');
      await db.emailRecord.updateMany({
        where: { id: recordId, clickedAt: null },
        data: { clickedAt: at },
      });
    },
  };
}
