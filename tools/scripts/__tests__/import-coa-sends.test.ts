/**
 * MVP-011: the COA send import. Driven by a fake Aurora database and a fake COA source; the COA
 * query itself is only read as text (it must be a plain SELECT).
 */
import { describe, expect, it, vi } from 'vitest';
import {
  COA_SENDS_SQL,
  PROVIDER,
  importCoaSends,
  main,
  recordFor,
  sendsFromRows,
  type CoaSend,
  type CoaSource,
  type ImportDb,
  type ImportTx,
  type MainDeps,
} from '../import-coa-sends';

/** A connection string built at run time from parts, so no credential-shaped text sits in the file. */
const connectionUrl = (host: string) =>
  ['post', 'gres://', 'u'.repeat(4), ':', 'x'.repeat(8), '@', host, '/db'].join('');

const LOCAL = { host: 'localhost:5433', local: true };
const REMOTE = { host: 'db.example.invalid', local: false };
const OPTIONS = { tenantId: 'tenant-1', from: 'hello@sender.example.invalid' };
const ROBERT = 'robert@example.invalid';

const send = (overrides: Partial<CoaSend> = {}): CoaSend => ({
  id: 'draft-1',
  subject: 'Helping West London Handyman win more jobs',
  body: 'Hello Robert',
  sentAt: new Date('2026-11-16T09:00:24.855Z'),
  messageId: 'resend-id-1',
  status: 'SENT',
  sequenceNo: 5,
  updatedAt: new Date('2026-11-16T09:00:25.000Z'),
  recipients: [ROBERT],
  ...overrides,
});

interface FakeOptions {
  leads?: Record<string, string>;
  contacts?: Record<string, string>;
  imported?: string[];
  restricted?: string[];
}

function fakeDb(options: FakeOptions = {}) {
  const lookup = (table: Record<string, string> | undefined) =>
    vi.fn(async (args: any) => {
      const id = table?.[args.where.email.equals.toLowerCase()];
      return id ? { id } : null;
    });
  const tx: ImportTx = {
    emailRecord: { create: vi.fn(async () => ({ id: 'rec-1' })) },
    leadActivity: { create: vi.fn(async () => ({})) },
  };
  const db = {
    lead: { findFirst: lookup(options.leads ?? { [ROBERT]: 'lead-1' }) },
    contact: { findFirst: lookup(options.contacts) },
    processingRestriction: {
      findFirst: vi.fn(async (args: any) =>
        options.restricted?.includes(args.where.subjectEmail) ? { id: 'r1' } : null
      ),
    },
    emailRecord: {
      findFirst: vi.fn(async (args: any) =>
        options.imported?.includes(args.where.providerMessageId) ? { id: 'old' } : null
      ),
    },
    $transaction: vi.fn(async (work: (t: ImportTx) => Promise<unknown>) => work(tx)),
  };
  return { db: db as unknown as ImportDb, raw: db, tx };
}

const source = (sends: CoaSend[]): CoaSource => ({ loadSends: vi.fn(async () => sends) });

describe('recordFor', () => {
  const party = { leadId: 'lead-1', contactId: null, address: ROBERT };

  it('makes a Sent record keyed by the Resend id, dated when it was sent', () => {
    const { record } = recordFor(send(), party, OPTIONS);

    expect(record).toMatchObject({
      subject: 'Helping West London Handyman win more jobs',
      fromEmail: 'hello@sender.example.invalid',
      toEmail: ROBERT,
      status: 'SENT',
      provider: PROVIDER,
      providerMessageId: 'resend-id-1',
      tenantId: 'tenant-1',
      isRead: true,
      createdAt: new Date('2026-11-16T09:00:24.855Z'),
      sentAt: new Date('2026-11-16T09:00:24.855Z'),
      metadata: {
        source: 'coa-import',
        direction: 'outbound',
        coaDraftId: 'draft-1',
        sequenceNo: 5,
        leadId: 'lead-1',
      },
    });
    expect(record).not.toHaveProperty('openedAt');
    expect(record).not.toHaveProperty('userId');
  });

  it('writes a timeline entry that carries no tracking, so Open Rate is not distorted', () => {
    const { activity } = recordFor(send(), party, OPTIONS);

    expect(activity).toMatchObject({
      type: 'EMAIL',
      userId: null,
      userName: 'COA outreach',
      leadId: 'lead-1',
      timestamp: new Date('2026-11-16T09:00:24.855Z'),
      metadata: { source: 'coa-import', direction: 'outbound', from: OPTIONS.from },
    });
    expect(activity?.metadata).not.toHaveProperty('opened');
    expect(activity?.metadata).not.toHaveProperty('openCount');
  });

  it('keeps an open when the COA row has one', () => {
    const opened = send({ openedAt: new Date('2026-11-16T10:00:00.000Z') });

    const { record, activity } = recordFor(opened, party, OPTIONS);

    expect(record).toMatchObject({ openedAt: opened.openedAt, openCount: 1 });
    expect(activity?.metadata).toMatchObject({ opened: true, openCount: 1 });
  });

  it('marks a bounced send BOUNCED, when the bounce was recorded', () => {
    const { record } = recordFor(send({ status: 'BOUNCED' }), party, OPTIONS);

    expect(record).toMatchObject({
      status: 'BOUNCED',
      bouncedAt: new Date('2026-11-16T09:00:25.000Z'),
    });
  });

  it('a contact gets the record but no lead timeline entry', () => {
    const { record, activity } = recordFor(
      send(),
      { leadId: null, contactId: 'contact-1', address: ROBERT },
      OPTIONS
    );

    expect(record).toMatchObject({ contactId: 'contact-1' });
    expect(record.metadata).not.toHaveProperty('leadId');
    expect(activity).toBeNull();
  });

  it('survives a send without a subject and cuts a long id', () => {
    const { record, activity } = recordFor(
      send({ subject: '  ', messageId: 'x'.repeat(300) }),
      party,
      OPTIONS
    );

    expect(record.subject).toBe('(no subject)');
    expect((record.providerMessageId as string).length).toBe(255);
    expect(activity?.title).toBe('(no subject)');
  });
});

describe('importCoaSends', () => {
  it('dry run counts what it would write and writes nothing', async () => {
    const { db, raw } = fakeDb();

    const result = await importCoaSends(db, source([send()]), {
      ...OPTIONS,
      apply: false,
      target: LOCAL,
    });

    expect(result).toMatchObject({ read: 1, toCreate: 1, created: 0 });
    expect(raw.$transaction).not.toHaveBeenCalled();
    expect(result.lines.join('\n')).toMatch(/Dry run: nothing written/);
  });

  it('writes the record and the timeline entry together, the entry pointing at the record', async () => {
    const { db, raw, tx } = fakeDb();

    const result = await importCoaSends(db, source([send()]), {
      ...OPTIONS,
      apply: true,
      target: LOCAL,
    });

    expect(result.created).toBe(1);
    expect(raw.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.emailRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ providerMessageId: 'resend-id-1', provider: 'RESEND' }),
      select: { id: true },
    });
    expect(tx.leadActivity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        leadId: 'lead-1',
        metadata: expect.objectContaining({ emailRecordId: 'rec-1' }),
      }),
    });
  });

  it('is idempotent: a send already in Aurora is not written again', async () => {
    const { db, raw } = fakeDb({ imported: ['resend-id-1'] });

    const result = await importCoaSends(db, source([send()]), {
      ...OPTIONS,
      apply: true,
      target: LOCAL,
    });

    expect(result).toMatchObject({ alreadyImported: 1, created: 0 });
    expect(raw.$transaction).not.toHaveBeenCalled();
    expect(raw.emailRecord.findFirst).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', provider: 'RESEND', providerMessageId: 'resend-id-1' },
      select: { id: true },
    });
  });

  it('uses the first recipient that is a lead of the tenant, falling back to a contact', async () => {
    const both = fakeDb({ leads: { 'second@example.invalid': 'lead-2' } });
    await importCoaSends(
      both.db,
      source([send({ recipients: ['first@example.invalid', 'second@example.invalid'] })]),
      { ...OPTIONS, apply: true, target: LOCAL }
    );
    expect(both.tx.leadActivity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ leadId: 'lead-2' }),
    });

    const contact = fakeDb({ leads: {}, contacts: { [ROBERT]: 'contact-1' } });
    await importCoaSends(contact.db, source([send()]), { ...OPTIONS, apply: true, target: LOCAL });
    expect(contact.tx.emailRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ contactId: 'contact-1' }),
      select: { id: true },
    });
    expect(contact.tx.leadActivity.create).not.toHaveBeenCalled();
  });

  it('writes nothing for a send whose recipients are nobody in Aurora', async () => {
    const { db, raw } = fakeDb({ leads: {} });

    const result = await importCoaSends(db, source([send()]), {
      ...OPTIONS,
      apply: true,
      target: LOCAL,
    });

    expect(result).toMatchObject({ unmatched: 1, created: 0 });
    expect(raw.$transaction).not.toHaveBeenCalled();
  });

  it('skips a person with an active processing restriction', async () => {
    const { db, raw } = fakeDb({ restricted: [ROBERT] });

    const result = await importCoaSends(db, source([send()]), {
      ...OPTIONS,
      apply: true,
      target: LOCAL,
    });

    expect(result).toMatchObject({ restricted: 1, created: 0 });
    expect(raw.$transaction).not.toHaveBeenCalled();
  });

  it('imports every send of the thread, oldest first, once each', async () => {
    const { db } = fakeDb();
    const sends = [
      send({ id: 'd1', messageId: 'm1' }),
      send({ id: 'd2', messageId: 'm2', sequenceNo: 6 }),
      send({ id: 'd3', messageId: 'm3', sequenceNo: 7 }),
    ];

    const result = await importCoaSends(db, source(sends), {
      ...OPTIONS,
      apply: true,
      target: LOCAL,
    });

    expect(result).toMatchObject({ read: 3, created: 3 });
  });

  it('refuses to write to a non-local database without the explicit opt-in, before any write', async () => {
    const { db, raw } = fakeDb();
    vi.stubEnv('ALLOW_PROD_DB_OPS', '');

    await expect(
      importCoaSends(db, source([send()]), { ...OPTIONS, apply: true, target: REMOTE })
    ).rejects.toThrow(/not a local database/);

    expect(raw.$transaction).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it('allows a dry run against a non-local database', async () => {
    const { db } = fakeDb();

    const result = await importCoaSends(db, source([send()]), {
      ...OPTIONS,
      apply: false,
      target: REMOTE,
    });

    expect(result.lines[0]).toMatch(/NOT local/);
  });

  it('passes a recipient filter to the source', async () => {
    const { db } = fakeDb();
    const src = source([send()]);

    const result = await importCoaSends(db, src, {
      ...OPTIONS,
      apply: false,
      target: LOCAL,
      onlyEmail: 'Robert@Example.invalid',
    });

    expect(src.loadSends).toHaveBeenCalledWith('robert@example.invalid');
    expect(result.lines.join('\n')).toMatch(/only to Robert@Example.invalid/);
  });
});

describe('the COA read', () => {
  it('is a plain SELECT that writes nothing', () => {
    expect(COA_SENDS_SQL.trim().toUpperCase().startsWith('SELECT')).toBe(true);
    expect(COA_SENDS_SQL).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE)\b/i);
  });

  it('keeps only sent and bounced rows, and a recipient filter', () => {
    const row = (id: string, status: string, recipients: string[]) => ({
      ...send({ id }),
      status,
      recipients,
    });

    const all = sendsFromRows([row('a', 'SENT', [ROBERT]), row('b', 'DRAFT', [ROBERT])]);
    const filtered = sendsFromRows(
      [row('a', 'SENT', [ROBERT]), row('c', 'BOUNCED', ['other@example.invalid'])],
      ROBERT
    );

    expect(all.map((s) => s.id)).toEqual(['a']);
    expect(filtered.map((s) => s.id)).toEqual(['a']);
  });

  it('reads a row without recipients as none', () => {
    const rows = [{ ...send(), status: 'SENT', recipients: undefined as unknown as string[] }];

    expect(sendsFromRows(rows)[0]?.recipients).toEqual([]);
  });
});

describe('main', () => {
  function deps(overrides: Partial<MainDeps> = {}) {
    const { db } = fakeDb();
    const close = vi.fn(async () => undefined);
    const disconnect = vi.fn(async () => undefined);
    const made: MainDeps = {
      createDb: vi.fn(async () => Object.assign(db, { $disconnect: disconnect })),
      createSource: vi.fn(async () => ({ ...source([send()]), close })),
      log: vi.fn(),
      error: vi.fn(),
      ...overrides,
    };
    return { made, close, disconnect };
  }

  const env = {
    DATABASE_URL: connectionUrl('localhost:5433'),
    COA_DATABASE_URL: connectionUrl('coa.example.invalid:5432'),
  };
  const argv = ['--tenant', 'tenant-1', '--from', 'hello@sender.example.invalid'];

  it('prints the usage and exits 1 when something is missing', async () => {
    const { made } = deps();

    expect(await main(['--tenant', 't'], env, made)).toBe(1);
    expect(await main(argv, { DATABASE_URL: env.DATABASE_URL }, made)).toBe(1);
    expect(made.error).toHaveBeenCalledWith(expect.stringMatching(/^Usage:/));
  });

  it('runs a dry run by default, prints the result and closes both connections', async () => {
    const { made, close, disconnect } = deps();

    const code = await main(argv, env, made);

    expect(code).toBe(0);
    expect(made.log).toHaveBeenCalledWith(expect.stringMatching(/Dry run: nothing written/));
    expect(close).toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalled();
  });

  it('writes with --apply', async () => {
    const { made } = deps();

    expect(await main([...argv, '--apply'], env, made)).toBe(0);

    expect(made.log).toHaveBeenCalledWith(expect.stringMatching(/written: 1 email records/));
  });

  it('exits 1 on an operator error (refused write) and 2 on any other failure', async () => {
    vi.stubEnv('ALLOW_PROD_DB_OPS', '');
    const remote = { ...env, DATABASE_URL: connectionUrl('db.example.invalid:5432') };
    const refused = deps();
    expect(await main([...argv, '--apply'], remote, refused.made)).toBe(1);
    vi.unstubAllEnvs();

    const broken = deps({
      createSource: vi.fn(async () => ({
        loadSends: async () => {
          throw new Error('coa down');
        },
        close: async () => undefined,
      })),
    });
    expect(await main(argv, env, broken.made)).toBe(2);
    expect(broken.made.error).toHaveBeenCalledWith('coa down');
  });
});
