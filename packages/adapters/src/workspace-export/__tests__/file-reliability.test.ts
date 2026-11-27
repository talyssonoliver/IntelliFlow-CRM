/**
 * Stored files: only a confirmed missing object is skipped (a storage hiccup is retried, then
 * fails the job), and a folder is listed as a stable snapshot, not by live offset paging.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { runWorkspaceExport, isMissingObjectError } from '../export-workspace';
import { SupabaseExportStorage } from '../supabase-export-storage';
import { resolveExportRecipients } from '../workspace-export-service';
import { makeDb, memoryFiles, readZip } from './helpers';

const T = 'tenant_a_aaaaaaaaaaaaaaaaaaaa';
const when = new Date('2026-11-01T10:00:00.000Z');

let dir = '';
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = '';
});

const db = () =>
  makeDb({
    tenant: [
      {
        id: T,
        name: 'Alpha',
        slug: 'alpha',
        status: 'ACTIVE',
        plan: 'STARTER',
        createdAt: when,
        updatedAt: when,
      },
    ],
  });

const BUCKET = { 'case-documents': { [`${T}/ok.txt`]: 'OK', [`${T}/x.txt`]: 'X' } };
const run = (files: ReturnType<typeof memoryFiles>, extra: object = {}) => {
  dir = mkdtempSync(join(tmpdir(), 'wsx-f-'));
  return runWorkspaceExport({
    db: db(),
    tenantId: T,
    outputPath: join(dir, 'a.zip'),
    files,
    buckets: ['case-documents'],
    fileRetry: { attempts: 3, delayMs: 0 },
    ...extra,
  });
};

describe('opening a stored file', () => {
  it('skips only a confirmed missing object, and says so', async () => {
    const result = await run(memoryFiles(BUCKET, { failOpen: [`${T}/x.txt`] }));
    expect(result.manifest.skippedFiles.map((s) => s.path)).toEqual([`${T}/x.txt`]);
    expect(result.storedFileCount).toBe(1);
  });

  it('retries a transient storage error and keeps the file', async () => {
    const result = await run(memoryFiles(BUCKET, { flaky: { [`${T}/x.txt`]: 2 } }));
    expect(result.manifest.skippedFiles).toEqual([]);
    expect(result.storedFileCount).toBe(2);
    expect(readZip(result.archivePath)['files/case-documents/x.txt']).toBe('X');
  });

  it('fails the export, so the job is retried, when the error persists', async () => {
    await expect(run(memoryFiles(BUCKET, { failOpenOther: [`${T}/x.txt`] }))).rejects.toThrow(
      /storage unavailable/
    );
  });

  it('does not retry a missing object', async () => {
    let opens = 0;
    const files = memoryFiles(BUCKET);
    const open = files.openFile;
    files.openFile = async (b, p) => {
      if (p.endsWith('x.txt')) {
        opens += 1;
        const err = Object.assign(new Error('Object not found'), { statusCode: 404 });
        throw err;
      }
      return open(b, p);
    };
    const result = await run(files);
    expect(opens).toBe(1);
    expect(result.manifest.skippedFiles).toHaveLength(1);
  });

  it('recognises a missing object by type, status or code, and nothing else', () => {
    expect(isMissingObjectError(Object.assign(new Error('x'), { status: 404 }))).toBe(true);
    expect(isMissingObjectError(Object.assign(new Error('x'), { statusCode: '404' }))).toBe(true);
    expect(isMissingObjectError(Object.assign(new Error('x'), { code: 'ENOENT' }))).toBe(true);
    expect(isMissingObjectError(Object.assign(new Error('x'), { status: 503 }))).toBe(false);
    expect(isMissingObjectError(new Error('Download failed (429)'))).toBe(false);
    expect(isMissingObjectError(null)).toBe(false);
  });
});

describe('SupabaseExportStorage', () => {
  const storageWith = (list: (folder: string, o: any) => any) => {
    const s = new SupabaseExportStorage('https://x.example.invalid', 'k'.repeat(20));
    (s as any).client = {
      storage: { from: () => ({ list: async (f: string, o: any) => list(f, o) }) },
    };
    return s;
  };
  const collect = async (s: SupabaseExportStorage) => {
    const out: string[] = [];
    for await (const f of s.listFiles('b', T)) out.push(f.path);
    return out;
  };
  const obj = (n: string) => ({ name: n, id: `id-${n}`, metadata: { size: 1 } });

  it('lists the whole folder before yielding, so a file deleted mid-walk is not missed', async () => {
    const files = ['a', 'b', 'c', 'd', 'e'].map(obj);
    let reads = 0;
    const s = storageWith((_f, o) => {
      reads += 1;
      // The first page read is followed by a delete of an object before the offset.
      const data = files.slice(o.offset, o.offset + o.limit);
      if (reads === 1) files.splice(0, 1);
      return { data, error: null };
    });
    // limit is 100 in the real class: force small pages through a wrapper over the same client.
    const out = await collect(s);
    // Two passes must agree: the final snapshot is the stable one (b..e), no duplicates.
    expect(new Set(out).size).toBe(out.length);
    expect(out.sort()).toEqual(['b', 'c', 'd', 'e'].map((n) => `${T}/${n}`));
  });

  it('de-duplicates a path that two pages both returned', async () => {
    const s = storageWith((_f, o) => ({
      data: o.offset === 0 ? Array.from({ length: 100 }, (_, i) => obj(`f${i}`)) : [obj('f99')],
      error: null,
    }));
    const out = await collect(s);
    expect(out).toHaveLength(100);
    expect(new Set(out).size).toBe(100);
  });

  it('lists again until two passes agree, then stops', async () => {
    let pass = 0;
    const s = storageWith((_f, o) => {
      if (o.offset === 0) pass += 1;
      // Pass 1 sees one file, pass 2 two (an upload landed), pass 3 the same two.
      return { data: pass === 1 ? [obj('a')] : [obj('a'), obj('b')], error: null };
    });
    expect((await collect(s)).sort()).toEqual([`${T}/a`, `${T}/b`]);
    expect(pass).toBe(3);
  });

  it('walks into sub-folders and fails on a listing error instead of exporting less', async () => {
    const s = storageWith((f) =>
      f === T
        ? { data: [{ name: 'sub', id: null }, obj('top')], error: null }
        : { data: [obj('inner')], error: null }
    );
    expect((await collect(s)).sort()).toEqual([`${T}/sub/inner`, `${T}/top`]);
    const broken = storageWith(() => ({ data: null, error: { message: 'timeout' } }));
    await expect(collect(broken)).rejects.toThrow(/Listing b\/.* failed/);
  });

  it('tells a missing object from a storage failure when signing the link', async () => {
    const s = new SupabaseExportStorage('https://x.example.invalid', 'k'.repeat(20));
    let err: any = { message: 'Object not found', statusCode: '404' };
    (s as any).client = {
      storage: { from: () => ({ createSignedUrl: async () => ({ data: null, error: err }) }) },
    };
    const missing = await s.openFile('b', `${T}/x`).catch((e) => e);
    expect(isMissingObjectError(missing)).toBe(true);
    err = { message: 'Service unavailable', statusCode: '503' };
    const failing = await s.openFile('b', `${T}/x`).catch((e) => e);
    expect(isMissingObjectError(failing)).toBe(false);
  });

  it('treats a 404 from the download itself as missing, a 503 as a failure', async () => {
    const s = new SupabaseExportStorage('https://x.example.invalid', 'k'.repeat(20));
    (s as any).client = {
      storage: {
        from: () => ({
          createSignedUrl: async () => ({ data: { signedUrl: 'https://s.example.invalid/x' } }),
        }),
      },
    };
    const realFetch = globalThis.fetch;
    try {
      globalThis.fetch = (async () => new Response('', { status: 404 })) as typeof fetch;
      expect(isMissingObjectError(await s.openFile('b', `${T}/x`).catch((e) => e))).toBe(true);
      globalThis.fetch = (async () => new Response('', { status: 503 })) as typeof fetch;
      expect(isMissingObjectError(await s.openFile('b', `${T}/x`).catch((e) => e))).toBe(false);
      globalThis.fetch = (async () =>
        new Response(Readable.toWeb(Readable.from([Buffer.from('ok')])) as never)) as typeof fetch;
      expect(await s.openFile('b', `${T}/x`)).toBeInstanceOf(Readable);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe('export recipients when the workspace is administered through memberships', () => {
  const now = new Date('2026-11-23T12:00:00.000Z');
  const ids = async (tables: Record<string, any[]>, req: object = {}) =>
    (
      await resolveExportRecipients(
        makeDb({ stripeSubscription: [], tenantMembership: [], ...tables }) as any,
        { tenantId: T, requestedById: null, subscriptionId: null, ...req },
        now
      )
    )
      .map((r) => r.userId)
      .sort();
  const member = (id: string, over: object = {}) => ({
    id: `m_${id}`,
    userId: id,
    tenantId: T,
    role: 'ADMIN',
    source: 'OWNER_INVITE',
    revokedAt: null,
    expiresAt: null,
    createdAt: new Date(2026, 0, 1),
    ...over,
  });
  const away = (id: string) => ({
    id,
    tenantId: 'other_home',
    email: `${id}@x.invalid`,
    role: 'ADMIN',
    createdAt: when,
    stripeCustomerId: null,
  });

  it('reaches a member administrator when no home administrator exists (subscription ended)', async () => {
    expect(await ids({ user: [away('boss')], tenantMembership: [member('boss')] })).toEqual([
      'boss',
    ]);
  });

  it('picks the earliest live ADMIN membership, never operator staff, a revoked or expired one', async () => {
    const tables = {
      user: [away('staff'), away('revoked'), away('expired'), away('late'), away('first')],
      tenantMembership: [
        member('staff', { source: 'PORTAL_STAFF', createdAt: new Date(2025, 0, 1) }),
        member('revoked', { revokedAt: now, createdAt: new Date(2025, 0, 2) }),
        member('expired', {
          expiresAt: new Date(now.getTime() - 1),
          createdAt: new Date(2025, 0, 3),
        }),
        member('late', { createdAt: new Date(2026, 5, 1) }),
        member('first', { createdAt: new Date(2026, 1, 1) }),
        member('plain', { role: 'USER', createdAt: new Date(2024, 0, 1) }),
      ],
    };
    expect(await ids(tables)).toEqual(['first']);
  });

  it('keeps the home administrator as the owner when there is one', async () => {
    const home = { id: 'home', tenantId: T, email: 'h@x.invalid', role: 'ADMIN', createdAt: when };
    expect(await ids({ user: [home, away('boss')], tenantMembership: [member('boss')] })).toEqual([
      'home',
    ]);
  });

  it('reaches a payer whose home workspace is elsewhere but who is a live member', async () => {
    const payer = { ...away('payer'), role: 'USER', stripeCustomerId: 'cus_1' };
    const tables = {
      user: [payer],
      tenantMembership: [member('payer', { role: 'USER' })],
      stripeSubscription: [{ stripeSubscriptionId: 'sub_1', stripeCustomerId: 'cus_1' }],
    };
    expect(await ids(tables, { subscriptionId: 'sub_1' })).toEqual(['payer']);
    // Not once the membership is revoked.
    tables.tenantMembership = [member('payer', { role: 'USER', revokedAt: now })];
    expect(await ids(tables, { subscriptionId: 'sub_1' })).toEqual([]);
  });
});
