import { describe, expect, it, vi } from 'vitest';
import {
  backfillEmailRich,
  main,
  type BackfillChange,
  type BackfillDb,
  type BackfillDeps,
  type BackfillRecord,
  type BackfillSource,
  type FetchResult,
  type MainDeps,
} from '../backfill-email-rich';

const TENANT = 'tenant-1';
const LOCAL = { host: 'localhost', local: true };
const REMOTE = { host: 'db.example.invalid', local: false };

function record(over: Partial<BackfillRecord> = {}): BackfillRecord {
  return {
    id: 'rec-1',
    tenantId: TENANT,
    provider: 'GMAIL',
    providerMessageId: 'msg-1',
    mailboxId: 'mbx-1',
    sentAt: null,
    createdAt: new Date('2026-11-10T10:00:00Z'),
    hasHtml: false,
    attachmentCount: 0,
    metadata: { source: 'outlook-sync', direction: 'inbound' },
    ...over,
  };
}

const deps: BackfillDeps = {
  sanitize: (html) => (html ? html.replace(/<script[\s\S]*?<\/script>/g, '') : null),
  attachmentRows: (emailId, tenantId, list) =>
    list.map((a) => ({ emailId, tenantId, fileName: a.fileName, fileUrl: '' })),
};

function fakeDb(records: BackfillRecord[]) {
  const applied: BackfillChange[] = [];
  const db: BackfillDb = {
    loadRecords: vi.fn(async () => records),
    apply: vi.fn(async (change) => {
      applied.push(change);
    }),
  };
  return { db, applied };
}

const source = (result: FetchResult | ((r: BackfillRecord) => FetchResult)): BackfillSource => ({
  fetch: vi.fn(async (r) => (typeof result === 'function' ? result(r) : result)),
});

const options = (over = {}) => ({
  tenantId: TENANT,
  limit: 100,
  apply: false,
  noProvider: false,
  target: LOCAL,
  ...over,
});

const PROVIDER_MAIL: FetchResult = {
  receivedAt: new Date('2026-11-09T08:30:00Z'),
  html: '<p>Hello</p><script>x()</script>',
  attachments: [
    {
      providerAttachmentId: '1',
      fileName: 'quote.pdf',
      fileType: 'application/pdf',
      fileSize: 10,
      contentId: null,
      isInline: false,
    },
  ],
};

describe('backfillEmailRich', () => {
  it('a dry run reads and reports but writes nothing', async () => {
    const { db, applied } = fakeDb([record()]);
    const result = await backfillEmailRich(db, source(PROVIDER_MAIL), deps, options());
    expect(applied).toEqual([]);
    expect(db.apply).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      scanned: 1,
      datesFromProvider: 1,
      htmlFilled: 1,
      attachmentRowsAdded: 1,
    });
    expect(result.lines.at(-1)).toContain('Dry run: nothing written');
  });

  it('--apply fills sentAt from the provider, the sanitised HTML and attachment metadata only', async () => {
    const { db, applied } = fakeDb([record()]);
    await backfillEmailRich(db, source(PROVIDER_MAIL), deps, options({ apply: true }));
    expect(applied).toEqual([
      {
        id: 'rec-1',
        tenantId: TENANT,
        sentAt: new Date('2026-11-09T08:30:00Z'),
        bodyHtml: '<p>Hello</p>',
        attachments: [{ emailId: 'rec-1', tenantId: TENANT, fileName: 'quote.pdf', fileUrl: '' }],
      },
    ]);
  });

  it('skips a record that is already complete, so a second run changes nothing', async () => {
    const { db } = fakeDb([record({ sentAt: new Date(), hasHtml: true, attachmentCount: 2 })]);
    const src = source(PROVIDER_MAIL);
    const result = await backfillEmailRich(db, src, deps, options({ apply: true }));
    expect(result.complete).toBe(1);
    expect(src.fetch).not.toHaveBeenCalled();
    expect(db.apply).not.toHaveBeenCalled();
  });

  it('keeps the stored sync date when the provider cannot give one (createdAt is that date)', async () => {
    const { db, applied } = fakeDb([
      record({ hasHtml: true, attachmentCount: 1 }),
      record({
        id: 'rec-2',
        hasHtml: true,
        attachmentCount: 1,
        metadata: { source: 'coa-import' },
      }),
    ]);
    const result = await backfillEmailRich(db, source('gone'), deps, options({ apply: true }));
    expect(applied).toEqual([
      { id: 'rec-1', tenantId: TENANT, sentAt: new Date('2026-11-10T10:00:00Z'), attachments: [] },
    ]);
    expect(result).toMatchObject({ datesFromRecord: 1, providerGone: 2 });
  });

  it('works offline with --no-provider (date fallback only, no provider asked)', async () => {
    const { db, applied } = fakeDb([record()]);
    const src = source(PROVIDER_MAIL);
    await backfillEmailRich(db, src, deps, options({ apply: true, noProvider: true }));
    expect(src.fetch).not.toHaveBeenCalled();
    expect(applied[0]).toMatchObject({ sentAt: new Date('2026-11-10T10:00:00Z') });
    expect(applied[0]?.bodyHtml).toBeUndefined();
  });

  it('recovers the original HTML of COA mail sent through Resend, and says when it cannot', async () => {
    const resend = (id: string, over = {}) =>
      record({
        id,
        provider: 'RESEND',
        providerMessageId: `re-${id}`,
        mailboxId: null,
        sentAt: new Date('2026-11-01T00:00:00Z'),
        metadata: { source: 'coa-import' },
        ...over,
      });
    const { db, applied } = fakeDb([resend('a'), resend('b'), resend('c')]);
    const answers: Record<string, FetchResult> = {
      a: { receivedAt: null, html: '<table><tr><td>designed</td></tr></table>', attachments: [] },
      b: 'gone',
      c: { receivedAt: null, html: null, attachments: [] },
    };
    const src = source((r) => answers[r.id] as FetchResult);
    const result = await backfillEmailRich(db, src, deps, options({ apply: true }));
    expect(applied).toHaveLength(1);
    expect(applied[0]).toMatchObject({
      id: 'a',
      bodyHtml: '<table><tr><td>designed</td></tr></table>',
    });
    expect(result).toMatchObject({ resendHtmlRecovered: 1, resendHtmlNotRecoverable: 2 });
    // Resend mail has no mailbox attachments to record.
    expect(applied[0]?.attachments).toEqual([]);
  });

  it('a failed provider read leaves that record alone and goes on', async () => {
    const { db, applied } = fakeDb([record(), record({ id: 'rec-2' })]);
    const src: BackfillSource = {
      fetch: vi
        .fn()
        .mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'AUTH_FAILED' }))
        .mockResolvedValueOnce(PROVIDER_MAIL),
    };
    const result = await backfillEmailRich(db, src, deps, options({ apply: true }));
    expect(result.failed).toBe(1);
    expect(applied.map((c) => c.id)).toEqual(['rec-2']);
    expect(result.lines.join('\n')).toContain('AUTH_FAILED');
  });

  it('refuses to write to a database that is not local', async () => {
    const { db } = fakeDb([record()]);
    await expect(
      backfillEmailRich(db, source(PROVIDER_MAIL), deps, options({ apply: true, target: REMOTE }))
    ).rejects.toThrow(/not a local database/);
    expect(db.loadRecords).not.toHaveBeenCalled();
    // A dry run against it is allowed: it only reads.
    await expect(
      backfillEmailRich(db, source(PROVIDER_MAIL), deps, options({ target: REMOTE }))
    ).resolves.toMatchObject({ scanned: 1 });
  });
});

describe('main', () => {
  function mainDeps(records: BackfillRecord[] = [record()]) {
    const { db, applied } = fakeDb(records);
    const lines: string[] = [];
    const errors: string[] = [];
    const created = { apply: undefined as boolean | undefined };
    const deps2: MainDeps = {
      createDb: vi.fn(async (_url, apply) => {
        created.apply = apply;
        return { ...db, close: async () => undefined };
      }),
      createSource: vi.fn(async () => source(PROVIDER_MAIL)),
      loadHelpers: async () => deps,
      log: (l) => lines.push(l),
      error: (l) => errors.push(l),
    };
    return { deps: deps2, lines, errors, applied, created };
  }
  const ENV = { DATABASE_URL: 'postgresql://localhost:5433/test_db' };

  it('is a dry run unless --apply is given', async () => {
    const m = mainDeps();
    expect(await main(['--tenant', TENANT], ENV, m.deps)).toBe(0);
    expect(m.applied).toEqual([]);
    expect(m.created.apply).toBe(false);
    expect(m.lines.at(-1)).toContain('Dry run');
  });

  it('--apply writes to a local database', async () => {
    const m = mainDeps();
    expect(await main(['--tenant', TENANT, '--apply'], ENV, m.deps)).toBe(0);
    expect(m.applied).toHaveLength(1);
  });

  it('--apply on a database that is not local exits 1 and writes nothing', async () => {
    const m = mainDeps();
    const code = await main(
      ['--tenant', TENANT, '--apply'],
      {
        DATABASE_URL: 'postgresql://db.example.invalid:5432/prod',
      },
      m.deps
    );
    expect(code).toBe(1);
    expect(m.applied).toEqual([]);
  });

  it('asks for a tenant and a database, and a sane limit', async () => {
    const m = mainDeps();
    expect(await main([], ENV, m.deps)).toBe(1);
    expect(await main(['--tenant', TENANT], {}, m.deps)).toBe(1);
    expect(await main(['--tenant', TENANT, '--limit', '0'], ENV, m.deps)).toBe(1);
    expect(m.errors.length).toBe(3);
  });

  it('--no-provider never builds a provider source', async () => {
    const m = mainDeps();
    await main(['--tenant', TENANT, '--no-provider'], ENV, m.deps);
    expect(m.deps.createSource).not.toHaveBeenCalled();
  });
});
